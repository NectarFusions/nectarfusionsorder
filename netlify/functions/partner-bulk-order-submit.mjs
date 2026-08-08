/* ============================================================
   PARTNER FOODservice & BULK ORDER SUBMISSION
   /.netlify/functions/partner-bulk-order-submit

   Uses the authenticated Partner session and the isolated bulk-order RPC.
   It does not create Square payment links or touch retail pricing.
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[
        character
      ]
  );

const cleanOptional = (value, maxLength) => {
  const cleaned = String(value ?? "").trim().slice(0, maxLength);
  return cleaned || null;
};

const cleanDays = (value) =>
  Array.isArray(value)
    ? value
        .map((day) => String(day || "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 7)
    : [];

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const label = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const readableDate = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const ownerEmail = ({ account, request }) => {
  const items = Array.isArray(request.items) ? request.items : [];
  const rows = items
    .map((item) => {
      const product =
        item.honey_type === "natural"
          ? "Natural Honey"
          : `${item.flavor_name || "Infused"} Infused Honey`;
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9">
            <strong>${esc(product)}</strong><br>
            <span style="font-size:12px;color:#7B5821">${esc(
              item.size_label
            )}</span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:center">${esc(
            item.quantity
          )}</td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:right">${esc(
            money(item.line_total_cents)
          )}</td>
        </tr>`;
    })
    .join("");

  return `
<div style="background:#F5EFE7;padding:22px 14px;font-family:Helvetica,Arial,sans-serif;color:#3E2B17">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:2px solid #E69B00;border-radius:12px;overflow:hidden">
    <div style="padding:21px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#E69B00">NEW PARTNER BULK ORDER REQUEST</div>
      <div style="font-size:30px;font-weight:800;margin-top:5px">${esc(
        account.public_name || account.business_name || "NectarFusions Partner"
      )}</div>
      <div style="margin-top:7px;color:#526B7B">Foodservice & Bulk Honey · ${esc(
        money(request.requested_subtotal_cents)
      )} requested subtotal</div>
    </div>
    <div style="padding:18px 22px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#FBF7F1">
            <th style="padding:9px;text-align:left">Product</th>
            <th style="padding:9px;text-align:center">Containers</th>
            <th style="padding:9px;text-align:right">Line total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:17px;padding:13px;border-radius:9px;background:#F6FAFC;line-height:1.65">
        <strong>Needed by:</strong> ${esc(readableDate(request.needed_by))}<br>
        <strong>Fulfillment:</strong> ${esc(label(request.fulfillment_method))}<br>
        <strong>Request ID:</strong> ${esc(request.id)}
      </div>
      ${
        request.request_notes
          ? `<div style="margin-top:14px"><strong>Partner notes:</strong><br>${esc(
              request.request_notes
            )}</div>`
          : ""
      }
    </div>
  </div>
</div>`;
};

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 120_000) {
    return json(413, { error: "The bulk order request is too large." });
  }

  const authorization = String(req.headers.get("authorization") || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Partner authentication is required." });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
  ).trim();

  if (!supabaseUrl || !anonKey) {
    console.error("Partner bulk ordering environment is incomplete.");
    return json(500, { error: "The bulk ordering service is not configured." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid bulk order request data." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json(401, { error: "Partner authentication expired." });
  }

  const payload = {
    p_needed_by: cleanOptional(body.neededBy, 10),
    p_fulfillment_method:
      cleanOptional(body.fulfillmentMethod, 30) || "flexible",
    p_preferred_delivery_days: cleanDays(body.preferredDeliveryDays),
    p_request_notes: cleanOptional(body.requestNotes, 5000),
    p_items: Array.isArray(body.items) ? body.items.slice(0, 50) : [],
  };

  const { data: submitted, error: submissionError } = await userClient.rpc(
    "submit_partner_bulk_order",
    payload
  );

  if (submissionError) {
    return json(400, {
      error: submissionError.message || "The bulk order request could not be submitted.",
    });
  }

  const requestId = Array.isArray(submitted) ? submitted[0] : submitted;
  if (!requestId) {
    return json(500, {
      error:
        "The request may have been saved, but its confirmation could not be loaded. Contact NectarFusions before submitting again.",
    });
  }

  const { data: request, error: requestError } = await userClient
    .from("partner_bulk_order_requests")
    .select(
      "id,partner_id,status,needed_by,fulfillment_method,request_notes," +
        "requested_subtotal_cents,submitted_at," +
        "items:partner_bulk_order_items(" +
        "id,honey_type,flavor_name,size_label,quantity,unit_price_cents,line_total_cents" +
        ")"
    )
    .eq("id", requestId)
    .single();

  if (requestError || !request) {
    console.error("Partner bulk confirmation read failed:", requestError?.message);
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  const { data: account, error: accountError } = await userClient
    .from("partner_accounts")
    .select("id,business_name,public_name,contact_name,email")
    .eq("id", request.partner_id)
    .single();

  if (accountError || !account) {
    console.error("Partner bulk account read failed:", accountError?.message);
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) {
    console.error("Partner bulk owner email skipped: RESEND_API_KEY is missing.");
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  try {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: FROM,
      to: OWNER,
      replyTo: account.email || undefined,
      subject:
        `Partner Bulk Order — ${account.public_name || account.business_name} — ` +
        money(request.requested_subtotal_cents),
      html: ownerEmail({ account, request }),
    });

    if (result?.error) throw new Error(result.error.message || "Unknown Resend error");
  } catch (emailError) {
    console.error("Partner bulk owner email failed:", emailError.message);
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  return json(200, { ok: true, requestId, emailWarning: false });
};
