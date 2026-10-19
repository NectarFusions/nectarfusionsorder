/**
 * Shared Customer App unpaid-order cancellation; NO mutations unless caller's feature gate is enabled.
 * Used by explicit customer restart and scheduled 24-hour expiration.
 * Read payment history before and after Square order cancellation; fail closed on uncertainty.
 * Never use for website, subscription, partner, or market-pay-at-pickup orders.
 */
import { square } from './_square.mjs';

const stop = (msg) => { throw new Error(msg); };
const noTenders = (order) => {
  // Square may omit tenders on an unpaid order; any present tender requires manual review.
  if (order.tenders !== undefined && (!Array.isArray(order.tenders) || order.tenders.length !== 0)) {
    stop('Square tender history requires manual review');
  }
};

export function eligibleAppOrder(o) {
  if (!o || !o.app_checkout_request_id || o.status !== 'open' || o.paid !== false ||
      o.square_payment_id || o.inventory_restored_at ||
      !o.square_link_id || !o.square_order_id ||
      (o.method === 'market' && o.requires_prepay === false)) {
    stop('Not an eligible unpaid Customer App Square checkout');
  }
}

async function providerOrder(o, squareCall) {
  const response = await squareCall(`/v2/orders/${encodeURIComponent(o.square_order_id)}`, {method:'GET'});
  const order = response?.order;
  if (!order || order.id !== o.square_order_id || order.reference_id !== o.order_no ||
      order.location_id !== process.env.SQUARE_LOCATION_ID || !['OPEN','CANCELED'].includes(order.state)) {
    stop('Square order/reference/location/state mismatch');
  }
  noTenders(order);
  return order;
}

// Square ListPayments is eventually consistent. The second post-DELETE check plus Square's
// CANCELED order state reduces risk; absence of payments is not an absolute transactional proof.
async function noProviderPayments(o, squareCall) {
  const placed = new Date(o.placed_at).getTime();
  const now = Date.now();
  if (!Number.isFinite(placed) || placed > now || now - placed > 330*86400000) {
    stop('Order too old or timestamp invalid for reliable payment-history query');
  }
  const qs = new URLSearchParams({
    location_id:process.env.SQUARE_LOCATION_ID,
    begin_time:new Date(placed-10*60000).toISOString(),
    limit:'100',
  });
  const history = await squareCall('/v2/payments?'+qs.toString(), {method:'GET'});
  if (!history || !Array.isArray(history.payments ?? []) || history.cursor) {
    stop('Square payment history incomplete; review required');
  }
  if ((history.payments || []).some(p=>p.order_id === o.square_order_id)) {
    stop('Square has payment records for this order; review required');
  }
}

export async function cancelVerifiedAppOrder(db, o, {squareCall = square} = {}) {
  eligibleAppOrder(o);
  if (!process.env.SQUARE_ACCESS_TOKEN || !process.env.SQUARE_LOCATION_ID) {
    stop('Square credentials/location unavailable');
  }
  const before = await providerOrder(o, squareCall);
  await noProviderPayments(o, squareCall);
  if (before.state === 'OPEN') {
    const linkResponse = await squareCall(`/v2/online-checkout/payment-links/${encodeURIComponent(o.square_link_id)}`,{method:'GET'});
    if (linkResponse?.payment_link?.id !== o.square_link_id ||
        linkResponse.payment_link.order_id !== o.square_order_id) {
      stop('Square link does not match saved order');
    }
    const deleted = await squareCall(`/v2/online-checkout/payment-links/${encodeURIComponent(o.square_link_id)}`,{method:'DELETE'});
    if (deleted?.id !== o.square_link_id || deleted?.cancelled_order_id !== o.square_order_id) {
      stop('Square payment link revocation not confirmed');
    }
  }
  // Recover a previous successful DELETE followed by an interrupted SQL write.
  const after = await providerOrder(o, squareCall);
  if (after.state !== 'CANCELED') stop('Square order still payable');
  await noProviderPayments(o, squareCall);
  const {data,error}=await db.rpc('cancel_customer_app_unpaid_v1',{
    p_request_id:o.app_checkout_request_id,
    p_email:String(o.email || '').trim().toLowerCase(),
    p_square_link_id:o.square_link_id,
    p_square_order_id:o.square_order_id,
  });
  if (error || data?.state !== 'cancelled') stop('Atomic database cancellation not confirmed');
  return {state:'cancelled',orderNumber:data.orderNumber};
}

export const CANCEL_ORDER_FIELDS = 'id,order_no,email,app_checkout_request_id,placed_at,method,requires_prepay,status,paid,square_link_id,square_order_id,square_payment_id,inventory_restored_at';
