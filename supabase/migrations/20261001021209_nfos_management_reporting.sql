
insert into public.nfos_role_permissions(role,permission,description)
values
  ('owner','reports.view','View NFOS management and costing reports'),
  ('operations_manager','reports.view','View NFOS management and costing reports')
on conflict(role,permission) do update set description=excluded.description;

create or replace view public.nfos_market_performance
with (security_invoker=true)
as
select
  s.id as session_id,
  s.market_day,
  s.venue_name,
  s.status,
  s.assigned_member_id,
  tm.display_name as assigned_member_name,
  s.opened_at,
  s.closed_at,
  s.reconciled_at,
  coalesce(overview.units_loaded,0)::numeric(14,4) as units_loaded,
  coalesce(overview.units_sold,0)::numeric(14,4) as units_sold,
  coalesce(overview.units_returned,0)::numeric(14,4) as units_returned,
  coalesce(overview.recorded_gross_cents,0)::integer as recorded_gross_cents,
  case
    when coalesce(overview.units_loaded,0)>0
    then round((overview.units_sold/overview.units_loaded)*100,2)
    else null
  end as sell_through_percent,
  case
    when coalesce(overview.units_sold,0)>0
    then round(overview.recorded_gross_cents/100.0/overview.units_sold,2)
    else null
  end as average_revenue_per_unit,
  r.square_gross_cents,
  r.recorded_square_gross_cents,
  r.manual_gross_cents,
  r.difference_cents,
  r.unmapped_line_count,
  r.status as reconciliation_status,
  r.synced_at
from public.nfos_market_sessions s
left join public.nfos_market_session_overview overview on overview.id=s.id
left join public.nfos_market_reconciliations r on r.session_id=s.id
left join public.nfos_team_members tm on tm.id=s.assigned_member_id;

revoke all on table public.nfos_market_performance from anon;
grant select on table public.nfos_market_performance to authenticated;

create or replace view public.nfos_inventory_valuation
with (security_invoker=true)
as
with item_cost as (
  select
    cr.item_id,
    coalesce(cr.latest_lot_unit_cost,cr.standard_unit_cost,cr.supplier_last_unit_cost) as material_or_packaging_unit_cost
  from public.nfos_cost_readiness cr
),
finished_cost as (
  select item_id,cost_per_unit
  from public.nfos_current_finished_costs
)
select
  s.item_id,
  s.item_type,
  s.sku,
  s.name,
  s.stocking_unit,
  s.company_on_hand,
  case
    when s.item_type='finished_good' then fc.cost_per_unit
    else ic.material_or_packaging_unit_cost
  end as current_unit_cost,
  case
    when (
      case when s.item_type='finished_good' then fc.cost_per_unit else ic.material_or_packaging_unit_cost end
    ) is not null
    then s.company_on_hand * (
      case when s.item_type='finished_good' then fc.cost_per_unit else ic.material_or_packaging_unit_cost end
    )
    else null
  end::numeric(14,2) as inventory_value,
  case
    when (
      case when s.item_type='finished_good' then fc.cost_per_unit else ic.material_or_packaging_unit_cost end
    ) is null
    then false else true
  end as cost_complete
from public.nfos_inventory_summary s
left join item_cost ic on ic.item_id=s.item_id
left join finished_cost fc on fc.item_id=s.item_id
where s.active;

revoke all on table public.nfos_inventory_valuation from anon;
grant select on table public.nfos_inventory_valuation to authenticated;

create or replace view public.nfos_management_kpis
with (security_invoker=true)
as
select
  public.nfos_business_today() as business_date,
  (
    select sum(inventory_value)
    from public.nfos_inventory_valuation
    where cost_complete
  )::numeric(14,2) as known_inventory_value,
  (
    select count(*)
    from public.nfos_inventory_valuation
    where company_on_hand<>0 and not cost_complete
  )::integer as inventory_items_missing_cost,
  (
    select count(*)
    from public.nfos_production_batches
    where status='completed'
      and completed_at >= now()-interval '30 days'
  )::integer as batches_completed_30d,
  (
    select coalesce(sum(finished_units),0)
    from public.nfos_batch_cost_summary
    where status='completed'
      and completed_at >= now()-interval '30 days'
  )::numeric(14,4) as finished_units_30d,
  (
    select coalesce(sum(recorded_gross_cents),0)
    from public.nfos_market_performance
    where market_day >= public.nfos_business_today()-30
  )::integer as market_gross_cents_30d,
  (
    select avg(sell_through_percent)
    from public.nfos_market_performance
    where market_day >= public.nfos_business_today()-30
      and sell_through_percent is not null
  )::numeric(8,2) as avg_market_sell_through_30d,
  (
    select count(*)
    from public.nfos_market_performance
    where reconciliation_status='review_required'
  )::integer as market_reconciliations_needing_review,
  (
    select avg(retail_gross_margin_percent)
    from public.nfos_current_finished_costs
    where retail_gross_margin_percent is not null
  )::numeric(8,2) as avg_known_retail_margin_percent;

revoke all on table public.nfos_management_kpis from anon;
grant select on table public.nfos_management_kpis to authenticated;

create or replace function nfos_private.reporting_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_kpis jsonb;
  v_cost_dashboard jsonb;
  v_readiness jsonb;
  v_batches jsonb;
  v_finished jsonb;
  v_markets jsonb;
  v_valuation jsonb;
begin
  v_member:=nfos_private.current_member_id('reports.view');

  select to_jsonb(x) into v_kpis
  from public.nfos_management_kpis x;

  select to_jsonb(x) into v_cost_dashboard
  from public.nfos_costing_dashboard x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.cost_readiness desc,x.item_type,x.name),'[]'::jsonb)
  into v_readiness
  from(
    select *
    from public.nfos_cost_readiness
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.completed_at desc nulls last,x.batch_code),'[]'::jsonb)
  into v_batches
  from(
    select *
    from public.nfos_batch_cost_summary
    where status='completed'
    order by completed_at desc nulls last
    limit 250
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.completed_at desc nulls last,x.finished_item_name),'[]'::jsonb)
  into v_finished
  from(
    select *
    from public.nfos_finished_cost_history
    order by completed_at desc nulls last
    limit 500
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.market_day desc,x.venue_name),'[]'::jsonb)
  into v_markets
  from(
    select *
    from public.nfos_market_performance
    order by market_day desc
    limit 250
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.item_type,x.name),'[]'::jsonb)
  into v_valuation
  from(
    select *
    from public.nfos_inventory_valuation
    where company_on_hand<>0
  ) x;

  return jsonb_build_object(
    'kpis',coalesce(v_kpis,'{}'::jsonb),
    'costing_dashboard',coalesce(v_cost_dashboard,'{}'::jsonb),
    'cost_readiness',v_readiness,
    'batch_costs',v_batches,
    'finished_costs',v_finished,
    'market_performance',v_markets,
    'inventory_valuation',v_valuation
  );
end;
$$;

revoke all on function nfos_private.reporting_workspace() from public,anon;
grant execute on function nfos_private.reporting_workspace() to authenticated;

create or replace function public.nfos_get_reporting_workspace()
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.reporting_workspace(); $$;

revoke all on function public.nfos_get_reporting_workspace() from public,anon;
grant execute on function public.nfos_get_reporting_workspace() to authenticated;
