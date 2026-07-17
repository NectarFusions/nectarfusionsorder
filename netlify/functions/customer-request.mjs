/* ============================================================
   CUSTOMER REQUEST — /.netlify/functions/customer-request

   Receives Order Help forms, saves them in Supabase, then sends:
   1. An alert to info@nectar-fusions.com
   2. A confirmation to the customer

   Required Netlify environment variables:
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
     RESEND_API_KEY
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";

const G = {
  gold: "#F7C41C",
  amber: "#E69B00",
  dark: "#4A3313",
  brown: "#7B5821",
  cream: "#F5EFE7",
};

const REQUEST_LABELS = {
  skip_next_box: "Skip my next box",
  continue_with_cancellation: "Continue with cancellation",
  special_request: "Special request",
  other: "Other",
};

const ACCOUNT_LABELS = {
  subscription: "Honey Club membership",
  order: "Order",
  general: "General question",
};

const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character]
  );

const clean = (value, maxLength) =>
  String(value ?? "").trim().slice(0, maxLength);

function customerEmail(request) {
  return `
<div style="background:${G.cream};padding:26px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E7DCC9">
    <div style="padding:26px 24px 20px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${G.amber}">
        Request received
      </div>
      <div style="font-size:32px;font-weight:700;color:${G.dark};margin-top:7px">
        We&rsquo;ve got it
      </div>
    </div>

    <div style="padding:22px 24px">
      <p style="font-size:15px;line-height:1.7;color:#111;margin:0">
        Hi ${esc(request.name)}, your NectarFusions request has been received.
        We&rsquo;ll review it and contact you using the information you provided.
      </p>

      <div style="margin-top:18px;padding:14px;background:#FBF7F1;border-radius:6px;color:${G.dark};line-height:1.65">
        <strong>${esc(REQUEST_LABELS[request.request_kind])}</strong><br>
        ${esc(ACCOUNT_LABELS[request.account_kind])}
        ${request.order_or_subscription_no
          ? ` · #${esc(request.order_or_subscription_no.replace(/^#/, ""))}`
          : ""}
        ${request.details
          ? `<div style="margin-top:9px;white-space:pre-wrap">${esc(request.details)}</div>`
          : ""}
      </div>

      <p style="font-size:13.5px;line-height:1.65;color:${G.brown};margin:18px 0 0">
        This confirmation does not mean an order or subscription has already been changed.
        NectarFusions will review and complete the request.
      </p>
    </div>

    <div style="padding:16px 24px;border-top:1px solid #E7DCC9;text-align:center;font-size:12.5px;color:${G.brown};line-height:1.7">
      <strong style="color:${G.dark}">NectarFusions</strong> · Coleman, Michigan<br>
      ${OWNER} · (989) 941-6385
    </div>
  </div>
</div>`;
}

function ownerEmail(request) {
  return `
<div style="background:${G.cream};padding:22px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;border:2px solid ${G.amber};overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;color:${G.amber}">
        NEW ORDER HELP REQUEST
      </div>
      <div style="font-size:30px;font-weight:700;color:${G.dark};margin-top:5px">
        ${esc(REQUEST_LABELS[request.request_kind])}
      </div>
      <div style="font-size:15px;font-weight:600;color:#111;margin-top:5px">
        ${esc(request.name)}
      </div>
    </div>

    <div style="padding:18px 22px">
      <div style="font-size:14px;color:${G.dark};line-height:1.75">
        <strong>Email:</strong> ${esc(request.email)}<br>
        ${request.phone ? `<strong>Phone:</strong> ${esc(request.phone)}<br>` : ""}
        <strong>About:</strong> ${esc(ACCOUNT_LABELS[request.account_kind])}
        ${request.order_or_subscription_no
          ? ` · #${esc(request.order_or_subscription_no.replace(/^#/, ""))}`
          : ""}
      </div>

      ${request.details
        ? `<div style="margin-top:14px;padding:12px;background:#FBF7F1;border-radius:6px;
          font-size:13.5px;color:${G.dark};line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere">
          <strong>Customer explanation:</strong><br>${esc(request.details)}
        </div>`
        : ""}

      <div style="margin-top:16px;padding:12px;background:#FFF9ED;border-radius:6px;
        font-size:13px;color:${G.brown};line-height:1.55">
        Open the NectarFusions Admin area and select <strong>Order Help</strong> to manage this request.
      </div>
    </div>
  </div>
</div>`;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  /*
    Spam protection:
    - "website" is a hidden honeypot field real customers never see.
    - formStartedAt prevents instant automated submissions.
    Return success for bots so they do not learn which check caught them.
  */
  const honeypot = clean(body.website, 300);
  const formStartedAt = Number(body.formStartedAt);
  const elapsedMs = Number.isFinite(formStartedAt) ? Date.now() - formStartedAt : 0;

  if (honeypot || elapsedMs < 3000) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const request = {
    request_kind: clean(body.requestKind, 60),
    account_kind: clean(body.accountKind, 30),
    order_or_subscription_no: clean(body.accountNumber, 80) || null,
    name: clean(body.name, 160),
    email: clean(body.email, 254).toLowerCase(),
    phone: clean(body.phone, 60) || null,
    details: clean(body.details, 5000) || null,
  };

  if (!REQUEST_LABELS[request.request_kind]) {
    return new Response(JSON.stringify({ error: "Choose a valid request type." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!ACCOUNT_LABELS[request.account_kind]) {
    return new Response(JSON.stringify({ error: "Choose what this request is about." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!request.name || !request.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) {
    return new Response(JSON.stringify({ error: "Enter a valid name and email address." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    ["special_request", "other"].includes(request.request_kind) &&
    !request.details
  ) {
    return new Response(JSON.stringify({ error: "Please explain what you need." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: saved, error: insertError } = await supabase
    .from("customer_requests")
    .insert({
      ...request,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Customer request insert failed:", insertError.message);
    return new Response(JSON.stringify({ error: "Your request could not be saved." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const jobs = [
    resend.emails.send({
      from: FROM,
      to: OWNER,
      replyTo: request.email,
      subject: `Order Help — ${REQUEST_LABELS[request.request_kind]} — ${request.name}`,
      html: ownerEmail(request),
    }),
    resend.emails.send({
      from: FROM,
      to: request.email,
      replyTo: OWNER,
      subject: "We received your NectarFusions request",
      html: customerEmail(request),
    }),
  ];

  const results = await Promise.allSettled(jobs);
  const failed = results.filter(
    (result) => result.status === "rejected" || result.value?.error
  );

  if (failed.length) {
    console.error("Customer request email failures:", JSON.stringify(failed));
    return new Response(
      JSON.stringify({
        ok: true,
        id: saved.id,
        emailWarning: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ ok: true, id: saved.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
