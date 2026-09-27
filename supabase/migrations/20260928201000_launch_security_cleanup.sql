-- NectarFusions Launch Hardening v16B
-- Targeted security cleanup for legacy functions and duplicate partner index.
-- Intentional public consumer RPCs remain unchanged.

alter function public.nf_word_count(text)
set search_path = '';

revoke all on function public.archive_order_admin(uuid)
from public, anon, authenticated;
grant execute on function public.archive_order_admin(uuid)
to authenticated;

revoke all on function public.archive_subscription_admin(uuid)
from public, anon, authenticated;
grant execute on function public.archive_subscription_admin(uuid)
to authenticated;

revoke all on function public.delete_archived_order_admin(uuid)
from public, anon, authenticated;
grant execute on function public.delete_archived_order_admin(uuid)
to authenticated;

revoke all on function public.delete_archived_subscription_admin(uuid)
from public, anon, authenticated;
grant execute on function public.delete_archived_subscription_admin(uuid)
to authenticated;

revoke all on function public.is_admin()
from public, anon, authenticated;
grant execute on function public.is_admin()
to authenticated;

revoke all on function public.mark_subscription_delivered_admin(uuid)
from public, anon, authenticated;
grant execute on function public.mark_subscription_delivered_admin(uuid)
to authenticated;

revoke all on function public.nf_is_admin()
from public, anon, authenticated;
grant execute on function public.nf_is_admin()
to authenticated;

revoke all on function public.nf_partner_id_for_user()
from public, anon, authenticated;
grant execute on function public.nf_partner_id_for_user()
to authenticated;

revoke all on function public.require_nectarfusions_admin()
from public, anon, authenticated;
grant execute on function public.require_nectarfusions_admin()
to authenticated;

revoke all on function public.restore_order_admin(uuid)
from public, anon, authenticated;
grant execute on function public.restore_order_admin(uuid)
to authenticated;

revoke all on function public.restore_subscription_admin(uuid)
from public, anon, authenticated;
grant execute on function public.restore_subscription_admin(uuid)
to authenticated;

revoke all on function public.admin_market_order_action(uuid,text,uuid)
from public, anon, authenticated;
grant execute on function public.admin_market_order_action(uuid,text,uuid)
to service_role;

revoke all on function public.bump_noshow()
from public, anon, authenticated;

revoke all on function public.next_order_no()
from public, anon, authenticated;

revoke all on function public.next_sub_no()
from public, anon, authenticated;

revoke all on function public.nf_enforce_delivery_timing()
from public, anon, authenticated;

revoke all on function public.nf_first_zone_delivery_date(text,date)
from public, anon, authenticated;

revoke all on function public.nf_next_beginning_delivery_date(text,date)
from public, anon, authenticated;

revoke all on function public.nf_sync_subscription_delivery_schedule()
from public, anon, authenticated;

revoke all on function public.seed_stock()
from public, anon, authenticated;

drop index if exists public.partner_store_orders_partner_created_idx;
