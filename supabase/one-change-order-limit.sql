-- NectarFusions: enforce one customer flavor change per order.
-- Run once in Supabase SQL Editor.

begin;

create or replace function public.replace_order_flavor(
  p_token uuid,
  p_order_item_id uuid,
  p_new_flavor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.orders%rowtype;
  i public.order_items%rowtype;
  f public.flavors%rowtype;
  s public.stock%rowtype;
  v_minutes int := coalesce(
    (select value::int from public.settings where key='change_minutes'),
    30
  );
begin
  select * into o from public.orders where token=p_token for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status='cancelled' then raise exception 'This order is cancelled and cannot be changed.'; end if;

  if exists (select 1 from public.order_item_changes c where c.order_id=o.id) then
    raise exception 'You can only change your order once. This order has already used its online change. Please contact NectarFusions for help.';
  end if;

  if now()>o.placed_at+(v_minutes||' minutes')::interval then
    raise exception 'The 30-minute order-change window has closed. Contact NectarFusions for help.';
  end if;

  select * into i from public.order_items where id=p_order_item_id and order_id=o.id for update;
  if i.id is null then raise exception 'That jar could not be found on this order.'; end if;
  if i.flavor_id=p_new_flavor_id then return public.get_order(p_token); end if;

  select * into f from public.flavors where id=p_new_flavor_id and active is not false;
  if f.id is null then raise exception 'That replacement flavor is not available.'; end if;

  perform 1 from public.stock x where x.size_id=i.size_id and x.type=i.type
    and x.flavor_id in (i.flavor_id,p_new_flavor_id) order by x.flavor_id for update;

  select * into s from public.stock where flavor_id=p_new_flavor_id and size_id=i.size_id and type=i.type;
  if s.flavor_id is null or not coalesce(s.in_stock,false) then
    raise exception 'That replacement flavor is no longer available.';
  end if;
  if s.on_hand is not null and s.on_hand<i.qty then
    raise exception 'There are not enough jars of that replacement flavor available.';
  end if;

  update public.stock
  set on_hand=case when on_hand is null then null else on_hand+i.qty end,
      in_stock=true
  where flavor_id=i.flavor_id and size_id=i.size_id and type=i.type;

  update public.stock
  set on_hand=case when on_hand is null then null else on_hand-i.qty end,
      in_stock=case when on_hand is null then in_stock else (on_hand-i.qty)>0 end
  where flavor_id=p_new_flavor_id and size_id=i.size_id and type=i.type;

  insert into public.order_item_changes(
    order_id,order_item_id,old_flavor_id,old_flavor_name,new_flavor_id,new_flavor_name,
    size_id,size_label,type,qty,unit_cents
  )
  values(
    o.id,i.id,i.flavor_id,i.flavor_name,f.id,f.name,
    i.size_id,i.size_label,i.type,i.qty,i.unit_cents
  );

  update public.order_items set flavor_id=f.id,flavor_name=f.name where id=i.id;
  update public.orders set last_customer_change_at=now(),updated_at=now() where id=o.id;

  return public.get_order(p_token);
end;
$$;

revoke all on function public.replace_order_flavor(uuid,uuid,uuid) from public;
grant execute on function public.replace_order_flavor(uuid,uuid,uuid) to anon,authenticated;

commit;
