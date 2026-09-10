-- NectarFusions Partner Foodservice Refinements
-- Adds market pickup details, delivery messaging support, multi-flavor gift set
-- requests, private custom-label examples, and optional custom-item quote amounts.
--
-- SAFETY:
-- - This migration touches only the isolated partner bulk-order feature.
-- - Existing retail sizes, stock, subscriptions, Square catalog/payment code,
--   customer orders, and partner retail replenishment are not modified.
-- - The feature flag is forced OFF while this migration is installed.
-- - Existing partner bulk requests are preserved.

begin;

do $$
begin
  if to_regclass('public.partner_bulk_order_requests') is null
     or to_regclass('public.partner_bulk_order_items') is null
     or to_regclass('public.market_dates') is null
     or to_regclass('public.venues') is null
     or to_regclass('public.flavors') is null
     or to_regclass('public.settings') is null then
    raise exception 'Required NectarFusions partner bulk or market tables are missing.';
  end if;

  if to_regprocedure('public.nf_partner_bulk_order_account()') is null
     or to_regprocedure('public.submit_partner_bulk_order(date,text,text[],text,jsonb)') is null
     or to_regprocedure('public.admin_partner_bulk_order_action(uuid,text,text,text,integer)') is null then
    raise exception 'Required NectarFusions partner bulk helper functions are missing.';
  end if;
end;
$$;

update public.settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{enabled}',
  'false'::jsonb,
  true
)
where key = 'partner_bulk_ordering';

alter table public.partner_bulk_order_requests
  add column if not exists pickup_market_date_id uuid
    references public.market_dates(id)
    on delete set null,
  add column if not exists pickup_market_name text,
  add column if not exists pickup_market_day date,
  add column if not exists pickup_market_where_at text,
  add column if not exists pickup_market_hours text,
  add column if not exists gift_sets jsonb not null default '[]'::jsonb,
  add column if not exists custom_labels_requested boolean not null default false,
  add column if not exists custom_label_notes text,
  add column if not exists label_examples jsonb not null default '[]'::jsonb,
  add column if not exists custom_item_charge_cents integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'partner_bulk_order_gift_sets_array_check'
      and conrelid = 'public.partner_bulk_order_requests'::regclass
  ) then
    alter table public.partner_bulk_order_requests
      add constraint partner_bulk_order_gift_sets_array_check
      check (jsonb_typeof(gift_sets) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'partner_bulk_order_label_examples_array_check'
      and conrelid = 'public.partner_bulk_order_requests'::regclass
  ) then
    alter table public.partner_bulk_order_requests
      add constraint partner_bulk_order_label_examples_array_check
      check (jsonb_typeof(label_examples) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'partner_bulk_order_custom_label_notes_check'
      and conrelid = 'public.partner_bulk_order_requests'::regclass
  ) then
    alter table public.partner_bulk_order_requests
      add constraint partner_bulk_order_custom_label_notes_check
      check (custom_label_notes is null or length(custom_label_notes) <= 3000);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'partner_bulk_order_custom_item_charge_check'
      and conrelid = 'public.partner_bulk_order_requests'::regclass
  ) then
    alter table public.partner_bulk_order_requests
      add constraint partner_bulk_order_custom_item_charge_check
      check (
        custom_item_charge_cents is null
        or custom_item_charge_cents >= 0
      );
  end if;
end;
$$;

-- ============================================================
-- PRIVATE CUSTOM-LABEL EXAMPLE STORAGE
-- ============================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'partner-label-examples',
  'partner-label-examples',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Partners upload own label examples" on storage.objects;
create policy "Partners upload own label examples"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'partner-label-examples'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Partners view own label examples" on storage.objects;
create policy "Partners view own label examples"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'partner-label-examples'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Partners remove own label examples" on storage.objects;
create policy "Partners remove own label examples"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'partner-label-examples'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Admins view partner label examples" on storage.objects;
create policy "Admins view partner label examples"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'partner-label-examples'
  and public.nf_is_admin()
);

-- ============================================================
-- ENRICHED PARTNER CATALOG
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
  v_markets jsonb;
  v_gift_set_flavors jsonb;
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
      'flavors', '[]'::jsonb,
      'markets', '[]'::jsonb,
      'gift_set_flavors', '[]'::jsonb
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

  v_gift_set_flavors :=
    jsonb_build_array(
      jsonb_build_object(
        'id', 'natural',
        'name', 'Natural Raw Honey'
      )
    ) || v_flavors;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', md.id,
        'day', md.day,
        'name', v.name,
        'where_at',
          coalesce(
            nullif(btrim(to_jsonb(md) ->> 'where_at'), ''),
            v.where_at
          ),
        'hours',
          coalesce(
            nullif(btrim(to_jsonb(md) ->> 'hours'), ''),
            v.hours
          )
      )
      order by md.day, v.name, md.id
    ),
    '[]'::jsonb
  )
  into v_markets
  from public.market_dates md
  join public.venues v
    on v.id = md.venue_id
  where md.day >= current_date
    and coalesce(
      nullif(to_jsonb(md) ->> 'active', '')::boolean,
      true
    );

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
    'flavors', v_flavors,
    'markets', v_markets,
    'gift_set_flavors', v_gift_set_flavors
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
-- ATOMIC V2 SUBMISSION
-- ============================================================

create or replace function public.submit_partner_bulk_order_v2(
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
  v_partner_id uuid;
  v_enabled boolean := false;
  v_request_id uuid;

  v_market_name text;
  v_market_day date;
  v_market_where_at text;
  v_market_hours text;

  v_gift jsonb;
  v_gift_type text;
  v_gift_quantity integer;
  v_gift_flavor_ids jsonb;
  v_gift_flavor_id_text text;
  v_gift_flavor_id uuid;
  v_gift_flavor_name text;
  v_clean_flavor_ids jsonb;
  v_clean_flavor_names jsonb;
  v_clean_gift_sets jsonb := '[]'::jsonb;
  v_seen_gift_flavors text[];

  v_label_example jsonb;
  v_label_storage_path text;
  v_label_file_name text;
  v_label_mime_type text;
  v_label_size_bytes integer;
  v_clean_label_examples jsonb := '[]'::jsonb;

  v_items_count integer := 0;
  v_gift_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Partner authentication is required.';
  end if;

  v_partner_id := public.nf_partner_bulk_order_account();

  if v_partner_id is null then
    raise exception 'This partner account is not eligible for partner ordering.';
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

  if length(coalesce(p_request_notes, '')) > 5000 then
    raise exception 'Request notes are too long.';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Bulk items must be submitted as a list.';
  end if;

  if jsonb_typeof(coalesce(p_gift_sets, '[]'::jsonb)) <> 'array' then
    raise exception 'Gift sets must be submitted as a list.';
  end if;

  if jsonb_typeof(coalesce(p_label_examples, '[]'::jsonb)) <> 'array' then
    raise exception 'Custom-label examples must be submitted as a list.';
  end if;

  v_items_count := jsonb_array_length(coalesce(p_items, '[]'::jsonb));
  v_gift_count := jsonb_array_length(coalesce(p_gift_sets, '[]'::jsonb));

  if v_items_count > 50 then
    raise exception 'Choose no more than fifty bulk order items.';
  end if;

  if v_gift_count > 20 then
    raise exception 'Choose no more than twenty gift set lines.';
  end if;

  if v_items_count = 0 and v_gift_count = 0 then
    raise exception 'Add at least one bulk container or gift set request.';
  end if;

  if coalesce(p_custom_labels_requested, false) and v_gift_count = 0 then
    raise exception 'Add a gift set before requesting custom labels.';
  end if;

  if length(coalesce(p_custom_label_notes, '')) > 3000 then
    raise exception 'Custom label details are too long.';
  end if;

  if jsonb_array_length(coalesce(p_label_examples, '[]'::jsonb)) > 5 then
    raise exception 'Upload no more than five custom-label examples.';
  end if;

  if not coalesce(p_custom_labels_requested, false)
     and jsonb_array_length(coalesce(p_label_examples, '[]'::jsonb)) > 0 then
    raise exception 'Custom-label examples require a custom-label request.';
  end if;

  for v_label_example in
    select value
    from jsonb_array_elements(coalesce(p_label_examples, '[]'::jsonb))
  loop
    v_label_storage_path := nullif(btrim(v_label_example ->> 'storage_path'), '');
    v_label_file_name := nullif(btrim(v_label_example ->> 'file_name'), '');
    v_label_mime_type := lower(btrim(coalesce(v_label_example ->> 'mime_type', '')));

    begin
      v_label_size_bytes := (v_label_example ->> 'size_bytes')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'A custom-label example has an invalid file size.';
    end;

    if v_label_storage_path is null
       or position(auth.uid()::text || '/' in v_label_storage_path) <> 1 then
      raise exception 'A custom-label example is not owned by this partner user.';
    end if;

    if v_label_file_name is null or length(v_label_file_name) > 200 then
      raise exception 'A custom-label example has an invalid file name.';
    end if;

    if v_label_mime_type not in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf'
    ) then
      raise exception 'Custom-label examples must be JPG, PNG, WebP, or PDF files.';
    end if;

    if v_label_size_bytes is null
       or v_label_size_bytes < 1
       or v_label_size_bytes > 5242880 then
      raise exception 'Each custom-label example must be 5 MB or smaller.';
    end if;

    if not exists (
      select 1
      from storage.objects so
      where so.bucket_id = 'partner-label-examples'
        and so.name = v_label_storage_path
        and (storage.foldername(so.name))[1] = auth.uid()::text
    ) then
      raise exception 'A custom-label example upload could not be verified.';
    end if;

    v_clean_label_examples :=
      v_clean_label_examples ||
      jsonb_build_array(
        jsonb_build_object(
          'storage_path', v_label_storage_path,
          'file_name', v_label_file_name,
          'mime_type', v_label_mime_type,
          'size_bytes', v_label_size_bytes
        )
      );
  end loop;

  if p_fulfillment_method = 'delivery' then
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
  end if;

  if p_fulfillment_method = 'pickup' then
    if p_pickup_market_date_id is null then
      raise exception 'Choose an available market for pickup.';
    end if;

    select
      v.name,
      md.day,
      coalesce(
        nullif(btrim(to_jsonb(md) ->> 'where_at'), ''),
        v.where_at
      ),
      coalesce(
        nullif(btrim(to_jsonb(md) ->> 'hours'), ''),
        v.hours
      )
    into
      v_market_name,
      v_market_day,
      v_market_where_at,
      v_market_hours
    from public.market_dates md
    join public.venues v
      on v.id = md.venue_id
    where md.id = p_pickup_market_date_id
      and md.day >= current_date
      and coalesce(
        nullif(to_jsonb(md) ->> 'active', '')::boolean,
        true
      )
    limit 1;

    if v_market_name is null then
      raise exception 'The selected pickup market is no longer available.';
    end if;
  end if;

  for v_gift in
    select value
    from jsonb_array_elements(coalesce(p_gift_sets, '[]'::jsonb))
  loop
    v_gift_type := nullif(btrim(coalesce(v_gift ->> 'type', '')), '');

    if v_gift_type not in (
      'Small Plastic Bear',
      'Small Glass Hexagonal Container'
    ) then
      raise exception 'Choose Small Plastic Bear or Small Glass Hexagonal Container for each gift set.';
    end if;

    begin
      v_gift_quantity := (v_gift ->> 'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Each gift set needs a valid quantity.';
    end;

    if v_gift_quantity is null or v_gift_quantity < 1 or v_gift_quantity > 999 then
      raise exception 'Gift set quantities must be between 1 and 999.';
    end if;

    v_gift_flavor_ids := coalesce(v_gift -> 'flavor_ids', '[]'::jsonb);

    if jsonb_typeof(v_gift_flavor_ids) <> 'array'
       or jsonb_array_length(v_gift_flavor_ids) < 1
       or jsonb_array_length(v_gift_flavor_ids) > 20 then
      raise exception 'Choose between one and twenty flavors for each gift set.';
    end if;

    v_clean_flavor_ids := '[]'::jsonb;
    v_clean_flavor_names := '[]'::jsonb;
    v_seen_gift_flavors := '{}';

    for v_gift_flavor_id_text in
      select value #>> '{}'
      from jsonb_array_elements(v_gift_flavor_ids)
    loop
      v_gift_flavor_id_text := btrim(coalesce(v_gift_flavor_id_text, ''));

      if v_gift_flavor_id_text = '' then
        raise exception 'Choose valid gift set flavors.';
      end if;

      if v_gift_flavor_id_text = any(v_seen_gift_flavors) then
        raise exception 'Choose each gift set flavor only once.';
      end if;

      if v_gift_flavor_id_text = 'natural' then
        v_gift_flavor_name := 'Natural Raw Honey';
      else
        begin
          v_gift_flavor_id := v_gift_flavor_id_text::uuid;
        exception
          when invalid_text_representation then
            raise exception 'Choose a valid gift set flavor.';
        end;

        select f.name
        into v_gift_flavor_name
        from public.flavors f
        where f.id = v_gift_flavor_id
          and f.active = true
          and lower(btrim(f.name)) not like 'natural%'
          and lower(btrim(f.name)) not like 'raw%'
        limit 1;

        if v_gift_flavor_name is null then
          raise exception 'A selected gift set flavor is no longer available.';
        end if;
      end if;

      v_seen_gift_flavors :=
        array_append(v_seen_gift_flavors, v_gift_flavor_id_text);

      v_clean_flavor_ids :=
        v_clean_flavor_ids || jsonb_build_array(v_gift_flavor_id_text);

      v_clean_flavor_names :=
        v_clean_flavor_names || jsonb_build_array(v_gift_flavor_name);
    end loop;

    v_clean_gift_sets :=
      v_clean_gift_sets ||
      jsonb_build_array(
        jsonb_build_object(
          'type', v_gift_type,
          'quantity', v_gift_quantity,
          'flavor_ids', v_clean_flavor_ids,
          'flavor_names', v_clean_flavor_names
        )
      );
  end loop;

  if v_items_count > 0 then
    v_request_id := public.submit_partner_bulk_order(
      p_needed_by => p_needed_by,
      p_fulfillment_method => p_fulfillment_method,
      p_preferred_delivery_days =>
        case
          when p_fulfillment_method = 'delivery'
            then coalesce(p_preferred_delivery_days, '{}')
          else '{}'::text[]
        end,
      p_request_notes => p_request_notes,
      p_items => p_items
    );
  else
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
      case
        when p_fulfillment_method = 'delivery'
          then coalesce(p_preferred_delivery_days, '{}')
        else '{}'::text[]
      end,
      nullif(btrim(p_request_notes), ''),
      'bulk-2026-08',
      0,
      now()
    )
    returning id into v_request_id;
  end if;

  update public.partner_bulk_order_requests
  set
    pickup_market_date_id =
      case
        when p_fulfillment_method = 'pickup'
          then p_pickup_market_date_id
        else null
      end,
    pickup_market_name =
      case
        when p_fulfillment_method = 'pickup'
          then v_market_name
        else null
      end,
    pickup_market_day =
      case
        when p_fulfillment_method = 'pickup'
          then v_market_day
        else null
      end,
    pickup_market_where_at =
      case
        when p_fulfillment_method = 'pickup'
          then v_market_where_at
        else null
      end,
    pickup_market_hours =
      case
        when p_fulfillment_method = 'pickup'
          then v_market_hours
        else null
      end,
    gift_sets = v_clean_gift_sets,
    custom_labels_requested = coalesce(p_custom_labels_requested, false),
    custom_label_notes =
      case
        when coalesce(p_custom_labels_requested, false)
          then nullif(btrim(p_custom_label_notes), '')
        else null
      end,
    label_examples =
      case
        when coalesce(p_custom_labels_requested, false)
          then v_clean_label_examples
        else '[]'::jsonb
      end,
    preferred_delivery_days =
      case
        when p_fulfillment_method = 'delivery'
          then coalesce(p_preferred_delivery_days, '{}')
        else '{}'::text[]
      end
  where id = v_request_id
    and partner_id = v_partner_id;

  return v_request_id;
end;
$$;

revoke all
on function public.submit_partner_bulk_order_v2(
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
on function public.submit_partner_bulk_order_v2(
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

-- ============================================================
-- V2 ADMIN QUOTE ACTION
-- ============================================================

create or replace function public.admin_partner_bulk_order_action_v2(
  p_request_id uuid,
  p_action text,
  p_partner_response text default null,
  p_admin_notes text default null,
  p_fulfillment_charge_cents integer default null,
  p_custom_item_charge_cents integer default null
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
  v_bulk_subtotal_cents integer := 0;
  v_custom_item_charge_cents integer := coalesce(p_custom_item_charge_cents, 0);
  v_fulfillment_charge_cents integer := coalesce(p_fulfillment_charge_cents, 0);
  v_quote_subtotal_cents integer := 0;
begin
  if v_action <> 'quote' then
    return public.admin_partner_bulk_order_action(
      p_request_id,
      p_action,
      p_partner_response,
      p_admin_notes,
      p_fulfillment_charge_cents
    );
  end if;

  if not public.nf_is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if v_partner_response is null then
    raise exception 'Enter the quote response and next step.';
  end if;

  if length(v_partner_response) > 5000 then
    raise exception 'Partner response is too long.';
  end if;

  if length(coalesce(v_admin_notes, '')) > 10000 then
    raise exception 'Admin notes are too long.';
  end if;

  if v_custom_item_charge_cents < 0 then
    raise exception 'Gift set/custom item charge must be zero or more.';
  end if;

  select *
  into v_request
  from public.partner_bulk_order_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Bulk order request not found.';
  end if;

  if v_request.status not in (
    'submitted',
    'under_review',
    'needs_information',
    'quoted'
  ) then
    raise exception 'This partner request cannot be quoted from its current status.';
  end if;

  if v_request.fulfillment_method in ('pickup', 'delivery') then
    v_fulfillment_charge_cents := 0;
  elsif p_fulfillment_charge_cents is null
        or p_fulfillment_charge_cents < 0 then
    raise exception 'Enter a shipping/fulfillment charge of zero or more.';
  end if;

  select coalesce(sum(line_total_cents), 0)
  into v_bulk_subtotal_cents
  from public.partner_bulk_order_items
  where request_id = p_request_id;

  v_quote_subtotal_cents :=
    v_bulk_subtotal_cents + v_custom_item_charge_cents;

  if v_quote_subtotal_cents <= 0 then
    raise exception 'Enter a gift set/custom item amount before quoting this request.';
  end if;

  update public.partner_bulk_order_requests
  set
    status = 'quoted',
    partner_response = v_partner_response,
    admin_notes = coalesce(v_admin_notes, admin_notes),
    custom_item_charge_cents = v_custom_item_charge_cents,
    quote_subtotal_cents = v_quote_subtotal_cents,
    fulfillment_charge_cents = v_fulfillment_charge_cents,
    confirmed_total_cents =
      v_quote_subtotal_cents + v_fulfillment_charge_cents,
    quoted_at = now(),
    reviewed_at = now(),
    reviewed_by = auth.uid()
  where id = p_request_id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all
on function public.admin_partner_bulk_order_action_v2(
  uuid,
  text,
  text,
  text,
  integer,
  integer
)
from public, anon, authenticated;

grant execute
on function public.admin_partner_bulk_order_action_v2(
  uuid,
  text,
  text,
  text,
  integer,
  integer
)
to authenticated;

comment on column public.partner_bulk_order_requests.pickup_market_date_id is
  'Selected upcoming market for partner pickup. The request also stores display snapshots for historical accuracy.';

comment on column public.partner_bulk_order_requests.gift_sets is
  'Unpriced small gift-set request lines with requested type, quantity, and immutable flavor-name snapshots.';

comment on column public.partner_bulk_order_requests.custom_labels_requested is
  'Whether the partner requested custom labels for gift sets.';

comment on column public.partner_bulk_order_requests.label_examples is
  'Private partner-uploaded custom-label example metadata. Files are stored in the partner-label-examples bucket.';

comment on column public.partner_bulk_order_requests.custom_item_charge_cents is
  'Admin-entered quote amount for gift sets or other unpriced custom items. This is added to the product quote subtotal.';

commit;
