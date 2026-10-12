/* NectarFusions Partner Commerce shared read-only UI rules, v7.
   Keep this module environment-neutral so the partner mobile app can share it.
   No network calls, database writes, payments, or automatic orders occur here. */
export const PARTNER_COMMERCE_SECTIONS = Object.freeze([
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'packages', label: 'Place Order' },
  { id: 'orders', label: 'My Orders' },
  { id: 'recurring', label: 'Schedule' },
  { id: 'account', label: 'My Business' },
]);

const hasItems = (order) => Array.isArray(order?.items) && order.items.length > 0;
const isCancelled = (order) => order?.status === 'cancelled';
const isFulfilled = (order) => order?.paid === true && order?.status === 'fulfilled';

// Never use query parameters to authorize another purchase. The partner must
// be signed in and explicitly review the validated reorder cart first.
export function resolvePartnerReminderOrder(orders, orderId) {
  if (!orderId) return { state: 'none', order: null };
  if (!Array.isArray(orders)) return { state: 'not_loaded', order: null };
  const order = orders.find((row) => String(row.id) === String(orderId));
  if (!order) return { state: 'missing', order: null };
  if (isCancelled(order)) return { state: 'cancelled', order };
  if (order.paid !== true) return { state: 'unpaid', order };
  if (order.status !== 'fulfilled') return { state: 'in_progress', order };
  if (!hasItems(order)) return { state: 'no_items', order };
  const replacementExists = orders.some((row) =>
    !isCancelled(row) && String(row.reorder_of_order_id || '') === String(order.id));
  if (replacementExists) return { state: 'already_reordered', order };
  return { state: 'ready', order };
}

export function suggestedPartnerRestocks(orders, limit = 6) {
  if (!Array.isArray(orders)) return [];
  const ordered = [...orders].sort((a,b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const replacedIds = new Set(ordered.filter((o) => !isCancelled(o))
    .map((o) => o.reorder_of_order_id).filter(Boolean).map(String));
  const seenPackages = new Set();
  const suggestions = [];
  for (const order of ordered) {
    if (!isFulfilled(order) || !order.reorder_due_on || !hasItems(order) ||
        replacedIds.has(String(order.id))) continue;
    const packageKey = String(order.package_id || order.package_snapshot?.package_key || order.program_key || order.id);
    if (seenPackages.has(packageKey)) continue;
    seenPackages.add(packageKey);
    suggestions.push(order);
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

export function partnerOrderAction(order) {
  if (isCancelled(order)) return 'view_details';
  if (order?.paid !== true) return 'resolve_payment';
  if (order.status !== 'fulfilled') return 'view_status';
  return hasItems(order) ? 'review_reorder' : 'view_details';
}
