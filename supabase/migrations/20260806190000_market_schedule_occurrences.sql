-- Treat each scheduled market date as its own occurrence while preserving
-- historical order links. Venue rows remain reusable defaults.

begin;

alter table public.market_dates
  add column if not exists active boolean not null default true;

alter table public.market_dates
  add column if not exists where_at text;

alter table public.market_dates
  add column if not exists hours text;

comment on column public.market_dates.active is
  'Whether this market occurrence is visible in the public schedule. Historical orders may remain linked after removal.';

comment on column public.market_dates.where_at is
  'Location snapshot or override for this specific market occurrence.';

comment on column public.market_dates.hours is
  'Hours snapshot or override for this specific market occurrence.';

-- Snapshot current venue defaults into every existing occurrence so later
-- edits to the venue template do not rewrite previously scheduled dates.
update public.market_dates md
set
  where_at = coalesce(md.where_at, v.where_at),
  hours = coalesce(md.hours, v.hours)
from public.venues v
where v.id = md.venue_id
  and (md.where_at is null or md.hours is null);

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
    'market_hours', coalesce(md.hours, ven.hours),
    'market_address', coalesce(
      md.where_at,
      ven.where_at,
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
