-- NectarFusions Phase 3 Partner Portal
-- Correct PostgreSQL honey_type/text mismatches in replenishment RPCs.
--
-- This migration replaces only two existing function definitions.
-- It does not alter tables, rows, prices, permissions, or retail_locations.

begin;

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
    st.type::text,
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
     and st.type::text = v_texture
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

commit;
