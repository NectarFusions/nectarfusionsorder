
alter table public.nfos_recipes
  add column if not exists product_code text,
  add column if not exists flavor_code text,
  add column if not exists category text,
  add column if not exists primary_ingredient_label text,
  add column if not exists spun_eligible boolean,
  add column if not exists source_document text;

create unique index if not exists nfos_recipes_product_code_version_uidx
  on public.nfos_recipes(product_code,version)
  where product_code is not null;

create or replace function public.nfos_activate_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe public.nfos_recipes%rowtype;
  v_base_count integer;
  v_inactive_inputs integer;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_recipe
  from public.nfos_recipes
  where id=p_recipe_id
  for update;

  if v_recipe.id is null then raise exception 'Recipe not found.'; end if;
  if v_recipe.status='retired' then raise exception 'A retired recipe version cannot be activated.'; end if;
  if not exists(select 1 from public.nfos_recipe_inputs where recipe_id=p_recipe_id) then
    raise exception 'Add at least one recipe input before activating.';
  end if;

  select count(*) into v_base_count
  from public.nfos_recipe_inputs
  where recipe_id=p_recipe_id and is_base;

  if v_base_count <> 1 then
    raise exception 'Exactly one base ingredient is required before activating this recipe.';
  end if;

  select count(*) into v_inactive_inputs
  from public.nfos_recipe_inputs ri
  join public.nfos_items i on i.id=ri.item_id
  where ri.recipe_id=p_recipe_id
    and not i.active;

  if v_inactive_inputs > 0 then
    raise exception 'All recipe ingredients must be active before activation.';
  end if;

  if v_recipe.product_code is not null and v_recipe.legacy_flavor_id is null then
    raise exception 'This SOP product profile must be linked to a finished flavor before activation.';
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

revoke all on function public.nfos_activate_recipe(uuid) from public, anon;
grant execute on function public.nfos_activate_recipe(uuid) to authenticated;
