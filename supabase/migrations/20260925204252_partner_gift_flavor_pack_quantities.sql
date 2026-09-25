-- NectarFusions partner gift flavor packs
-- Mirrors production migration applied 2026-09-25.
-- Gift container flavors are ordered in 12-container packs, matching the
-- established 2 oz wholesale case pack.

update public.settings
set value = jsonb_set(
  value,
  '{pack_size}',
  '12'::jsonb,
  true
)
where key = 'partner_gift_pricing';

create or replace function public.submit_partner_bulk_order_v7(
  p_needed_by date default null,
  p_fulfillment_method text default null,
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
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_partner_id uuid;
  v_saved_gift_sets jsonb;
  v_updated_gift_sets jsonb := '[]'::jsonb;
  v_input_count integer := 0;
  v_saved_count integer := 0;
  v_index integer;
  v_input_gift jsonb;
  v_saved_gift jsonb;
  v_flavor_quantities jsonb;
  v_flavor_breakdown jsonb;
  v_flavor_id text;
  v_quantity_text text;
  v_flavor_quantity integer;
  v_flavor_name text;
  v_quantity_sum integer;
  v_saved_quantity integer;
  v_pack_size integer := 12;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  select coalesce((s.value ->> 'pack_size')::integer, 12)
  into v_pack_size
  from public.settings s
  where s.key = 'partner_gift_pricing';

  if v_pack_size is null or v_pack_size < 1 then
    v_pack_size := 12;
  end if;

  if jsonb_typeof(coalesce(p_gift_sets, '[]'::jsonb)) <> 'array' then
    raise exception 'Gift sets must be submitted as a list.';
  end if;

  v_request_id := public.submit_partner_bulk_order_v6(
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

  select r.gift_sets
  into v_saved_gift_sets
  from public.partner_bulk_order_requests r
  where r.id = v_request_id
    and r.partner_id = v_partner_id
  for update;

  if v_saved_gift_sets is null then
    raise exception 'The saved gift request could not be verified.';
  end if;

  v_input_count := jsonb_array_length(coalesce(p_gift_sets, '[]'::jsonb));
  v_saved_count := jsonb_array_length(coalesce(v_saved_gift_sets, '[]'::jsonb));

  if v_input_count <> v_saved_count then
    raise exception 'The saved gift request did not match the submitted gift count.';
  end if;

  if v_input_count > 0 then
    for v_index in 0..(v_input_count - 1)
    loop
      v_input_gift := p_gift_sets -> v_index;
      v_saved_gift := v_saved_gift_sets -> v_index;
      v_flavor_quantities := coalesce(
        v_input_gift -> 'flavor_quantities',
        '{}'::jsonb
      );

      if jsonb_typeof(v_flavor_quantities) <> 'object' then
        raise exception 'Flavor quantities must be submitted as an object.';
      end if;

      v_quantity_sum := 0;
      v_flavor_breakdown := '[]'::jsonb;
      v_saved_quantity := (v_saved_gift ->> 'quantity')::integer;

      for v_flavor_id, v_quantity_text in
        select key, value
        from jsonb_each_text(v_flavor_quantities)
      loop
        begin
          v_flavor_quantity := v_quantity_text::integer;
        exception
          when invalid_text_representation or numeric_value_out_of_range then
            raise exception 'Flavor pack quantities must be whole numbers.';
        end;

        if v_flavor_quantity < v_pack_size
           or v_flavor_quantity > 996
           or mod(v_flavor_quantity, v_pack_size) <> 0 then
          raise exception
            'Each gift flavor must be ordered in packs of % containers.',
            v_pack_size;
        end if;

        if not exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(v_saved_gift -> 'flavor_ids', '[]'::jsonb)
          ) as f(id)
          where f.id = v_flavor_id
        ) then
          raise exception
            'A requested flavor quantity does not match the selected flavors.';
        end if;

        select names.name
        into v_flavor_name
        from jsonb_array_elements_text(
          coalesce(v_saved_gift -> 'flavor_ids', '[]'::jsonb)
        ) with ordinality as ids(id, ord)
        join jsonb_array_elements_text(
          coalesce(v_saved_gift -> 'flavor_names', '[]'::jsonb)
        ) with ordinality as names(name, ord)
          using (ord)
        where ids.id = v_flavor_id
        limit 1;

        if v_flavor_name is null then
          raise exception 'A requested flavor could not be verified.';
        end if;

        v_quantity_sum := v_quantity_sum + v_flavor_quantity;

        v_flavor_breakdown :=
          v_flavor_breakdown ||
          jsonb_build_array(
            jsonb_build_object(
              'flavor_id', v_flavor_id,
              'flavor_name', v_flavor_name,
              'packs', v_flavor_quantity / v_pack_size,
              'pack_size', v_pack_size,
              'quantity', v_flavor_quantity
            )
          );
      end loop;

      if v_quantity_sum <> v_saved_quantity then
        raise exception
          'Flavor pack quantities must add up to the total gift container quantity.';
      end if;

      if v_saved_quantity < v_pack_size
         or mod(v_saved_quantity, v_pack_size) <> 0 then
        raise exception
          'Gift containers must be ordered in packs of %.',
          v_pack_size;
      end if;

      v_updated_gift_sets :=
        v_updated_gift_sets ||
        jsonb_build_array(
          v_saved_gift ||
          jsonb_build_object(
            'pack_size', v_pack_size,
            'total_packs', v_saved_quantity / v_pack_size,
            'flavor_quantities', v_flavor_quantities,
            'flavor_breakdown', v_flavor_breakdown
          )
        );
    end loop;
  end if;

  update public.partner_bulk_order_requests r
  set
    gift_sets = v_updated_gift_sets,
    updated_at = now()
  where r.id = v_request_id
    and r.partner_id = v_partner_id;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_bulk_order_v7(
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
on function public.submit_partner_bulk_order_v7(
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
