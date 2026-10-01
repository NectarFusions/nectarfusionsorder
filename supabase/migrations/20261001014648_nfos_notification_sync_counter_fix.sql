CREATE OR REPLACE FUNCTION nfos_private.sync_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'nfos_private'
AS $function$
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
  v_affected integer := 0;
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
  get diagnostics v_affected = row_count;
  v_resolved := v_resolved + v_affected;

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

      v_updated := v_updated + 1;
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

        v_updated := v_updated + 1;
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

      v_updated := v_updated + 1;
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

        v_updated := v_updated + 1;
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
    'synced',v_updated,
    'resolved',v_resolved,
    'active_notifications',(
      select count(*) from public.nfos_notifications where status<>'resolved'
    ),
    'pending_external_deliveries',(
      select count(*) from public.nfos_notification_deliveries where status='pending'
    )
  );
end;
$function$;
