-- NectarFusions Partner Foodservice pricing source of truth.
-- Safe to rerun: setting uses upsert and function uses CREATE OR REPLACE.

insert into public.settings (key, value)
values (
  'partner_foodservice_pricing',
  jsonb_build_object(
    'version', 'partner-foodservice-2026-09',
    'half_gallon', jsonb_build_object('natural', 5500, 'infused', 6500),
    'one_gallon', jsonb_build_object('natural', 10000, 'infused', 12000),
    'five_gallon', jsonb_build_object('natural', 45000, 'infused', 55000)
  )
)
on conflict (key) do update
set value = excluded.value;

create or replace function public.get_partner_foodservice_pricing()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_partner_id uuid;
  v_pricing jsonb;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_id_for_user();

  if v_partner_id is null then
    raise exception 'An approved partner account is required.';
  end if;

  if not exists (
    select 1
    from public.partner_account_programs pap
    where pap.partner_id = v_partner_id
      and pap.program_key = 'foodservice'
      and pap.status = 'approved'
  ) then
    raise exception 'Foodservice access is not approved for this partner account.';
  end if;

  select s.value
  into v_pricing
  from public.settings s
  where s.key = 'partner_foodservice_pricing';

  if v_pricing is null then
    raise exception 'Partner Foodservice pricing is not configured.';
  end if;

  return v_pricing;
end
$$;

revoke all on function public.get_partner_foodservice_pricing()
from public, anon, authenticated;

grant execute on function public.get_partner_foodservice_pricing()
to authenticated;
