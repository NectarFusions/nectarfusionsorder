
create or replace view public.nfos_team_activity_feed
with (security_invoker=true)
as
select
  'batch_started:' || b.id::text as activity_key,
  b.started_at as activity_at,
  b.started_by as user_id,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user') as performed_by,
  'production_started'::text as activity_type,
  'Started ' || b.batch_code as title,
  concat_ws(' · ',r.name,initcap(b.texture),b.planned_quantity::text || ' ' || b.planned_unit) as detail,
  'production_batch'::text as source_type,
  b.id as source_id
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.nfos_user_attribution ua on ua.user_id=b.started_by
where b.started_at is not null

union all

select
  'sop_step:' || c.id::text,
  c.completed_at,
  c.completed_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'sop_completed',
  'Completed SOP step: ' || s.title,
  concat_ws(' · ',b.batch_code,r.name),
  'production_batch',
  b.id
from public.nfos_batch_step_checks c
join public.nfos_recipe_steps s on s.id=c.recipe_step_id
join public.nfos_production_batches b on b.id=c.batch_id
join public.nfos_recipes r on r.id=b.recipe_id
left join public.nfos_user_attribution ua on ua.user_id=c.completed_by
where c.completed_at is not null

union all

select
  'batch_completed:' || b.id::text,
  b.completed_at,
  b.completed_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'production_completed',
  'Completed ' || b.batch_code,
  concat_ws(' · ',r.name,initcap(b.texture),coalesce(b.actual_bulk_yield::text || ' ' || b.yield_unit,'yield not recorded')),
  'production_batch',
  b.id
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.nfos_user_attribution ua on ua.user_id=b.completed_by
where b.completed_at is not null

union all

select
  'cure_confirmed:' || b.id::text,
  b.spun_cure_confirmed_at,
  b.spun_cure_confirmed_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'spun_cure_confirmed',
  'Confirmed spun cure: ' || b.batch_code,
  concat_ws(' · ',r.name,'14-day cure below 41°F'),
  'production_batch',
  b.id
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.nfos_user_attribution ua on ua.user_id=b.spun_cure_confirmed_by
where b.spun_cure_confirmed_at is not null

union all

select
  'batch_released:' || b.id::text,
  b.released_at,
  b.released_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'batch_released',
  'Released ' || b.batch_code,
  concat_ws(' · ',r.name,initcap(b.texture)),
  'production_batch',
  b.id
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.nfos_user_attribution ua on ua.user_id=b.released_by
where b.released_at is not null

union all

select
  'inventory:' || t.id::text,
  t.occurred_at,
  t.created_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'inventory_movement',
  initcap(replace(t.movement_type,'_',' ')) || ': ' || i.name,
  concat_ws(
    ' · ',
    t.quantity::text || ' ' || i.stocking_unit,
    case when lf.name is not null then 'From ' || lf.name end,
    case when lt.name is not null then 'To ' || lt.name end,
    case when l.lot_code is not null then 'Lot ' || l.lot_code end
  ),
  'inventory_transaction',
  t.id
from public.nfos_inventory_transactions t
join public.nfos_items i on i.id=t.item_id
left join public.nfos_locations lf on lf.id=t.from_location_id
left join public.nfos_locations lt on lt.id=t.to_location_id
left join public.nfos_lots l on l.id=t.lot_id
left join public.nfos_user_attribution ua on ua.user_id=t.created_by
where t.occurred_at is not null

union all

select
  'po_ordered:' || po.id::text,
  po.ordered_at,
  po.ordered_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'purchase_ordered',
  'Submitted ' || po.po_number,
  concat_ws(' · ',s.name,po.expected_date::text),
  'purchase_order',
  po.id
from public.nfos_purchase_orders po
join public.nfos_suppliers s on s.id=po.supplier_id
left join public.nfos_user_attribution ua on ua.user_id=po.ordered_by
where po.ordered_at is not null

union all

select
  'po_receipt:' || pr.id::text,
  pr.received_at,
  pr.received_by,
  ua.member_id,
  coalesce(ua.display_name,'Unlinked user'),
  'purchase_received',
  'Received ' || i.name,
  concat_ws(' · ',po.po_number,pr.quantity::text || ' ' || pr.unit,case when l.lot_code is not null then 'Lot ' || l.lot_code end),
  'purchase_receipt',
  pr.id
from public.nfos_purchase_receipts pr
join public.nfos_purchase_order_lines pol on pol.id=pr.purchase_order_line_id
join public.nfos_purchase_orders po on po.id=pol.purchase_order_id
join public.nfos_items i on i.id=pol.item_id
left join public.nfos_lots l on l.id=pr.lot_id
left join public.nfos_user_attribution ua on ua.user_id=pr.received_by
where pr.received_at is not null;

revoke all on table public.nfos_team_activity_feed from anon;
grant select on table public.nfos_team_activity_feed to authenticated;
