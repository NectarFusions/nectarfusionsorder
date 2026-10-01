
-- Recipe SOP steps can now be specific to regular or spun production.
alter table public.nfos_recipe_steps
  add column if not exists applies_to_texture text not null default 'all';

alter table public.nfos_recipe_steps
  drop constraint if exists nfos_recipe_steps_applies_to_texture_check;

alter table public.nfos_recipe_steps
  add constraint nfos_recipe_steps_applies_to_texture_check
  check (applies_to_texture in ('all','regular','spun'));

-- Production batches carry the manufacturing texture and spun-honey controls.
alter table public.nfos_production_batches
  add column if not exists texture text not null default 'regular',
  add column if not exists seed_source_batch_code text,
  add column if not exists seed_expected_quantity numeric(14,4),
  add column if not exists seed_actual_quantity numeric(14,4),
  add column if not exists seed_unit text,
  add column if not exists seed_notes text,
  add column if not exists spun_cure_confirmed_at timestamptz,
  add column if not exists spun_cure_confirmed_by uuid,
  add column if not exists spun_cure_notes text;

alter table public.nfos_production_batches
  drop constraint if exists nfos_production_batches_texture_check;

alter table public.nfos_production_batches
  add constraint nfos_production_batches_texture_check
  check (texture in ('regular','spun'));

alter table public.nfos_production_batches
  drop constraint if exists nfos_production_batches_seed_actual_quantity_check;

alter table public.nfos_production_batches
  add constraint nfos_production_batches_seed_actual_quantity_check
  check (seed_actual_quantity is null or seed_actual_quantity > 0);

-- Per-batch confirmations for the embedded SOP.
create table if not exists public.nfos_batch_step_checks (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.nfos_production_batches(id) on delete cascade,
  recipe_step_id uuid not null references public.nfos_recipe_steps(id) on delete restrict,
  completed_at timestamptz,
  completed_by uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id,recipe_step_id)
);

create index if not exists nfos_batch_step_checks_batch_idx
  on public.nfos_batch_step_checks(batch_id);

alter table public.nfos_batch_step_checks enable row level security;
revoke all on table public.nfos_batch_step_checks from anon;
grant select,insert,update,delete on table public.nfos_batch_step_checks to authenticated;

drop policy if exists nfos_batch_step_checks_admin_all on public.nfos_batch_step_checks;
create policy nfos_batch_step_checks_admin_all
on public.nfos_batch_step_checks
for all
to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_batch_step_checks_set_updated_at on public.nfos_batch_step_checks;
create trigger nfos_batch_step_checks_set_updated_at
before update on public.nfos_batch_step_checks
for each row execute function public.nfos_set_updated_at();

-- Apply the SOP manual's regular/spun branching to imported profiles.
update public.nfos_recipe_steps s
set applies_to_texture='all'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code between 'P0003' and 'P0024';

-- Standard profiles: paddle/immediate-bottle path is Regular, standard spun path is Spun.
update public.nfos_recipe_steps s
set applies_to_texture='regular'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code in (
    'P0003','P0004','P0005','P0006','P0007','P0008','P0009','P0010',
    'P0011','P0012','P0013','P0014','P0015','P0016','P0018','P0019',
    'P0021','P0023'
  )
  and s.step_no in (6,7,8);

update public.nfos_recipe_steps s
set applies_to_texture='spun'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code in (
    'P0003','P0004','P0005','P0006','P0007','P0008','P0009','P0010',
    'P0011','P0012','P0013','P0014','P0015','P0016','P0018','P0019',
    'P0021','P0023'
  )
  and s.step_no=9;

-- Pumpkin Pie Spice and Cinnamon: settling/surface work applies to both;
-- Regular bottles after treatment, Spun continues into whisk/seed/cure.
update public.nfos_recipe_steps s
set applies_to_texture='regular'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code in ('P0017','P0022')
  and s.step_no in (9,10);

update public.nfos_recipe_steps s
set applies_to_texture='spun'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code in ('P0017','P0022')
  and s.step_no=11;

-- Espresso: one-day rest and foam reincorporation apply to both.
update public.nfos_recipe_steps s
set applies_to_texture='regular'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code='P0020'
  and s.step_no in (9,10);

update public.nfos_recipe_steps s
set applies_to_texture='spun'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code='P0020'
  and s.step_no=11;

-- Lime Jalapeno is explicitly never spun.
update public.nfos_recipe_steps s
set applies_to_texture='regular'
from public.nfos_recipes r
where s.recipe_id=r.id
  and r.product_code='P0024';

-- Start a batch with an explicit production texture.
create or replace function public.nfos_start_batch_with_texture(
  p_recipe_id uuid default null,
  p_production_order_id uuid default null,
  p_location_id uuid default null,
  p_planned_quantity numeric default null,
  p_planned_unit text default null,
  p_texture text default 'regular',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe public.nfos_recipes%rowtype;
  v_order public.nfos_production_orders%rowtype;
  v_batch public.nfos_production_batches%rowtype;
  v_location uuid;
  v_texture text := lower(coalesce(nullif(btrim(p_texture),''),'regular'));
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if v_texture not in ('regular','spun') then
    raise exception 'Texture must be Regular or Spun.';
  end if;

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

    p_recipe_id := v_order.recipe_id;
    p_planned_quantity := coalesce(p_planned_quantity,v_order.planned_quantity);
    p_planned_unit := coalesce(nullif(btrim(p_planned_unit),''),v_order.planned_unit);
  end if;

  if p_recipe_id is null then raise exception 'Recipe is required.'; end if;
  perform public.nfos_assert_recipe_ready(p_recipe_id);

  select * into v_recipe
  from public.nfos_recipes
  where id=p_recipe_id;

  if v_texture='spun' and coalesce(v_recipe.spun_eligible,false)=false then
    raise exception 'This recipe is not approved for spun honey.';
  end if;

  if p_planned_quantity is null or p_planned_quantity <= 0 then
    p_planned_quantity := v_recipe.basis_quantity;
  end if;

  p_planned_unit := coalesce(nullif(btrim(p_planned_unit),''),v_recipe.basis_unit);

  if lower(p_planned_unit) <> lower(v_recipe.basis_unit) then
    raise exception 'Batch planned unit % must match recipe basis unit %.',p_planned_unit,v_recipe.basis_unit;
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

-- Store spun seed provenance and actual weight before final batch completion.
create or replace function public.nfos_set_spun_batch_details(
  p_batch_id uuid,
  p_seed_source_batch_code text,
  p_seed_actual_quantity numeric,
  p_seed_unit text default 'oz',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.nfos_production_batches%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_batch
  from public.nfos_production_batches
  where id=p_batch_id
  for update;

  if v_batch.id is null then raise exception 'Batch not found.'; end if;
  if v_batch.status in ('completed','cancelled') then
    raise exception 'Spun details cannot be changed on a completed or cancelled batch.';
  end if;
  if v_batch.texture <> 'spun' then
    raise exception 'Seed details apply only to spun batches.';
  end if;
  if nullif(btrim(p_seed_source_batch_code),'') is null then
    raise exception 'Source seed batch code is required.';
  end if;
  if p_seed_actual_quantity is null or p_seed_actual_quantity <= 0 then
    raise exception 'Actual seed quantity must be greater than zero.';
  end if;

  update public.nfos_production_batches
  set seed_source_batch_code=btrim(p_seed_source_batch_code),
      seed_actual_quantity=p_seed_actual_quantity,
      seed_unit=coalesce(nullif(btrim(p_seed_unit),''),'oz'),
      seed_notes=nullif(btrim(p_notes),'')
  where id=p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'seed_source_batch_code',btrim(p_seed_source_batch_code),
    'seed_actual_quantity',p_seed_actual_quantity,
    'seed_unit',coalesce(nullif(btrim(p_seed_unit),''),'oz')
  );
end;
$$;

revoke all on function public.nfos_set_spun_batch_details(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.nfos_set_spun_batch_details(uuid,text,numeric,text,text) to authenticated;

-- Confirm/unconfirm an embedded SOP step for this batch.
create or replace function public.nfos_set_batch_step_completion(
  p_batch_id uuid,
  p_recipe_step_id uuid,
  p_completed boolean,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.nfos_production_batches%rowtype;
  v_step public.nfos_recipe_steps%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_batch
  from public.nfos_production_batches
  where id=p_batch_id;

  if v_batch.id is null then raise exception 'Batch not found.'; end if;
  if v_batch.status in ('completed','cancelled') then
    raise exception 'SOP confirmations are locked after batch completion.';
  end if;

  select * into v_step
  from public.nfos_recipe_steps
  where id=p_recipe_step_id
    and recipe_id=v_batch.recipe_id;

  if v_step.id is null then raise exception 'Recipe SOP step not found for this batch.'; end if;
  if v_step.applies_to_texture not in ('all',v_batch.texture) then
    raise exception 'This SOP step does not apply to the batch texture.';
  end if;

  insert into public.nfos_batch_step_checks(
    batch_id,recipe_step_id,completed_at,completed_by,notes
  )
  values(
    p_batch_id,p_recipe_step_id,
    case when coalesce(p_completed,false) then now() else null end,
    case when coalesce(p_completed,false) then auth.uid() else null end,
    nullif(btrim(p_notes),'')
  )
  on conflict(batch_id,recipe_step_id) do update
  set completed_at=excluded.completed_at,
      completed_by=excluded.completed_by,
      notes=excluded.notes,
      updated_at=now();

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'recipe_step_id',p_recipe_step_id,
    'completed',coalesce(p_completed,false)
  );
end;
$$;

revoke all on function public.nfos_set_batch_step_completion(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.nfos_set_batch_step_completion(uuid,uuid,boolean,text) to authenticated;

-- Confirm the mandatory two-week spun cure only after its hold has elapsed.
create or replace function public.nfos_confirm_spun_cure(
  p_batch_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.nfos_production_batches%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_batch
  from public.nfos_production_batches
  where id=p_batch_id
  for update;

  if v_batch.id is null then raise exception 'Batch not found.'; end if;
  if v_batch.texture <> 'spun' then raise exception 'This is not a spun batch.'; end if;
  if v_batch.status <> 'completed' then raise exception 'Complete the batch before confirming cure.'; end if;
  if v_batch.released_at is not null then raise exception 'Batch is already released.'; end if;
  if v_batch.release_not_before is not null and now() < v_batch.release_not_before then
    raise exception 'The two-week spun cure is not complete until %.',v_batch.release_not_before;
  end if;

  update public.nfos_production_batches
  set spun_cure_confirmed_at=now(),
      spun_cure_confirmed_by=auth.uid(),
      spun_cure_notes=nullif(btrim(p_notes),'')
  where id=p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'spun_cure_confirmed_at',(select spun_cure_confirmed_at from public.nfos_production_batches where id=p_batch_id)
  );
end;
$$;

revoke all on function public.nfos_confirm_spun_cure(uuid,text) from public,anon;
grant execute on function public.nfos_confirm_spun_cure(uuid,text) to authenticated;

-- Prevent the wrong finished texture from being posted to a batch.
create or replace function public.nfos_validate_batch_output_texture()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_texture text;
  v_spun_allowed boolean;
  v_item_texture text;
begin
  select b.texture,r.spun_eligible
  into v_texture,v_spun_allowed
  from public.nfos_production_batches b
  join public.nfos_recipes r on r.id=b.recipe_id
  where b.id=new.batch_id;

  select legacy_texture into v_item_texture
  from public.nfos_items
  where id=new.item_id;

  if v_texture='spun' and coalesce(v_spun_allowed,false)=false then
    raise exception 'This recipe is not approved for spun honey.';
  end if;

  if lower(coalesce(v_item_texture,'')) <> lower(coalesce(v_texture,'')) then
    raise exception 'Finished output texture % does not match batch texture %.',
      coalesce(v_item_texture,'unknown'),v_texture;
  end if;

  return new;
end;
$$;

drop trigger if exists nfos_batch_output_texture_guard on public.nfos_batch_outputs;
create trigger nfos_batch_output_texture_guard
before insert on public.nfos_batch_outputs
for each row execute function public.nfos_validate_batch_output_texture();

-- Completion requires all applicable operator-confirmation steps and spun seed provenance.
create or replace function public.nfos_validate_batch_completion_control()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_spun_allowed boolean;
  v_required_steps integer := 0;
  v_completed_steps integer := 0;
  v_base_oz numeric;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select coalesce(spun_eligible,false)
    into v_spun_allowed
    from public.nfos_recipes
    where id=new.recipe_id;

    if new.texture='spun' then
      if not v_spun_allowed then
        raise exception 'This recipe is not approved for spun honey.';
      end if;

      if nullif(btrim(new.seed_source_batch_code),'') is null then
        raise exception 'Record the prior natural spun-honey seed batch before completing this batch.';
      end if;

      if new.seed_actual_quantity is null or new.seed_actual_quantity <= 0 then
        raise exception 'Record the actual natural spun-honey seed quantity before completing this batch.';
      end if;

      select public.nfos_convert_weight(bi.quantity,bi.unit,'oz')
      into v_base_oz
      from public.nfos_batch_inputs bi
      join public.nfos_recipe_inputs ri on ri.id=bi.recipe_input_id
      where bi.batch_id=new.id
        and ri.is_base
      limit 1;

      if v_base_oz is null then
        raise exception 'Actual base honey usage must be recorded before completing a spun batch.';
      end if;

      new.seed_expected_quantity := round(v_base_oz * 0.10,4);
      new.seed_unit := coalesce(nullif(btrim(new.seed_unit),''),'oz');
    end if;

    select count(*)
    into v_required_steps
    from public.nfos_recipe_steps
    where recipe_id=new.recipe_id
      and requires_confirmation
      and applies_to_texture in ('all',new.texture);

    select count(*)
    into v_completed_steps
    from public.nfos_batch_step_checks c
    join public.nfos_recipe_steps s on s.id=c.recipe_step_id
    where c.batch_id=new.id
      and c.completed_at is not null
      and s.requires_confirmation
      and s.applies_to_texture in ('all',new.texture);

    if v_completed_steps < v_required_steps then
      raise exception 'Complete all required SOP confirmations before completing this batch (% of % complete).',
        v_completed_steps,v_required_steps;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists nfos_batch_completion_control on public.nfos_production_batches;
create trigger nfos_batch_completion_control
before update of status on public.nfos_production_batches
for each row execute function public.nfos_validate_batch_completion_control();

-- Effective release hold: recipe hold OR mandatory 14-day spun cure, whichever is longer.
create or replace function public.nfos_set_batch_release_window()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe_days integer := 0;
  v_effective_days integer := 0;
begin
  if new.status='completed' and old.status is distinct from 'completed' then
    select release_hold_days into v_recipe_days
    from public.nfos_recipes
    where id=new.recipe_id;

    v_effective_days := greatest(
      coalesce(v_recipe_days,0),
      case when new.texture='spun' then 14 else 0 end
    );

    if v_effective_days > 0 then
      new.release_not_before := coalesce(new.completed_at,now()) + make_interval(days=>v_effective_days);
      new.released_at := null;
      new.released_by := null;
    else
      new.release_not_before := coalesce(new.completed_at,now());
      new.released_at := coalesce(new.released_at,coalesce(new.completed_at,now()));
      new.released_by := coalesce(new.released_by,new.completed_by);
    end if;
  end if;
  return new;
end;
$$;

-- Route all held output into the non-sellable HOLD location.
create or replace function public.nfos_hold_finished_batch_output()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_recipe_days integer := 0;
  v_effective_days integer := 0;
  v_texture text;
  v_hold uuid;
  v_batch_code text;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select r.release_hold_days,b.texture,b.batch_code
  into v_recipe_days,v_texture,v_batch_code
  from public.nfos_production_batches b
  join public.nfos_recipes r on r.id=b.recipe_id
  where b.id=new.batch_id;

  v_effective_days := greatest(
    coalesce(v_recipe_days,0),
    case when v_texture='spun' then 14 else 0 end
  );

  if v_effective_days <= 0 then
    return new;
  end if;

  select id into v_hold
  from public.nfos_locations
  where code='HOLD' and active
  limit 1;

  if v_hold is null then
    raise exception 'NFOS hold location is missing.';
  end if;

  perform public.nfos_record_inventory_movement(
    new.item_id,new.quantity,new.location_id,v_hold,'transfer',new.lot_id,
    'production_hold',new.batch_id::text,null,
    'Automatic production release hold for ' || coalesce(v_batch_code,new.batch_id::text),
    now(),'production_hold'
  );

  update public.nfos_lots
  set status='hold'
  where id=new.lot_id;

  return new;
end;
$$;

-- Spun cure must be confirmed before release.
create or replace function public.nfos_release_batch(
  p_batch_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.nfos_production_batches%rowtype;
  v_hold uuid;
  v_row record;
  v_dest uuid;
  v_qty numeric;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into v_batch
  from public.nfos_production_batches
  where id=p_batch_id
  for update;

  if v_batch.id is null then raise exception 'Batch not found.'; end if;
  if v_batch.status <> 'completed' then raise exception 'Only completed batches can be released.'; end if;
  if v_batch.quality_status <> 'passed' then raise exception 'Batch quality checks have not passed.'; end if;
  if v_batch.released_at is not null then raise exception 'Batch is already released.'; end if;
  if v_batch.release_not_before is not null and now() < v_batch.release_not_before then
    raise exception 'Batch cannot be released until %.',v_batch.release_not_before;
  end if;
  if v_batch.texture='spun' and v_batch.spun_cure_confirmed_at is null then
    raise exception 'Confirm the completed two-week cure below 41°F before releasing this spun batch.';
  end if;

  select id into v_hold
  from public.nfos_locations
  where code='HOLD'
  limit 1;

  if v_hold is null then raise exception 'NFOS hold location is missing.'; end if;

  for v_row in
    select distinct bo.item_id,bo.lot_id,i.default_location_id
    from public.nfos_batch_outputs bo
    join public.nfos_items i on i.id=bo.item_id
    where bo.batch_id=p_batch_id
  loop
    select coalesce(sum(on_hand),0)
    into v_qty
    from public.nfos_lot_balances
    where lot_id=v_row.lot_id
      and location_id=v_hold;

    if v_qty > 0 then
      v_dest := coalesce(
        v_row.default_location_id,
        (select id from public.nfos_locations where code='MAIN' limit 1)
      );

      perform public.nfos_record_inventory_movement(
        v_row.item_id,v_qty,v_hold,v_dest,'transfer',v_row.lot_id,
        'batch_release',p_batch_id::text,null,
        'Released after required production hold',now(),'batch_release'
      );

      update public.nfos_lots
      set status='available'
      where id=v_row.lot_id;
    end if;
  end loop;

  update public.nfos_production_batches
  set released_at=now(),
      released_by=auth.uid(),
      release_notes=nullif(btrim(p_notes),'')
  where id=p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'released_at',(select released_at from public.nfos_production_batches where id=p_batch_id),
    'status','released'
  );
end;
$$;

revoke all on function public.nfos_release_batch(uuid,text) from public,anon;
grant execute on function public.nfos_release_batch(uuid,text) to authenticated;

-- Batch SOP view for the operator screen.
drop view if exists public.nfos_batch_sop;
create view public.nfos_batch_sop
with (security_invoker=true)
as
select
  b.id as batch_id,
  b.batch_code,
  b.texture,
  s.id as recipe_step_id,
  s.step_no,
  s.title,
  s.instruction,
  s.requires_confirmation,
  s.critical_control,
  s.expected_minutes,
  s.notes,
  s.applies_to_texture,
  c.completed_at,
  c.completed_by,
  c.notes as completion_notes
from public.nfos_production_batches b
join public.nfos_recipe_steps s on s.recipe_id=b.recipe_id
left join public.nfos_batch_step_checks c
  on c.batch_id=b.id and c.recipe_step_id=s.id
where s.applies_to_texture in ('all',b.texture);

revoke all on table public.nfos_batch_sop from anon;
grant select on table public.nfos_batch_sop to authenticated;

-- Refresh batch overview with texture/cure/release state.
drop view if exists public.nfos_batch_overview;
create view public.nfos_batch_overview
with (security_invoker=true)
as
select
  b.id,
  b.batch_code,
  b.production_order_id,
  po.order_no,
  b.recipe_id,
  r.name as recipe_name,
  r.version as recipe_version,
  r.legacy_flavor_id,
  f.name as flavor_name,
  b.status,
  b.quality_status,
  b.texture,
  b.production_location_id,
  l.name as production_location_name,
  b.planned_quantity,
  b.planned_unit,
  b.actual_bulk_yield,
  b.yield_unit,
  b.started_at,
  b.completed_at,
  b.release_not_before,
  b.released_at,
  b.release_notes,
  greatest(coalesce(r.release_hold_days,0),case when b.texture='spun' then 14 else 0 end) as release_hold_days,
  b.seed_source_batch_code,
  b.seed_expected_quantity,
  b.seed_actual_quantity,
  b.seed_unit,
  b.seed_notes,
  b.spun_cure_confirmed_at,
  b.spun_cure_notes,
  case
    when b.status <> 'completed' then 'not_ready'
    when b.released_at is not null then 'released'
    when b.release_not_before is not null and now() < b.release_not_before then 'holding'
    when b.texture='spun' and b.spun_cure_confirmed_at is null then 'cure_pending'
    else 'eligible'
  end as release_status,
  b.barcode_value,
  b.barcode_format,
  b.notes,
  count(distinct bi.id)::integer as input_count,
  count(distinct bo.id)::integer as output_count
from public.nfos_production_batches b
join public.nfos_recipes r on r.id=b.recipe_id
left join public.flavors f on f.id=r.legacy_flavor_id
left join public.nfos_production_orders po on po.id=b.production_order_id
left join public.nfos_locations l on l.id=b.production_location_id
left join public.nfos_batch_inputs bi on bi.batch_id=b.id
left join public.nfos_batch_outputs bo on bo.batch_id=b.id
group by b.id,po.order_no,r.name,r.version,r.legacy_flavor_id,r.release_hold_days,
         r.spun_eligible,f.name,l.name;

revoke all on table public.nfos_batch_overview from anon;
grant select on table public.nfos_batch_overview to authenticated;
