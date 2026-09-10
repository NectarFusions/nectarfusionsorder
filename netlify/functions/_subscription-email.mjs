import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";

const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"]/g,
    (character) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character]
  );

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || null : value || null;

const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const safeKeyPart = (value) =>
  String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9._:-]/g, "-")
    .slice(0, 100);

function cadenceLabel(cadence) {
  return cadence === "1mo" ? "Every month" : "Every 2 months";
}

function methodLabel(method) {
  if (method === "market") return "Market pickup";
  if (method === "ship") return "Shipping";
  return "Local delivery";
}

function customerEmail(subscription, event, siteUrl) {
  const customer = relationRow(subscription.customers) || {};
  const plan = relationRow(subscription.plans) || {};
  const setup = event === "started";
  const actionUrl = setup
    ? subscription.square_checkout_url
    : `${siteUrl}/club/${subscription.token}`;
  const actionLabel = setup
    ? "Complete Secure Square Setup"
    : "View My Honey Club Membership";

  return `
<div style="background:#F5EFE7;padding:26px 14px;font-family:Helvetica,Arial,sans-serif;color:#1B1005">
  <div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #E7DCC9;border-radius:12px;overflow:hidden">
    <div style="padding:26px 24px 20px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#E69B00">
        ${setup ? "Honey Club setup started" : "Honey Club activated"}
      </div>
      <div style="font-size:48px;font-weight:800;margin-top:5px">#${esc(subscription.sub_no)}</div>
      <div style="font-size:16px;color:#7B5821;margin-top:8px">
        ${setup
          ? "Your membership request is saved. Complete the secure Square step to activate it."
          : `Welcome${customer.name ? `, ${esc(customer.name)}` : ""}! Your membership is active.`}
      </div>
    </div>

    <div style="padding:22px 24px">
      <div style="font-size:18px;font-weight:800">${esc(plan.name || subscription.plan_id || "Honey Club")}</div>
      <div style="margin-top:8px;color:#526B7B;line-height:1.7">
        ${cadenceLabel(subscription.cadence)} · ${methodLabel(subscription.method)}<br>
        ${money(plan.price_cents)} per box
      </div>

      <div style="margin-top:20px;padding:14px;border-radius:8px;background:#FBF7F1;color:#174A68;line-height:1.65">
        ${setup
          ? "Nothing should be prepared until Square confirms the membership is active. Use the secure button below to finish setup."
          : "Square has confirmed your membership. NectarFusions will prepare each box according to your selected cadence and fulfillment method."}
      </div>

      ${actionUrl ? `<a href="${esc(actionUrl)}" style="display:block;margin-top:18px;padding:14px;border-radius:7px;background:#24A0ED;color:#fff;text-align:center;text-decoration:none;font-weight:800">${actionLabel}</a>` : ""}
    </div>

    <div style="padding:16px 24px;border-top:1px solid #E7DCC9;text-align:center;font-size:12.5px;color:#526B7B;line-height:1.7">
      <strong style="color:#174A68">NectarFusions</strong> · Coleman, Michigan<br>
      ${OWNER}
    </div>
  </div>
</div>`;
}

function ownerEmail(subscription, event, siteUrl) {
  const customer = relationRow(subscription.customers) || {};
  const plan = relationRow(subscription.plans) || {};
  const setup = event === "started";

  return `
<div style="background:#F5EFE7;padding:22px 14px;font-family:Helvetica,Arial,sans-serif;color:#1B1005">
  <div style="max-width:540px;margin:0 auto;background:#fff;border:2px solid ${setup ? "#E69B00" : "#4F6B3C"};border-radius:12px;overflow:hidden">
    <div style="padding:19px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:${setup ? "#E69B00" : "#4F6B3C"}">
        ${setup ? "HONEY CLUB SETUP STARTED" : "HONEY CLUB ACTIVATED"}
      </div>
      <div style="font-size:38px;font-weight:800">#${esc(subscription.sub_no)}</div>
      <div style="font-size:15px;font-weight:700;margin-top:4px">${esc(customer.name || "New member")}</div>
    </div>

    <div style="padding:18px 22px;line-height:1.7;color:#174A68">
      <strong>Plan:</strong> ${esc(plan.name || subscription.plan_id || "Honey Club")}<br>
      <strong>Cadence:</strong> ${cadenceLabel(subscription.cadence)}<br>
      <strong>Method:</strong> ${methodLabel(subscription.method)}<br>
      <strong>Email:</strong> ${esc(customer.email || "")}

      <div style="margin-top:15px;padding:12px;border-radius:8px;background:${setup ? "#FFF9DE" : "#EDF7EA"};font-weight:800;color:${setup ? "#6A4300" : "#2F5B2D"}">
        ${setup
          ? "PENDING SQUARE SETUP — Do not prepare a box yet."
          : "SQUARE CONFIRMED — Membership is active."}
      </div>

      <a href="${siteUrl}/club/${subscription.token}" style="display:block;margin-top:16px;padding:12px;border-radius:7px;background:#174A68;color:#fff;text-align:center;text-decoration:none;font-weight:800">Open membership</a>
    </div>
  </div>
</div>`;
}

export async function sendSubscriptionEmails(subscription, event) {
  if (!["started", "activated"].includes(event)) {
    throw new Error("Unsupported subscription email event.");
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) throw new Error("RESEND_API_KEY is missing.");

  const customer = relationRow(subscription.customers) || {};
  const plan = relationRow(subscription.plans) || {};
  const siteUrl = (process.env.SITE_URL || "https://nectar-fusions.com").replace(/\/$/, "");
  const version =
    event === "started"
      ? subscription.started_at || subscription.created_at || subscription.id
      : subscription.square_subscription_id || subscription.id;
  const keyBase =
    `subscription/${safeKeyPart(subscription.id)}/${safeKeyPart(event)}/${safeKeyPart(version)}`;
  const resend = new Resend(resendKey);
  const ownerLabel = event === "started" ? "setup started" : "activated";
  const customerSubject =
    event === "started"
      ? `Honey Club #${subscription.sub_no} — complete your secure setup`
      : `Welcome to the Honey Club — #${subscription.sub_no}`;

  const jobs = [
    resend.emails.send(
      {
        from: FROM,
        to: OWNER,
        subject: `Honey Club ${ownerLabel} #${subscription.sub_no} — ${customer.name || "New member"} — ${money(plan.price_cents)}`,
        html: ownerEmail(subscription, event, siteUrl),
      },
      { idempotencyKey: `${keyBase}/owner` }
    ),
  ];

  if (customer.email) {
    jobs.push(
      resend.emails.send(
        {
          from: FROM,
          to: customer.email,
          subject: customerSubject,
          html: customerEmail(subscription, event, siteUrl),
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
    throw new Error(`Subscription email delivery failed for ${failed.length} recipient(s).`);
  }

  return { sent: jobs.length };
}
