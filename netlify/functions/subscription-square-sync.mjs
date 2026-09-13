import { createClient } from "@supabase/supabase-js";
import { square, db, ok, bad } from "./_square.mjs";

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const asUser = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY
  );

  const { data, error } =
    await asUser.auth.getUser(token);

  if (error || !data?.user) return null;

  const { data: admin } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return admin ? data.user : null;
}

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || {} : value || {};

const localStatus = (squareStatus) => {
  const map = {
    ACTIVE: "active",
    PENDING: "pending",
    PAUSED: "paused",
    CANCELED: "cancelled",
    DEACTIVATED: "cancelled",
  };

  return map[String(squareStatus || "").toUpperCase()] || "pending";
};

export default async (req) => {
  if (req.method !== "POST") {
    return bad("POST only", 405);
  }

  const admin = await requireAdmin(req);

  if (!admin) {
    return bad("Admin access is required.", 403);
  }

  let subId;

  try {
    ({ subId } = await req.json());
  } catch {
    return bad("Bad JSON");
  }

  if (!subId) {
    return bad("Subscription ID is required.");
  }

  const supa = db();

  const { data: row, error: rowError } =
    await supa
      .from("subscriptions")
      .select(
        "*, customers(name,email), " +
        "plans!subscriptions_plan_id_fkey(" +
        "id,name,square_var_1mo,square_var_2mo)"
      )
      .eq("id", subId)
      .single();

  if (rowError || !row) {
    return bad("Subscription not found.", 404);
  }

  if (row.method !== "delivery") {
    return bad(
      "Square card synchronization only applies to Home Delivery memberships.",
      409
    );
  }

  const customer = relationRow(row.customers);
  const plan = relationRow(row.plans);

  const expectedVariation =
    row.cadence === "1mo"
      ? plan.square_var_1mo
      : plan.square_var_2mo;

  if (!expectedVariation) {
    return bad(
      "This Honey Club plan does not have a Square variation configured.",
      409
    );
  }

  let matchedSubscription = null;

  // -------------------------------------------------------
  // If we already know the Square subscription, refresh it.
  // -------------------------------------------------------
  if (row.square_subscription_id) {
    try {
      const detail = await square(
        `/v2/subscriptions/${row.square_subscription_id}?include=actions`,
        { method: "GET" }
      );

      matchedSubscription = detail.subscription || null;
    } catch (error) {
      console.error(
        "Existing Square subscription refresh failed:",
        error.message
      );
    }
  }

  // -------------------------------------------------------
  // Otherwise, recover a missed webhook using exact email.
  // -------------------------------------------------------
  if (!matchedSubscription) {
    const email = String(customer.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return bad(
        "This membership does not have an email address to match with Square.",
        409
      );
    }

    const customerSearch = await square(
      "/v2/customers/search",
      {
        body: {
          query: {
            filter: {
              email_address: {
                exact: email,
              },
            },
          },
          limit: 100,
        },
      }
    );

    const squareCustomers =
      customerSearch.customers || [];

    if (!squareCustomers.length) {
      return ok({
        synced: false,
        state: "not_found",
        message:
          "Square does not currently show a customer profile matching this membership email.",
      });
    }

    const matches = [];

    for (const squareCustomer of squareCustomers) {
      const result = await square(
        "/v2/subscriptions/search",
        {
          body: {
            query: {
              filter: {
                customer_ids: [
                  squareCustomer.id,
                ],
              },
            },
            limit: 100,
          },
        }
      );

      for (const subscription of result.subscriptions || []) {
        if (
          subscription.plan_variation_id !== expectedVariation
        ) {
          continue;
        }

        const localStarted =
          new Date(row.started_at).getTime();

        const squareCreated =
          subscription.created_at
            ? new Date(subscription.created_at).getTime()
            : NaN;

        // Never attach an old membership for the same customer.
        // Allow a small amount of clock/event timing tolerance.
        if (
          Number.isFinite(squareCreated) &&
          squareCreated <
            localStarted - 24 * 60 * 60 * 1000
        ) {
          continue;
        }

        matches.push(subscription);
      }
    }

    // Newest matching enrollment is the safest candidate.
    matches.sort(
      (a, b) =>
        new Date(b.created_at || 0) -
        new Date(a.created_at || 0)
    );

    matchedSubscription = matches[0] || null;
  }

  if (!matchedSubscription) {
    return ok({
      synced: false,
      state: "not_found",
      message:
        "No recent Square subscription matching this Honey Club plan was found yet.",
    });
  }

  const squareState = String(
    matchedSubscription.status || ""
  ).toUpperCase();

  const status = localStatus(squareState);

  const patch = {
    square_customer_id:
      matchedSubscription.customer_id ||
      row.square_customer_id ||
      null,

    square_subscription_id:
      matchedSubscription.id,

    square_plan_variation_id:
      matchedSubscription.plan_variation_id,

    status,

    billing_mode:
      squareState === "ACTIVE"
        ? "card"
        : row.billing_mode,
  };

  if (matchedSubscription.card_id) {
    patch.saved_square_card_id =
      matchedSubscription.card_id;
  }

  const { error: updateError } =
    await supa
      .from("subscriptions")
      .update(patch)
      .eq("id", row.id);

  if (updateError) {
    return bad(updateError.message, 500);
  }

  return ok({
    synced: true,
    state: status,
    squareStatus: squareState,
    squareSubscriptionId:
      matchedSubscription.id,
    message:
      status === "active"
        ? "Square confirmed this Honey Club membership is active."
        : `Square found the membership and currently reports ${squareState || "PENDING"}.`,
  });
};
