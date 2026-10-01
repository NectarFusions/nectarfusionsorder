create or replace function public.nfos_update_production_order_with_plan(
  p_production_order_id uuid,
  p_recipe_id uuid,
  p_planned_quantity numeric,
  p_texture text default 'regular',
  p_outputs jsonb default '[]'::jsonb,
  p_due_date date default null,
  p_priority text default 'normal',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.nfos_production_orders%rowtype;
  v_recipe public.nfos_recipes%rowtype;
  v_plan jsonb;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_order
  from public.nfos_production_orders
  where id = p_production_order_id
  for update;

  if v_order.id is null then
    raise exception 'Production order not found.';
  end if;

  if v_order.status <> 'planned' then
    raise exception 'Only planned production orders can be edited.';
  end if;

  if exists(
    select 1
    from public.nfos_production_batches
    where production_order_id = p_production_order_id
  ) then
    raise exception 'This production order is locked because a batch has already been started.';
  end if;

  perform public.nfos_assert_recipe_ready(p_recipe_id);

  if p_planned_quantity is null or p_planned_quantity <= 0 then
    raise exception 'Planned quantity must be greater than zero.';
  end if;

  select *
  into v_recipe
  from public.nfos_recipes
  where id = p_recipe_id;

  if v_recipe.id is null then
    raise exception 'Recipe not found.';
  end if;

  update public.nfos_production_orders
  set
    recipe_id = p_recipe_id,
    planned_quantity = p_planned_quantity,
    planned_unit = v_recipe.basis_unit,
    due_date = p_due_date,
    priority = case
      when p_priority in ('low','normal','high','urgent') then p_priority
      else 'normal'
    end,
    notes = nullif(btrim(p_notes),''),
    updated_at = now()
  where id = p_production_order_id
  returning * into v_order;

  v_plan := public.nfos_set_production_order_plan(
    p_production_order_id,
    p_texture,
    coalesce(p_outputs,'[]'::jsonb)
  );

  return jsonb_build_object(
    'id', v_order.id,
    'order_no', v_order.order_no,
    'status', v_order.status,
    'recipe_id', v_order.recipe_id,
    'planned_quantity', v_order.planned_quantity,
    'planned_unit', v_order.planned_unit,
    'texture', v_plan->>'texture',
    'planned_output_count', (v_plan->>'planned_output_count')::integer
  );
end;
$function$;

revoke all on function public.nfos_update_production_order_with_plan(uuid,uuid,numeric,text,jsonb,date,text,text) from public;
revoke all on function public.nfos_update_production_order_with_plan(uuid,uuid,numeric,text,jsonb,date,text,text) from anon;
grant execute on function public.nfos_update_production_order_with_plan(uuid,uuid,numeric,text,jsonb,date,text,text) to authenticated;
grant execute on function public.nfos_update_production_order_with_plan(uuid,uuid,numeric,text,jsonb,date,text,text) to service_role;

create or replace function public.nfos_delete_production_order(
  p_production_order_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.nfos_production_orders%rowtype;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select *
  into v_order
  from public.nfos_production_orders
  where id = p_production_order_id
  for update;

  if v_order.id is null then
    raise exception 'Production order not found.';
  end if;

  if v_order.status <> 'planned' then
    raise exception 'Only planned production orders can be deleted.';
  end if;

  if exists(
    select 1
    from public.nfos_production_batches
    where production_order_id = p_production_order_id
  ) then
    raise exception 'This production order cannot be deleted because a batch has already been started.';
  end if;

  delete from public.nfos_production_orders
  where id = p_production_order_id;

  return jsonb_build_object(
    'deleted', true,
    'id', v_order.id,
    'order_no', v_order.order_no
  );
end;
$function$;

revoke all on function public.nfos_delete_production_order(uuid) from public;
revoke all on function public.nfos_delete_production_order(uuid) from anon;
grant execute on function public.nfos_delete_production_order(uuid) to authenticated;
grant execute on function public.nfos_delete_production_order(uuid) to service_role;
