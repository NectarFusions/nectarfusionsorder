-- Allow signed-in NectarFusions admins to read customer order-change history.
-- Run once in Supabase SQL Editor.

begin;

grant select on public.order_item_changes to authenticated;

drop policy if exists "Admins can view order item changes"
on public.order_item_changes;

create policy "Admins can view order item changes"
on public.order_item_changes
for select
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
  )
);

commit;
