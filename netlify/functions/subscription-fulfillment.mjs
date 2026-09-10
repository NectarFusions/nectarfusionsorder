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
    .select("*, plans(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function subscriptionById(supa, id) {
  const { data, error } = await supa
    .from("subscriptions")
    .select("*, plans(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
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
      const [result, markets] = await Promise.all([
        supa
          .from("subscriptions")
          .select("*, plans(*), customers(*), market_dates(id, day, where_at, hours, venues(name, where_at, hours))")
          .is("archived_at", null)
          .order("started_at", { ascending: false }),
        upcomingMarkets(supa),
      ]);

      if (result.error) throw new Error(result.error.message);

      return ok({
        ok: true,
        termsVersion: TERMS_VERSION,
        subscriptions: (result.data || []).map((s) =>
          serializeSubscription(s, { admin: true })
        ),
        markets,
      });
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
