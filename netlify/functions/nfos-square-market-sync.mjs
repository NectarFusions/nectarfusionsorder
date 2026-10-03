import { square, db } from "./_square.mjs";

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const authMember = async (req) => {
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!auth.toLowerCase().startsWith("bearer ")) {
    throw Object.assign(new Error("Authentication required."), { status: 401 });
  }

  const token = auth.slice(7).trim();
  const admin = db();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw Object.assign(new Error("Invalid or expired NFOS session."), { status: 401 });
  }

  const { data: member, error: memberError } = await admin
    .from("nfos_team_members")
    .select("id,user_id,display_name,email,role,roles,active")
    .eq("user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();

  const { data: adminRow } = await admin
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (memberError || (!member && !adminRow)) {
    throw Object.assign(new Error("NFOS team access is not active."), { status: 403 });
  }

  const roles = member
    ? [...new Set([...(Array.isArray(member.roles) ? member.roles : []), member.role].filter(Boolean))]
    : [];

  let permissions = [];
  if (roles.length) {
    const { data: rows } = await admin
      .from("nfos_role_permissions")
      .select("permission")
      .in("role", roles);
    permissions = [...new Set((rows || []).map((row) => row.permission).filter(Boolean))];
  }

  const permissionSet = new Set(permissions);
  const isAdmin = Boolean(adminRow);

  if (!isAdmin && !permissionSet.has("market.order.log") && !permissionSet.has("market.manage")) {
    throw Object.assign(new Error("Your NFOS role does not allow market operations."), { status: 403 });
  }

  return { admin, user: userData.user, member, permissions: permissionSet, isAdmin };
};

const assertSessionAccess = async (admin, actor, sessionId) => {
  const { data: session, error } = await admin
    .from("nfos_market_sessions")
    .select("id,status,assigned_member_id,started_by_member_id,square_location_id,opened_at,closed_at,market_day,venue_name")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session) {
    throw Object.assign(new Error("Market session not found."), { status: 404 });
  }

  const privileged = actor.isAdmin
    || actor.permissions.has("team.assign")
    || actor.permissions.has("market.manage");

  const ownsSession = Boolean(
    actor.member
    && (session.started_by_member_id === actor.member.id || session.assigned_member_id === actor.member.id)
  );

  if (!privileged && !ownsSession) {
    throw Object.assign(new Error("This market session is not available to your account."), { status: 403 });
  }

  return session;
};

const listSquareLocations = async () => {
  const result = await square("/v2/locations", { method: "GET" });
  return (result.locations || [])
    .filter((location) => location.status !== "INACTIVE")
    .map((location) => ({
      id: location.id,
      name: location.name,
      status: location.status,
      address: location.address || null,
    }));
};

const listCatalog = async () => {
  let cursor = null;
  const objects = [];

  do {
    const qs = new URLSearchParams({ types: "ITEM" });
    if (cursor) qs.set("cursor", cursor);
    const result = await square(`/v2/catalog/list?${qs.toString()}`, { method: "GET" });
    objects.push(...(result.objects || []));
    cursor = result.cursor || null;
  } while (cursor);

  const variations = [];
  for (const item of objects) {
    if (item.type !== "ITEM") continue;
    const itemName = item.item_data?.name || "Square item";
    for (const variation of item.item_data?.variations || []) {
      variations.push({
        id: variation.id,
        item_id: item.id,
        item_name: itemName,
        variation_name: variation.item_variation_data?.name || "",
        sku: variation.item_variation_data?.sku || "",
        price_cents: Number(variation.item_variation_data?.price_money?.amount || 0),
      });
    }
  }
  return variations;
};

const autoMapExactSkus = async (admin, variations, userId) => {
  const { data: items } = await admin
    .from("nfos_items")
    .select("id,sku,name")
    .eq("item_type", "finished_good")
    .eq("active", true);

  const itemBySku = new Map(
    (items || [])
      .filter((item) => item.sku)
      .map((item) => [String(item.sku).trim().toUpperCase(), item])
  );

  const { data: existing } = await admin
    .from("nfos_square_catalog_mappings")
    .select("*")
    .eq("active", true);

  const mappedIds = new Set((existing || []).map((mapping) => mapping.square_variation_id));
  let count = 0;

  for (const variation of variations) {
    if (mappedIds.has(variation.id) || !variation.sku) continue;
    const item = itemBySku.get(String(variation.sku).trim().toUpperCase());
    if (!item) continue;

    const { error } = await admin
      .from("nfos_square_catalog_mappings")
      .upsert({
        square_variation_id: variation.id,
        item_id: item.id,
        square_item_name: variation.item_name,
        square_variation_name: variation.variation_name,
        square_sku: variation.sku,
        active: true,
        mapped_by: userId,
        mapped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "square_variation_id" });

    if (!error) {
      count += 1;
      mappedIds.add(variation.id);
    }
  }

  return count;
};

const searchOrders = async (locationId, startAt, endAt) => {
  let cursor = null;
  const orders = [];

  do {
    const body = {
      return_entries: false,
      limit: 500,
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
      },
    };
    if (cursor) body.cursor = cursor;
    const result = await square("/v2/orders/search", { body });
    orders.push(...(result.orders || []));
    cursor = result.cursor || null;
  } while (cursor);

  return orders;
};

const summarizePayments = (orders) => {
  let squareNoncashCents = 0;
  let squareCashCents = 0;
  let squareOrderTotalCents = 0;
  let tenderTotalCents = 0;
  let missingTenderOrders = 0;

  for (const order of orders) {
    squareOrderTotalCents += Number(order.total_money?.amount || 0);

    const tenders = order.tenders || [];
    if (!tenders.length && Number(order.total_money?.amount || 0) > 0) {
      missingTenderOrders += 1;
    }

    for (const tender of tenders) {
      const amount = Number(tender.amount_money?.amount || 0);
      tenderTotalCents += amount;
      if (String(tender.type || "").toUpperCase() === "CASH") {
        squareCashCents += amount;
      } else {
        squareNoncashCents += amount;
      }
    }
  }

  return {
    squareNoncashCents,
    squareCashCents,
    squareOrderTotalCents,
    tenderTotalCents,
    missingTenderOrders,
  };
};

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    const actor = await authMember(req);
    const { admin, user } = actor;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    if (action === "locations") {
      const locations = await listSquareLocations();
      return json(200, {
        locations,
        default_location_id: process.env.SQUARE_LOCATION_ID || null,
      });
    }

    if (action === "catalog") {
      if (!actor.isAdmin && !actor.permissions.has("market.manage") && !actor.permissions.has("team.assign")) {
        return json(403, { error: "Market management access is required for Square catalog mapping." });
      }

      const variations = await listCatalog();
      const autoMapped = await autoMapExactSkus(admin, variations, user.id);
      const { data: mappings } = await admin
        .from("nfos_square_catalog_mappings")
        .select("square_variation_id,item_id,square_item_name,square_variation_name,square_sku,nfos_items:item_id(sku,name)")
        .eq("active", true);

      const mapById = new Map((mappings || []).map((mapping) => [
        mapping.square_variation_id,
        {
          square_variation_id: mapping.square_variation_id,
          item_id: mapping.item_id,
          nfos_sku: mapping.nfos_items?.sku,
          nfos_name: mapping.nfos_items?.name,
        },
      ]));

      return json(200, {
        variations: variations.map((variation) => ({
          ...variation,
          mapping: mapById.get(variation.id) || null,
        })),
        auto_mapped: autoMapped,
      });
    }

    if (action === "sync") {
      const sessionId = String(body.sessionId || "").trim();
      if (!sessionId) return json(400, { error: "Market session is required." });

      const session = await assertSessionAccess(admin, actor, sessionId);
      if (!session.square_location_id) {
        return json(400, { error: "Choose a Square location for this market first." });
      }
      if (!session.opened_at) {
        return json(400, { error: "Start the market before syncing Square." });
      }

      const endAt = session.closed_at || new Date().toISOString();
      const orders = await searchOrders(session.square_location_id, session.opened_at, endAt);
      const summary = summarizePayments(orders);

      const notes = [
        `Square payment reconciliation for ${session.venue_name}.`,
        summary.missingTenderOrders
          ? `${summary.missingTenderOrders} completed order(s) had no tender detail.`
          : null,
      ].filter(Boolean).join(" ");

      const { data: reconciliation, error: reconError } = await admin.rpc(
        "nfos_market_update_payment_reconciliation_service",
        {
          p_session_id: sessionId,
          p_square_noncash_cents: summary.squareNoncashCents,
          p_square_cash_cents: summary.squareCashCents,
          p_square_order_total_cents: summary.squareOrderTotalCents,
          p_square_transaction_count: orders.length,
          p_notes: notes,
        }
      );

      if (reconError) throw new Error(reconError.message);

      return json(200, {
        session_id: sessionId,
        orders: orders.length,
        square_noncash_cents: summary.squareNoncashCents,
        square_cash_cents: summary.squareCashCents,
        square_order_total_cents: summary.squareOrderTotalCents,
        tender_total_cents: summary.tenderTotalCents,
        missing_tender_orders: summary.missingTenderOrders,
        reconciliation,
      });
    }

    return json(400, { error: "Unknown Square market action." });
  } catch (error) {
    return json(Number(error?.status || 500), { error: String(error?.message || error) });
  }
};

export const config = { path: "/.netlify/functions/nfos-square-market-sync" };
