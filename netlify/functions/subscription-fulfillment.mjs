import { createClient } from "@supabase/supabase-js";
import { square, db, site, ok, bad } from "./_square.mjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMS_VERSION = "honey-club-2026-09";
const DELIVERY_LOCATION_TYPES = new Set([
  "house",
  "apartment_condo",
  "business",
  "other",
]);
const CONTACT_METHODS = new Set(["text", "call", "email"]);

const clean = (value, max = 5000) => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new Error("One of the submitted fields is too long.");
  return text;
};

const relationRow = (value) =>
  Array.isArray(value) ? value[0] || {} : value || {};

const variationForPlan = (plan, cadence) =>
  cadence === "1mo" ? plan?.square_var_1mo : plan?.square_var_2mo;

const addDays = (iso, days) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const localDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Detroit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const asUser = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await asUser.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: adminRow, error: adminError } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError || !adminRow) return null;
  return data.user;
}

async function upcomingMarkets(supa) {
  const { data, error } = await supa
    .from("market_dates")
    .select("id, day, active, where_at, hours, venues(name, where_at, hours)")
    .gte("day", localDate())
    .eq("active", true)
    .order("day", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((market) => {
    const venue = relationRow(market.venues);
    return {
      id: market.id,
      day: market.day,
      name: venue.name || "NectarFusions Market",
      whereAt: market.where_at ?? venue.where_at ?? "",
      hours: market.hours ?? venue.hours ?? "",
    };
  });
}

async function deliveryZoneForZip(supa, zip) {
  const { data, error } = await supa
    .from("zones")
    .select("id, name, zips")
    .contains("zips", [zip]);

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

async function subscriptionByToken(supa, token) {
  const { data, error } = await supa
    .from("subscriptions")
    .select("*, plans!subscriptions_plan_id_fkey(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function subscriptionById(supa, id) {
  const { data, error } = await supa
    .from("subscriptions")
    .select("*, plans!subscriptions_plan_id_fkey(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function planById(supa, id) {
  const { data, error } = await supa
    .from("plans")
    .select("id, name, price_cents, square_var_1mo, square_var_2mo")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function recordPlanChangeEvent(supa, values) {
  const { error } = await supa
    .from("subscription_plan_change_events")
    .insert(values);

  if (error) {
    console.error("Could not record subscription plan change audit event:", error);
  }
}

async function createSquareSubscription({
  customerId,
  locationId,
  cardId,
  variationId,
  startDate,
  idempotencyKey,
}) {
  const result = await square("/v2/subscriptions", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      location_id: locationId,
      customer_id: customerId,
      plan_variation_id: variationId,
      card_id: cardId,
      ...(startDate ? { start_date: startDate } : {}),
    },
  });

  if (!result.subscription?.id) {
    throw new Error("Square did not create the replacement subscription.");
  }

  return result.subscription;
}

function selectedMarket(s) {
  const market = relationRow(s.market_dates);
  const venue = relationRow(market.venues);
  if (!market.id) return null;

  return {
    id: market.id,
    day: market.day,
    name: venue.name || "NectarFusions Market",
    whereAt: market.where_at ?? venue.where_at ?? "",
    hours: market.hours ?? venue.hours ?? "",
  };
}

function serializeSubscription(s, { admin = false } = {}) {
  const plan = relationRow(s.plans);
  const customer = relationRow(s.customers);

  const status =
    s.billing_mode === "market_manual" && s.status === "paused"
      ? "active"
      : String(s.status || "pending").toLowerCase();

  const base = {
    subNo: s.sub_no,
    memberName: customer.name || "",
    planId: s.plan_id,
    planName: plan.name || "NectarFusions Honey Club",
    price: Number(plan.price_cents || 0) / 100,
    cadence: s.cadence,
    method: s.method,
    status,
    billingMode: s.billing_mode || (s.square_subscription_id ? "card" : "card_setup_required"),
    boxesSent: Number(s.boxes_sent || 0),
    bonusEvery: Math.max(Number(plan.bonus_every || 3), 1),
    address: s.address || "",
    deliveryZip: s.delivery_zip || "",
    deliveryLocationType: s.delivery_location_type || "",
    buildingDetails: s.building_details || "",
    gateCode: s.gate_code || "",
    deliveryNotes: s.delivery_notes || "",
    temporaryDeliveryNotes: s.temporary_delivery_notes || "",
    preferredContactMethod: s.preferred_contact_method || "",
    preferredDeliveryTiming: s.preferred_delivery_timing || "",
    marketDateId: s.market_date_id || "",
    selectedMarket: selectedMarket(s),
    isGift: Boolean(s.is_gift),
    recipientName: s.recipient_name || "",
    giftMessage: s.gift_message || "",
    termsAcceptedAt: s.terms_accepted_at || null,
    termsVersion: s.terms_version || null,
    fulfillmentUpdatedAt: s.fulfillment_updated_at || null,
    pendingPlanId: s.pending_plan_id || null,
    pendingCadence: s.pending_cadence || null,
    planChangeEffectiveDate: s.plan_change_effective_date || null,
    planChangeStatus: s.plan_change_status || null,
    planChangeRequestedAt: s.plan_change_requested_at || null,
    prepaidFirstBoxPlanId: s.prepaid_first_box_plan_id || null,
    prepaidFirstBoxCadence: s.prepaid_first_box_cadence || null,
    prepaidFirstBoxPaidAt: s.prepaid_first_box_paid_at || null,
    prepaidFirstBoxRecordedAt: s.prepaid_first_box_recorded_at || null,
    recurringStartDate: s.recurring_start_date || null,
    hasPrepaidFirstBox: Boolean(s.prepaid_first_box_plan_id),
    needsCardSetup:
      s.method === "delivery" &&
      (!s.square_subscription_id || s.billing_mode === "card_setup_required"),
  };

  if (admin) {
    return {
      ...base,
      id: s.id,
      email: customer.email || "",
      phone: customer.phone || "",
      token: s.token,
      customerSettingsUrl: `${site()}/club/${s.token}/fulfillment?setup=1`,
      hasSquareSubscription: Boolean(s.square_subscription_id),
    };
  }

  return base;
}

async function squareSubscriptionDetail(squareSubscriptionId) {
  if (!squareSubscriptionId) return null;
  const detail = await square(
    `/v2/subscriptions/${squareSubscriptionId}?include=actions`,
    { method: "GET" }
  );
  return {
    subscription: detail.subscription || null,
    actions: detail.subscription?.actions || detail.actions || [],
  };
}

async function deleteAction(squareSubscriptionId, actionId) {
  if (!squareSubscriptionId || !actionId) return;
  await square(
    `/v2/subscriptions/${squareSubscriptionId}/actions/${actionId}`,
    { method: "DELETE" }
  );
}

async function deleteSavedCheckoutLink(s) {
  if (!s?.square_checkout_url && !s?.square_checkout_link_id) return;

  if (s.square_checkout_link_id) {
    await square(
      `/v2/online-checkout/payment-links/${s.square_checkout_link_id}`,
      { method: "DELETE" }
    );
    return;
  }

  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const query = cursor
      ? `?limit=100&cursor=${encodeURIComponent(cursor)}`
      : "?limit=100";
    const result = await square(
      `/v2/online-checkout/payment-links${query}`,
      { method: "GET" }
    );

    const match = (result.payment_links || []).find(
      (link) =>
        link.url === s.square_checkout_url ||
        link.long_url === s.square_checkout_url
    );

    if (match?.id) {
      await square(`/v2/online-checkout/payment-links/${match.id}`, {
        method: "DELETE",
      });
      return;
    }

    cursor = result.cursor || null;
    if (!cursor) return;
  }

  throw new Error(
    "The prior Square setup link could not be safely verified. No subscription change was made."
  );
}

async function prepareMarketBilling(s) {
  if (!s.square_subscription_id) {
    return { billingMode: "market_manual", pauseActionId: null };
  }

  const detail = await squareSubscriptionDetail(s.square_subscription_id);
  const sq = detail?.subscription;
  const actions = detail?.actions || [];

  if (actions.some((action) => action.type === "CANCEL")) {
    throw new Error(
      "Square already has a cancellation scheduled for this membership. Resolve that cancellation before changing fulfillment."
    );
  }

  const status = String(sq?.status || "").toUpperCase();

  if (["CANCELED", "COMPLETED"].includes(status)) {
    throw new Error("This Square subscription is no longer active.");
  }

  // If a one-cycle skip is already scheduled, Square already has the PAUSE
  // we need. Remove only its automatic RESUME so that PAUSE becomes indefinite
  // while the member remains on Market Pickup.
  if (status === "ACTIVE") {
    const existingPause =
      actions.find((action) => action.type === "PAUSE") || null;

    if (existingPause) {
      for (const action of actions) {
        if (action.type === "RESUME") {
          await deleteAction(s.square_subscription_id, action.id);
        }
      }

      return {
        billingMode: "market_manual",
        pauseActionId: existingPause.id,
      };
    }

    // A RESUME without a PAUSE should not normally exist, but remove any stale
    // resume action before creating the new indefinite market pause.
    for (const action of actions) {
      if (action.type === "RESUME") {
        await deleteAction(s.square_subscription_id, action.id);
      }
    }

    const result = await square(
      `/v2/subscriptions/${s.square_subscription_id}/pause`,
      {
        method: "POST",
        body: {
          pause_reason:
            "Honey Club member switched fulfillment to market pickup and will pay at pickup.",
        },
      }
    );

    const pauseAction =
      (result.actions || []).find((action) => action.type === "PAUSE") || null;

    if (!pauseAction?.id) {
      throw new Error(
        "Square did not confirm that future recurring billing was paused."
      );
    }

    return {
      billingMode: "market_manual",
      pauseActionId: pauseAction.id,
    };
  }

  if (["PAUSED", "DEACTIVATED"].includes(status)) {
    // If this pause/deactivation has an automatic resume, remove the resume so
    // market billing remains manual until the member changes it back.
    for (const action of actions) {
      if (action.type === "RESUME") {
        await deleteAction(s.square_subscription_id, action.id);
      }
    }

    return {
      billingMode: "market_manual",
      pauseActionId:
        actions.find((action) => action.type === "PAUSE")?.id || null,
    };
  }

  throw new Error(
    `Square billing is currently ${status || "unavailable"} and cannot be safely switched to market pickup automatically.`
  );
}

async function prepareDeliveryBilling(s) {
  if (!s.square_subscription_id) {
    const plan = relationRow(s.plans);
    const variationId = variationForPlan(plan, s.cadence);

    if (
      s.saved_square_card_id &&
      s.square_customer_id &&
      variationId &&
      process.env.SQUARE_LOCATION_ID
    ) {
      const created = await createSquareSubscription({
        customerId: s.square_customer_id,
        locationId: process.env.SQUARE_LOCATION_ID,
        cardId: s.saved_square_card_id,
        variationId,
        startDate: localDate(),
        idempotencyKey: `delivery-restart-${s.id}-${variationId}-${localDate()}`,
      });

      return {
        billingMode: "card",
        pauseActionId: null,
        needsCardSetup: false,
        squareSubscriptionId: created.id,
        squarePlanVariationId: variationId,
      };
    }

    return {
      billingMode: "card_setup_required",
      pauseActionId: null,
      needsCardSetup: true,
    };
  }

  const detail = await squareSubscriptionDetail(s.square_subscription_id);
  const sq = detail?.subscription;
  const actions = detail?.actions || [];

  if (actions.some((action) => action.type === "CANCEL")) {
    throw new Error(
      "Square already has a cancellation scheduled for this membership. Resolve that cancellation before restarting recurring delivery billing."
    );
  }

  if (
    s.market_pause_action_id &&
    actions.some((action) => action.id === s.market_pause_action_id)
  ) {
    await deleteAction(s.square_subscription_id, s.market_pause_action_id);
  }

  const status = String(sq?.status || "").toUpperCase();

  if (["PAUSED", "DEACTIVATED"].includes(status)) {
    await square(`/v2/subscriptions/${s.square_subscription_id}/resume`, {
      method: "POST",
      body: {
        resume_effective_date: localDate(),
        resume_change_timing: "IMMEDIATE",
      },
    });
  } else if (status !== "ACTIVE") {
    throw new Error(
      `Square billing is currently ${status || "unavailable"} and cannot be safely resumed automatically.`
    );
  }

  return {
    billingMode: "card",
    pauseActionId: null,
    needsCardSetup: false,
  };
}

function buildFulfillmentPatch(body, targetMethod, zoneId, marketDateId) {
  const locationType = clean(body.deliveryLocationType, 100);
  const contactMethod = clean(body.preferredContactMethod, 100);
  const isGift = Boolean(body.isGift);

  if (
    locationType &&
    !DELIVERY_LOCATION_TYPES.has(locationType)
  ) {
    throw new Error("Choose a valid delivery location type.");
  }

  if (contactMethod && !CONTACT_METHODS.has(contactMethod)) {
    throw new Error("Choose a valid contact method.");
  }

  const patch = {
    method: targetMethod,
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
    fulfillment_updated_at: new Date().toISOString(),
  };

  if (targetMethod === "delivery") {
    const address = clean(body.address, 1000);
    const zip = clean(body.deliveryZip, 10);

    if (!address) throw new Error("Delivery address is required.");
    if (!/^[0-9]{5}$/.test(zip || "")) {
      throw new Error("Enter a valid five-digit delivery ZIP code.");
    }
    if (!locationType) {
      throw new Error("Choose the delivery location type.");
    }
    if (!contactMethod) {
      throw new Error("Choose how we should contact you about delivery problems.");
    }
    if (isGift && !clean(body.recipientName, 300)) {
      throw new Error("Recipient name is required for a gift delivery.");
    }

    Object.assign(patch, {
      zone_id: zoneId,
      address,
      delivery_zip: zip,
      delivery_location_type: locationType,
      building_details: clean(body.buildingDetails, 500),
      gate_code: clean(body.gateCode, 200),
      delivery_notes: clean(body.deliveryNotes, 1500),
      temporary_delivery_notes: clean(body.temporaryDeliveryNotes, 1500),
      preferred_contact_method: contactMethod,
      preferred_delivery_timing: clean(body.preferredDeliveryTiming, 500),
      market_date_id: null,
      is_gift: isGift,
      recipient_name: isGift ? clean(body.recipientName, 300) : null,
      gift_message: isGift ? clean(body.giftMessage, 1500) : null,
    });
  } else {
    Object.assign(patch, {
      market_date_id: marketDateId,
      // Deliberately preserve address, building, gate, contact, notes and gift
      // fields so switching back to delivery does not make the member retype.
    });
  }

  return patch;
}

async function handleUpdate(req, body) {
  const supa = db();
  const admin = await requireAdmin(req);
  const isAdminUpdate = Boolean(admin && body.subscriptionId);

  let s;
  if (isAdminUpdate) {
    if (!UUID_RE.test(String(body.subscriptionId || ""))) {
      return bad("Invalid subscription ID.");
    }
    s = await subscriptionById(supa, body.subscriptionId);
  } else {
    const token = String(body.token || "").trim();
    if (!UUID_RE.test(token)) return bad("The Honey Club link is invalid.");
    s = await subscriptionByToken(supa, token);
  }

  if (!s) return bad("Subscription not found.", 404);
  if (s.status === "cancelled") {
    return bad("Cancelled memberships cannot change fulfillment.", 409);
  }

  const targetMethod = String(body.method || "").trim();
  if (!["delivery", "market"].includes(targetMethod)) {
    return bad("Choose Home Delivery or Market Pickup.");
  }

  if (!body.termsAccepted) {
    return bad("Please acknowledge the Honey Club subscription terms.");
  }

  if (
    isAdminUpdate &&
    targetMethod === "delivery" &&
    s.method !== "delivery" &&
    !body.adminConfirmedAuthorization
  ) {
    return bad(
      "Confirm that the customer authorized the change to recurring Home Delivery billing."
    );
  }

  let zoneId = null;
  let marketDateId = null;

  if (targetMethod === "delivery") {
    const zip = clean(body.deliveryZip, 10);
    if (!/^[0-9]{5}$/.test(zip || "")) {
      return bad("Enter a valid five-digit delivery ZIP code.");
    }

    const zone = await deliveryZoneForZip(supa, zip);
    if (!zone) {
      return bad(
        "That ZIP code is outside the current NectarFusions local delivery area."
      );
    }
    zoneId = zone.id;
  } else {
    marketDateId = String(body.marketDateId || "").trim();
    if (!UUID_RE.test(marketDateId)) {
      return bad("Choose an available market pickup.");
    }

    const { data: market, error: marketError } = await supa
      .from("market_dates")
      .select("id")
      .eq("id", marketDateId)
      .eq("active", true)
      .gte("day", localDate())
      .maybeSingle();

    if (marketError) throw new Error(marketError.message);
    if (!market) return bad("That market pickup is no longer available.");
  }

  // Validate every submitted fulfillment field before touching Square.
  // This prevents recurring billing from being paused/resumed when the
  // fulfillment form itself would ultimately be rejected.
  const patch = buildFulfillmentPatch(
    body,
    targetMethod,
    zoneId,
    marketDateId
  );

  let billing = {
    billingMode:
      s.billing_mode ||
      (s.square_subscription_id ? "card" : "card_setup_required"),
    pauseActionId: s.market_pause_action_id || null,
    needsCardSetup: false,
  };

  const methodChanged = s.method !== targetMethod;

  if (
    targetMethod === "market" &&
    (methodChanged || s.billing_mode !== "market_manual")
  ) {
    billing = await prepareMarketBilling(s);
  } else if (
    targetMethod === "delivery" &&
    (methodChanged || s.billing_mode === "market_manual")
  ) {
    billing = await prepareDeliveryBilling(s);
  } else if (targetMethod === "delivery" && !s.square_subscription_id) {
    billing.billingMode = "card_setup_required";
    billing.needsCardSetup = true;
  } else if (targetMethod === "market") {
    billing.billingMode = "market_manual";
  }

  Object.assign(patch, {
    billing_mode: billing.billingMode,
    market_pause_action_id: billing.pauseActionId,
    fulfillment_updated_by: isAdminUpdate ? "admin" : "customer",
  });

  if (billing.squareSubscriptionId) {
    patch.square_subscription_id = billing.squareSubscriptionId;
  }
  if (billing.squarePlanVariationId) {
    patch.square_plan_variation_id = billing.squarePlanVariationId;
  }

  // Market memberships remain active locally even when Square reports PAUSED.
  if (targetMethod === "market" && s.status !== "cancelled") {
    patch.status = "active";
    patch.paused_until = null;
  }

  const { error: updateError } = await supa
    .from("subscriptions")
    .update(patch)
    .eq("id", s.id);

  if (updateError) {
    console.error("Fulfillment update failed after billing preparation:", updateError);
    throw new Error(
      "Billing was checked, but the fulfillment record could not be saved. Please contact NectarFusions before retrying."
    );
  }

  const updated = await subscriptionById(supa, s.id);

  return ok({
    ok: true,
    subscription: serializeSubscription(updated, { admin: isAdminUpdate }),
    needsCardSetup:
      targetMethod === "delivery" &&
      (!updated.square_subscription_id ||
        updated.billing_mode === "card_setup_required"),
    setupUrl:
      targetMethod === "delivery" &&
      (!updated.square_subscription_id ||
        updated.billing_mode === "card_setup_required")
        ? `${site()}/club/${updated.token}/fulfillment?setup=1`
        : null,
    message:
      targetMethod === "market"
        ? "Market Pickup is saved. Future recurring card billing is paused and this membership will be paid at pickup."
        : updated.square_subscription_id
          ? "Home Delivery is saved and recurring Square billing is active."
          : "Home Delivery is saved. Secure Square card setup is required before recurring delivery billing can begin.",
  });
}


async function handleAdminPlanChange(req, body) {
  const admin = await requireAdmin(req);
  if (!admin) return bad("Not an admin", 403);

  const subscriptionId = String(body.subscriptionId || "");
  if (!UUID_RE.test(subscriptionId)) return bad("Invalid subscription ID.");

  if (!body.adminConfirmedAuthorization) {
    return bad(
      "Confirm that the customer requested and authorized this subscription change."
    );
  }

  const targetPlanId = String(body.planId || "").trim();
  const targetCadence = String(body.cadence || "").trim();

  if (!["1mo", "2mo"].includes(targetCadence)) {
    return bad("Choose Monthly or Every 2 months.");
  }

  const supa = db();
  const [s, targetPlan] = await Promise.all([
    subscriptionById(supa, subscriptionId),
    planById(supa, targetPlanId),
  ]);

  if (!s) return bad("Subscription not found.", 404);
  if (!targetPlan) return bad("Choose a valid Honey Club plan.");
  if (s.status === "cancelled") {
    return bad("Cancelled memberships cannot change subscription plans.", 409);
  }
  if (s.plan_change_status === "scheduled" || s.pending_plan_id) {
    return bad(
      "This membership already has a subscription change scheduled.",
      409
    );
  }
  if (s.plan_id === targetPlanId && s.cadence === targetCadence) {
    return bad("That member is already on this subscription and cadence.");
  }

  const variationId = variationForPlan(targetPlan, targetCadence);
  if (!variationId) {
    return bad(
      "That Honey Club plan is missing its Square billing variation. No change was made.",
      500
    );
  }

  const requestedAt = new Date().toISOString();

  if (s.billing_mode === "market_manual") {
    await deleteSavedCheckoutLink(s);

    let savedCardId = s.saved_square_card_id || null;
    const oldSquareSubscriptionId = s.square_subscription_id || null;

    if (oldSquareSubscriptionId) {
      const detail = await squareSubscriptionDetail(oldSquareSubscriptionId);
      const sq = detail?.subscription;
      const actions = detail?.actions || [];

      if (actions.some((action) => action.type === "RESUME")) {
        return bad(
          "This Market Pickup membership still has an automatic Square resume scheduled. Remove that resume before changing the subscription tier.",
          409
        );
      }

      savedCardId = sq?.card_id || savedCardId;
    }

    const { error: updateError } = await supa
      .from("subscriptions")
      .update({
        plan_id: targetPlanId,
        cadence: targetCadence,
        square_subscription_id: null,
        square_checkout_url: null,
        square_checkout_link_id: null,
        square_plan_variation_id: variationId,
        saved_square_card_id: savedCardId,
        pending_plan_id: null,
        pending_cadence: null,
        plan_change_effective_date: null,
        plan_change_status: null,
        plan_change_requested_at: requestedAt,
        plan_change_requested_by: admin.id,
      })
      .eq("id", s.id);

    if (updateError) throw new Error(updateError.message);

    await recordPlanChangeEvent(supa, {
      subscription_id: s.id,
      old_plan_id: s.plan_id,
      new_plan_id: targetPlanId,
      old_cadence: s.cadence,
      new_cadence: targetCadence,
      effective_date: localDate(),
      status: "completed",
      requested_by: admin.id,
      old_square_subscription_id: oldSquareSubscriptionId,
      note:
        "Market Pickup plan change applied immediately. Any prior paused Square subscription remains paused and unlinked.",
      completed_at: requestedAt,
    });

    return ok({
      ok: true,
      effective: "immediate",
      message: `${targetPlan.name} is now the member's Honey Club plan. Market Pickup remains pay-at-market.`,
    });
  }

  if (!s.square_subscription_id || s.billing_mode === "card_setup_required") {
    await deleteSavedCheckoutLink(s);

    const { error: updateError } = await supa
      .from("subscriptions")
      .update({
        plan_id: targetPlanId,
        cadence: targetCadence,
        square_checkout_url: null,
        square_checkout_link_id: null,
        square_plan_variation_id: variationId,
        billing_mode: "card_setup_required",
        pending_plan_id: null,
        pending_cadence: null,
        plan_change_effective_date: null,
        plan_change_status: null,
        plan_change_requested_at: requestedAt,
        plan_change_requested_by: admin.id,
      })
      .eq("id", s.id);

    if (updateError) throw new Error(updateError.message);

    await recordPlanChangeEvent(supa, {
      subscription_id: s.id,
      old_plan_id: s.plan_id,
      new_plan_id: targetPlanId,
      old_cadence: s.cadence,
      new_cadence: targetCadence,
      effective_date: localDate(),
      status: "completed",
      requested_by: admin.id,
      old_square_subscription_id: s.square_subscription_id || null,
      note:
        "Plan changed before recurring card setup. Prior checkout URL invalidated.",
      completed_at: requestedAt,
    });

    return ok({
      ok: true,
      effective: "immediate",
      needsCardSetup: true,
      message: `${targetPlan.name} is saved. Secure card setup is required before recurring billing begins.`,
    });
  }

  const detail = await squareSubscriptionDetail(s.square_subscription_id);
  const sq = detail?.subscription;
  const actions = detail?.actions || [];
  const status = String(sq?.status || "").toUpperCase();

  if (status !== "ACTIVE") {
    return bad(
      `Square billing is currently ${status || "unavailable"}. Plan changes can only be scheduled while recurring billing is active.`,
      409
    );
  }

  const conflicting = actions.find((action) =>
    ["PAUSE", "RESUME", "CANCEL", "SWAP_PLAN"].includes(action.type)
  );
  if (conflicting) {
    return bad(
      `Square already has a ${conflicting.type.toLowerCase()} scheduled for this member. Finish or remove that scheduled action before changing their subscription.`,
      409
    );
  }

  const cardId = sq?.card_id || s.saved_square_card_id;
  if (!cardId || !sq?.customer_id || !sq?.location_id) {
    return bad(
      "Square does not have enough saved billing information to automate this change.",
      409
    );
  }

  await deleteSavedCheckoutLink(s);

  const cancelResult = await square(
    `/v2/subscriptions/${s.square_subscription_id}/cancel`,
    {
      method: "POST",
      body: {},
    }
  );

  const cancelAction =
    (cancelResult.actions || []).find(
      (action) => action.type === "CANCEL"
    ) || null;

  // Square's cancellation response is authoritative for the end of the
  // current paid billing period. Start the replacement the following day.
  const cancelDate = cancelResult.subscription?.canceled_date || null;
  const effectiveDate = addDays(cancelDate, 1);

  if (!cancelAction?.id || !effectiveDate) {
    if (cancelAction?.id) {
      try {
        await deleteAction(s.square_subscription_id, cancelAction.id);
      } catch (rollbackError) {
        console.error(
          "CRITICAL: incomplete plan-change cancellation rollback failed:",
          rollbackError
        );
      }
    }
    return bad(
      "Square did not confirm the end-of-cycle cancellation date. The subscription change was not scheduled.",
      502
    );
  }

  const { error: updateError } = await supa
    .from("subscriptions")
    .update({
      pending_plan_id: targetPlanId,
      pending_cadence: targetCadence,
      plan_change_effective_date: effectiveDate,
      plan_change_status: "scheduled",
      plan_change_requested_at: requestedAt,
      plan_change_requested_by: admin.id,
      saved_square_card_id: cardId,
      square_checkout_url: null,
      square_checkout_link_id: null,
    })
    .eq("id", s.id);

  if (updateError) {
    try {
      await deleteAction(s.square_subscription_id, cancelAction.id);
    } catch (rollbackError) {
      console.error(
        "CRITICAL: plan-change cancellation rollback failed:",
        rollbackError
      );
    }
    throw new Error(
      "The plan change could not be saved. The scheduled Square cancellation rollback was attempted; verify this member before retrying."
    );
  }

  await recordPlanChangeEvent(supa, {
    subscription_id: s.id,
    old_plan_id: s.plan_id,
    new_plan_id: targetPlanId,
    old_cadence: s.cadence,
    new_cadence: targetCadence,
    effective_date: effectiveDate,
    status: "scheduled",
    requested_by: admin.id,
    old_square_subscription_id: s.square_subscription_id,
    note:
      "Old Square subscription finishes the paid billing period; replacement is created automatically when Square reports it canceled.",
  });

  return ok({
    ok: true,
    effective: "next_renewal",
    effectiveDate,
    message: `${targetPlan.name} is scheduled for ${effectiveDate}. The current paid box and price stay unchanged until then.`,
  });
}


async function handleAdminCancelPlanChange(req, body) {
  const admin = await requireAdmin(req);
  if (!admin) return bad("Not an admin", 403);

  const subscriptionId = String(body.subscriptionId || "");
  if (!UUID_RE.test(subscriptionId)) return bad("Invalid subscription ID.");

  const supa = db();
  const s = await subscriptionById(supa, subscriptionId);

  if (!s) return bad("Subscription not found.", 404);
  if (s.plan_change_status !== "scheduled" || !s.pending_plan_id) {
    return bad("This membership does not have a scheduled subscription change.", 409);
  }
  if (!s.square_subscription_id) {
    return bad("The scheduled Square subscription could not be found.", 409);
  }

  const detail = await squareSubscriptionDetail(s.square_subscription_id);
  const sq = detail?.subscription;
  const actions = detail?.actions || [];
  const status = String(sq?.status || "").toUpperCase();

  if (["CANCELED", "COMPLETED"].includes(status)) {
    return bad(
      "This plan change has already reached its Square transition date and can no longer be undone here.",
      409
    );
  }

  const cancelAction = actions.find((action) => action.type === "CANCEL");
  if (!cancelAction?.id) {
    return bad(
      "Square no longer shows the scheduled cancellation for this plan change. No local records were altered.",
      409
    );
  }

  await deleteAction(s.square_subscription_id, cancelAction.id);

  const { error: updateError } = await supa
    .from("subscriptions")
    .update({
      pending_plan_id: null,
      pending_cadence: null,
      plan_change_effective_date: null,
      plan_change_status: null,
    })
    .eq("id", s.id);

  if (updateError) {
    throw new Error(
      "Square removed the scheduled change, but the Honey Club record could not be cleared. Verify this membership before retrying."
    );
  }

  const { error: auditError } = await supa
    .from("subscription_plan_change_events")
    .update({
      status: "cancelled",
      note: "Scheduled plan change was cancelled by an administrator before it became effective.",
      completed_at: new Date().toISOString(),
    })
    .eq("subscription_id", s.id)
    .eq("status", "scheduled");

  if (auditError) {
    console.error("Plan-change cancellation audit update failed:", auditError);
  }

  return ok({
    ok: true,
    message:
      "Scheduled subscription change cancelled. The member remains on the current plan and Square billing schedule.",
  });
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

    const action = String(body?.action || "load");

    if (action === "load") {
      const token = String(body.token || "").trim();
      if (!UUID_RE.test(token)) return bad("The Honey Club link is invalid.");

      const supa = db();
      const [subscription, markets] = await Promise.all([
        subscriptionByToken(supa, token),
        upcomingMarkets(supa),
      ]);

      if (!subscription) return bad("Subscription not found.", 404);

      return ok({
        ok: true,
        termsVersion: TERMS_VERSION,
        subscription: serializeSubscription(subscription),
        markets,
      });
    }

    if (action === "update") {
      return await handleUpdate(req, body);
    }

    if (action === "admin-list") {
      const admin = await requireAdmin(req);
      if (!admin) return bad("Not an admin", 403);

      const supa = db();
      const [result, markets, plansResult] = await Promise.all([
        supa
          .from("subscriptions")
          .select("*, plans!subscriptions_plan_id_fkey(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
          .is("archived_at", null)
          .order("started_at", { ascending: false }),
        upcomingMarkets(supa),
        supa
          .from("plans")
          .select("id, name, price_cents, sort")
          .in("id", ["taster", "signature", "hive", "apiary"])
          .order("sort", { ascending: true }),
      ]);

      if (result.error) throw new Error(result.error.message);
      if (plansResult.error) throw new Error(plansResult.error.message);

      return ok({
        ok: true,
        termsVersion: TERMS_VERSION,
        subscriptions: (result.data || []).map((s) =>
          serializeSubscription(s, { admin: true })
        ),
        markets,
        plans: (plansResult.data || []).map((plan) => ({
          id: plan.id,
          name: plan.name,
          price: Number(plan.price_cents || 0) / 100,
        })),
      });
    }

    if (action === "admin-change-plan") {
      return await handleAdminPlanChange(req, body);
    }

    if (action === "admin-record-prepaid-first-box") {
      const admin = await requireAdmin(req);
      if (!admin) return bad("Not an admin", 403);

      const subscriptionId = String(body.subscriptionId || "");
      if (!UUID_RE.test(subscriptionId)) {
        return bad("Invalid subscription ID.");
      }

      const paidPlanId = String(body.paidPlanId || "").trim();
      const paidCadence = String(body.paidCadence || "").trim();
      const paidOn = String(body.paidOn || "").trim();

      if (!body.adminConfirmedPayment) {
        return bad(
          "Confirm that this first Honey Club box was already paid before recording it."
        );
      }

      if (!["taster", "signature", "hive", "apiary"].includes(paidPlanId)) {
        return bad("Choose the Honey Club plan that was already paid.");
      }

      if (!["1mo", "2mo"].includes(paidCadence)) {
        return bad("Choose the cadence that was already paid.");
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
        return bad("Choose the date the first box was paid.");
      }

      const supa = db();
      const subscription = await subscriptionById(supa, subscriptionId);
      if (!subscription) return bad("Subscription not found.", 404);

      if (String(subscription.status || "").toLowerCase() === "cancelled") {
        return bad("Cancelled memberships cannot record a prepaid first box.");
      }

      if (subscription.method !== "delivery") {
        return bad(
          "Prepaid first-box setup is only available for Home Delivery memberships."
        );
      }

      if (subscription.billing_mode !== "card_setup_required") {
        return bad(
          "This membership is not waiting for recurring card setup."
        );
      }

      if (subscription.square_subscription_id) {
        return bad(
          "This membership already has a linked Square subscription."
        );
      }

      if (Number(subscription.boxes_sent || 0) !== 0) {
        return bad("The first Honey Club box has already been counted.");
      }

      if (subscription.prepaid_first_box_plan_id) {
        return bad("A prepaid first box has already been recorded.");
      }

      const paidPlan = await planById(supa, paidPlanId);
      if (!paidPlan) {
        return bad("The paid Honey Club plan could not be found.");
      }

      await deleteSavedCheckoutLink(subscription);

      const { data, error } = await supa.rpc(
        "record_prepaid_first_subscription_box",
        {
          p_subscription_id: subscriptionId,
          p_paid_plan_id: paidPlanId,
          p_paid_cadence: paidCadence,
          p_paid_on: paidOn,
          p_recorded_by: admin.id,
        }
      );

      if (error) return bad(error.message, 409);

      return ok({
        ok: true,
        result: data,
        message:
          `Box 1 recorded as already paid. Recurring billing is scheduled to begin ${data?.recurring_start_date || "on the next renewal date"}.`,
      });
    }

    if (action === "admin-cancel-plan-change") {
      return await handleAdminCancelPlanChange(req, body);
    }

    if (action === "admin-mark-pickup") {
      const admin = await requireAdmin(req);
      if (!admin) return bad("Not an admin", 403);

      const subscriptionId = String(body.subscriptionId || "");
      if (!UUID_RE.test(subscriptionId)) return bad("Invalid subscription ID.");

      const supa = db();
      const referenceId =
        clean(body.referenceId, 120) || crypto.randomUUID();

      const { data, error } = await supa.rpc(
        "record_manual_subscription_box",
        {
          p_subscription_id: subscriptionId,
          p_reference_id: referenceId,
        }
      );

      if (error) return bad(error.message, 409);

      return ok({
        ok: true,
        result: data,
        message: data?.bonus_jar_due
          ? `Box ${data.box_number} recorded. BONUS JAR IS DUE with this box.`
          : `Box ${data?.box_number || ""} recorded as picked up and paid.`,
      });
    }

    return bad("Unknown action.");
  } catch (error) {
    console.error("subscription-fulfillment failed:", error);
    return bad(
      error?.message ||
        "The Honey Club fulfillment update could not be completed.",
      500
    );
  }
};
