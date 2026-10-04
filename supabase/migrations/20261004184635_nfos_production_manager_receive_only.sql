-- Narrow Production Manager inventory access to receiving only.
-- Inventory Operator / Operations Manager keep broader inventory.manage permissions.

insert into public.nfos_role_permissions(role, permission, description)
values
  ('owner','inventory.receive','Receive inventory'),
  ('operations_manager','inventory.receive','Receive inventory'),
  ('inventory_operator','inventory.receive','Receive inventory'),
  ('production_operator','inventory.receive','Receive inventory needed for assigned production work')
on conflict (role, permission) do update
set description = excluded.description;

delete from public.nfos_role_permissions
where role='production_operator'
  and permission='inventory.manage';

create or replace function nfos_private.employee_inventory_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, nfos_private
as $$
declare
  v_member uuid;
  v_inventory jsonb;
  v_locations jsonb;
  v_lots jsonb;
  v_suppliers jsonb;
begin
  v_member:=nfos_private.current_member_id('inventory.receive');

  select coalesce(jsonb_agg(to_jsonb(x) order by x.item_type,x.name),'[]'::jsonb)
  into v_inventory
  from(
    select
      s.item_id,s.item_type,s.sku,s.name,s.category,s.size_label,s.stocking_unit,
      s.company_on_hand,s.planning_on_hand,s.reorder_point,s.target_stock,
      i.track_lots,i.preferred_supplier_id
    from public.nfos_inventory_summary s
    join public.nfos_items i on i.id=s.item_id
    where s.active
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
  into v_locations
  from(
    select id,code,name,location_type,counts_as_company_inventory,available_to_sell_online
    from public.nfos_locations
    where active
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.item_name,x.lot_code),'[]'::jsonb)
  into v_lots
  from(
    select
      lb.item_id,i.name as item_name,i.stocking_unit,lb.lot_id,l.lot_code,l.status,
      lb.location_id,loc.name as location_name,lb.on_hand,l.supplier_id,l.supplier_lot_code
    from public.nfos_lot_balances lb
    join public.nfos_lots l on l.id=lb.lot_id
    join public.nfos_items i on i.id=lb.item_id
    join public.nfos_locations loc on loc.id=lb.location_id
    where lb.on_hand>0
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb)
  into v_suppliers
  from(
    select id,name,vendor_code,category from public.nfos_suppliers where active
  ) x;

  return jsonb_build_object(
    'inventory',v_inventory,'locations',v_locations,'lots',v_lots,'suppliers',v_suppliers
  );
end;
$$;

create or replace function nfos_private.employee_receive_item(
  p_item_id uuid,
  p_location_id uuid,
  p_quantity numeric,
  p_lot_code text default null,
  p_supplier_id uuid default null,
  p_supplier_lot_code text default null,
  p_total_cost numeric default null,
  p_received_at timestamptz default now(),
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nfos_private
as $$
declare
  v_member uuid;
  v_lot_id uuid;
  v_lot_code text;
  v_tx_id uuid;
  v_unit_cost numeric;
  v_track_lots boolean;
begin
  v_member:=nfos_private.current_member_id('inventory.receive');

  if p_quantity is null or p_quantity<=0 then
    raise exception 'Quantity must be greater than zero.';
  end if;

  select track_lots into v_track_lots
  from public.nfos_items
  where id=p_item_id and active;

  if not found then raise exception 'Active item not found.'; end if;

  if not exists(select 1 from public.nfos_locations where id=p_location_id and active) then
    raise exception 'Active receiving location is required.';
  end if;

  if coalesce(v_track_lots,false) then
    if nullif(btrim(p_lot_code),'') is null then
      raise exception 'Enter the actual lot number for this tracked item.';
    end if;

    v_lot_code:=btrim(p_lot_code);

    insert into public.nfos_lots(
      item_id,lot_code,supplier_id,supplier_lot_code,received_at,
      received_quantity,received_total_cost,notes
    )
    values(
      p_item_id,v_lot_code,p_supplier_id,nullif(btrim(p_supplier_lot_code),''),
      coalesce(p_received_at,now()),p_quantity,p_total_cost,p_notes
    )
    on conflict(item_id,lot_code) do update
    set supplier_id=coalesce(excluded.supplier_id,public.nfos_lots.supplier_id),
        supplier_lot_code=coalesce(excluded.supplier_lot_code,public.nfos_lots.supplier_lot_code),
        received_quantity=coalesce(public.nfos_lots.received_quantity,0)+excluded.received_quantity,
        received_total_cost=coalesce(public.nfos_lots.received_total_cost,0)+coalesce(excluded.received_total_cost,0),
        updated_at=now()
    returning id into v_lot_id;
  end if;

  if p_total_cost is not null then
    v_unit_cost:=p_total_cost/p_quantity;
  end if;

  v_tx_id:=nfos_private.record_inventory_movement(
    p_item_id,p_quantity,null,p_location_id,'receipt',v_lot_id,
    'receiving',null,v_unit_cost,p_notes,p_received_at,'employee_receive'
  );

  return jsonb_build_object(
    'transaction_id',v_tx_id,
    'lot_id',v_lot_id,
    'lot_code',v_lot_code
  );
end;
$$;
