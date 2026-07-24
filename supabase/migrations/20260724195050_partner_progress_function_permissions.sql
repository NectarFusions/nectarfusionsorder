-- NectarFusions Phase 3 Partner Portal
-- Restrict direct execution of internal Partner Progress functions.
--
-- This migration is idempotent and stores no credentials.

begin;

revoke execute
on function public.nf_seed_partner_milestones(uuid)
from public, anon, authenticated;

revoke execute
on function public.nf_seed_partner_milestones_on_account()
from public, anon, authenticated;

revoke execute
on function public.nf_set_partner_level_updated_at()
from public, anon, authenticated;

revoke execute
on function public.nf_set_partner_milestone_completed_at()
from public, anon, authenticated;

revoke execute
on function public.nf_set_partner_goal_completed_at()
from public, anon, authenticated;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.nf_seed_partner_milestones(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Anonymous execution remains enabled for the milestone seed function.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.nf_seed_partner_milestones(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'Partner execution remains enabled for the milestone seed function.';
  end if;

  if has_function_privilege(
    'anon',
    'public.nf_seed_partner_milestones_on_account()',
    'EXECUTE'
  ) then
    raise exception
      'Anonymous execution remains enabled for the milestone trigger function.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.nf_seed_partner_milestones_on_account()',
    'EXECUTE'
  ) then
    raise exception
      'Partner execution remains enabled for the milestone trigger function.';
  end if;
end;
$$;

comment on function public.nf_seed_partner_milestones(uuid) is
'Internal Partner Progress function. Direct execution is restricted from anonymous and partner roles.';

comment on function public.nf_seed_partner_milestones_on_account() is
'Internal account trigger function. Direct execution is restricted from anonymous and partner roles.';

commit;
