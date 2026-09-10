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
import { Resend } from "resend";
import { square, db, ok, bad } from "./_square.mjs";
import { sendSubscriptionEmails } from "./_subscription-email.mjs";

const BONUS_ALERT_FROM = "NectarFusions <orders@nectar-fusions.com>";
const BONUS_ALERT_TO = () =>
  process.env.BONUS_JAR_ALERT_EMAIL || "info@nectar-fusions.com";

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const variationForPlan = (plan, cadence) =>
  cadence === "1mo" ? plan?.square_var_1mo : plan?.square_var_2mo;

const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
      })[character]
  );

async function sendBonusJarAlert(record) {
  if (!record?.bonus_jar_due || record?.duplicate) return;

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) {
    console.error(
      "Bonus jar email skipped: RESEND_API_KEY is missing. The admin notification alert remains active."
    );
    return;
  }

  try {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: BONUS_ALERT_FROM,
      to: BONUS_ALERT_TO(),
      subject: `Bonus jar due — Honey Club #${record.sub_no} — box #${record.box_number}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.55;color:#3E2B17">
          <h1 style="font-size:24px;margin:0 0 12px">Bonus jar due</h1>
          <p style="font-size:17px;margin:0 0 14px">
            Add one bonus jar to <strong>Honey Club #${esc(record.sub_no)}</strong>
            for <strong>${esc(record.customer_name || "the member")}</strong>.
          </p>
          <p style="margin:0 0 8px"><strong>Paid box:</strong> #${esc(record.box_number)}</p>
          <p style="margin:0 0 8px"><strong>Plan:</strong> ${esc(record.plan_name)}</p>
          <p style="margin:18px 0 0">
            This reminder remains open in the NectarFusions Admin Honey Club screen
            until you select <strong>Mark bonus jar packed</strong>.
          </p>
        </div>
      `,
    });

    if (result?.error) {
      console.error(
        "Bonus jar email failed:",
        result.error.message || "Unknown Resend error"
      );
    }
  } catch (emailError) {
    console.error("Bonus jar email failed:", emailError.message);
  }
}

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

        let row = null;

        // 1. An already-linked Square subscription must only update
        //    the exact local subscription it belongs to.
        const exact = await supa
          .from("subscriptions")
          .select("id,status,billing_mode,pending_plan_id,pending_cadence,plan_change_effective_date,plan_change_status,saved_square_card_id")
          .eq("square_subscription_id", sub.id)
          .maybeSingle();

        row = exact.data ?? null;

        // 2. For the first webhook from hosted checkout, identify the
        //    customer's newest pending local subscription whose selected
        //    cadence maps to this exact Square plan variation.
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
                status,
                cadence,
                billing_mode,
                customers!inner(email),
                plans!subscriptions_plan_id_fkey!inner(square_var_1mo, square_var_2mo)
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

        if (
          String(sub.status || "").toUpperCase() === "CANCELED" &&
          row.plan_change_status === "scheduled" &&
          row.pending_plan_id &&
          row.pending_cadence
        ) {
          const { data: targetPlan, error: targetPlanError } = await supa
            .from("plans")
            .select("id,name,square_var_1mo,square_var_2mo")
            .eq("id", row.pending_plan_id)
            .maybeSingle();

          if (targetPlanError) throw targetPlanError;
          if (!targetPlan) {
            throw new Error(`Pending Honey Club plan ${row.pending_plan_id} no longer exists.`);
          }

          const variationId = variationForPlan(targetPlan, row.pending_cadence);
          const cardId = row.saved_square_card_id || sub.card_id;
          const customerId = sub.customer_id;
          const locationId = sub.location_id || process.env.SQUARE_LOCATION_ID;

          if (!variationId || !cardId || !customerId || !locationId) {
            throw new Error(
              "The scheduled Honey Club plan change is missing Square billing information."
            );
          }

          const today = localDate();
          const requestedStart = row.plan_change_effective_date || today;
          const startDate = requestedStart > today ? requestedStart : today;

          const created = await square("/v2/subscriptions", {
            method: "POST",
            body: {
              idempotency_key:
                `plan-change-activate-${row.id}-${row.pending_plan_id}-${row.pending_cadence}-${requestedStart}`,
              location_id: locationId,
              customer_id: customerId,
              plan_variation_id: variationId,
              card_id: cardId,
              start_date: startDate,
            },
          });

          const replacement = created.subscription;
          if (!replacement?.id) {
            throw new Error("Square did not create the scheduled replacement subscription.");
          }

          const { error: planChangeUpdateError } = await supa
            .from("subscriptions")
            .update({
              plan_id: row.pending_plan_id,
              cadence: row.pending_cadence,
              square_customer_id: customerId,
              square_subscription_id: replacement.id,
              square_plan_variation_id: variationId,
              billing_mode: "card",
              status: "active",
              pending_plan_id: null,
              pending_cadence: null,
              plan_change_effective_date: null,
              plan_change_status: null,
              paused_until: null,
              market_pause_action_id: null,
            })
            .eq("id", row.id);

          if (planChangeUpdateError) throw planChangeUpdateError;

          const { error: auditUpdateError } = await supa
            .from("subscription_plan_change_events")
            .update({
              status: "completed",
              new_square_subscription_id: replacement.id,
              completed_at: new Date().toISOString(),
            })
            .eq("subscription_id", row.id)
            .eq("status", "scheduled");

          if (auditUpdateError) {
            console.error("Plan change completed but audit update failed:", auditUpdateError);
          }

          console.log(
            "Honey Club plan change completed:",
            row.id,
            "->",
            row.pending_plan_id,
            row.pending_cadence,
            replacement.id
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
        // Square is intentionally paused or deactivated for card billing.
        if (
          row.billing_mode === "market_manual" &&
          ["PAUSED", "DEACTIVATED"].includes(
            String(sub.status || "").toUpperCase()
          )
        ) {
          status = "active";
        }

        /*
          The webhook payload does not include Square's scheduled actions.
          Retrieve them so paused_until always mirrors the currently
          scheduled RESUME action:

          - one-cycle skip scheduled or active -> exact automatic resume date
          - automatic resume completed -> null
          - cancellation or an indefinite/manual pause -> null

          If this retrieval fails, leave paused_until untouched instead of
          accidentally erasing a valid future resume date.
        */
        let actionsLoaded = false;
        let scheduledResumeDate = null;

        try {
          const detail = await square(
            `/v2/subscriptions/${sub.id}?include=actions`,
            { method: "GET" }
          );

          const actions =
            detail.subscription?.actions || detail.actions || [];
          scheduledResumeDate =
            actions.find((action) => action.type === "RESUME")?.effective_date ??
            null;
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

        const { error: subscriptionUpdateError } = await supa
          .from("subscriptions")
          .update(patch)
          .eq("id", row.id);

        if (subscriptionUpdateError) throw subscriptionUpdateError;

        if (
          status === "active" &&
          sub.status === "ACTIVE" &&
          row.billing_mode !== "market_manual"
        ) {
          const { data: activatedSubscription, error: activationReadError } =
            await supa
              .from("subscriptions")
              .select("*, customers(*), plans!subscriptions_plan_id_fkey(*)")
              .eq("id", row.id)
              .single();

          if (activationReadError) throw activationReadError;
          await sendSubscriptionEmails(activatedSubscription, "activated");
        }

        console.log("Subscription", row.id, "→", status);
        break;
      }

      /* ---------- a subscription box was actually paid for ---------- */
      case "invoice.payment_made": {
        const inv = obj.invoice;
        const subId = inv?.subscription_id;
        const invoiceId = inv?.id;
        const eventId = evt.event_id || (invoiceId ? `${type}:${invoiceId}` : null);

        // Square's generic sample invoice has no subscription_id. A real
        // Honey Club invoice must have all three identifiers below.
        if (!subId) break;
        if (!invoiceId || !eventId) {
          throw new Error("Subscription invoice webhook is missing its Square identifiers.");
        }

        /*
          One atomic database function now owns all box counting:

          - Square event IDs and invoice IDs are unique
          - a replay returns duplicate=true without incrementing
          - boxes_sent and the event row commit together
          - a third/sixth/ninth paid box creates a persistent bonus alert
          - an invoice arriving before subscription.created returns 500 so
            Square retries after the subscription link exists
        */
        const { data, error } = await supa.rpc(
          "record_subscription_invoice_payment",
          {
            p_event_id: eventId,
            p_invoice_id: invoiceId,
            p_square_subscription_id: subId,
            p_paid_at: inv.updated_at || evt.created_at || new Date().toISOString(),
          }
        );

        let record = Array.isArray(data) ? data[0] : data;

        const trackingMigrationMissing =
          error &&
          (error.code === "PGRST202" ||
            error.code === "42883" ||
            String(error.message || "").includes(
              "Could not find the function public.record_subscription_invoice_payment"
            ));

        if (trackingMigrationMissing) {
          /*
            Deployment safety: Netlify may publish this function before the
            Supabase migration is applied. Keep the current production path
            working rather than rejecting real payments. The migration must
            still be applied to enable duplicate protection and bonus alerts.
          */
          console.error(
            "Subscription box tracking migration is not applied yet; using the legacy counter."
          );

          const { data: legacyRow, error: legacyReadError } = await supa
            .from("subscriptions")
            .select("id, boxes_sent")
            .eq("square_subscription_id", subId)
            .maybeSingle();

          if (legacyReadError) throw legacyReadError;
          if (!legacyRow) {
            throw new Error(
              `Subscription is not linked yet for Square subscription ${subId}.`
            );
          }

          const nextBox = Number(legacyRow.boxes_sent || 0) + 1;
          const { error: legacyUpdateError } = await supa
            .from("subscriptions")
            .update({
              boxes_sent: nextBox,
              last_invoice_at:
                inv.updated_at || evt.created_at || new Date().toISOString(),
              status: "active",
            })
            .eq("id", legacyRow.id);

          if (legacyUpdateError) throw legacyUpdateError;

          record = {
            duplicate: false,
            legacy: true,
            subscription_id: legacyRow.id,
            box_number: nextBox,
            bonus_jar_due: false,
          };
        } else if (error) {
          throw error;
        }

        if (!record) {
          throw new Error("Subscription invoice was not recorded.");
        }

        if (record.duplicate) {
          console.log(
            "Duplicate subscription invoice ignored:",
            invoiceId,
            "box",
            record.box_number
          );
          break;
        }

        console.log(
          "Box billed for subscription",
          record.subscription_id,
          "→",
          record.box_number,
          record.bonus_jar_due ? "(bonus jar due)" : ""
        );

        await sendBonusJarAlert(record);
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
