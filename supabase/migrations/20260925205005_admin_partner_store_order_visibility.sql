-- NectarFusions admin visibility for direct partner checkout orders
-- Mirrors production migration applied on 2026-09-25.

drop policy if exists "admins select partner store orders"
on public.partner_store_orders;

create policy "admins select partner store orders"
on public.partner_store_orders
for select
to authenticated
using (public.nf_is_admin());

drop policy if exists "admins select partner store order items"
on public.partner_store_order_items;

create policy "admins select partner store order items"
on public.partner_store_order_items
for select
to authenticated
using (public.nf_is_admin());

create index if not exists partner_store_orders_partner_created_idx
on public.partner_store_orders (partner_id, created_at desc);
