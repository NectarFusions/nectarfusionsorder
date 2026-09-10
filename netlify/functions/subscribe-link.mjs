/* ============================================================
   SUBSCRIBE LINK  —  /.netlify/functions/subscribe-link

   POST { token } → { url }

   Delivery members complete fulfillment details first, then Square
   securely stores the card and starts recurring billing.
   Market Pickup members never enter recurring Square billing.
   ============================================================ */

import { square, db, site, ok, bad } from "./_square.mjs";
import { sendSubscriptionEmails } from "./_subscription-email.mjs";

const absolute = (path) => `${site()}${path}`;

const fulfillmentComplete = (s) => {
  if (!s.terms_accepted_at || !s.terms_version) return false;

  if (s.method === "market") {
    return Boolean(s.market_date_id);
  }

  if (s.method === "delivery") {
    return Boolean(
      s.address &&
        s.delivery_zip &&
        s.delivery_location_type &&
        s.preferred_contact_method
    );
  }

  return true;
};

export default async (req) => {
  try {
    if (req.method !== "POST") return bad("POST only", 405);

    let token;
    try {
      ({ token } = await req.json());
    } catch {
      return bad("Bad JSON");
    }

    if (!token) return bad("No token");

    const supa = db();
    const { data: s, error } = await supa
      .from("subscriptions")
      .select("*, plans(*), customers(*)")
      .eq("token", token)
      .single();

    if (error || !s) return bad("Subscription not found", 404);
    if (s.status === "cancelled") return bad("That subscription is cancelled");

    if (!fulfillmentComplete(s)) {
      return ok({
        url: absolute(`/club/${s.token}/fulfillment?setup=1`),
        fulfillment_required: true,
      });
    }

    if (s.method === "market") {
      const { error: updateError } = await supa
        .from("subscriptions")
        .update({
          status: "active",
          billing_mode: "market_manual",
          fulfillment_updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);

      if (updateError) throw new Error(updateError.message);

      return ok({
        url: absolute(`/club/${s.token}`),
        market_manual: true,
      });
    }

    if (s.method === "delivery" && s.square_subscription_id) {
      return ok({
        url: absolute(`/club/${s.token}`),
        billing_active: true,
      });
    }

    if (s.square_checkout_url) {
      try {
        await sendSubscriptionEmails(s, "started");
      } catch (emailError) {
        console.error("Honey Club setup email failed:", emailError.message);
      }
      return ok({ url: s.square_checkout_url });
    }

    const plan = s.plans;
    const variationId =
      s.cadence === "1mo" ? plan.square_var_1mo : plan.square_var_2mo;

    if (!variationId) {
      return bad(
        "Honey Club checkout is temporarily unavailable because its Square plan is not configured.",
        500
      );
    }

    const checkoutGeneration = String(
      s.plan_change_requested_at || s.started_at || "initial"
    )
      .replace(/[^0-9A-Za-z]/g, "")
      .slice(-32);

    const res = await square("/v2/online-checkout/payment-links", {
      body: {
        idempotency_key:
          `sub-link-${s.id}-${variationId}-${checkoutGeneration}`,
        description: `Honey Club — ${plan.name}`,
        quick_pay: {
          name: `${plan.name} — ${
            s.cadence === "1mo" ? "monthly" : "every 2 months"
          }`,
          price_money: {
            amount: plan.price_cents,
            currency: "USD",
          },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: {
          subscription_plan_id: variationId,
          redirect_url: absolute(`/club/${s.token}`),
          ask_for_shipping_address: s.method === "ship",
          merchant_support_email: "info@nectar-fusions.com",
        },
        pre_populated_data: {
          buyer_email: s.customers.email,
        },
      },
    });

    const url = res.payment_link?.url;
    const paymentLinkId = res.payment_link?.id || null;
    if (!url) {
      throw new Error("Square did not return a subscription checkout URL.");
    }

    const { error: updateError } = await supa
      .from("subscriptions")
      .update({
        square_checkout_url: url,
        square_checkout_link_id: paymentLinkId,
        square_plan_variation_id: variationId,
        billing_mode: "card_setup_required",
      })
      .eq("id", s.id);

    if (updateError) {
      throw new Error(
        `Checkout was created, but saving its link failed: ${updateError.message}`
      );
    }

    try {
      await sendSubscriptionEmails(
        {
          ...s,
          square_checkout_url: url,
          square_plan_variation_id: variationId,
          billing_mode: "card_setup_required",
        },
        "started"
      );
    } catch (emailError) {
      console.error("Honey Club setup email failed:", emailError.message);
    }

    return ok({ url });
  } catch (error) {
    console.error("subscribe-link failed:", error);

    const message = String(error?.message || "");
    const missingCatalogObject =
      message.includes("Catalog object with ID") &&
      message.includes("not found");

    return bad(
      missingCatalogObject
        ? "Honey Club checkout is temporarily unavailable because the saved Square plan no longer exists in the current Square environment. Your membership request may already be saved; please do not submit it again."
        : "Honey Club checkout is temporarily unavailable. Your membership request may already be saved; please do not submit it again.",
      500
    );
  }
};
