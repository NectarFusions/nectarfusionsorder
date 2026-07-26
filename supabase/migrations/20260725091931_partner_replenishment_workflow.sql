-- NectarFusions Phase 3 Partner Replenishment Workflow
-- Additive Production migration.
--
-- Security goals:
--   * One atomic partner submission RPC.
--   * No direct partner inserts into request or item tables.
--   * Retail wholesale sizes are limited to 7oz and 1lb.
--   * Quantities are six-unit case increments with a twelve-unit request minimum.
--   * Flavor names and wholesale prices are snapshotted by the database.
--   * Spun appears only while the global setting and exact stock row are available.
--   * Partner and Admin actions use guarded status-transition RPCs.
--   * retail_locations is not changed and remains separate.
--
-- This migration intentionally does not send email. The secure Netlify
-- submission endpoint will call submit_partner_replenishment() and then send
-- the owner notification server-side in the frontend/API build.
--
-- Do not rerun this migration after it has been installed.

begin;

-- The read-only Production preflight found zero replenishment requests and
-- zero items. Abort rather than guessing if that changes before installation.
do $$
begin
  if to_regclass('public.partner_replenishment_requests') is null
     or to_regclass('public.partner_replenishment_items') is null then
    raise exception
      'Partner replenishment foundation tables are missing.';
  end if;

  if exists (
    select 1
    from public.partner_replenishment_requests
  ) or exists (
    select 1
    from public.partner_replenishment_items
  ) then
    raise exception
      'Replenishment records now exist. Stop and design a data-preserving migration.';
  end if;

  if not exists (
    select 1 from public.sizes where id = '7oz'
  ) or not exists (
    select 1 from public.sizes where id = '1lb'
  ) then
    raise exception
      'Required Production size IDs 7oz and 1lb were not found.';
  end if;
end;
$$;

-- ============================================================
-- REQUEST HEADER HARDENING
-- ============================================================

alter table public.partner_replenishment_requests
  drop constraint if exists partner_replenishment_requests_status_check;

alter table public.partner_replenishment_requests
  add constraint partner_replenishment_requests_status_check
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
  );

alter table public.partner_replenishment_requests
  add column partner_response text,
  add column partner_reply text,
  add column partner_replied_at timestamptz,
  add column price_version text not null default '2026-07',
  add column requested_subtotal_cents integer not null default 0,
  add column quote_subtotal_cents integer,
  add column fulfillment_charge_cents integer,
  add column confirmed_total_cents integer,
  add column quoted_at timestamptz,
  add column accepted_at timestamptz,
  add column paid_at timestamptz,
  add column fulfilled_at timestamptz,
  add column cancelled_at timestamptz,
  add column declined_at timestamptz;

alter table public.partner_replenishment_requests
  add constraint partner_replenishment_requested_subtotal_check
  check (requested_subtotal_cents >= 0),
  add constraint partner_replenishment_quote_subtotal_check
  check (
    quote_subtotal_cents is null
    or quote_subtotal_cents >= 0
  ),
  add constraint partner_replenishment_fulfillment_charge_check
  check (
    fulfillment_charge_cents is null
    or fulfillment_charge_cents >= 0
  ),
  add constraint partner_replenishment_confirmed_total_check
  check (
    confirmed_total_cents is null
    or (
      quote_subtotal_cents is not null
      and fulfillment_charge_cents is not null
      and confirmed_total_cents =
        quote_subtotal_cents + fulfillment_charge_cents
    )
  ),
  add constraint partner_replenishment_price_version_check
  check (length(btrim(price_version)) between 1 and 80),
  add constraint partner_replenishment_partner_response_length_check
  check (
    partner_response is null
    or length(partner_response) <= 5000
  ),
  add constraint partner_replenishment_partner_reply_length_check
  check (
    partner_reply is null
    or length(partner_reply) <= 5000
  ),
  add constraint partner_replenishment_partner_reply_timestamp_check
  check (
    (
      partner_reply is null
      and partner_replied_at is null
    )
    or (
      nullif(btrim(coalesce(partner_reply, '')), '') is not null
      and partner_replied_at is not null
    )
  ),
  add constraint partner_replenishment_admin_notes_length_check
  check (
    admin_notes is null
    or length(admin_notes) <= 10000
  ),
  add constraint partner_replenishment_request_notes_length_check
  check (
    request_notes is null
    or length(request_notes) <= 5000
  ),
  add constraint partner_replenishment_inventory_notes_length_check
  check (
    current_inventory_notes is null
    or length(current_inventory_notes) <= 5000
  ),
  add constraint partner_replenishment_quoted_state_check
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
  add constraint partner_replenishment_response_state_check
  check (
    status not in ('needs_information', 'declined', 'cancelled')
    or nullif(btrim(coalesce(partner_response, '')), '') is not null
  ),
  add constraint partner_replenishment_accepted_state_check
  check (
    status not in ('accepted', 'paid', 'fulfilled')
    or accepted_at is not null
  ),
  add constraint partner_replenishment_paid_state_check
  check (
    status not in ('paid', 'fulfilled')
    or paid_at is not null
  ),
  add constraint partner_replenishment_fulfilled_state_check
  check (
    status <> 'fulfilled'
    or fulfilled_at is not null
  ),
  add constraint partner_replenishment_cancelled_state_check
  check (
    status <> 'cancelled'
    or cancelled_at is not null
  ),
  add constraint partner_replenishment_declined_state_check
  check (
    status <> 'declined'
    or declined_at is not null
  );

-- ============================================================
-- REQUEST ITEM HARDENING
-- ============================================================

alter table public.partner_replenishment_items
  drop constraint if exists
    partner_replenishment_items_flavor_id_fkey;

alter table public.partner_replenishment_items
  alter column flavor_id set not null,
  add column unit_price_cents integer not null default 0,
  add column price_version text not null default '2026-07',
  add column line_total_cents integer
    generated always as (unit_price_cents * quantity) stored;

alter table public.partner_replenishment_items
  drop constraint if exists partner_replenishment_items_quantity_check;

alter table public.partner_replenishment_items
  add constraint partner_replenishment_items_quantity_check
  check (
    quantity between 6 and 996
    and mod(quantity, 6) = 0
  ),
  add constraint partner_replenishment_items_wholesale_size_check
  check (size_id in ('7oz', '1lb')),
  add constraint partner_replenishment_items_unit_price_check
  check (unit_price_cents > 0),
  add constraint partner_replenishment_items_price_version_check
  check (length(btrim(price_version)) between 1 and 80),
  add constraint partner_replenishment_items_flavor_name_check
  check (length(btrim(flavor_name)) between 1 and 160),
  add constraint partner_replenishment_items_notes_length_check
  check (
    notes is null
    or length(notes) <= 1000
  ),
  add constraint partner_replenishment_items_flavor_id_fkey
  foreign key (flavor_id)
  references public.flavors(id)
  on delete restrict,
  add constraint partner_replenishment_items_unique_selection
  unique (request_id, flavor_id, size_id, texture);

-- ============================================================
-- ELIGIBLE PARTNER RESOLUTION
-- ============================================================

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
    and pa.partner_type in ('retailer', 'wholesaler')
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
on function public.nf_partner_replenishment_account()
from public, anon, authenticated;

-- Internal helper only. Caller-facing SECURITY DEFINER functions execute it
-- as the owning database role; authenticated users do not call it directly.

-- ============================================================
-- SECURE PARTNER CATALOG
-- ============================================================

create or replace function public.get_partner_replenishment_catalog()
returns table (
  flavor_id uuid,
  flavor_name text,
  image_url text,
  size_id text,
  size_label text,
  texture text,
  unit_price_cents integer,
  price_version text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
  v_spun_enabled boolean := false;
begin
  v_partner_id := public.nf_partner_replenishment_account();

  if v_partner_id is null then
    raise exception
      'This partner account is not eligible to submit replenishment requests.';
  end if;

  select coalesce(
    (
      select (s.value ->> 'enabled')::boolean
      from public.settings s
      where s.key = 'spun_availability'
    ),
    false
  )
  into v_spun_enabled;

  return query
  select
    f.id,
    f.name,
    f.image_url,
    z.id,
    z.label,
    st.type,
    case z.id
      when '7oz' then 725
      when '1lb' then 1200
    end,
    '2026-07'::text
  from public.stock st
  join public.flavors f
    on f.id = st.flavor_id
  join public.sizes z
    on z.id = st.size_id
  where f.active = true
    and st.in_stock = true
    and st.type in ('regular', 'spun')
    and st.size_id in ('7oz', '1lb')
    and (
      st.type = 'regular'
      or (
        st.type = 'spun'
        and v_spun_enabled = true
      )
    )
  order by f.name, z.sort, st.type;
end;
$$;

revoke all
on function public.get_partner_replenishment_catalog()
from public, anon, authenticated;

grant execute
on function public.get_partner_replenishment_catalog()
to authenticated;

-- ============================================================
-- ATOMIC PARTNER SUBMISSION
-- ============================================================

create or replace function public.submit_partner_replenishment(
  p_needed_by date default null,
  p_fulfillment_method text default 'flexible',
  p_preferred_delivery_days text[] default '{}',
  p_current_inventory_notes text default null,
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
  v_request_id uuid;
  v_item jsonb;
  v_flavor_id uuid;
  v_flavor_name text;
  v_size_id text;
  v_texture text;
  v_quantity integer;
  v_on_hand_count integer;
  v_notes text;
  v_unit_price_cents integer;
  v_total_quantity integer := 0;
  v_requested_subtotal_cents integer := 0;
  v_price_version constant text := '2026-07';
  v_spun_enabled boolean := false;
  v_selection_key text;
  v_seen_selections text[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_replenishment_account();

  if v_partner_id is null then
    raise exception
      'This partner account is not eligible to submit replenishment requests.';
  end if;

  if p_needed_by is not null and p_needed_by < current_date then
    raise exception 'Needed-by date cannot be in the past.';
  end if;

  if p_fulfillment_method is null
     or p_fulfillment_method not in (
       'pickup',
       'delivery',
       'shipping',
       'flexible'
     ) then
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

  if length(coalesce(p_current_inventory_notes, '')) > 5000 then
    raise exception 'Current inventory notes are too long.';
  end if;

  if length(coalesce(p_request_notes, '')) > 5000 then
    raise exception 'Request notes are too long.';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Replenishment items must be an array.';
  end if;

  if jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception
      'Choose between one and one hundred replenishment items.';
  end if;

  select coalesce(
    (
      select (s.value ->> 'enabled')::boolean
      from public.settings s
      where s.key = 'spun_availability'
    ),
    false
  )
  into v_spun_enabled;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    begin
      v_flavor_id := nullif(v_item ->> 'flavor_id', '')::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Every item requires a valid flavor.';
    end;

    v_size_id := nullif(btrim(v_item ->> 'size_id'), '');
    v_texture := coalesce(
      nullif(btrim(v_item ->> 'texture'), ''),
      'regular'
    );

    begin
      v_quantity := (v_item ->> 'quantity')::integer;
    exception
      when invalid_text_representation
        or numeric_value_out_of_range then
        raise exception 'Every item requires a valid quantity.';
    end;

    if nullif(v_item ->> 'on_hand_count', '') is null then
      v_on_hand_count := null;
    else
      begin
        v_on_hand_count :=
          (v_item ->> 'on_hand_count')::integer;
      exception
        when invalid_text_representation
          or numeric_value_out_of_range then
          raise exception 'On-hand counts must be whole numbers.';
      end;
    end if;

    v_notes := nullif(btrim(v_item ->> 'notes'), '');

    if v_flavor_id is null then
      raise exception 'Every item requires a flavor.';
    end if;

    if v_size_id not in ('7oz', '1lb') then
      raise exception
        'Retail replenishment is limited to 7 oz and 1 lb jars.';
    end if;

    if v_texture not in ('regular', 'spun') then
      raise exception 'Choose Regular or Spun.';
    end if;

    if v_texture = 'spun' and v_spun_enabled = false then
      raise exception 'Spun honey is currently unavailable.';
    end if;

    if v_quantity is null
       or v_quantity < 6
       or v_quantity > 996
       or mod(v_quantity, 6) <> 0 then
      raise exception
        'Each flavor, size, and texture must be ordered in six-jar increments.';
    end if;

    if v_on_hand_count is not null
       and (
         v_on_hand_count < 0
         or v_on_hand_count > 9999
       ) then
      raise exception
        'On-hand counts must be between zero and 9,999.';
    end if;

    if length(coalesce(v_notes, '')) > 1000 then
      raise exception 'Item notes are too long.';
    end if;

    v_selection_key :=
      v_flavor_id::text || '|' ||
      v_size_id || '|' ||
      v_texture;

    if v_selection_key = any(v_seen_selections) then
      raise exception
        'Combine duplicate flavor, size, and texture selections.';
    end if;

    v_seen_selections :=
      array_append(v_seen_selections, v_selection_key);

    select f.name
    into v_flavor_name
    from public.flavors f
    join public.stock st
      on st.flavor_id = f.id
     and st.size_id = v_size_id
     and st.type = v_texture
    where f.id = v_flavor_id
      and f.active = true
      and st.in_stock = true
    limit 1
    for share of f, st;

    if v_flavor_name is null then
      raise exception
        'A selected flavor, size, or texture is no longer available.';
    end if;

    v_unit_price_cents :=
      case v_size_id
        when '7oz' then 725
        when '1lb' then 1200
      end;

    v_total_quantity :=
      v_total_quantity + v_quantity;

    v_requested_subtotal_cents :=
      v_requested_subtotal_cents +
      (v_unit_price_cents * v_quantity);
  end loop;

  if v_total_quantity < 12 then
    raise exception
      'Replenishment requests require at least twelve jars.';
  end if;

  insert into public.partner_replenishment_requests (
    partner_id,
    submitted_by,
    status,
    needed_by,
    fulfillment_method,
    preferred_delivery_days,
    current_inventory_notes,
    request_notes,
    price_version,
    requested_subtotal_cents,
    submitted_at
  )
  values (
    v_partner_id,
    auth.uid(),
    'submitted',
    p_needed_by,
    p_fulfillment_method,
    coalesce(p_preferred_delivery_days, '{}'),
    nullif(btrim(p_current_inventory_notes), ''),
    nullif(btrim(p_request_notes), ''),
    v_price_version,
    v_requested_subtotal_cents,
    now()
  )
  returning id into v_request_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_flavor_id := (v_item ->> 'flavor_id')::uuid;
    v_size_id := btrim(v_item ->> 'size_id');
    v_texture := coalesce(
      nullif(btrim(v_item ->> 'texture'), ''),
      'regular'
    );
    v_quantity := (v_item ->> 'quantity')::integer;

    if nullif(v_item ->> 'on_hand_count', '') is null then
      v_on_hand_count := null;
    else
      v_on_hand_count :=
        (v_item ->> 'on_hand_count')::integer;
    end if;

    v_notes := nullif(btrim(v_item ->> 'notes'), '');

    select f.name
    into strict v_flavor_name
    from public.flavors f
    where f.id = v_flavor_id;

    v_unit_price_cents :=
      case v_size_id
        when '7oz' then 725
        when '1lb' then 1200
      end;

    insert into public.partner_replenishment_items (
      request_id,
      flavor_id,
      flavor_name,
      size_id,
      texture,
      quantity,
      on_hand_count,
      notes,
      unit_price_cents,
      price_version
    )
    values (
      v_request_id,
      v_flavor_id,
      v_flavor_name,
      v_size_id,
      v_texture,
      v_quantity,
      v_on_hand_count,
      v_notes,
      v_unit_price_cents,
      v_price_version
    );
  end loop;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_replenishment(
  date,
  text,
  text[],
  text,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.submit_partner_replenishment(
  date,
  text,
  text[],
  text,
  text,
  jsonb
)
to authenticated;

-- ============================================================
-- GUARDED PARTNER ACTIONS
-- ============================================================

create or replace function public.partner_replenishment_action(
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
  v_request public.partner_replenishment_requests%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_partner_reply text := nullif(btrim(p_partner_reply), '');
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_id_for_user();

  if v_partner_id is null then
    raise exception 'A connected partner account is required.';
  end if;

  if length(coalesce(v_partner_reply, '')) > 5000 then
    raise exception 'Partner reply is too long.';
  end if;

  if v_action = 'accept' then
    update public.partner_replenishment_requests
    set
      status = 'accepted',
      accepted_at = now()
    where id = p_request_id
      and partner_id = v_partner_id
      and status = 'quoted'
    returning * into v_request;

  elsif v_action = 'provide_information' then
    if v_partner_reply is null then
      raise exception 'Enter the requested information.';
    end if;

    update public.partner_replenishment_requests
    set
      status = 'under_review',
      partner_reply = v_partner_reply,
      partner_replied_at = now()
    where id = p_request_id
      and partner_id = v_partner_id
      and status = 'needs_information'
    returning * into v_request;

  elsif v_action = 'cancel' then
    update public.partner_replenishment_requests
    set
      status = 'cancelled',
      cancelled_at = now(),
      partner_response =
        concat_ws(
          E'\n\n',
          nullif(btrim(partner_response), ''),
          'Cancelled by partner.'
        ),
      partner_reply = coalesce(
        v_partner_reply,
        partner_reply
      ),
      partner_replied_at =
        case
          when v_partner_reply is not null then now()
          else partner_replied_at
        end
    where id = p_request_id
      and partner_id = v_partner_id
      and status in (
        'submitted',
        'under_review',
        'needs_information',
        'quoted'
      )
    returning * into v_request;

  else
    raise exception
      'Choose accept, provide_information, or cancel.';
  end if;

  if v_request.id is null then
    raise exception
      'This request cannot take that action in its current status.';
  end if;

  return jsonb_build_object(
    'id', v_request.id,
    'status', v_request.status,
    'partner_response', v_request.partner_response,
    'partner_reply', v_request.partner_reply,
    'requested_subtotal_cents',
      v_request.requested_subtotal_cents,
    'quote_subtotal_cents',
      v_request.quote_subtotal_cents,
    'fulfillment_charge_cents',
      v_request.fulfillment_charge_cents,
    'confirmed_total_cents',
      v_request.confirmed_total_cents,
    'accepted_at', v_request.accepted_at,
    'cancelled_at', v_request.cancelled_at,
    'partner_replied_at', v_request.partner_replied_at,
    'updated_at', v_request.updated_at
  );
end;
$$;

revoke all
on function public.partner_replenishment_action(
  uuid,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.partner_replenishment_action(
  uuid,
  text,
  text
)
to authenticated;

-- ============================================================
-- GUARDED ADMIN ACTIONS
-- ============================================================

create or replace function public.admin_partner_replenishment_action(
  p_request_id uuid,
  p_action text,
  p_partner_response text default null,
  p_admin_notes text default null,
  p_fulfillment_charge_cents integer default null
)
returns public.partner_replenishment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.partner_replenishment_requests%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_partner_response text :=
    nullif(btrim(p_partner_response), '');
  v_admin_notes text :=
    nullif(btrim(p_admin_notes), '');
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

  select *
  into v_request
  from public.partner_replenishment_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Replenishment request not found.';
  end if;

  if v_action = 'save_notes' then
    update public.partner_replenishment_requests
    set
      admin_notes = v_admin_notes,
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'under_review' then
    if v_request.status not in ('submitted', 'needs_information') then
      raise exception
        'Only submitted or needs-information requests can move under review.';
    end if;

    update public.partner_replenishment_requests
    set
      status = 'under_review',
      admin_notes = coalesce(v_admin_notes, admin_notes),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'needs_information' then
    if v_request.status not in ('submitted', 'under_review') then
      raise exception
        'This request cannot ask for information from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the information the partner needs to provide.';
    end if;

    update public.partner_replenishment_requests
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
    if v_request.status not in (
      'submitted',
      'under_review',
      'needs_information',
      'quoted'
    ) then
      raise exception
        'This request cannot be quoted from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the quote response and next step.';
    end if;

    if p_fulfillment_charge_cents is null
       or p_fulfillment_charge_cents < 0 then
      raise exception
        'Enter a fulfillment charge of zero or more.';
    end if;

    select coalesce(sum(line_total_cents), 0)
    into v_quote_subtotal_cents
    from public.partner_replenishment_items
    where request_id = p_request_id;

    if v_quote_subtotal_cents <= 0 then
      raise exception 'This request does not contain quoteable items.';
    end if;

    update public.partner_replenishment_requests
    set
      status = 'quoted',
      partner_response = v_partner_response,
      admin_notes = coalesce(v_admin_notes, admin_notes),
      quote_subtotal_cents = v_quote_subtotal_cents,
      fulfillment_charge_cents =
        p_fulfillment_charge_cents,
      confirmed_total_cents =
        v_quote_subtotal_cents +
        p_fulfillment_charge_cents,
      quoted_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'mark_paid' then
    if v_request.status <> 'accepted' then
      raise exception
        'Only an accepted quote can be marked paid.';
    end if;

    update public.partner_replenishment_requests
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
      raise exception
        'Only a paid request can be marked fulfilled.';
    end if;

    update public.partner_replenishment_requests
    set
      status = 'fulfilled',
      admin_notes = coalesce(v_admin_notes, admin_notes),
      fulfilled_at = now(),
      reviewed_at = now(),
      reviewed_by = auth.uid()
    where id = p_request_id
    returning * into v_request;

  elsif v_action = 'decline' then
    if v_request.status not in (
      'submitted',
      'under_review',
      'needs_information',
      'quoted'
    ) then
      raise exception
        'This request cannot be declined from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the reason the request was declined.';
    end if;

    update public.partner_replenishment_requests
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
    if v_request.status in (
      'fulfilled',
      'cancelled',
      'declined'
    ) then
      raise exception
        'This request cannot be cancelled from its current status.';
    end if;

    if v_partner_response is null then
      raise exception 'Enter the cancellation explanation.';
    end if;

    update public.partner_replenishment_requests
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
    raise exception
      'Choose save_notes, under_review, needs_information, quote, mark_paid, fulfill, decline, or cancel.';
  end if;

  return v_request;
end;
$$;

revoke all
on function public.admin_partner_replenishment_action(
  uuid,
  text,
  text,
  text,
  integer
)
from public, anon, authenticated;

grant execute
on function public.admin_partner_replenishment_action(
  uuid,
  text,
  text,
  text,
  integer
)
to authenticated;

-- ============================================================
-- GUARDED ADMIN HISTORY
-- ============================================================

create or replace function public.get_admin_partner_replenishment_history(
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
  if auth.uid() is null
     or not coalesce(public.nf_is_admin(), false) then
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
        'current_inventory_notes', r.current_inventory_notes,
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
                'flavor_id', i.flavor_id,
                'flavor_name', i.flavor_name,
                'size_id', i.size_id,
                'texture', i.texture,
                'quantity', i.quantity,
                'on_hand_count', i.on_hand_count,
                'notes', i.notes,
                'unit_price_cents', i.unit_price_cents,
                'price_version', i.price_version,
                'line_total_cents', i.line_total_cents
              )
              order by i.flavor_name, i.size_id, i.texture
            )
            from public.partner_replenishment_items i
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
  from public.partner_replenishment_requests r
  where (
      p_partner_id is null
      or r.partner_id = p_partner_id
    )
    and (
      p_request_id is null
      or r.id = p_request_id
    );

  return jsonb_build_object('requests', v_requests);
end;
$$;

revoke all
on function public.get_admin_partner_replenishment_history(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.get_admin_partner_replenishment_history(uuid, uuid)
to authenticated;

-- ============================================================
-- REMOVE DIRECT PARTNER WRITES AND PRIVATE COLUMN READS
-- ============================================================

drop policy if exists "Partners submit replenishment requests"
on public.partner_replenishment_requests;

drop policy if exists "Partners add submitted replenishment items"
on public.partner_replenishment_items;

revoke select, insert, update, delete
on public.partner_replenishment_requests
from anon, authenticated;

revoke select, insert, update, delete
on public.partner_replenishment_items
from anon, authenticated;

-- Partners retain row-scoped history through the existing RLS policies, but
-- only these explicitly partner-safe request columns are readable. Private
-- Admin notes, reviewer identity, and submitter identity remain inaccessible.
grant select (
  id,
  partner_id,
  status,
  needed_by,
  fulfillment_method,
  preferred_delivery_days,
  current_inventory_notes,
  request_notes,
  partner_response,
  partner_reply,
  partner_replied_at,
  price_version,
  requested_subtotal_cents,
  quote_subtotal_cents,
  fulfillment_charge_cents,
  confirmed_total_cents,
  submitted_at,
  reviewed_at,
  created_at,
  updated_at,
  quoted_at,
  accepted_at,
  paid_at,
  fulfilled_at,
  cancelled_at,
  declined_at
)
on public.partner_replenishment_requests
to authenticated;

grant select (
  id,
  request_id,
  flavor_id,
  flavor_name,
  size_id,
  texture,
  quantity,
  on_hand_count,
  notes,
  unit_price_cents,
  price_version,
  line_total_cents
)
on public.partner_replenishment_items
to authenticated;

comment on function public.submit_partner_replenishment(
  date,
  text,
  text[],
  text,
  text,
  jsonb
) is
'Atomically validates and submits one partner replenishment request with database-snapshotted flavor names and wholesale pricing.';

comment on function public.get_partner_replenishment_catalog() is
'Returns only currently available 7 oz and 1 lb retail wholesale selections for an eligible authenticated partner.';

comment on function public.partner_replenishment_action(
  uuid,
  text,
  text
) is
'Allows the owning partner to accept a quote, provide requested information, or cancel before acceptance without exposing private Admin fields.';

comment on function public.admin_partner_replenishment_action(
  uuid,
  text,
  text,
  text,
  integer
) is
'Applies guarded Admin replenishment status transitions, quote totals, partner-visible responses, and private Admin notes.';

comment on function public.get_admin_partner_replenishment_history(
  uuid,
  uuid
) is
'Returns Admin-authorized replenishment requests with private workflow fields and nested request items.';

commit;
