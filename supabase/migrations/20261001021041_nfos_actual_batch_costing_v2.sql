
create table if not exists public.nfos_size_fill_weights (
  size_id text primary key references public.sizes(id) on delete cascade,
  fill_weight_oz numeric(10,4) not null check (fill_weight_oz > 0),
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.nfos_size_fill_weights(size_id,fill_weight_oz,notes)
values
  ('4oz',4.0000,'NFOS finished fill weight'),
  ('7oz',7.0000,'NFOS finished fill weight'),
  ('1lb',16.0000,'NFOS finished fill weight')
on conflict(size_id) do update
set fill_weight_oz=excluded.fill_weight_oz,
    notes=excluded.notes,
    updated_at=now();

alter table public.nfos_size_fill_weights enable row level security;
revoke all on table public.nfos_size_fill_weights from anon;
grant select on table public.nfos_size_fill_weights to authenticated;

drop policy if exists nfos_size_fill_weights_admin_read on public.nfos_size_fill_weights;
create policy nfos_size_fill_weights_admin_read
on public.nfos_size_fill_weights
for select to authenticated
using ((select public.nf_is_admin()));

alter table public.nfos_batch_inputs
  add column if not exists unit_cost numeric(14,6),
  add column if not exists extended_cost numeric(14,6),
  add column if not exists cost_source text;

create or replace function public.nfos_snapshot_batch_input_cost()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_item public.nfos_items%rowtype;
  v_lot public.nfos_lots%rowtype;
  v_supplier_cost numeric;
  v_cost numeric;
  v_source text;
begin
  if new.unit_cost is not null then
    new.extended_cost := new.quantity * new.unit_cost;
    new.cost_source := coalesce(new.cost_source,'provided');
    return new;
  end if;

  select * into v_item
  from public.nfos_items
  where id=new.item_id;

  if new.lot_id is not null then
    select * into v_lot
    from public.nfos_lots
    where id=new.lot_id;

    if v_lot.received_quantity is not null
       and v_lot.received_quantity > 0
       and v_lot.received_total_cost is not null then
      v_cost := v_lot.received_total_cost / v_lot.received_quantity;
      v_source := 'lot_received_cost';
    end if;
  end if;

  if v_cost is null and v_item.standard_unit_cost is not null then
    v_cost := v_item.standard_unit_cost;
    v_source := 'item_standard_cost';
  end if;

  if v_cost is null then
    select x.last_unit_cost
    into v_supplier_cost
    from public.nfos_item_suppliers x
    where x.item_id=new.item_id
      and x.active
      and x.last_unit_cost is not null
    order by
      (x.supplier_id=v_item.preferred_supplier_id) desc,
      x.primary_supplier desc,
      x.updated_at desc
    limit 1;

    if v_supplier_cost is not null then
      v_cost := v_supplier_cost;
      v_source := 'supplier_last_cost';
    end if;
  end if;

  new.unit_cost := v_cost;
  new.extended_cost := case when v_cost is null then null else new.quantity*v_cost end;
  new.cost_source := v_source;

  return new;
end;
$$;

drop trigger if exists nfos_batch_input_cost_snapshot on public.nfos_batch_inputs;
create trigger nfos_batch_input_cost_snapshot
before insert on public.nfos_batch_inputs
for each row execute function public.nfos_snapshot_batch_input_cost();

with costs as (
  select
    bi.id,
    coalesce(
      case
        when l.received_quantity is not null
         and l.received_quantity>0
         and l.received_total_cost is not null
        then l.received_total_cost/l.received_quantity
      end,
      i.standard_unit_cost,
      isp.last_unit_cost
    ) as unit_cost,
    case
      when l.received_quantity is not null
       and l.received_quantity>0
       and l.received_total_cost is not null
      then 'lot_received_cost'
      when i.standard_unit_cost is not null
      then 'item_standard_cost'
      when isp.last_unit_cost is not null
      then 'supplier_last_cost'
      else null
    end as cost_source
  from public.nfos_batch_inputs bi
  join public.nfos_items i on i.id=bi.item_id
  left join public.nfos_lots l on l.id=bi.lot_id
  left join lateral (
    select x.last_unit_cost
    from public.nfos_item_suppliers x
    where x.item_id=i.id
      and x.active
      and x.last_unit_cost is not null
    order by
      (x.supplier_id=i.preferred_supplier_id) desc,
      x.primary_supplier desc,
      x.updated_at desc
    limit 1
  ) isp on true
)
update public.nfos_batch_inputs bi
set unit_cost=c.unit_cost,
    extended_cost=bi.quantity*c.unit_cost,
    cost_source=c.cost_source
from costs c
where bi.id=c.id
  and bi.unit_cost is null
  and c.unit_cost is not null;

create or replace view public.nfos_batch_input_costs
with (security_invoker=true)
as
select
  bi.id,
  bi.batch_id,
  b.batch_code,
  b.completed_at,
  bi.item_id,
  i.sku,
  i.name as item_name,
  i.item_type,
  bi.lot_id,
  l.lot_code,
  bi.quantity,
  bi.unit,
  bi.unit_cost,
  bi.extended_cost,
  bi.cost_source,
  bi.expected_quantity,
  bi.variance_quantity,
  (bi.unit_cost is not null) as cost_complete
from public.nfos_batch_inputs bi
join public.nfos_production_batches b on b.id=bi.batch_id
join public.nfos_items i on i.id=bi.item_id
left join public.nfos_lots l on l.id=bi.lot_id;

revoke all on table public.nfos_batch_input_costs from anon;
grant select on table public.nfos_batch_input_costs to authenticated;

create or replace view public.nfos_batch_cost_summary
with (security_invoker=true)
as
with input_rollup as (
  select
    bi.batch_id,
    count(*)::integer as input_line_count,
    count(*) filter(where bi.unit_cost is null)::integer as missing_cost_lines,
    coalesce(sum(bi.extended_cost) filter(where i.item_type='material'),0)::numeric(14,4) as material_cost,
    coalesce(sum(bi.extended_cost) filter(where i.item_type='packaging'),0)::numeric(14,4) as packaging_cost,
    coalesce(sum(bi.extended_cost),0)::numeric(14,4) as total_batch_cost
  from public.nfos_batch_inputs bi
  join public.nfos_items i on i.id=bi.item_id
  group by bi.batch_id
),
output_rollup as (
  select
    batch_id,
    sum(quantity)::numeric(14,4) as finished_units
  from public.nfos_batch_outputs
  group by batch_id
)
select
  b.id as batch_id,
  b.batch_code,
  b.recipe_id,
  r.name as recipe_name,
  f.name as flavor_name,
  b.texture,
  b.status,
  b.quality_status,
  b.completed_at,
  b.actual_bulk_yield,
  b.yield_unit,
  coalesce(ir.input_line_count,0)::integer as input_line_count,
  coalesce(ir.missing_cost_lines,0)::integer as missing_cost_lines,
  coalesce(ir.material_cost,0)::numeric(14,4) as material_cost,
  coalesce(ir.packaging_cost,0)::numeric(14,4) as packaging_cost,
  coalesce(ir.total_batch_cost,0)::numeric(14,4) as total_batch_cost,
  coalesce(oroll.finished_units,0)::numeric(14,4) as finished_units,
  (
    coalesce(ir.input_line_count,0)>0
    and coalesce(ir.missing_cost_lines,0)=0
  ) as cost_complete
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.flavors f on f.id=r.legacy_flavor_id
left join input_rollup ir on ir.batch_id=b.id
left join output_rollup oroll on oroll.batch_id=b.id;

revoke all on table public.nfos_batch_cost_summary from anon;
grant select on table public.nfos_batch_cost_summary to authenticated;

create or replace view public.nfos_batch_output_costs
with (security_invoker=true)
as
with material_cost as (
  select
    bi.batch_id,
    coalesce(sum(bi.extended_cost) filter(where i.item_type='material'),0)::numeric as material_cost,
    count(*) filter(where i.item_type='material' and bi.unit_cost is null)::integer as missing_material_costs
  from public.nfos_batch_inputs bi
  join public.nfos_items i on i.id=bi.item_id
  group by bi.batch_id
),
pack_unit_cost as (
  select
    bi.batch_id,
    bi.item_id,
    case
      when sum(bi.quantity)>0
       and count(*) filter(where bi.unit_cost is null)=0
      then sum(bi.extended_cost)/sum(bi.quantity)
      else null
    end::numeric as component_unit_cost
  from public.nfos_batch_inputs bi
  join public.nfos_items i on i.id=bi.item_id
  where i.item_type='packaging'
  group by bi.batch_id,bi.item_id
),
outputs as (
  select
    bo.batch_id,
    bo.item_id,
    i.sku,
    i.name,
    i.legacy_size_id,
    i.legacy_texture,
    bo.quantity,
    fw.fill_weight_oz,
    (bo.quantity*fw.fill_weight_oz)::numeric as output_fill_oz
  from public.nfos_batch_outputs bo
  join public.nfos_items i on i.id=bo.item_id
  left join public.nfos_size_fill_weights fw on fw.size_id=i.legacy_size_id
),
batch_output_weight as (
  select
    batch_id,
    sum(output_fill_oz)::numeric as total_fill_oz
  from outputs
  group by batch_id
),
packaging_by_output as (
  select
    o.batch_id,
    o.item_id,
    sum(
      o.quantity
      * bom.quantity_per_unit
      * puc.component_unit_cost
    )::numeric as packaging_cost,
    count(*) filter(where puc.component_unit_cost is null)::integer as missing_packaging_costs
  from outputs o
  join public.nfos_sku_bom_items bom
    on bom.finished_item_id=o.item_id
   and bom.required
  left join pack_unit_cost puc
    on puc.batch_id=o.batch_id
   and puc.item_id=bom.component_item_id
  group by o.batch_id,o.item_id
)
select
  o.batch_id,
  b.batch_code,
  b.completed_at,
  o.item_id,
  o.sku,
  o.name as finished_item_name,
  o.legacy_size_id,
  o.legacy_texture,
  o.quantity as finished_quantity,
  o.fill_weight_oz,
  o.output_fill_oz,
  case
    when bow.total_fill_oz>0
     and coalesce(mc.missing_material_costs,0)=0
    then coalesce(mc.material_cost,0)*o.output_fill_oz/bow.total_fill_oz
    else null
  end::numeric(14,4) as allocated_material_cost,
  pbo.packaging_cost::numeric(14,4) as packaging_cost,
  case
    when coalesce(mc.missing_material_costs,0)=0
     and coalesce(pbo.missing_packaging_costs,0)=0
     and o.fill_weight_oz is not null
     and bow.total_fill_oz>0
    then (
      coalesce(mc.material_cost,0)*o.output_fill_oz/bow.total_fill_oz
      + coalesce(pbo.packaging_cost,0)
    )
    else null
  end::numeric(14,4) as total_allocated_cost,
  case
    when o.quantity>0
     and coalesce(mc.missing_material_costs,0)=0
     and coalesce(pbo.missing_packaging_costs,0)=0
     and o.fill_weight_oz is not null
     and bow.total_fill_oz>0
    then (
      coalesce(mc.material_cost,0)*o.output_fill_oz/bow.total_fill_oz
      + coalesce(pbo.packaging_cost,0)
    )/o.quantity
    else null
  end::numeric(14,4) as cost_per_unit,
  (
    coalesce(mc.missing_material_costs,0)=0
    and coalesce(pbo.missing_packaging_costs,0)=0
    and o.fill_weight_oz is not null
    and bow.total_fill_oz>0
  ) as cost_complete
from outputs o
join public.nfos_production_batches b on b.id=o.batch_id
left join material_cost mc on mc.batch_id=o.batch_id
left join batch_output_weight bow on bow.batch_id=o.batch_id
left join packaging_by_output pbo
  on pbo.batch_id=o.batch_id
 and pbo.item_id=o.item_id;

revoke all on table public.nfos_batch_output_costs from anon;
grant select on table public.nfos_batch_output_costs to authenticated;

create or replace view public.nfos_finished_cost_history
with (security_invoker=true)
as
select
  boc.*,
  s.price_cents as current_retail_price_cents,
  case
    when boc.cost_per_unit is not null
    then round((s.price_cents/100.0)-boc.cost_per_unit,4)
    else null
  end as retail_gross_profit_per_unit,
  case
    when boc.cost_per_unit is not null
     and s.price_cents>0
    then round(
      (((s.price_cents/100.0)-boc.cost_per_unit)/(s.price_cents/100.0))*100,
      2
    )
    else null
  end as retail_gross_margin_percent
from public.nfos_batch_output_costs boc
left join public.sizes s on s.id=boc.legacy_size_id;

revoke all on table public.nfos_finished_cost_history from anon;
grant select on table public.nfos_finished_cost_history to authenticated;

create or replace view public.nfos_current_finished_costs
with (security_invoker=true)
as
with ranked as (
  select
    h.*,
    row_number() over(
      partition by h.item_id
      order by h.completed_at desc nulls last,h.batch_id
    ) as rn
  from public.nfos_finished_cost_history h
  where h.cost_complete
)
select *
from ranked
where rn=1;

revoke all on table public.nfos_current_finished_costs from anon;
grant select on table public.nfos_current_finished_costs to authenticated;

create or replace view public.nfos_cost_readiness
with (security_invoker=true)
as
select
  i.id as item_id,
  i.sku,
  i.name,
  i.item_type,
  i.stocking_unit,
  i.standard_unit_cost,
  (
    select x.last_unit_cost
    from public.nfos_item_suppliers x
    where x.item_id=i.id
      and x.active
      and x.last_unit_cost is not null
    order by
      (x.supplier_id=i.preferred_supplier_id) desc,
      x.primary_supplier desc,
      x.updated_at desc
    limit 1
  ) as supplier_last_unit_cost,
  (
    select
      l.received_total_cost/l.received_quantity
    from public.nfos_lots l
    where l.item_id=i.id
      and l.received_quantity>0
      and l.received_total_cost is not null
    order by l.received_at desc nulls last,l.created_at desc
    limit 1
  ) as latest_lot_unit_cost,
  case
    when exists(
      select 1
      from public.nfos_lots l
      where l.item_id=i.id
        and l.received_quantity>0
        and l.received_total_cost is not null
    ) then 'ready'
    when i.standard_unit_cost is not null then 'ready'
    when exists(
      select 1
      from public.nfos_item_suppliers x
      where x.item_id=i.id
        and x.active
        and x.last_unit_cost is not null
    ) then 'ready'
    else 'cost_missing'
  end as cost_readiness
from public.nfos_items i
where i.active
  and i.item_type in ('material','packaging');

revoke all on table public.nfos_cost_readiness from anon;
grant select on table public.nfos_cost_readiness to authenticated;

create or replace view public.nfos_costing_dashboard
with (security_invoker=true)
as
select
  (select count(*) from public.nfos_cost_readiness)::integer as tracked_cost_items,
  (select count(*) from public.nfos_cost_readiness where cost_readiness='ready')::integer as cost_ready_items,
  (select count(*) from public.nfos_cost_readiness where cost_readiness='cost_missing')::integer as missing_cost_items,
  (select count(*) from public.nfos_batch_cost_summary where status='completed')::integer as completed_batches,
  (select count(*) from public.nfos_batch_cost_summary where status='completed' and cost_complete)::integer as fully_costed_batches,
  (select count(*) from public.nfos_batch_cost_summary where status='completed' and not cost_complete)::integer as incomplete_cost_batches,
  (
    select avg(retail_gross_margin_percent)
    from public.nfos_current_finished_costs
    where retail_gross_margin_percent is not null
  )::numeric(8,2) as avg_current_retail_margin_percent;

revoke all on table public.nfos_costing_dashboard from anon;
grant select on table public.nfos_costing_dashboard to authenticated;
