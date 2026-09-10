-- Honey Club admin subscription plan changes

alter table public.subscriptions
  add column if not exists pending_plan_id text references public.plans(id),
  add column if not exists pending_cadence public.cadence_kind,
  add column if not exists plan_change_effective_date date,
  add column if not exists plan_change_status text,
  add column if not exists plan_change_requested_at timestamptz,
  add column if not exists plan_change_requested_by uuid,
  add column if not exists saved_square_card_id text,
  add column if not exists square_checkout_link_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_plan_change_status_check'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_change_status_check
      check (plan_change_status is null or plan_change_status in ('scheduled'));
  end if;
end
$$;

create table if not exists public.subscription_plan_change_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  old_plan_id text references public.plans(id),
  new_plan_id text not null references public.plans(id),
  old_cadence public.cadence_kind not null,
  new_cadence public.cadence_kind not null,
  effective_date date not null,
  status text not null check (status in ('scheduled', 'completed', 'cancelled', 'failed')),
  requested_by uuid,
  old_square_subscription_id text,
  new_square_subscription_id text,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists subscription_plan_change_events_subscription_idx
  on public.subscription_plan_change_events(subscription_id, created_at desc);

alter table public.subscription_plan_change_events enable row level security;
revoke all on table public.subscription_plan_change_events from public;
revoke all on table public.subscription_plan_change_events from anon;
revoke all on table public.subscription_plan_change_events from authenticated;
grant all on table public.subscription_plan_change_events to service_role;
