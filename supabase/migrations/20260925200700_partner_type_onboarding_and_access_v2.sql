-- NectarFusions partner type onboarding + portal access
-- Mirrors the production migration applied on 2026-09-25.
-- Partner types are now: retail, wholesale, or both.
-- NULL means the partner must choose once on first portal login.

alter table public.partner_accounts
  alter column partner_type drop default,
  alter column partner_type drop not null;

alter table public.partner_accounts
  drop constraint if exists partner_accounts_partner_type_check;

update public.partner_accounts
set partner_type = case partner_type
  when 'retailer' then 'retail'
  when 'wholesaler' then 'wholesale'
  when 'other' then 'both'
  else null
end;

alter table public.partner_accounts
  add constraint partner_accounts_partner_type_check
  check (
    partner_type is null
    or partner_type = any (array['retail'::text,'wholesale'::text,'both'::text])
  );

comment on column public.partner_accounts.partner_type is
  'Portal access type selected once by the partner or managed by Admin: retail, wholesale, or both. NULL means first-login selection is still required.';

alter table public.partner_resources
  drop constraint if exists partner_resources_visible_to_partner_types_check;

update public.partner_resources
set visible_to_partner_types = array_replace(
  array_replace(visible_to_partner_types, 'retailer', 'retail'),
  'wholesaler',
  'wholesale'
);

alter table public.partner_resources
  add constraint partner_resources_visible_to_partner_types_check
  check (
    visible_to_partner_types <@ array['retail'::text,'wholesale'::text]
  );

drop policy if exists "Partners view active resources"
on public.partner_resources;

create policy "Partners view active resources"
on public.partner_resources
for select
to authenticated
using (
  status = 'active'
  and (expires_at is null or expires_at > now())
  and exists (
    select 1
    from public.partner_accounts pa
    where pa.id = public.nf_partner_id_for_user()
      and (
        cardinality(partner_resources.visible_to_partner_types) = 0
        or pa.partner_type = any(partner_resources.visible_to_partner_types)
        or (
          pa.partner_type = 'both'
          and partner_resources.visible_to_partner_types
              && array['retail'::text,'wholesale'::text]
        )
      )
  )
);

create or replace function public.set_my_partner_type_once(
  p_partner_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_current_type text;
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_type := lower(btrim(coalesce(p_partner_type, '')));

  if v_type not in ('retail','wholesale','both') then
    raise exception 'Choose Retail, Wholesale, or Both.';
  end if;

  v_partner_id := public.nf_partner_id_for_user();

  if v_partner_id is null then
    raise exception 'An approved partner account is required.';
  end if;

  select pa.partner_type
  into v_current_type
  from public.partner_accounts pa
  where pa.id = v_partner_id
  for update;

  if v_current_type is not null then
    raise exception
      'Your partner type has already been selected. Contact NectarFusions if it needs to be changed.';
  end if;

  update public.partner_accounts
  set
    partner_type = v_type,
    updated_at = now()
  where id = v_partner_id;

  return jsonb_build_object(
    'partner_id', v_partner_id,
    'partner_type', v_type
  );
end;
$$;

revoke all
on function public.set_my_partner_type_once(text)
from public, anon, authenticated;

grant execute
on function public.set_my_partner_type_once(text)
to authenticated;

create or replace function public.nf_partner_replenishment_account()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pa.id
  from public.partner_users pu
  join public.partner_accounts pa
    on pa.id = pu.partner_id
  where pu.user_id = auth.uid()
    and pu.active = true
    and pa.auth_access_enabled = true
    and pa.partner_type in ('retail','both')
    and pa.relationship_status in (
      'approved',
      'onboarding',
      'active_opening',
      'active_ongoing',
      'optimize'
    )
  limit 1;
$$;

create or replace function public.nf_partner_bulk_order_account()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pa.id
  from public.partner_users pu
  join public.partner_accounts pa
    on pa.id = pu.partner_id
  where pu.user_id = auth.uid()
    and pu.active = true
    and pa.auth_access_enabled = true
    and pa.partner_type in ('retail','wholesale','both')
    and pa.relationship_status in (
      'approved',
      'onboarding',
      'active_opening',
      'active_ongoing',
      'optimize'
    )
  limit 1;
$$;

create or replace function public.my_partner_store_account()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pa.id
  from public.partner_users pu
  join public.partner_accounts pa
    on pa.id = pu.partner_id
  where pu.user_id = auth.uid()
    and pu.active = true
    and pa.auth_access_enabled = true
    and pa.partner_type in ('retail','wholesale','both')
    and pa.relationship_status in (
      'approved','onboarding','active_opening',
      'active_ongoing','optimize'
    )
  limit 1
$$;
