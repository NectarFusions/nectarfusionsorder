-- NectarFusions Partner Gift Set Details
-- Adds gift-specific lid/top color and custom details to the isolated partner request JSON.
-- Does not change retail pricing, inventory, customer orders, subscriptions, or Square.

begin;

update public.settings
set value = jsonb_set(
  value,
  '{enabled}',
  'false'::jsonb,
  false
)
where key = 'partner_bulk_ordering';

create or replace function public.submit_partner_bulk_order_v3(
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
  v_saved_gift_sets jsonb;
  v_updated_gift_sets jsonb := '[]'::jsonb;
  v_input_gift jsonb;
  v_saved_gift jsonb;
  v_lid_color text;
  v_custom_details text;
  v_input_count integer := 0;
  v_saved_count integer := 0;
  v_index integer;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  if jsonb_typeof(coalesce(p_gift_sets, '[]'::jsonb)) <> 'array' then
    raise exception 'Gift sets must be submitted as a list.';
  end if;

  v_request_id := public.submit_partner_bulk_order_v2(
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
    raise exception 'The saved gift set request could not be verified.';
  end if;

  v_input_count := jsonb_array_length(coalesce(p_gift_sets, '[]'::jsonb));
  v_saved_count := jsonb_array_length(coalesce(v_saved_gift_sets, '[]'::jsonb));

  if v_input_count <> v_saved_count then
    raise exception 'The saved gift set request did not match the submitted gift set count.';
  end if;

  if v_input_count > 0 then
    for v_index in 0..(v_input_count - 1)
    loop
      v_input_gift := p_gift_sets -> v_index;
      v_saved_gift := v_saved_gift_sets -> v_index;

      v_custom_details :=
        nullif(btrim(coalesce(v_input_gift ->> 'custom_details', '')), '');

      if length(coalesce(v_custom_details, '')) > 1000 then
        raise exception 'Gift set custom details must be 1,000 characters or fewer.';
      end if;

      if (v_saved_gift ->> 'type') = 'Small Plastic Bear' then
        v_lid_color :=
          nullif(btrim(coalesce(v_input_gift ->> 'lid_color', '')), '');

        if length(coalesce(v_lid_color, '')) > 120 then
          raise exception 'Bear lid/top color must be 120 characters or fewer.';
        end if;
      else
        v_lid_color := null;

        if nullif(btrim(coalesce(v_input_gift ->> 'lid_color', '')), '') is not null then
          raise exception 'Lid/top color is only available for the 2 oz Plastic Bear.';
        end if;
      end if;

      v_updated_gift_sets :=
        v_updated_gift_sets ||
        jsonb_build_array(
          jsonb_strip_nulls(
            v_saved_gift ||
            jsonb_build_object(
              'lid_color', v_lid_color,
              'custom_details', v_custom_details
            )
          )
        );
    end loop;
  end if;

  update public.partner_bulk_order_requests
  set gift_sets = v_updated_gift_sets
  where id = v_request_id
    and partner_id = v_partner_id;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_bulk_order_v3(
  date, text, text[], text, jsonb, uuid, jsonb, boolean, text, jsonb
)
from public, anon, authenticated;

grant execute
on function public.submit_partner_bulk_order_v3(
  date, text, text[], text, jsonb, uuid, jsonb, boolean, text, jsonb
)
to authenticated;

comment on function public.submit_partner_bulk_order_v3(
  date, text, text[], text, jsonb, uuid, jsonb, boolean, text, jsonb
) is
  'Partner ordering v3. Delegates v2 validation, then preserves optional bear lid/top color and gift-set custom details in gift_sets JSON.';

commit;
