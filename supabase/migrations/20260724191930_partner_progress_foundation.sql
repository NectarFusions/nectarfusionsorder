-- NectarFusions Phase 3 Partner Portal
-- Partner levels, milestones, goals, and private Admin notes
--
-- This migration is additive.
-- It stores no passwords, credentials, or elevated database secrets.

begin;

-- ============================================================
-- COLLISION GUARDS
-- ============================================================

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partner_accounts'
      and column_name in (
        'partner_level',
        'partner_level_updated_at'
      )
  ) then
    raise exception
      'STOP: Partner-level columns already exist.';
  end if;

  if to_regclass('public.partner_milestones') is not null
    or to_regclass('public.partner_goals') is not null
    or to_regclass(
      'public.partner_milestone_admin_notes'
    ) is not null
    or to_regclass(
      'public.partner_goal_admin_notes'
    ) is not null
  then
    raise exception
      'STOP: One or more Partner Progress tables already exist.';
  end if;

  if to_regprocedure(
    'public.nf_set_partner_level_updated_at()'
  ) is not null
    or to_regprocedure(
      'public.nf_set_partner_milestone_completed_at()'
    ) is not null
    or to_regprocedure(
      'public.nf_set_partner_goal_completed_at()'
    ) is not null
    or to_regprocedure(
      'public.nf_seed_partner_milestones(uuid)'
    ) is not null
    or to_regprocedure(
      'public.nf_seed_partner_milestones_on_account()'
    ) is not null
  then
    raise exception
      'STOP: One or more Partner Progress functions already exist.';
  end if;
end;
$$;

-- ============================================================
-- PARTNER LEVEL
-- ============================================================

alter table public.partner_accounts
add column partner_level text not null default 'starter',
add column partner_level_updated_at timestamptz
  not null default now();

alter table public.partner_accounts
add constraint partner_accounts_partner_level_check
check (
  partner_level in (
    'starter',
    'growth',
    'strategic'
  )
);

create index partner_accounts_level_index
on public.partner_accounts (partner_level);

create function public.nf_set_partner_level_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.partner_level is distinct from old.partner_level then
    new.partner_level_updated_at = now();
  end if;

  return new;
end;
$$;

revoke all
on function public.nf_set_partner_level_updated_at()
from public;

create trigger partner_accounts_partner_level_updated_at
before update of partner_level
on public.partner_accounts
for each row
execute function public.nf_set_partner_level_updated_at();

-- ============================================================
-- PARTNER MILESTONES
-- ============================================================

create table public.partner_milestones (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete cascade,

  milestone_key text not null,
  title text not null,
  description text,

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'waiting_on_partner',
        'waiting_on_nectarfusions',
        'completed',
        'skipped'
      )
    ),

  responsible_party text not null default 'shared'
    check (
      responsible_party in (
        'partner',
        'nectarfusions',
        'shared'
      )
    ),

  next_action text,
  due_at timestamptz,
  completed_at timestamptz,

  partner_visible_notes text,
  visible_to_partner boolean not null default true,

  sort integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (partner_id, milestone_key),

  check (
    length(btrim(milestone_key)) between 1 and 80
  ),

  check (
    length(btrim(title)) between 1 and 160
  )
);

create index partner_milestones_partner_sort_index
on public.partner_milestones (
  partner_id,
  sort,
  created_at
);

create index partner_milestones_status_index
on public.partner_milestones (
  partner_id,
  status
);

create function
public.nf_set_partner_milestone_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'completed' then
    if new.completed_at is null then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

revoke all
on function
public.nf_set_partner_milestone_completed_at()
from public;

create trigger partner_milestones_updated_at
before update
on public.partner_milestones
for each row
execute function public.nf_set_updated_at();

create trigger partner_milestones_completed_at
before insert or update of status, completed_at
on public.partner_milestones
for each row
execute function
public.nf_set_partner_milestone_completed_at();

-- ============================================================
-- PARTNER GOALS
-- ============================================================

create table public.partner_goals (
  id uuid primary key default gen_random_uuid(),

  partner_id uuid not null
    references public.partner_accounts(id)
    on delete cascade,

  title text not null,
  description text,

  goal_type text not null default 'other'
    check (
      goal_type in (
        'launch',
        'sales',
        'reorder',
        'merchandising',
        'event',
        'engagement',
        'level_qualification',
        'other'
      )
    ),

  status text not null default 'not_started'
    check (
      status in (
        'not_started',
        'in_progress',
        'achieved',
        'paused',
        'cancelled'
      )
    ),

  target_value numeric(12, 2),
  current_value numeric(12, 2),
  unit_label text,

  start_on date,
  due_on date,
  completed_at timestamptz,

  next_action text,
  partner_visible_notes text,
  visible_to_partner boolean not null default true,

  sort integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    length(btrim(title)) between 1 and 160
  ),

  check (
    target_value is null
    or target_value > 0
  ),

  check (
    current_value is null
    or current_value >= 0
  ),

  check (
    start_on is null
    or due_on is null
    or due_on >= start_on
  )
);

create index partner_goals_partner_sort_index
on public.partner_goals (
  partner_id,
  sort,
  created_at
);

create index partner_goals_status_index
on public.partner_goals (
  partner_id,
  status,
  due_on
);

create function public.nf_set_partner_goal_completed_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'achieved' then
    if new.completed_at is null then
      new.completed_at = now();
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

revoke all
on function public.nf_set_partner_goal_completed_at()
from public;

create trigger partner_goals_updated_at
before update
on public.partner_goals
for each row
execute function public.nf_set_updated_at();

create trigger partner_goals_completed_at
before insert or update of status, completed_at
on public.partner_goals
for each row
execute function public.nf_set_partner_goal_completed_at();

-- ============================================================
-- PRIVATE ADMIN NOTES
-- ============================================================

create table public.partner_milestone_admin_notes (
  id uuid primary key default gen_random_uuid(),

  milestone_id uuid not null
    references public.partner_milestones(id)
    on delete cascade,

  note text not null,

  created_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    length(btrim(note)) between 1 and 5000
  )
);

create index partner_milestone_admin_notes_index
on public.partner_milestone_admin_notes (
  milestone_id,
  created_at desc
);

create trigger partner_milestone_admin_notes_updated_at
before update
on public.partner_milestone_admin_notes
for each row
execute function public.nf_set_updated_at();

create table public.partner_goal_admin_notes (
  id uuid primary key default gen_random_uuid(),

  goal_id uuid not null
    references public.partner_goals(id)
    on delete cascade,

  note text not null,

  created_by uuid
    references auth.users(id)
    on delete set null
    default auth.uid(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (
    length(btrim(note)) between 1 and 5000
  )
);

create index partner_goal_admin_notes_index
on public.partner_goal_admin_notes (
  goal_id,
  created_at desc
);

create trigger partner_goal_admin_notes_updated_at
before update
on public.partner_goal_admin_notes
for each row
execute function public.nf_set_updated_at();

-- ============================================================
-- DEFAULT MILESTONE SEED
-- ============================================================

create function public.nf_seed_partner_milestones(
  p_partner_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_partner_id is null then
    raise exception
      'Partner ID is required.';
  end if;

  if not exists (
    select 1
    from public.partner_accounts pa
    where pa.id = p_partner_id
  ) then
    raise exception
      'Partner account does not exist.';
  end if;

  insert into public.partner_milestones (
    partner_id,
    milestone_key,
    title,
    description,
    responsible_party,
    next_action,
    sort
  )
  values
    (
      p_partner_id,
      'inquiry_received',
      'Inquiry Received',
      'NectarFusions has received the initial partnership inquiry.',
      'nectarfusions',
      'Review the inquiry and determine whether to invite a formal application.',
      10
    ),
    (
      p_partner_id,
      'application_completed',
      'Application Completed',
      'The formal partner application and required business information are complete.',
      'partner',
      'Complete any missing application, resale, receiving, or placement information.',
      20
    ),
    (
      p_partner_id,
      'approved',
      'Partner Approved',
      'NectarFusions has approved the business for the partner program.',
      'nectarfusions',
      'Confirm the approved assortment, fulfillment plan, and onboarding requirements.',
      30
    ),
    (
      p_partner_id,
      'agreement_signed',
      'Agreement Signed',
      'The current NectarFusions partner agreement has been signed.',
      'shared',
      'Review and sign the current partner agreement.',
      40
    ),
    (
      p_partner_id,
      'opening_order_paid',
      'Opening Order Paid',
      'The prepaid opening wholesale order has been received.',
      'partner',
      'Complete payment for the approved 24-unit opening order.',
      50
    ),
    (
      p_partner_id,
      'opening_order_fulfilled',
      'Opening Order Fulfilled',
      'The opening order has been prepared and released for pickup, delivery, or shipping.',
      'nectarfusions',
      'Prepare and confirm the opening order fulfillment.',
      60
    ),
    (
      p_partner_id,
      'launch_completed',
      'Retail Launch Completed',
      'NectarFusions is merchandised and available to customers.',
      'shared',
      'Confirm product placement, shelf materials, and launch readiness.',
      70
    ),
    (
      p_partner_id,
      'day_30_review',
      'Day 30 Review',
      'The first sell-through and merchandising review has been completed.',
      'shared',
      'Review sell-through, placement, customer response, and flavor performance.',
      80
    ),
    (
      p_partner_id,
      'day_60_review',
      'Day 60 Review',
      'The second performance and assortment review has been completed.',
      'shared',
      'Confirm winners, slow movers, reorder timing, and assortment adjustments.',
      90
    ),
    (
      p_partner_id,
      'first_reorder',
      'First Reorder',
      'The partner has submitted and completed the first replenishment order.',
      'partner',
      'Submit a replenishment request for the strongest-selling products.',
      100
    ),
    (
      p_partner_id,
      'level_review',
      'Partner Level Review',
      'The account has been reviewed for Starter, Growth, or Strategic qualification.',
      'nectarfusions',
      'Review account performance, consistency, engagement, and earned benefits.',
      110
    )
  on conflict (partner_id, milestone_key)
  do nothing;
end;
$$;

revoke all
on function public.nf_seed_partner_milestones(uuid)
from public;

create function
public.nf_seed_partner_milestones_on_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.nf_seed_partner_milestones(new.id);
  return new;
end;
$$;

revoke all
on function
public.nf_seed_partner_milestones_on_account()
from public;

create trigger partner_accounts_seed_milestones
after insert
on public.partner_accounts
for each row
execute function
public.nf_seed_partner_milestones_on_account();

select public.nf_seed_partner_milestones(pa.id)
from public.partner_accounts pa;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.partner_milestones
enable row level security;

alter table public.partner_goals
enable row level security;

alter table public.partner_milestone_admin_notes
enable row level security;

alter table public.partner_goal_admin_notes
enable row level security;

revoke all
on public.partner_milestones,
   public.partner_goals,
   public.partner_milestone_admin_notes,
   public.partner_goal_admin_notes
from anon, authenticated;

grant select, insert, update, delete
on public.partner_milestones,
   public.partner_goals,
   public.partner_milestone_admin_notes,
   public.partner_goal_admin_notes
to authenticated;

create policy "Partners view their milestones"
on public.partner_milestones
for select
to authenticated
using (
  visible_to_partner = true
  and partner_id = public.nf_partner_id_for_user()
);

create policy "Admins manage partner milestones"
on public.partner_milestones
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

create policy "Partners view their goals"
on public.partner_goals
for select
to authenticated
using (
  visible_to_partner = true
  and partner_id = public.nf_partner_id_for_user()
);

create policy "Admins manage partner goals"
on public.partner_goals
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

create policy "Admins manage milestone private notes"
on public.partner_milestone_admin_notes
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

create policy "Admins manage goal private notes"
on public.partner_goal_admin_notes
for all
to authenticated
using (public.nf_is_admin())
with check (public.nf_is_admin());

comment on column public.partner_accounts.partner_level is
'Current Starter, Growth, or Strategic partner-program level. It does not change the published wholesale unit price.';

comment on table public.partner_milestones is
'Partner-visible onboarding and relationship milestones. Historical status is never inferred automatically.';

comment on table public.partner_goals is
'Measurable Partner Portal goals with targets, progress, due dates, and partner-visible next actions.';

comment on table public.partner_milestone_admin_notes is
'Private Admin notes for partnership milestones. These records are never visible to partner accounts.';

comment on table public.partner_goal_admin_notes is
'Private Admin notes for partner goals. These records are never visible to partner accounts.';

commit;
