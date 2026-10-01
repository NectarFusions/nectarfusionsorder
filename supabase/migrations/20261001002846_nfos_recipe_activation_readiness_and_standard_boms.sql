
-- Reuse the validated Cinnamon BOM by retail size for every existing finished SKU.
with cinnamon_template as (
  select
    ci.legacy_size_id,
    b.component_item_id,
    b.quantity_per_unit,
    b.unit,
    b.required,
    b.notes
  from public.nfos_items ci
  join public.nfos_sku_bom_items b on b.finished_item_id=ci.id
  where ci.item_type='finished_good'
    and ci.legacy_flavor_id=(select id from public.flavors where name='Cinnamon' limit 1)
    and ci.legacy_texture='regular'
),
targets as (
  select i.id as finished_item_id,i.legacy_size_id
  from public.nfos_items i
  where i.item_type='finished_good'
    and i.active
    and i.legacy_size_id is not null
)
insert into public.nfos_sku_bom_items(
  finished_item_id,component_item_id,quantity_per_unit,unit,required,notes
)
select
  t.finished_item_id,
  ct.component_item_id,
  ct.quantity_per_unit,
  ct.unit,
  ct.required,
  'Standard NectarFusions retail packaging BOM by jar size.'
from targets t
join cinnamon_template ct on ct.legacy_size_id=t.legacy_size_id
on conflict(finished_item_id,component_item_id) do update
set quantity_per_unit=excluded.quantity_per_unit,
    unit=excluded.unit,
    required=excluded.required,
    notes=excluded.notes,
    updated_at=now();

create or replace view public.nfos_recipe_activation_readiness
with (security_invoker=true)
as
with input_stats as (
  select
    r.id as recipe_id,
    count(*) filter (where not ri.is_base) as infusion_input_count,
    bool_and(i.active) filter (where not ri.is_base) as all_infusion_inputs_active
  from public.nfos_recipes r
  left join public.nfos_recipe_inputs ri on ri.recipe_id=r.id
  left join public.nfos_items i on i.id=ri.item_id
  group by r.id
),
sku_stats as (
  select
    r.id as recipe_id,
    count(i.id) filter (
      where i.item_type='finished_good'
        and i.active
        and i.legacy_texture='regular'
    ) as regular_sku_count,
    count(i.id) filter (
      where i.item_type='finished_good'
        and i.active
        and i.legacy_texture='spun'
    ) as spun_sku_count,
    count(i.id) filter (
      where i.item_type='finished_good'
        and i.active
        and (
          i.legacy_texture='regular'
          or (r.spun_eligible and i.legacy_texture='spun')
        )
        and exists(
          select 1
          from public.nfos_sku_bom_items b
          where b.finished_item_id=i.id
        )
    ) as required_skus_with_bom,
    count(i.id) filter (
      where i.item_type='finished_good'
        and i.active
        and (
          i.legacy_texture='regular'
          or (r.spun_eligible and i.legacy_texture='spun')
        )
    ) as required_sku_count
  from public.nfos_recipes r
  left join public.nfos_items i on i.legacy_flavor_id=r.legacy_flavor_id
  group by r.id
)
select
  r.id as recipe_id,
  r.product_code,
  r.recipe_key,
  r.name,
  r.status,
  r.legacy_flavor_id,
  f.name as flavor_name,
  coalesce(f.active,false) as flavor_active,
  r.spun_eligible,
  coalesce(ins.infusion_input_count,0) as infusion_input_count,
  coalesce(ins.all_infusion_inputs_active,false) as all_infusion_inputs_active,
  coalesce(ss.regular_sku_count,0) as regular_sku_count,
  coalesce(ss.spun_sku_count,0) as spun_sku_count,
  coalesce(ss.required_sku_count,0) as required_sku_count,
  coalesce(ss.required_skus_with_bom,0) as required_skus_with_bom,
  (
    r.legacy_flavor_id is not null
    and coalesce(f.active,false)
    and coalesce(ins.infusion_input_count,0) > 0
    and coalesce(ins.all_infusion_inputs_active,false)
    and coalesce(ss.regular_sku_count,0) > 0
    and (not r.spun_eligible or coalesce(ss.spun_sku_count,0) > 0)
    and coalesce(ss.required_sku_count,0) = coalesce(ss.required_skus_with_bom,0)
  ) as ready_to_activate
from public.nfos_recipes r
left join public.flavors f on f.id=r.legacy_flavor_id
left join input_stats ins on ins.recipe_id=r.id
left join sku_stats ss on ss.recipe_id=r.id;

revoke all on table public.nfos_recipe_activation_readiness from anon;
grant select on table public.nfos_recipe_activation_readiness to authenticated;

create or replace function public.nfos_activate_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_recipe public.nfos_recipes%rowtype;
  v_ready boolean;
  v_base_count integer;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_recipe
  from public.nfos_recipes
  where id=p_recipe_id
  for update;

  if v_recipe.id is null then raise exception 'Recipe not found.'; end if;
  if v_recipe.status='retired' then raise exception 'A retired recipe version cannot be activated.'; end if;

  select count(*) into v_base_count
  from public.nfos_recipe_inputs
  where recipe_id=p_recipe_id and is_base;

  if v_base_count <> 1 then
    raise exception 'Exactly one base ingredient is required before activation.';
  end if;

  select ready_to_activate into v_ready
  from public.nfos_recipe_activation_readiness
  where recipe_id=p_recipe_id;

  if not coalesce(v_ready,false) then
    raise exception 'Recipe is not activation-ready. Check flavor link, active ingredients, finished SKUs, and packaging BOM coverage.';
  end if;

  update public.nfos_recipes
  set status='retired'
  where recipe_key=v_recipe.recipe_key
    and id<>p_recipe_id
    and status='active';

  update public.nfos_recipes
  set status='active'
  where id=p_recipe_id;

  return jsonb_build_object(
    'id',p_recipe_id,
    'recipe_key',v_recipe.recipe_key,
    'version',v_recipe.version,
    'status','active'
  );
end;
$$;

revoke all on function public.nfos_activate_recipe(uuid) from public,anon;
grant execute on function public.nfos_activate_recipe(uuid) to authenticated;
