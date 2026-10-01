import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions NFOS <orders@nectar-fusions.com>";
const APP_URL = () =>
  `${String(process.env.SITE_URL || "https://nectar-fusions.com").replace(/\/$/, "")}/admin/operations`;

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

const inviteEmailHtml = ({ member, actionLink, signInMode }) => `
  <div style="background:#f5efe7;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#17383d">
    <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e4ddd2;border-radius:14px;overflow:hidden">
      <div style="padding:26px 28px 18px;border-bottom:1px solid #eee5d8">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c58b17;font-weight:700">
          NectarFusions Operations
        </div>
        <h1 style="font-size:28px;margin:8px 0 0;color:#17383d">Your NFOS access is ready</h1>
      </div>
      <div style="padding:24px 28px">
        <p style="font-size:16px;line-height:1.65;margin-top:0">Hi ${esc(member.display_name || "there")},</p>
        <p style="font-size:15px;line-height:1.7">
          You&rsquo;ve been given access to the NectarFusions Operations System (NFOS).
          Use the secure button below to ${signInMode ? "sign in and confirm your email" : "accept your invitation"}.
        </p>
        <p style="margin:24px 0">
          <a href="${esc(actionLink)}"
             style="display:inline-block;background:#17383d;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">
            Open NectarFusions NFOS
          </a>
        </p>
        <p style="font-size:14px;line-height:1.65;color:#5d6d70">
          After you open NFOS, you can set or change your password from the Access section.
        </p>
        <p style="font-size:12px;line-height:1.6;color:#7b8587;margin-bottom:0">
          This secure link is time limited. If it expires, ask NectarFusions to resend your invitation.
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
  if (callerError || !caller) {
    return json(401, { error: "Admin session is invalid or expired." });
  }

  const { data: adminRow, error: adminError } = await db
    .from("admins")
    .select("user_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    return json(403, { error: "Only an NFOS admin can invite team members." });
  }

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

  let authUser = null;
  let actionLink = "";
  let signInMode = false;

  if (member.user_id) {
    const { data: linkedData, error: linkedError } = await db.auth.admin.getUserById(member.user_id);
    authUser = linkedData?.user;

    if (linkedError || !authUser) {
      return json(409, {
        error: "This NFOS profile is linked to an auth account that no longer exists.",
        hint: "Repair the account link before sending another invitation.",
      });
    }

    if (authUser.email && authUser.email.toLowerCase() !== String(member.email).toLowerCase()) {
      return json(409, { error: "The linked auth account email no longer matches this NFOS profile." });
    }

    if (authUser.email_confirmed_at) {
      return json(200, {
        ok: true,
        alreadyLinked: true,
        confirmed: true,
        memberId: member.id,
        userId: authUser.id,
        message: "This team member already has an active NFOS login.",
      });
    }

    await db.auth.admin.updateUserById(authUser.id, {
      user_metadata: { ...(authUser.user_metadata || {}), ...metadata },
    });

    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: member.email,
      options: { data: metadata, redirectTo: APP_URL() },
    });

    if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
      return json(400, {
        error: linkError?.message || "A fresh NFOS access link could not be generated.",
      });
    }

    if (linkData.user.id !== member.user_id) {
      return json(409, {
        error: "Supabase returned a different auth account for this team profile.",
        hint: "No NFOS profile link was changed.",
      });
    }

    authUser = linkData.user;
    actionLink = linkData.properties.action_link;
    signInMode = true;
  } else {
    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: "invite",
      email: member.email,
      options: { data: metadata, redirectTo: APP_URL() },
    });

    if (linkError || !linkData?.properties?.action_link || !linkData?.user?.id) {
      return json(400, {
        error: linkError?.message || "The NFOS invitation could not be generated.",
        hint: "If this email already belongs to an existing account, link that account before inviting.",
      });
    }

    authUser = linkData.user;
    actionLink = linkData.properties.action_link;

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
        error: "The invite was created but the NFOS profile could not be linked. No employee access was enabled.",
      });
    }
  }

  try {
    const result = await resend.emails.send({
      from: FROM,
      to: member.email,
      subject: "Your NectarFusions NFOS invitation",
      html: inviteEmailHtml({ member, actionLink, signInMode }),
    });

    if (result?.error || !result?.data?.id) {
      throw new Error(result?.error?.message || "Resend did not return a delivery message ID.");
    }

    console.log(JSON.stringify({
      event: "nfos_team_invite_sent",
      member_id: member.id,
      auth_user_id: authUser.id,
      provider: "resend",
      provider_message_id: result.data.id,
      mode: signInMode ? "magiclink" : "invite",
    }));

    return json(200, {
      ok: true,
      memberId: member.id,
      userId: authUser.id,
      resent: Boolean(member.user_id),
      provider: "resend",
      providerMessageId: result.data.id,
      message: signInMode
        ? "Fresh NFOS invitation accepted by NectarFusions email delivery."
        : "NFOS invitation created, linked and accepted by NectarFusions email delivery.",
    });
  } catch (error) {
    console.error("NFOS invite Resend delivery failed", error);
    return json(502, {
      error: `The NFOS access link was created, but NectarFusions email delivery failed: ${String(error?.message || error)}`,
      hint: "Use Resend invite again. The team profile remains safely linked and unconfirmed.",
    });
  }
};
