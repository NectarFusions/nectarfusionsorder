/* ============================================================
   SUBSCRIBE LINK  —  /.netlify/functions/subscribe-link

   POST { token }  →  { url }

   Creates the Square customer, then a hosted checkout page that
   takes their card, stores it on file, and starts the subscription.

   THE TRAP: the Checkout API field is called `subscription_plan_id`,
   but it wants the plan VARIATION id — the thing that knows the
   price and the cadence. Pass the plan id and Square answers with
   "incorrect object type", which tells you nothing.

   WHY THIS WORKS FOR MARKET PICKUP:
   Square's subscription *order templates* only support shipping,
   not in-person pickup. So we don't use one. The variation carries
   a STATIC price and nothing else — Square just charges the card on
   the cadence. Fulfilment is ours to handle. Square bills; we deliver.
   ============================================================ */

import { square, db, site, ok, bad } from "./_square.mjs";

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  let token;
  try { ({ token } = await req.json()); } catch { return bad("Bad JSON"); }
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
  const variationId = s.cadence === "1mo" ? plan.square_var_1mo : plan.square_var_2mo;

  if (!variationId) {
    return bad("Square plans aren't set up yet. Run /.netlify/functions/square-setup first.", 500);
  }

  /* ---- 1. Square needs a customer profile, and it needs an email.
            That's where it sends invoices and receipts. ---- */
  let squareCustomerId = s.square_customer_id;
  if (!squareCustomerId) {
    const parts = (s.customers.name || "").trim().split(/\s+/);
    const created = await square("/v2/customers", {
      body: {
        idempotency_key: `sub-cust-${s.id}`,
        given_name: parts[0] || "Member",
        family_name: parts.slice(1).join(" ") || undefined,
        email_address: s.customers.email,
        phone_number: s.customers.phone,
        reference_id: s.sub_no,
        note: `Honey Club ${plan.name} · ${s.method}`,
      },
    });
    squareCustomerId = created.customer.id;
  }

  /* ---- 2. the hosted checkout that stores the card ---- */
  const res = await square("/v2/online-checkout/payment-links", {
    body: {
      idempotency_key: `sub-link-${s.id}`,
      description: `Honey Club — ${plan.name}`,
      quick_pay: {
        name: `${plan.name} — ${s.cadence === "1mo" ? "monthly" : "every 2 months"}`,
        price_money: { amount: plan.price_cents, currency: "USD" },
        location_id: process.env.SQUARE_LOCATION_ID,
      },
      // The field says "plan", the value must be the VARIATION.
      subscription_plan_id: variationId,
      checkout_options: {
        redirect_url: `${site()}/club/${s.token}`,
        ask_for_shipping_address: s.method === "ship",
        merchant_support_email: "info@nectar-fusions.com",
      },
      pre_populated_data: {
        buyer_email: s.customers.email,
      },
    },
  });

  const url = res.payment_link.url;

  await supa.from("subscriptions").update({
    square_customer_id: squareCustomerId,
    square_checkout_url: url,
    square_plan_variation_id: variationId,
  }).eq("id", s.id);

  return ok({ url });
};
