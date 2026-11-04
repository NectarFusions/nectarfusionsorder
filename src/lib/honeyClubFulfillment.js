/*
 * Read-only projection for the Admin Back Room fulfillment queue.
 * No payment, inventory, or subscription records are created by this module.
 * The mark-delivered action must continue to use the existing authenticated RPC.
 */

const JAR_COUNTS = Object.freeze({
  taster: 2,
  signature: 3,
  hive: 3,
  apiary: 12,
});

const safeText = (value) => String(value ?? "").trim();

export function buildHoneyClubFulfillmentEntries(
  subscriptions = [],
  plans = [],
  marketDates = [],
  today
) {
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const marketById = new Map(marketDates.map((market) => [market.id, market]));

  return subscriptions.flatMap((subscription) => {
    if (subscription.archived_at || subscription.status === "cancelled") return [];

    const active = subscription.status === "active";
    const prepaidFirstBox =
      subscription.status === "pending" &&
      Boolean(subscription.prepaid_first_box_paid_at);

    // Unpaid pending and past-due memberships are not fulfillment-ready.
    if (!active && !prepaidFirstBox) return [];

    const method = subscription.method;
    const market = marketById.get(subscription.market_date_id);
    const firstBoxReady =
      active &&
      method === "delivery" &&
      !subscription.next_delivery_date &&
      !subscription.last_delivered_at;
    const scheduledDay =
      method === "market"
        ? safeText(market?.day)
        : safeText(subscription.next_delivery_date);
    const dueDay = firstBoxReady ? today : scheduledDay;

    // A skipped cycle must not appear as an actionable box.
    if (
      active &&
      method === "delivery" &&
      dueDay &&
      !firstBoxReady &&
      subscription.paused_until &&
      dueDay <= subscription.paused_until
    ) {
      return [];
    }

    let reviewReason = "";
    if (prepaidFirstBox) {
      reviewReason =
        "First box payment recorded. Confirm fulfillment arrangements and complete recurring card setup before delivery.";
    } else if (method === "market") {
      reviewReason =
        "Market pickup membership. Verify payment for this box in the Honey Club admin before releasing it.";
    } else if (method !== "delivery") {
      reviewReason = "Confirm this membership's shipping and payment arrangements in Honey Club admin.";
    } else if (!dueDay) {
      reviewReason = "Active delivery membership has no scheduled delivery date. Review the schedule and box payment.";
    } else if (!subscription.square_subscription_id) {
      // An active local subscription is not proof that its current box was paid.
      reviewReason = "Square recurring billing is not connected. Verify this box's payment and fulfillment entitlement before filling jars.";
    } else {
      // A linked Square subscription is not box-specific payment evidence.
      // The queue does not receive verified invoice-to-box entitlements, so
      // all recurring boxes remain visible under Needs Review, never Ready.
      reviewReason = "Verify the paid Square invoice or prepaid-box entitlement for this delivery cycle before filling jars.";
    }

    const plan = planById.get(subscription.plan_id);
    const planName = safeText(plan?.name) || safeText(subscription.plan_id) || "Honey Club";
    const planContents = safeText(plan?.contents) || "Confirm box contents in Honey Club";
    const member = subscription.customers || {};
    const flavorPreferences = Array.isArray(subscription.flavor_preferences)
      ? subscription.flavor_preferences.filter(Boolean).join(", ")
      : "";
    const details = [
      subscription.flavor_mode && `Flavor selection: ${subscription.flavor_mode}`,
      flavorPreferences && `Preferred flavors: ${flavorPreferences}`,
      subscription.flavor_requests && `Flavor requests: ${subscription.flavor_requests}`,
      subscription.delivery_notes && `Delivery notes: ${subscription.delivery_notes}`,
      subscription.temporary_delivery_notes && `Temporary instructions: ${subscription.temporary_delivery_notes}`,
      subscription.building_details && `Building: ${subscription.building_details}`,
      subscription.gate_code && `Gate details: ${subscription.gate_code}`,
      subscription.preferred_contact_method && `Contact preference: ${subscription.preferred_contact_method}`,
      subscription.preferred_delivery_timing && `Preferred timing: ${subscription.preferred_delivery_timing}`,
      subscription.is_gift && `Gift recipient: ${safeText(subscription.recipient_name) || "Check details"}`,
      subscription.gift_message && `Gift message: ${subscription.gift_message}`,
    ].filter(Boolean);

    return [{
      id: `honey-club:${subscription.id}`,
      subscriptionId: subscription.id,
      isHoneyClub: true,
      needsReview: Boolean(reviewReason),
      reviewReason,
      firstBoxReady,
      planName,
      planContents,
      cadence: subscription.cadence,
      jarCount: JAR_COUNTS[subscription.plan_id] ?? 0,
      order_no: subscription.sub_no,
      name: safeText(member.name) || "Honey Club member",
      phone: safeText(member.phone),
      email: safeText(member.email),
      method,
      delivery_day: dueDay || "",
      market_dates: market ? {
        day: market.day,
        hours: market.hours,
        where_at: market.where_at,
        venues: market.venue ? {
          name: market.venue.name,
          hours: market.venue.hours,
          where_at: market.venue.where_at,
        } : null,
      } : null,
      address: safeText(subscription.address),
      zip: safeText(subscription.delivery_zip),
      zone_id: subscription.zone_id,
      notes: details.join(" · "),
      placed_at: subscription.started_at,
      order_items: [{
        id: `honey-club-plan:${subscription.id}`,
        qty: 1,
        size_label: "Honey Club box",
        type: "regular",
        flavor_name: `${planName} · ${planContents}`,
      }],
    }];
  });
}

/**
 * All future scheduled fulfillment work, across regular orders and Honey Club.
 * The caller supplies the existing open, payment-checked order lists. This
 * extra guard avoids inadvertently presenting cancelled or review-only work.
 */
export function getUpcomingFulfillmentEntries(regularOrders = [], honeyClubEntries = [], today) {
  const dateFor = (entry) =>
    entry.method === "market"
      ? String(entry.market_dates?.day || entry.delivery_day || "")
      : String(entry.delivery_day || "");

  return [...regularOrders, ...honeyClubEntries]
    .filter((entry) => {
      const dueDay = dateFor(entry);
      if (!dueDay || dueDay <= today || entry.archived_at || entry.needsReview) return false;
      if (["done", "cancelled", "noshow"].includes(entry.status)) return false;
      if (entry.requires_prepay && !entry.paid && entry.status === "open") return false;
      return true;
    })
    .sort((a, b) =>
      dateFor(a).localeCompare(dateFor(b)) || String(a.id).localeCompare(String(b.id))
    );
}
