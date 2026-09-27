import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const OWNER = "info@nectar-fusions.com";
const FROM = "NectarFusions <orders@nectar-fusions.com>";
const PROGRAMS = new Map([
  ["retail", "Retail Partners"],
  ["foodservice", "Foodservice"],
  ["business_gifting", "Business Gifting"],
  ["hive_partners", "Hive Partners"],
]);
const PRE_APPROVAL_RELATIONSHIPS = new Set([
  "application_received",
  "needs_information",
  "under_review",
  "waitlisted",
  "declined",
]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (value, max = 5000) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};
const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (character) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;",
  })[character]);

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: "Partner applications are not configured." });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid application data." });
  }

  // Lightweight bot controls. The database itself has no anonymous write policy.
  if (clean(body.website, 200)) return json(200, { ok: true });
  const startedAt = Number(body.formStartedAt || 0);
  if (startedAt && Date.now() - startedAt < 1200) {
    return json(400, { error: "Please review your application and try again." });
  }

  const contactName = clean(body.contactName, 160);
  const businessName = clean(body.businessName, 160);
  const businessType = clean(body.businessType, 160);
  const email = normalizeEmail(body.email);
  const phone = clean(body.phone, 80);
  const websiteSocial = clean(body.websiteSocial, 500);
  const salesLocation = clean(body.salesLocation, 1000);
  const message = clean(body.message, 5000);
  const programKeys = [
    ...new Set(
      (Array.isArray(body.programKeys) ? body.programKeys : [])
        .map((value) => String(value || "").trim())
        .filter((value) => PROGRAMS.has(value))
    ),
  ].slice(0, 4);

  if (!contactName || !businessName || !businessType || !email || !salesLocation || !programKeys.length) {
    return json(400, { error: "Complete the required business, contact, location, and program fields." });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(400, { error: "Enter a valid email address." });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: matches, error: lookupError } = await admin
    .from("partner_accounts")
    .select("id,business_name,email,relationship_status,auth_access_enabled")
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(2);

  if (lookupError) return json(500, { error: "The partner account could not be checked." });
  if ((matches || []).length > 1) {
    return json(409, { error: "This email is connected to more than one partner record. Please contact NectarFusions." });
  }

  let partner = matches?.[0] || null;
  if (!partner) {
    const { data, error } = await admin
      .from("partner_accounts")
      .insert({
        business_name: businessName,
        contact_name: contactName,
        email,
        phone,
        website_url: websiteSocial,
        relationship_status: "application_received",
        auth_access_enabled: false,
      })
      .select("id,business_name,email,relationship_status,auth_access_enabled")
      .single();

    if (error || !data) {
      return json(500, { error: error?.message || "The partner account could not be created." });
    }
    partner = data;
  } else if (PRE_APPROVAL_RELATIONSHIPS.has(partner.relationship_status)) {
    // Public re-submissions may refresh an unapproved application record, but never overwrite
    // an established partner's account profile merely because the email address is known.
    const { error } = await admin
      .from("partner_accounts")
      .update({
        business_name: businessName,
        contact_name: contactName,
        phone,
        website_url: websiteSocial,
        relationship_status: partner.relationship_status === "declined"
          ? "application_received"
          : partner.relationship_status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);

    if (error) return json(500, { error: "The partner account could not be updated." });
  }

  const [accessResult, applicationResult] = await Promise.all([
    admin
      .from("partner_account_programs")
      .select("program_key,status")
      .eq("partner_id", partner.id)
      .in("program_key", programKeys),
    admin
      .from("partner_program_applications")
      .select("id,program_key,status")
      .eq("partner_id", partner.id)
      .in("program_key", programKeys),
  ]);

  if (accessResult.error || applicationResult.error) {
    return json(500, { error: "Existing program access could not be checked." });
  }

  const accessByProgram = new Map((accessResult.data || []).map((row) => [row.program_key, row]));
  const applicationByProgram = new Map((applicationResult.data || []).map((row) => [row.program_key, row]));
  const now = new Date().toISOString();
  const submittedPrograms = [];
  const alreadyApprovedPrograms = [];

  for (const programKey of programKeys) {
    const access = accessByProgram.get(programKey);
    const existingApplication = applicationByProgram.get(programKey);

    if (access?.status === "approved" || existingApplication?.status === "approved") {
      alreadyApprovedPrograms.push(programKey);
      continue;
    }

    const applicationPayload = {
      partner_id: partner.id,
      program_key: programKey,
      status: "pending",
      applicant_name: contactName,
      applicant_email: email,
      applicant_phone: phone,
      business_type: businessType,
      website_social: websiteSocial,
      use_location: salesLocation,
      application_notes: message,
      source: "public_partner_page",
      submitted_at: now,
      reviewed_at: null,
      reviewed_by: null,
      admin_notes: null,
      updated_at: now,
    };

    const { error: applicationError } = await admin
      .from("partner_program_applications")
      .upsert(applicationPayload, { onConflict: "partner_id,program_key" });

    if (applicationError) {
      return json(500, { error: applicationError.message || "Program applications could not be saved." });
    }

    // Never let a public form silently downgrade an approved or suspended access row.
    if (!access || !["approved", "suspended"].includes(access.status)) {
      const { error: accessError } = await admin
        .from("partner_account_programs")
        .upsert({
          partner_id: partner.id,
          program_key: programKey,
          status: "pending",
          approved_at: null,
          approved_by: null,
          updated_at: now,
        }, { onConflict: "partner_id,program_key" });

      if (accessError) {
        return json(500, { error: accessError.message || "Program access could not be queued." });
      }
    }

    submittedPrograms.push(programKey);
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (resendKey && submittedPrograms.length) {
    try {
      const resend = new Resend(resendKey);
      const programs = submittedPrograms.map((key) => PROGRAMS.get(key)).join(", ");
      await resend.emails.send({
        from: FROM,
        to: OWNER,
        subject: `New NectarFusions partner application — ${businessName}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#173C52">
          <h2>${esc(businessName)}</h2>
          <p><strong>Programs:</strong> ${esc(programs)}</p>
          <p><strong>Contact:</strong> ${esc(contactName)} · ${esc(email)}${phone ? ` · ${esc(phone)}` : ""}</p>
          <p><strong>Business type:</strong> ${esc(businessType)}</p>
          <p><strong>Where used/sold:</strong> ${esc(salesLocation)}</p>
          ${websiteSocial ? `<p><strong>Website/social:</strong> ${esc(websiteSocial)}</p>` : ""}
          ${message ? `<p><strong>Notes:</strong><br>${esc(message).replace(/\n/g, "<br>")}</p>` : ""}
          <p>Review each requested program independently in Admin → Partner Commerce → Applications.</p>
        </div>`,
      });
    } catch (error) {
      console.error("Partner application notification failed", error);
    }
  }

  return json(200, {
    ok: true,
    partnerId: partner.id,
    submittedPrograms,
    alreadyApprovedPrograms,
  });
};
