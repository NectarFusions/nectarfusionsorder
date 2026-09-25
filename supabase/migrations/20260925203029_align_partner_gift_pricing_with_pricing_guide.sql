-- NectarFusions partner gift pricing alignment
-- Mirrors production migration applied 2026-09-25.
-- Makes partner gifts use the established partner/wholesale pricing guide:
-- 2 oz Bear $2.50, 2 oz Hexagon $3.00,
-- add-ons $0.50 each, all-three add-on set $1.25,
-- custom label design/printing/labeling $30 flat.

insert into public.settings (key, value)
values (
  'partner_gift_pricing',
  jsonb_build_object(
    'bear_price_cents', 250,
    'bear_suggested_retail_cents', 500,
    'hex_price_cents', 300,
    'hex_suggested_retail_cents', 600,
    'addon_unit_price_cents', 50,
    'addon_suggested_retail_cents', 100,
    'addon_bundle_price_cents', 125,
    'addon_bundle_suggested_retail_cents', 250,
    'custom_label_flat_cents', 3000,
    'version', 'partner-gift-2026-09'
  )
)
on conflict (key) do update
set value = excluded.value;

create or replace function public.get_partner_gift_pricing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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

  select s.value
  into v_pricing
  from public.settings s
  where s.key = 'partner_gift_pricing';

  if v_pricing is null then
    raise exception 'Partner gift pricing is not configured.';
  end if;

  return v_pricing;
end;
$$;

revoke all
on function public.get_partner_gift_pricing()
from public, anon, authenticated;

grant execute
on function public.get_partner_gift_pricing()
to authenticated;

create or replace function public.submit_partner_bulk_order_v5(
  p_needed_by date default null,
  p_fulfillment_method text default 'flexible',
  p_preferred_delivery_days text[] default '{}',
  p_request_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_pickup_market_date_id uuid default null,
  p_gift_sets jsonb default '[]'::jsonb,
  p_custom_labels_requested boolean default false,
  p_custom_label_notes text default null,
  p_label_examples jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_partner_id uuid;
  v_pricing jsonb;
  v_saved_gift_sets jsonb;
  v_updated_gift_sets jsonb := '[]'::jsonb;
  v_gift jsonb;
  v_flavor_name text;
  v_type text;
  v_quantity integer;
  v_unit_price_cents integer;
  v_container_total_cents integer;
  v_dipper_quantity integer;
  v_thank_you_tag_quantity integer;
  v_bee_charm_quantity integer;
  v_bundle_quantity integer;
  v_add_on_total_cents integer;
  v_line_total_cents integer;
  v_gift_subtotal_cents integer := 0;
  v_bulk_subtotal_cents integer := 0;
  v_label_charge_cents integer := 0;
  v_bear_price_cents integer;
  v_hex_price_cents integer;
  v_addon_unit_price_cents integer;
  v_addon_bundle_price_cents integer;
  v_custom_label_flat_cents integer;
  v_price_version text;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_request_id := public.submit_partner_bulk_order_v4(
    p_needed_by => p_needed_by,
    p_fulfillment_method => p_fulfillment_method,
    p_preferred_delivery_days => p_preferred_delivery_days,
    p_request_notes => p_request_notes,
    p_items => p_items,
    p_pickup_market_date_id => p_pickup_market_date_id,
    p_gift_sets => p_gift_sets,
    p_custom_labels_requested => p_custom_labels_requested,
    p_custom_label_notes => p_custom_label_notes,
    p_label_examples => p_label_examples
  );

  v_partner_id := public.nf_partner_bulk_order_account();

  if v_partner_id is null then
    raise exception 'This partner account is not eligible for partner ordering.';
  end if;

  select s.value
  into v_pricing
  from public.settings s
  where s.key = 'partner_gift_pricing';

  if v_pricing is null then
    raise exception 'Partner gift pricing is not configured.';
  end if;

  v_bear_price_cents :=
    coalesce((v_pricing ->> 'bear_price_cents')::integer, 250);
  v_hex_price_cents :=
    coalesce((v_pricing ->> 'hex_price_cents')::integer, 300);
  v_addon_unit_price_cents :=
    coalesce((v_pricing ->> 'addon_unit_price_cents')::integer, 50);
  v_addon_bundle_price_cents :=
    coalesce((v_pricing ->> 'addon_bundle_price_cents')::integer, 125);
  v_custom_label_flat_cents :=
    coalesce((v_pricing ->> 'custom_label_flat_cents')::integer, 3000);
  v_price_version :=
    coalesce(nullif(v_pricing ->> 'version', ''), 'partner-gift-2026-09');

  select r.gift_sets
  into v_saved_gift_sets
  from public.partner_bulk_order_requests r
  where r.id = v_request_id
    and r.partner_id = v_partner_id
  for update;

  if v_saved_gift_sets is null then
    raise exception 'The saved gift request could not be verified.';
  end if;

  for v_gift in
    select value
    from jsonb_array_elements(coalesce(v_saved_gift_sets, '[]'::jsonb))
  loop
    v_type := v_gift ->> 'type';
    v_quantity := coalesce((v_gift ->> 'quantity')::integer, 0);

    if v_type = 'Small Plastic Bear' then
      v_unit_price_cents := v_bear_price_cents;
    elsif v_type = 'Small Glass Hexagonal Container' then
      v_unit_price_cents := v_hex_price_cents;
    else
      raise exception 'Gift container pricing is unavailable for this item.';
    end if;

    for v_flavor_name in
      select value #>> '{}'
      from jsonb_array_elements(coalesce(v_gift -> 'flavor_names', '[]'::jsonb))
    loop
      if v_flavor_name not in (
        'Chipotle',
        'Cinnamon',
        'Lemon',
        'Madagascar Vanilla',
        'Original'
      ) then
        raise exception
          'Partner gift requests are limited to the current core flavors.';
      end if;
    end loop;

    v_dipper_quantity :=
      coalesce((v_gift ->> 'dipper_quantity')::integer, 0);
    v_thank_you_tag_quantity :=
      coalesce((v_gift ->> 'thank_you_tag_quantity')::integer, 0);
    v_bee_charm_quantity :=
      coalesce((v_gift ->> 'bee_charm_quantity')::integer, 0);

    v_bundle_quantity := least(
      v_dipper_quantity,
      v_thank_you_tag_quantity,
      v_bee_charm_quantity
    );

    v_container_total_cents :=
      v_quantity * v_unit_price_cents;

    v_add_on_total_cents :=
      (v_bundle_quantity * v_addon_bundle_price_cents)
      + (
          (v_dipper_quantity - v_bundle_quantity)
          + (v_thank_you_tag_quantity - v_bundle_quantity)
          + (v_bee_charm_quantity - v_bundle_quantity)
        ) * v_addon_unit_price_cents;

    v_line_total_cents :=
      v_container_total_cents + v_add_on_total_cents;

    v_gift_subtotal_cents :=
      v_gift_subtotal_cents + v_line_total_cents;

    v_updated_gift_sets :=
      v_updated_gift_sets ||
      jsonb_build_array(
        jsonb_strip_nulls(
          v_gift ||
          jsonb_build_object(
            'unit_price_cents', v_unit_price_cents,
            'container_total_cents', v_container_total_cents,
            'dipper_quantity', v_dipper_quantity,
            'thank_you_tag_quantity', v_thank_you_tag_quantity,
            'bee_charm_quantity', v_bee_charm_quantity,
            'addon_bundle_quantity', v_bundle_quantity,
            'add_on_total_cents', v_add_on_total_cents,
            'line_total_cents', v_line_total_cents,
            'gift_price_version', v_price_version
          )
        )
      );
  end loop;

  select coalesce(sum(i.line_total_cents), 0)
  into v_bulk_subtotal_cents
  from public.partner_bulk_order_items i
  where i.request_id = v_request_id;

  v_label_charge_cents :=
    case
      when coalesce(p_custom_labels_requested, false)
        then v_custom_label_flat_cents
      else 0
    end;

  update public.partner_bulk_order_requests r
  set
    gift_sets = v_updated_gift_sets,
    requested_subtotal_cents =
      v_bulk_subtotal_cents +
      v_gift_subtotal_cents +
      v_label_charge_cents,
    price_version = v_price_version,
    updated_at = now()
  where r.id = v_request_id
    and r.partner_id = v_partner_id;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_bulk_order_v5(
  date,
  text,
  text[],
  text,
  jsonb,
  uuid,
  jsonb,
  boolean,
  text,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.submit_partner_bulk_order_v5(
  date,
  text,
  text[],
  text,
  jsonb,
  uuid,
  jsonb,
  boolean,
  text,
  jsonb
)
to authenticated;
