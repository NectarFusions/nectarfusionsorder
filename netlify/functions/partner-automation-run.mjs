import { createClient } from "@supabase/supabase-js";
import { runPartnerAutomation } from "./_partner-automation-core.mjs";

const json = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const authorization = String(req.headers.get("authorization") || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Admin authentication is required." });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: "Partner automation is not configured." });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user?.id) return json(401, { error: "Admin authentication expired." });

  const { data: adminRow, error: adminError } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError || !adminRow) return json(403, { error: "Admin access is required." });

  try {
    const result = await runPartnerAutomation({ source: "admin_manual" });
    return json(200, { ok: true, ...result });
  } catch (error) {
    return json(500, { error: error?.message || "Partner automation failed." });
  }
};
