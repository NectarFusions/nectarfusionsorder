-- NectarFusions confirmation lookup repair.
-- Fixes the get_order variable/table-alias collision.
-- Keeps confirmations viewable after the change window closes.
-- Reports whether the order's single online change has already been used.

begin;

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

revoke all on function public.get_order(uuid) from public;
grant execute on function public.get_order(uuid) to anon, authenticated;

commit;
