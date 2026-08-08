-- Rollback: NectarFusions Partner Gift Set Details
begin;

drop function if exists public.submit_partner_bulk_order_v3(
  date, text, text[], text, jsonb, uuid, jsonb, boolean, text, jsonb
);

commit;
