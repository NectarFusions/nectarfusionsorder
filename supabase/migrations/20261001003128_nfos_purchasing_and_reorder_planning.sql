
create sequence if not exists public.nfos_purchase_order_seq;

create table if not exists public.nfos_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique default (
    'PO-' || to_char(current_date,'YYYYMMDD') || '-' ||
    lpad(nextval('public.nfos_purchase_order_seq')::text,5,'0')
  ),
  supplier_id uuid not null references public.nfos_suppliers(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','ordered','partial','received','cancelled')),
  destination_location_id uuid not null references public.nfos_locations(id) on delete restrict,
  order_date date,
  expected_date date,
  ordered_at timestamptz,
  ordered_by uuid,
  received_at timestamptz,
  received_by uuid,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nfos_purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.nfos_purchase_orders(id) on delete cascade,
  item_id uuid not null references public.nfos_items(id) on delete restrict,
  quantity_ordered numeric(14,4) not null check (quantity_ordered > 0),
  unit text not null,
  unit_cost numeric(14,6) check (unit_cost is null or unit_cost >= 0),
  supplier_sku text,
  quantity_received numeric(14,4) not null default 0 check (quantity_received >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(purchase_order_id,item_id)
);

create table if not exists public.nfos_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_line_id uuid not null references public.nfos_purchase_order_lines(id) on delete restrict,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null,
  lot_id uuid references public.nfos_lots(id) on delete set null,
  inventory_transaction_id uuid references public.nfos_inventory_transactions(id) on delete restrict,
  received_at timestamptz not null default now(),
  received_by uuid,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists nfos_purchase_orders_supplier_idx
  on public.nfos_purchase_orders(supplier_id,status);

create index if not exists nfos_purchase_order_lines_item_idx
  on public.nfos_purchase_order_lines(item_id);

create index if not exists nfos_purchase_receipts_line_idx
  on public.nfos_purchase_receipts(purchase_order_line_id);

create index if not exists nfos_purchase_receipts_lot_idx
  on public.nfos_purchase_receipts(lot_id)
  where lot_id is not null;

alter table public.nfos_purchase_orders enable row level security;
alter table public.nfos_purchase_order_lines enable row level security;
alter table public.nfos_purchase_receipts enable row level security;

revoke all on table public.nfos_purchase_orders from anon;
revoke all on table public.nfos_purchase_order_lines from anon;
revoke all on table public.nfos_purchase_receipts from anon;

grant select,insert,update,delete on table public.nfos_purchase_orders to authenticated;
grant select,insert,update,delete on table public.nfos_purchase_order_lines to authenticated;
grant select,insert on table public.nfos_purchase_receipts to authenticated;

drop policy if exists nfos_purchase_orders_admin_all on public.nfos_purchase_orders;
create policy nfos_purchase_orders_admin_all
on public.nfos_purchase_orders
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_purchase_order_lines_admin_all on public.nfos_purchase_order_lines;
create policy nfos_purchase_order_lines_admin_all
on public.nfos_purchase_order_lines
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_purchase_receipts_admin_select_insert on public.nfos_purchase_receipts;
create policy nfos_purchase_receipts_admin_select_insert
on public.nfos_purchase_receipts
for select to authenticated
using ((select public.nf_is_admin()));

drop policy if exists nfos_purchase_receipts_admin_insert on public.nfos_purchase_receipts;
create policy nfos_purchase_receipts_admin_insert
on public.nfos_purchase_receipts
for insert to authenticated
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_purchase_orders_set_updated_at on public.nfos_purchase_orders;
create trigger nfos_purchase_orders_set_updated_at
before update on public.nfos_purchase_orders
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_purchase_order_lines_set_updated_at on public.nfos_purchase_order_lines;
create trigger nfos_purchase_order_lines_set_updated_at
before update on public.nfos_purchase_order_lines
for each row execute function public.nfos_set_updated_at();

create or replace view public.nfos_open_purchase_quantities
with (security_invoker=true)
as
select
  l.item_id,
  sum(greatest(l.quantity_ordered-l.quantity_received,0))::numeric(14,4) as incoming_quantity
from public.nfos_purchase_order_lines l
join public.nfos_purchase_orders p on p.id=l.purchase_order_id
where p.status in ('ordered','partial')
group by l.item_id;

revoke all on table public.nfos_open_purchase_quantities from anon;
grant select on table public.nfos_open_purchase_quantities to authenticated;

create or replace view public.nfos_reorder_recommendations
with (security_invoker=true)
as
with base as (
  select
    s.item_id,
    s.item_type,
    s.sku,
    s.name,
    s.category,
    s.size_label,
    s.stocking_unit,
    s.reorder_point,
    s.target_stock,
    s.preferred_order_qty,
    s.planning_on_hand,
    coalesce(op.incoming_quantity,0)::numeric as incoming_quantity,
    coalesce(i.preferred_supplier_id,isp.supplier_id) as supplier_id,
    sup.name as supplier_name,
    coalesce(isp.minimum_order_qty,0)::numeric as minimum_order_qty,
    coalesce(isp.order_increment,0)::numeric as order_increment,
    coalesce(isp.lead_time_days,0) as lead_time_days,
    coalesce(isp.last_unit_cost,i.standard_unit_cost) as estimated_unit_cost
  from public.nfos_inventory_summary s
  join public.nfos_items i on i.id=s.item_id
  left join public.nfos_open_purchase_quantities op on op.item_id=s.item_id
  left join lateral (
    select x.*
    from public.nfos_item_suppliers x
    where x.item_id=i.id
      and x.active
    order by
      (x.supplier_id=i.preferred_supplier_id) desc,
      x.primary_supplier desc,
      x.created_at
    limit 1
  ) isp on true
  left join public.nfos_suppliers sup
    on sup.id=coalesce(i.preferred_supplier_id,isp.supplier_id)
  where s.active
    and s.item_type in ('material','packaging')
    and s.reorder_point is not null
),
calc as (
  select *,
    (planning_on_hand+incoming_quantity)::numeric(14,4) as projected_on_hand,
    greatest(
      coalesce(target_stock,preferred_order_qty,reorder_point,0)
      -(planning_on_hand+incoming_quantity),
      0
    )::numeric as raw_suggested_quantity
  from base
),
rounded as (
  select *,
    case
      when raw_suggested_quantity <= 0 then 0::numeric
      else
        case
          when order_increment > 0 then
            ceil(
              greatest(raw_suggested_quantity,minimum_order_qty)
              / order_increment
            ) * order_increment
          else greatest(raw_suggested_quantity,minimum_order_qty)
        end
    end::numeric(14,4) as suggested_order_quantity
  from calc
)
select
  item_id,item_type,sku,name,category,size_label,stocking_unit,
  reorder_point,target_stock,preferred_order_qty,
  planning_on_hand,incoming_quantity,projected_on_hand,
  supplier_id,supplier_name,minimum_order_qty,order_increment,lead_time_days,
  estimated_unit_cost,suggested_order_quantity,
  (suggested_order_quantity*coalesce(estimated_unit_cost,0))::numeric(14,2) as estimated_line_cost,
  case when supplier_id is null then 'supplier_needed' else 'ready' end as recommendation_status
from rounded
where projected_on_hand <= reorder_point
  and suggested_order_quantity > 0;

revoke all on table public.nfos_reorder_recommendations from anon;
grant select on table public.nfos_reorder_recommendations to authenticated;

create or replace view public.nfos_purchase_order_overview
with (security_invoker=true)
as
select
  p.id,
  p.po_number,
  p.supplier_id,
  s.name as supplier_name,
  p.status,
  p.destination_location_id,
  l.name as destination_location_name,
  p.order_date,
  p.expected_date,
  p.ordered_at,
  p.received_at,
  p.notes,
  p.created_at,
  count(pol.id)::integer as line_count,
  coalesce(sum(pol.quantity_ordered*coalesce(pol.unit_cost,0)),0)::numeric(14,2) as estimated_total,
  coalesce(sum(greatest(pol.quantity_ordered-pol.quantity_received,0)),0)::numeric(14,4) as units_open
from public.nfos_purchase_orders p
join public.nfos_suppliers s on s.id=p.supplier_id
join public.nfos_locations l on l.id=p.destination_location_id
left join public.nfos_purchase_order_lines pol on pol.purchase_order_id=p.id
group by p.id,s.name,l.name;

revoke all on table public.nfos_purchase_order_overview from anon;
grant select on table public.nfos_purchase_order_overview to authenticated;

create or replace view public.nfos_purchase_order_line_overview
with (security_invoker=true)
as
select
  pol.id,
  pol.purchase_order_id,
  p.po_number,
  p.status as po_status,
  pol.item_id,
  i.sku,
  i.name as item_name,
  pol.quantity_ordered,
  pol.quantity_received,
  greatest(pol.quantity_ordered-pol.quantity_received,0)::numeric(14,4) as quantity_open,
  pol.unit,
  pol.unit_cost,
  pol.supplier_sku,
  (pol.quantity_ordered*coalesce(pol.unit_cost,0))::numeric(14,2) as estimated_line_total,
  pol.notes
from public.nfos_purchase_order_lines pol
join public.nfos_purchase_orders p on p.id=pol.purchase_order_id
join public.nfos_items i on i.id=pol.item_id;

revoke all on table public.nfos_purchase_order_line_overview from anon;
grant select on table public.nfos_purchase_order_line_overview to authenticated;

create or replace function public.nfos_create_purchase_order(
  p_supplier_id uuid,
  p_expected_date date default null,
  p_destination_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_location uuid;
  v_po public.nfos_purchase_orders%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if not exists(
    select 1 from public.nfos_suppliers
    where id=p_supplier_id and active
  ) then
    raise exception 'An active supplier is required.';
  end if;

  v_location := p_destination_location_id;
  if v_location is null then
    select id into v_location
    from public.nfos_locations
    where code='MAIN' and active
    limit 1;
  end if;

  if v_location is null then raise exception 'Destination location is required.'; end if;

  insert into public.nfos_purchase_orders(
    supplier_id,destination_location_id,expected_date,notes,created_by
  )
  values(
    p_supplier_id,v_location,p_expected_date,nullif(btrim(p_notes),''),auth.uid()
  )
  returning * into v_po;

  return jsonb_build_object(
    'id',v_po.id,
    'po_number',v_po.po_number,
    'status',v_po.status
  );
end;
$$;

create or replace function public.nfos_add_purchase_order_line(
  p_purchase_order_id uuid,
  p_item_id uuid,
  p_quantity numeric default null,
  p_unit_cost numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_po public.nfos_purchase_orders%rowtype;
  v_item public.nfos_items%rowtype;
  v_supplier_item public.nfos_item_suppliers%rowtype;
  v_qty numeric;
  v_cost numeric;
  v_line public.nfos_purchase_order_lines%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_po
  from public.nfos_purchase_orders
  where id=p_purchase_order_id
  for update;

  if v_po.id is null then raise exception 'Purchase order not found.'; end if;
  if v_po.status <> 'draft' then raise exception 'Lines can only be changed on a draft purchase order.'; end if;

  select * into v_item
  from public.nfos_items
  where id=p_item_id and active;

  if v_item.id is null then raise exception 'Active item not found.'; end if;
  if v_item.item_type not in ('material','packaging') then
    raise exception 'Purchase orders can only contain materials or packaging.';
  end if;

  select * into v_supplier_item
  from public.nfos_item_suppliers
  where item_id=p_item_id
    and supplier_id=v_po.supplier_id
    and active
  order by primary_supplier desc,created_at
  limit 1;

  if p_quantity is null then
    select suggested_order_quantity into v_qty
    from public.nfos_reorder_recommendations
    where item_id=p_item_id
      and supplier_id=v_po.supplier_id;
  else
    v_qty := p_quantity;
  end if;

  if v_qty is null or v_qty <= 0 then
    raise exception 'A positive order quantity is required.';
  end if;

  v_cost := coalesce(
    p_unit_cost,
    v_supplier_item.last_unit_cost,
    v_item.standard_unit_cost
  );

  insert into public.nfos_purchase_order_lines(
    purchase_order_id,item_id,quantity_ordered,unit,unit_cost,supplier_sku,notes
  )
  values(
    p_purchase_order_id,p_item_id,v_qty,v_item.stocking_unit,v_cost,
    v_supplier_item.supplier_sku,nullif(btrim(p_notes),'')
  )
  on conflict(purchase_order_id,item_id) do update
  set quantity_ordered=excluded.quantity_ordered,
      unit=excluded.unit,
      unit_cost=excluded.unit_cost,
      supplier_sku=coalesce(excluded.supplier_sku,public.nfos_purchase_order_lines.supplier_sku),
      notes=excluded.notes,
      updated_at=now()
  returning * into v_line;

  return jsonb_build_object(
    'id',v_line.id,
    'item_id',v_line.item_id,
    'quantity_ordered',v_line.quantity_ordered,
    'unit',v_line.unit,
    'unit_cost',v_line.unit_cost
  );
end;
$$;

create or replace function public.nfos_create_reorder_po(
  p_supplier_id uuid,
  p_expected_date date default null,
  p_destination_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_po_json jsonb;
  v_po_id uuid;
  v_rec record;
  v_count integer := 0;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if not exists(
    select 1 from public.nfos_reorder_recommendations
    where supplier_id=p_supplier_id
  ) then
    raise exception 'There are no current reorder recommendations for this supplier.';
  end if;

  v_po_json := public.nfos_create_purchase_order(
    p_supplier_id,p_expected_date,p_destination_location_id,p_notes
  );
  v_po_id := (v_po_json->>'id')::uuid;

  for v_rec in
    select item_id,suggested_order_quantity,estimated_unit_cost
    from public.nfos_reorder_recommendations
    where supplier_id=p_supplier_id
    order by name
  loop
    perform public.nfos_add_purchase_order_line(
      v_po_id,
      v_rec.item_id,
      v_rec.suggested_order_quantity,
      v_rec.estimated_unit_cost,
      'Created from NFOS reorder recommendation.'
    );
    v_count := v_count+1;
  end loop;

  return jsonb_build_object(
    'id',v_po_id,
    'po_number',(select po_number from public.nfos_purchase_orders where id=v_po_id),
    'status','draft',
    'line_count',v_count
  );
end;
$$;

create or replace function public.nfos_submit_purchase_order(
  p_purchase_order_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_po public.nfos_purchase_orders%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_po
  from public.nfos_purchase_orders
  where id=p_purchase_order_id
  for update;

  if v_po.id is null then raise exception 'Purchase order not found.'; end if;
  if v_po.status <> 'draft' then raise exception 'Only draft purchase orders can be submitted.'; end if;
  if not exists(
    select 1 from public.nfos_purchase_order_lines
    where purchase_order_id=p_purchase_order_id
  ) then
    raise exception 'Add at least one line before submitting the purchase order.';
  end if;

  update public.nfos_purchase_orders
  set status='ordered',
      order_date=current_date,
      ordered_at=now(),
      ordered_by=auth.uid()
  where id=p_purchase_order_id;

  return jsonb_build_object(
    'id',p_purchase_order_id,
    'po_number',v_po.po_number,
    'status','ordered'
  );
end;
$$;

create or replace function public.nfos_receive_purchase_order_line(
  p_purchase_order_line_id uuid,
  p_quantity numeric,
  p_lot_code text default null,
  p_supplier_lot_code text default null,
  p_received_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_line public.nfos_purchase_order_lines%rowtype;
  v_po public.nfos_purchase_orders%rowtype;
  v_remaining numeric;
  v_receive_json jsonb;
  v_tx uuid;
  v_lot uuid;
  v_total_cost numeric;
  v_open_lines integer;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Receipt quantity must be greater than zero.'; end if;

  select * into v_line
  from public.nfos_purchase_order_lines
  where id=p_purchase_order_line_id
  for update;

  if v_line.id is null then raise exception 'Purchase order line not found.'; end if;

  select * into v_po
  from public.nfos_purchase_orders
  where id=v_line.purchase_order_id
  for update;

  if v_po.status not in ('ordered','partial') then
    raise exception 'Purchase order must be ordered before it can be received.';
  end if;

  v_remaining := v_line.quantity_ordered-v_line.quantity_received;
  if p_quantity > v_remaining then
    raise exception 'Receipt quantity % exceeds remaining ordered quantity %.',p_quantity,v_remaining;
  end if;

  v_total_cost := case
    when v_line.unit_cost is null then null
    else p_quantity*v_line.unit_cost
  end;

  v_receive_json := public.nfos_receive_item(
    v_line.item_id,
    v_po.destination_location_id,
    p_quantity,
    p_lot_code,
    v_po.supplier_id,
    p_supplier_lot_code,
    v_total_cost,
    p_received_at,
    concat_ws(' ', 'Received against ' || v_po.po_number || '.', nullif(btrim(p_notes),''))
  );

  v_tx := nullif(v_receive_json->>'transaction_id','')::uuid;
  v_lot := nullif(v_receive_json->>'lot_id','')::uuid;

  update public.nfos_purchase_order_lines
  set quantity_received=quantity_received+p_quantity
  where id=p_purchase_order_line_id;

  insert into public.nfos_purchase_receipts(
    purchase_order_line_id,quantity,unit,lot_id,inventory_transaction_id,
    received_at,received_by,notes
  )
  values(
    p_purchase_order_line_id,p_quantity,v_line.unit,v_lot,v_tx,
    coalesce(p_received_at,now()),auth.uid(),nullif(btrim(p_notes),'')
  );

  select count(*) into v_open_lines
  from public.nfos_purchase_order_lines
  where purchase_order_id=v_line.purchase_order_id
    and quantity_received < quantity_ordered;

  update public.nfos_purchase_orders
  set status=case when v_open_lines=0 then 'received' else 'partial' end,
      received_at=case when v_open_lines=0 then coalesce(p_received_at,now()) else received_at end,
      received_by=case when v_open_lines=0 then auth.uid() else received_by end
  where id=v_line.purchase_order_id;

  return jsonb_build_object(
    'purchase_order_id',v_line.purchase_order_id,
    'purchase_order_line_id',p_purchase_order_line_id,
    'quantity_received',p_quantity,
    'lot_id',v_lot,
    'inventory_transaction_id',v_tx,
    'po_status',(select status from public.nfos_purchase_orders where id=v_line.purchase_order_id)
  );
end;
$$;

revoke all on function public.nfos_create_purchase_order(uuid,date,uuid,text) from public,anon;
revoke all on function public.nfos_add_purchase_order_line(uuid,uuid,numeric,numeric,text) from public,anon;
revoke all on function public.nfos_create_reorder_po(uuid,date,uuid,text) from public,anon;
revoke all on function public.nfos_submit_purchase_order(uuid) from public,anon;
revoke all on function public.nfos_receive_purchase_order_line(uuid,numeric,text,text,timestamptz,text) from public,anon;

grant execute on function public.nfos_create_purchase_order(uuid,date,uuid,text) to authenticated;
grant execute on function public.nfos_add_purchase_order_line(uuid,uuid,numeric,numeric,text) to authenticated;
grant execute on function public.nfos_create_reorder_po(uuid,date,uuid,text) to authenticated;
grant execute on function public.nfos_submit_purchase_order(uuid) to authenticated;
grant execute on function public.nfos_receive_purchase_order_line(uuid,numeric,text,text,timestamptz,text) to authenticated;
