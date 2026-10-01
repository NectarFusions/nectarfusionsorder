
create or replace function public.nfos_seed_notification_preference()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  insert into public.nfos_notification_preferences(member_id)
  values(new.id)
  on conflict(member_id) do nothing;
  return new;
end;
$$;

drop trigger if exists nfos_team_member_notification_pref_seed on public.nfos_team_members;
create trigger nfos_team_member_notification_pref_seed
after insert on public.nfos_team_members
for each row execute function public.nfos_seed_notification_preference();

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

  select * into v_pref
  from public.nfos_notification_preferences
  where member_id=v_member;

  if v_pref.member_id is null then
    return jsonb_build_object(
      'member_id',v_member,
      'in_app_enabled',true,
      'email_enabled',false,
      'critical_email_enabled',false,
      'sms_enabled',false
    );
  end if;

  return to_jsonb(v_pref);
end;
$$;
