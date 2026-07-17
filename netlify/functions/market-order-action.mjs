import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM = "NectarFusions <orders@nectar-fusions.com>";
const CONTACT_EMAIL = "info@nectar-fusions.com";
const CONTACT_PHONE = "(989) 941-6385";

const esc = (value) =>
  String(value ?? "").replace(/[<>&"]/g, (character) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[character]
  );

const formatMarket = (order) => {
  const market = order.market_dates;
  if (!market) return "your selected market";
  const name = market.venues?.name || "your selected market";
  return `${name}${market.day ? ` on ${market.day}` : ""}`;
};

const shell = (headline, intro, body) => `
<div style="background:#F5EFE7;padding:26px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:540px;margin:0 auto;background:#fff;border:1px solid #E7DCC9;border-radius:12px;overflow:hidden">
    <div style="padding:25px 24px 20px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#E69B00">Market pickup update</div>
      <div style="margin-top:7px;font-size:31px;font-weight:750;color:#4A3313">${headline}</div>
      <div style="margin-top:8px;font-size:14px;line-height:1.6;color:#7B5821">${intro}</div>
    </div>
    <div style="padding:22px 24px">${body}</div>
    <div style="padding:17px 24px;text-align:center;border-top:1px solid #E7DCC9;color:#7B5821;font-size:13px;line-height:1.75">
      Call or text: <strong>${CONTACT_PHONE}</strong><br>
      Email: <strong>${CONTACT_EMAIL}</strong>
    </div>
  </div>
</div>`;

const firstNoShowEmail = (order) => shell(
  "We missed you",
  `We did not see you at ${esc(formatMarket(order))}.`,
  `<p style="margin:0;color:#111;font-size:15px;line-height:1.75">
    Your order <strong>#${esc(order.order_no)}</strong> is still reserved.
    Please call, text, or email us so we can help arrange another market pickup.
  </p>
  <div style="margin-top:18px;padding:15px;border-radius:8px;background:#FFF8DF;color:#4A3313;font-size:14px;line-height:1.7">
    <strong>Market pickup policy:</strong> We hold an order after the first missed pickup.
    After a second missed pickup, the honey is returned to inventory and a new order must be submitted.
  </div>`
);

const secondNoShowEmail = (order) => shell(
  "Sorry we missed you again",
  `This was the second missed pickup for order #${esc(order.order_no)}.`,
  `<p style="margin:0;color:#111;font-size:15px;line-height:1.75">
    In accordance with our market pickup policy, the honey from this order has now been
    returned to inventory. When you are ready, please submit a new order for an available market date.
  </p>
  <div style="margin-top:18px;padding:15px;border-radius:8px;background:#FFF8DF;color:#4A3313;font-size:14px;line-height:1.7">
    We understand that plans change. Contact us with any questions and we will be happy to help.
  </div>`
);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in." }, 401);

  const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: authData, error: authError } = await service.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "Your session has expired." }, 401);

  const { data: admin } = await service
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!admin) return json({ error: "Admin access required." }, 403);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid request." }, 400); }

  const orderId = String(body.orderId || "");
  const action = body.action === "picked_up" ? "picked_up" : body.action === "no_show" ? "no_show" : "";
  if (!orderId || !action) return json({ error: "Order and action are required." }, 400);

  const { data: order, error: orderError } = await service
    .from("orders")
    .select("*, market_dates(day, venues(name, hours)), customers(flagged, consecutive_noshows)")
    .eq("id", orderId)
    .single();

  if (orderError || !order) return json({ error: "Market order not found." }, 404);
  if (order.method !== "market") return json({ error: "This is not a market pickup order." }, 400);

  const { data: result, error: actionError } = await service.rpc("admin_market_order_action", {
    p_order_id: orderId,
    p_action: action,
    p_admin_user: user.id,
  });

  if (actionError) return json({ error: actionError.message }, 400);

  if (action === "no_show" && order.email) {
    const count = Number(result?.no_show_count || 1);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailResult = await resend.emails.send({
      from: FROM,
      to: order.email,
      subject: count >= 2
        ? `NectarFusions order #${order.order_no} — pickup update`
        : `We missed you at the market — order #${order.order_no}`,
      html: count >= 2 ? secondNoShowEmail(order) : firstNoShowEmail(order),
    });

    if (emailResult?.error) {
      console.error("No-show email error:", emailResult.error);
      return json({ ok: true, ...result, warning: "Order updated, but the email could not be sent." });
    }
  }

  return json({ ok: true, ...result });
};
