begin;

insert into public.settings (key, value)
values ('change_minutes', to_jsonb(30))
on conflict (key) do update set value = excluded.value;

alter table public.orders add column if not exists last_customer_change_at timestamptz;

create table if not exists public.order_item_changes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  old_flavor_id uuid not null references public.flavors(id),
  old_flavor_name text not null,
  new_flavor_id uuid not null references public.flavors(id),
  new_flavor_name text not null,
  size_id text not null,
  size_label text not null,
  type public.honey_type not null,
  qty integer not null check (qty > 0),
  unit_cents integer not null check (unit_cents >= 0),
  changed_at timestamptz not null default now()
);

alter table public.order_item_changes enable row level security;
revoke all on public.order_item_changes from anon, authenticated;

create or replace function public.find_order(p_order_no text, p_email text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_token uuid;
begin
  select o.token into v_token
  from public.orders o
  where lower(btrim(o.order_no)) = lower(btrim(regexp_replace(coalesce(p_order_no,''), '^#', '')))
    and lower(btrim(o.email)) = lower(btrim(coalesce(p_email,'')))
  order by o.placed_at desc limit 1;
  if v_token is null then raise exception 'We could not locate an order using those details.'; end if;
  return v_token;
end $$;

create or replace function public.get_order(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
  v_minutes int := coalesce(
    (select value::int from public.settings where key='change_minutes'),
    30
  );
begin
  select jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'method', o.method,
    'total_cents', o.total_cents,
    'fee_cents', o.fee_cents,
    'placed_at', o.placed_at,
    'paid', o.paid,
    'requires_prepay', o.requires_prepay,
    'pay_url', o.square_link_url,
    'email', o.email,
    'customer_email', o.email,
    'market_name', ven.name,
    'market_day', md.day,
    'market_hours', ven.hours,
    'market_address', coalesce(
      to_jsonb(ven)->>'address',
      to_jsonb(ven)->>'street_address',
      to_jsonb(ven)->>'location'
    ),
    'change_minutes_left',
      greatest(
        0,
        ceil(v_minutes - extract(epoch from (now() - o.placed_at)) / 60)
      )::int,
    'change_used',
      exists (
        select 1
        from public.order_item_changes used_change
        where used_change.order_id = o.id
      ),
    'can_change',
      (
        o.status <> 'cancelled'
        and now() <= o.placed_at + (v_minutes || ' minutes')::interval
        and not exists (
          select 1
          from public.order_item_changes used_change
          where used_change.order_id = o.id
        )
      ),
    'items',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'qty', i.qty,
            'size', i.size_label,
            'size_id', i.size_id,
            'type', i.type,
            'flavor', i.flavor_name,
            'flavor_id', i.flavor_id,
            'unit_cents', i.unit_cents,
            'eligible_flavors',
              case
                when exists (
                  select 1
                  from public.order_item_changes used_change
                  where used_change.order_id = o.id
                ) then '[]'::jsonb
                else coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', f.id,
                      'name', f.name,
                      'hex', f.hex,
                      'image_url', f.image_url
                    )
                    order by f.sort, f.name
                  )
                  from public.flavors f
                  join public.stock s
                    on s.flavor_id = f.id
                   and s.size_id = i.size_id
                   and s.type = i.type
                  where f.active is not false
                    and f.id <> i.flavor_id
                    and coalesce(s.in_stock, false)
                    and (s.on_hand is null or s.on_hand >= i.qty)
                ), '[]'::jsonb)
              end
          )
          order by i.id
        )
        from public.order_items i
        where i.order_id = o.id
      ), '[]'::jsonb),
    'changes',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'old_flavor', c.old_flavor_name,
            'new_flavor', c.new_flavor_name,
            'size', c.size_label,
            'type', c.type,
            'qty', c.qty,
            'changed_at', c.changed_at
          )
          order by c.changed_at desc
        )
        from public.order_item_changes c
        where c.order_id = o.id
      ), '[]'::jsonb)
  )
  into v_result
  from public.orders o
  left join public.market_dates md
    on md.id = o.market_date_id
  left join public.venues ven
    on ven.id = md.venue_id
  where o.token = p_token;

  if v_result is null then
    raise exception 'Order not found';
  end if;

  return v_result;
end;
$$;

create or replace function public.replace_order_flavor(p_token uuid,p_order_item_id uuid,p_new_flavor_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  o public.orders%rowtype;
  i public.order_items%rowtype;
  f public.flavors%rowtype;
  s public.stock%rowtype;
  v_minutes int := coalesce((select value::int from public.settings where key='change_minutes'),30);
begin
  select * into o from public.orders where token=p_token for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status='cancelled' then raise exception 'This order is cancelled and cannot be changed.'; end if;
  if now()>o.placed_at+(v_minutes||' minutes')::interval then raise exception 'The 30-minute order-change window has closed. Contact NectarFusions for help.'; end if;

  select * into i from public.order_items where id=p_order_item_id and order_id=o.id for update;
  if i.id is null then raise exception 'That jar could not be found on this order.'; end if;
  if i.flavor_id=p_new_flavor_id then return public.get_order(p_token); end if;

  select * into f from public.flavors where id=p_new_flavor_id and active is not false;
  if f.id is null then raise exception 'That replacement flavor is not available.'; end if;

  perform 1 from public.stock x where x.size_id=i.size_id and x.type=i.type
    and x.flavor_id in (i.flavor_id,p_new_flavor_id) order by x.flavor_id for update;
  select * into s from public.stock where flavor_id=p_new_flavor_id and size_id=i.size_id and type=i.type;
  if s.flavor_id is null or not coalesce(s.in_stock,false) then raise exception 'That replacement flavor is no longer available.'; end if;
  if s.on_hand is not null and s.on_hand<i.qty then raise exception 'There are not enough jars of that replacement flavor available.'; end if;

  update public.stock set on_hand=case when on_hand is null then null else on_hand+i.qty end,in_stock=true
  where flavor_id=i.flavor_id and size_id=i.size_id and type=i.type;
  update public.stock set on_hand=case when on_hand is null then null else on_hand-i.qty end,
    in_stock=case when on_hand is null then in_stock else (on_hand-i.qty)>0 end
  where flavor_id=p_new_flavor_id and size_id=i.size_id and type=i.type;

  insert into public.order_item_changes(order_id,order_item_id,old_flavor_id,old_flavor_name,new_flavor_id,new_flavor_name,size_id,size_label,type,qty,unit_cents)
  values(o.id,i.id,i.flavor_id,i.flavor_name,f.id,f.name,i.size_id,i.size_label,i.type,i.qty,i.unit_cents);
  update public.order_items set flavor_id=f.id,flavor_name=f.name where id=i.id;
  update public.orders set last_customer_change_at=now(),updated_at=now() where id=o.id;
  return public.get_order(p_token);
end $$;

revoke all on function public.find_order(text,text) from public;
revoke all on function public.get_order(uuid) from public;
revoke all on function public.replace_order_flavor(uuid,uuid,uuid) from public;
grant execute on function public.find_order(text,text) to anon,authenticated;
grant execute on function public.get_order(uuid) to anon,authenticated;
grant execute on function public.replace_order_flavor(uuid,uuid,uuid) to anon,authenticated;
commit;
