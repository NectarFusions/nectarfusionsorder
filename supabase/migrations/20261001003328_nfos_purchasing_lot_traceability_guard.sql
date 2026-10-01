
drop view if exists public.nfos_purchase_order_line_overview;
create view public.nfos_purchase_order_line_overview
with (security_invoker=true)
as
select
  pol.id,
  pol.purchase_order_id,
  p.po_number,
  p.status as po_status,
  p.supplier_id,
  s.name as supplier_name,
  pol.item_id,
  i.sku,
  i.name as item_name,
  i.item_type,
  i.track_lots,
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
join public.nfos_suppliers s on s.id=p.supplier_id
join public.nfos_items i on i.id=pol.item_id;

revoke all on table public.nfos_purchase_order_line_overview from anon;
grant select on table public.nfos_purchase_order_line_overview to authenticated;

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
  v_item public.nfos_items%rowtype;
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

  select * into v_item
  from public.nfos_items
  where id=v_line.item_id;

  select * into v_po
  from public.nfos_purchase_orders
  where id=v_line.purchase_order_id
  for update;

  if v_po.status not in ('ordered','partial') then
    raise exception 'Purchase order must be ordered before it can be received.';
  end if;

  if v_item.track_lots and nullif(btrim(p_lot_code),'') is null then
    raise exception 'Enter the actual lot number before receiving tracked item %.',v_item.name;
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

revoke all on function public.nfos_receive_purchase_order_line(uuid,numeric,text,text,timestamptz,text) from public,anon;
grant execute on function public.nfos_receive_purchase_order_line(uuid,numeric,text,text,timestamptz,text) to authenticated;
