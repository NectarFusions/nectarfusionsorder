create sequence if not exists public.nfos_change_request_seq start with 1;

create table if not exists public.nfos_change_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique default ('EDIT-' || lpad(nextval('public.nfos_change_request_seq'::regclass)::text, 6, '0')),
  target_type text not null check (target_type in ('production_order')),
  target_id uuid not null,
  requested_by_member_id uuid not null references public.nfos_team_members(id),
  requested_by_user_id uuid not null references auth.users(id),
  current_snapshot jsonb not null default '{}'::jsonb,
  proposed_changes jsonb not null default '{}'::jsonb,
  reason text,
  base_updated_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nfos_change_requests enable row level security;

drop policy if exists "NFOS change requests self or admin read" on public.nfos_change_requests;
create policy "NFOS change requests self or admin read"
on public.nfos_change_requests for select to authenticated
using (requested_by_user_id = (select auth.uid()) or (select public.nf_is_admin()));

revoke all on table public.nfos_change_requests from anon;
revoke all on table public.nfos_change_requests from authenticated;
grant select, insert, update, delete on table public.nfos_change_requests to service_role;

create index if not exists nfos_change_requests_status_created_idx on public.nfos_change_requests(status, created_at desc);
create index if not exists nfos_change_requests_target_idx on public.nfos_change_requests(target_type, target_id, created_at desc);
create index if not exists nfos_change_requests_requester_idx on public.nfos_change_requests(requested_by_member_id, created_at desc);

create or replace view public.nfos_production_queue
with (security_invoker = true)
as
select
  po.id,po.order_no,po.recipe_id,r.name as recipe_name,f.name as flavor_name,
  po.status,po.priority,po.planned_quantity,po.planned_unit,po.planned_texture,
  po.requested_date,po.due_date,po.assigned_to,po.notes,po.created_at,po.updated_at,
  count(distinct b.id) filter (where b.status <> 'cancelled')::integer as batch_count,
  count(distinct b.id) filter (where b.status in ('draft','in_progress','qc_hold'))::integer as open_batch_count,
  coalesce(sum(b.actual_bulk_yield) filter (where b.status = 'completed'),0)::numeric(14,4) as completed_bulk_yield,
  count(distinct poo.finished_item_id)::integer as planned_output_sku_count,
  coalesce(sum(poo.quantity_planned),0)::numeric(14,4) as planned_finished_units,
  count(distinct poo.finished_item_id) > 0 as packaging_plan_complete,
  po.assigned_member_id,
  tm.display_name as assigned_member_name
from public.nfos_production_orders po
join public.nfos_recipes r on r.id=po.recipe_id
left join public.flavors f on f.id=r.legacy_flavor_id
left join public.nfos_team_members tm on tm.id=po.assigned_member_id and tm.deleted_at is null
left join public.nfos_production_batches b on b.production_order_id=po.id
left join public.nfos_production_order_outputs poo on poo.production_order_id=po.id
group by po.id,r.name,f.name,tm.display_name;

create or replace function nfos_private.employee_start_assigned_batch(
  p_production_order_id uuid,
  p_location_id uuid default null,
  p_planned_quantity numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_member uuid;
  v_roles text[];
  v_order public.nfos_production_orders%rowtype;
  v_recipe public.nfos_recipes%rowtype;
  v_batch public.nfos_production_batches%rowtype;
  v_location uuid;
  v_qty numeric;
begin
  v_member := nfos_private.current_member_id('production.execute');
  select roles into v_roles from public.nfos_team_members where id=v_member and active and deleted_at is null;

  select * into v_order from public.nfos_production_orders where id=p_production_order_id for update;
  if v_order.id is null then raise exception 'Production order not found.'; end if;
  if v_order.status <> 'planned' then raise exception 'This production order has already been started or is no longer available to start.'; end if;
  if exists(select 1 from public.nfos_production_batches where production_order_id=v_order.id and status <> 'cancelled') then
    raise exception 'A production batch has already been started for this order.';
  end if;

  if not (coalesce(v_roles,'{}'::text[]) && array['owner','operations_manager']::text[])
     and v_order.assigned_member_id is distinct from v_member then
    raise exception 'This production order is not assigned to you.';
  end if;

  select * into v_recipe from public.nfos_recipes where id=v_order.recipe_id;
  if v_recipe.id is null then raise exception 'Recipe not found.'; end if;
  if v_recipe.status <> 'active' then raise exception 'Only an active recipe version can be released to production.'; end if;
  if not exists(select 1 from public.nfos_recipe_inputs where recipe_id=v_recipe.id) then raise exception 'The active recipe has no inputs.'; end if;
  if v_order.planned_texture='spun' and not coalesce(v_recipe.spun_eligible,false) then raise exception 'This recipe is not approved for spun honey.'; end if;

  v_location:=p_location_id;
  if v_location is null then select id into v_location from public.nfos_locations where code='MAIN' and active limit 1; end if;
  if v_location is null or not exists(select 1 from public.nfos_locations where id=v_location and active) then
    raise exception 'An active production location is required.';
  end if;

  v_qty:=coalesce(p_planned_quantity,v_order.planned_quantity);
  if v_qty is null or v_qty<=0 then raise exception 'Planned batch quantity must be greater than zero.'; end if;

  insert into public.nfos_production_batches(
    production_order_id,recipe_id,production_location_id,planned_quantity,planned_unit,texture,started_by,notes
  ) values (
    v_order.id,v_order.recipe_id,v_location,v_qty,v_order.planned_unit,v_order.planned_texture,auth.uid(),nullif(btrim(p_notes),'')
  ) returning * into v_batch;

  insert into public.nfos_quality_checks(batch_id,quality_spec_id,check_key,label,result_type,unit,status)
  select v_batch.id,q.id,q.check_key,q.label,q.result_type,q.unit,'pending'
  from public.nfos_recipe_quality_specs q
  where q.recipe_id=v_order.recipe_id
  on conflict(batch_id,check_key) do nothing;

  update public.nfos_production_orders set status='in_progress',updated_at=now() where id=v_order.id;

  return jsonb_build_object(
    'id',v_batch.id,'batch_code',v_batch.batch_code,'barcode_value',v_batch.barcode_value,
    'status',v_batch.status,'texture',v_batch.texture,'production_order_id',v_order.id
  );
end;
$function$;

revoke all on function nfos_private.employee_start_assigned_batch(uuid,uuid,numeric,text) from public;
revoke all on function nfos_private.employee_start_assigned_batch(uuid,uuid,numeric,text) from anon;
grant execute on function nfos_private.employee_start_assigned_batch(uuid,uuid,numeric,text) to authenticated;

create or replace function nfos_private.submit_production_edit_suggestion(
  p_production_order_id uuid,p_planned_quantity numeric,p_due_date date,p_priority text,p_notes text,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_member uuid;
  v_order public.nfos_production_orders%rowtype;
  v_request public.nfos_change_requests%rowtype;
begin
  v_member := nfos_private.current_member_id(null);
  if p_reason is null or btrim(p_reason)='' then raise exception 'Explain why you are suggesting this edit.'; end if;

  select * into v_order from public.nfos_production_orders where id=p_production_order_id for share;
  if v_order.id is null then raise exception 'Production order not found.'; end if;
  if v_order.status <> 'planned' then raise exception 'Only production orders that have not started can receive edit suggestions.'; end if;
  if exists(select 1 from public.nfos_production_batches where production_order_id=v_order.id and status <> 'cancelled') then
    raise exception 'This production order has already started and can no longer be edited.';
  end if;
  if p_planned_quantity is null or p_planned_quantity <= 0 then raise exception 'Suggested planned quantity must be greater than zero.'; end if;
  if p_priority not in ('low','normal','high','urgent') then raise exception 'Suggested priority is invalid.'; end if;

  insert into public.nfos_change_requests(
    target_type,target_id,requested_by_member_id,requested_by_user_id,current_snapshot,proposed_changes,reason,base_updated_at
  ) values (
    'production_order',v_order.id,v_member,auth.uid(),
    jsonb_build_object('planned_quantity',v_order.planned_quantity,'due_date',v_order.due_date,'priority',v_order.priority,'notes',v_order.notes),
    jsonb_build_object('planned_quantity',p_planned_quantity,'due_date',p_due_date,'priority',p_priority,'notes',nullif(btrim(p_notes),'')),
    btrim(p_reason),v_order.updated_at
  ) returning * into v_request;

  return jsonb_build_object('id',v_request.id,'request_no',v_request.request_no,'status',v_request.status,'production_order_id',v_order.id,'order_no',v_order.order_no);
end;
$function$;

create or replace function nfos_private.employee_suggestion_workspace()
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_member uuid;
  v_orders jsonb;
  v_requests jsonb;
begin
  v_member := nfos_private.current_member_id(null);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date nulls last,x.order_no),'[]'::jsonb)
  into v_orders
  from (
    select po.id,po.order_no,po.planned_quantity,po.planned_unit,po.planned_texture,po.due_date,po.priority,po.notes,po.updated_at,
           r.name as recipe_name,f.name as flavor_name,tm.display_name as assigned_member_name
    from public.nfos_production_orders po
    join public.nfos_recipes r on r.id=po.recipe_id
    left join public.flavors f on f.id=r.legacy_flavor_id
    left join public.nfos_team_members tm on tm.id=po.assigned_member_id
    where po.status='planned'
      and not exists(select 1 from public.nfos_production_batches b where b.production_order_id=po.id and b.status <> 'cancelled')
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_requests
  from (
    select cr.id,cr.request_no,cr.target_id,cr.current_snapshot,cr.proposed_changes,cr.reason,cr.status,cr.review_notes,cr.created_at,cr.reviewed_at,
           po.order_no,r.name as recipe_name,f.name as flavor_name
    from public.nfos_change_requests cr
    left join public.nfos_production_orders po on cr.target_type='production_order' and po.id=cr.target_id
    left join public.nfos_recipes r on r.id=po.recipe_id
    left join public.flavors f on f.id=r.legacy_flavor_id
    where cr.requested_by_member_id=v_member
    order by cr.created_at desc
    limit 100
  ) x;

  return jsonb_build_object('orders',v_orders,'requests',v_requests);
end;
$function$;

create or replace function nfos_private.admin_suggestion_workspace()
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_requests jsonb;
begin
  if auth.uid() is null or not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by case when x.status='pending' then 0 else 1 end,x.created_at desc),'[]'::jsonb)
  into v_requests
  from (
    select cr.id,cr.request_no,cr.target_type,cr.target_id,cr.current_snapshot,cr.proposed_changes,cr.reason,cr.base_updated_at,
           cr.status,cr.review_notes,cr.created_at,cr.reviewed_at,cr.applied_at,tm.display_name as requested_by_name,
           po.order_no,po.status as order_status,po.updated_at as order_updated_at,r.name as recipe_name,f.name as flavor_name
    from public.nfos_change_requests cr
    join public.nfos_team_members tm on tm.id=cr.requested_by_member_id
    left join public.nfos_production_orders po on cr.target_type='production_order' and po.id=cr.target_id
    left join public.nfos_recipes r on r.id=po.recipe_id
    left join public.flavors f on f.id=r.legacy_flavor_id
    order by cr.created_at desc
    limit 200
  ) x;

  return jsonb_build_object('requests',v_requests);
end;
$function$;

create or replace function nfos_private.review_production_edit_suggestion(
  p_request_id uuid,p_action text,p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','nfos_private'
as $function$
declare
  v_request public.nfos_change_requests%rowtype;
  v_order public.nfos_production_orders%rowtype;
  v_action text := lower(coalesce(btrim(p_action),''));
  v_qty numeric;
  v_due date;
  v_priority text;
  v_notes text;
begin
  if auth.uid() is null or not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if v_action not in ('approve','reject') then raise exception 'Review action must be approve or reject.'; end if;

  select * into v_request from public.nfos_change_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Suggested edit not found.'; end if;
  if v_request.status <> 'pending' then raise exception 'This suggested edit has already been reviewed.'; end if;

  if v_action='reject' then
    update public.nfos_change_requests
    set status='rejected',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=nullif(btrim(p_review_notes),''),updated_at=now()
    where id=v_request.id;
    return jsonb_build_object('id',v_request.id,'request_no',v_request.request_no,'status','rejected');
  end if;

  select * into v_order from public.nfos_production_orders where id=v_request.target_id for update;
  if v_order.id is null then raise exception 'Production order no longer exists.'; end if;
  if v_order.status <> 'planned' then raise exception 'This production order has already started and the suggestion can no longer be applied.'; end if;
  if exists(select 1 from public.nfos_production_batches where production_order_id=v_order.id and status <> 'cancelled') then
    raise exception 'This production order has already started and the suggestion can no longer be applied.';
  end if;
  if v_order.updated_at is distinct from v_request.base_updated_at then
    raise exception 'This production order changed after the suggestion was submitted. Review the current order before approving.';
  end if;

  v_qty := (v_request.proposed_changes->>'planned_quantity')::numeric;
  v_due := nullif(v_request.proposed_changes->>'due_date','')::date;
  v_priority := v_request.proposed_changes->>'priority';
  v_notes := nullif(btrim(v_request.proposed_changes->>'notes'),'');
  if v_qty is null or v_qty <= 0 then raise exception 'Suggested planned quantity is invalid.'; end if;
  if v_priority not in ('low','normal','high','urgent') then raise exception 'Suggested priority is invalid.'; end if;

  update public.nfos_production_orders
  set planned_quantity=v_qty,due_date=v_due,priority=v_priority,notes=v_notes,updated_at=now()
  where id=v_order.id;

  update public.nfos_change_requests
  set status='approved',reviewed_by=auth.uid(),reviewed_at=now(),review_notes=nullif(btrim(p_review_notes),''),applied_at=now(),updated_at=now()
  where id=v_request.id;

  return jsonb_build_object('id',v_request.id,'request_no',v_request.request_no,'status','approved','production_order_id',v_order.id,'order_no',v_order.order_no);
end;
$function$;

revoke all on function nfos_private.submit_production_edit_suggestion(uuid,numeric,date,text,text,text) from public;
revoke all on function nfos_private.submit_production_edit_suggestion(uuid,numeric,date,text,text,text) from anon;
grant execute on function nfos_private.submit_production_edit_suggestion(uuid,numeric,date,text,text,text) to authenticated;
revoke all on function nfos_private.employee_suggestion_workspace() from public;
revoke all on function nfos_private.employee_suggestion_workspace() from anon;
grant execute on function nfos_private.employee_suggestion_workspace() to authenticated;
revoke all on function nfos_private.admin_suggestion_workspace() from public;
revoke all on function nfos_private.admin_suggestion_workspace() from anon;
grant execute on function nfos_private.admin_suggestion_workspace() to authenticated;
revoke all on function nfos_private.review_production_edit_suggestion(uuid,text,text) from public;
revoke all on function nfos_private.review_production_edit_suggestion(uuid,text,text) from anon;
grant execute on function nfos_private.review_production_edit_suggestion(uuid,text,text) to authenticated;

create or replace function public.nfos_employee_submit_production_edit_suggestion(
  p_production_order_id uuid,p_planned_quantity numeric,p_due_date date default null,p_priority text default 'normal',p_notes text default null,p_reason text default null
)
returns jsonb
language sql
set search_path to 'public','nfos_private'
as $function$ select nfos_private.submit_production_edit_suggestion(p_production_order_id,p_planned_quantity,p_due_date,p_priority,p_notes,p_reason); $function$;

create or replace function public.nfos_employee_get_suggestion_workspace()
returns jsonb
language sql stable
set search_path to 'public','nfos_private'
as $function$ select nfos_private.employee_suggestion_workspace(); $function$;

create or replace function public.nfos_admin_get_suggestion_workspace()
returns jsonb
language sql stable
set search_path to 'public','nfos_private'
as $function$ select nfos_private.admin_suggestion_workspace(); $function$;

create or replace function public.nfos_admin_review_production_edit_suggestion(
  p_request_id uuid,p_action text,p_review_notes text default null
)
returns jsonb
language sql
set search_path to 'public','nfos_private'
as $function$ select nfos_private.review_production_edit_suggestion(p_request_id,p_action,p_review_notes); $function$;

revoke all on function public.nfos_employee_submit_production_edit_suggestion(uuid,numeric,date,text,text,text) from public;
revoke all on function public.nfos_employee_submit_production_edit_suggestion(uuid,numeric,date,text,text,text) from anon;
grant execute on function public.nfos_employee_submit_production_edit_suggestion(uuid,numeric,date,text,text,text) to authenticated;
revoke all on function public.nfos_employee_get_suggestion_workspace() from public;
revoke all on function public.nfos_employee_get_suggestion_workspace() from anon;
grant execute on function public.nfos_employee_get_suggestion_workspace() to authenticated;
revoke all on function public.nfos_admin_get_suggestion_workspace() from public;
revoke all on function public.nfos_admin_get_suggestion_workspace() from anon;
grant execute on function public.nfos_admin_get_suggestion_workspace() to authenticated;
revoke all on function public.nfos_admin_review_production_edit_suggestion(uuid,text,text) from public;
revoke all on function public.nfos_admin_review_production_edit_suggestion(uuid,text,text) from anon;
grant execute on function public.nfos_admin_review_production_edit_suggestion(uuid,text,text) to authenticated;
