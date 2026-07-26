-- NectarFusions Phase 3 Partner Replenishment Workflow
-- Targeted rollback.
--
-- This rollback is safe only before any replenishment request or item has
-- been created under the hardened workflow. It aborts rather than deleting
-- operational data.
--
-- retail_locations is not changed.

begin;

do $$
begin
  if exists (
    select 1
    from public.partner_replenishment_requests
  ) or exists (
    select 1
    from public.partner_replenishment_items
  ) then
    raise exception
      'Replenishment records exist. Do not run this rollback because it would discard workflow data.';
  end if;
end;
$$;

drop function if exists
public.get_admin_partner_replenishment_history(uuid, uuid);

drop function if exists
public.admin_partner_replenishment_action(
  uuid,
  text,
  text,
  text,
  integer
);

drop function if exists
public.partner_replenishment_action(
  uuid,
  text,
  text
);

drop function if exists
public.submit_partner_replenishment(
  date,
  text,
  text[],
  text,
  text,
  jsonb
);

drop function if exists
public.get_partner_replenishment_catalog();

drop function if exists
public.nf_partner_replenishment_account();

grant select, insert
on public.partner_replenishment_requests
to authenticated;

grant select, insert
on public.partner_replenishment_items
to authenticated;

drop policy if exists "Partners submit replenishment requests"
on public.partner_replenishment_requests;

create policy "Partners submit replenishment requests"
on public.partner_replenishment_requests
for insert
to authenticated
with check (
  partner_id = public.nf_partner_id_for_user()
  and submitted_by = auth.uid()
  and status = 'submitted'
);

drop policy if exists "Partners add submitted replenishment items"
on public.partner_replenishment_items;

create policy "Partners add submitted replenishment items"
on public.partner_replenishment_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.partner_replenishment_requests r
    where r.id = request_id
      and r.partner_id = public.nf_partner_id_for_user()
      and r.status = 'submitted'
  )
);

alter table public.partner_replenishment_items
  drop constraint if exists partner_replenishment_items_unique_selection,
  drop constraint if exists partner_replenishment_items_flavor_id_fkey,
  drop constraint if exists partner_replenishment_items_notes_length_check,
  drop constraint if exists partner_replenishment_items_flavor_name_check,
  drop constraint if exists partner_replenishment_items_price_version_check,
  drop constraint if exists partner_replenishment_items_unit_price_check,
  drop constraint if exists partner_replenishment_items_wholesale_size_check,
  drop constraint if exists partner_replenishment_items_quantity_check;

alter table public.partner_replenishment_items
  drop column if exists line_total_cents,
  drop column if exists price_version,
  drop column if exists unit_price_cents,
  alter column flavor_id drop not null;

alter table public.partner_replenishment_items
  add constraint partner_replenishment_items_quantity_check
  check (quantity between 1 and 999),
  add constraint partner_replenishment_items_flavor_id_fkey
  foreign key (flavor_id)
  references public.flavors(id)
  on delete set null;

alter table public.partner_replenishment_requests
  drop constraint if exists partner_replenishment_declined_state_check,
  drop constraint if exists partner_replenishment_cancelled_state_check,
  drop constraint if exists partner_replenishment_fulfilled_state_check,
  drop constraint if exists partner_replenishment_paid_state_check,
  drop constraint if exists partner_replenishment_accepted_state_check,
  drop constraint if exists partner_replenishment_response_state_check,
  drop constraint if exists partner_replenishment_quoted_state_check,
  drop constraint if exists partner_replenishment_inventory_notes_length_check,
  drop constraint if exists partner_replenishment_request_notes_length_check,
  drop constraint if exists partner_replenishment_admin_notes_length_check,
  drop constraint if exists partner_replenishment_partner_reply_timestamp_check,
  drop constraint if exists partner_replenishment_partner_reply_length_check,
  drop constraint if exists partner_replenishment_partner_response_length_check,
  drop constraint if exists partner_replenishment_price_version_check,
  drop constraint if exists partner_replenishment_confirmed_total_check,
  drop constraint if exists partner_replenishment_fulfillment_charge_check,
  drop constraint if exists partner_replenishment_quote_subtotal_check,
  drop constraint if exists partner_replenishment_requested_subtotal_check,
  drop constraint if exists partner_replenishment_requests_status_check;

alter table public.partner_replenishment_requests
  drop column if exists declined_at,
  drop column if exists cancelled_at,
  drop column if exists fulfilled_at,
  drop column if exists paid_at,
  drop column if exists accepted_at,
  drop column if exists quoted_at,
  drop column if exists confirmed_total_cents,
  drop column if exists fulfillment_charge_cents,
  drop column if exists quote_subtotal_cents,
  drop column if exists requested_subtotal_cents,
  drop column if exists price_version,
  drop column if exists partner_replied_at,
  drop column if exists partner_reply,
  drop column if exists partner_response;

alter table public.partner_replenishment_requests
  add constraint partner_replenishment_requests_status_check
  check (
    status in (
      'submitted',
      'under_review',
      'needs_information',
      'quoted',
      'accepted',
      'fulfilled',
      'cancelled',
      'declined'
    )
  );

commit;
