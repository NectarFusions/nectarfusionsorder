/* ============================================================
   PARTNER FOODSERVICE, BULK + GIFT SET REQUEST SUBMISSION
   /.netlify/functions/partner-bulk-order-submit

   Uses the authenticated Partner session and isolated partner-order RPCs.
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

const cleanGiftSets = (value) =>
  Array.isArray(value)
    ? value.slice(0, 20).map((gift) => ({
        type: cleanOptional(gift?.type, 160),
        quantity: Number(gift?.quantity),
        flavor_ids: Array.isArray(gift?.flavor_ids)
          ? gift.flavor_ids
              .map((id) => String(id || "").trim())
              .filter(Boolean)
              .slice(0, 20)
          : [],
      }))
    : [];

const cleanLabelExamples = (value) =>
  Array.isArray(value)
    ? value.slice(0, 5).map((example) => ({
        storage_path: cleanOptional(example?.storage_path, 500),
        file_name: cleanOptional(example?.file_name, 200),
        mime_type: cleanOptional(example?.mime_type, 120),
        size_bytes: Number(example?.size_bytes),
      }))
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

const giftSetHtml = (giftSets) => {
  if (!Array.isArray(giftSets) || giftSets.length === 0) return "";

  const rows = giftSets
    .map(
      (gift) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9">
            <strong>${esc(gift.type || "Small gift set")}</strong><br>
            <span style="font-size:12px;color:#7B5821">${esc(
              Array.isArray(gift.flavor_names)
                ? gift.flavor_names.join(", ")
                : "Flavors pending"
            )}</span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:center">${esc(
            gift.quantity
          )}</td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:right">Admin will provide pricing</td>
        </tr>`
    )
    .join("");

  return `
    <div style="margin-top:18px">
      <div style="font-weight:800;margin-bottom:7px;color:#5E437A">Small gift set request</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#F8F2FC">
            <th style="padding:9px;text-align:left">Gift set / flavors</th>
            <th style="padding:9px;text-align:center">Sets</th>
            <th style="padding:9px;text-align:right">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
};

const customLabelHtml = (request) => {
  if (!request.custom_labels_requested) return "";

  const examples = Array.isArray(request.label_examples)
    ? request.label_examples
    : [];
  const files = examples
    .map((example) => esc(example.file_name || "Uploaded example"))
    .join(", " );

  return `
    <div style="margin-top:14px;padding:12px;border-radius:9px;background:#F8F2FC;color:#5E437A;line-height:1.6">
      <strong>Custom labels requested</strong>
      ${request.custom_label_notes ? `<br>${esc(request.custom_label_notes)}` : ""}
      ${examples.length ? `<br><strong>Private examples:</strong> ${files}. View these from Admin.` : ""}
    </div>`;
};

const fulfillmentHtml = (request) => {
  if (request.fulfillment_method === "pickup") {
    return `
      <div style="margin-top:14px;padding:12px;border-radius:9px;background:#F1F8EE;color:#31532B;line-height:1.6">
        <strong>Market pickup:</strong> ${esc(
          request.pickup_market_name || "Selected market"
        )} · ${esc(readableDate(request.pickup_market_day))}
        ${
          request.pickup_market_where_at
            ? `<br>${esc(request.pickup_market_where_at)}`
            : ""
        }
        ${
          request.pickup_market_hours
            ? `<br>${esc(request.pickup_market_hours)}`
            : ""
        }
        <br><strong>Payment:</strong> Pay at the NectarFusions market table at pickup.
      </div>`;
  }

  if (request.fulfillment_method === "delivery") {
    return `
      <div style="margin-top:14px;padding:12px;border-radius:9px;background:#FFF5E6;color:#704315;line-height:1.6">
        <strong>Delivery:</strong> Delivery fees are not included in the product subtotal and are charged separately at drop-off.
      </div>`;
  }

  if (request.fulfillment_method === "shipping") {
    return `
      <div style="margin-top:14px;padding:12px;border-radius:9px;background:#EFF8FD;color:#174F70;line-height:1.6">
        <strong>Shipping:</strong> Shipping is not included in the product subtotal and will be confirmed in the quote.
      </div>`;
  }

  return "";
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

  const bulkTable = items.length
    ? `
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#FBF7F1">
            <th style="padding:9px;text-align:left">Bulk product</th>
            <th style="padding:9px;text-align:center">Containers</th>
            <th style="padding:9px;text-align:right">Line total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
    : `<div style="padding:12px;border-radius:9px;background:#FBF7F1;color:#6F6258">No bulk containers requested.</div>`;

  return `
<div style="background:#F5EFE7;padding:22px 14px;font-family:Helvetica,Arial,sans-serif;color:#3E2B17">
  <div style="max-width:620px;margin:0 auto;background:#fff;border:2px solid #E69B00;border-radius:12px;overflow:hidden">
    <div style="padding:21px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:#E69B00">NEW PARTNER FOODSERVICE REQUEST</div>
      <div style="font-size:30px;font-weight:800;margin-top:5px">${esc(
        account.public_name || account.business_name || "NectarFusions Partner"
      )}</div>
      <div style="margin-top:7px;color:#526B7B">Bulk product subtotal · ${esc(
        money(request.requested_subtotal_cents)
      )}</div>
    </div>

    <div style="padding:18px 22px">
      ${bulkTable}
      ${giftSetHtml(request.gift_sets)}

      <div style="margin-top:17px;padding:13px;border-radius:9px;background:#F6FAFC;line-height:1.65">
        <strong>Needed by:</strong> ${esc(readableDate(request.needed_by))}<br>
        <strong>Fulfillment:</strong> ${esc(label(request.fulfillment_method))}<br>
        <strong>Request ID:</strong> ${esc(request.id)}
      </div>

      ${fulfillmentHtml(request)}
      ${customLabelHtml(request)}

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
  if (Number.isFinite(contentLength) && contentLength > 150_000) {
    return json(413, { error: "The partner request is too large." });
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
    console.error("Partner ordering environment is incomplete.");
    return json(500, { error: "The partner ordering service is not configured." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid partner request data." });
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
    p_pickup_market_date_id: cleanOptional(body.pickupMarketDateId, 80),
    p_gift_sets: cleanGiftSets(body.giftSets),
    p_custom_labels_requested: body.customLabelsRequested === true,
    p_custom_label_notes: cleanOptional(body.customLabelNotes, 3000),
    p_label_examples: cleanLabelExamples(body.labelExamples),
  };

  const { data: submitted, error: submissionError } = await userClient.rpc(
    "submit_partner_bulk_order_v2",
    payload
  );

  if (submissionError) {
    return json(400, {
      error:
        submissionError.message ||
        "The partner request could not be submitted.",
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
        "requested_subtotal_cents,submitted_at,gift_sets," +
        "custom_labels_requested,custom_label_notes,label_examples," +
        "pickup_market_name,pickup_market_day,pickup_market_where_at,pickup_market_hours," +
        "items:partner_bulk_order_items(" +
        "id,honey_type,flavor_name,size_label,quantity,unit_price_cents,line_total_cents" +
        ")"
    )
    .eq("id", requestId)
    .single();

  if (requestError || !request) {
    console.error(
      "Partner request confirmation read failed:",
      requestError?.message
    );
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  const { data: account, error: accountError } = await userClient
    .from("partner_accounts")
    .select("id,business_name,public_name,contact_name,email")
    .eq("id", request.partner_id)
    .single();

  if (accountError || !account) {
    console.error("Partner account read failed:", accountError?.message);
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) {
    console.error("Partner owner email skipped: RESEND_API_KEY is missing.");
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  try {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: FROM,
      to: OWNER,
      replyTo: account.email || undefined,
      subject:
        `Partner Foodservice Request — ${
          account.public_name || account.business_name
        } — ` + money(request.requested_subtotal_cents),
      html: ownerEmail({ account, request }),
    });

    if (result?.error) {
      throw new Error(result.error.message || "Unknown Resend error");
    }
  } catch (emailError) {
    console.error("Partner owner email failed:", emailError.message);
    return json(200, { ok: true, requestId, emailWarning: true });
  }

  return json(200, { ok: true, requestId, emailWarning: false });
};
