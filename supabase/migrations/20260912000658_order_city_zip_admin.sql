alter table public.orders
  add column if not exists city text,
  add column if not exists zip text;

create or replace function public.place_order_v2(
  p_items jsonb,
  p_method public.fulfil_kind,
  p_name text,
  p_phone text,
  p_email text,
  p_address text default null,
  p_city text default null,
  p_notes text default null,
  p_zip text default null,
  p_day date default null,
  p_market_date_id uuid default null
)
returns table(
  order_no text,
  token uuid,
  total_cents integer,
  requires_prepay boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result record;
begin
  if p_method in ('delivery','ship') then
    if btrim(coalesce(p_city, '')) = '' then
      raise exception 'City is required';
    end if;

    if btrim(coalesce(p_zip, '')) !~ '^[0-9]{5}$' then
      raise exception 'A complete five-digit ZIP code is required';
    end if;
  end if;

  select *
    into v_result
  from public.place_order(
    p_items => p_items,
    p_method => p_method,
    p_name => p_name,
    p_phone => p_phone,
    p_email => p_email,
    p_address => p_address,
    p_notes => p_notes,
    p_zip => p_zip,
    p_day => p_day,
    p_market_date_id => p_market_date_id
  );

  update public.orders
  set
    city = nullif(btrim(p_city), ''),
    zip = nullif(btrim(p_zip), '')
  where orders.token = v_result.token;

  return query
  select
    v_result.order_no::text,
    v_result.token::uuid,
    v_result.total_cents::integer,
    v_result.requires_prepay::boolean;
end;
$$;

revoke all on function public.place_order_v2(
  jsonb,public.fulfil_kind,text,text,text,text,text,text,text,date,uuid
) from public;

grant execute on function public.place_order_v2(
  jsonb,public.fulfil_kind,text,text,text,text,text,text,text,date,uuid
) to anon, authenticated, service_role;
