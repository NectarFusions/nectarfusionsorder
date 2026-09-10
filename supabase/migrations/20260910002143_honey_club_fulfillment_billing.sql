alter table public.plans
  add column if not exists bonus_every integer not null default 3;

alter table public.subscriptions
  add column if not exists delivery_zip text,
  add column if not exists temporary_delivery_notes text,
  add column if not exists billing_mode text not null default 'card',
  add column if not exists market_pause_action_id text,
  add column if not exists fulfillment_updated_at timestamptz,
  add column if not exists fulfillment_updated_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'plans_bonus_every_check'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
      add constraint plans_bonus_every_check
      check (bonus_every > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_billing_mode_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_billing_mode_check
      check (
        billing_mode in (
          'card',
          'card_setup_required',
          'market_manual'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_delivery_zip_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_delivery_zip_check
      check (
        delivery_zip is null
        or delivery_zip ~ '^[0-9]{5}$'
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_temporary_delivery_notes_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_temporary_delivery_notes_check
      check (
        temporary_delivery_notes is null
        or length(temporary_delivery_notes) <= 1500
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_fulfillment_updated_by_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_fulfillment_updated_by_check
      check (
        fulfillment_updated_by is null
        or fulfillment_updated_by in (
          'customer',
          'admin',
          'system'
        )
      );
  end if;
end
$$;

update public.subscriptions
set
  billing_mode = case
    when method = 'market' then 'market_manual'
    when square_subscription_id is null then 'card_setup_required'
    else 'card'
  end,
  fulfillment_updated_at =
    coalesce(fulfillment_updated_at, started_at, now()),
  fulfillment_updated_by =
    coalesce(fulfillment_updated_by, 'system');

create or replace function public.start_subscription(
  p_plan_id text,
  p_cadence public.cadence_kind,
  p_method public.fulfil_kind,
  p_name text,
  p_phone text,
  p_email text,
  p_address text default null,
  p_zip text default null
)
returns table(
  sub_no text,
  token uuid,
  price_cents integer
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.plans%rowtype;
  v_zone public.zones%rowtype;
  v_cust uuid;
  v_sub public.subscriptions%rowtype;
  v_free_ship int :=
    (
      (
        select value
        from public.settings
        where key = 'shipping'
      )->>'free_over_cents'
    )::int;
begin
  if btrim(coalesce(p_name, '')) = '' then
    raise exception 'Name is required';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    raise exception 'Phone is required';
  end if;

  if btrim(coalesce(p_email, '')) = '' then
    raise exception 'Email is required';
  end if;

  select *
  into v_plan
  from public.plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'Unknown plan';
  end if;

  if p_method = 'delivery' then
    select *
    into v_zone
    from public.zones z
    where btrim(coalesce(p_zip, '')) = any(z.zips);

    if v_zone.id is null then
      raise exception 'We do not deliver to %', p_zip;
    end if;

    if btrim(coalesce(p_address, '')) = '' then
      raise exception 'Address is required';
    end if;

  elsif p_method = 'ship' then
    if v_plan.price_cents < v_free_ship then
      raise exception
        'Shipping is only available on boxes over $%',
        (v_free_ship / 100.0);
    end if;

    if btrim(coalesce(p_address, '')) = '' then
      raise exception 'Address is required';
    end if;
  end if;

  insert into public.customers (
    phone,
    email,
    name
  )
  values (
    btrim(p_phone),
    btrim(p_email),
    btrim(p_name)
  )
  on conflict (phone)
  do update
  set
    email = excluded.email,
    name = excluded.name
  returning id into v_cust;

  insert into public.subscriptions (
    sub_no,
    customer_id,
    plan_id,
    cadence,
    method,
    status,
    zone_id,
    address,
    delivery_zip,
    billing_mode,
    fulfillment_updated_at,
    fulfillment_updated_by
  )
  values (
    public.next_sub_no(),
    v_cust,
    v_plan.id,
    p_cadence,
    p_method,
    'pending',
    v_zone.id,
    nullif(btrim(coalesce(p_address, '')), ''),
    case
      when p_method in ('delivery', 'ship')
        then nullif(btrim(coalesce(p_zip, '')), '')
      else null
    end,
    case
      when p_method = 'market'
        then 'market_manual'
      else 'card_setup_required'
    end,
    statement_timestamp(),
    'customer'
  )
  returning *
  into v_sub;

  return query
  select
    v_sub.sub_no,
    v_sub.token,
    v_plan.price_cents;
end;
$$;

create or replace function public.set_subscription_fulfillment_details(
  p_token text,
  p_delivery_location_type text default null,
  p_building_details text default null,
  p_gate_code text default null,
  p_delivery_notes text default null,
  p_preferred_contact_method text default null,
  p_preferred_delivery_timing text default null,
  p_market_date_id uuid default null,
  p_is_gift boolean default false,
  p_recipient_name text default null,
  p_gift_message text default null,
  p_terms_accepted boolean default false,
  p_terms_version text default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_method text;
  v_location_type text :=
    nullif(btrim(p_delivery_location_type), '');
  v_building_details text :=
    nullif(btrim(p_building_details), '');
  v_gate_code text :=
    nullif(btrim(p_gate_code), '');
  v_delivery_notes text :=
    nullif(btrim(p_delivery_notes), '');
  v_contact_method text :=
    nullif(btrim(p_preferred_contact_method), '');
  v_delivery_timing text :=
    nullif(btrim(p_preferred_delivery_timing), '');
  v_recipient_name text :=
    nullif(btrim(p_recipient_name), '');
  v_gift_message text :=
    nullif(btrim(p_gift_message), '');
  v_terms_version text :=
    nullif(btrim(p_terms_version), '');
begin
  if p_token is null or btrim(p_token) = '' then
    raise exception 'The subscription token is required.';
  end if;

  select s.method::text
  into v_method
  from public.subscriptions s
  where s.token::text = btrim(p_token);

  if not found then
    raise exception 'The subscription could not be found.';
  end if;

  if
    v_location_type is not null
    and v_location_type not in (
      'house',
      'apartment_condo',
      'business',
      'other'
    )
  then
    raise exception 'Choose a valid delivery location type.';
  end if;

  if
    v_contact_method is not null
    and v_contact_method not in (
      'text',
      'call',
      'email'
    )
  then
    raise exception 'Choose a valid contact method.';
  end if;

  if
    v_method = 'delivery'
    and (
      v_location_type is null
      or v_contact_method is null
    )
  then
    raise exception
      'Delivery location type and contact method are required.';
  end if;

  if v_method = 'market' then
    if
      p_market_date_id is null
      or not exists (
        select 1
        from public.market_dates md
        where md.id = p_market_date_id
          and md.active is distinct from false
          and md.day >= current_date
      )
    then
      raise exception 'Choose an available market pickup.';
    end if;
  end if;

  if
    coalesce(p_is_gift, false)
    and v_recipient_name is null
  then
    raise exception 'The gift recipient name is required.';
  end if;

  if
    not coalesce(p_terms_accepted, false)
    or v_terms_version is null
  then
    raise exception 'The subscription terms must be accepted.';
  end if;

  update public.subscriptions
  set
    delivery_location_type =
      case
        when v_method = 'delivery'
          then v_location_type
        else delivery_location_type
      end,

    building_details =
      case
        when v_method = 'delivery'
          then v_building_details
        else building_details
      end,

    gate_code =
      case
        when v_method = 'delivery'
          then v_gate_code
        else gate_code
      end,

    delivery_notes =
      case
        when v_method = 'delivery'
          then v_delivery_notes
        else delivery_notes
      end,

    preferred_contact_method =
      case
        when v_method = 'delivery'
          then v_contact_method
        else preferred_contact_method
      end,

    preferred_delivery_timing =
      case
        when v_method = 'delivery'
          then v_delivery_timing
        else preferred_delivery_timing
      end,

    market_date_id =
      case
        when v_method = 'market'
          then p_market_date_id
        else null
      end,

    is_gift =
      case
        when v_method in ('delivery', 'ship')
          then coalesce(p_is_gift, false)
        else is_gift
      end,

    recipient_name =
      case
        when
          v_method in ('delivery', 'ship')
          and coalesce(p_is_gift, false)
          then v_recipient_name
        when v_method in ('delivery', 'ship')
          then null
        else recipient_name
      end,

    gift_message =
      case
        when
          v_method in ('delivery', 'ship')
          and coalesce(p_is_gift, false)
          then v_gift_message
        when v_method in ('delivery', 'ship')
          then null
        else gift_message
      end,

    terms_accepted_at = statement_timestamp(),
    terms_version = v_terms_version,
    fulfillment_updated_at = statement_timestamp(),
    fulfillment_updated_by = 'customer'

  where token::text = btrim(p_token);
end;
$$;

create or replace function public.record_manual_subscription_box(
  p_subscription_id uuid,
  p_reference_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_sub_no text;
  v_current_boxes integer;
  v_bonus_every integer;
  v_method text;
  v_billing_mode text;
  v_status text;
  v_box_number integer;
  v_bonus_due boolean;
  v_reference text :=
    coalesce(
      nullif(btrim(p_reference_id), ''),
      gen_random_uuid()::text
    );
  v_event_key text;
  v_existing public.subscription_box_events%rowtype;
begin
  if p_subscription_id is null then
    raise exception 'Subscription ID is required.';
  end if;

  if length(v_reference) > 120 then
    raise exception 'Reference ID is too long.';
  end if;

  select
    s.sub_no::text,
    coalesce(s.boxes_sent, 0),
    greatest(coalesce(p.bonus_every, 3), 1),
    s.method::text,
    s.billing_mode,
    s.status::text
  into
    v_sub_no,
    v_current_boxes,
    v_bonus_every,
    v_method,
    v_billing_mode,
    v_status
  from public.subscriptions s
  join public.plans p
    on p.id = s.plan_id
  where s.id = p_subscription_id
  for update of s;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if v_status = 'cancelled' then
    raise exception
      'Cancelled subscriptions cannot receive a box.';
  end if;

  if
    v_method <> 'market'
    or v_billing_mode <> 'market_manual'
  then
    raise exception
      'Manual box recording is only available for market pickup memberships.';
  end if;

  v_event_key := 'manual:' || v_reference;

  select e.*
  into v_existing
  from public.subscription_box_events e
  where
    e.square_event_id = v_event_key
    or e.square_invoice_id = v_event_key
  limit 1;

  if found then
    return jsonb_build_object(
      'duplicate', true,
      'subscription_id', v_existing.subscription_id,
      'box_number', v_existing.box_number,
      'bonus_every', v_existing.bonus_every,
      'bonus_jar_due', v_existing.bonus_jar_due
    );
  end if;

  v_box_number := v_current_boxes + 1;
  v_bonus_due :=
    mod(v_box_number, v_bonus_every) = 0;

  insert into public.subscription_box_events (
    subscription_id,
    square_event_id,
    square_invoice_id,
    box_number,
    bonus_every,
    bonus_jar_due,
    paid_at
  )
  values (
    p_subscription_id,
    v_event_key,
    v_event_key,
    v_box_number,
    v_bonus_every,
    v_bonus_due,
    statement_timestamp()
  );

  update public.subscriptions
  set
    boxes_sent = v_box_number,
    last_invoice_at = statement_timestamp(),
    status = 'active'
  where id = p_subscription_id;

  return jsonb_build_object(
    'duplicate', false,
    'subscription_id', p_subscription_id,
    'sub_no', v_sub_no,
    'box_number', v_box_number,
    'bonus_every', v_bonus_every,
    'bonus_jar_due', v_bonus_due
  );
end;
$$;

revoke execute
on function public.record_manual_subscription_box(uuid, text)
from public, anon, authenticated;

grant execute
on function public.record_manual_subscription_box(uuid, text)
to service_role;

comment on column public.plans.bonus_every is
  'Honey Club bonus jar cadence. 3 means every third paid or recorded box.';

comment on column public.subscriptions.billing_mode is
  'card = recurring Square billing active; card_setup_required = delivery selected but secure Square setup is still needed; market_manual = pay at market with no automatic recurring charge.';

comment on column public.subscriptions.temporary_delivery_notes is
  'Temporary or seasonal drop-off instructions that can be changed without replacing permanent delivery notes.';

comment on function public.record_manual_subscription_box(uuid, text) is
  'Server-only idempotent market pickup box recorder. Keeps boxes_sent and every-third-box bonus tracking aligned with card-billed subscriptions.';

comment on table public.subscription_box_events is
  'One immutable record per Honey Club box payment or fulfillment count, whether recorded from a Square invoice or a manual market pickup.';
