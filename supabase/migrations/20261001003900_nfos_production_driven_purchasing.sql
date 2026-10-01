
alter table public.nfos_production_orders
  add column if not exists planned_texture text not null default 'regular';

alter table public.nfos_production_orders
  drop constraint if exists nfos_production_orders_planned_texture_check;

alter table public.nfos_production_orders
  add constraint nfos_production_orders_planned_texture_check
  check (planned_texture in ('regular','spun'));

create table if not exists public.nfos_production_order_outputs (
  id uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.nfos_production_orders(id) on delete cascade,
  finished_item_id uuid not null references public.nfos_items(id) on delete restrict,
  quantity_planned numeric(14,4) not null check (quantity_planned > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(production_order_id,finished_item_id)
);

create index if not exists nfos_production_order_outputs_order_idx
  on public.nfos_production_order_outputs(production_order_id);

create index if not exists nfos_production_order_outputs_item_idx
  on public.nfos_production_order_outputs(finished_item_id);

alter table public.nfos_production_order_outputs enable row level security;
revoke all on table public.nfos_production_order_outputs from anon;
grant select,insert,update,delete on table public.nfos_production_order_outputs to authenticated;

drop policy if exists nfos_production_order_outputs_admin_all on public.nfos_production_order_outputs;
create policy nfos_production_order_outputs_admin_all
on public.nfos_production_order_outputs
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_production_order_outputs_set_updated_at on public.nfos_production_order_outputs;
create trigger nfos_production_order_outputs_set_updated_at
before update on public.nfos_production_order_outputs
for each row execute function public.nfos_set_updated_at();

create or replace function public.nfos_set_production_order_plan(
  p_production_order_id uuid,
  p_texture text,
  p_outputs jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_order public.nfos_production_orders%rowtype;
  v_recipe public.nfos_recipes%rowtype;
  v_texture text := lower(coalesce(nullif(btrim(p_texture),''),'regular'));
  v_out record;
  v_item public.nfos_items%rowtype;
  v_count integer := 0;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_order
  from public.nfos_production_orders
  where id=p_production_order_id
  for update;

  if v_order.id is null then raise exception 'Production order not found.'; end if;
  if v_order.status <> 'planned' then
    raise exception 'The production plan can only be changed before the order starts.';
  end if;
  if exists(
    select 1 from public.nfos_production_batches
    where production_order_id=p_production_order_id
  ) then
    raise exception 'The production plan is locked after a batch has been started.';
  end if;

  select * into v_recipe
  from public.nfos_recipes
  where id=v_order.recipe_id;

  if v_texture not in ('regular','spun') then
    raise exception 'Texture must be Regular or Spun.';
  end if;
  if v_texture='spun' and not coalesce(v_recipe.spun_eligible,false) then
    raise exception 'This recipe is not approved for spun honey.';
  end if;

  if jsonb_typeof(coalesce(p_outputs,'[]'::jsonb)) <> 'array' then
    raise exception 'Planned outputs must be an array.';
  end if;

  delete from public.nfos_production_order_outputs
  where production_order_id=p_production_order_id;

  for v_out in
    select *
    from jsonb_to_recordset(coalesce(p_outputs,'[]'::jsonb))
      as x(item_id uuid,quantity numeric,notes text)
  loop
    if v_out.quantity is null or v_out.quantity <= 0 then
      raise exception 'Every planned output quantity must be greater than zero.';
    end if;

    select * into v_item
    from public.nfos_items
    where id=v_out.item_id
      and active;

    if v_item.id is null then raise exception 'Planned finished item not found or inactive.'; end if;
    if v_item.item_type <> 'finished_good' then
      raise exception 'Planned outputs must be finished goods.';
    end if;
    if v_recipe.legacy_flavor_id is not null
       and v_item.legacy_flavor_id is distinct from v_recipe.legacy_flavor_id then
      raise exception 'Planned output % does not match the recipe flavor.',v_item.name;
    end if;
    if lower(coalesce(v_item.legacy_texture,'')) <> v_texture then
      raise exception 'Planned output % does not match % texture.',v_item.name,v_texture;
    end if;
    if not exists(
      select 1 from public.nfos_sku_bom_items
      where finished_item_id=v_item.id
    ) then
      raise exception 'Packaging BOM is missing for planned output %.',v_item.name;
    end if;

    insert into public.nfos_production_order_outputs(
      production_order_id,finished_item_id,quantity_planned,notes
    )
    values(
      p_production_order_id,v_item.id,v_out.quantity,nullif(btrim(v_out.notes),'')
    )
    on conflict(production_order_id,finished_item_id) do update
    set quantity_planned=excluded.quantity_planned,
        notes=excluded.notes,
        updated_at=now();

    v_count := v_count+1;
  end loop;

  update public.nfos_production_orders
  set planned_texture=v_texture
  where id=p_production_order_id;

  return jsonb_build_object(
    'production_order_id',p_production_order_id,
    'texture',v_texture,
    'planned_output_count',v_count,
    'packaging_plan_complete',(v_count > 0)
  );
end;
$$;

revoke all on function public.nfos_set_production_order_plan(uuid,text,jsonb) from public,anon;
grant execute on function public.nfos_set_production_order_plan(uuid,text,jsonb) to authenticated;

create or replace function public.nfos_create_production_order_with_plan(
  p_recipe_id uuid,
  p_planned_quantity numeric,
  p_planned_unit text default null,
  p_texture text default 'regular',
  p_outputs jsonb default '[]'::jsonb,
  p_due_date date default null,
  p_priority text default 'normal',
  p_assigned_to uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_recipe public.nfos_recipes%rowtype;
  v_order public.nfos_production_orders%rowtype;
  v_plan jsonb;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  perform public.nfos_assert_recipe_ready(p_recipe_id);

  if p_planned_quantity is null or p_planned_quantity <= 0 then
    raise exception 'Planned quantity must be greater than zero.';
  end if;

  select * into v_recipe
  from public.nfos_recipes
  where id=p_recipe_id;

  insert into public.nfos_production_orders(
    recipe_id,planned_quantity,planned_unit,due_date,priority,
    assigned_to,notes,created_by,planned_texture
  )
  values(
    p_recipe_id,
    p_planned_quantity,
    coalesce(nullif(btrim(p_planned_unit),''),v_recipe.basis_unit),
    p_due_date,
    case when p_priority in ('low','normal','high','urgent') then p_priority else 'normal' end,
    p_assigned_to,
    nullif(btrim(p_notes),''),
    auth.uid(),
    lower(coalesce(nullif(btrim(p_texture),''),'regular'))
  )
  returning * into v_order;

  v_plan := public.nfos_set_production_order_plan(
    v_order.id,p_texture,coalesce(p_outputs,'[]'::jsonb)
  );

  return jsonb_build_object(
    'id',v_order.id,
    'order_no',v_order.order_no,
    'status',v_order.status,
    'texture',v_plan->>'texture',
    'planned_output_count',(v_plan->>'planned_output_count')::integer
  );
end;
$$;

revoke all on function public.nfos_create_production_order_with_plan(uuid,numeric,text,text,jsonb,date,text,uuid,text) from public,anon;
grant execute on function public.nfos_create_production_order_with_plan(uuid,numeric,text,text,jsonb,date,text,uuid,text) to authenticated;

-- Remaining bulk demand after any completed partial batches.
create or replace view public.nfos_production_order_remaining
with (security_invoker=true)
as
with completed as (
  select
    b.production_order_id,
    sum(
      case
        when b.status='completed'
         and b.actual_bulk_yield is not null
         and lower(coalesce(b.yield_unit,''))=lower(po.planned_unit)
        then b.actual_bulk_yield
        else 0
      end
    )::numeric as completed_bulk
  from public.nfos_production_batches b
  join public.nfos_production_orders po on po.id=b.production_order_id
  group by b.production_order_id
)
select
  po.id as production_order_id,
  po.order_no,
  po.recipe_id,
  po.status,
  po.planned_texture,
  po.planned_quantity,
  po.planned_unit,
  coalesce(c.completed_bulk,0)::numeric(14,4) as completed_bulk_quantity,
  greatest(po.planned_quantity-coalesce(c.completed_bulk,0),0)::numeric(14,4) as remaining_bulk_quantity
from public.nfos_production_orders po
left join completed c on c.production_order_id=po.id
where po.status in ('planned','in_progress');

revoke all on table public.nfos_production_order_remaining from anon;
grant select on table public.nfos_production_order_remaining to authenticated;

create or replace view public.nfos_production_order_output_remaining
with (security_invoker=true)
as
with produced as (
  select
    b.production_order_id,
    bo.item_id,
    sum(bo.quantity)::numeric as quantity_produced
  from public.nfos_production_batches b
  join public.nfos_batch_outputs bo on bo.batch_id=b.id
  where b.status='completed'
  group by b.production_order_id,bo.item_id
)
select
  poo.production_order_id,
  poo.finished_item_id,
  i.sku,
  i.name as finished_item_name,
  i.legacy_texture,
  poo.quantity_planned,
  coalesce(p.quantity_produced,0)::numeric(14,4) as quantity_produced,
  greatest(poo.quantity_planned-coalesce(p.quantity_produced,0),0)::numeric(14,4) as quantity_remaining
from public.nfos_production_order_outputs poo
join public.nfos_items i on i.id=poo.finished_item_id
join public.nfos_production_orders po on po.id=poo.production_order_id
left join produced p
  on p.production_order_id=poo.production_order_id
 and p.item_id=poo.finished_item_id
where po.status in ('planned','in_progress');

revoke all on table public.nfos_production_order_output_remaining from anon;
grant select on table public.nfos_production_order_output_remaining to authenticated;

-- Per-order ingredient and packaging demand.
create or replace view public.nfos_production_demand_detail
with (security_invoker=true)
as
with ingredient_demand as (
  select
    rem.production_order_id,
    rem.order_no,
    rem.recipe_id,
    ri.item_id,
    i.sku,
    i.name,
    i.item_type,
    i.stocking_unit,
    'ingredient'::text as demand_type,
    case
      when ri.is_base then
        public.nfos_convert_weight(
          rem.remaining_bulk_quantity,
          rem.planned_unit,
          i.stocking_unit
        )
      when ri.calculation_method='percent_of_base_weight' then
        public.nfos_convert_weight(
          rem.remaining_bulk_quantity,
          rem.planned_unit,
          i.stocking_unit
        ) * ri.rate_percent / 100
      else
        ri.quantity * rem.remaining_bulk_quantity / r.basis_quantity
    end::numeric(14,4) as quantity_required
  from public.nfos_production_order_remaining rem
  join public.nfos_recipes r on r.id=rem.recipe_id
  join public.nfos_recipe_inputs ri on ri.recipe_id=rem.recipe_id
  join public.nfos_items i on i.id=ri.item_id
  where rem.remaining_bulk_quantity > 0
),
packaging_demand as (
  select
    out.production_order_id,
    po.order_no,
    po.recipe_id,
    bom.component_item_id as item_id,
    i.sku,
    i.name,
    i.item_type,
    i.stocking_unit,
    'packaging'::text as demand_type,
    sum(out.quantity_remaining*bom.quantity_per_unit)::numeric(14,4) as quantity_required
  from public.nfos_production_order_output_remaining out
  join public.nfos_production_orders po on po.id=out.production_order_id
  join public.nfos_sku_bom_items bom on bom.finished_item_id=out.finished_item_id
  join public.nfos_items i on i.id=bom.component_item_id
  where out.quantity_remaining > 0
    and bom.required
  group by out.production_order_id,po.order_no,po.recipe_id,
           bom.component_item_id,i.sku,i.name,i.item_type,i.stocking_unit
)
select * from ingredient_demand
union all
select * from packaging_demand;

revoke all on table public.nfos_production_demand_detail from anon;
grant select on table public.nfos_production_demand_detail to authenticated;

create or replace view public.nfos_production_demand
with (security_invoker=true)
as
select
  item_id,
  sku,
  name,
  item_type,
  stocking_unit,
  sum(quantity_required)::numeric(14,4) as open_production_demand,
  sum(quantity_required) filter (where demand_type='ingredient')::numeric(14,4) as ingredient_demand,
  sum(quantity_required) filter (where demand_type='packaging')::numeric(14,4) as packaging_demand,
  count(distinct production_order_id)::integer as production_order_count
from public.nfos_production_demand_detail
group by item_id,sku,name,item_type,stocking_unit;

revoke all on table public.nfos_production_demand from anon;
grant select on table public.nfos_production_demand to authenticated;

-- Non-purchasable spun seed planning requirement.
create or replace view public.nfos_spun_seed_requirements
with (security_invoker=true)
as
select
  rem.production_order_id,
  rem.order_no,
  r.name as recipe_name,
  rem.remaining_bulk_quantity,
  rem.planned_unit,
  public.nfos_convert_weight(
    rem.remaining_bulk_quantity,
    rem.planned_unit,
    'oz'
  ) * 0.10 as required_seed_oz,
  'Prior NectarFusions natural spun honey'::text as seed_source_requirement
from public.nfos_production_order_remaining rem
join public.nfos_recipes r on r.id=rem.recipe_id
where rem.planned_texture='spun'
  and rem.remaining_bulk_quantity > 0;

revoke all on table public.nfos_spun_seed_requirements from anon;
grant select on table public.nfos_spun_seed_requirements to authenticated;

create or replace view public.nfos_inventory_projection
with (security_invoker=true)
as
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
  coalesce(op.incoming_quantity,0)::numeric(14,4) as incoming_quantity,
  coalesce(pd.open_production_demand,0)::numeric(14,4) as open_production_demand,
  (
    s.planning_on_hand
    + coalesce(op.incoming_quantity,0)
    - coalesce(pd.open_production_demand,0)
  )::numeric(14,4) as projected_after_production
from public.nfos_inventory_summary s
left join public.nfos_open_purchase_quantities op on op.item_id=s.item_id
left join public.nfos_production_demand pd on pd.item_id=s.item_id
where s.active;

revoke all on table public.nfos_inventory_projection from anon;
grant select on table public.nfos_inventory_projection to authenticated;

create or replace view public.nfos_purchase_recommendations
with (security_invoker=true)
as
with base as (
  select
    p.*,
    coalesce(i.preferred_supplier_id,isp.supplier_id) as supplier_id,
    sup.name as supplier_name,
    coalesce(isp.minimum_order_qty,0)::numeric as minimum_order_qty,
    coalesce(isp.order_increment,0)::numeric as order_increment,
    coalesce(isp.lead_time_days,0) as lead_time_days,
    coalesce(isp.last_unit_cost,i.standard_unit_cost) as estimated_unit_cost
  from public.nfos_inventory_projection p
  join public.nfos_items i on i.id=p.item_id
  left join lateral (
    select x.*
    from public.nfos_item_suppliers x
    where x.item_id=i.id and x.active
    order by
      (x.supplier_id=i.preferred_supplier_id) desc,
      x.primary_supplier desc,
      x.created_at
    limit 1
  ) isp on true
  left join public.nfos_suppliers sup
    on sup.id=coalesce(i.preferred_supplier_id,isp.supplier_id)
  where p.item_type in ('material','packaging')
    and p.reorder_point is not null
),
raw as (
  select *,
    greatest(
      coalesce(target_stock,preferred_order_qty,reorder_point,0)
      - projected_after_production,
      0
    )::numeric as raw_suggested_quantity
  from base
  where projected_after_production <= reorder_point
),
rounded as (
  select *,
    case
      when raw_suggested_quantity <= 0 then 0::numeric
      when order_increment > 0 then
        ceil(
          greatest(raw_suggested_quantity,minimum_order_qty)
          / order_increment
        ) * order_increment
      else greatest(raw_suggested_quantity,minimum_order_qty)
    end::numeric(14,4) as suggested_order_quantity
  from raw
)
select
  item_id,item_type,sku,name,category,size_label,stocking_unit,
  reorder_point,target_stock,preferred_order_qty,
  planning_on_hand,incoming_quantity,open_production_demand,projected_after_production,
  supplier_id,supplier_name,minimum_order_qty,order_increment,lead_time_days,
  estimated_unit_cost,suggested_order_quantity,
  (suggested_order_quantity*coalesce(estimated_unit_cost,0))::numeric(14,2) as estimated_line_cost,
  case
    when supplier_id is null then 'supplier_needed'
    when open_production_demand > 0 and projected_after_production < 0 then 'production_shortage'
    when open_production_demand > 0 then 'production_reorder'
    else 'stock_reorder'
  end as recommendation_reason
from rounded
where suggested_order_quantity > 0;

revoke all on table public.nfos_purchase_recommendations from anon;
grant select on table public.nfos_purchase_recommendations to authenticated;

-- Purchasing now uses production-aware recommendations.
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
    select 1 from public.nfos_purchase_recommendations
    where supplier_id=p_supplier_id
  ) then
    raise exception 'There are no current purchase recommendations for this supplier.';
  end if;

  v_po_json := public.nfos_create_purchase_order(
    p_supplier_id,p_expected_date,p_destination_location_id,p_notes
  );
  v_po_id := (v_po_json->>'id')::uuid;

  for v_rec in
    select item_id,suggested_order_quantity,estimated_unit_cost,recommendation_reason
    from public.nfos_purchase_recommendations
    where supplier_id=p_supplier_id
    order by name
  loop
    perform public.nfos_add_purchase_order_line(
      v_po_id,
      v_rec.item_id,
      v_rec.suggested_order_quantity,
      v_rec.estimated_unit_cost,
      'Created from NFOS ' || replace(v_rec.recommendation_reason,'_',' ') || '.'
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

revoke all on function public.nfos_create_reorder_po(uuid,date,uuid,text) from public,anon;
grant execute on function public.nfos_create_reorder_po(uuid,date,uuid,text) to authenticated;

-- Start Batch inherits and enforces the production order's planned texture.
create or replace function public.nfos_start_batch_with_texture(
  p_recipe_id uuid default null,
  p_production_order_id uuid default null,
  p_location_id uuid default null,
  p_planned_quantity numeric default null,
  p_planned_unit text default null,
  p_texture text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_recipe public.nfos_recipes%rowtype;
  v_order public.nfos_production_orders%rowtype;
  v_batch public.nfos_production_batches%rowtype;
  v_location uuid;
  v_texture text;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if p_production_order_id is not null then
    select * into v_order
    from public.nfos_production_orders
    where id=p_production_order_id
    for update;

    if v_order.id is null then raise exception 'Production order not found.'; end if;
    if v_order.status in ('completed','cancelled') then
      raise exception 'This production order cannot start a new batch.';
    end if;

    if p_recipe_id is not null and p_recipe_id <> v_order.recipe_id then
      raise exception 'Recipe does not match the production order.';
    end if;

    if nullif(btrim(p_texture),'') is not null
       and lower(btrim(p_texture)) <> v_order.planned_texture then
      raise exception 'Batch texture must match the production order plan (%).',v_order.planned_texture;
    end if;

    p_recipe_id := v_order.recipe_id;
    p_planned_quantity := coalesce(p_planned_quantity,v_order.planned_quantity);
    p_planned_unit := coalesce(nullif(btrim(p_planned_unit),''),v_order.planned_unit);
    v_texture := v_order.planned_texture;
  else
    v_texture := lower(coalesce(nullif(btrim(p_texture),''),'regular'));
  end if;

  if p_recipe_id is null then raise exception 'Recipe is required.'; end if;
  perform public.nfos_assert_recipe_ready(p_recipe_id);

  select * into v_recipe
  from public.nfos_recipes
  where id=p_recipe_id;

  if v_texture not in ('regular','spun') then
    raise exception 'Texture must be Regular or Spun.';
  end if;
  if v_texture='spun' and not coalesce(v_recipe.spun_eligible,false) then
    raise exception 'This recipe is not approved for spun honey.';
  end if;

  if p_planned_quantity is null or p_planned_quantity <= 0 then
    p_planned_quantity := v_recipe.basis_quantity;
  end if;

  p_planned_unit := coalesce(nullif(btrim(p_planned_unit),''),v_recipe.basis_unit);

  if lower(p_planned_unit) <> lower(v_recipe.basis_unit) then
    raise exception 'Batch planned unit % must match recipe basis unit %.',
      p_planned_unit,v_recipe.basis_unit;
  end if;

  v_location := p_location_id;
  if v_location is null then
    select id into v_location
    from public.nfos_locations
    where code='MAIN' and active
    limit 1;
  end if;

  if v_location is null or not exists(
    select 1 from public.nfos_locations where id=v_location and active
  ) then
    raise exception 'An active production location is required.';
  end if;

  insert into public.nfos_production_batches(
    production_order_id,recipe_id,production_location_id,
    planned_quantity,planned_unit,texture,started_by,notes
  )
  values(
    p_production_order_id,p_recipe_id,v_location,
    p_planned_quantity,p_planned_unit,v_texture,auth.uid(),nullif(btrim(p_notes),'')
  )
  returning * into v_batch;

  insert into public.nfos_quality_checks(
    batch_id,quality_spec_id,check_key,label,result_type,unit,status
  )
  select
    v_batch.id,q.id,q.check_key,q.label,q.result_type,q.unit,'pending'
  from public.nfos_recipe_quality_specs q
  where q.recipe_id=p_recipe_id
  on conflict(batch_id,check_key) do nothing;

  if p_production_order_id is not null then
    update public.nfos_production_orders
    set status='in_progress'
    where id=p_production_order_id;
  end if;

  return jsonb_build_object(
    'id',v_batch.id,
    'batch_code',v_batch.batch_code,
    'barcode_value',v_batch.barcode_value,
    'status',v_batch.status,
    'texture',v_batch.texture
  );
end;
$$;

revoke all on function public.nfos_start_batch_with_texture(uuid,uuid,uuid,numeric,text,text,text) from public,anon;
grant execute on function public.nfos_start_batch_with_texture(uuid,uuid,uuid,numeric,text,text,text) to authenticated;

drop view if exists public.nfos_production_queue;
create view public.nfos_production_queue
with (security_invoker=true)
as
select
  po.id,
  po.order_no,
  po.recipe_id,
  r.name as recipe_name,
  f.name as flavor_name,
  po.status,
  po.priority,
  po.planned_quantity,
  po.planned_unit,
  po.planned_texture,
  po.requested_date,
  po.due_date,
  po.assigned_to,
  po.notes,
  po.created_at,
  po.updated_at,
  count(distinct b.id) filter (where b.status <> 'cancelled')::integer as batch_count,
  count(distinct b.id) filter (where b.status in ('draft','in_progress','qc_hold'))::integer as open_batch_count,
  coalesce(sum(b.actual_bulk_yield) filter (where b.status='completed'),0)::numeric(14,4) as completed_bulk_yield,
  count(distinct poo.finished_item_id)::integer as planned_output_sku_count,
  coalesce(sum(poo.quantity_planned),0)::numeric(14,4) as planned_finished_units,
  (count(distinct poo.finished_item_id) > 0) as packaging_plan_complete
from public.nfos_production_orders po
join public.nfos_recipes r on r.id=po.recipe_id
left join public.flavors f on f.id=r.legacy_flavor_id
left join public.nfos_production_batches b on b.production_order_id=po.id
left join public.nfos_production_order_outputs poo on poo.production_order_id=po.id
group by po.id,r.name,f.name;

revoke all on table public.nfos_production_queue from anon;
grant select on table public.nfos_production_queue to authenticated;
