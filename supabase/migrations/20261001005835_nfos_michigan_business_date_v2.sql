
create or replace function public.nfos_business_today()
returns date
language sql
stable
set search_path=public
as $$
  select (now() at time zone 'America/Detroit')::date;
$$;

revoke all on function public.nfos_business_today() from anon;
grant execute on function public.nfos_business_today() to authenticated;

alter table public.nfos_production_orders
  alter column requested_date
  set default (public.nfos_business_today());

create or replace view public.nfos_item_production_need_dates
with (security_invoker=true)
as
select
  d.item_id,
  min(coalesce(po.due_date,po.requested_date,public.nfos_business_today())) as earliest_need_date,
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
      then public.nfos_business_today()
    else null
  end as order_by_date,
  case
    when pr.supplier_id is null then 'supplier_missing'
    when sr.lead_time_days is null and pr.open_production_demand > 0 then 'lead_time_missing'
    when pr.estimated_unit_cost is null then 'cost_missing'
    when pr.open_production_demand = 0 then 'order_now'
    when (nd.earliest_need_date - sr.lead_time_days) < public.nfos_business_today() then 'overdue'
    when (nd.earliest_need_date - sr.lead_time_days) = public.nfos_business_today() then 'due_today'
    when (nd.earliest_need_date - sr.lead_time_days) <= public.nfos_business_today() + 3 then 'due_soon'
    else 'scheduled'
  end as timing_status,
  pr.recommendation_reason
from public.nfos_purchase_recommendations pr
left join public.nfos_supplier_readiness sr on sr.item_id=pr.item_id
left join public.nfos_item_production_need_dates nd on nd.item_id=pr.item_id;

revoke all on table public.nfos_purchase_timing from anon;
grant select on table public.nfos_purchase_timing to authenticated;

create or replace view public.nfos_operations_calendar
with (security_invoker=true)
as
select
  'purchase:' || pt.item_id::text as event_key,
  pt.order_by_date as event_date,
  'purchase_order_by'::text as event_type,
  case
    when pt.timing_status='overdue' then 'critical'
    when pt.timing_status in ('due_today','due_soon') then 'high'
    else 'normal'
  end as priority,
  'Order ' || pt.name as title,
  concat_ws(
    ' · ',
    pt.suggested_order_quantity::text || ' ' || pt.stocking_unit,
    coalesce(pt.supplier_name,'Supplier needed'),
    case when pt.production_orders is not null then 'For ' || pt.production_orders end
  ) as detail,
  pt.item_id as source_id,
  'Purchasing'::text as route,
  pt.timing_status as status
from public.nfos_purchase_timing pt
where pt.order_by_date is not null

union all

select
  'production:' || pq.id::text,
  pq.due_date,
  'production_due',
  case
    when pq.due_date < public.nfos_business_today() then 'critical'
    when pq.due_date <= public.nfos_business_today()+3 then 'high'
    else 'normal'
  end,
  'Production due: ' || pq.recipe_name,
  concat_ws(
    ' · ',
    pq.order_no,
    pq.planned_quantity::text || ' ' || pq.planned_unit,
    initcap(pq.planned_texture)
  ),
  pq.id,
  'Production',
  case
    when pq.due_date < public.nfos_business_today() then 'overdue'
    when pq.due_date=public.nfos_business_today() then 'due_today'
    else 'scheduled'
  end
from public.nfos_production_queue pq
where pq.status in ('planned','in_progress')
  and pq.due_date is not null

union all

select
  'release:' || b.id::text,
  (b.release_not_before at time zone 'America/Detroit')::date,
  'batch_release',
  case
    when b.release_status in ('eligible','cure_pending') then 'high'
    else 'normal'
  end,
  case
    when b.texture='spun' then 'Spun cure/release: ' || b.batch_code
    else 'Batch release: ' || b.batch_code
  end,
  concat_ws(
    ' · ',
    coalesce(b.recipe_name,b.flavor_name),
    initcap(b.texture),
    case when b.texture='spun' then '14-day cure' else b.release_hold_days::text || '-day hold' end
  ),
  b.id,
  'Production',
  b.release_status
from public.nfos_batch_overview b
where b.status='completed'
  and b.released_at is null
  and b.release_not_before is not null

union all

select
  'po_expected:' || po.id::text,
  po.expected_date,
  'po_expected',
  case
    when po.expected_date < public.nfos_business_today() then 'high'
    when po.expected_date <= public.nfos_business_today()+3 then 'normal'
    else 'low'
  end,
  'PO expected: ' || po.po_number,
  concat_ws(
    ' · ',
    po.supplier_name,
    po.line_count::text || ' line' || case when po.line_count=1 then '' else 's' end,
    case when po.units_open > 0 then po.units_open::text || ' units open' end
  ),
  po.id,
  'Purchasing',
  case
    when po.expected_date < public.nfos_business_today() then 'overdue'
    when po.expected_date=public.nfos_business_today() then 'due_today'
    else 'scheduled'
  end
from public.nfos_purchase_order_overview po
where po.status in ('ordered','partial')
  and po.expected_date is not null;

revoke all on table public.nfos_operations_calendar from anon;
grant select on table public.nfos_operations_calendar to authenticated;

create or replace view public.nfos_action_queue
with (security_invoker=true)
as
with purchase_actions as (
  select
    'purchase:' || pt.item_id::text as action_key,
    'purchasing'::text as action_type,
    case
      when pt.timing_status='overdue' then 10
      when pt.timing_status='due_today' then 20
      when pt.timing_status='supplier_missing' and pt.open_production_demand>0 then 25
      when pt.timing_status='lead_time_missing' and pt.open_production_demand>0 then 30
      when pt.timing_status='due_soon' then 35
      when pt.recommendation_reason='production_shortage' then 40
      when pt.timing_status='cost_missing' and pt.open_production_demand>0 then 45
      when pt.timing_status='order_now' then 50
      else 70
    end as priority_rank,
    case
      when pt.timing_status in ('overdue','due_today') then 'critical'
      when pt.timing_status in ('supplier_missing','lead_time_missing','due_soon')
        and pt.open_production_demand>0 then 'high'
      when pt.recommendation_reason='production_shortage' then 'high'
      else 'normal'
    end as priority,
    coalesce(pt.order_by_date,public.nfos_business_today()) as action_date,
    pt.timing_status as action_status,
    case
      when pt.timing_status='supplier_missing' then 'Assign supplier: ' || pt.name
      when pt.timing_status='lead_time_missing' then 'Add lead time: ' || pt.name
      when pt.timing_status='cost_missing' then 'Add unit cost: ' || pt.name
      else 'Order ' || pt.name
    end as title,
    case
      when pt.timing_status='supplier_missing' then
        concat_ws(' · ',
          'Supplier is required before NFOS can create a PO',
          case when pt.production_orders is not null then 'Needed for ' || pt.production_orders end
        )
      when pt.timing_status='lead_time_missing' then
        concat_ws(' · ',
          coalesce(pt.supplier_name,'Supplier'),
          'Lead time is required to calculate the order-by date',
          case when pt.production_orders is not null then 'Needed for ' || pt.production_orders end
        )
      when pt.timing_status='cost_missing' then
        concat_ws(' · ',
          coalesce(pt.supplier_name,'Supplier'),
          'Unit cost missing'
        )
      else
        concat_ws(' · ',
          pt.suggested_order_quantity::text || ' ' || pt.stocking_unit,
          coalesce(pt.supplier_name,'Supplier needed'),
          case when pt.order_by_date is not null then 'Order by ' || pt.order_by_date::text end,
          case when pt.production_orders is not null then 'For ' || pt.production_orders end
        )
    end as detail,
    pt.item_id as source_id,
    'Purchasing'::text as route
  from public.nfos_purchase_timing pt
  where
    pt.timing_status in (
      'overdue','due_today','due_soon','order_now',
      'supplier_missing','lead_time_missing','cost_missing'
    )
    or pt.recommendation_reason='production_shortage'
    or (pt.order_by_date is not null and pt.order_by_date <= public.nfos_business_today()+14)
),
production_due as (
  select
    'production_due:' || pq.id::text,
    'production',
    case
      when pq.due_date < public.nfos_business_today() then 10
      when pq.due_date=public.nfos_business_today() then 20
      when pq.due_date<=public.nfos_business_today()+3 then 35
      else 70
    end,
    case
      when pq.due_date < public.nfos_business_today() then 'critical'
      when pq.due_date<=public.nfos_business_today()+3 then 'high'
      else 'normal'
    end,
    pq.due_date,
    case
      when pq.due_date < public.nfos_business_today() then 'overdue'
      when pq.due_date=public.nfos_business_today() then 'due_today'
      else 'upcoming'
    end,
    'Production due: ' || pq.recipe_name,
    concat_ws(' · ',pq.order_no,pq.planned_quantity::text || ' ' || pq.planned_unit,initcap(pq.planned_texture)),
    pq.id,
    'Production'
  from public.nfos_production_queue pq
  where pq.status in ('planned','in_progress')
    and pq.due_date is not null
    and pq.due_date <= public.nfos_business_today()+14
),
production_plan_gaps as (
  select
    'production_plan:' || pq.id::text,
    'production_plan',
    case when pq.due_date is not null and pq.due_date<=public.nfos_business_today()+3 then 30 else 60 end,
    case when pq.due_date is not null and pq.due_date<=public.nfos_business_today()+3 then 'high' else 'normal' end,
    coalesce(pq.due_date,pq.requested_date,public.nfos_business_today()),
    'setup_required',
    'Plan finished jar mix: ' || pq.order_no,
    concat_ws(' · ',pq.recipe_name,initcap(pq.planned_texture),'Packaging demand cannot be forecast until finished jar quantities are entered'),
    pq.id,
    'Production'
  from public.nfos_production_queue pq
  where pq.status='planned'
    and not pq.packaging_plan_complete
),
batch_release_actions as (
  select
    'batch_release:' || b.id::text,
    'batch_release',
    case
      when b.release_status in ('eligible','cure_pending') then 20
      when (b.release_not_before at time zone 'America/Detroit')::date<=public.nfos_business_today()+3 then 45
      else 75
    end,
    case when b.release_status in ('eligible','cure_pending') then 'high' else 'normal' end,
    (b.release_not_before at time zone 'America/Detroit')::date,
    b.release_status,
    case
      when b.release_status='cure_pending' then 'Confirm spun cure: ' || b.batch_code
      when b.release_status='eligible' then 'Release batch: ' || b.batch_code
      else 'Upcoming release: ' || b.batch_code
    end,
    concat_ws(' · ',coalesce(b.recipe_name,b.flavor_name),initcap(b.texture),
      case when b.release_not_before is not null then 'Eligible ' || (b.release_not_before at time zone 'America/Detroit')::date::text end),
    b.id,
    'Production'
  from public.nfos_batch_overview b
  where b.status='completed'
    and b.released_at is null
    and b.release_not_before is not null
    and (
      b.release_status in ('eligible','cure_pending')
      or (b.release_not_before at time zone 'America/Detroit')::date <= public.nfos_business_today()+14
    )
),
po_delivery_actions as (
  select
    'po_expected:' || po.id::text,
    'purchase_delivery',
    case
      when po.expected_date < public.nfos_business_today() then 25
      when po.expected_date=public.nfos_business_today() then 40
      when po.expected_date<=public.nfos_business_today()+3 then 60
      else 80
    end,
    case when po.expected_date < public.nfos_business_today() then 'high' else 'normal' end,
    po.expected_date,
    case
      when po.expected_date < public.nfos_business_today() then 'overdue'
      when po.expected_date=public.nfos_business_today() then 'due_today'
      else 'upcoming'
    end,
    case
      when po.expected_date < public.nfos_business_today() then 'Check overdue PO: ' || po.po_number
      else 'PO arriving: ' || po.po_number
    end,
    concat_ws(' · ',po.supplier_name,po.units_open::text || ' units open'),
    po.id,
    'Purchasing'
  from public.nfos_purchase_order_overview po
  where po.status in ('ordered','partial')
    and po.expected_date is not null
    and po.expected_date <= public.nfos_business_today()+14
),
inventory_exceptions as (
  select
    'inventory_negative:' || p.item_id::text,
    'inventory',
    15,
    'critical',
    public.nfos_business_today(),
    'count_required',
    'Count inventory: ' || p.name,
    'NFOS projected/on-hand inventory is negative. Verify the physical count before continuing.',
    p.item_id,
    'Inventory'
  from public.nfos_inventory_projection p
  where p.planning_on_hand < 0
),
setup_summary as (
  select
    'supplier_setup:summary',
    'supplier_setup',
    85,
    'normal',
    public.nfos_business_today(),
    'setup_required',
    'Complete supplier setup',
    count(*)::text || ' reorder-controlled item' ||
      case when count(*)=1 then '' else 's' end ||
      ' still need supplier terms before NFOS can fully automate purchasing.',
    null::uuid,
    'Purchasing'
  from public.nfos_supplier_readiness
  where reorder_point is not null
    and readiness_status <> 'ready'
  having count(*) > 0
)
select * from purchase_actions
union all select * from production_due
union all select * from production_plan_gaps
union all select * from batch_release_actions
union all select * from po_delivery_actions
union all select * from inventory_exceptions
union all select * from setup_summary;

revoke all on table public.nfos_action_queue from anon;
grant select on table public.nfos_action_queue to authenticated;

drop view if exists public.nfos_today_summary;
create view public.nfos_today_summary
with (security_invoker=true)
as
select
  public.nfos_business_today() as business_date,
  count(*)::integer as total_actions,
  count(*) filter (where priority='critical')::integer as critical_actions,
  count(*) filter (where priority='high')::integer as high_actions,
  count(*) filter (where action_status='overdue')::integer as overdue_actions,
  count(*) filter (where action_status='due_today')::integer as due_today_actions,
  count(*) filter (
    where action_date between public.nfos_business_today()+1 and public.nfos_business_today()+7
  )::integer as next_7_days,
  count(*) filter (where route='Production')::integer as production_actions,
  count(*) filter (where route='Purchasing')::integer as purchasing_actions,
  count(*) filter (where route='Inventory')::integer as inventory_actions
from public.nfos_action_queue;

revoke all on table public.nfos_today_summary from anon;
grant select on table public.nfos_today_summary to authenticated;
