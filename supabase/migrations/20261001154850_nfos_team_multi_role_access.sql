alter table public.nfos_team_members
  add column if not exists roles text[];

update public.nfos_team_members
set roles = array[role]
where roles is null or cardinality(roles)=0;

create or replace function nfos_private.sync_team_roles()
returns trigger
language plpgsql
set search_path = pg_catalog, public, nfos_private
as $$
declare
  v_roles text[];
begin
  if tg_op='INSERT' then
    if new.roles is null or cardinality(new.roles)=0 then
      v_roles := array[coalesce(nullif(lower(btrim(new.role)),''),'viewer')];
    else
      v_roles := new.roles;
    end if;
  else
    if new.roles is distinct from old.roles then
      v_roles := new.roles;
    elsif new.role is distinct from old.role then
      v_roles := array[coalesce(nullif(lower(btrim(new.role)),''),'viewer')];
    else
      v_roles := new.roles;
    end if;
  end if;

  if v_roles is null or cardinality(v_roles)=0 then
    raise exception 'At least one NFOS role is required.';
  end if;

  if exists (
    select 1
    from unnest(v_roles) r
    where r is null
       or nullif(btrim(r),'') is null
       or lower(btrim(r)) not in (
         'owner','operations_manager','production_operator',
         'inventory_operator','purchasing_operator','viewer'
       )
  ) then
    raise exception 'Invalid NFOS role selection.';
  end if;

  select array_agg(role_name order by
    case role_name
      when 'owner' then 0
      when 'operations_manager' then 1
      when 'production_operator' then 2
      when 'inventory_operator' then 3
      when 'purchasing_operator' then 4
      when 'viewer' then 5
      else 99
    end
  )
  into v_roles
  from (
    select distinct lower(btrim(r)) as role_name
    from unnest(v_roles) r
  ) normalized;

  new.roles := v_roles;
  new.role := v_roles[1];
  return new;
end;
$$;

drop trigger if exists nfos_team_roles_sync on public.nfos_team_members;
create trigger nfos_team_roles_sync
before insert or update of role, roles
on public.nfos_team_members
for each row
execute function nfos_private.sync_team_roles();

alter table public.nfos_team_members
  alter column roles set not null;

alter table public.nfos_team_members
  drop constraint if exists nfos_team_members_roles_check;

alter table public.nfos_team_members
  add constraint nfos_team_members_roles_check
  check (
    cardinality(roles) >= 1
    and roles <@ array[
      'owner','operations_manager','production_operator',
      'inventory_operator','purchasing_operator','viewer'
    ]::text[]
  );

create unique index if not exists nfos_team_members_single_owner_role_uidx
  on public.nfos_team_members ((true))
  where deleted_at is null and roles @> array['owner']::text[];

create or replace view public.nfos_team_directory
with (security_invoker = true)
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
  case
    when tm.user_id is null then false
    else coalesce((auth_state.state->>'confirmed')::boolean, false)
  end as login_linked,
  coalesce(auth_state.state->>'status', 'not_invited') as auth_status,
  nullif(auth_state.state->>'invite_sent_at', '')::timestamptz as invite_sent_at,
  (
    not (tm.roles @> array['owner']::text[])
    and not coalesce((auth_state.state->>'protected')::boolean, false)
  ) as can_delete,
  tm.roles
from public.nfos_team_members tm
left join public.nfos_locations l on l.id = tm.default_location_id
left join lateral (
  select nfos_private.team_auth_state(tm.user_id) as state
) auth_state on true
where tm.deleted_at is null;

create or replace view public.nfos_team_workload
with (security_invoker = true)
as
with dynamic_actions as (
  select
    aa.assigned_member_id,
    count(*)::integer as action_count,
    count(*) filter(where q.priority='critical')::integer as critical_actions,
    count(*) filter(where q.priority='high')::integer as high_actions
  from public.nfos_action_assignments aa
  join public.nfos_action_queue q on q.action_key=aa.action_key
  group by aa.assigned_member_id
),
manual_tasks as (
  select
    assigned_member_id,
    count(*) filter(where status in ('open','in_progress'))::integer as manual_task_count,
    count(*) filter(
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
    count(*) filter(where status in ('planned','in_progress'))::integer as production_orders
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
  coalesce(da.action_count,0)+coalesce(mt.manual_task_count,0)+coalesce(p.production_orders,0) as total_open_work,
  tm.roles
from public.nfos_team_members tm
left join dynamic_actions da on da.assigned_member_id=tm.id
left join manual_tasks mt on mt.assigned_member_id=tm.id
left join production p on p.assigned_member_id=tm.id
where tm.active
  and tm.deleted_at is null;

create or replace function public.nfos_has_permission(p_permission text)
returns boolean
language sql
stable
set search_path='public'
as $$
  select
    public.nf_is_admin()
    or exists(
      select 1
      from public.nfos_team_members tm
      join public.nfos_role_permissions rp
        on rp.role = any(tm.roles)
      where tm.user_id=auth.uid()
        and tm.active
        and tm.deleted_at is null
        and rp.permission=p_permission
    );
$$;

create or replace function nfos_private.current_member_id(p_permission text default null)
returns uuid
language plpgsql
stable
security definer
set search_path='pg_catalog','public','nfos_private'
as $$
declare
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;

  select tm.id into v_member
  from public.nfos_team_members tm
  where tm.user_id=auth.uid()
    and tm.active
    and tm.deleted_at is null
    and (
      p_permission is null
      or exists(
        select 1
        from public.nfos_role_permissions rp
        where rp.role = any(tm.roles)
          and rp.permission=p_permission
      )
    )
  limit 1;

  if v_member is null then
    if p_permission is null then
      raise exception 'NFOS team access is not active.';
    else
      raise exception 'Your NFOS roles do not allow %.',p_permission;
    end if;
  end if;

  return v_member;
end;
$$;

create or replace function nfos_private.current_employee_access()
returns jsonb
language plpgsql
stable
security definer
set search_path='pg_catalog','public','nfos_private'
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.nfos_team_members%rowtype;
  v_permissions jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select *
  into v_member
  from public.nfos_team_members
  where user_id=v_uid
    and active
    and deleted_at is null
  limit 1;

  if v_member.id is null then
    raise exception 'NFOS team access is not active.';
  end if;

  select coalesce(jsonb_agg(permission order by permission),'[]'::jsonb)
  into v_permissions
  from (
    select distinct rp.permission
    from public.nfos_role_permissions rp
    where rp.role = any(v_member.roles)
  ) permissions;

  return jsonb_build_object(
    'member_id',v_member.id,
    'display_name',v_member.display_name,
    'email',v_member.email,
    'role',v_member.role,
    'roles',to_jsonb(v_member.roles),
    'default_location_id',v_member.default_location_id,
    'permissions',v_permissions
  );
end;
$$;

create or replace function public.nfos_create_team_member_v2(
  p_display_name text,
  p_email text default null,
  p_roles text[] default array['production_operator']::text[],
  p_default_location_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path='public','nfos_private'
as $$
declare
  v_member public.nfos_team_members%rowtype;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if nullif(btrim(p_display_name),'') is null then raise exception 'Display name is required.'; end if;
  if p_roles is null or cardinality(p_roles)=0 then raise exception 'Select at least one NFOS role.'; end if;

  if 'owner'=any(p_roles) then
    raise exception 'The protected Owner role cannot be assigned to another team member.';
  end if;

  if p_default_location_id is not null and not exists(
    select 1 from public.nfos_locations where id=p_default_location_id and active
  ) then
    raise exception 'Default location must be active.';
  end if;

  insert into public.nfos_team_members(
    display_name,email,role,roles,default_location_id,notes,created_by
  )
  values(
    btrim(p_display_name),
    nullif(lower(btrim(p_email)),''),
    coalesce(p_roles[1],'viewer'),
    p_roles,
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
    'roles',to_jsonb(v_member.roles),
    'active',v_member.active
  );
end;
$$;

create or replace function public.nfos_set_team_member_roles(
  p_member_id uuid,
  p_roles text[]
)
returns jsonb
language plpgsql
set search_path='public','nfos_private'
as $$
declare
  v_member public.nfos_team_members%rowtype;
  v_had_owner boolean;
  v_wants_owner boolean;
begin
  if not public.nf_is_admin() then raise exception 'Admin access required.'; end if;
  if p_roles is null or cardinality(p_roles)=0 then raise exception 'Select at least one NFOS role.'; end if;

  select * into v_member
  from public.nfos_team_members
  where id=p_member_id
    and deleted_at is null
  for update;

  if v_member.id is null then raise exception 'Team member not found.'; end if;

  v_had_owner := v_member.roles @> array['owner']::text[];
  v_wants_owner := p_roles @> array['owner']::text[];

  if v_had_owner and not v_wants_owner then
    raise exception 'The protected Owner role cannot be removed here.';
  end if;

  if not v_had_owner and v_wants_owner then
    raise exception 'The protected Owner role cannot be assigned to another team member.';
  end if;

  update public.nfos_team_members
  set roles=p_roles,
      updated_at=now()
  where id=p_member_id
  returning * into v_member;

  return jsonb_build_object(
    'id',v_member.id,
    'display_name',v_member.display_name,
    'role',v_member.role,
    'roles',to_jsonb(v_member.roles),
    'active',v_member.active
  );
end;
$$;

revoke all on function public.nfos_create_team_member_v2(text,text,text[],uuid,text) from public;
revoke all on function public.nfos_create_team_member_v2(text,text,text[],uuid,text) from anon;
grant execute on function public.nfos_create_team_member_v2(text,text,text[],uuid,text) to authenticated;

revoke all on function public.nfos_set_team_member_roles(uuid,text[]) from public;
revoke all on function public.nfos_set_team_member_roles(uuid,text[]) from anon;
grant execute on function public.nfos_set_team_member_roles(uuid,text[]) to authenticated;
