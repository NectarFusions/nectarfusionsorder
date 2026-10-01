
update public.nfos_items i
set preferred_supplier_id = (
      select isp.supplier_id
      from public.nfos_item_suppliers isp
      where isp.item_id=i.id
        and isp.active
        and isp.primary_supplier
      order by isp.created_at
      limit 1
    ),
    updated_at = now()
where i.preferred_supplier_id is null
  and i.active
  and i.item_type in ('material','packaging')
  and exists(
    select 1
    from public.nfos_item_suppliers isp
    where isp.item_id=i.id
      and isp.active
      and isp.primary_supplier
  );

create or replace view public.nfos_supplier_readiness
with (security_invoker=true)
as
select
  i.id as item_id,
  i.sku,
  i.name,
  i.item_type,
  i.stocking_unit,
  i.reorder_point,
  i.target_stock,
  i.preferred_order_qty,
  i.standard_unit_cost,
  coalesce(i.preferred_supplier_id,isp.supplier_id) as supplier_id,
  s.name as supplier_name,
  isp.supplier_sku,
  isp.lead_time_days,
  isp.minimum_order_qty,
  isp.order_increment,
  isp.last_unit_cost,
  case
    when coalesce(i.preferred_supplier_id,isp.supplier_id) is null then 'supplier_missing'
    when isp.id is null then 'supplier_terms_missing'
    when isp.lead_time_days is null then 'lead_time_missing'
    when coalesce(isp.last_unit_cost,i.standard_unit_cost) is null then 'cost_missing'
    else 'ready'
  end as readiness_status,
  array_remove(array[
    case when coalesce(i.preferred_supplier_id,isp.supplier_id) is null then 'supplier' end,
    case when coalesce(i.preferred_supplier_id,isp.supplier_id) is not null and isp.id is null then 'supplier terms' end,
    case when isp.id is not null and isp.lead_time_days is null then 'lead time' end,
    case when coalesce(isp.last_unit_cost,i.standard_unit_cost) is null then 'unit cost' end
  ],null) as missing_fields
from public.nfos_items i
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
left join public.nfos_suppliers s
  on s.id=coalesce(i.preferred_supplier_id,isp.supplier_id)
where i.active
  and i.item_type in ('material','packaging');

revoke all on table public.nfos_supplier_readiness from anon;
grant select on table public.nfos_supplier_readiness to authenticated;

create or replace function public.nfos_set_item_supplier_terms(
  p_item_id uuid,
  p_supplier_id uuid,
  p_lead_time_days integer default null,
  p_minimum_order_qty numeric default null,
  p_order_increment numeric default null,
  p_unit_cost numeric default null,
  p_supplier_sku text default null,
  p_set_preferred boolean default true,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_item public.nfos_items%rowtype;
  v_supplier public.nfos_suppliers%rowtype;
  v_rel public.nfos_item_suppliers%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_item
  from public.nfos_items
  where id=p_item_id and active;

  if v_item.id is null then raise exception 'Active item not found.'; end if;
  if v_item.item_type not in ('material','packaging') then
    raise exception 'Supplier terms apply only to materials and packaging.';
  end if;

  select * into v_supplier
  from public.nfos_suppliers
  where id=p_supplier_id and active;

  if v_supplier.id is null then raise exception 'Active supplier not found.'; end if;

  if p_lead_time_days is not null and p_lead_time_days < 0 then
    raise exception 'Lead time cannot be negative.';
  end if;
  if p_minimum_order_qty is not null and p_minimum_order_qty < 0 then
    raise exception 'Minimum order quantity cannot be negative.';
  end if;
  if p_order_increment is not null and p_order_increment <= 0 then
    raise exception 'Order increment must be greater than zero.';
  end if;
  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'Unit cost cannot be negative.';
  end if;

  if coalesce(p_set_preferred,true) then
    update public.nfos_item_suppliers
    set primary_supplier=false,
        updated_at=now()
    where item_id=p_item_id
      and supplier_id<>p_supplier_id
      and primary_supplier;

    update public.nfos_items
    set preferred_supplier_id=p_supplier_id,
        standard_unit_cost=coalesce(p_unit_cost,standard_unit_cost),
        updated_at=now()
    where id=p_item_id;
  elsif p_unit_cost is not null and v_item.standard_unit_cost is null then
    update public.nfos_items
    set standard_unit_cost=p_unit_cost,
        updated_at=now()
    where id=p_item_id;
  end if;

  insert into public.nfos_item_suppliers(
    item_id,supplier_id,supplier_sku,lead_time_days,
    minimum_order_qty,order_increment,last_unit_cost,
    primary_supplier,active,notes
  )
  values(
    p_item_id,p_supplier_id,nullif(btrim(p_supplier_sku),''),
    p_lead_time_days,p_minimum_order_qty,p_order_increment,p_unit_cost,
    coalesce(p_set_preferred,true),true,nullif(btrim(p_notes),'')
  )
  on conflict(item_id,supplier_id) do update
  set supplier_sku=coalesce(excluded.supplier_sku,public.nfos_item_suppliers.supplier_sku),
      lead_time_days=coalesce(excluded.lead_time_days,public.nfos_item_suppliers.lead_time_days),
      minimum_order_qty=coalesce(excluded.minimum_order_qty,public.nfos_item_suppliers.minimum_order_qty),
      order_increment=coalesce(excluded.order_increment,public.nfos_item_suppliers.order_increment),
      last_unit_cost=coalesce(excluded.last_unit_cost,public.nfos_item_suppliers.last_unit_cost),
      primary_supplier=case when coalesce(p_set_preferred,true) then true else public.nfos_item_suppliers.primary_supplier end,
      active=true,
      notes=coalesce(excluded.notes,public.nfos_item_suppliers.notes),
      updated_at=now()
  returning * into v_rel;

  return jsonb_build_object(
    'item_id',p_item_id,
    'supplier_id',p_supplier_id,
    'supplier_name',v_supplier.name,
    'lead_time_days',v_rel.lead_time_days,
    'minimum_order_qty',v_rel.minimum_order_qty,
    'order_increment',v_rel.order_increment,
    'unit_cost',v_rel.last_unit_cost,
    'preferred',v_rel.primary_supplier
  );
end;
$$;

revoke all on function public.nfos_set_item_supplier_terms(uuid,uuid,integer,numeric,numeric,numeric,text,boolean,text)
  from public,anon;
grant execute on function public.nfos_set_item_supplier_terms(uuid,uuid,integer,numeric,numeric,numeric,text,boolean,text)
  to authenticated;

create or replace view public.nfos_item_production_need_dates
with (security_invoker=true)
as
select
  d.item_id,
  min(coalesce(po.due_date,po.requested_date,current_date)) as earliest_need_date,
  count(distinct d.production_order_id)::integer as production_order_count,
  string_agg(distinct po.order_no,', ' order by po.order_no) as production_orders
from public.nfos_production_demand_detail d
join public.nfos_production_orders po on po.id=d.production_order_id
where d.quantity_required > 0
  and po.status in ('planned','in_progress')
group by d.item_id;

revoke all on table public.nfos_item_production_need_dates from anon;
grant select on table public.nfos_item_production_need_dates to authenticated;

create or replace view public.nfos_purchase_timing
with (security_invoker=true)
as
select
  pr.item_id,
  pr.item_type,
  pr.sku,
  pr.name,
  pr.stocking_unit,
  pr.planning_on_hand,
  pr.incoming_quantity,
  pr.open_production_demand,
  pr.projected_after_production,
  pr.reorder_point,
  pr.target_stock,
  pr.suggested_order_quantity,
  pr.estimated_unit_cost,
  pr.estimated_line_cost,
  pr.supplier_id,
  pr.supplier_name,
  sr.supplier_sku,
  sr.lead_time_days,
  sr.minimum_order_qty,
  sr.order_increment,
  nd.earliest_need_date,
  nd.production_order_count,
  nd.production_orders,
  case
    when pr.open_production_demand > 0 and sr.lead_time_days is not null
      then nd.earliest_need_date - sr.lead_time_days
    when pr.open_production_demand = 0
      then current_date
    else null
  end as order_by_date,
  case
    when pr.supplier_id is null then 'supplier_missing'
    when sr.lead_time_days is null and pr.open_production_demand > 0 then 'lead_time_missing'
    when pr.estimated_unit_cost is null then 'cost_missing'
    when pr.open_production_demand = 0 then 'order_now'
    when (nd.earliest_need_date - sr.lead_time_days) < current_date then 'overdue'
    when (nd.earliest_need_date - sr.lead_time_days) = current_date then 'due_today'
    when (nd.earliest_need_date - sr.lead_time_days) <= current_date + 3 then 'due_soon'
    else 'scheduled'
  end as timing_status,
  pr.recommendation_reason
from public.nfos_purchase_recommendations pr
left join public.nfos_supplier_readiness sr on sr.item_id=pr.item_id
left join public.nfos_item_production_need_dates nd on nd.item_id=pr.item_id;

revoke all on table public.nfos_purchase_timing from anon;
grant select on table public.nfos_purchase_timing to authenticated;

create or replace view public.nfos_supplier_purchase_summary
with (security_invoker=true)
as
select
  pt.supplier_id,
  pt.supplier_name,
  count(*)::integer as recommended_item_count,
  sum(pt.suggested_order_quantity)::numeric(14,4) as total_units_to_order,
  sum(pt.estimated_line_cost)::numeric(14,2) as estimated_total_cost,
  min(pt.order_by_date) as earliest_order_by_date,
  bool_or(pt.timing_status='overdue') as has_overdue,
  bool_or(pt.timing_status='due_today') as has_due_today,
  bool_or(pt.timing_status='due_soon') as has_due_soon,
  count(*) filter (where pt.timing_status='lead_time_missing')::integer as missing_lead_times,
  count(*) filter (where pt.timing_status='cost_missing')::integer as missing_costs
from public.nfos_purchase_timing pt
where pt.supplier_id is not null
group by pt.supplier_id,pt.supplier_name;

revoke all on table public.nfos_supplier_purchase_summary from anon;
grant select on table public.nfos_supplier_purchase_summary to authenticated;
