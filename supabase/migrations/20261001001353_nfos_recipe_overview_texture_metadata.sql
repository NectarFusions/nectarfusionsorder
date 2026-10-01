
drop view if exists public.nfos_recipe_overview;
create view public.nfos_recipe_overview
with (security_invoker = true)
as
select
  r.id,
  r.recipe_key,
  r.name,
  r.legacy_flavor_id,
  f.name as flavor_name,
  r.version,
  r.status,
  r.basis_quantity,
  r.basis_unit,
  r.expected_yield_quantity,
  r.expected_yield_unit,
  r.release_hold_days,
  r.product_code,
  r.flavor_code,
  r.category,
  r.primary_ingredient_label,
  r.spun_eligible,
  r.source_document,
  r.instructions,
  r.notes,
  r.created_at,
  r.updated_at,
  count(distinct ri.id)::integer as input_count,
  count(distinct rs.id)::integer as step_count,
  count(distinct rq.id)::integer as quality_spec_count
from public.nfos_recipes r
left join public.flavors f on f.id=r.legacy_flavor_id
left join public.nfos_recipe_inputs ri on ri.recipe_id=r.id
left join public.nfos_recipe_steps rs on rs.recipe_id=r.id
left join public.nfos_recipe_quality_specs rq on rq.recipe_id=r.id
group by r.id,f.name;

revoke all on table public.nfos_recipe_overview from anon;
grant select on table public.nfos_recipe_overview to authenticated;
