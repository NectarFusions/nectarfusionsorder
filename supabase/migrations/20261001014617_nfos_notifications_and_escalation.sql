
create table if not exists public.nfos_notification_preferences (
  member_id uuid primary key references public.nfos_team_members(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  critical_email_enabled boolean not null default false,
  sms_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

create table if not exists public.nfos_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null,
  recipient_member_id uuid not null references public.nfos_team_members(id) on delete cascade,
  notification_type text not null,
  severity text not null default 'normal'
    check (severity in ('low','normal','high','critical')),
  title text not null,
  detail text,
  route text,
  source_type text,
  source_id uuid,
  action_key text,
  work_item_id uuid references public.nfos_work_items(id) on delete cascade,
  due_date date,
  escalation_level integer not null default 0 check (escalation_level >= 0),
  status text not null default 'unread'
    check (status in ('unread','read','acknowledged','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_key,recipient_member_id)
);

create table if not exists public.nfos_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.nfos_notifications(id) on delete cascade,
  channel text not null check (channel in ('email','sms','push')),
  status text not null default 'pending'
    check (status in ('pending','sent','failed','cancelled')),
  destination text,
  provider text,
  provider_message_id text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,channel)
);

create index if not exists nfos_notifications_recipient_idx
  on public.nfos_notifications(recipient_member_id,status,severity,last_seen_at desc);

create index if not exists nfos_notifications_action_key_idx
  on public.nfos_notifications(action_key)
  where action_key is not null;

create index if not exists nfos_notifications_work_item_idx
  on public.nfos_notifications(work_item_id)
  where work_item_id is not null;

create index if not exists nfos_notification_deliveries_status_idx
  on public.nfos_notification_deliveries(status,channel,created_at);

alter table public.nfos_notification_preferences enable row level security;
alter table public.nfos_notifications enable row level security;
alter table public.nfos_notification_deliveries enable row level security;

revoke all on table public.nfos_notification_preferences from anon;
revoke all on table public.nfos_notifications from anon;
revoke all on table public.nfos_notification_deliveries from anon;

grant select,insert,update,delete on table public.nfos_notification_preferences to authenticated;
grant select,update on table public.nfos_notifications to authenticated;
grant select on table public.nfos_notification_deliveries to authenticated;

drop policy if exists nfos_notification_preferences_admin_all on public.nfos_notification_preferences;
create policy nfos_notification_preferences_admin_all
on public.nfos_notification_preferences
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_notifications_admin_all on public.nfos_notifications;
create policy nfos_notifications_admin_all
on public.nfos_notifications
for all to authenticated
using ((select public.nf_is_admin()))
with check ((select public.nf_is_admin()));

drop policy if exists nfos_notification_deliveries_admin_read on public.nfos_notification_deliveries;
create policy nfos_notification_deliveries_admin_read
on public.nfos_notification_deliveries
for select to authenticated
using ((select public.nf_is_admin()));

drop trigger if exists nfos_notification_preferences_touch_updated_at on public.nfos_notification_preferences;
create trigger nfos_notification_preferences_touch_updated_at
before update on public.nfos_notification_preferences
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_notifications_touch_updated_at on public.nfos_notifications;
create trigger nfos_notifications_touch_updated_at
before update on public.nfos_notifications
for each row execute function public.nfos_set_updated_at();

drop trigger if exists nfos_notification_deliveries_touch_updated_at on public.nfos_notification_deliveries;
create trigger nfos_notification_deliveries_touch_updated_at
before update on public.nfos_notification_deliveries
for each row execute function public.nfos_set_updated_at();

insert into public.nfos_notification_preferences(member_id)
select id from public.nfos_team_members
on conflict(member_id) do nothing;

create or replace function nfos_private.notification_recipient_for_unassigned()
returns uuid
language sql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
  select id
  from public.nfos_team_members
  where active
    and role in ('operations_manager','owner')
  order by case role when 'operations_manager' then 0 else 1 end,created_at
  limit 1;
$$;

revoke all on function nfos_private.notification_recipient_for_unassigned() from public,anon;

create or replace function nfos_private.sync_notifications()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_now timestamptz := now();
  v_today date := public.nfos_business_today();
  v_unassigned_recipient uuid;
  v_owner uuid;
  v_action record;
  v_task record;
  v_primary_recipient uuid;
  v_escalation_recipient uuid;
  v_severity text;
  v_created integer := 0;
  v_updated integer := 0;
  v_resolved integer := 0;
begin
  if auth.uid() is null and current_setting('role',true) <> 'service_role' then
    raise exception 'Authentication required.';
  end if;

  v_unassigned_recipient := nfos_private.notification_recipient_for_unassigned();

  select id into v_owner
  from public.nfos_team_members
  where active and role='owner'
  order by created_at
  limit 1;

  -- Resolve generated action notifications when the source action no longer exists.
  update public.nfos_notifications n
  set status='resolved',
      resolved_at=v_now,
      last_seen_at=v_now
  where n.status<>'resolved'
    and n.action_key is not null
    and not exists(
      select 1 from public.nfos_action_queue q where q.action_key=n.action_key
    );
  get diagnostics v_resolved = row_count;

  -- Resolve manual-task notifications when the task is closed.
  update public.nfos_notifications n
  set status='resolved',
      resolved_at=v_now,
      last_seen_at=v_now
  where n.status<>'resolved'
    and n.work_item_id is not null
    and exists(
      select 1
      from public.nfos_work_items w
      where w.id=n.work_item_id
        and w.status in ('done','cancelled')
    );
  v_resolved := v_resolved + row_count;

  -- Live generated NFOS actions.
  for v_action in
    select
      q.*,
      aa.assigned_member_id,
      tm.role as assigned_role
    from public.nfos_action_queue q
    left join public.nfos_action_assignments aa on aa.action_key=q.action_key
    left join public.nfos_team_members tm on tm.id=aa.assigned_member_id and tm.active
  loop
    v_primary_recipient := v_action.assigned_member_id;

    if v_primary_recipient is null
       and v_action.priority in ('high','critical') then
      v_primary_recipient := v_unassigned_recipient;
    end if;

    if v_primary_recipient is not null then
      v_severity := case
        when v_action.priority='critical' then 'critical'
        when v_action.priority='high' then 'high'
        when v_action.action_status in ('overdue','due_today') then 'high'
        else 'normal'
      end;

      insert into public.nfos_notifications(
        notification_key,recipient_member_id,notification_type,severity,
        title,detail,route,source_type,source_id,action_key,due_date,
        escalation_level,status,first_seen_at,last_seen_at,resolved_at
      )
      values(
        'action:'||v_action.action_key,
        v_primary_recipient,
        'action',
        v_severity,
        v_action.title,
        v_action.detail,
        v_action.route,
        'action',
        v_action.source_id,
        v_action.action_key,
        v_action.action_date,
        0,
        'unread',
        v_now,
        v_now,
        null
      )
      on conflict(notification_key,recipient_member_id) do update
      set severity=excluded.severity,
          title=excluded.title,
          detail=excluded.detail,
          route=excluded.route,
          source_type=excluded.source_type,
          source_id=excluded.source_id,
          due_date=excluded.due_date,
          last_seen_at=v_now,
          status=case
            when public.nfos_notifications.status='resolved' then 'unread'
            else public.nfos_notifications.status
          end,
          resolved_at=null;

      if xmax = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    end if;

    -- Escalate overdue/critical assigned work to manager/owner in addition to the assignee.
    if v_action.assigned_member_id is not null
       and (
         v_action.priority='critical'
         or v_action.action_status='overdue'
         or (v_action.priority='high' and v_action.action_date < v_today)
       ) then

      select id into v_escalation_recipient
      from public.nfos_team_members
      where active
        and role in ('operations_manager','owner')
        and id<>v_action.assigned_member_id
      order by case role when 'operations_manager' then 0 else 1 end,created_at
      limit 1;

      if v_escalation_recipient is not null then
        insert into public.nfos_notifications(
          notification_key,recipient_member_id,notification_type,severity,
          title,detail,route,source_type,source_id,action_key,due_date,
          escalation_level,status,first_seen_at,last_seen_at,resolved_at
        )
        values(
          'escalation:'||v_action.action_key,
          v_escalation_recipient,
          'escalation',
          'critical',
          'Escalation: '||v_action.title,
          concat_ws(' · ',v_action.detail,'Assigned work requires manager attention'),
          v_action.route,
          'action',
          v_action.source_id,
          v_action.action_key,
          v_action.action_date,
          1,
          'unread',
          v_now,
          v_now,
          null
        )
        on conflict(notification_key,recipient_member_id) do update
        set title=excluded.title,
            detail=excluded.detail,
            route=excluded.route,
            source_id=excluded.source_id,
            due_date=excluded.due_date,
            last_seen_at=v_now,
            severity='critical',
            status=case
              when public.nfos_notifications.status='resolved' then 'unread'
              else public.nfos_notifications.status
            end,
            resolved_at=null;

        if xmax = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
      end if;
    end if;
  end loop;

  -- Manual tasks.
  for v_task in
    select w.*,tm.role as assigned_role
    from public.nfos_work_items w
    left join public.nfos_team_members tm on tm.id=w.assigned_member_id and tm.active
    where w.status in ('open','in_progress')
  loop
    v_primary_recipient := v_task.assigned_member_id;

    if v_primary_recipient is null
       and (
         v_task.priority in ('high','critical')
         or (v_task.due_date is not null and v_task.due_date <= v_today)
       ) then
      v_primary_recipient := v_unassigned_recipient;
    end if;

    if v_primary_recipient is not null then
      v_severity := case
        when v_task.priority='critical' then 'critical'
        when v_task.due_date is not null and v_task.due_date < v_today then 'critical'
        when v_task.priority='high' or v_task.due_date=v_today then 'high'
        else 'normal'
      end;

      insert into public.nfos_notifications(
        notification_key,recipient_member_id,notification_type,severity,
        title,detail,route,source_type,source_id,work_item_id,due_date,
        escalation_level,status,first_seen_at,last_seen_at,resolved_at
      )
      values(
        'task:'||v_task.id::text,
        v_primary_recipient,
        'manual_task',
        v_severity,
        v_task.title,
        v_task.detail,
        initcap(v_task.category),
        'work_item',
        v_task.id,
        v_task.id,
        v_task.due_date,
        0,
        'unread',
        v_now,
        v_now,
        null
      )
      on conflict(notification_key,recipient_member_id) do update
      set severity=excluded.severity,
          title=excluded.title,
          detail=excluded.detail,
          route=excluded.route,
          source_id=excluded.source_id,
          due_date=excluded.due_date,
          last_seen_at=v_now,
          status=case
            when public.nfos_notifications.status='resolved' then 'unread'
            else public.nfos_notifications.status
          end,
          resolved_at=null;

      if xmax = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    end if;

    if v_task.assigned_member_id is not null
       and (
         v_task.priority='critical'
         or (v_task.due_date is not null and v_task.due_date < v_today)
       ) then
      select id into v_escalation_recipient
      from public.nfos_team_members
      where active
        and role in ('operations_manager','owner')
        and id<>v_task.assigned_member_id
      order by case role when 'operations_manager' then 0 else 1 end,created_at
      limit 1;

      if v_escalation_recipient is not null then
        insert into public.nfos_notifications(
          notification_key,recipient_member_id,notification_type,severity,
          title,detail,route,source_type,source_id,work_item_id,due_date,
          escalation_level,status,first_seen_at,last_seen_at,resolved_at
        )
        values(
          'task-escalation:'||v_task.id::text,
          v_escalation_recipient,
          'escalation',
          'critical',
          'Escalation: '||v_task.title,
          concat_ws(' · ',v_task.detail,'Assigned task requires manager attention'),
          initcap(v_task.category),
          'work_item',
          v_task.id,
          v_task.id,
          v_task.due_date,
          1,
          'unread',
          v_now,
          v_now,
          null
        )
        on conflict(notification_key,recipient_member_id) do update
        set title=excluded.title,
            detail=excluded.detail,
            due_date=excluded.due_date,
            last_seen_at=v_now,
            severity='critical',
            status=case
              when public.nfos_notifications.status='resolved' then 'unread'
              else public.nfos_notifications.status
            end,
            resolved_at=null;

        if xmax = 0 then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
      end if;
    end if;
  end loop;

  -- Queue external delivery only when a member explicitly enabled it.
  insert into public.nfos_notification_deliveries(
    notification_id,channel,destination,status
  )
  select
    n.id,
    'email',
    tm.email,
    'pending'
  from public.nfos_notifications n
  join public.nfos_team_members tm on tm.id=n.recipient_member_id
  join public.nfos_notification_preferences pref on pref.member_id=n.recipient_member_id
  where n.status in ('unread','read','acknowledged')
    and tm.email is not null
    and (
      pref.email_enabled
      or (pref.critical_email_enabled and n.severity='critical')
    )
    and not exists(
      select 1 from public.nfos_notification_deliveries d
      where d.notification_id=n.id and d.channel='email'
    )
  on conflict(notification_id,channel) do nothing;

  return jsonb_build_object(
    'created_or_reopened',v_created,
    'updated',v_updated,
    'resolved',v_resolved,
    'active_notifications',(
      select count(*) from public.nfos_notifications where status<>'resolved'
    ),
    'pending_external_deliveries',(
      select count(*) from public.nfos_notification_deliveries where status='pending'
    )
  );
end;
$$;

revoke all on function nfos_private.sync_notifications() from public,anon;

create or replace function public.nfos_sync_notifications()
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$
  select nfos_private.sync_notifications();
$$;

revoke all on function public.nfos_sync_notifications() from public,anon;
grant execute on function public.nfos_sync_notifications() to authenticated;

create or replace function nfos_private.my_notifications()
returns table(
  id uuid,
  notification_type text,
  severity text,
  title text,
  detail text,
  route text,
  source_type text,
  source_id uuid,
  action_key text,
  work_item_id uuid,
  due_date date,
  escalation_level integer,
  status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz
)
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
begin
  v_member:=nfos_private.current_member_id('ops.view');

  return query
  select
    n.id,n.notification_type,n.severity,n.title,n.detail,n.route,
    n.source_type,n.source_id,n.action_key,n.work_item_id,n.due_date,
    n.escalation_level,n.status,n.first_seen_at,n.last_seen_at,
    n.read_at,n.acknowledged_at
  from public.nfos_notifications n
  where n.recipient_member_id=v_member
    and n.status<>'resolved'
  order by
    case n.severity when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    n.due_date nulls last,
    n.last_seen_at desc;
end;
$$;

revoke all on function nfos_private.my_notifications() from public,anon;

create or replace function public.nfos_get_my_notifications()
returns table(
  id uuid,
  notification_type text,
  severity text,
  title text,
  detail text,
  route text,
  source_type text,
  source_id uuid,
  action_key text,
  work_item_id uuid,
  due_date date,
  escalation_level integer,
  status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  read_at timestamptz,
  acknowledged_at timestamptz
)
language sql
stable
security invoker
set search_path=public,nfos_private
as $$
  select * from nfos_private.my_notifications();
$$;

revoke all on function public.nfos_get_my_notifications() from public,anon;
grant execute on function public.nfos_get_my_notifications() to authenticated;

create or replace function nfos_private.set_notification_status(
  p_notification_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_status text:=lower(coalesce(nullif(btrim(p_status),''),'read'));
  v_row public.nfos_notifications%rowtype;
begin
  v_member:=nfos_private.current_member_id('ops.view');

  if v_status not in ('unread','read','acknowledged') then
    raise exception 'Invalid notification status.';
  end if;

  update public.nfos_notifications
  set status=v_status,
      read_at=case
        when v_status in ('read','acknowledged') then coalesce(read_at,now())
        else null
      end,
      acknowledged_at=case
        when v_status='acknowledged' then coalesce(acknowledged_at,now())
        when v_status='unread' then null
        else acknowledged_at
      end
  where id=p_notification_id
    and recipient_member_id=v_member
    and status<>'resolved'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Active notification not found.';
  end if;

  return jsonb_build_object('id',v_row.id,'status',v_row.status);
end;
$$;

revoke all on function nfos_private.set_notification_status(uuid,text) from public,anon;

create or replace function public.nfos_set_notification_status(uuid,text)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$
  select nfos_private.set_notification_status($1,$2);
$$;

revoke all on function public.nfos_set_notification_status(uuid,text) from public,anon;
grant execute on function public.nfos_set_notification_status(uuid,text) to authenticated;

create or replace function nfos_private.get_notification_preferences()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_pref public.nfos_notification_preferences%rowtype;
begin
  v_member:=nfos_private.current_member_id('ops.view');

  insert into public.nfos_notification_preferences(member_id)
  values(v_member)
  on conflict(member_id) do nothing;

  select * into v_pref
  from public.nfos_notification_preferences
  where member_id=v_member;

  return to_jsonb(v_pref);
end;
$$;

create or replace function nfos_private.set_notification_preferences(
  p_email_enabled boolean,
  p_critical_email_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_pref public.nfos_notification_preferences%rowtype;
begin
  v_member:=nfos_private.current_member_id('ops.view');

  insert into public.nfos_notification_preferences(
    member_id,email_enabled,critical_email_enabled
  )
  values(
    v_member,coalesce(p_email_enabled,false),coalesce(p_critical_email_enabled,false)
  )
  on conflict(member_id) do update
  set email_enabled=excluded.email_enabled,
      critical_email_enabled=excluded.critical_email_enabled,
      updated_at=now()
  returning * into v_pref;

  return to_jsonb(v_pref);
end;
$$;

create or replace function public.nfos_get_notification_preferences()
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.get_notification_preferences(); $$;

create or replace function public.nfos_set_notification_preferences(boolean,boolean)
returns jsonb
language sql
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.set_notification_preferences($1,$2); $$;

revoke all on function public.nfos_get_notification_preferences() from public,anon;
revoke all on function public.nfos_set_notification_preferences(boolean,boolean) from public,anon;
grant execute on function public.nfos_get_notification_preferences() to authenticated;
grant execute on function public.nfos_set_notification_preferences(boolean,boolean) to authenticated;

create or replace function nfos_private.manager_notification_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,nfos_private
as $$
declare
  v_member uuid;
  v_summary jsonb;
begin
  v_member:=nfos_private.current_member_id('team.assign');

  select jsonb_build_object(
    'unread',count(*) filter(where n.status='unread'),
    'critical',count(*) filter(where n.severity='critical' and n.status<>'resolved'),
    'high',count(*) filter(where n.severity='high' and n.status<>'resolved'),
    'acknowledged',count(*) filter(where n.status='acknowledged'),
    'people_with_active_alerts',count(distinct n.recipient_member_id) filter(where n.status<>'resolved'),
    'notifications',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id',n.id,
          'recipient_member_id',n.recipient_member_id,
          'recipient_name',tm.display_name,
          'recipient_role',tm.role,
          'severity',n.severity,
          'title',n.title,
          'detail',n.detail,
          'route',n.route,
          'due_date',n.due_date,
          'status',n.status,
          'escalation_level',n.escalation_level,
          'last_seen_at',n.last_seen_at
        )
        order by
          case n.severity when 'critical' then 0 when 'high' then 1 else 2 end,
          n.due_date nulls last,
          n.last_seen_at desc
      ) filter(where n.status<>'resolved'),
      '[]'::jsonb
    )
  )
  into v_summary
  from public.nfos_notifications n
  join public.nfos_team_members tm on tm.id=n.recipient_member_id
  where tm.active;

  return v_summary;
end;
$$;

create or replace function public.nfos_get_manager_notification_summary()
returns jsonb
language sql
stable
security invoker
set search_path=public,nfos_private
as $$ select nfos_private.manager_notification_summary(); $$;

revoke all on function public.nfos_get_manager_notification_summary() from public,anon;
grant execute on function public.nfos_get_manager_notification_summary() to authenticated;
