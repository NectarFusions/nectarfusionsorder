import { createHash } from "node:crypto";
import { square, db, ok, bad } from "./_square.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || {} : value || {};

const stableKey = (prefix, ...parts) =>
  `${prefix}-${createHash("sha256")
    .update(parts.map((part) => String(part || "")).join("|"))
    .digest("hex")
    .slice(0, 32)}`.slice(0, 45);

const splitName = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    givenName: parts[0] || "",
    familyName: parts.slice(1).join(" "),
  };
};

async function subscriptionByToken(token) {
  const supa = db();

  const { data, error } = await supa
    .from("subscriptions")
    .select(
      "*, plans!subscriptions_plan_id_fkey(*), customers(*)"
    )
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

function validatePrepaidSetup(s) {
  if (!s) return "Subscription not found.";

  if (s.status === "cancelled") {
    return "This Honey Club membership is cancelled.";
  }

  if (s.method !== "delivery") {
    return "Recurring card setup is only available for Home Delivery.";
  }

  if (s.square_subscription_id) {
    return null;
  }

  if (s.billing_mode !== "card_setup_required") {
    return "This membership is not waiting for recurring card setup.";
  }

  if (!s.prepaid_first_box_plan_id || Number(s.boxes_sent || 0) !== 1) {
    return "The already-paid first box has not been recorded yet.";
  }

  if (!s.recurring_start_date) {
    return "The next recurring billing date has not been scheduled.";
  }

  if (s.recurring_start_date <= localDate()) {
    return "The scheduled recurring billing date is no longer in the future.";
  }

  if (
    !s.terms_accepted_at ||
    !s.terms_version ||
    !s.address ||
    !s.delivery_zip ||
    !s.delivery_location_type ||
    !s.preferred_contact_method
  ) {
    return "Complete the Honey Club delivery details before card setup.";
  }

  return null;
}

function variationForSubscription(s) {
  const plan = relationRow(s.plans);
  return s.cadence === "1mo"
    ? plan.square_var_1mo
    : plan.square_var_2mo;
}

async function searchSquareCustomers(filter) {
  const result = await square("/v2/customers/search", {
    method: "POST",
    body: {
      query: { filter },
      limit: 10,
    },
  });

  return (result.customers || []).filter(
    (candidate) => candidate?.id && !candidate?.is_deleted
  );
}

async function findOrCreateSquareCustomer(s) {
  if (s.square_customer_id) return s.square_customer_id;

  const customer = relationRow(s.customers);
  const email = String(customer.email || "").trim();
  const referenceId = `honey-club:${s.id}`;

  const referenceMatches = await searchSquareCustomers({
    reference_id: {
      exact: referenceId,
    },
  });

  if (referenceMatches.length > 1) {
    throw new Error(
      "More than one Square customer profile is linked to this Honey Club membership. Card setup was stopped for review."
    );
  }

  if (referenceMatches.length === 1) {
    return referenceMatches[0].id;
  }

  if (email) {
    const emailMatches = await searchSquareCustomers({
      email_address: {
        exact: email,
      },
    });

    if (emailMatches.length > 1) {
      throw new Error(
        "More than one Square customer profile matches this email. Card setup was stopped to prevent linking the wrong customer."
      );
    }

    if (emailMatches.length === 1) {
      return emailMatches[0].id;
    }
  }

  const { givenName, familyName } = splitName(customer.name);

  const created = await square("/v2/customers", {
    method: "POST",
    body: {
      idempotency_key: stableKey("nf-customer", s.id),
      ...(givenName ? { given_name: givenName } : {}),
      ...(familyName ? { family_name: familyName } : {}),
      ...(email ? { email_address: email } : {}),
      ...(customer.phone
        ? { phone_number: String(customer.phone).trim() }
        : {}),
      reference_id: referenceId,
    },
  });

  if (!created.customer?.id) {
    throw new Error("Square did not create the customer profile.");
  }

  return created.customer.id;
}

async function honeyClubVariationIds(supa) {
  const { data, error } = await supa
    .from("plans")
    .select("square_var_1mo, square_var_2mo")
    .in("id", ["taster", "signature", "hive", "apiary"]);

  if (error) throw new Error(error.message);

  return new Set(
    (data || [])
      .flatMap((plan) => [
        plan.square_var_1mo,
        plan.square_var_2mo,
      ])
      .filter(Boolean)
  );
}

async function findExistingHoneyClubSubscriptions(
  supa,
  customerId
) {
  const locationId = process.env.SQUARE_LOCATION_ID;

  if (!locationId) {
    throw new Error("Square Location ID is not configured.");
  }

  const variationIds = await honeyClubVariationIds(supa);
  const billableStatuses = new Set([
    "PENDING",
    "ACTIVE",
    "PAUSED",
  ]);

  const matches = [];
  let cursor = null;
  let pageCount = 0;

  do {
    const body = {
      query: {
        filter: {
          location_ids: [locationId],
          customer_ids: [customerId],
        },
      },
    };

    if (cursor) body.cursor = cursor;

    const result = await square(
      "/v2/subscriptions/search",
      {
        method: "POST",
        body,
      }
    );

    for (const subscription of result.subscriptions || []) {
      const status = String(
        subscription?.status || ""
      ).toUpperCase();

      if (
        subscription?.id &&
        variationIds.has(subscription.plan_variation_id) &&
        billableStatuses.has(status)
      ) {
        matches.push(subscription);
      }
    }

    cursor = result.cursor || null;
    pageCount += 1;
  } while (cursor && pageCount < 10);

  if (cursor) {
    throw new Error(
      "Square subscription history could not be fully verified. Card setup was stopped for review."
    );
  }

  return [
    ...new Map(
      matches.map((subscription) => [
        subscription.id,
        subscription,
      ])
    ).values(),
  ];
}

async function saveCustomerAndCard(supa, subscriptionId, customerId, cardId) {
  const { error } = await supa
    .from("subscriptions")
    .update({
      square_customer_id: customerId,
      saved_square_card_id: cardId,
      square_checkout_url: null,
      square_checkout_link_id: null,
    })
    .eq("id", subscriptionId);

  if (error) throw new Error(error.message);
}

async function findPreviouslyStoredSetupCard(
  s,
  customerId
) {
  const referenceId = `honey-club:${s.id}`;
  const cards = [];
  let cursor = null;
  let pageCount = 0;

  do {
    const params = new URLSearchParams({
      customer_id: customerId,
      reference_id: referenceId,
      include_disabled: "false",
    });

    if (cursor) params.set("cursor", cursor);

    const result = await square(
      `/v2/cards?${params.toString()}`,
      {
        method: "GET",
      }
    );

    for (const card of result.cards || []) {
      if (
        card?.id &&
        card.enabled !== false &&
        card.customer_id === customerId &&
        card.reference_id === referenceId
      ) {
        cards.push(card);
      }
    }

    cursor = result.cursor || null;
    pageCount += 1;
  } while (cursor && pageCount < 10);

  if (cursor) {
    throw new Error(
      "Stored-card history could not be fully verified. Card setup was stopped for review."
    );
  }

  const uniqueCards = [
    ...new Map(
      cards.map((card) => [card.id, card])
    ).values(),
  ];

  if (uniqueCards.length > 1) {
    throw new Error(
      "More than one stored card is linked to this Honey Club setup. Card setup was stopped for review."
    );
  }

  return uniqueCards[0]?.id || null;
}

async function createStoredCard(s, customerId, sourceId) {
  const customer = relationRow(s.customers);

  const result = await square("/v2/cards", {
    method: "POST",
    body: {
      idempotency_key: stableKey("nf-card", s.id, sourceId),
      source_id: sourceId,
      card: {
        customer_id: customerId,
        ...(customer.name
          ? { cardholder_name: String(customer.name).trim() }
          : {}),
        reference_id: `honey-club:${s.id}`,
      },
    },
  });

  if (!result.card?.id) {
    throw new Error("Square did not store the card.");
  }

  return result.card.id;
}

async function createFutureSubscription(s, customerId, cardId) {
  const variationId = variationForSubscription(s);

  if (!variationId) {
    throw new Error(
      "The selected Honey Club plan is missing its Square billing variation."
    );
  }

  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    throw new Error("Square Location ID is not configured.");
  }

  const result = await square("/v2/subscriptions", {
    method: "POST",
    body: {
      idempotency_key: stableKey(
        "nf-sub",
        s.id,
        variationId,
        s.recurring_start_date
      ),
      location_id: locationId,
      customer_id: customerId,
      plan_variation_id: variationId,
      card_id: cardId,
      start_date: s.recurring_start_date,
    },
  });

  if (!result.subscription?.id) {
    throw new Error("Square did not create the recurring subscription.");
  }

  return result.subscription;
}

async function saveSquareSubscription(supa, s, squareSubscription) {
  const squareStatus = String(squareSubscription.status || "").toUpperCase();
  const nextStatus = squareStatus === "ACTIVE" ? "active" : "pending";

  const { error } = await supa
    .from("subscriptions")
    .update({
      square_subscription_id: squareSubscription.id,
      square_customer_id:
        squareSubscription.customer_id || s.square_customer_id || null,
      saved_square_card_id:
        squareSubscription.card_id || s.saved_square_card_id || null,
      square_plan_variation_id:
        squareSubscription.plan_variation_id ||
        variationForSubscription(s),
      square_checkout_url: null,
      square_checkout_link_id: null,
      billing_mode: "card",
      status: nextStatus,
    })
    .eq("id", s.id);

  if (error) {
    throw new Error(
      "Square created the recurring subscription, but NectarFusions could not save it yet. Retrying this setup will safely recover the existing future subscription instead of creating another one."
    );
  }
}

function publicConfig(s) {
  const customer = relationRow(s.customers);
  const plan = relationRow(s.plans);
  const { givenName, familyName } = splitName(customer.name);

  const applicationId =
    process.env.SQUARE_APPLICATION_ID ||
    process.env.SQUARE_APP_ID ||
    "";

  const locationId = process.env.SQUARE_LOCATION_ID || "";

  if (!applicationId || !locationId) {
    throw new Error(
      "Square secure card setup is not fully configured."
    );
  }

  return {
    applicationId,
    locationId,
    squareJsUrl:
      process.env.SQUARE_ENV === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js",
    recurringStartDate: s.recurring_start_date,
    planName: plan.name || "NectarFusions Honey Club",
    cadence: s.cadence,
    hasSavedCard: Boolean(s.saved_square_card_id),
    billingContact: {
      givenName,
      familyName,
      email: customer.email || "",
      phone: customer.phone || "",
      addressLines: s.address ? [s.address] : [],
      postalCode: s.delivery_zip || "",
      countryCode: "US",
    },
  };
}

export default async (req) => {
  try {
    if (req.method !== "POST") return bad("POST only", 405);

    let body;
    try {
      body = await req.json();
    } catch {
      return bad("Bad JSON");
    }

    const token = String(body?.token || "").trim();
    if (!UUID_RE.test(token)) {
      return bad("The Honey Club link is invalid.");
    }

    const action = String(body?.action || "config");
    const s = await subscriptionByToken(token);

    if (!s) return bad("Subscription not found.", 404);

    if (s.square_subscription_id) {
      return ok({
        ok: true,
        setupComplete: true,
        recurringStartDate: s.recurring_start_date || null,
      });
    }

    const validationError = validatePrepaidSetup(s);
    if (validationError) return bad(validationError, 409);

    if (action === "config") {
      return ok({
        ok: true,
        setupComplete: false,
        ...publicConfig(s),
      });
    }

    if (action !== "complete") {
      return bad("Unknown action.");
    }

    if (body?.authorizationConfirmed !== true) {
      return bad(
        "Confirm authorization for recurring Honey Club card billing before completing setup."
      );
    }

    const supa = db();
    let customerId = s.square_customer_id || null;
    let cardId = s.saved_square_card_id || null;

    if (!customerId) {
      customerId = await findOrCreateSquareCustomer(s);

      const { error: customerSaveError } = await supa
        .from("subscriptions")
        .update({
          square_customer_id: customerId,
        })
        .eq("id", s.id);

      if (customerSaveError) {
        throw new Error(customerSaveError.message);
      }
    }

    const existingHoneyClubSubscriptions =
      await findExistingHoneyClubSubscriptions(
        supa,
        customerId
      );

    if (existingHoneyClubSubscriptions.length > 0) {
      const expectedVariationId =
        variationForSubscription(s);

      const recoverable = existingHoneyClubSubscriptions.filter(
        (subscription) =>
          String(subscription.status || "").toUpperCase() ===
            "PENDING" &&
          subscription.plan_variation_id ===
            expectedVariationId &&
          subscription.start_date ===
            s.recurring_start_date
      );

      if (
        existingHoneyClubSubscriptions.length === 1 &&
        recoverable.length === 1
      ) {
        await saveSquareSubscription(
          supa,
          s,
          recoverable[0]
        );

        return ok({
          ok: true,
          setupComplete: true,
          recurringStartDate: s.recurring_start_date,
          message: `Secure card setup is complete. Recurring Honey Club billing begins ${s.recurring_start_date}.`,
        });
      }

      return bad(
        "Square already has a pending, active, or paused Honey Club subscription for this customer that does not exactly match this scheduled setup. Secure card setup was stopped to prevent duplicate recurring billing.",
        409
      );
    }

    if (!cardId) {
      cardId = await findPreviouslyStoredSetupCard(
        s,
        customerId
      );

      if (cardId) {
        await saveCustomerAndCard(
          supa,
          s.id,
          customerId,
          cardId
        );
      }
    }

    if (!cardId) {
      const sourceId = String(body?.sourceId || "").trim();

      if (!sourceId) {
        return bad(
          "Secure card token is required to finish card setup."
        );
      }

      if (sourceId.length > 16384) {
        return bad("Secure card token is invalid.");
      }

      cardId = await createStoredCard(
        s,
        customerId,
        sourceId
      );

      await saveCustomerAndCard(
        supa,
        s.id,
        customerId,
        cardId
      );
    }

    const refreshed = await subscriptionByToken(token);
    if (!refreshed) {
      throw new Error("Subscription could not be reloaded.");
    }

    if (refreshed.square_subscription_id) {
      return ok({
        ok: true,
        setupComplete: true,
        recurringStartDate: refreshed.recurring_start_date,
      });
    }

    const futureSubscription = await createFutureSubscription(
      refreshed,
      customerId,
      cardId
    );

    const squareStatus = String(
      futureSubscription.status || ""
    ).toUpperCase();

    if (
      squareStatus !== "PENDING" ||
      futureSubscription.start_date !==
        refreshed.recurring_start_date
    ) {
      console.error(
        "CRITICAL: Square returned unexpected future subscription state.",
        {
          subscriptionStatus: squareStatus,
          expectedStartDate: refreshed.recurring_start_date,
          actualStartDate: futureSubscription.start_date || null,
        }
      );

      await saveSquareSubscription(
        supa,
        refreshed,
        futureSubscription
      );

      return bad(
        "Square created a recurring billing record, but its schedule did not exactly match the expected future-start setup. The record was saved so another subscription cannot be created, and the membership needs review.",
        502
      );
    }

    await saveSquareSubscription(
      supa,
      refreshed,
      futureSubscription
    );

    return ok({
      ok: true,
      setupComplete: true,
      recurringStartDate: refreshed.recurring_start_date,
      message: `Secure card setup is complete. Recurring Honey Club billing begins ${refreshed.recurring_start_date}.`,
    });
  } catch (error) {
    console.error("subscription-card-setup failed:", error);

    return bad(
      error?.message ||
        "Secure Honey Club card setup could not be completed.",
      500
    );
  }
};
