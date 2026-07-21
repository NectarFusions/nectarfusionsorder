import { createClient } from "@supabase/supabase-js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
    },
  });

const normalizeNumber = (value) =>
  String(value ?? "")
    .replace(/^#/, "")
    .trim();

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || {} : value || {};

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
      "Customer subscription lookup failed:",
      error.message
    );

    return json(
      {
        error:
          "Your Honey Club membership could not be loaded.",
      },
      500
    );
  }

  if (!subscription) {
    return json(
      {
        error:
          "This Honey Club link could not be found.",
      },
      404
    );
  }

  const customer = relationRow(subscription.customers);
  const plan = relationRow(subscription.plans);

  const {
    data: cancellationRequests,
    error: requestError,
  } = await supabase
    .from("customer_requests")
    .select(
      "status, order_or_subscription_no, created_at"
    )
    .eq(
      "request_kind",
      "continue_with_cancellation"
    )
    .eq("account_kind", "subscription")
    .neq("status", "resolved")
    .order("created_at", { ascending: false })
    .limit(100);

  if (requestError) {
    console.error(
      "Cancellation request lookup failed:",
      requestError.message
    );

    return json(
      {
        error:
          "Your Honey Club membership could not be loaded.",
      },
      500
    );
  }

  const cancellationRequest =
    (cancellationRequests || []).find(
      (request) =>
        normalizeNumber(
          request.order_or_subscription_no
        ) === String(subscription.sub_no)
    );

  return json({
    ok: true,
    subscription: {
      subNo: subscription.sub_no,
      memberName: customer.name || "",
      planName:
        plan.name || "NectarFusions Honey Club",
      price:
        Number(plan.price_cents || 0) / 100,
      cadence: subscription.cadence,
      method: subscription.method,
      status: String(
        subscription.status || "pending"
      ).toLowerCase(),
      pausedUntil: subscription.paused_until,
      boxesSent: Number(
        subscription.boxes_sent || 0
      ),
      cancellationRequested:
        Boolean(cancellationRequest),
      cancellationRequestStatus:
        cancellationRequest?.status || null,
    },
  });
};
