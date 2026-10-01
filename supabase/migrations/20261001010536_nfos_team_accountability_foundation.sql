
create table if not exists public.nfos_team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  display_name text not null,
  email text,
  role text not null default 'viewer'
    check (role in (
      'owner','operations_manager','production_operator',
      'inventory_operator','purchasing_operator','viewer'
    )),
  active boolean not null default true,
  default_location_id uuid references public.nfos_locations(id) on delete set null,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nfos_team_members_email_uidx
  on public.nfos_team_members(lower(email))
  where email is not null;

create index if not exists nfos_team_members_role_idx
  on public.nfos_team_members(role,active);

create table if not exists public.nfos_role_permissions (
  role text not null,
  permission text not null,
  description text,
  primary key(role,permission),
  check (role in (
    'owner','operations_manager','production_operator',
    'inventory_operator','purchasing_operator','viewer'
  ))
);

insert into public.nfos_role_permissions(role,permission,description)
values
  ('owner','ops.view','View NFOS operations'),
  ('owner','team.manage','Manage team members, roles and assignments'),
  ('owner','production.plan','Create and assign production plans'),
  ('owner','production.execute','Execute production and SOP steps'),
  ('owner','production.release','Release completed production'),
  ('owner','inventory.manage','Receive, adjust and transfer inventory'),
  ('owner','purchasing.manage','Manage suppliers, purchasing and receipts'),
  ('owner','recipes.manage','Manage and activate recipes'),

  ('operations_manager','ops.view','View NFOS operations'),
  ('operations_manager','team.assign','Assign operational work'),
  ('operations_manager','production.plan','Create and assign production plans'),
  ('operations_manager','production.execute','Execute production and SOP steps'),
  ('operations_manager','production.release','Release completed production'),
  ('operations_manager','inventory.manage','Receive, adjust and transfer inventory'),
  ('operations_manager','purchasing.manage','Manage suppliers, purchasing and receipts'),

  ('production_operator','ops.view','View assigned NFOS work'),
  ('production_operator','production.execute','Execute assigned production and SOP steps'),

  ('inventory_operator','ops.view','View assigned NFOS work'),
  ('inventory_operator','inventory.manage','Receive, adjust and transfer inventory'),

  ('purchasing_operator','ops.view','View assigned NFOS work'),
  ('purchasing_operator','purchasing.manage','Manage suppliers, purchasing and receipts'),

  ('viewer','ops.view','Read-only NFOS access')
on conflict(role,permission) do update
set description=excluded.description;

create table if not exists public.nfos_action_assignments (
  action_key text primary key,
  assigned_member_id uuid not null references public.nfos_team_members(id) on delete cascade,
  assigned_by uuid default auth.uid(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfos_action_assignments_member_idx
  on public.nfos_action_assignments(assigned_member_id);

create table if not exists public.nfos_work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  category text not null default 'general'
    check (category in ('production','inventory','purchasing','quality','general')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','critical')),
  status text not null default 'open'
    check (status in ('open','in_progress','done','cancelled')),
  due_date date,
  assigned_member_id uuid references public.nfos_team_members(id) on delete set null,
  source_type text,
  source_id uuid,
  source_action_key text,
  notes text,
  created_by uuid default auth.uid(),
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nfos_work_items_assignee_idx
  on public.nfos_work_items(assigned_member_id,status,due_date);

create index if not exists nfos_work_items_source_idx
  on public.nfos_work_items(source_type,source_id);

alter table public.nfos_production_orders
  add column if not exists assigned_member_id uuid
    references public.nfos_team_members(id) on delete set null;

create index if not exists nfos_production_orders_assigned_member_idx
  on public.nfos_production_orders(assigned_member_id,status);

alter table public.nfos_team_members enable row level security;
alter table public.nfos_role_permissions enable row level security;
alter table public.nfos_action_assignments enable row level security;
alter table public.nfos_work_items enable row level security;

revoke all on table public.nfos_team_members from anon;
revoke all on table public.nfos_role_permissions from anon;
revoke all on table public.nfos_action_assignments from anon;
revoke all on table public.nfos_work_items from anon;

grant select,insert,update,delete on table public.nfos_team_members to authenticated;
grant select on table public.nfos_role_permissions to authenticated;
grant select,insert,update,delete on table public.nfos_action_assignments to authenticated;
grant select,insert,update,delete on table public.nfos_work_items to authenticated;

drop policy if exists nfos_team_members_admin_all on public.nfos_team_members;
create policy nfos_team_members_admin_all
on public.nfos_team_members for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_role_permissions_admin_read on public.nfos_role_permissions;
create policy nfos_role_permissions_admin_read
on public.nfos_role_permissions for select to authenticated
using ((select public.nf_is_admin()));

drop policy if exists nfos_action_assignments_admin_all on public.nfos_action_assignments;
create policy nfos_action_assignments_admin_all
on public.nfos_action_assignments for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_work_items_admin_all on public.nfos_work_items;
create policy nfos_work_items_admin_all
on public.nfos_work_items for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop trigger if exists nfos_team_members_set_updated_at on public.nfos_team_members;
create trigger nfos_team_members_set_updated_at
before update on public.nfos_team_members
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_action_assignments_set_updated_at on public.nfos_action_assignments;
create trigger nfos_action_assignments_set_updated_at
before update on public.nfos_action_assignments
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_work_items_set_updated_at on public.nfos_work_items;
create trigger nfos_work_items_set_updated_at
before update on public.nfos_work_items
for each row execute function public.nfos_set_updated_at();

create or replace function public.nfos_has_permission(p_permission text)
returns boolean
language sql
stable
security invoker
set search_path=public
as $$
  select
    public.nf_is_admin()
    or exists(
      select 1
      from public.nfos_team_members tm
      join public.nfos_role_permissions rp on rp.role=tm.role
      where tm.user_id=auth.uid()
        and tm.active
        and rp.permission=p_permission
    );
$$;

revoke all on function public.nfos_has_permission(text) from public,anon;
grant execute on function public.nfos_has_permission(text) to authenticated;

create or replace function public.nfos_create_team_member(
  p_display_name text,
  p_email text default null,
  p_role text default 'viewer',
  p_default_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_member public.nfos_team_members%rowtype;
  v_role text := lower(coalesce(nullif(btrim(p_role),''),'viewer'));
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if nullif(btrim(p_display_name),'') is null then raise exception 'Display name is required.'; end if;

  if v_role not in (
    'owner','operations_manager','production_operator',
    'inventory_operator','purchasing_operator','viewer'
  ) then
    raise exception 'Invalid NFOS role.';
  end if;

  if p_default_location_id is not null and not exists(
    select 1 from public.nfos_locations where id=p_default_location_id and active
  ) then
    raise exception 'Default location must be active.';
  end if;

  insert into public.nfos_team_members(
    display_name,email,role,default_location_id,notes,created_by
  )
  values(
    btrim(p_display_name),
    nullif(lower(btrim(p_email)),''),
    v_role,
    p_default_location_id,
    nullif(btrim(p_notes),''),
    auth.uid()
  )
  returning * into v_member;

  return jsonb_build_object(
    'id',v_member.id,
    'display_name',v_member.display_name,
    'email',v_member.email,
    'role',v_member.role,
    'active',v_member.active
  );
end;
$$;

create or replace function public.nfos_update_team_member(
  p_member_id uuid,
  p_display_name text default null,
  p_role text default null,
  p_active boolean default null,
  p_default_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_member public.nfos_team_members%rowtype;
  v_role text;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id
  for update;

  if v_member.id is null then raise exception 'Team member not found.'; end if;

  v_role := coalesce(nullif(lower(btrim(p_role)),''),v_member.role);

  if v_role not in (
    'owner','operations_manager','production_operator',
    'inventory_operator','purchasing_operator','viewer'
  ) then
    raise exception 'Invalid NFOS role.';
  end if;

  if p_default_location_id is not null and not exists(
    select 1 from public.nfos_locations where id=p_default_location_id and active
  ) then
    raise exception 'Default location must be active.';
  end if;

  update public.nfos_team_members
  set display_name=coalesce(nullif(btrim(p_display_name),''),display_name),
      role=v_role,
      active=coalesce(p_active,active),
      default_location_id=coalesce(p_default_location_id,default_location_id),
      notes=coalesce(p_notes,notes)
  where id=p_member_id
  returning * into v_member;

  return jsonb_build_object(
    'id',v_member.id,
    'display_name',v_member.display_name,
    'role',v_member.role,
    'active',v_member.active
  );
end;
$$;

create or replace function public.nfos_link_team_member_user(
  p_member_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_member public.nfos_team_members%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'Auth user not found.';
  end if;

  update public.nfos_team_members
  set user_id=p_user_id
  where id=p_member_id
  returning * into v_member;

  if v_member.id is null then raise exception 'Team member not found.'; end if;

  return jsonb_build_object(
    'id',v_member.id,
    'display_name',v_member.display_name,
    'user_id',v_member.user_id,
    'role',v_member.role
  );
end;
$$;

create or replace function public.nfos_assign_action(
  p_action_key text,
  p_member_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_action record;
  v_member public.nfos_team_members%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_action
  from public.nfos_action_queue
  where action_key=p_action_key;

  if v_action.action_key is null then
    raise exception 'The NFOS action is no longer active.';
  end if;

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id and active;

  if v_member.id is null then raise exception 'Active team member not found.'; end if;

  insert into public.nfos_action_assignments(action_key,assigned_member_id,assigned_by,notes)
  values(p_action_key,p_member_id,auth.uid(),nullif(btrim(p_notes),''))
  on conflict(action_key) do update
  set assigned_member_id=excluded.assigned_member_id,
      assigned_by=excluded.assigned_by,
      notes=excluded.notes,
      updated_at=now();

  return jsonb_build_object(
    'action_key',p_action_key,
    'assigned_member_id',p_member_id,
    'assigned_to',v_member.display_name
  );
end;
$$;

create or replace function public.nfos_unassign_action(p_action_key text)
returns boolean
language plpgsql
security invoker
set search_path=public
as $$
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  delete from public.nfos_action_assignments
  where action_key=p_action_key;

  return found;
end;
$$;

create or replace function public.nfos_create_work_item(
  p_title text,
  p_detail text default null,
  p_category text default 'general',
  p_priority text default 'normal',
  p_due_date date default null,
  p_assigned_member_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_item public.nfos_work_items%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Task title is required.'; end if;

  if p_assigned_member_id is not null and not exists(
    select 1 from public.nfos_team_members where id=p_assigned_member_id and active
  ) then
    raise exception 'Assigned team member must be active.';
  end if;

  insert into public.nfos_work_items(
    title,detail,category,priority,due_date,assigned_member_id,notes,created_by
  )
  values(
    btrim(p_title),nullif(btrim(p_detail),''),
    case when p_category in ('production','inventory','purchasing','quality','general')
      then p_category else 'general' end,
    case when p_priority in ('low','normal','high','critical')
      then p_priority else 'normal' end,
    p_due_date,p_assigned_member_id,nullif(btrim(p_notes),''),auth.uid()
  )
  returning * into v_item;

  return jsonb_build_object(
    'id',v_item.id,
    'title',v_item.title,
    'status',v_item.status,
    'assigned_member_id',v_item.assigned_member_id
  );
end;
$$;

create or replace function public.nfos_set_work_item_status(
  p_work_item_id uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_item public.nfos_work_items%rowtype;
  v_status text := lower(coalesce(nullif(btrim(p_status),''),'open'));
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  if v_status not in ('open','in_progress','done','cancelled') then
    raise exception 'Invalid task status.';
  end if;

  update public.nfos_work_items
  set status=v_status,
      notes=coalesce(nullif(btrim(p_notes),''),notes),
      completed_at=case when v_status='done' then now() else null end,
      completed_by=case when v_status='done' then auth.uid() else null end
  where id=p_work_item_id
  returning * into v_item;

  if v_item.id is null then raise exception 'Task not found.'; end if;

  return jsonb_build_object(
    'id',v_item.id,
    'status',v_item.status,
    'completed_at',v_item.completed_at
  );
end;
$$;

create or replace function public.nfos_assign_production_order(
  p_production_order_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_member public.nfos_team_members%rowtype;
  v_order public.nfos_production_orders%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id and active;

  if v_member.id is null then raise exception 'Active team member not found.'; end if;

  update public.nfos_production_orders
  set assigned_member_id=p_member_id,
      assigned_to=v_member.user_id
  where id=p_production_order_id
    and status in ('planned','in_progress')
  returning * into v_order;

  if v_order.id is null then raise exception 'Open production order not found.'; end if;

  return jsonb_build_object(
    'production_order_id',v_order.id,
    'order_no',v_order.order_no,
    'assigned_member_id',p_member_id,
    'assigned_to',v_member.display_name
  );
end;
$$;

revoke all on function public.nfos_create_team_member(text,text,text,uuid,text) from public,anon;
revoke all on function public.nfos_update_team_member(uuid,text,text,boolean,uuid,text) from public,anon;
revoke all on function public.nfos_link_team_member_user(uuid,uuid) from public,anon;
revoke all on function public.nfos_assign_action(text,uuid,text) from public,anon;
revoke all on function public.nfos_unassign_action(text) from public,anon;
revoke all on function public.nfos_create_work_item(text,text,text,text,date,uuid,text) from public,anon;
revoke all on function public.nfos_set_work_item_status(uuid,text,text) from public,anon;
revoke all on function public.nfos_assign_production_order(uuid,uuid) from public,anon;

grant execute on function public.nfos_create_team_member(text,text,text,uuid,text) to authenticated;
grant execute on function public.nfos_update_team_member(uuid,text,text,boolean,uuid,text) to authenticated;
grant execute on function public.nfos_link_team_member_user(uuid,uuid) to authenticated;
grant execute on function public.nfos_assign_action(text,uuid,text) to authenticated;
grant execute on function public.nfos_unassign_action(text) to authenticated;
grant execute on function public.nfos_create_work_item(text,text,text,text,date,uuid,text) to authenticated;
grant execute on function public.nfos_set_work_item_status(uuid,text,text) to authenticated;
grant execute on function public.nfos_assign_production_order(uuid,uuid) to authenticated;

-- Seed the current NFOS admin as the owner without guessing any employee accounts.
insert into public.nfos_team_members(user_id,display_name,email,role,active,created_by,notes)
select
  a.user_id,
  'NectarFusions Owner',
  lower(u.email),
  'owner',
  true,
  a.user_id,
  'Seeded from the existing NFOS admin account.'
from public.admins a
join auth.users u on u.id=a.user_id
on conflict(user_id) do update
set role='owner',
    active=true,
    email=excluded.email,
    updated_at=now();

create or replace view public.nfos_team_directory
with (security_invoker=true)
as
select
  tm.id,
  tm.user_id,
  tm.display_name,
  tm.email,
  tm.role,
  tm.active,
  tm.default_location_id,
  l.name as default_location_name,
  tm.notes,
  tm.created_at,
  tm.updated_at,
  (tm.user_id is not null) as login_linked
from public.nfos_team_members tm
left join public.nfos_locations l on l.id=tm.default_location_id;

revoke all on table public.nfos_team_directory from anon;
grant select on table public.nfos_team_directory to authenticated;

create or replace view public.nfos_action_queue_assigned
with (security_invoker=true)
as
select
  q.*,
  aa.assigned_member_id,
  tm.display_name as assigned_to_name,
  tm.role as assigned_to_role,
  aa.notes as assignment_notes
from public.nfos_action_queue q
left join public.nfos_action_assignments aa on aa.action_key=q.action_key
left join public.nfos_team_members tm on tm.id=aa.assigned_member_id;

revoke all on table public.nfos_action_queue_assigned from anon;
grant select on table public.nfos_action_queue_assigned to authenticated;

create or replace view public.nfos_team_workload
with (security_invoker=true)
as
with dynamic_actions as (
  select
    aa.assigned_member_id,
    count(*)::integer as action_count,
    count(*) filter (where q.priority='critical')::integer as critical_actions,
    count(*) filter (where q.priority='high')::integer as high_actions
  from public.nfos_action_assignments aa
  join public.nfos_action_queue q on q.action_key=aa.action_key
  group by aa.assigned_member_id
),
manual_tasks as (
  select
    assigned_member_id,
    count(*) filter (where status in ('open','in_progress'))::integer as manual_task_count,
    count(*) filter (
      where status in ('open','in_progress')
        and due_date is not null
        and due_date < public.nfos_business_today()
    )::integer as overdue_manual_tasks
  from public.nfos_work_items
  where assigned_member_id is not null
  group by assigned_member_id
),
production as (
  select
    assigned_member_id,
    count(*) filter (where status in ('planned','in_progress'))::integer as production_orders
  from public.nfos_production_orders
  where assigned_member_id is not null
  group by assigned_member_id
)
select
  tm.id as member_id,
  tm.display_name,
  tm.role,
  tm.active,
  coalesce(da.action_count,0) as assigned_actions,
  coalesce(da.critical_actions,0) as critical_actions,
  coalesce(da.high_actions,0) as high_actions,
  coalesce(mt.manual_task_count,0) as manual_tasks,
  coalesce(mt.overdue_manual_tasks,0) as overdue_manual_tasks,
  coalesce(p.production_orders,0) as production_orders,
  (
    coalesce(da.action_count,0)
    + coalesce(mt.manual_task_count,0)
    + coalesce(p.production_orders,0)
  )::integer as total_open_work
from public.nfos_team_members tm
left join dynamic_actions da on da.assigned_member_id=tm.id
left join manual_tasks mt on mt.assigned_member_id=tm.id
left join production p on p.assigned_member_id=tm.id
where tm.active;

revoke all on table public.nfos_team_workload from anon;
grant select on table public.nfos_team_workload to authenticated;

create or replace view public.nfos_my_work_today
with (security_invoker=true)
as
with me as (
  select id as member_id
  from public.nfos_team_members
  where user_id=auth.uid()
    and active
  limit 1
),
assigned_actions as (
  select
    'action:' || q.action_key as work_key,
    q.action_type as work_type,
    q.priority_rank,
    q.priority,
    q.action_date as due_date,
    q.action_status as status,
    q.title,
    q.detail,
    q.route,
    q.source_id,
    aa.assigned_member_id
  from public.nfos_action_queue q
  join public.nfos_action_assignments aa on aa.action_key=q.action_key
  join me on me.member_id=aa.assigned_member_id
),
manual_tasks as (
  select
    'task:' || w.id::text,
    'manual_task',
    case w.priority
      when 'critical' then 10
      when 'high' then 30
      when 'normal' then 60
      else 80
    end,
    w.priority,
    coalesce(w.due_date,public.nfos_business_today()),
    w.status,
    w.title,
    w.detail,
    initcap(w.category),
    w.id,
    w.assigned_member_id
  from public.nfos_work_items w
  join me on me.member_id=w.assigned_member_id
  where w.status in ('open','in_progress')
),
production_work as (
  select
    'production:' || po.id::text,
    'production_order',
    case
      when po.due_date is not null and po.due_date < public.nfos_business_today() then 10
      when po.due_date is not null and po.due_date <= public.nfos_business_today()+3 then 30
      else 60
    end,
    case
      when po.due_date is not null and po.due_date < public.nfos_business_today() then 'critical'
      when po.due_date is not null and po.due_date <= public.nfos_business_today()+3 then 'high'
      else 'normal'
    end,
    coalesce(po.due_date,po.requested_date,public.nfos_business_today()),
    po.status,
    'Production: ' || r.name,
    concat_ws(
      ' · ',
      po.order_no,
      po.planned_quantity::text || ' ' || po.planned_unit,
      initcap(po.planned_texture)
    ),
    'Production',
    po.id,
    po.assigned_member_id
  from public.nfos_production_orders po
  join public.nfos_recipes r on r.id=po.recipe_id
  join me on me.member_id=po.assigned_member_id
  where po.status in ('planned','in_progress')
)
select * from assigned_actions
union all select * from manual_tasks
union all select * from production_work;

revoke all on table public.nfos_my_work_today from anon;
grant select on table public.nfos_my_work_today to authenticated;

create or replace view public.nfos_user_attribution
with (security_invoker=true)
as
select
  tm.user_id,
  tm.id as member_id,
  tm.display_name,
  tm.email,
  tm.role
from public.nfos_team_members tm
where tm.active
  and tm.user_id is not null;

revoke all on table public.nfos_user_attribution from anon;
grant select on table public.nfos_user_attribution to authenticated;
