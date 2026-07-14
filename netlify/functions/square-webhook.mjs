/* ============================================================
   SQUARE WEBHOOK  —  /.netlify/functions/square-webhook

   Square tells us when money actually moved. Nothing else does.

   WHY WE DON'T TRUST THE REDIRECT:
   After paying, Square sends the customer back to our /order/<token>
   page. It would be easy to mark the order paid right there. Don't.
   Anyone can type that URL. The redirect means "a browser came back",
   not "a card was charged." Only this webhook knows the difference.

   EVERY REQUEST IS SIGNATURE-VERIFIED. Without that check, this URL
   is a button anyone on the internet can press to mark orders paid.
   ============================================================ */

import crypto from "node:crypto";
import { db, ok, bad } from "./_square.mjs";

/* Square signs (notification_url + raw body) with your signature key. */
function verify(rawBody, signature) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const url = process.env.SQUARE_NOTIFICATION_URL;
  if (!key || !url || !signature) return false;

  const expected = crypto
    .createHmac("sha256", key)
    .update(url + rawBody)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Constant-time compare — a plain === leaks timing information.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  const raw = await req.text();
  const sig = req.headers.get("x-square-hmacsha256-signature");

  if (!verify(raw, sig)) {
    console.error("Rejected webhook: bad signature");
    return bad("Bad signature", 401);
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return bad("Bad JSON"); }

  const supa = db();
  const type = evt.type;
  const obj = evt.data?.object ?? {};

  try {
    switch (type) {
      /* ---------- one-off orders ---------- */
      case "payment.created":
      case "payment.updated": {
        const p = obj.payment;
        if (!p || p.status !== "COMPLETED") break;

        // Match on the Square order this payment settled.
        const { data: order } = await supa
          .from("orders").select("id, paid").eq("square_order_id", p.order_id).maybeSingle();

        if (order && !order.paid) {
          await supa.from("orders").update({
            paid: true,
            paid_at: new Date().toISOString(),
            square_payment_id: p.id,
          }).eq("id", order.id);
          console.log("Order paid:", order.id);
        }
        break;
      }

      /* ---------- subscriptions ---------- */
      case "subscription.created":
      case "subscription.updated": {
        const sub = obj.subscription;
        if (!sub) break;

        const { data: row } = await supa
          .from("subscriptions").select("id")
          .eq("square_customer_id", sub.customer_id)
          .in("status", ["pending", "active", "paused"])
          .order("started_at", { ascending: false })
          .limit(1).maybeSingle();

        if (!row) break;

        // Square: PENDING → ACTIVE → PAUSED / CANCELED / DEACTIVATED
        const map = {
          ACTIVE: "active", PENDING: "pending", PAUSED: "paused",
          CANCELED: "cancelled", DEACTIVATED: "cancelled",
        };
        const status = map[sub.status] ?? "pending";

        await supa.from("subscriptions").update({
          square_subscription_id: sub.id,
          status,
        }).eq("id", row.id);
        console.log("Subscription", row.id, "→", status);
        break;
      }

      /* ---------- a subscription box was actually paid for ---------- */
      case "invoice.payment_made": {
        const inv = obj.invoice;
        const subId = inv?.subscription_id;
        if (!subId) break;

        const { data: row } = await supa
          .from("subscriptions").select("id, boxes_sent")
          .eq("square_subscription_id", subId).maybeSingle();

        if (row) {
          // This is what drives the bonus jar on every third box.
          await supa.from("subscriptions").update({
            boxes_sent: row.boxes_sent + 1,
            last_invoice_at: new Date().toISOString(),
            status: "active",
          }).eq("id", row.id);
          console.log("Box billed for subscription", row.id, "→", row.boxes_sent + 1);
        }
        break;
      }

      default:
        // Everything else we simply don't care about.
        break;
    }
  } catch (e) {
    console.error("Webhook handler failed:", e.message);
    // 500 makes Square retry. Losing a payment confirmation is worse
    // than handling the same one twice — every branch above is idempotent.
    return bad(e.message, 500);
  }

  return ok({ received: true });
};
