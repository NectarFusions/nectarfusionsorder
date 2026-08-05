-- Enforce same-day local-delivery lead time without changing pricing,
-- inventory, payments, email delivery, shipping, or market pickup.
--
-- Existing zone.cutoff_hour is treated as the beginning of that zone's
-- delivery window. same_day_lead_minutes controls how far in advance a
-- same-day order must be placed. Same-day-enabled zones default to 120 minutes.

alter table public.zones
  add column if not exists same_day_lead_minutes integer not null default 120;

alter table public.zones
  drop constraint if exists zones_same_day_lead_minutes_check;

alter table public.zones
  add constraint zones_same_day_lead_minutes_check
  check (same_day_lead_minutes between 0 and 1440);

comment on column public.zones.same_day_lead_minutes is
  'Minutes of notice required before cutoff_hour, which represents the delivery-window start, for same-day delivery.';

create or replace function public.nf_enforce_delivery_timing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone public.zones%rowtype;
  v_now_local timestamp without time zone := timezone('America/Detroit', now());
  v_today date := v_now_local::date;
  v_current_minutes integer :=
    extract(hour from v_now_local)::integer * 60 +
    extract(minute from v_now_local)::integer;
  v_lead_minutes integer;
  v_cutoff_minutes integer;
  v_lead_label text;
begin
  if new.method is distinct from 'delivery' then
    return new;
  end if;

  if new.zip is null or btrim(new.zip) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'A delivery ZIP code is required.';
  end if;

  if new.delivery_day is null then
    raise exception using
      errcode = 'P0001',
      message = 'Choose an available delivery date.';
  end if;

  select z.*
    into v_zone
    from public.zones z
   where btrim(new.zip) = any(z.zips)
   limit 1;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'That ZIP code is outside the local delivery area.';
  end if;

  if new.delivery_day < v_today then
    raise exception using
      errcode = 'P0001',
      message = 'That delivery date has already passed. Choose the next available date.';
  end if;

  if not (
    extract(dow from new.delivery_day)::integer = any(v_zone.days)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'That date is not scheduled for delivery in this area.';
  end if;

  if exists (
    select 1
      from public.blocked_dates b
     where b.day = new.delivery_day
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'That delivery date is unavailable. Choose the next available date.';
  end if;

  if new.delivery_day = v_today then
    if coalesce(v_zone.same_day_ok, false) is not true then
      raise exception using
        errcode = 'P0001',
        message = 'Same-day delivery is not available for this area. Choose the next available date.';
    end if;

    v_lead_minutes := coalesce(v_zone.same_day_lead_minutes, 120);

    v_cutoff_minutes := greatest(
      0,
      round(coalesce(v_zone.cutoff_hour, 0)::numeric * 60)::integer -
      v_lead_minutes
    );

    if mod(v_lead_minutes, 60) = 0 then
      v_lead_label :=
        (v_lead_minutes / 60)::text ||
        case when v_lead_minutes = 60 then ' hour' else ' hours' end;
    else
      v_lead_label := v_lead_minutes::text || ' minutes';
    end if;

    if v_current_minutes >= v_cutoff_minutes then
      raise exception using
        errcode = 'P0001',
        message =
          'Same-day delivery requires at least ' ||
          v_lead_label ||
          ' notice. Choose the next available delivery date.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists nf_enforce_delivery_timing_on_orders
  on public.orders;

create trigger nf_enforce_delivery_timing_on_orders
before insert or update of method, zip, delivery_day
on public.orders
for each row
execute function public.nf_enforce_delivery_timing();
