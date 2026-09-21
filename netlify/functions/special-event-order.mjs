import { Resend } from "resend";
import { square, db, site, ok, bad } from "./_square.mjs";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";
const LABEL_BUCKET = "partner-label-examples";
const CHECKOUT_RATE = 0.033;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const EVENT_TYPES = new Set([
  "Wedding",
  "Bridal / Baby Shower",
  "Corporate / Client Gifts",
  "Party / Celebration",
  "Fundraiser / Community Event",
  "Other",
]);

const LID_COLORS = new Set([
  "Red", "Orange", "Golden Yellow", "Yellow", "Lime Green", "Green",
  "Light Blue", "Blue", "Purple", "Pink", "Brown", "Black", "White", "Cream",
]);

const UPLOAD_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
]);

const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[ch]
  );

const clean = (value, max = 500) =>
  String(value ?? "").trim().slice(0, max);

const qty = (value) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
};

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const unitPrice = (kind, quantity) => {
  if (kind === "bear") return quantity >= 50 ? 300 : 400;
  if (kind === "hex") return quantity >= 50 ? 325 : 475;
  return 0;
};

const parseDate = (value) => {
  const text = clean(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const daysUntil = (date) => {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12)
  );
  return Math.floor((date.getTime() - today.getTime()) / 86400000);
};

const safeName = (name) =>
  clean(name || "design-idea", 120)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "design-idea";

const buildSummary = (x) =>
  [
    `Event type: ${x.eventType}`,
    `Need by: ${x.needBy}`,
    x.location ? `Event city / venue: ${x.location}` : "",
    `Target budget: ${money(x.budgetCents)}`,
    "",
    "ORDER",
    x.bearQty
      ? `2 oz Plastic Bears: ${x.bearQty} × ${money(x.bearUnitCents)} = ${money(x.bearQty * x.bearUnitCents)}`
      : "",
    x.bearQty ? `Bear lid color: ${x.lidColor}` : "",
    x.hexQty
      ? `2 oz Glass Hexagons: ${x.hexQty} × ${money(x.hexUnitCents)} = ${money(x.hexQty * x.hexUnitCents)}`
      : "",
    x.dipperQty
      ? `Small wood honey dippers: ${x.dipperQty} × $1.00 = ${money(x.dipperQty * 100)}`
      : "Small wood honey dippers: None",
    x.topCircle ? "Top circle custom design: +$10.00 flat" : "",
    x.frontLabel ? "Front label custom design: +$15.00 flat" : "",
    x.customLabels ? `Custom label wording: ${x.labelText}` : "",
    x.customLabels ? `Custom label color: ${x.labelColor}` : "",
    x.designPath ? `Private design upload: ${x.designPath}` : "",
    "",
    `Product + design subtotal: ${money(x.subtotalCents)}`,
    `Square checkout adjustment (3.3%): ${money(x.checkoutCents)}`,
    `Estimated / checkout total: ${money(x.totalCents)}`,
    "",
    x.mode === "budget_request"
      ? "Customer chose not to exceed budget and requested help adjusting the order."
      : "Customer continued to Square checkout.",
    x.details ? `Additional notes: ${x.details}` : "",
  ].filter(Boolean).join("\n");

const ownerEmail = (x) => `
<div style="background:#F5EFE7;padding:24px 14px;font-family:Arial,sans-serif;color:#4A3313">
  <div style="max-width:620px;margin:auto;background:#fff;border:2px solid #E69B00;border-radius:12px;overflow:hidden">
    <div style="padding:22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#E69B00">
        ${x.mode === "budget_request" ? "SPECIAL EVENT BUDGET HELP REQUEST" : "SPECIAL EVENT ORDER"}
      </div>
      <div style="font-size:30px;font-weight:800;margin-top:6px">${esc(x.name)}</div>
      <div style="margin-top:7px;color:#7B5821">${esc(x.eventType)} · Needed ${esc(x.needBy)}</div>
    </div>
    <div style="padding:20px 22px">
      <div style="line-height:1.7">
        <strong>Email:</strong> ${esc(x.email)}<br>
        ${x.phone ? `<strong>Phone:</strong> ${esc(x.phone)}<br>` : ""}
        <strong>Budget:</strong> ${esc(money(x.budgetCents))}<br>
        <strong>Current total:</strong> ${esc(money(x.totalCents))}<br>
        <strong>Budget status:</strong>
        ${x.overBudget
          ? '<span style="color:#9B2C2C;font-weight:800">OVER BUDGET</span>'
          : '<span style="color:#2F6B3E;font-weight:800">Within budget</span>'}
      </div>
      <div style="margin-top:16px;padding:14px;background:#FBF7F1;border-radius:9px;white-space:pre-wrap;line-height:1.65">${esc(x.summary)}</div>
      ${x.designUrl
        ? `<div style="margin-top:14px">
             <a href="${esc(x.designUrl)}" style="display:inline-block;padding:11px 14px;background:#5E437A;color:#fff;text-decoration:none;border-radius:8px;font-weight:800">Open private design upload</a>
             <div style="font-size:12px;color:#7B5821;margin-top:6px">Link expires in 7 days.</div>
           </div>`
        : ""}
    </div>
  </div>
</div>`;

const customerEmail = (x) => `
<div style="background:#F5EFE7;padding:24px 14px;font-family:Arial,sans-serif;color:#4A3313">
  <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #E7DCC9;border-radius:12px;overflow:hidden">
    <div style="padding:24px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:#E69B00">SPECIAL EVENT REQUEST RECEIVED</div>
      <div style="font-size:30px;font-weight:800;margin-top:6px">We&rsquo;ve got your details</div>
    </div>
    <div style="padding:20px 24px;line-height:1.7">
      <p style="margin-top:0">Hi ${esc(x.name)}, your NectarFusions special event request has been submitted.</p>
      ${x.mode === "budget_request"
        ? `<p>You chose not to go over your ${esc(money(x.budgetCents))} target budget. We&rsquo;ll review the request and contact you to see what we can adjust for your budget and timeline.</p>`
        : `<p>Your current order total is ${esc(money(x.totalCents))}. Complete payment through the secure Square checkout to continue.</p>`}
      <p><strong>Need by:</strong> ${esc(x.needBy)}</p>
      ${x.customLabels
        ? "<p><strong>Custom labels:</strong> A designer will reach out directly and you&rsquo;ll receive a visual proof before the labels are finalized.</p>"
        : ""}
      <p style="margin-bottom:0">We&rsquo;ll contact you using the information you provided.</p>
    </div>
  </div>
</div>`;

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  let formData;
  try {
    formData = await req.formData();
  } catch {
    return bad("The special event form could not be read.");
  }

  let body;
  try {
    body = JSON.parse(String(formData.get("payload") || "{}"));
  } catch {
    return bad("The special event form is invalid.");
  }

  const mode = body.mode === "budget_request" ? "budget_request" : "checkout";
  const eventType = clean(body.eventType, 80);
  const name = clean(body.name, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 60);
  const needBy = clean(body.needBy, 20);
  const location = clean(body.location, 250);
  const details = clean(body.details, 1800);
  const lidColor = clean(body.lidColor, 80);
  const labelText = clean(body.labelText, 500);
  const labelColor = clean(body.labelColor, 160);
  const website = clean(body.website, 300);
  const startedAt = Number(body.formStartedAt);

  const bearQty = qty(body.bearQty);
  const hexQty = qty(body.hexQty);
  const dipperQty = qty(body.dipperQty);

  const budgetDollars = Number(body.budget);
  const budgetCents =
    Number.isFinite(budgetDollars) && budgetDollars > 0
      ? Math.round(budgetDollars * 100)
      : 0;

  const topCircle = body.topCircle === true;
  const frontLabel = body.frontLabel === true;
  const customLabels = topCircle || frontLabel;
  const overBudgetApproved = body.overBudgetApproved === true;

  const elapsed =
    Number.isFinite(startedAt) ? Date.now() - startedAt : 0;

  if (website || elapsed < 2500) {
    return ok({ submitted: true, mode });
  }

  if (!EVENT_TYPES.has(eventType)) return bad("Choose a valid event type.");
  if (!name) return bad("Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad("Enter a valid email address.");
  }

  const requestedDate = parseDate(needBy);
  if (!requestedDate) return bad("Choose the date you need the order by.");

  const leadDays = daysUntil(requestedDate);
  if (leadDays < 0) return bad("The need-by date cannot be in the past.");

  if (bearQty === null || hexQty === null || dipperQty === null) {
    return bad("Enter valid product quantities.");
  }

  if (bearQty + hexQty < 1) {
    return bad("Add at least one 2 oz bear or glass hexagon.");
  }

  if (bearQty > 0 && !LID_COLORS.has(lidColor)) {
    return bad("Choose a lid color for the 2 oz bears.");
  }

  if (!budgetCents) return bad("Enter your target budget.");

  if (customLabels) {
    if (leadDays < 7) {
      return bad(
        "Custom label orders must be placed at least 7 days in advance for design and print time."
      );
    }
    if (!labelText) return bad("Enter what you want the custom label to say.");
    if (!labelColor) return bad("Enter the color you want for the custom label.");
  }

  const designFile = formData.get("designFile");
  const hasFile =
    designFile &&
    typeof designFile === "object" &&
    typeof designFile.arrayBuffer === "function" &&
    Number(designFile.size || 0) > 0;

  if (hasFile && !customLabels) {
    return bad("Choose a custom label option before uploading a design idea.");
  }

  if (hasFile) {
    const type = String(designFile.type || "").toLowerCase();
    if (!UPLOAD_TYPES.has(type)) {
      return bad("Design uploads must be JPG, PNG, WebP, or PDF files.");
    }
    if (Number(designFile.size || 0) > MAX_UPLOAD_BYTES) {
      return bad("Design uploads must be 4 MB or smaller.");
    }
  }

  const bearUnitCents = unitPrice("bear", bearQty);
  const hexUnitCents = unitPrice("hex", hexQty);
  const subtotalCents =
    bearQty * bearUnitCents +
    hexQty * hexUnitCents +
    dipperQty * 100 +
    (topCircle ? 1000 : 0) +
    (frontLabel ? 1500 : 0);

  const checkoutCents = Math.round(subtotalCents * CHECKOUT_RATE);
  const totalCents = subtotalCents + checkoutCents;
  const overBudget = totalCents > budgetCents;

  if (mode === "checkout" && overBudget && !overBudgetApproved) {
    return new Response(
      JSON.stringify({
        error: "This order is above the target budget.",
        requiresBudgetApproval: true,
        subtotalCents,
        checkoutCents,
        totalCents,
        budgetCents,
      }),
      {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const supa = db();
  const uploadId = crypto.randomUUID();
  let designPath = "";
  let designUrl = "";

  if (hasFile) {
    designPath = `special-events/${uploadId}/${safeName(designFile.name)}`;
    const bytes = Buffer.from(await designFile.arrayBuffer());

    const { error: uploadError } = await supa.storage
      .from(LABEL_BUCKET)
      .upload(designPath, bytes, {
        upsert: false,
        contentType: String(designFile.type || "application/octet-stream"),
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("Special event design upload failed:", uploadError.message);
      return bad("Your design idea could not be uploaded. Please try again.", 500);
    }

    const { data: signed } = await supa.storage
      .from(LABEL_BUCKET)
      .createSignedUrl(designPath, 7 * 24 * 60 * 60);

    designUrl = signed?.signedUrl || "";
  }

  const summary = buildSummary({
    eventType, needBy, location, details, budgetCents,
    bearQty, lidColor, bearUnitCents, hexQty, hexUnitCents,
    dipperQty, topCircle, frontLabel, customLabels, labelText,
    labelColor, designPath, subtotalCents, checkoutCents, totalCents, mode,
  });

  const { data: saved, error: insertError } = await supa
    .from("customer_requests")
    .insert({
      request_kind: "special_request",
      account_kind: "general",
      order_or_subscription_no: null,
      name,
      email,
      phone: phone || null,
      details: summary.slice(0, 5000),
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !saved) {
    if (designPath) {
      await supa.storage.from(LABEL_BUCKET).remove([designPath]);
    }
    console.error(
      "Special event request insert failed:",
      insertError?.message || "No saved row"
    );
    return bad("Your special event request could not be saved.", 500);
  }

  let paymentLink = null;

  if (mode === "checkout") {
    const lineItems = [];

    if (bearQty > 0) {
      lineItems.push({
        name: `2 oz Plastic Bear — ${lidColor} lid`,
        quantity: String(bearQty),
        base_price_money: { amount: bearUnitCents, currency: "USD" },
      });
    }

    if (hexQty > 0) {
      lineItems.push({
        name: "2 oz Glass Hexagon",
        quantity: String(hexQty),
        base_price_money: { amount: hexUnitCents, currency: "USD" },
      });
    }

    if (dipperQty > 0) {
      lineItems.push({
        name: "Small Wood Honey Dipper",
        quantity: String(dipperQty),
        base_price_money: { amount: 100, currency: "USD" },
      });
    }

    if (topCircle) {
      lineItems.push({
        name: "Custom Top Circle Label Design",
        quantity: "1",
        base_price_money: { amount: 1000, currency: "USD" },
      });
    }

    if (frontLabel) {
      lineItems.push({
        name: "Custom Front Label Design",
        quantity: "1",
        base_price_money: { amount: 1500, currency: "USD" },
      });
    }

    try {
      const squareResult = await square("/v2/online-checkout/payment-links", {
        body: {
          idempotency_key: `special-event-${saved.id}`,
          order: {
            location_id: process.env.SQUARE_LOCATION_ID,
            reference_id: `SE-${String(saved.id).slice(0, 18)}`,
            line_items: lineItems,
            taxes: [
              {
                uid: "special-event-checkout-rate",
                name: "Square Checkout Adjustment",
                type: "ADDITIVE",
                percentage: "3.3",
                scope: "ORDER",
              },
            ],
          },
          checkout_options: {
            redirect_url: `${site()}/?special-event=submitted`,
            ask_for_shipping_address: false,
            merchant_support_email: OWNER,
          },
          pre_populated_data: { buyer_email: email },
          payment_note: `NectarFusions special event request ${saved.id}`,
          description: `NectarFusions special event order for ${name}`,
        },
      });

      paymentLink = squareResult?.payment_link || null;

      if (!paymentLink?.url) {
        throw new Error("Square did not return a payment link.");
      }

      await supa
        .from("customer_requests")
        .update({
          details: [
            summary,
            "",
            `Square payment link ID: ${paymentLink.id || "Unavailable"}`,
            `Square order ID: ${paymentLink.order_id || "Unavailable"}`,
          ].join("\n").slice(0, 5000),
        })
        .eq("id", saved.id);
    } catch (error) {
      console.error("Special event Square checkout failed:", error.message);
      return bad(
        "Your request was saved, but Square checkout could not be created. NectarFusions has your request and can follow up with you.",
        502
      );
    }
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const ownerHtml = ownerEmail({
    mode, name, email, phone, eventType, needBy, budgetCents,
    totalCents, overBudget, summary, designUrl,
  });
  const customerHtml = customerEmail({
    mode, name, needBy, budgetCents, totalCents, customLabels,
  });

  const results = await Promise.allSettled([
    resend.emails.send({
      from: FROM,
      to: OWNER,
      replyTo: email,
      subject:
        mode === "budget_request"
          ? `Special Event Budget Help — ${name}`
          : `Special Event Order — ${name}`,
      html: ownerHtml,
    }),
    resend.emails.send({
      from: FROM,
      to: email,
      replyTo: OWNER,
      subject:
        mode === "budget_request"
          ? "We received your NectarFusions event request"
          : "Your NectarFusions special event order",
      html: customerHtml,
    }),
  ]);

  const emailWarning = results.some(
    (result) => result.status === "rejected" || result.value?.error
  );

  if (emailWarning) {
    console.error("Special event email warning:", JSON.stringify(results));
  }

  return ok({
    submitted: true,
    mode,
    requestId: saved.id,
    paymentUrl: paymentLink?.url || null,
    subtotalCents,
    checkoutCents,
    totalCents,
    budgetCents,
    emailWarning,
  });
};
