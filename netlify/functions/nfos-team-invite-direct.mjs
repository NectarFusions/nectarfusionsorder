import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions NFOS <orders@nectar-fusions.com>";
const SITE_URL = () => String(process.env.SITE_URL || "https://nectar-fusions.com").replace(/\/$/, "");
const SETUP_URL = () => `${SITE_URL()}/.netlify/functions/nfos-team-setup`;

const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (ch) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
  })[ch]);

const json = (status, body) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const bytesToBase64Url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const inviteEmailHtml = ({ member, setupUrl, existingAccount }) => `
  <div style="background:#f5efe7;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#17383d">
    <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e4ddd2;border-radius:14px;overflow:hidden">
      <div style="padding:26px 28px 18px;border-bottom:1px solid #eee5d8">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c58b17;font-weight:700">
          NectarFusions Operations
        </div>
        <h1 style="font-size:28px;margin:8px 0 0;color:#17383d">
          ${existingAccount ? "Set up your NFOS password" : "Your NFOS access is ready"}
        </h1>
      </div>
      <div style="padding:24px 28px">
        <p style="font-size:16px;line-height:1.65;margin-top:0">Hi ${esc(member.display_name || "there")},</p>
        <p style="font-size:15px;line-height:1.7">
          ${existingAccount
            ? "Use the secure setup page below to create or reset the password for your NectarFusions Operations System account."
            : "You&rsquo;ve been given access to the NectarFusions Operations System. Use the secure setup page below to finish creating your login."}
        </p>
        <p style="margin:24px 0">
          <a href="${esc(setupUrl)}"
             style="display:inline-block;background:#17383d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">
            Set up NFOS access
          </a>
        </p>
        <p style="font-size:14px;line-height:1.65;color:#5d6d70">
          On the next screen, press <strong>Continue to NFOS</strong>. You&rsquo;ll be signed in securely and taken directly to create your password.
        </p>
        <p style="font-size:12px;line-height:1.6;color:#7b8587;margin-bottom:0">
          This setup link is time limited. If it expires, ask NectarFusions to send another setup email.
        </p>
      </div>
    </div>
  </div>
`;

export default async (request) => {
  if (request.method !== "POST") return json(405, { error: "POST only" });

  const authHeader = String(request.headers.get("authorization") || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Admin authentication is required." });
  }

  const url = String(process.env.SUPABASE_URL || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();

  if (!url || !serviceKey || !resendKey) {
    return json(500, { error: "NFOS invitation delivery is missing required server configuration." });
  }

  const token = authHeader.slice(7).trim();
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const resend = new Resend(resendKey);

  const { data: callerData, error: callerError } = await db.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) return json(401, { error: "Admin session is invalid or expired." });

  const { data: adminRow, error: adminError } = await db
    .from("admins")
    .select("user_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminError || !adminRow) return json(403, { error: "Only an NFOS admin can invite team members." });

  let body = {};
  try { body = await request.json(); }
  catch { return json(400, { error: "Invalid request." }); }

  const memberId = String(body?.memberId || "").trim();
  if (!memberId) return json(400, { error: "Team member is required." });

  const { data: member, error: memberError } = await db
    .from("nfos_team_members")
    .select("id,user_id,display_name,email,role,roles,active,deleted_at")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();

  if (memberError || !member) return json(404, { error: "Team member was not found." });
  if (!member.active) return json(400, { error: "Team member is inactive." });
  if (!member.email) return json(400, { error: "Add an email address before sending an invite." });

  const metadata = {
    nfos_display_name: member.display_name,
    nfos_invited: true,
    nfos_roles: Array.isArray(member.roles) && member.roles.length
      ? member.roles
      : [member.role].filter(Boolean),
  };

  const hadLinkedAccount = Boolean(member.user_id);
  let authUser = null;

  if (member.user_id) {
    const { data: linkedData, error: linkedError } = await db.auth.admin.getUserById(member.user_id);
    authUser = linkedData?.user;

    if (linkedError || !authUser) {
      return json(409, {
        error: "This NFOS profile is linked to an auth account that no longer exists.",
        hint: "Repair the account link before sending another setup email.",
      });
    }

    if (authUser.email && authUser.email.toLowerCase() !== String(member.email).toLowerCase()) {
      return json(409, { error: "The linked auth account email no longer matches this NFOS profile." });
    }

    const { data: updatedData, error: updateError } = await db.auth.admin.updateUserById(authUser.id, {
      user_metadata: { ...(authUser.user_metadata || {}), ...metadata },
    });
    if (updateError) return json(400, { error: updateError.message });
    authUser = updatedData?.user || authUser;
  } else {
    const { data: createdData, error: createError } = await db.auth.admin.createUser({
      email: member.email,
      email_confirm: false,
      user_metadata: metadata,
    });

    authUser = createdData?.user;
    if (createError || !authUser?.id) {
      return json(400, {
        error: createError?.message || "The employee login account could not be created.",
        hint: "If this email already belongs to an existing account, link that account before inviting.",
      });
    }

    const { data: linkedMember, error: linkProfileError } = await db
      .from("nfos_team_members")
      .update({ user_id: authUser.id, updated_at: new Date().toISOString() })
      .eq("id", member.id)
      .is("user_id", null)
      .select("id,user_id")
      .maybeSingle();

    if (linkProfileError || !linkedMember || linkedMember.user_id !== authUser.id) {
      try { await db.auth.admin.deleteUser(authUser.id); } catch {}
      return json(500, {
        error: "The login account was created but the NFOS profile could not be linked. No employee access was enabled.",
      });
    }
  }

  const rawSetupToken = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const setupHash = await sha256Hex(rawSetupToken);
  const setupExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: nonceData, error: nonceError } = await db.auth.admin.updateUserById(authUser.id, {
    app_metadata: {
      ...(authUser.app_metadata || {}),
      nfos_setup: {
        hash: setupHash,
        expires_at: setupExpiresAt,
        member_id: member.id,
      },
    },
  });

  if (nonceError || !nonceData?.user) {
    return json(500, { error: nonceError?.message || "Could not create the secure NFOS setup session." });
  }

  authUser = nonceData.user;
  const setupUrl = `${SETUP_URL()}?uid=${encodeURIComponent(authUser.id)}&token=${encodeURIComponent(rawSetupToken)}`;

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: member.email,
      subject: hadLinkedAccount
        ? "Set up your NectarFusions NFOS password"
        : "Your NectarFusions NFOS invitation",
      html: inviteEmailHtml({ member, setupUrl, existingAccount: hadLinkedAccount }),
    });

    if (result?.error || !result?.data?.id) {
      throw new Error(result?.error?.message || "Resend did not return a delivery message ID.");
    }

    return json(200, {
      ok: true,
      memberId: member.id,
      userId: authUser.id,
      resent: hadLinkedAccount,
      provider: "resend",
      providerMessageId: result.data.id,
      message: hadLinkedAccount
        ? "Password setup email accepted by NectarFusions email delivery."
        : "NFOS invitation created, linked and accepted by NectarFusions email delivery.",
    });
  } catch (error) {
    return json(502, {
      error: `The NFOS setup session was created, but NectarFusions email delivery failed: ${String(error?.message || error)}`,
      hint: "Use the setup/invite button again. The team profile remains safely linked.",
    });
  }
};
