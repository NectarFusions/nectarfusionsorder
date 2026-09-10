/* ============================================================
   SQUARE WEBHOOK — /.netlify/functions/square-webhook

   Square is authoritative for payments and recurring billing state.
   Every request is signature verified.
   ============================================================ */

import crypto from "node:crypto";
import { square, db, ok, bad } from "./_square.mjs";

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
  try {
    evt = JSON.parse(raw);
  } catch {
    return bad("Bad JSON");
  }

  const supa = db();
  const type = evt.type;
  const obj = evt.data?.object ?? {};

  try {
    switch (type) {
      case "payment.created":
      case "payment.updated": {
        const p = obj.payment;
        if (!p || p.status !== "COMPLETED") break;

        const { data: order } = await supa
          .from("orders")
          .select("id, paid")
          .eq("square_order_id", p.order_id)
          .maybeSingle();

        if (order && !order.paid) {
          await supa
            .from("orders")
            .update({
              paid: true,
              paid_at: new Date().toISOString(),
              square_payment_id: p.id,
            })
            .eq("id", order.id);
        }
        break;
      }

      case "subscription.created":
      case "subscription.updated": {
        const sub = obj.subscription;
        if (!sub) break;

        let row = null;

        const exact = await supa
          .from("subscriptions")
          .select("id, billing_mode")
          .eq("square_subscription_id", sub.id)
          .maybeSingle();

        row = exact.data ?? null;

        if (!row && sub.customer_id && sub.plan_variation_id) {
          const result = await square(
            `/v2/customers/${sub.customer_id}`,
            { method: "GET" }
          );

          const email = result.customer?.email_address?.trim();

          if (email) {
            const fallback = await supa
              .from("subscriptions")
              .select(`
                id,
                cadence,
                billing_mode,
                customers!inner(email),
                plans!inner(square_var_1mo, square_var_2mo)
              `)
              .ilike("customers.email", email)
              .eq("status", "pending")
              .order("started_at", { ascending: false })
              .limit(10);

            row =
              fallback.data?.find((candidate) => {
                const expectedVariation =
                  candidate.cadence === "1mo"
                    ? candidate.plans?.square_var_1mo
                    : candidate.plans?.square_var_2mo;

                return expectedVariation === sub.plan_variation_id;
              }) ?? null;
          }
        }

        if (!row) {
          console.error(
            "No local subscription matched Square subscription",
            sub.id,
            sub.customer_id,
            sub.plan_variation_id
          );
          break;
        }

        const map = {
          ACTIVE: "active",
          PENDING: "pending",
          PAUSED: "paused",
          CANCELED: "cancelled",
          DEACTIVATED: "cancelled",
        };

        let status = map[sub.status] ?? "pending";

        // Market Pickup remains an active Honey Club membership even while
        // the underlying Square subscription is intentionally paused.
        if (row.billing_mode === "market_manual" && status === "paused") {
          status = "active";
        }

        let actionsLoaded = false;
        let scheduledResumeDate = null;

        try {
          const detail = await square(
            `/v2/subscriptions/${sub.id}?include=actions`,
            { method: "GET" }
          );

          const actions = detail.actions || [];
          scheduledResumeDate =
            actions.find((action) => action.type === "RESUME")
              ?.effective_date ?? null;
          actionsLoaded = true;
        } catch (actionError) {
          console.error(
            "Could not refresh scheduled actions for subscription",
            sub.id,
            actionError.message
          );
        }

        const patch = {
          square_customer_id: sub.customer_id,
          square_subscription_id: sub.id,
          status,
        };

        if (
          row.billing_mode !== "market_manual" &&
          sub.status === "ACTIVE"
        ) {
          patch.billing_mode = "card";
        }

        if (actionsLoaded) {
          patch.paused_until =
            row.billing_mode === "market_manual"
              ? null
              : scheduledResumeDate;
        }

        if (sub.plan_variation_id) {
          patch.square_plan_variation_id = sub.plan_variation_id;
        }

        await supa
          .from("subscriptions")
          .update(patch)
          .eq("id", row.id);

        break;
      }

      case "invoice.payment_made": {
        const inv = obj.invoice;
        const squareSubscriptionId = inv?.subscription_id;
        if (!squareSubscriptionId || !inv?.id) break;

        const eventId =
          evt.event_id ||
          evt.id ||
          `square-invoice:${inv.id}`;

        const { data, error } = await supa.rpc(
          "record_subscription_invoice_payment",
          {
            p_event_id: eventId,
            p_invoice_id: inv.id,
            p_square_subscription_id: squareSubscriptionId,
            p_paid_at: new Date().toISOString(),
          }
        );

        if (error) {
          throw new Error(error.message);
        }

        console.log(
          "Honey Club paid box recorded",
          data?.subscription_id,
          data?.box_number,
          data?.bonus_jar_due ? "BONUS DUE" : ""
        );
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Webhook handler failed:", error.message);
    return bad(error.message, 500);
  }

  return ok({ received: true });
};
