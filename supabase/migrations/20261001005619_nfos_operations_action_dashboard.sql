
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
    when pq.due_date < current_date then 'critical'
    when pq.due_date <= current_date+3 then 'high'
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
    when pq.due_date < current_date then 'overdue'
    when pq.due_date=current_date then 'due_today'
    else 'scheduled'
  end
from public.nfos_production_queue pq
where pq.status in ('planned','in_progress')
  and pq.due_date is not null

union all

select
  'release:' || b.id::text,
  b.release_not_before::date,
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
    when po.expected_date < current_date then 'high'
    when po.expected_date <= current_date+3 then 'normal'
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
    when po.expected_date < current_date then 'overdue'
    when po.expected_date=current_date then 'due_today'
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
    coalesce(pt.order_by_date,current_date) as action_date,
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
    or (pt.order_by_date is not null and pt.order_by_date <= current_date+14)
),
production_due as (
  select
    'production_due:' || pq.id::text as action_key,
    'production'::text as action_type,
    case
      when pq.due_date < current_date then 10
      when pq.due_date=current_date then 20
      when pq.due_date<=current_date+3 then 35
      else 70
    end as priority_rank,
    case
      when pq.due_date < current_date then 'critical'
      when pq.due_date<=current_date+3 then 'high'
      else 'normal'
    end as priority,
    pq.due_date as action_date,
    case
      when pq.due_date < current_date then 'overdue'
      when pq.due_date=current_date then 'due_today'
      else 'upcoming'
    end as action_status,
    'Production due: ' || pq.recipe_name as title,
    concat_ws(
      ' · ',
      pq.order_no,
      pq.planned_quantity::text || ' ' || pq.planned_unit,
      initcap(pq.planned_texture)
    ) as detail,
    pq.id as source_id,
    'Production'::text as route
  from public.nfos_production_queue pq
  where pq.status in ('planned','in_progress')
    and pq.due_date is not null
    and pq.due_date <= current_date+14
),
production_plan_gaps as (
  select
    'production_plan:' || pq.id::text as action_key,
    'production_plan'::text as action_type,
    case
      when pq.due_date is not null and pq.due_date<=current_date+3 then 30
      else 60
    end as priority_rank,
    case
      when pq.due_date is not null and pq.due_date<=current_date+3 then 'high'
      else 'normal'
    end as priority,
    coalesce(pq.due_date,pq.requested_date,current_date) as action_date,
    'setup_required'::text as action_status,
    'Plan finished jar mix: ' || pq.order_no as title,
    concat_ws(
      ' · ',
      pq.recipe_name,
      initcap(pq.planned_texture),
      'Packaging demand cannot be forecast until finished jar quantities are entered'
    ) as detail,
    pq.id as source_id,
    'Production'::text as route
  from public.nfos_production_queue pq
  where pq.status='planned'
    and not pq.packaging_plan_complete
),
batch_release_actions as (
  select
    'batch_release:' || b.id::text as action_key,
    'batch_release'::text as action_type,
    case
      when b.release_status in ('eligible','cure_pending') then 20
      when b.release_not_before::date<=current_date+3 then 45
      else 75
    end as priority_rank,
    case
      when b.release_status in ('eligible','cure_pending') then 'high'
      else 'normal'
    end as priority,
    b.release_not_before::date as action_date,
    b.release_status as action_status,
    case
      when b.release_status='cure_pending' then 'Confirm spun cure: ' || b.batch_code
      when b.release_status='eligible' then 'Release batch: ' || b.batch_code
      else 'Upcoming release: ' || b.batch_code
    end as title,
    concat_ws(
      ' · ',
      coalesce(b.recipe_name,b.flavor_name),
      initcap(b.texture),
      case when b.release_not_before is not null then 'Eligible ' || b.release_not_before::date::text end
    ) as detail,
    b.id as source_id,
    'Production'::text as route
  from public.nfos_batch_overview b
  where b.status='completed'
    and b.released_at is null
    and b.release_not_before is not null
    and (
      b.release_status in ('eligible','cure_pending')
      or b.release_not_before::date <= current_date+14
    )
),
po_delivery_actions as (
  select
    'po_expected:' || po.id::text as action_key,
    'purchase_delivery'::text as action_type,
    case
      when po.expected_date < current_date then 25
      when po.expected_date=current_date then 40
      when po.expected_date<=current_date+3 then 60
      else 80
    end as priority_rank,
    case
      when po.expected_date < current_date then 'high'
      else 'normal'
    end as priority,
    po.expected_date as action_date,
    case
      when po.expected_date < current_date then 'overdue'
      when po.expected_date=current_date then 'due_today'
      else 'upcoming'
    end as action_status,
    case
      when po.expected_date < current_date then 'Check overdue PO: ' || po.po_number
      else 'PO arriving: ' || po.po_number
    end as title,
    concat_ws(
      ' · ',
      po.supplier_name,
      po.units_open::text || ' units open'
    ) as detail,
    po.id as source_id,
    'Purchasing'::text as route
  from public.nfos_purchase_order_overview po
  where po.status in ('ordered','partial')
    and po.expected_date is not null
    and po.expected_date <= current_date+14
),
inventory_exceptions as (
  select
    'inventory_negative:' || p.item_id::text as action_key,
    'inventory'::text as action_type,
    15 as priority_rank,
    'critical'::text as priority,
    current_date as action_date,
    'count_required'::text as action_status,
    'Count inventory: ' || p.name as title,
    'NFOS projected/on-hand inventory is negative. Verify the physical count before continuing.'::text as detail,
    p.item_id as source_id,
    'Inventory'::text as route
  from public.nfos_inventory_projection p
  where p.planning_on_hand < 0
),
setup_summary as (
  select
    'supplier_setup:summary'::text as action_key,
    'supplier_setup'::text as action_type,
    85 as priority_rank,
    'normal'::text as priority,
    current_date as action_date,
    'setup_required'::text as action_status,
    'Complete supplier setup'::text as title,
    count(*)::text || ' reorder-controlled item' ||
      case when count(*)=1 then '' else 's' end ||
      ' still need supplier terms before NFOS can fully automate purchasing.' as detail,
    null::uuid as source_id,
    'Purchasing'::text as route
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

create or replace view public.nfos_today_summary
with (security_invoker=true)
as
select
  count(*)::integer as total_actions,
  count(*) filter (where priority='critical')::integer as critical_actions,
  count(*) filter (where priority='high')::integer as high_actions,
  count(*) filter (where action_status='overdue')::integer as overdue_actions,
  count(*) filter (where action_status='due_today')::integer as due_today_actions,
  count(*) filter (where action_date between current_date+1 and current_date+7)::integer as next_7_days,
  count(*) filter (where route='Production')::integer as production_actions,
  count(*) filter (where route='Purchasing')::integer as purchasing_actions,
  count(*) filter (where route='Inventory')::integer as inventory_actions
from public.nfos_action_queue;

revoke all on table public.nfos_today_summary from anon;
grant select on table public.nfos_today_summary to authenticated;
