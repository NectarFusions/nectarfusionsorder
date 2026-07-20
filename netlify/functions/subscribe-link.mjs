/* ============================================================
   SUBSCRIBE LINK  —  /.netlify/functions/subscribe-link

   POST { token }  →  { url }

   Creates a Square hosted checkout page that stores the card and
   starts the selected Honey Club subscription.
   ============================================================ */

import { square, db, site, ok, bad } from "./_square.mjs";

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
    if (s.square_checkout_url) return ok({ url: s.square_checkout_url });

    const plan = s.plans;
    const variationId =
      s.cadence === "1mo" ? plan.square_var_1mo : plan.square_var_2mo;

    if (!variationId) {
      return bad(
        "Honey Club checkout is temporarily unavailable because its Square plan is not configured.",
        500
      );
    }

    const res = await square("/v2/online-checkout/payment-links", {
      body: {
        idempotency_key: `sub-link-${s.id}`,
        description: `Honey Club — ${plan.name}`,
        quick_pay: {
          name: `${plan.name} — ${
            s.cadence === "1mo" ? "monthly" : "every 2 months"
          }`,
          price_money: { amount: plan.price_cents, currency: "USD" },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        checkout_options: {
          subscription_plan_id: variationId,
          redirect_url: `${site()}/club/${s.token}`,
          ask_for_shipping_address: s.method === "ship",
          merchant_support_email: "info@nectar-fusions.com",
        },
        pre_populated_data: {
          buyer_email: s.customers.email,
        },
      },
    });

    const url = res.payment_link?.url;
    if (!url) {
      throw new Error("Square did not return a subscription checkout URL.");
    }

    const { error: updateError } = await supa
      .from("subscriptions")
      .update({
        square_checkout_url: url,
        square_plan_variation_id: variationId,
      })
      .eq("id", s.id);

    if (updateError) {
      throw new Error(
        `Checkout was created, but saving its link failed: ${updateError.message}`
      );
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
