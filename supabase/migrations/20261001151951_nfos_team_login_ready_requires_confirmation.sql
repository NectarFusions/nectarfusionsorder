create schema if not exists nfos_private;

revoke all on schema nfos_private from public;
revoke all on schema nfos_private from anon;
grant usage on schema nfos_private to authenticated;
grant usage on schema nfos_private to service_role;

create or replace function nfos_private.team_auth_confirmed(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  ) then
    return false;
  end if;

  return exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
  );
end;
$$;

revoke all on function nfos_private.team_auth_confirmed(uuid) from public;
revoke all on function nfos_private.team_auth_confirmed(uuid) from anon;
grant execute on function nfos_private.team_auth_confirmed(uuid) to authenticated;
grant execute on function nfos_private.team_auth_confirmed(uuid) to service_role;

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
    else nfos_private.team_auth_confirmed(tm.user_id)
  end as login_linked
from public.nfos_team_members tm
left join public.nfos_locations l on l.id = tm.default_location_id;
