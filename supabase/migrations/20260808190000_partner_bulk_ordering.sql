-- NectarFusions Partner Foodservice & Bulk Honey Ordering
-- Additive migration. This feature is isolated from retail sizes, stock,
-- subscriptions, Square catalog pricing, and existing partner replenishment.
--
-- Bulk pricing snapshot (bulk-2026-08):
--   1/2 gallon: Natural $55 / Infused $65
--   1 gallon:   Natural $100 / Infused $120
--   5 gallon:   Natural $450 / Infused $550
--
-- The feature flag defaults OFF. Enable only after preview verification by
-- updating settings.partner_bulk_ordering to {"enabled": true}.

begin;

-- Safety preflight: this migration depends only on existing partner/auth helpers.
do $$
begin
  if to_regclass('public.partner_accounts') is null
     or to_regclass('public.partner_users') is null
     or to_regclass('public.flavors') is null
     or to_regclass('public.settings') is null then
    raise exception 'Required NectarFusions partner foundation tables are missing.';
  end if;

  if to_regprocedure('public.nf_is_admin()') is null
     or to_regprocedure('public.nf_set_updated_at()') is null then
    raise exception 'Required NectarFusions partner helper functions are missing.';
  end if;
end;
$$;

insert into public.settings (key, value)
values (
  'partner_bulk_ordering',
  jsonb_build_object(
    'enabled', false,
    'price_version', 'bulk-2026-08'
  )
)
on conflict (key) do nothing;

-- ============================================================
-- BULK REQUEST TABLES
-- ============================================================

create table if not exists public.partner_bulk_order_requests (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete restrict,

  submitted_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  status text not null default 'submitted'
    check (
      status in (
        'submitted',
        'under_review',
        'needs_information',
        'quoted',
        'accepted',
        'paid',
        'fulfilled',
        'cancelled',
        'declined'
      )
    ),

  needed_by date,

  fulfillment_method text not null default 'flexible'
    check (
      fulfillment_method in (
        'pickup',
        'delivery',
        'shipping',
        'flexible'
      )
    ),

  preferred_delivery_days text[] not null default '{}'
    check (
      preferred_delivery_days <@
      array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    ),

  request_notes text,
  partner_response text,
  partner_reply text,
  partner_replied_at timestamptz,
  admin_notes text,

  price_version text not null default 'bulk-2026-08',
  requested_subtotal_cents integer not null default 0,
  quote_subtotal_cents integer,
  fulfillment_charge_cents integer,
  confirmed_total_cents integer,

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  quoted_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  declined_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (length(btrim(price_version)) between 1 and 80),
  check (requested_subtotal_cents >= 0),
  check (quote_subtotal_cents is null or quote_subtotal_cents >= 0),
  check (fulfillment_charge_cents is null or fulfillment_charge_cents >= 0),
  check (
    confirmed_total_cents is null
    or (
      quote_subtotal_cents is not null
      and fulfillment_charge_cents is not null
      and confirmed_total_cents = quote_subtotal_cents + fulfillment_charge_cents
    )
  ),
  check (request_notes is null or length(request_notes) <= 5000),
  check (partner_response is null or length(partner_response) <= 5000),
  check (partner_reply is null or length(partner_reply) <= 5000),
  check (admin_notes is null or length(admin_notes) <= 10000),
  check (
    (partner_reply is null and partner_replied_at is null)
    or (
      nullif(btrim(coalesce(partner_reply, '')), '') is not null
      and partner_replied_at is not null
    )
  ),
  check (
    status not in ('quoted', 'accepted', 'paid', 'fulfilled')
    or (
      quote_subtotal_cents is not null
      and fulfillment_charge_cents is not null
      and confirmed_total_cents is not null
      and quoted_at is not null
      and nullif(btrim(coalesce(partner_response, '')), '') is not null
    )
  ),
  check (
    status not in ('needs_information', 'declined', 'cancelled')
    or nullif(btrim(coalesce(partner_response, '')), '') is not null
  ),
  check (status not in ('accepted', 'paid', 'fulfilled') or accepted_at is not null),
  check (status not in ('paid', 'fulfilled') or paid_at is not null),
  check (status <> 'fulfilled' or fulfilled_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'declined' or declined_at is not null)
);

create index if not exists partner_bulk_order_partner_index
on public.partner_bulk_order_requests (partner_id, submitted_at desc);

create index if not exists partner_bulk_order_status_index
on public.partner_bulk_order_requests (status, submitted_at desc);

drop trigger if exists partner_bulk_order_updated_at
on public.partner_bulk_order_requests;

create trigger partner_bulk_order_updated_at
before update on public.partner_bulk_order_requests
for each row execute function public.nf_set_updated_at();

create table if not exists public.partner_bulk_order_items (
  id uuid primary key default gen_random_uuid(),

  request_id uuid not null
    references public.partner_bulk_order_requests(id)
    on delete cascade,

  honey_type text not null
    check (honey_type in ('natural', 'infused')),

  flavor_id uuid
    references public.flavors(id)
    on delete restrict,
  flavor_name text,

  size_id text not null
    check (size_id in ('half_gallon', 'one_gallon', 'five_gallon')),
  size_label text not null,

  quantity integer not null
    check (quantity between 1 and 999),

  notes text,
  unit_price_cents integer not null check (unit_price_cents > 0),
  price_version text not null default 'bulk-2026-08',
  line_total_cents integer
    generated always as (unit_price_cents * quantity) stored,

  created_at timestamptz not null default now(),

  check (length(btrim(size_label)) between 1 and 80),
  check (length(btrim(price_version)) between 1 and 80),
  check (notes is null or length(notes) <= 1000),
  check (
    (honey_type = 'natural' and flavor_id is null and flavor_name is null)
    or (
      honey_type = 'infused'
      and flavor_id is not null
      and length(btrim(coalesce(flavor_name, ''))) between 1 and 160
    )
  )
);

create index if not exists partner_bulk_order_items_request_index
on public.partner_bulk_order_items (request_id);

-- ============================================================
-- ELIGIBLE PARTNER RESOLUTION
-- ============================================================

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
    and pa.partner_type in ('retailer', 'wholesaler', 'other')
    and pa.relationship_status in (
      'approved',
      'onboarding',
      'active_opening',
      'active_ongoing',
      'optimize'
    )
  limit 1;
$$;

revoke all
on function public.nf_partner_bulk_order_account()
from public, anon, authenticated;

-- Internal helper. Caller-facing SECURITY DEFINER functions execute it.

-- ============================================================
-- FEATURE CONFIG + BULK CATALOG
-- ============================================================

create or replace function public.get_partner_bulk_order_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_enabled boolean := false;
  v_flavors jsonb;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_bulk_order_account();

  if v_partner_id is null then
    return jsonb_build_object(
      'enabled', false,
      'eligible', false,
      'price_version', 'bulk-2026-08',
      'sizes', '[]'::jsonb,
      'flavors', '[]'::jsonb
    );
  end if;

  select coalesce((s.value ->> 'enabled')::boolean, false)
  into v_enabled
  from public.settings s
  where s.key = 'partner_bulk_ordering';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'image_url', f.image_url
      )
      order by f.name
    ),
    '[]'::jsonb
  )
  into v_flavors
  from public.flavors f
  where f.active = true
    and lower(btrim(f.name)) not like 'natural%'
    and lower(btrim(f.name)) not like 'raw%';

  return jsonb_build_object(
    'enabled', v_enabled,
    'eligible', true,
    'price_version', 'bulk-2026-08',
    'sizes', jsonb_build_array(
      jsonb_build_object(
        'id', 'half_gallon',
        'label', '1/2 Gallon',
        'natural_price_cents', 5500,
        'infused_price_cents', 6500
      ),
      jsonb_build_object(
        'id', 'one_gallon',
        'label', '1 Gallon',
        'natural_price_cents', 10000,
        'infused_price_cents', 12000
      ),
      jsonb_build_object(
        'id', 'five_gallon',
        'label', '5 Gallon',
        'natural_price_cents', 45000,
        'infused_price_cents', 55000
      )
    ),
    'flavors', v_flavors
  );
end;
$$;

revoke all
on function public.get_partner_bulk_order_catalog()
from public, anon, authenticated;

grant execute
on function public.get_partner_bulk_order_catalog()
to authenticated;

-- ============================================================
-- ATOMIC PARTNER SUBMISSION
-- ============================================================

create or replace function public.submit_partner_bulk_order(
  p_needed_by date default null,
  p_fulfillment_method text default 'flexible',
  p_preferred_delivery_days text[] default '{}',
  p_request_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_enabled boolean := false;
  v_request_id uuid;
  v_item jsonb;
  v_honey_type text;
  v_size_id text;
  v_size_label text;
  v_flavor_id uuid;
  v_flavor_name text;
  v_quantity integer;
  v_notes text;
  v_unit_price_cents integer;
  v_requested_subtotal_cents integer := 0;
  v_price_version constant text := 'bulk-2026-08';
  v_selection_key text;
  v_seen_selections text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_bulk_order_account();

  if v_partner_id is null then
    raise exception 'This partner account is not eligible for bulk ordering.';
  end if;

  select coalesce((s.value ->> 'enabled')::boolean, false)
  into v_enabled
  from public.settings s
  where s.key = 'partner_bulk_ordering';

  if not v_enabled then
    raise exception 'Foodservice and bulk ordering is not enabled yet.';
  end if;

  if p_needed_by is not null and p_needed_by < current_date then
    raise exception 'Needed-by date cannot be in the past.';
  end if;

  if p_fulfillment_method is null
     or p_fulfillment_method not in ('pickup', 'delivery', 'shipping', 'flexible') then
    raise exception 'Choose a valid fulfillment method.';
  end if;

  if not (
    coalesce(p_preferred_delivery_days, '{}') <@
    array[
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday'
    ]::text[]
  ) then
    raise exception 'Choose valid preferred delivery days.';
  end if;

  if length(coalesce(p_request_notes, '')) > 5000 then
    raise exception 'Request notes are too long.';
  end if;

  if jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Choose between one and fifty bulk order items.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_honey_type := lower(btrim(coalesce(v_item ->> 'honey_type', '')));
    v_size_id := lower(btrim(coalesce(v_item ->> 'size_id', '')));
    v_notes := nullif(btrim(v_item ->> 'notes'), '');
    v_flavor_id := null;
    v_flavor_name := null;

    begin
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Every bulk item requires a valid container quantity.';
    end;

    if v_honey_type not in ('natural', 'infused') then
      raise exception 'Choose Natural or Infused for every bulk item.';
    end if;

    if v_size_id not in ('half_gallon', 'one_gallon', 'five_gallon') then
      raise exception 'Choose a valid bulk container size.';
    end if;

    if v_quantity is null or v_quantity < 1 or v_quantity > 999 then
      raise exception 'Bulk container quantities must be between 1 and 999.';
    end if;

    if length(coalesce(v_notes, '')) > 1000 then
      raise exception 'Bulk item notes are too long.';
    end if;

    v_size_label := case v_size_id
      when 'half_gallon' then '1/2 Gallon'
      when 'one_gallon' then '1 Gallon'
      when 'five_gallon' then '5 Gallon'
    end;

    if v_honey_type = 'infused' then
      begin
        v_flavor_id := nullif(v_item ->> 'flavor_id', '')::uuid;
      exception
        when invalid_text_representation then
          raise exception 'Choose a valid infused flavor.';
      end;

      if v_flavor_id is null then
        raise exception 'Choose an infused flavor.';
      end if;

      select f.name
      into v_flavor_name
      from public.flavors f
      where f.id = v_flavor_id
        and f.active = true
        and lower(btrim(f.name)) not like 'natural%'
        and lower(btrim(f.name)) not like 'raw%'
      limit 1;

      if v_flavor_name is null then
        raise exception 'The selected infused flavor is no longer available.';
      end if;
    end if;

    v_unit_price_cents := case
      when v_size_id = 'half_gallon' and v_honey_type = 'natural' then 5500
      when v_size_id = 'half_gallon' and v_honey_type = 'infused' then 6500
      when v_size_id = 'one_gallon' and v_honey_type = 'natural' then 10000
      when v_size_id = 'one_gallon' and v_honey_type = 'infused' then 12000
      when v_size_id = 'five_gallon' and v_honey_type = 'natural' then 45000
      when v_size_id = 'five_gallon' and v_honey_type = 'infused' then 55000
    end;

    v_selection_key :=
      v_honey_type || '|' || v_size_id || '|' || coalesce(v_flavor_id::text, 'natural');

    if v_selection_key = any(v_seen_selections) then
      raise exception 'Combine duplicate bulk selections into one line.';
    end if;

    v_seen_selections := array_append(v_seen_selections, v_selection_key);
    v_requested_subtotal_cents :=
      v_requested_subtotal_cents + (v_unit_price_cents * v_quantity);
  end loop;

  insert into public.partner_bulk_order_requests (
    partner_id,
    submitted_by,
    status,
    needed_by,
    fulfillment_method,
    preferred_delivery_days,
    request_notes,
    price_version,
    requested_subtotal_cents,
    submitted_at
  ) values (
    v_partner_id,
    auth.uid(),
    'submitted',
    p_needed_by,
    p_fulfillment_method,
    coalesce(p_preferred_delivery_days, '{}'),
    nullif(btrim(p_request_notes), ''),
    v_price_version,
    v_requested_subtotal_cents,
    now()
  ) returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_honey_type := lower(btrim(v_item ->> 'honey_type'));
    v_size_id := lower(btrim(v_item ->> 'size_id'));
    v_quantity := (v_item ->> 'quantity')::integer;
    v_notes := nullif(btrim(v_item ->> 'notes'), '');
    v_flavor_id := null;
    v_flavor_name := null;

    v_size_label := case v_size_id
      when 'half_gallon' then '1/2 Gallon'
      when 'one_gallon' then '1 Gallon'
      when 'five_gallon' then '5 Gallon'
    end;

    if v_honey_type = 'infused' then
      v_flavor_id := (v_item ->> 'flavor_id')::uuid;
      select f.name into strict v_flavor_name
      from public.flavors f
      where f.id = v_flavor_id;
    end if;

    v_unit_price_cents := case
      when v_size_id = 'half_gallon' and v_honey_type = 'natural' then 5500
      when v_size_id = 'half_gallon' and v_honey_type = 'infused' then 6500
      when v_size_id = 'one_gallon' and v_honey_type = 'natural' then 10000
      when v_size_id = 'one_gallon' and v_honey_type = 'infused' then 12000
      when v_size_id = 'five_gallon' and v_honey_type = 'natural' then 45000
      when v_size_id = 'five_gallon' and v_honey_type = 'infused' then 55000
    end;

    insert into public.partner_bulk_order_items (
      request_id,
      honey_type,
      flavor_id,
      flavor_name,
      size_id,
      size_label,
      quantity,
      notes,
      unit_price_cents,
      price_version
    ) values (
      v_request_id,
      v_honey_type,
      v_flavor_id,
      v_flavor_name,
      v_size_id,
      v_size_label,
      v_quantity,
      v_notes,
      v_unit_price_cents,
      v_price_version
    );
  end loop;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_bulk_order(date, text, text[], text, jsonb)
from public, anon, authenticated;

grant execute
on function public.submit_partner_bulk_order(date, text, text[], text, jsonb)
to authenticated;

-- ============================================================
-- GUARDED PARTNER ACTIONS
-- ============================================================

create or replace function public.partner_bulk_order_action(
  p_request_id uuid,
  p_action text,
  p_partner_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_request public.partner_bulk_order_requests%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_partner_reply text := nullif(btrim(p_partner_reply), '');
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_bulk_order_account();

  if v_partner_id is null then
    raise exception 'A connected bulk-order partner account is required.';
  end if;

  if length(coalesce(v_partner_reply, '')) > 5000 then
    raise exception 'Partner reply is too long.';
  end if;

  if v_action = 'accept' then
    update public.partner_bulk_order_requests
    set status = 'accepted', accepted_at = now()
    where id = p_request_id
      and partner_id = v_partner_id
      and status = 'quoted'
    returning * into v_request;

  elsif v_action = 'provide_information' then
    if v_partner_reply is null then
      raise exception 'Enter the requested information.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'under_review',
      partner_reply = v_partner_reply,
      partner_replied_at = now()
    where id = p_request_id
      and partner_id = v_partner_id
      and status = 'needs_information'
    returning * into v_request;

  elsif v_action = 'cancel' then
    update public.partner_bulk_order_requests
    set
      status = 'cancelled',
      cancelled_at = now(),
      partner_response = concat_ws(
        E'\n\n',
        nullif(btrim(partner_response), ''),
        'Cancelled by partner.'
      ),
      partner_reply = coalesce(v_partner_reply, partner_reply),
      partner_replied_at = case
        when v_partner_reply is not null then now()
        else partner_replied_at
      end
    where id = p_request_id
      and partner_id = v_partner_id
      and status in ('submitted', 'under_review', 'needs_information', 'quoted')
    returning * into v_request;

  else
    raise exception 'Choose accept, provide_information, or cancel.';
  end if;

  if v_request.id is null then
    raise exception 'This bulk request cannot take that action in its current status.';
  end if;

  return to_jsonb(v_request);
end;
$$;

revoke all
on function public.partner_bulk_order_action(uuid, text, text)
from public, anon, authenticated;

grant execute
on function public.partner_bulk_order_action(uuid, text, text)
to authenticated;

-- ============================================================
-- GUARDED ADMIN ACTIONS
-- ============================================================

create or replace function public.admin_partner_bulk_order_action(
  p_request_id uuid,
  p_action text,
  p_partner_response text default null,
  p_admin_notes text default null,
  p_fulfillment_charge_cents integer default null
)
returns public.partner_bulk_order_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.partner_bulk_order_requests%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_partner_response text := nullif(btrim(p_partner_response), '');
  v_admin_notes text := nullif(btrim(p_admin_notes), '');
  v_quote_subtotal_cents integer;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if length(coalesce(v_partner_response, '')) > 5000 then
    raise exception 'Partner response is too long.';
  end if;

  if length(coalesce(v_admin_notes, '')) > 10000 then
    raise exception 'Admin notes are too long.';
  end if;

  select * into v_request
  from public.partner_bulk_order_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Bulk order request not found.';
  end if;

  if v_action = 'save_notes' then
    update public.partner_bulk_order_requests
    set
      admin_notes = v_admin_notes,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'under_review' then
    if v_request.status not in ('submitted', 'needs_information') then
      raise exception 'Only submitted or needs-information requests can move under review.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'under_review',
      admin_notes = coalesce(v_admin_notes, admin_notes),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'needs_information' then
    if v_request.status not in ('submitted', 'under_review') then
      raise exception 'This bulk request cannot ask for information from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the information the partner needs to provide.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'needs_information',
      partner_response = v_partner_response,
      partner_reply = null,
      partner_replied_at = null,
      admin_notes = coalesce(v_admin_notes, admin_notes),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'quote' then
    if v_request.status not in ('submitted', 'under_review', 'needs_information', 'quoted') then
      raise exception 'This bulk request cannot be quoted from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the quote response and next step.';
    end if;

    if p_fulfillment_charge_cents is null or p_fulfillment_charge_cents < 0 then
      raise exception 'Enter a fulfillment charge of zero or more.';
    end if;

    select coalesce(sum(line_total_cents), 0)
    into v_quote_subtotal_cents
    from public.partner_bulk_order_items
    where request_id = p_request_id;

    if v_quote_subtotal_cents <= 0 then
      raise exception 'This bulk request does not contain quoteable items.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'quoted',
      partner_response = v_partner_response,
      admin_notes = coalesce(v_admin_notes, admin_notes),
      quote_subtotal_cents = v_quote_subtotal_cents,
      fulfillment_charge_cents = p_fulfillment_charge_cents,
      confirmed_total_cents = v_quote_subtotal_cents + p_fulfillment_charge_cents,
      quoted_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'mark_paid' then
    if v_request.status <> 'accepted' then
      raise exception 'Only an accepted bulk quote can be marked paid.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'paid',
      admin_notes = coalesce(v_admin_notes, admin_notes),
      paid_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'fulfill' then
    if v_request.status <> 'paid' then
      raise exception 'Only a paid bulk request can be marked fulfilled.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'fulfilled',
      admin_notes = coalesce(v_admin_notes, admin_notes),
      fulfilled_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'decline' then
    if v_request.status not in ('submitted', 'under_review', 'needs_information', 'quoted') then
      raise exception 'This bulk request cannot be declined from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the reason the bulk request was declined.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'declined',
      partner_response = v_partner_response,
      admin_notes = coalesce(v_admin_notes, admin_notes),
      declined_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'cancel' then
    if v_request.status in ('fulfilled', 'cancelled', 'declined') then
      raise exception 'This bulk request cannot be cancelled from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the cancellation explanation.';
    end if;

    update public.partner_bulk_order_requests
    set
      status = 'cancelled',
      partner_response = v_partner_response,
      admin_notes = coalesce(v_admin_notes, admin_notes),
      cancelled_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  else
    raise exception 'Choose save_notes, under_review, needs_information, quote, mark_paid, fulfill, decline, or cancel.';
  end if;

  return v_request;
end;
$$;

revoke all
on function public.admin_partner_bulk_order_action(uuid, text, text, text, integer)
from public, anon, authenticated;

grant execute
on function public.admin_partner_bulk_order_action(uuid, text, text, text, integer)
to authenticated;

-- ============================================================
-- GUARDED ADMIN HISTORY
-- ============================================================

create or replace function public.get_admin_partner_bulk_order_history(
  p_partner_id uuid default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_requests jsonb;
begin
  if auth.uid() is null or not coalesce(public.nf_is_admin(), false) then
    raise exception 'Admin access is required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'partner_id', r.partner_id,
        'submitted_by', r.submitted_by,
        'status', r.status,
        'needed_by', r.needed_by,
        'fulfillment_method', r.fulfillment_method,
        'preferred_delivery_days', r.preferred_delivery_days,
        'request_notes', r.request_notes,
        'partner_response', r.partner_response,
        'partner_reply', r.partner_reply,
        'partner_replied_at', r.partner_replied_at,
        'admin_notes', r.admin_notes,
        'reviewed_by', r.reviewed_by,
        'price_version', r.price_version,
        'requested_subtotal_cents', r.requested_subtotal_cents,
        'quote_subtotal_cents', r.quote_subtotal_cents,
        'fulfillment_charge_cents', r.fulfillment_charge_cents,
        'confirmed_total_cents', r.confirmed_total_cents,
        'submitted_at', r.submitted_at,
        'reviewed_at', r.reviewed_at,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'quoted_at', r.quoted_at,
        'accepted_at', r.accepted_at,
        'paid_at', r.paid_at,
        'fulfilled_at', r.fulfilled_at,
        'cancelled_at', r.cancelled_at,
        'declined_at', r.declined_at,
        'items', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'request_id', i.request_id,
                'honey_type', i.honey_type,
                'flavor_id', i.flavor_id,
                'flavor_name', i.flavor_name,
                'size_id', i.size_id,
                'size_label', i.size_label,
                'quantity', i.quantity,
                'notes', i.notes,
                'unit_price_cents', i.unit_price_cents,
                'price_version', i.price_version,
                'line_total_cents', i.line_total_cents
              )
              order by i.size_id, i.honey_type, i.flavor_name nulls first
            )
            from public.partner_bulk_order_items i
            where i.request_id = r.id
          ),
          '[]'::jsonb
        )
      )
      order by r.submitted_at desc, r.created_at desc, r.id
    ),
    '[]'::jsonb
  )
  into v_requests
  from public.partner_bulk_order_requests r
  where (p_partner_id is null or r.partner_id = p_partner_id)
    and (p_request_id is null or r.id = p_request_id);

  return jsonb_build_object('requests', v_requests);
end;
$$;

revoke all
on function public.get_admin_partner_bulk_order_history(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.get_admin_partner_bulk_order_history(uuid, uuid)
to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.partner_bulk_order_requests enable row level security;
alter table public.partner_bulk_order_items enable row level security;

revoke all on public.partner_bulk_order_requests from anon, authenticated;
revoke all on public.partner_bulk_order_items from anon, authenticated;

grant select on public.partner_bulk_order_requests to authenticated;
grant select on public.partner_bulk_order_items to authenticated;

create policy "Partners view their bulk order requests"
on public.partner_bulk_order_requests
for select
to authenticated
using (partner_id = public.nf_partner_id_for_user());

create policy "Admins view bulk order requests"
on public.partner_bulk_order_requests
for select
to authenticated
using (public.nf_is_admin());

create policy "Partners view their bulk order items"
on public.partner_bulk_order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.partner_bulk_order_requests r
    where r.id = request_id
      and r.partner_id = public.nf_partner_id_for_user()
  )
);

create policy "Admins view bulk order items"
on public.partner_bulk_order_items
for select
to authenticated
using (public.nf_is_admin());

comment on table public.partner_bulk_order_requests is
  'Isolated foodservice/bulk partner quote workflow. Does not use retail sizes, stock, subscriptions, or Square catalog pricing.';

comment on table public.partner_bulk_order_items is
  'Bulk honey container selections with immutable submitted price snapshots.';

commit;
