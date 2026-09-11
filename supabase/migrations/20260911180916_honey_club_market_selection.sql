-- Honey Club initial Market Pickup selection.
-- Adds a new RPC instead of changing the existing start_subscription signature.

create or replace function public.start_subscription_v2(
  p_plan_id text,
  p_cadence public.cadence_kind,
  p_method public.fulfil_kind,
  p_name text,
  p_phone text,
  p_email text,
  p_address text default null,
  p_zip text default null,
  p_market_date_id uuid default null
)
returns table(
  sub_no text,
  token uuid,
  price_cents integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan public.plans%rowtype;
  v_zone public.zones%rowtype;
  v_market public.market_dates%rowtype;
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

  if p_method = 'market' then
    if p_market_date_id is null then
      raise exception 'Choose an available market pickup date';
    end if;

    select *
    into v_market
    from public.market_dates m
    where m.id = p_market_date_id
      and m.active is true
      and m.day >= current_date;

    if v_market.id is null then
      raise exception 'That market pickup is no longer available';
    end if;

  elsif p_method = 'delivery' then
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
    market_date_id,
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
        then v_market.id
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
$function$;

revoke all
  on function public.start_subscription_v2(
    text,
    public.cadence_kind,
    public.fulfil_kind,
    text,
    text,
    text,
    text,
    text,
    uuid
  )
  from public;

grant execute
  on function public.start_subscription_v2(
    text,
    public.cadence_kind,
    public.fulfil_kind,
    text,
    text,
    text,
    text,
    text,
    uuid
  )
  to anon, authenticated, service_role;

comment on function public.start_subscription_v2(
  text,
  public.cadence_kind,
  public.fulfil_kind,
  text,
  text,
  text,
  text,
  text,
  uuid
) is
  'Starts a Honey Club membership and requires a real active future market date for Market Pickup.';
