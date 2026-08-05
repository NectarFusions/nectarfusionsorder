/* ============================================================
   ORDER EMAIL  —  /.netlify/functions/order-email

   Sends two emails: a receipt to the customer and an alert to
   info@nectar-fusions.com. It can be called in two safe ways:

   1. Supabase Database Webhook for inserts and later changes.
   2. The storefront immediately after a new order is saved, using
      the private order token returned by the place_order RPC.

   The storefront path fixes missed confirmations when the database
   webhook is disabled or misconfigured. The webhook remains a
   server-side backup if the browser closes early. Stable Resend
   idempotency keys keep both paths from sending duplicate emails.

   WHY WE RE-FETCH THE ORDER:
   The webhook payload arrives with the `orders` row but NOT the
   order_items — those are written a moment later in the same
   function. So we take the id and read the whole order back
   ourselves. No race, no half-empty receipts.

   Required env vars (Netlify → Site settings → Environment):
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   ← server only. Never in the frontend.
     RESEND_API_KEY
     WEBHOOK_SECRET              ← any long random string; also set in Supabase
     SITE_URL                    ← https://your-site.netlify.app
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";

const G = { gold: "#F7C41C", amber: "#E69B00", blue: "#24A0ED", dark: "#174A68", brown: "#526B7B", cream: "#F5EFE7", red: "#FF3B30" };

const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const esc = (s) => String(s ?? "").replace(/[<>&"]/g, (m) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[m]));
const typeName = (t) => (t === "spun" ? "Spun" : "Regular");

function itemRows(items) {
  return items.map((i) => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid #E7DCC9;font:15px Helvetica,Arial,sans-serif;color:#111">
        <strong>${i.qty}×</strong> ${esc(i.size_label)} ${typeName(i.type)} — ${esc(i.flavor_name)}
      </td>
    </tr>`).join("");
}

function whenLine(o) {
  if (o.method === "market") {
    const m = o.market_dates;
    if (!m) return "Market pickup";
    return `${esc(m.venues?.name ?? "Market")} — ${m.day}${m.venues?.hours ? `, ${esc(m.venues.hours)}` : ""}`;
  }
  if (o.method === "ship") return "Ships in 2–3 business days";
  return `Delivery on ${o.delivery_day}`;
}

/* ---------- customer receipt ---------- */
function customerEmail(o, siteUrl) {
  const link = `${siteUrl}/order/${o.token}`;
  const market = o.method === "market";
  return `
<div style="background:${G.cream};padding:26px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E7DCC9">

    <div style="padding:26px 24px 20px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${G.amber}">
        Order confirmed
      </div>
      <div style="font-size:52px;font-weight:700;color:#111;letter-spacing:.04em;margin-top:4px">#${esc(o.order_no)}</div>
      ${market ? `<div style="font-size:14px;color:${G.brown};margin-top:6px;line-height:1.5">
        Show this number at our table and we&rsquo;ll have your jars ready.</div>` : ""}
    </div>

    <div style="padding:22px 24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${G.brown};margin-bottom:6px">
        ${market ? "Pickup" : o.method === "ship" ? "Shipping" : "Delivery"}
      </div>
      <div style="font-size:16px;font-weight:600;color:#111">${whenLine(o)}</div>
      ${o.address ? `<div style="font-size:14px;color:${G.brown};margin-top:3px">${esc(o.address)}</div>` : ""}

      <table style="width:100%;border-collapse:collapse;margin-top:18px">${itemRows(o.order_items)}</table>

      <table style="width:100%;margin-top:14px">
        <tr>
          <td style="font:600 15px Helvetica,Arial,sans-serif;color:#111">Total</td>
          <td style="text-align:right;font:700 26px Helvetica,Arial,sans-serif;color:${G.dark}">${money(o.total_cents)}</td>
        </tr>
        ${o.fee_cents > 0 ? `<tr><td colspan="2" style="font:13px Helvetica,Arial,sans-serif;color:${G.brown};padding-top:2px">
          Includes ${money(o.fee_cents)} delivery</td></tr>` : ""}
      </table>

      <div style="margin-top:20px;padding:14px;background:#FBF7F1;border-radius:6px;font-size:14px;color:${G.dark};line-height:1.6">
        ${market ? "Pay at the market table — cash, card, or tap."
          : o.method === "ship" ? "We'll send a payment link and tracking once it's packed."
          : "We'll text you to confirm your window and take payment."}
      </div>

      <a href="${link}" style="display:block;margin-top:18px;padding:14px;background:${G.blue};color:#fff;
        text-align:center;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px">
        View or Change Your Order
      </a>
      <div style="font-size:12.5px;color:${G.brown};margin-top:9px;line-height:1.55;text-align:center">
        For 30 minutes, you may replace a flavor with another available flavor of the same size, texture, quantity, and price. For quantities, sizes, refunds, or another type of change, contact NectarFusions directly.
      </div>
    </div>

    <div style="padding:16px 24px;border-top:1px solid #E7DCC9;text-align:center;font-size:12.5px;color:${G.brown};line-height:1.7">
      <strong style="color:${G.dark}">NectarFusions</strong> · Coleman, Michigan<br>
      ${OWNER}
    </div>
  </div>
  <div style="max-width:520px;margin:14px auto 0;text-align:center;font-size:11.5px;color:#9A8D79;line-height:1.6">
    Never feed honey to infants under one year old.
  </div>
</div>`;
}

/* ---------- your alert ---------- */
function ownerEmail(o, siteUrl, event) {
  const flagged = o.customers?.flagged;
  const heading = event === "cancelled" ? "ORDER CANCELLED" : event === "changed" ? "CUSTOMER CHANGED ORDER" : event === "status" ? "ORDER STATUS UPDATED" : "NEW ORDER";
  const colour = event === "cancelled" ? G.red : G.amber;
  return `
<div style="background:${G.cream};padding:22px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;border:2px solid ${colour};overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;color:${colour}">${heading}</div>
      <div style="font-size:40px;font-weight:700;color:#111;letter-spacing:.04em">#${esc(o.order_no)}</div>
      <div style="font-size:15px;font-weight:600;color:#111;margin-top:4px">${esc(o.name)} — ${money(o.total_cents)}</div>
    </div>

    ${flagged ? `<div style="padding:12px 22px;background:#FFF3F2;border-bottom:1px solid #E7DCC9;
      font-size:13px;font-weight:700;color:#8A1F19;line-height:1.5">
      ⚠ FLAGGED CUSTOMER — ${o.customers.consecutive_noshows} no-shows in a row.
      Take payment before you pack this.</div>` : ""}

    <div style="padding:18px 22px">
      <div style="font-size:14px;color:${G.dark};line-height:1.7">
        <strong>${o.method === "market" ? "Pickup" : o.method === "ship" ? "Shipping" : "Delivery"}</strong> — ${whenLine(o)}<br>
        ${esc(o.phone)} · ${esc(o.email)}<br>
        ${o.address ? esc(o.address) + "<br>" : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:14px">${itemRows(o.order_items)}</table>

      ${o.notes ? `<div style="margin-top:14px;padding:11px;background:#FBF7F1;border-radius:6px;
        font-size:13.5px;color:${G.dark};line-height:1.55"><strong>Notes:</strong> ${esc(o.notes)}</div>` : ""}

      <a href="${siteUrl}/order/${o.token}" style="display:block;margin-top:16px;padding:12px;
        background:${G.dark};color:#fff;text-align:center;text-decoration:none;border-radius:6px;
        font-weight:700;font-size:14px">Open this order</a>
    </div>
  </div>
</div>`;
}

/* ============================================================ */
const ORDER_SELECT =
  "*, order_items(*), customers(flagged, consecutive_noshows), " +
  "market_dates(day, venues(name, hours))";

const safeKeyPart = (value) =>
  String(value ?? "unknown").replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 100);

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const secret = req.headers.get("x-webhook-secret");
  const trustedWebhook =
    Boolean(process.env.WEBHOOK_SECRET) && secret === process.env.WEBHOOK_SECRET;

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let event = "placed";
  let record = null;
  let oldRecord = null;
  let orderQuery = supa.from("orders").select(ORDER_SELECT);

  if (trustedWebhook) {
    ({ record, old_record: oldRecord } = body);

    if (!record?.id) {
      return new Response("No record", { status: 400 });
    }

    if (body.type === "UPDATE") {
      const customerChanged =
        record.last_customer_change_at &&
        record.last_customer_change_at !== oldRecord?.last_customer_change_at;

      if (customerChanged) event = "changed";
      else if (record.status === oldRecord?.status) {
        return new Response("No customer-facing change", { status: 200 });
      } else if (record.status === "cancelled") event = "cancelled";
      else event = "status";
    }

    orderQuery = orderQuery.eq("id", record.id);
  } else {
    // Public storefront fallback. The random order token is already required
    // to view the private order page. It may only request the initial placed
    // emails and only shortly after the order was created.
    const token = String(body?.token || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return new Response("Unauthorized", { status: 401 });
    }

    orderQuery = orderQuery.eq("token", token);
  }

  const { data: o, error } = await orderQuery.single();
  if (error || !o) {
    return new Response("Order not found", { status: 404 });
  }

  if (!trustedWebhook) {
    const createdAt = Date.parse(o.created_at);
    const ageMs = Date.now() - createdAt;
    const fifteenMinutes = 15 * 60 * 1000;

    if (!Number.isFinite(createdAt) || ageMs < -60_000 || ageMs > fifteenMinutes) {
      return new Response("Confirmation window expired", { status: 410 });
    }

    if (o.status === "cancelled") {
      return new Response("Order is cancelled", { status: 409 });
    }

    record = o;
  }

  const tellCustomer = ["placed", "cancelled", "changed"].includes(event);
  const resend = new Resend(process.env.RESEND_API_KEY);
  const site = process.env.SITE_URL || "https://nectar-fusions.com";

  // The same stable key is produced by the checkout fallback and the
  // Supabase INSERT webhook. Resend therefore accepts both retries but sends
  // each recipient only one copy during its idempotency window.
  const eventVersion =
    event === "placed"
      ? o.created_at
      : event === "changed"
        ? record?.last_customer_change_at || o.last_customer_change_at || o.updated_at
        : record?.updated_at || o.updated_at || record?.status || event;
  const keyBase =
    `order/${safeKeyPart(o.id)}/${safeKeyPart(event)}/${safeKeyPart(eventVersion)}`;

  const jobs = [
    resend.emails.send(
      {
        from: FROM,
        to: OWNER,
        subject: `${event === "cancelled" ? "Cancelled" : event === "changed" ? "Customer changed" : event === "status" ? "Status updated" : "New order"} #${o.order_no} — ${o.name} — ${money(o.total_cents)}`,
        html: ownerEmail(o, site, event),
      },
      { idempotencyKey: `${keyBase}/owner` }
    ),
  ];

  if (tellCustomer && o.email) {
    jobs.push(
      resend.emails.send(
        {
          from: FROM,
          to: o.email,
          subject:
            event === "cancelled"
              ? `Your NectarFusions order #${o.order_no} is cancelled`
              : event === "changed"
                ? `NectarFusions order #${o.order_no} — updated`
                : `NectarFusions order #${o.order_no} — confirmed`,
          html: customerEmail(o, site),
        },
        { idempotencyKey: `${keyBase}/customer` }
      )
    );
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter(
    (result) => result.status === "rejected" || result.value?.error
  );

  if (failed.length) {
    console.error("Email failures:", JSON.stringify(failed));
    // A 500 lets the trusted webhook retry. The storefront deliberately
    // ignores this independent email error because the order is already saved.
    return new Response("Some emails failed", { status: 500 });
  }

  return new Response("Sent", { status: 200 });
};
