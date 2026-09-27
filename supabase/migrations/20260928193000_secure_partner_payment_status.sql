-- NectarFusions Partner Payment Integrity v15
--
-- Admin users may manage lifecycle status, but may not directly edit
-- partner_store_orders. Square-confirmed payment remains service-role only.

create or replace function public.admin_set_partner_store_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_paid boolean;
  v_current_status text;
begin
  if auth.uid() is null then
    raise exception 'Admin authentication is required.';
  end if;

  if not public.nf_is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if p_order_id is null then
    raise exception 'Choose a partner order.';
  end if;

  v_status := lower(btrim(coalesce(p_status, '')));

  if v_status = 'paid' then
    raise exception 'Paid status is controlled by Square and cannot be set manually.';
  end if;

  if v_status not in (
    'awaiting_payment',
    'queued',
    'preparing',
    'ready',
    'out_for_delivery',
    'pickup_ready',
    'fulfilled',
    'cancelled'
  ) then
    raise exception 'Choose a valid partner order status.';
  end if;

  select pso.paid, pso.status
    into v_paid, v_current_status
  from public.partner_store_orders pso
  where pso.id = p_order_id
  for update;

  if not found then
    raise exception 'Partner order not found.';
  end if;

  if coalesce(v_paid, false) = false
     and v_status not in ('awaiting_payment', 'cancelled') then
    raise exception 'Square payment must be confirmed before fulfillment can begin.';
  end if;

  if coalesce(v_paid, false) = true
     and v_status = 'awaiting_payment' then
    raise exception 'A Square-confirmed paid order cannot return to awaiting payment.';
  end if;

  update public.partner_store_orders
  set status = v_status
  where id = p_order_id;

  return jsonb_build_object(
    'id', p_order_id,
    'previous_status', v_current_status,
    'status', v_status,
    'paid', coalesce(v_paid, false),
    'saved', true
  );
end
$$;

revoke all on function public.admin_set_partner_store_order_status(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_set_partner_store_order_status(uuid, text)
  to authenticated;

revoke update on table public.partner_store_orders from authenticated;
