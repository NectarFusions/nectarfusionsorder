-- NectarFusions Honey Club
-- Duplicate-safe subscription billing and every-third-box bonus tracking.
--
-- This migration is additive. It does not alter Square credentials or
-- historical subscription charges. Existing boxes_sent values remain the
-- starting point for future bonus calculations.

begin;

create table if not exists public.subscription_box_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null
    references public.subscriptions(id)
    on delete cascade,
  square_event_id text not null unique,
  square_invoice_id text not null unique,
  box_number integer not null check (box_number > 0),
  bonus_every integer not null check (bonus_every > 0),
  bonus_jar_due boolean not null default false,
  paid_at timestamptz not null default now(),
  bonus_jar_acknowledged_at timestamptz,
  bonus_jar_acknowledged_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists subscription_box_events_subscription_index
on public.subscription_box_events (
  subscription_id,
  box_number desc
);

create index if not exists subscription_box_events_open_bonus_index
on public.subscription_box_events (
  bonus_jar_due,
  bonus_jar_acknowledged_at
)
where bonus_jar_due = true
  and bonus_jar_acknowledged_at is null;

create or replace function public.record_subscription_invoice_payment(
  p_event_id text,
  p_invoice_id text,
  p_square_subscription_id text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.subscription_box_events%rowtype;
  v_subscription_id uuid;
  v_sub_no text;
  v_customer_name text;
  v_customer_email text;
  v_plan_name text;
  v_current_boxes integer;
  v_bonus_every integer;
  v_box_number integer;
  v_bonus_due boolean;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if nullif(trim(p_event_id), '') is null then
    raise exception 'Square event ID is required.';
  end if;

  if nullif(trim(p_invoice_id), '') is null then
    raise exception 'Square invoice ID is required.';
  end if;

  if nullif(trim(p_square_subscription_id), '') is null then
    raise exception 'Square subscription ID is required.';
  end if;

  select e.*
  into v_existing
  from public.subscription_box_events e
  where e.square_event_id = p_event_id
     or e.square_invoice_id = p_invoice_id
  order by e.created_at asc
  limit 1;

  if found then
    return jsonb_build_object(
      'duplicate', true,
      'event_id', v_existing.square_event_id,
      'invoice_id', v_existing.square_invoice_id,
      'subscription_id', v_existing.subscription_id,
      'box_number', v_existing.box_number,
      'bonus_every', v_existing.bonus_every,
      'bonus_jar_due', v_existing.bonus_jar_due
    );
  end if;

  select
    s.id,
    s.sub_no::text,
    coalesce(c.name, ''),
    coalesce(c.email, ''),
    coalesce(p.name, 'NectarFusions Honey Club'),
    coalesce(s.boxes_sent, 0),
    greatest(coalesce(p.bonus_every, 3), 1)
  into
    v_subscription_id,
    v_sub_no,
    v_customer_name,
    v_customer_email,
    v_plan_name,
    v_current_boxes,
    v_bonus_every
  from public.subscriptions s
  left join public.customers c
    on c.id = s.customer_id
  left join public.plans p
    on p.id = s.plan_id
  where s.square_subscription_id = p_square_subscription_id
  for update of s;

  if v_subscription_id is null then
    raise exception
      'Subscription is not linked yet for Square subscription %.',
      p_square_subscription_id;
  end if;

  v_box_number := v_current_boxes + 1;
  v_bonus_due := mod(v_box_number, v_bonus_every) = 0;

  begin
    insert into public.subscription_box_events (
      subscription_id,
      square_event_id,
      square_invoice_id,
      box_number,
      bonus_every,
      bonus_jar_due,
      paid_at
    )
    values (
      v_subscription_id,
      p_event_id,
      p_invoice_id,
      v_box_number,
      v_bonus_every,
      v_bonus_due,
      v_paid_at
    );
  exception
    when unique_violation then
      select e.*
      into v_existing
      from public.subscription_box_events e
      where e.square_event_id = p_event_id
         or e.square_invoice_id = p_invoice_id
      order by e.created_at asc
      limit 1;

      return jsonb_build_object(
        'duplicate', true,
        'event_id', v_existing.square_event_id,
        'invoice_id', v_existing.square_invoice_id,
        'subscription_id', v_existing.subscription_id,
        'box_number', v_existing.box_number,
        'bonus_every', v_existing.bonus_every,
        'bonus_jar_due', v_existing.bonus_jar_due
      );
  end;

  update public.subscriptions
  set
    boxes_sent = v_box_number,
    last_invoice_at = greatest(
      coalesce(last_invoice_at, v_paid_at),
      v_paid_at
    ),
    status = 'active'
  where id = v_subscription_id;

  return jsonb_build_object(
    'duplicate', false,
    'event_id', p_event_id,
    'invoice_id', p_invoice_id,
    'subscription_id', v_subscription_id,
    'sub_no', v_sub_no,
    'customer_name', v_customer_name,
    'customer_email', v_customer_email,
    'plan_name', v_plan_name,
    'box_number', v_box_number,
    'bonus_every', v_bonus_every,
    'bonus_jar_due', v_bonus_due,
    'paid_at', v_paid_at
  );
end;
$$;

create or replace function public.acknowledge_subscription_bonus_jar(
  p_event_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.subscription_box_events%rowtype;
begin
  if not public.nf_is_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.subscription_box_events
  set
    bonus_jar_acknowledged_at = coalesce(
      bonus_jar_acknowledged_at,
      now()
    ),
    bonus_jar_acknowledged_by = coalesce(
      bonus_jar_acknowledged_by,
      auth.uid()
    )
  where square_event_id = p_event_id
    and bonus_jar_due = true
  returning * into v_event;

  if v_event.id is null then
    raise exception 'Bonus-jar event was not found.';
  end if;

  return jsonb_build_object(
    'ok', true,
    'event_id', v_event.square_event_id,
    'subscription_id', v_event.subscription_id,
    'box_number', v_event.box_number,
    'acknowledged_at', v_event.bonus_jar_acknowledged_at
  );
end;
$$;

alter table public.subscription_box_events
enable row level security;

revoke all
on public.subscription_box_events
from public, anon, authenticated;

grant select
on public.subscription_box_events
to authenticated;

grant all
on public.subscription_box_events
to service_role;

create policy "Admins view subscription box events"
on public.subscription_box_events
for select
to authenticated
using (public.nf_is_admin());

revoke execute
on function public.record_subscription_invoice_payment(
  text,
  text,
  text,
  timestamptz
)
from public, anon, authenticated;

grant execute
on function public.record_subscription_invoice_payment(
  text,
  text,
  text,
  timestamptz
)
to service_role;

revoke execute
on function public.acknowledge_subscription_bonus_jar(text)
from public, anon;

grant execute
on function public.acknowledge_subscription_bonus_jar(text)
to authenticated, service_role;

comment on table public.subscription_box_events is
'One immutable record per paid Square subscription invoice. Unique Square event and invoice IDs prevent duplicate box counts.';

comment on column public.subscription_box_events.bonus_jar_due is
'True when this paid box number is evenly divisible by the plan bonus_every value.';

comment on column public.subscription_box_events.bonus_jar_acknowledged_at is
'Admin acknowledgement that the earned bonus jar was added to the box.';

commit;
