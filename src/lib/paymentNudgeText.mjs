/* nf-payment-nudge-v12 — manual payment reminders; text is NEVER sent by the website. */
export function safeSquareLink(value, { allowSandbox = false } = {}) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.toLowerCase();
    const approved = host === 'square.link' || host === 'checkout.square.site' || (allowSandbox && host === 'sandbox.square.link');
    if (!approved || url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

export function paymentNudgeText(order) {
  const link = safeSquareLink(order?.square_link_url);
  if (!link) return '';
  const name = String(order?.name || 'there').trim().split(/\s+/)[0].replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 45) || 'there';
  const number = String(order?.order_no || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
  return `Hi ${name}! 🐝 Your NectarFusions order #${number} is just one step away from a little happiness. 🍯 We haven't received your payment yet. If you'd still like your honey, finish checkout here: ${link}\n\nAlready paid? Thank you! Please disregard this reminder. — NectarFusions`;
}

export function eligibleForNudge(order) {
  return Boolean(order && order.status === 'open' && order.requires_prepay === true && order.paid !== true && !order.archived_at && safeSquareLink(order.square_link_url));
}
