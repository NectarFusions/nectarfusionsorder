-- Safe rollback for 20260808214000_partner_bulk_order_refinements.sql
--
-- This rollback preserves any partner requests already created with the
-- refinement columns. It disables the feature and removes only the V2 write
-- functions. Additive columns/data are intentionally retained to avoid data loss.
-- Existing retail, Square, subscriptions, inventory, and replenishment remain
-- untouched.

begin;

update public.settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{enabled}',
  'false'::jsonb,
  true
)
where key = 'partner_bulk_ordering';

drop function if exists public.admin_partner_bulk_order_action_v2(
  uuid,
  text,
  text,
  text,
  integer,
  integer
);

drop function if exists public.submit_partner_bulk_order_v2(
  date,
  text,
  text[],
  text,
  jsonb,
  uuid,
  jsonb,
  boolean,
  text,
  jsonb
);

-- Keep pickup/gift-set/custom-label snapshot columns and any submitted request data.
-- Keep the private label-example bucket and files so uploaded partner examples are not destroyed.
-- The prior V1 functions remain available if the application is rolled back.

commit;
