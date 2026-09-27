import { createClient } from "@supabase/supabase-js";
import { buildPartnerAutomationMessage } from "./_partner-automation-core.mjs";

const json = (status, body) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const clean = (value, max = 5000) =>
  String(value ?? "").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "POST only" });
  }

  const authorization = clean(req.headers.get("authorization"), 6000);
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json(401, { error: "Admin authentication is required." });
  }

  const supabaseUrl = clean(process.env.SUPABASE_URL, 1000);
  const anonKey = clean(
    process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY,
    5000
  );
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY, 5000);

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "Partner automation preview is not configured." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data: userData, error: userError } =
    await userClient.auth.getUser();

  if (userError || !userData?.user?.id) {
    return json(401, { error: "Admin authentication expired." });
  }

  const { data: adminRow, error: adminError } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    return json(403, { error: "Admin access is required." });
  }

  const body = await req.json().catch(() => ({}));
  const ruleId = clean(body?.ruleId, 100);

  if (!ruleId) {
    return json(400, { error: "Choose an automation rule to preview." });
  }

  const { data: rule, error: ruleError } = await admin
    .from("partner_automation_rules")
    .select(
      "id,program_key,package_id,event_key,action_key,delay_days,active," +
      "subject_template,body_template,package:partner_packages(id,name,active)"
    )
    .eq("id", ruleId)
    .maybeSingle();

  if (ruleError) {
    return json(500, { error: ruleError.message });
  }

  if (!rule) {
    return json(404, { error: "Automation rule not found." });
  }

  const recurring = ["recurring_due", "annual_renewal"].includes(
    rule.event_key
  );

  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const packageName = rule.package?.name || "Partner Package";

  const source = recurring
    ? {
        id: "preview-recurring",
        partner: {
          business_name: "Example Partner",
          contact_name: "Jordan",
          email: "preview@example.com",
        },
        package: { name: packageName },
      }
    : {
        id: "preview-order",
        business_name: "Example Partner",
        contact_name: "Jordan",
        email: "preview@example.com",
        order_no: "NF-PREVIEW-1001",
        package_snapshot: { name: packageName },
      };

  const message = await buildPartnerAutomationMessage({
    rule,
    source,
    recurring,
    dueOn: dueDate,
  });

  return json(200, {
    ok: true,
    preview: true,
    sent: false,
    subject: message.subject,
    html: message.html,
    portalUrl: message.portalUrl,
    packageName,
    eventKey: rule.event_key,
    actionKey: rule.action_key,
  });
};
