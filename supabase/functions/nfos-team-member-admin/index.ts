import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const secretKey = () => {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const auth = String(req.headers.get("authorization") || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Admin authentication is required." });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const secret = secretKey();
  if (!url || !secret) {
    return json(500, { error: "NFOS team administration is not configured." });
  }

  const token = auth.slice(7).trim();
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerError || !caller) {
    return json(401, { error: "Admin session is invalid or expired." });
  }

  const { data: adminRow, error: adminError } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    return json(403, { error: "Only an NFOS admin can manage team members." });
  }

  let body: { action?: string; memberId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const action = String(body.action || "").trim().toLowerCase();
  const memberId = String(body.memberId || "").trim();

  if (action !== "delete") return json(400, { error: "Unsupported team action." });
  if (!memberId) return json(400, { error: "Team member is required." });

  const { data: member, error: memberError } = await admin
    .from("nfos_team_members")
    .select("id,user_id,display_name,email,role,active,deleted_at")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) return json(404, { error: "Team member was not found." });
  if (member.deleted_at) {
    return json(200, { ok: true, alreadyDeleted: true, message: "This team member is already deleted." });
  }
  if (member.role === "owner") {
    return json(409, { error: "The NFOS owner profile cannot be deleted." });
  }
  if (member.user_id === caller.id) {
    return json(409, { error: "You cannot delete your own NFOS profile." });
  }

  if (member.user_id) {
    const { data: targetAdmin, error: targetAdminError } = await admin
      .from("admins")
      .select("user_id")
      .eq("user_id", member.user_id)
      .maybeSingle();

    if (targetAdminError) {
      return json(500, { error: "Could not verify protected admin access." });
    }
    if (targetAdmin) {
      return json(409, { error: "An NFOS admin account cannot be deleted from the Team Directory." });
    }
  }

  const now = new Date().toISOString();

  const cleanup = await Promise.all([
    admin.from("nfos_action_assignments").delete().eq("assigned_member_id", member.id),
    admin.from("nfos_work_items")
      .update({ assigned_member_id: null, updated_at: now })
      .eq("assigned_member_id", member.id)
      .in("status", ["open", "in_progress"]),
    admin.from("nfos_production_orders")
      .update({ assigned_member_id: null, updated_at: now })
      .eq("assigned_member_id", member.id)
      .in("status", ["planned", "released", "in_progress"]),
    admin.from("nfos_market_sessions")
      .update({ assigned_member_id: null, updated_at: now })
      .eq("assigned_member_id", member.id)
      .in("status", ["planned", "loaded", "open"]),
    admin.from("nfos_notifications").delete().eq("recipient_member_id", member.id),
    admin.from("nfos_notification_preferences").delete().eq("member_id", member.id),
  ]);

  const cleanupError = cleanup.map((r) => r.error).find(Boolean);
  if (cleanupError) {
    return json(500, { error: "Could not safely unassign this team member before deletion." });
  }

  const { error: profileError } = await admin
    .from("nfos_team_members")
    .update({
      active: false,
      deleted_at: now,
      deleted_by: caller.id,
      updated_at: now,
    })
    .eq("id", member.id)
    .is("deleted_at", null);

  if (profileError) {
    return json(500, { error: "Could not remove the team member from NFOS." });
  }

  let authRemoved = false;
  let authWarning: string | null = null;

  if (member.user_id) {
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(member.user_id);
    if (deleteAuthError) {
      authWarning = deleteAuthError.message || "Linked login cleanup failed.";
    } else {
      authRemoved = true;
    }
  }

  return json(200, {
    ok: true,
    memberId: member.id,
    authRemoved,
    warning: authWarning,
    message: authWarning
      ? "Team member removed from NFOS. Their NFOS access is disabled, but the linked auth account could not be fully cleaned up."
      : "Team member deleted and NFOS access removed.",
  });
});
