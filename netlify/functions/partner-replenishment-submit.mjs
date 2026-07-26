/* ============================================================
   PARTNER REPLENISHMENT SUBMISSION
   /.netlify/functions/partner-replenishment-submit

   Authenticates the existing Supabase Partner session, calls the
   guarded atomic submission RPC as that Partner, then emails an
   immediate owner alert only after the database request succeeds.

   Required Netlify environment variables:
     SUPABASE_URL
     SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY
     RESEND_API_KEY
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";

const COLORS = {
  gold: "#F7C41C",
  amber: "#E69B00",
  dark: "#4A3313",
  brown: "#7B5821",
  cream: "#F5EFE7",
  blue: "#173C52",
};

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
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
      })[character]
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

const cents = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0) / 100);

const readable = (value) =>
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

  const itemRows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;color:${COLORS.dark}">
            <strong>${esc(item.flavor_name)}</strong><br>
            <span style="font-size:12px;color:${COLORS.brown}">
              ${esc(item.size_id)} · ${esc(readable(item.texture))}
            </span>
          </td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:center;color:${COLORS.dark}">
            ${esc(item.quantity)}
          </td>
          <td style="padding:10px;border-bottom:1px solid #E7DCC9;text-align:right;color:${COLORS.dark}">
            ${esc(cents(item.line_total_cents))}
          </td>
        </tr>`
    )
    .join("");

  const deliveryDays =
    Array.isArray(request.preferred_delivery_days) &&
    request.preferred_delivery_days.length
      ? request.preferred_delivery_days.map(readable).join(", ")
      : "No preferred days provided";

  return `
<div style="background:${COLORS.cream};padding:22px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:10px;border:2px solid ${COLORS.amber};overflow:hidden">
    <div style="padding:20px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;color:${COLORS.amber}">
        NEW PARTNER REPLENISHMENT REQUEST
      </div>
      <div style="font-size:30px;font-weight:700;color:${COLORS.dark};margin-top:5px">
        ${esc(account.public_name || account.business_name || "NectarFusions Partner")}
      </div>
      <div style="font-size:14px;color:#111;margin-top:6px">
        Request ${esc(request.id)}
      </div>
    </div>

    <div style="padding:18px 22px">
      <div style="font-size:14px;color:${COLORS.dark};line-height:1.75">
        <strong>Business:</strong> ${esc(account.business_name)}<br>
        <strong>Contact:</strong> ${esc(account.contact_name || "Not provided")}<br>
        <strong>Email:</strong> ${esc(account.email || "Not provided")}<br>
        <strong>Needed by:</strong> ${esc(readableDate(request.needed_by))}<br>
        <strong>Fulfillment:</strong> ${esc(readable(request.fulfillment_method || "flexible"))}<br>
        <strong>Preferred delivery days:</strong> ${esc(deliveryDays)}
      </div>

      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #E7DCC9">
        <thead>
          <tr style="background:#FBF7F1">
            <th style="padding:10px;text-align:left;color:${COLORS.blue};font-size:12px">Product</th>
            <th style="padding:10px;text-align:center;color:${COLORS.blue};font-size:12px">Jars</th>
            <th style="padding:10px;text-align:right;color:${COLORS.blue};font-size:12px">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div style="margin-top:14px;padding:13px;background:#F1F8FC;border-radius:7px;color:${COLORS.blue};font-size:15px">
        <strong>Requested subtotal: ${esc(cents(request.requested_subtotal_cents))}</strong>
      </div>

      ${
        request.current_inventory_notes
          ? `<div style="margin-top:14px;padding:12px;background:#FBF7F1;border-radius:6px;color:${COLORS.dark};line-height:1.6;white-space:pre-wrap">
              <strong>Current inventory notes:</strong><br>${esc(request.current_inventory_notes)}
            </div>`
          : ""
      }

      ${
        request.request_notes
          ? `<div style="margin-top:12px;padding:12px;background:#FFF9ED;border-radius:6px;color:${COLORS.dark};line-height:1.6;white-space:pre-wrap">
              <strong>Partner request notes:</strong><br>${esc(request.request_notes)}
            </div>`
          : ""
      }

      <div style="margin-top:16px;padding:12px;background:#FFF9ED;border-radius:6px;font-size:13px;color:${COLORS.brown};line-height:1.55">
        Open the NectarFusions Admin Partner area to review, request information, quote, and manage this replenishment request.
      </div>
    </div>
  </div>
</div>`;
};

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "POST only" });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);

  if (Number.isFinite(contentLength) && contentLength > 150_000) {
    return json(413, { error: "The replenishment request is too large." });
  }

  const authorization = String(
    req.headers.get("authorization") || ""
  ).trim();

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Partner authentication is required." });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      ""
  ).trim();

  if (!supabaseUrl || !anonKey) {
    console.error("Partner replenishment environment is incomplete.");
    return json(500, {
      error: "The replenishment service is not configured.",
    });
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid replenishment request data." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } =
    await userClient.auth.getUser();

  if (userError || !userData?.user) {
    return json(401, { error: "Partner authentication expired." });
  }

  const payload = {
    p_needed_by: cleanOptional(body.neededBy, 10),
    p_fulfillment_method:
      cleanOptional(body.fulfillmentMethod, 30) || "flexible",
    p_preferred_delivery_days:
      cleanDays(body.preferredDeliveryDays),
    p_current_inventory_notes:
      cleanOptional(body.currentInventoryNotes, 5000),
    p_request_notes:
      cleanOptional(body.requestNotes, 5000),
    p_items: Array.isArray(body.items)
      ? body.items.slice(0, 100)
      : [],
  };

  const { data: submitted, error: submissionError } =
    await userClient.rpc(
      "submit_partner_replenishment",
      payload
    );

  if (submissionError) {
    return json(400, {
      error:
        submissionError.message ||
        "The replenishment request could not be submitted.",
    });
  }

  const requestId = Array.isArray(submitted)
    ? submitted[0]
    : submitted;

  if (!requestId) {
    console.error(
      "Partner replenishment RPC returned no request ID."
    );
    return json(500, {
      error:
        "The request may have been saved, but its confirmation could not be loaded. Contact NectarFusions before submitting again.",
    });
  }

  const { data: request, error: requestError } =
    await userClient
      .from("partner_replenishment_requests")
      .select(
        "id,partner_id,status,needed_by,fulfillment_method," +
          "preferred_delivery_days,current_inventory_notes," +
          "request_notes,requested_subtotal_cents,submitted_at," +
          "items:partner_replenishment_items(" +
          "id,flavor_name,size_id,texture,quantity," +
          "unit_price_cents,line_total_cents" +
          ")"
      )
      .eq("id", requestId)
      .single();

  if (requestError || !request) {
    console.error(
      "Partner replenishment confirmation read failed:",
      requestError?.message || "empty response"
    );
    return json(200, {
      ok: true,
      requestId,
      emailWarning: true,
    });
  }

  const { data: account, error: accountError } =
    await userClient
      .from("partner_accounts")
      .select(
        "id,business_name,public_name,contact_name,email"
      )
      .eq("id", request.partner_id)
      .single();

  if (accountError || !account) {
    console.error(
      "Partner replenishment account read failed:",
      accountError?.message || "empty response"
    );
    return json(200, {
      ok: true,
      requestId,
      emailWarning: true,
    });
  }

  const resendKey = String(
    process.env.RESEND_API_KEY || ""
  ).trim();

  if (!resendKey) {
    console.error(
      "Partner replenishment notification could not run: RESEND_API_KEY is missing."
    );
    return json(200, {
      ok: true,
      requestId,
      emailWarning: true,
    });
  }

  const resend = new Resend(resendKey);
  const result = await resend.emails.send({
    from: FROM,
    to: OWNER,
    replyTo: account.email || undefined,
    subject:
      `Partner Replenishment — ` +
      `${account.public_name || account.business_name} — ` +
      `${cents(request.requested_subtotal_cents)}`,
    html: ownerEmail({ account, request }),
  });

  if (result?.error) {
    console.error(
      "Partner replenishment owner email failed:",
      result.error.message || "Unknown Resend error"
    );
    return json(200, {
      ok: true,
      requestId,
      emailWarning: true,
    });
  }

  return json(200, {
    ok: true,
    requestId,
    emailWarning: false,
  });
};
