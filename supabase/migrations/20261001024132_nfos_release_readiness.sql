
create or replace function nfos_private.release_readiness()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_active_recipe_issues integer:=0;
  v_negative_inventory integer:=0;
  v_stock_mismatch integer:=0;
  v_production_integrity integer:=0;
  v_market_reviews integer:=0;
  v_failed_deliveries integer:=0;
  v_draft_recipes integer:=0;
  v_missing_costs integer:=0;
  v_supplier_gaps integer:=0;
  v_unlinked_team integer:=0;
  v_critical integer:=0;
  v_checks jsonb;
  v_drafts jsonb;
  v_costs jsonb;
  v_suppliers jsonb;
begin
  v_member:=nfos_private.current_member_id('reports.view');

  select count(*) into v_active_recipe_issues
  from public.nfos_recipes r
  where r.status='active'
    and (
      (select count(*) from public.nfos_recipe_inputs ri where ri.recipe_id=r.id and ri.is_base)<>1
      or exists(
        select 1
        from public.nfos_recipe_inputs ri
        join public.nfos_items i on i.id=ri.item_id
        where ri.recipe_id=r.id and not i.active
      )
      or r.legacy_flavor_id is null
      or not exists(
        select 1 from public.flavors f
        where f.id=r.legacy_flavor_id and f.active
      )
      or not exists(
        select 1
        from public.nfos_items fg
        where fg.item_type='finished_good'
          and fg.active
          and fg.legacy_flavor_id=r.legacy_flavor_id
      )
    );

  select count(*) into v_negative_inventory
  from public.nfos_inventory_summary
  where company_on_hand<0 or planning_on_hand<0;

  select count(*) into v_stock_mismatch
  from (
    select
      i.id,
      greatest(floor(coalesce(s.online_on_hand,0)),0)::integer as nfos_online,
      coalesce(st.on_hand,0)::integer as legacy_on_hand
    from public.nfos_items i
    join public.nfos_inventory_summary s on s.item_id=i.id
    left join public.stock st
      on st.flavor_id=i.legacy_flavor_id
     and st.size_id=i.legacy_size_id
     and st.type::text=i.legacy_texture
    where i.item_type='finished_good'
      and i.legacy_flavor_id is not null
      and i.legacy_size_id is not null
      and i.legacy_texture is not null
  ) x
  where x.nfos_online<>x.legacy_on_hand;

  select count(*) into v_production_integrity
  from public.nfos_production_batches b
  where
    (b.status='completed' and b.quality_status<>'passed')
    or (b.released_at is not null and b.status<>'completed')
    or (b.released_at is not null and b.quality_status<>'passed')
    or (b.texture='spun' and b.released_at is not null and b.spun_cure_confirmed_at is null);

  select count(*) into v_market_reviews
  from public.nfos_market_performance
  where reconciliation_status='review_required';

  select count(*) into v_failed_deliveries
  from public.nfos_notification_deliveries
  where status='failed';

  select count(*) into v_draft_recipes
  from public.nfos_recipes
  where status='draft';

  select count(*) into v_missing_costs
  from public.nfos_cost_readiness
  where cost_readiness<>'ready';

  select count(*) into v_supplier_gaps
  from public.nfos_supplier_readiness
  where reorder_point is not null
    and readiness_status<>'ready';

  select count(*) into v_unlinked_team
  from public.nfos_team_members
  where active and user_id is null;

  v_critical :=
    v_active_recipe_issues
    + v_negative_inventory
    + v_stock_mismatch
    + v_production_integrity;

  v_checks:=jsonb_build_array(
    jsonb_build_object('key','active_recipe_integrity','label','Active recipe integrity','status',case when v_active_recipe_issues=0 then 'pass' else 'fail' end,'count',v_active_recipe_issues,'severity','critical','detail','Active recipes must have exactly one base input, active inputs, an active flavor, and active finished SKUs.'),
    jsonb_build_object('key','negative_inventory','label','Negative inventory','status',case when v_negative_inventory=0 then 'pass' else 'fail' end,'count',v_negative_inventory,'severity','critical','detail','Company and planning balances must not be negative.'),
    jsonb_build_object('key','website_stock_bridge','label','Website stock bridge','status',case when v_stock_mismatch=0 then 'pass' else 'fail' end,'count',v_stock_mismatch,'severity','critical','detail','Finished-goods online availability must match the legacy website stock bridge.'),
    jsonb_build_object('key','production_integrity','label','Production release integrity','status',case when v_production_integrity=0 then 'pass' else 'fail' end,'count',v_production_integrity,'severity','critical','detail','Completed/released batches must preserve QC and spun-cure release gates.'),
    jsonb_build_object('key','draft_catalog','label','Draft catalog decisions','status',case when v_draft_recipes=0 then 'pass' else 'setup' end,'count',v_draft_recipes,'severity','setup','detail','Draft recipes are excluded from production but still require an owner decision before they can become active.'),
    jsonb_build_object('key','material_costs','label','Material cost readiness','status',case when v_missing_costs=0 then 'pass' else 'setup' end,'count',v_missing_costs,'severity','setup','detail','Actual margin reporting remains incomplete for items without a trusted lot, standard, or supplier cost.'),
    jsonb_build_object('key','supplier_terms','label','Supplier readiness','status',case when v_supplier_gaps=0 then 'pass' else 'setup' end,'count',v_supplier_gaps,'severity','setup','detail','Reorder-controlled items still need real supplier/lead-time/cost terms.'),
    jsonb_build_object('key','market_reconciliation','label','Market reconciliation review','status',case when v_market_reviews=0 then 'pass' else 'attention' end,'count',v_market_reviews,'severity','attention','detail','Square market sessions in review_required state need reconciliation.'),
    jsonb_build_object('key','notification_delivery','label','Notification delivery failures','status',case when v_failed_deliveries=0 then 'pass' else 'attention' end,'count',v_failed_deliveries,'severity','attention','detail','Failed email/SMS delivery records should be reviewed before relying on external alerts.'),
    jsonb_build_object('key','team_logins','label','Active team profiles without login','status',case when v_unlinked_team=0 then 'pass' else 'setup' end,'count',v_unlinked_team,'severity','setup','detail','Profiles without a linked auth user can be assigned work but cannot sign in.')
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_code',r.product_code,
    'recipe_key',r.recipe_key,
    'name',r.name,
    'linked_flavor',f.name,
    'flavor_active',f.active,
    'inactive_inputs',coalesce((
      select jsonb_agg(jsonb_build_object('sku',i.sku,'name',i.name))
      from public.nfos_recipe_inputs ri
      join public.nfos_items i on i.id=ri.item_id
      where ri.recipe_id=r.id and not i.active
    ),'[]'::jsonb),
    'blockers',jsonb_strip_nulls(jsonb_build_object(
      'finished_flavor',case
        when r.legacy_flavor_id is null then 'missing'
        when not coalesce(f.active,false) then 'inactive'
        else null end,
      'finished_skus',case
        when not exists(
          select 1 from public.nfos_items fg
          where fg.item_type='finished_good'
            and fg.active
            and fg.legacy_flavor_id=r.legacy_flavor_id
        ) then 'missing_or_inactive'
        else null end,
      'ingredient',case
        when exists(
          select 1
          from public.nfos_recipe_inputs ri
          join public.nfos_items i on i.id=ri.item_id
          where ri.recipe_id=r.id and not i.active
        ) then 'inactive'
        when (select count(*) from public.nfos_recipe_inputs ri where ri.recipe_id=r.id)=1 then 'missing_mapping'
        else null end
    ))
  ) order by r.product_code),'[]'::jsonb)
  into v_drafts
  from public.nfos_recipes r
  left join public.flavors f on f.id=r.legacy_flavor_id
  where r.status='draft';

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',c.item_id,'sku',c.sku,'name',c.name,
    'item_type',c.item_type,'stocking_unit',c.stocking_unit,
    'cost_readiness',c.cost_readiness
  ) order by c.item_type,c.name),'[]'::jsonb)
  into v_costs
  from public.nfos_cost_readiness c
  where c.cost_readiness<>'ready';

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id',s.item_id,'sku',s.sku,'name',s.name,
    'supplier_name',s.supplier_name,
    'readiness_status',s.readiness_status,
    'missing_fields',s.missing_fields
  ) order by s.item_type,s.name),'[]'::jsonb)
  into v_suppliers
  from public.nfos_supplier_readiness s
  where s.reorder_point is not null
    and s.readiness_status<>'ready';

  return jsonb_build_object(
    'generated_at',now(),
    'business_date',public.nfos_business_today(),
    'operational_integrity_ready',(v_critical=0),
    'full_cost_reporting_ready',(v_missing_costs=0),
    'purchasing_automation_ready',(v_supplier_gaps=0),
    'critical_failures',v_critical,
    'setup_items_remaining',v_draft_recipes+v_missing_costs+v_supplier_gaps+v_unlinked_team,
    'checks',v_checks,
    'draft_recipes',v_drafts,
    'missing_cost_items',v_costs,
    'supplier_gaps',v_suppliers
  );
end;
$$;

revoke all on function nfos_private.release_readiness() from public,anon;

create or replace function public.nfos_get_release_readiness()
returns jsonb
language sql
security definer
set search_path=public,nfos_private
as $$
  select nfos_private.release_readiness();
$$;

revoke all on function public.nfos_get_release_readiness() from public,anon;
grant execute on function public.nfos_get_release_readiness() to authenticated;
