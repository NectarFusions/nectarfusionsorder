/* ============================================================
   PAY LINK  —  /.netlify/functions/pay-link

   POST { token }  →  { url }

   Builds a Square-hosted checkout page for one order.

   The token is the ONLY thing the client sends. Everything that
   matters — what's in the order, what it costs — is read back
   out of Postgres here. The browser never gets to say what it
   owes. If it could, someone would tell us $0.00.
   ============================================================ */

import { square, db, idem, site, ok, bad } from "./_square.mjs";

const typeName = (t) => (t === "spun" ? "Spun" : "Regular");

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  let token;
  try { ({ token } = await req.json()); } catch { return bad("Bad JSON"); }
  if (!token) return bad("No token");

  const supa = db();
  const { data: o, error } = await supa
    .from("orders")
    .select("*, order_items(*)")
    .eq("token", token)
    .single();

  if (error || !o) return bad("Order not found", 404);
  if (o.status === "cancelled") return bad("That order is cancelled");
  if (o.paid) return bad("That order is already paid");

  // Already made one? Hand back the same link rather than a second one.
  if (o.square_link_url) return ok({ url: o.square_link_url });

  const lineItems = o.order_items.map((i) => ({
    name: `${i.size_label} ${typeName(i.type)} — ${i.flavor_name}`,
    quantity: String(i.qty),
    base_price_money: { amount: i.unit_cents, currency: "USD" },
  }));

  /* The bundle discount lives in Postgres, not Square. Rather than
     rebuild the 3-for-$20 rule inside Square's catalog, we send the
     difference as a single discount line. One source of truth. */
  const listTotal = o.order_items.reduce((s, i) => s + i.qty * i.unit_cents, 0);
  const discount = listTotal - o.subtotal_cents;

  const orderBody = {
    location_id: process.env.SQUARE_LOCATION_ID,
    reference_id: o.order_no,
    line_items: lineItems,
    ...(discount > 0 && {
      discounts: [{
        name: "Bundle — 3 for $20",
        amount_money: { amount: discount, currency: "USD" },
        scope: "ORDER",
      }],
    }),
    ...(o.fee_cents > 0 && {
      service_charges: [{
        name: "Local delivery",
        amount_money: { amount: o.fee_cents, currency: "USD" },
        calculation_phase: "TOTAL_PHASE",
      }],
    }),
  };

  const res = await square("/v2/online-checkout/payment-links", {
    body: {
      idempotency_key: `order-${o.id}`,
      order: orderBody,
      checkout_options: {
        redirect_url: `${site()}/order/${o.token}`,
        ask_for_shipping_address: false,
        merchant_support_email: "info@nectar-fusions.com",
      },
      pre_populated_data: {
  buyer_email: o.email,
},
      description: `NectarFusions order #${o.order_no}`,
    },
  });

  const link = res.payment_link;

  await supa.from("orders").update({
    square_link_url: link.url,
    square_link_id: link.id,
    square_order_id: link.order_id,
  }).eq("id", o.id);

  return ok({ url: link.url });
};
