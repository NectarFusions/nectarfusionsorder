-- NectarFusions Phase 3 Partner Portal
-- Targeted rollback for Partner Progress foundation
--
-- This removes only the objects introduced by the matching
-- Partner Progress migration.

begin;

drop trigger if exists partner_accounts_seed_milestones
on public.partner_accounts;

drop trigger if exists
partner_accounts_partner_level_updated_at
on public.partner_accounts;

drop table if exists
public.partner_milestone_admin_notes;

drop table if exists
public.partner_goal_admin_notes;

drop table if exists
public.partner_milestones;

drop table if exists
public.partner_goals;

drop function if exists
public.nf_seed_partner_milestones_on_account();

drop function if exists
public.nf_seed_partner_milestones(uuid);

drop function if exists
public.nf_set_partner_milestone_completed_at();

drop function if exists
public.nf_set_partner_goal_completed_at();

drop function if exists
public.nf_set_partner_level_updated_at();

drop index if exists
public.partner_accounts_level_index;

alter table public.partner_accounts
drop constraint if exists
partner_accounts_partner_level_check;

alter table public.partner_accounts
drop column if exists partner_level_updated_at;

alter table public.partner_accounts
drop column if exists partner_level;

commit;
