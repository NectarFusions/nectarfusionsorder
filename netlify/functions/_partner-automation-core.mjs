import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const OWNER = "info@nectar-fusions.com";
const DEFAULT_SITE = "https://nectar-fusions.com";

const clean = (value, max = 5000) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
  })[character]);

const todayIso = () => new Date().toISOString().slice(0, 10);

const dateFrom = (value) => {
  if (!value) return null;
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDate = (date) => date.toISOString().slice(0, 10);

const addDays = (value, days) => {
  const date = dateFrom(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return isoDate(date);
};

const subtractDays = (value, days) => addDays(value, -Number(days || 0));

const advanceDate = (value, cadenceValue, cadenceUnit) => {
  const date = dateFrom(value);
  if (!date) return null;
  const count = Math.max(1, Number.parseInt(cadenceValue, 10) || 1);
  if (cadenceUnit === "day") date.setUTCDate(date.getUTCDate() + count);
  else if (cadenceUnit === "week") date.setUTCDate(date.getUTCDate() + count * 7);
  else if (cadenceUnit === "year") date.setUTCFullYear(date.getUTCFullYear() + count);
  else date.setUTCMonth(date.getUTCMonth() + count);
  return isoDate(date);
};

const template = (value, vars) => {
  let output = String(value || "");
  for (const [key, replacement] of Object.entries(vars)) {
    output = output.replaceAll(`{{${key}}}`, replacement ?? "");
  }
  return output;
};

/* PARTNER AUTOMATION PREVIEW V14 */
const defaultSubject = (action, packageName, programKey) => {
  if (action === "renewal_reminder" || programKey === "hive_partners") {
    return `Your NectarFusions ${packageName} renewal is coming up`;
  }
  if (action === "recurring_reminder") {
    return `Review your next NectarFusions ${packageName} order`;
  }
  return `Time to restock ${packageName}`;
};

const defaultBody = ({ action, programKey, businessName, packageName, orderNo, dueDate, portalUrl }) => {
  const isRenewal = action === "renewal_reminder" || programKey === "hive_partners";
  const isRecurring = action === "recurring_reminder";

  const intro = isRenewal
    ? `Your annual ${packageName} partnership renewal is coming up.`
    : isRecurring
      ? `Your next ${packageName} order is ready for your review.`
      : `It may be time to restock ${packageName}.`;

  const actionCopy = isRenewal
    ? "Open your Partner Portal to review your sponsorship details and renew securely. Your sponsorship is not charged automatically."
    : isRecurring
      ? "Open your Partner Portal to review quantities, flavors, and fulfillment before placing your next order. Nothing is charged automatically."
      : "Open your Partner Portal to reorder exactly, modify the package, or review the current package and fulfillment details before payment.";

  const buttonLabel = isRenewal
    ? "Review Sponsorship"
    : isRecurring
      ? "Review Next Order"
      : "Open Partner Portal";

  const orderLine = orderNo ? `<p style="margin:0 0 14px;color:#627984">Previous order: <strong>${esc(orderNo)}</strong></p>` : "";

  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#173c4f;line-height:1.55">
      <div style="padding:24px;border-radius:18px;background:#102e40;color:#fff">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#72b7e4;font-weight:800">NectarFusions Partner Portal</div>
        <h1 style="margin:8px 0 0;font-size:30px">${esc(businessName || "Partner")}</h1>
      </div>
      <div style="padding:26px;border:1px solid #dce8ed;border-top:0;border-radius:0 0 18px 18px">
        <p style="font-size:18px;margin-top:0">${esc(intro)}</p>
        <p><strong>${esc(packageName)}</strong>${dueDate ? ` · ${esc(dueDate)}` : ""}</p>
        ${orderLine}
        <p>${esc(actionCopy)}</p>
        <p style="margin:24px 0"><a href="${esc(portalUrl)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#f7c41c;color:#102e40;text-decoration:none;font-weight:800">${esc(buttonLabel)}</a></p>
        <p style="font-size:12px;color:#758892">Questions? Reply to this email or contact ${esc(OWNER)}.</p>
      </div>
    </div>`;
};

const adminClient = () => {
  const url = clean(process.env.SUPABASE_URL, 1000);
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 5000);
  if (!url || !serviceKey) throw new Error("Partner automation is missing Supabase server configuration.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
};

const mailClient = () => {
  const key = clean(process.env.RESEND_API_KEY, 5000);
  if (!key) throw new Error("Partner automation is missing RESEND_API_KEY.");
  return new Resend(key);
};

async function existingEvent(admin, { ruleId, orderId, recurringOrderId, actionKey, dueOn }) {
  let query = admin
    .from("partner_automation_events")
    .select("id,status,attempt_count,last_attempt_at,sent_at,due_on")
    .eq("rule_id", ruleId)
    .eq("action_key", actionKey);
  if (orderId) query = query.eq("order_id", orderId);
  if (recurringOrderId) query = query.eq("recurring_order_id", recurringOrderId).eq("due_on", dueOn);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function claimEvent(admin, payload) {
  const prior = await existingEvent(admin, payload);
  if (prior?.status === "sent" || prior?.status === "skipped") return null;
  if (prior?.status === "processing") {
    const attempted = dateFrom(prior.last_attempt_at);
    if (attempted && Date.now() - attempted.getTime() < 2 * 60 * 60 * 1000) return null;
  }
  const now = new Date().toISOString();
  if (prior) {
    const { data, error } = await admin
      .from("partner_automation_events")
      .update({
        status: "processing",
        attempt_count: Number(prior.attempt_count || 0) + 1,
        last_attempt_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq("id", prior.id)
      .select("id")
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await admin
    .from("partner_automation_events")
    .insert({
      rule_id: payload.ruleId,
      partner_id: payload.partnerId,
      order_id: payload.orderId || null,
      recurring_order_id: payload.recurringOrderId || null,
      program_key: payload.programKey,
      package_id: payload.packageId || null,
      event_key: payload.eventKey,
      action_key: payload.actionKey,
      due_on: payload.dueOn,
      status: "processing",
      attempt_count: 1,
      last_attempt_at: now,
      metadata: payload.metadata || {},
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw error;
  }
  return data;
}

async function finishEvent(admin, eventId, patch) {
  const { error } = await admin
    .from("partner_automation_events")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", eventId);
  if (error) throw error;
}

export async function buildPartnerAutomationMessage({ rule, source, recurring = false, dueOn }) {
  const businessName = source.business_name || source.partner?.business_name || "NectarFusions Partner";
  const contactName = source.contact_name || source.partner?.contact_name || "";
  const recipient = clean(source.email || source.partner?.email, 320);
  const packageName = source.package_snapshot?.name || source.package?.name || rule.package?.name || "Partner Package";
  const orderNo = source.order_no || "";
  const siteUrl = (clean(process.env.URL, 1000) || DEFAULT_SITE).replace(/\/$/, "");
  const reorderParam = source.id && !recurring ? `?reorder=${encodeURIComponent(source.id)}` : "";
  const portalUrl = `${siteUrl}/partner/login${reorderParam}`;
  const vars = {
    business_name: businessName,
    contact_name: contactName,
    package_name: packageName,
    order_no: orderNo,
    due_date: dueOn || "",
    portal_url: portalUrl,
  };
  const subject = template(rule.subject_template, vars) || defaultSubject(rule.action_key, packageName, rule.program_key);
  const customBody = template(rule.body_template, vars);
  const html = customBody
    ? `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#173c4f;line-height:1.55;white-space:pre-wrap">${esc(customBody)}<p><a href="${esc(portalUrl)}">Open Partner Portal</a></p></div>`
    : defaultBody({ action: rule.action_key, programKey: rule.program_key, businessName, packageName, orderNo, dueDate: dueOn, portalUrl });

  return { recipient, subject, html, portalUrl };
}

export async function runPartnerAutomation({ source = "scheduled" } = {}) {
  const admin = adminClient();
  const resend = mailClient();
  const today = todayIso();
  const summary = { source, today, candidates: 0, sent: 0, skipped: 0, failed: 0 };

  const { data: rules, error: ruleError } = await admin
    .from("partner_automation_rules")
    .select("id,program_key,package_id,event_key,action_key,delay_days,active,subject_template,body_template,package:partner_packages(id,name,active)")
    .eq("active", true);
  if (ruleError) throw ruleError;

  const orderRules = (rules || []).filter((rule) => rule.event_key === "fulfilled" && rule.package_id);
  if (orderRules.length) {
    const packageIds = [...new Set(orderRules.map((rule) => rule.package_id))];
    const { data: orders, error: orderError } = await admin
      .from("partner_store_orders")
      .select("id,order_no,partner_id,program_key,package_id,package_snapshot,business_name,contact_name,email,status,fulfilled_at,created_at")
      .eq("status", "fulfilled")
      .not("fulfilled_at", "is", null)
      .in("package_id", packageIds)
      .order("fulfilled_at", { ascending: true })
      .limit(250);
    if (orderError) throw orderError;

    for (const order of orders || []) {
      for (const rule of orderRules.filter((item) => item.package_id === order.package_id)) {
        const dueOn = addDays(order.fulfilled_at, rule.delay_days);
        if (!dueOn || dueOn > today) continue;
        summary.candidates += 1;

        const claim = await claimEvent(admin, {
          ruleId: rule.id,
          partnerId: order.partner_id,
          orderId: order.id,
          recurringOrderId: null,
          programKey: order.program_key || rule.program_key,
          packageId: order.package_id,
          eventKey: rule.event_key,
          actionKey: rule.action_key,
          dueOn,
          metadata: { order_no: order.order_no },
        });
        if (!claim) continue;

        try {
          const { data: replacement, error: replacementError } = await admin
            .from("partner_store_orders")
            .select("id,status")
            .eq("reorder_of_order_id", order.id)
            .neq("status", "cancelled")
            .limit(1)
            .maybeSingle();
          if (replacementError) throw replacementError;
          if (replacement) {
            await finishEvent(admin, claim.id, { status: "skipped", error_message: "A reorder already exists for this source order." });
            summary.skipped += 1;
            continue;
          }

          const message = await buildPartnerAutomationMessage({ rule, source: order, dueOn });
          if (!message.recipient) {
            await finishEvent(admin, claim.id, { status: "skipped", error_message: "Partner email is missing." });
            summary.skipped += 1;
            continue;
          }

          const { error: emailError } = await resend.emails.send({
            from: FROM,
            to: [message.recipient],
            subject: message.subject,
            html: message.html,
            replyTo: OWNER,
          });
          if (emailError) throw new Error(emailError.message || "Resend could not send the reminder.");

          await finishEvent(admin, claim.id, {
            status: "sent",
            recipient_email: message.recipient,
            subject: message.subject,
            sent_at: new Date().toISOString(),
            metadata: { order_no: order.order_no, portal_url: message.portalUrl },
          });
          summary.sent += 1;
        } catch (error) {
          await finishEvent(admin, claim.id, { status: "failed", error_message: clean(error?.message || error, 2000) });
          summary.failed += 1;
        }
      }
    }
  }

  const recurringRules = (rules || []).filter((rule) => ["recurring_due", "annual_renewal"].includes(rule.event_key) && rule.package_id);
  if (recurringRules.length) {
    const packageIds = [...new Set(recurringRules.map((rule) => rule.package_id))];
    const { data: recurringRows, error: recurringError } = await admin
      .from("partner_recurring_orders")
      .select("id,partner_id,program_key,package_id,status,cadence_value,cadence_unit,next_order_on,configuration_snapshot,partner:partner_accounts(business_name,contact_name,email),package:partner_packages(id,name)")
      .eq("status", "active")
      .not("next_order_on", "is", null)
      .in("package_id", packageIds)
      .limit(250);
    if (recurringError) throw recurringError;

    for (const recurring of recurringRows || []) {
      for (const rule of recurringRules.filter((item) => item.package_id === recurring.package_id)) {
        const reminderOn = subtractDays(recurring.next_order_on, rule.delay_days);
        if (!reminderOn || reminderOn > today) continue;
        summary.candidates += 1;

        const claim = await claimEvent(admin, {
          ruleId: rule.id,
          partnerId: recurring.partner_id,
          orderId: null,
          recurringOrderId: recurring.id,
          programKey: recurring.program_key || rule.program_key,
          packageId: recurring.package_id,
          eventKey: rule.event_key,
          actionKey: rule.action_key,
          dueOn: recurring.next_order_on,
          metadata: { reminder_on: reminderOn },
        });
        if (!claim) continue;

        try {
          const message = await buildPartnerAutomationMessage({ rule, source: recurring, recurring: true, dueOn: recurring.next_order_on });
          if (!message.recipient) {
            await finishEvent(admin, claim.id, { status: "skipped", error_message: "Partner email is missing." });
            summary.skipped += 1;
            continue;
          }

          const { error: emailError } = await resend.emails.send({
            from: FROM,
            to: [message.recipient],
            subject: message.subject,
            html: message.html,
            replyTo: OWNER,
          });
          if (emailError) throw new Error(emailError.message || "Resend could not send the reminder.");

          const nextOrderOn = advanceDate(recurring.next_order_on, recurring.cadence_value, recurring.cadence_unit);
          const now = new Date().toISOString();
          await Promise.all([
            finishEvent(admin, claim.id, {
              status: "sent",
              recipient_email: message.recipient,
              subject: message.subject,
              sent_at: now,
              metadata: { reminder_on: reminderOn, portal_url: message.portalUrl, next_order_on: nextOrderOn },
            }),
            admin.from("partner_recurring_orders").update({ next_order_on: nextOrderOn, updated_at: now }).eq("id", recurring.id),
          ]);
          summary.sent += 1;
        } catch (error) {
          await finishEvent(admin, claim.id, { status: "failed", error_message: clean(error?.message || error, 2000) });
          summary.failed += 1;
        }
      }
    }
  }

  return summary;
}
