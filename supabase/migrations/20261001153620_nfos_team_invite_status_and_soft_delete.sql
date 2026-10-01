alter table public.nfos_team_members
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

comment on column public.nfos_team_members.deleted_at is
  'Soft-delete timestamp. Deleted team members are hidden from the active directory but retained for historical attribution.';
comment on column public.nfos_team_members.deleted_by is
  'Admin auth user that removed this team member from active NFOS access.';

drop index if exists public.nfos_team_members_email_uidx;
create unique index nfos_team_members_email_uidx
  on public.nfos_team_members (lower(email))
  where email is not null and deleted_at is null;

create or replace function nfos_private.team_auth_state(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_confirmed_at timestamptz;
  v_confirmation_sent_at timestamptz;
  v_invited_at timestamptz;
  v_exists boolean := false;
  v_target_admin boolean := false;
  v_protected boolean := false;
  v_status text := 'not_invited';
  v_sent_at timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'status','restricted',
      'confirmed',false,
      'invite_sent_at',null,
      'protected',true
    );
  end if;

  if not exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  ) then
    return jsonb_build_object(
      'status','restricted',
      'confirmed',false,
      'invite_sent_at',null,
      'protected',true
    );
  end if;

  if p_user_id is null then
    return jsonb_build_object(
      'status','not_invited',
      'confirmed',false,
      'invite_sent_at',null,
      'protected',false
    );
  end if;

  select
    true,
    u.email_confirmed_at,
    u.confirmation_sent_at,
    u.invited_at
  into
    v_exists,
    v_confirmed_at,
    v_confirmation_sent_at,
    v_invited_at
  from auth.users u
  where u.id = p_user_id;

  v_target_admin := exists (
    select 1 from public.admins a where a.user_id = p_user_id
  );
  v_protected := p_user_id = auth.uid() or v_target_admin;

  if not v_exists then
    v_status := 'account_missing';
  elsif v_confirmed_at is not null then
    v_status := 'login_ready';
  else
    v_sent_at := coalesce(v_confirmation_sent_at, v_invited_at);
    if v_sent_at is not null then
      v_status := 'invite_sent';
    else
      v_status := 'linked_unconfirmed';
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'confirmed', v_confirmed_at is not null,
    'invite_sent_at', v_sent_at,
    'protected', v_protected
  );
end;
$$;

revoke all on function nfos_private.team_auth_state(uuid) from public;
revoke all on function nfos_private.team_auth_state(uuid) from anon;
grant execute on function nfos_private.team_auth_state(uuid) to authenticated;
grant execute on function nfos_private.team_auth_state(uuid) to service_role;

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
    tm.role <> 'owner'
    and not coalesce((auth_state.state->>'protected')::boolean, false)
  ) as can_delete
from public.nfos_team_members tm
left join public.nfos_locations l on l.id = tm.default_location_id
left join lateral (
  select nfos_private.team_auth_state(tm.user_id) as state
) auth_state on true
where tm.deleted_at is null;
