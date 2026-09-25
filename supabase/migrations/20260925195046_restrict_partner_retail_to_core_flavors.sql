-- NectarFusions partner retail core flavor restriction
-- Mirrors the production migration applied on 2026-09-25.
-- Retail partner replenishment is limited to:
-- Chipotle, Cinnamon, Lemon, Madagascar Vanilla, and Original.

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
    (z.price_cents / 2)::integer,
    'retail-core-2026-09'::text
  from public.stock st
  join public.flavors f
    on f.id = st.flavor_id
  join public.sizes z
    on z.id = st.size_id
  where f.active = true
    and f.name in (
      'Chipotle',
      'Cinnamon',
      'Lemon',
      'Madagascar Vanilla',
      'Original'
    )
    and st.in_stock = true
    and st.type in ('regular', 'spun')
    and st.size_id in ('4oz', '7oz', '1lb')
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

create or replace function public.submit_partner_replenishment(
  p_needed_by date default null,
  p_fulfillment_method text default 'pickup',
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
  v_price_version constant text := 'retail-core-2026-09';
  v_spun_enabled boolean := false;
  v_selection_key text;
  v_seen_selections text[] := '{}';
  v_delivery_zip text;
  v_delivery_fee_cents integer := 0;
  v_checkout_fee_cents integer := 0;
  v_confirmed_total_cents integer := 0;
  v_zone record;
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
     or p_fulfillment_method not in ('pickup', 'delivery') then
    raise exception 'Choose Pickup or Local Delivery.';
  end if;

  if not (
    coalesce(p_preferred_delivery_days, '{}') <@
    array[
      'monday','tuesday','wednesday','thursday',
      'friday','saturday','sunday'
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
        v_on_hand_count := (v_item ->> 'on_hand_count')::integer;
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

    if v_size_id not in ('4oz', '7oz', '1lb') then
      raise exception
        'Retail replenishment is limited to 4 oz, 7 oz, and 1 lb jars.';
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
       and (v_on_hand_count < 0 or v_on_hand_count > 9999) then
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
      and f.name in (
        'Chipotle',
        'Cinnamon',
        'Lemon',
        'Madagascar Vanilla',
        'Original'
      )
      and st.in_stock = true
    limit 1
    for share of f, st;

    if v_flavor_name is null then
      raise exception
        'Only current core flavors can be ordered through retail replenishment.';
    end if;

    select (s.price_cents / 2)::integer
    into v_unit_price_cents
    from public.sizes s
    where s.id = v_size_id;

    if v_unit_price_cents is null then
      raise exception 'Wholesale pricing is unavailable for a selected size.';
    end if;

    v_total_quantity := v_total_quantity + v_quantity;
    v_requested_subtotal_cents :=
      v_requested_subtotal_cents +
      (v_unit_price_cents * v_quantity);
  end loop;

  if v_total_quantity < 12 then
    raise exception
      'Replenishment requests require at least twelve jars.';
  end if;

  if p_fulfillment_method = 'delivery' then
    select regexp_replace(coalesce(pa.zip, ''), '\D', '', 'g')
    into v_delivery_zip
    from public.partner_accounts pa
    where pa.id = v_partner_id;

    if v_delivery_zip !~ '^\d{5}$' then
      raise exception
        'Your partner account needs a valid 5-digit ZIP code before delivery can be selected.';
    end if;

    select
      z.name,
      z.fee_cents,
      z.minimum_cents
    into v_zone
    from public.zones z
    where v_delivery_zip = any(z.zips)
    limit 1;

    if v_zone.name is null then
      raise exception
        'That ZIP is outside the current local delivery area. Choose Coleman pickup or contact NectarFusions.';
    end if;

    if v_requested_subtotal_cents < coalesce(v_zone.minimum_cents, 0) then
      raise exception
        'This delivery zone requires a higher merchandise subtotal before delivery.';
    end if;

    v_delivery_fee_cents := coalesce(v_zone.fee_cents, 0);
  else
    v_delivery_fee_cents := 0;
  end if;

  v_checkout_fee_cents :=
    round(
      (v_requested_subtotal_cents + v_delivery_fee_cents) * 0.04
    )::integer;

  v_confirmed_total_cents :=
    v_requested_subtotal_cents +
    v_delivery_fee_cents +
    v_checkout_fee_cents;

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
    fulfillment_charge_cents,
    confirmed_total_cents,
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
    v_delivery_fee_cents,
    v_confirmed_total_cents,
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
      v_on_hand_count := (v_item ->> 'on_hand_count')::integer;
    end if;

    v_notes := nullif(btrim(v_item ->> 'notes'), '');

    select f.name
    into strict v_flavor_name
    from public.flavors f
    where f.id = v_flavor_id
      and f.name in (
        'Chipotle',
        'Cinnamon',
        'Lemon',
        'Madagascar Vanilla',
        'Original'
      );

    select (s.price_cents / 2)::integer
    into v_unit_price_cents
    from public.sizes s
    where s.id = v_size_id;

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
