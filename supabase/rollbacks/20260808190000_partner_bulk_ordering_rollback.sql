-- Rollback for 20260808190000_partner_bulk_ordering.sql
-- This removes only the isolated bulk-order feature. Existing retail,
-- partner replenishment, Square, subscription, and inventory objects are untouched.

begin;

revoke all on function public.get_partner_bulk_order_catalog() from public, anon, authenticated;
revoke all on function public.submit_partner_bulk_order(date, text, text[], text, jsonb) from public, anon, authenticated;
revoke all on function public.partner_bulk_order_action(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_partner_bulk_order_action(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_admin_partner_bulk_order_history(uuid, uuid) from public, anon, authenticated;

 drop function if exists public.get_admin_partner_bulk_order_history(uuid, uuid);
 drop function if exists public.admin_partner_bulk_order_action(uuid, text, text, text, integer);
 drop function if exists public.partner_bulk_order_action(uuid, text, text);
 drop function if exists public.submit_partner_bulk_order(date, text, text[], text, jsonb);
 drop function if exists public.get_partner_bulk_order_catalog();
 drop function if exists public.nf_partner_bulk_order_account();

 drop table if exists public.partner_bulk_order_items;
 drop table if exists public.partner_bulk_order_requests;

 delete from public.settings where key = 'partner_bulk_ordering';

commit;
