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
  if (!url || !secret) return json(500, { error: "NFOS invite service is not configured." });

  const token = auth.slice(7).trim();
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const caller = userData?.user;
  if (userError || !caller) return json(401, { error: "Admin session is invalid or expired." });

  const { data: adminRow, error: adminError } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (adminError || !adminRow) return json(403, { error: "Only an NFOS admin can invite team members." });

  let body: { memberId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const memberId = String(body.memberId || "").trim();
  if (!memberId) return json(400, { error: "Team member is required." });

  const { data: member, error: memberError } = await admin
    .from("nfos_team_members")
    .select("id,user_id,display_name,email,role,active")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError || !member) return json(404, { error: "Team member was not found." });
  if (!member.active) return json(400, { error: "Team member is inactive." });
  if (!member.email) return json(400, { error: "Add an email address before sending an invite." });

  if (member.user_id) {
    return json(200, {
      ok: true,
      alreadyLinked: true,
      memberId: member.id,
      message: "This team profile is already linked to a login.",
    });
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    member.email,
    {
      data: {
        nfos_display_name: member.display_name,
        nfos_invited: true,
      },
      redirectTo: "https://nectar-fusions.com/admin/operations",
    }
  );

  if (inviteError || !inviteData?.user?.id) {
    return json(400, {
      error: inviteError?.message || "The employee invitation could not be created.",
      hint: "If this email already has a NectarFusions account, it will need to be linked instead of invited.",
    });
  }

  const { error: linkError } = await admin
    .from("nfos_team_members")
    .update({ user_id: inviteData.user.id, updated_at: new Date().toISOString() })
    .eq("id", member.id)
    .is("user_id", null);

  if (linkError) {
    try {
      await admin.auth.admin.deleteUser(inviteData.user.id);
    } catch {}
    return json(500, {
      error: "The invite was created but the NFOS profile could not be linked. No employee access was enabled.",
    });
  }

  return json(200, {
    ok: true,
    memberId: member.id,
    userId: inviteData.user.id,
    email: member.email,
    message: "Invitation sent and NFOS login linked.",
  });
});
