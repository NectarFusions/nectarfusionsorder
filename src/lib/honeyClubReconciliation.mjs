/* V18 evidence-only view. Never converts a paid invoice into automatic box clearance. */
const arr = value => Array.isArray(value) ? value : [];
const validString = value => String(value ?? '').trim();

export function reconcileHoneyClubMembership(subscription = {}, response = null) {
  const invoices = response?.invoices;
  const evidence = response?.localEvidence;
  const hasSquare = Boolean(subscription.square_subscription_id);
  const state = validString(subscription.status).toLowerCase();
  const squareStatus = validString(response?.square?.status).toUpperCase();
  const warnings = [];
  let disposition = 'review';
  let label = 'Needs evidence review';

  if (subscription.archived_at || state === 'cancelled') {
    disposition = 'hold'; label = 'Inactive membership';
    warnings.push('Cancelled or archived membership must not enter fulfillment.');
  } else if (!hasSquare) {
    disposition = 'setup'; label = 'Recurring setup incomplete';
    warnings.push(subscription.prepaid_first_box_paid_at
      ? 'Initial prepaid payment is recorded locally. Recurring setup remains incomplete; do not imply the first box was unpaid.'
      : 'No recurring Square subscription is linked. Check any initial payment separately.');
  } else if (state !== 'active') {
    disposition = 'hold'; label = 'Membership status needs review';
    warnings.push('Local membership is not active; do not release automatically.');
  }

  if (squareStatus && squareStatus !== 'ACTIVE') {
    disposition = 'hold'; label = `Square ${squareStatus.toLowerCase()} — hold`;
    warnings.push('Square status must be reconciled before fulfillment or billing changes.');
  }
  if (response?.square?.pendingAnchorDay) {
    warnings.push('Square has a pending billing-anchor change. Do not schedule another anchor change.');
  }
  if (hasSquare && !response) {
    warnings.push('Live Square invoice evidence has not been loaded in this session.');
  }
  if (response && invoices?.state !== 'verified') {
    warnings.push('Square paid-invoice search was unavailable or incomplete. Invoice counts are not conclusive.');
  }
  if (response && evidence?.state !== 'verified') {
    warnings.push('Local box-event or delivery history could not be reviewed completely.');
  }

  const paidInvoices = invoices?.state === 'verified' ? arr(invoices.paidInvoices) : [];
  const boxEvents = evidence?.state === 'verified' ? arr(evidence.boxEvents) : [];
  const deliveries = evidence?.state === 'verified' ? arr(evidence.deliveries) : [];
  const paidIds = new Set(paidInvoices.map(item => validString(item.id)).filter(Boolean));
  const links = boxEvents.filter(event => paidIds.has(validString(event.squareInvoiceId)));
  const eventInvoiceIds = new Set(links.map(event => validString(event.squareInvoiceId)));
  const unlinkedPaid = paidInvoices.filter(invoice => !eventInvoiceIds.has(validString(invoice.id)));
  const unverifiedEvents = boxEvents.filter(event => !paidIds.has(validString(event.squareInvoiceId)));
  const delivered = deliveries.filter(event => Boolean(event.deliveredAt));

  if (response && invoices?.state === 'verified' && evidence?.state === 'verified') {
    if (unlinkedPaid.length) warnings.push(`${unlinkedPaid.length} PAID Square invoice(s) not linked to a local box event.`);
    if (unverifiedEvents.length) warnings.push(`${unverifiedEvents.length} local box event(s) do not match a retrieved PAID Square invoice; initial/legacy payments may need separate evidence.`);
    if (delivered.length !== Number(subscription.boxes_sent ?? 0)) warnings.push('Delivery history count and legacy boxes_sent counter differ. Review the source records; do not silently correct either.');
    if (links.length) {
      warnings.push('Linked invoices establish payment evidence, not which specific delivery was covered. Manual entitlement mapping remains required.');
      if (disposition === 'review') label = 'Invoice links found · review coverage';
    }
  }
  return {
    disposition, label, warnings,
    squareStatus: squareStatus || null,
    invoicesState: invoices?.state || 'not_checked',
    localHistoryState: evidence?.state || 'not_checked',
    paidInvoices: paidInvoices.length,
    invoiceLinks: links.length,
    unlinkedPaidInvoices: unlinkedPaid.length,
    boxEvents: boxEvents.length,
    deliveredCount: delivered.length,
    paidInvoiceRows: paidInvoices,
    boxEventRows: boxEvents,
    deliveryRows: deliveries,
    // IMPORTANT: no "paidAndReady" flag; evidence does not establish per-box entitlement.
    automaticallyReleased: false,
  };
}
