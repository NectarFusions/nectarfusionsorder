import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const FROM =
  "NectarFusions <orders@nectar-fusions.com>";

const OWNER = "info@nectar-fusions.com";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    },
  });

const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
      })[character]
  );

const normalizeNumber = (value) =>
  String(value ?? "")
    .replace(/^#/, "")
    .trim();

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || {} : value || {};

const customerEmail = (subscription, customer) => `
<div style="background:#F5EFE7;padding:26px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E7DCC9">
    <div style="padding:25px 24px 20px;text-align:center;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#E69B00">
        Honey Club request received
      </div>
      <div style="font-size:31px;font-weight:700;color:#4A3313;margin-top:7px">
        Cancellation requested
      </div>
    </div>

    <div style="padding:22px 24px">
      <p style="font-size:15px;line-height:1.7;color:#111;margin:0">
        Hi ${esc(customer.name || "Honey Club member")}, we received your cancellation request for membership
        <strong>#${esc(subscription.sub_no)}</strong>.
      </p>

      <div style="margin-top:18px;padding:14px;background:#FFF3F3;border-radius:6px;color:#4A3313;line-height:1.65">
        Your membership has <strong>not been cancelled yet</strong>.
        NectarFusions will review the request and complete any billing change through Square.
      </div>
    </div>

    <div style="padding:16px 24px;border-top:1px solid #E7DCC9;text-align:center;font-size:12.5px;color:#7B5821;line-height:1.7">
      <strong style="color:#4A3313">NectarFusions</strong> · Coleman, Michigan<br>
      ${OWNER} · (989) 941-6385
    </div>
  </div>
</div>`;

const ownerEmail = (subscription, customer, plan) => `
<div style="background:#F5EFE7;padding:22px 14px;font-family:Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;border:2px solid #B83A3A;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid #E7DCC9">
      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;color:#B83A3A">
        HONEY CLUB CANCELLATION REQUEST
      </div>

      <div style="font-size:30px;font-weight:700;color:#4A3313;margin-top:5px">
        Membership #${esc(subscription.sub_no)}
      </div>

      <div style="font-size:15px;font-weight:600;color:#111;margin-top:5px">
        ${esc(customer.name || "Honey Club member")}
      </div>
    </div>

    <div style="padding:18px 22px;font-size:14px;color:#4A3313;line-height:1.75">
      <strong>Email:</strong> ${esc(customer.email)}<br>
      ${customer.phone ? `<strong>Phone:</strong> ${esc(customer.phone)}<br>` : ""}
      <strong>Plan:</strong> ${esc(plan.name || subscription.plan_id)}<br>
      <strong>Cadence:</strong> ${subscription.cadence === "2mo" ? "Every 2 months" : "Monthly"}<br>
      <strong>Method:</strong> ${esc(subscription.method || "")}

      <div style="margin-top:16px;padding:12px;background:#FFF3F3;border-radius:6px;color:#7B2525;line-height:1.55">
        Open the NectarFusions Admin area. The matching Honey Club membership is now flagged
        <strong>CANCELLATION REQUESTED</strong>.
      </div>
    </div>
  </div>
</div>`;

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let token;

  try {
    ({ token } = await req.json());
  } catch {
    return json(
      { error: "The Honey Club link is invalid." },
      400
    );
  }

  token = String(token || "").trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token
    )
  ) {
    return json(
      { error: "The Honey Club link is invalid." },
      400
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select("*, plans(*), customers(*)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error(
      "Cancellation subscription lookup failed:",
      error.message
    );

    return json(
      {
        error:
          "Your cancellation request could not be sent.",
      },
      500
    );
  }

  if (!subscription) {
    return json(
      {
        error:
          "This Honey Club membership could not be found.",
      },
      404
    );
  }

  if (subscription.status === "cancelled") {
    return json(
      {
        error:
          "This Honey Club membership is already cancelled.",
      },
      409
    );
  }

  const customer = relationRow(subscription.customers);
  const plan = relationRow(subscription.plans);

  if (!customer.email) {
    return json(
      {
        error:
          "This membership does not have a customer email address.",
      },
      500
    );
  }

  const {
    data: existingRequests,
    error: existingRequestError,
  } = await supabase
    .from("customer_requests")
    .select(
      "id, status, order_or_subscription_no, created_at"
    )
    .eq(
      "request_kind",
      "continue_with_cancellation"
    )
    .eq("account_kind", "subscription")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(100);

  if (existingRequestError) {
    console.error(
      "Existing cancellation request lookup failed:",
      existingRequestError.message
    );

    return json(
      {
        error:
          "Your cancellation request could not be sent.",
      },
      500
    );
  }

  const existingRequest =
    (existingRequests || []).find(
      (request) =>
        normalizeNumber(
          request.order_or_subscription_no
        ) === String(subscription.sub_no)
    );

  if (existingRequest) {
    return json({
      ok: true,
      alreadyRequested: true,
      requestStatus: existingRequest.status,
    });
  }

  const { data: saved, error: insertError } =
    await supabase
      .from("customer_requests")
      .insert({
        request_kind:
          "continue_with_cancellation",
        account_kind: "subscription",
        order_or_subscription_no: String(
          subscription.sub_no
        ),
        name:
          customer.name || "Honey Club member",
        email: String(customer.email)
          .trim()
          .toLowerCase(),
        phone: customer.phone || null,
        details:
          "Cancellation requested from the member's private Honey Club page.",
        status: "new",
      })
      .select("id")
      .single();

  if (insertError) {
    console.error(
      "Cancellation request insert failed:",
      insertError.message
    );

    return json(
      {
        error:
          "Your cancellation request could not be saved.",
      },
      500
    );
  }

  const resend = new Resend(
    process.env.RESEND_API_KEY
  );

  const jobs = [
    resend.emails.send({
      from: FROM,
      to: OWNER,
      replyTo: customer.email,
      subject:
        `Honey Club cancellation requested — #${subscription.sub_no} — ${customer.name || "Member"}`,
      html: ownerEmail(
        subscription,
        customer,
        plan
      ),
    }),

    resend.emails.send({
      from: FROM,
      to: customer.email,
      replyTo: OWNER,
      subject:
        "We received your Honey Club cancellation request",
      html: customerEmail(
        subscription,
        customer
      ),
    }),
  ];

  const results = await Promise.allSettled(jobs);

  const failed = results.filter(
    (result) =>
      result.status === "rejected" ||
      result.value?.error
  );

  if (failed.length) {
    console.error(
      "Cancellation request email failures:",
      JSON.stringify(failed)
    );

    return json({
      ok: true,
      id: saved.id,
      requestStatus: "new",
      emailWarning: true,
    });
  }

  return json({
    ok: true,
    id: saved.id,
    requestStatus: "new",
  });
};
