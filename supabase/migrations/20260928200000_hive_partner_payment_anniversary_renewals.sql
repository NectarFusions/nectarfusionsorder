-- NectarFusions Launch Hardening v16A
-- Hive Partner renewals use the Square payment anniversary.
-- Foodservice recurring schedules still begin after physical fulfillment.

create or replace function public.nf_partner_recurring_paid_anniversary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_paid_at timestamptz;
begin
  if new.program_key = 'hive_partners'
     and new.status in ('active','paused') then

    new.cadence_value := 1;
    new.cadence_unit := 'year';
    new.fulfillment_method := 'not_required';

    if new.next_order_on is null
       and new.created_from_order_id is not null then
      select pso.paid_at
        into v_paid_at
      from public.partner_store_orders pso
      where pso.id = new.created_from_order_id
        and pso.paid = true
      limit 1;

      if v_paid_at is not null then
        new.next_order_on :=
          (
            (v_paid_at at time zone 'America/Detroit')::date
            + make_interval(years => 1)
          )::date;
      end if;
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.nf_partner_recurring_paid_anniversary()
from public, anon, authenticated;

drop trigger if exists partner_recurring_paid_anniversary
on public.partner_recurring_orders;

create trigger partner_recurring_paid_anniversary
before insert or update of
  program_key,
  status,
  cadence_value,
  cadence_unit,
  next_order_on,
  created_from_order_id,
  fulfillment_method
on public.partner_recurring_orders
for each row
execute function public.nf_partner_recurring_paid_anniversary();

update public.partner_recurring_orders pro
set
  cadence_value = 1,
  cadence_unit = 'year',
  fulfillment_method = 'not_required',
  next_order_on = coalesce(
    pro.next_order_on,
    (
      (pso.paid_at at time zone 'America/Detroit')::date
      + make_interval(years => 1)
    )::date
  ),
  updated_at = now()
from public.partner_store_orders pso
where pro.program_key = 'hive_partners'
  and pro.status in ('active','paused')
  and pro.created_from_order_id = pso.id
  and pso.paid = true
  and pso.paid_at is not null;
