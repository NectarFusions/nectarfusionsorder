import { createClient } from "@supabase/supabase-js";

const PROGRAMS = new Set(["retail", "foodservice", "business_gifting", "hive_partners"]);
const APPLICATION_STATUSES = new Set(["pending", "under_review", "needs_information", "approved", "declined", "withdrawn"]);
const ACCESS_STATUSES = new Set(["pending", "approved", "declined", "suspended"]);

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const clean = (value, max = 5000) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

/* PARTNER APPROVAL ONBOARDING V11 */
/* PARTNER PASSWORD SETUP V11.1 */
const partnerPortalRedirect = (req) => {
  const configured = String(
    process.env.PARTNER_PORTAL_URL ||
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    ""
  ).trim();

  if (configured) {
    return `${configured.replace(/\/+$/, "")}/partner/login?setup=password`;
  }

  try {
    const origin = new URL(req.url).origin;
    return `${origin.replace(/\/+$/, "")}/partner/login?setup=password`;
  } catch {
    return "https://nectar-fusions.com/partner/login?setup=password";
  }
};

async function findOrInviteUser(admin, email, businessName, redirectTo) {
  let page = 1;
  let user = null;
  let inviteSent = false;
  while (page <= 10 && !user) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    user = (data?.users || []).find((candidate) => String(candidate.email || "").toLowerCase() === email.toLowerCase()) || null;
    if (!data?.users?.length || data.users.length < 100) break;
    page += 1;
  }

  if (!user) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { partner_business_name: businessName },
    });
    if (error) throw error;
    user = data?.user || null;
    inviteSent = true;
  }
  return { user, inviteSent };
}

async function syncPartnerPortalAccess(admin, partnerId, now) {
  const { data: approvedRows, error: approvedError } = await admin
    .from("partner_account_programs")
    .select("program_key")
    .eq("partner_id", partnerId)
    .eq("status", "approved")
    .limit(1);
  if (approvedError) throw approvedError;

  const hasApprovedProgram = Boolean(approvedRows?.length);
  const { error: accountError } = await admin
    .from("partner_accounts")
    .update({
      auth_access_enabled: hasApprovedProgram,
      updated_at: now,
    })
    .eq("id", partnerId);
  if (accountError) throw accountError;
  return hasApprovedProgram;
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const authorization = String(req.headers.get("authorization") || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) return json(401, { error: "Admin authentication is required." });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: "Partner administration is not configured." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) return json(401, { error: "Admin authentication expired." });
  const { data: adminRow } = await admin.from("admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (!adminRow) return json(403, { error: "Admin access is required." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid admin action." }); }
  const action = clean(body.action, 50);
  const notes = clean(body.adminNotes, 5000);
  const now = new Date().toISOString();

  if (action === "review_application") {
    const applicationId = clean(body.applicationId, 80);
    const status = clean(body.status, 50);
    if (!applicationId || !APPLICATION_STATUSES.has(status)) return json(400, { error: "Choose a valid application action." });

    const { data: application, error: applicationError } = await admin
      .from("partner_program_applications")
      .select("*,partner:partner_accounts(id,business_name,email,relationship_status,auth_access_enabled)")
      .eq("id", applicationId)
      .single();
    if (applicationError || !application) return json(404, { error: "Application not found." });

    const { error: reviewError } = await admin
      .from("partner_program_applications")
      .update({ status, admin_notes: notes, reviewed_at: now, reviewed_by: userData.user.id, updated_at: now })
      .eq("id", application.id);
    if (reviewError) return json(500, { error: reviewError.message });

    const accessStatus = status === "approved"
      ? "approved"
      : ["declined", "withdrawn"].includes(status)
        ? "declined"
        : "pending";
    const { error: accessError } = await admin
      .from("partner_account_programs")
      .upsert({
        partner_id: application.partner_id,
        program_key: application.program_key,
        status: accessStatus,
        approved_at: status === "approved" ? now : null,
        approved_by: status === "approved" ? userData.user.id : null,
        admin_notes: notes,
        updated_at: now,
      }, { onConflict: "partner_id,program_key" });
    if (accessError) return json(500, { error: accessError.message });

    let invited = false;
    let inviteError = null;
    if (status === "approved") {
      const partner = application.partner;
      const { error: partnerError } = await admin
        .from("partner_accounts")
        .update({
          relationship_status: ["application_received", "under_review", "needs_information", "waitlisted", "declined", "closed"].includes(partner.relationship_status)
            ? "approved"
            : partner.relationship_status,
          auth_access_enabled: true,
          approved_at: now,
          updated_at: now,
        })
        .eq("id", partner.id);
      if (partnerError) return json(500, { error: partnerError.message });

      try {
        const inviteResult = await findOrInviteUser(admin, String(partner.email || "").toLowerCase(), partner.business_name, partnerPortalRedirect(req));
        const authUser = inviteResult.user;
        if (authUser?.id) {
          const { data: existingMapping } = await admin
            .from("partner_users")
            .select("partner_id,user_id")
            .eq("user_id", authUser.id)
            .maybeSingle();
          if (existingMapping && existingMapping.partner_id !== partner.id) {
            return json(409, { error: "That email is already connected to a different partner account. Review the account before inviting." });
          }
          const { error: mappingError } = await admin
            .from("partner_users")
            .upsert({
              partner_id: partner.id,
              user_id: authUser.id,
              email: String(partner.email || "").toLowerCase(),
              partner_role: "owner",
              active: true,
              invited_at: now,
            }, { onConflict: "user_id" });
          if (mappingError) throw mappingError;
          invited = inviteResult.inviteSent === true;
        }
      } catch (error) {
        console.error("Partner portal invite failed", error);
        inviteError = error?.message || "The portal invitation could not be completed.";
      }
    }

    try {
      await syncPartnerPortalAccess(admin, application.partner_id, now);
    } catch (syncError) {
      return json(500, { error: syncError?.message || "Partner portal access could not be synchronized." });
    }

    return json(200, { ok: true, status, invited, inviteError });
  }

  if (action === "set_program_status") {
    const partnerId = clean(body.partnerId, 80);
    const programKey = clean(body.programKey, 80);
    const status = clean(body.status, 50);
    if (!partnerId || !PROGRAMS.has(programKey) || !ACCESS_STATUSES.has(status)) return json(400, { error: "Choose a valid program status." });

    const { error } = await admin.from("partner_account_programs").upsert({
      partner_id: partnerId,
      program_key: programKey,
      status,
      approved_at: status === "approved" ? now : null,
      approved_by: status === "approved" ? userData.user.id : null,
      admin_notes: notes,
      updated_at: now,
    }, { onConflict: "partner_id,program_key" });
    if (error) return json(500, { error: error.message });

    let manualInviteError = null;
    if (status === "approved") {
      const { data: partner } = await admin.from("partner_accounts").select("id,business_name,email,relationship_status").eq("id", partnerId).single();
      await admin.from("partner_accounts").update({
        auth_access_enabled: true,
        relationship_status: ["application_received", "under_review", "needs_information", "waitlisted", "declined", "closed"].includes(partner?.relationship_status)
          ? "approved"
          : partner?.relationship_status,
        approved_at: now,
        updated_at: now,
      }).eq("id", partnerId);
      if (partner?.email) {
        try {
          const inviteResult = await findOrInviteUser(admin, partner.email.toLowerCase(), partner.business_name, partnerPortalRedirect(req));
          const authUser = inviteResult.user;
          if (authUser?.id) {
            const { data: existingMapping } = await admin.from("partner_users").select("partner_id,user_id").eq("user_id", authUser.id).maybeSingle();
            if (!existingMapping || existingMapping.partner_id === partnerId) {
              await admin.from("partner_users").upsert({ partner_id: partnerId, user_id: authUser.id, email: partner.email.toLowerCase(), partner_role: "owner", active: true, invited_at: now }, { onConflict: "user_id" });
            }
          }
        } catch (inviteError) {
          console.error("Partner invite after manual program approval failed", inviteError);
          manualInviteError = inviteError?.message || "The portal invitation could not be completed.";
        }
      }
    }
    try {
      await syncPartnerPortalAccess(admin, partnerId, now);
    } catch (syncError) {
      return json(500, { error: syncError?.message || "Partner portal access could not be synchronized." });
    }

    return json(200, { ok: true, inviteError: manualInviteError });
  }

  return json(400, { error: "Unknown admin action." });
};
