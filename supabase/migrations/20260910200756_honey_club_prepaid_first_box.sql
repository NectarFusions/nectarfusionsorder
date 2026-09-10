-- NectarFusions Honey Club
-- Record a first box that was already paid before recurring card billing
-- is established. The next recurring Square subscription can then begin
-- on the appropriate future renewal date without charging the customer twice.

alter table public.subscriptions
  add column if not exists prepaid_first_box_plan_id text
    references public.plans(id),
  add column if not exists prepaid_first_box_cadence public.cadence_kind,
  add column if not exists prepaid_first_box_paid_at timestamptz,
  add column if not exists prepaid_first_box_recorded_at timestamptz,
  add column if not exists prepaid_first_box_recorded_by uuid,
  add column if not exists recurring_start_date date;

create or replace function public.record_prepaid_first_subscription_box(
  p_subscription_id uuid,
  p_paid_plan_id text,
  p_paid_cadence public.cadence_kind,
  p_paid_on date,
  p_recorded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_paid_plan public.plans%rowtype;
  v_paid_date date;
  v_paid_at timestamptz;
  v_recurring_start_date date;
  v_event_key text;
begin
  if p_subscription_id is null then
    raise exception 'Subscription ID is required.';
  end if;

  if nullif(btrim(coalesce(p_paid_plan_id, '')), '') is null then
    raise exception 'The paid Honey Club plan is required.';
  end if;

  if p_paid_cadence not in ('1mo', '2mo') then
    raise exception 'Choose the cadence that was already paid.';
  end if;

  if p_paid_on is null then
    raise exception 'The payment date is required.';
  end if;

  if p_paid_on > (statement_timestamp() at time zone 'America/Detroit')::date then
    raise exception 'The first-box payment date cannot be in the future.';
  end if;

  select *
  into v_sub
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found.';
  end if;

  if v_sub.status = 'cancelled' then
    raise exception 'Cancelled memberships cannot record a prepaid first box.';
  end if;

  if v_sub.method <> 'delivery' then
    raise exception 'Prepaid first-box setup is only available for Home Delivery memberships.';
  end if;

  if v_sub.billing_mode <> 'card_setup_required' then
    raise exception 'This membership is not waiting for recurring card setup.';
  end if;

  if v_sub.square_subscription_id is not null then
    raise exception 'This membership already has a linked Square subscription.';
  end if;

  if coalesce(v_sub.boxes_sent, 0) <> 0 then
    raise exception 'The first Honey Club box has already been counted.';
  end if;

  if v_sub.prepaid_first_box_plan_id is not null then
    raise exception 'A prepaid first box has already been recorded.';
  end if;

  select *
  into v_paid_plan
  from public.plans
  where id = p_paid_plan_id;

  if not found then
    raise exception 'The paid Honey Club plan could not be found.';
  end if;

  v_paid_date := p_paid_on;

  v_paid_at :=
    p_paid_on::timestamp
    at time zone 'America/Detroit';

  v_recurring_start_date :=
    (
      v_paid_date
      + case
          when p_paid_cadence = '1mo'
            then interval '1 month'
          else interval '2 months'
        end
    )::date;

  if v_recurring_start_date <=
     (statement_timestamp() at time zone 'America/Detroit')::date
  then
    raise exception
      'The calculated next renewal date must still be in the future.';
  end if;

  v_event_key := 'prepaid:first:' || v_sub.id::text;

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
    v_sub.id,
    v_event_key,
    v_event_key,
    1,
    greatest(coalesce(v_paid_plan.bonus_every, 3), 1),
    false,
    v_paid_at
  );

  update public.subscriptions
  set
    boxes_sent = 1,
    last_invoice_at = v_paid_at,
    prepaid_first_box_plan_id = v_paid_plan.id,
    prepaid_first_box_cadence = p_paid_cadence,
    prepaid_first_box_paid_at = v_paid_at,
    prepaid_first_box_recorded_at = statement_timestamp(),
    prepaid_first_box_recorded_by = p_recorded_by,
    recurring_start_date = v_recurring_start_date,
    square_checkout_url = null,
    square_checkout_link_id = null
  where id = v_sub.id;

  return jsonb_build_object(
    'ok', true,
    'subscription_id', v_sub.id,
    'sub_no', v_sub.sub_no,
    'box_number', 1,
    'paid_plan_id', v_paid_plan.id,
    'paid_plan_name', v_paid_plan.name,
    'paid_cadence', p_paid_cadence,
    'paid_at', v_paid_at,
    'recurring_start_date', v_recurring_start_date
  );
end;
$$;

revoke execute
on function public.record_prepaid_first_subscription_box(
  uuid,
  text,
  public.cadence_kind,
  date,
  uuid
)
from public, anon, authenticated;

grant execute
on function public.record_prepaid_first_subscription_box(
  uuid,
  text,
  public.cadence_kind,
  date,
  uuid
)
to service_role;

comment on column public.subscriptions.prepaid_first_box_plan_id is
'The Honey Club tier already paid for before recurring card billing was established.';

comment on column public.subscriptions.prepaid_first_box_paid_at is
'When the already-paid first Honey Club box was paid.';

comment on column public.subscriptions.recurring_start_date is
'Future date when recurring Square subscription billing should begin after a prepaid first box.';
