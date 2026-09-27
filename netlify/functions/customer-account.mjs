import { createClient } from "@supabase/supabase-js";

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const clean = (value, max = 500) => {
  const out = String(value ?? "").trim();
  return out ? out.slice(0, max) : null;
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const normalizeZip = (value) => {
  const out = String(value || "").replace(/\D/g, "").slice(0, 5);
  return out || null;
};
const normalizeState = (value) => {
  const out = String(value || "").trim().toUpperCase().slice(0, 2);
  return /^[A-Z]{2}$/.test(out) ? out : null;
};

const safeAccount = (row) => row ? ({
  id: row.id,
  email: row.email,
  name: row.name,
  phone: row.phone,
  preferred_fulfillment: row.preferred_fulfillment,
  address_line1: row.address_line1,
  address_line2: row.address_line2,
  city: row.city,
  state: row.state,
  zip: row.zip,
  building_details: row.building_details,
  gate_code: row.gate_code,
  delivery_notes: row.delivery_notes,
  preferred_contact_method: row.preferred_contact_method,
  created_at: row.created_at,
  updated_at: row.updated_at,
}) : null;

async function identifyUser(req, supabaseUrl, anonKey) {
  const authorization = String(req.headers.get("authorization") || "").trim();
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw Object.assign(new Error("Sign in to My NectarFusions first."), { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await userClient.auth.getUser();
  const user = data?.user;
  if (error || !user) {
    throw Object.assign(new Error("Your My NectarFusions sign-in has expired."), { status: 401 });
  }
  if (!user.email || !(user.email_confirmed_at || user.confirmed_at)) {
    throw Object.assign(new Error("Verify your email before opening My NectarFusions."), { status: 403 });
  }
  return user;
}

async function ensureAccount(admin, user) {
  const email = normalizeEmail(user.email);

  let { data: account, error: accountError } = await admin
    .from("customer_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError) throw accountError;

  if (!account) {
    const { data: inserted, error: insertError } = await admin
      .from("customer_accounts")
      .insert({ user_id: user.id, email })
      .select("*")
      .single();
    if (insertError) throw insertError;
    account = inserted;
  } else if (account.email !== email) {
    const { data: updated, error: updateError } = await admin
      .from("customer_accounts")
      .update({ email, updated_at: new Date().toISOString() })
      .eq("id", account.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    account = updated;
  }

  const [customerResult, orderResult] = await Promise.all([
    admin
      .from("customers")
      .select("id,name,phone,email,created_at")
      .eq("email_normalized", email)
      .order("created_at", { ascending: false }),
    admin
      .from("orders")
      .select("customer_id,name,phone,email,address,city,zip,method,placed_at")
      .eq("email_normalized", email)
      .order("placed_at", { ascending: false })
      .limit(100),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (orderResult.error) throw orderResult.error;

  const customerRows = customerResult.data || [];
  const orderRows = orderResult.data || [];
  const customerIds = new Set(customerRows.map((row) => row.id));
  orderRows.forEach((row) => { if (row.customer_id) customerIds.add(row.customer_id); });

  for (const customerId of customerIds) {
    const { error: linkError } = await admin
      .from("customer_account_customers")
      .upsert({
        account_id: account.id,
        customer_id: customerId,
        source: customerRows.some((row) => row.id === customerId)
          ? "verified_email"
          : "verified_order_email",
      }, { onConflict: "account_id,customer_id", ignoreDuplicates: true });

    // A historical customer row can belong to only one verified account.
    // If an older mapping already owns it, leave that ownership intact.
    if (linkError && linkError.code !== "23505") throw linkError;
  }

  const latestOrder = orderRows[0] || null;
  const latestCustomer = customerRows[0] || null;
  const patch = {};
  if (!account.name) patch.name = clean(latestOrder?.name || latestCustomer?.name, 300);
  if (!account.phone) patch.phone = clean(latestOrder?.phone || latestCustomer?.phone, 60);
  if (!account.address_line1) patch.address_line1 = clean(latestOrder?.address, 300);
  if (!account.city) patch.city = clean(latestOrder?.city, 150);
  if (!account.zip) patch.zip = normalizeZip(latestOrder?.zip);
  if (!account.preferred_fulfillment && ["market", "delivery", "ship"].includes(latestOrder?.method)) {
    patch.preferred_fulfillment = latestOrder.method;
  }

  Object.keys(patch).forEach((key) => { if (patch[key] == null) delete patch[key]; });
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const { data: updated, error: patchError } = await admin
      .from("customer_accounts")
      .update(patch)
      .eq("id", account.id)
      .select("*")
      .single();
    if (patchError) throw patchError;
    account = updated;
  }

  const { data: linkedRows, error: linkedRowsError } = await admin
    .from("customer_account_customers")
    .select("customer_id")
    .eq("account_id", account.id);
  if (linkedRowsError) throw linkedRowsError;

  return {
    account,
    email,
    linkedCustomerIds: (linkedRows || []).map((row) => row.customer_id),
  };
}

async function loadContext(admin, account, email, linkedCustomerIds) {
  const orderQuery = admin
    .from("orders")
    .select(
      "id,order_no,token,status,method,subtotal_cents,fee_cents,total_cents,delivery_day," +
      "name,phone,email,address,city,zip,notes,placed_at,updated_at,paid,paid_at,requires_prepay," +
      "picked_up_at,fulfilled_at,reorder_due_on,items:order_items(id,flavor_id,flavor_name,size_id,size_label,type,qty,unit_cents)"
    )
    .eq("email_normalized", email)
    .order("placed_at", { ascending: false })
    .limit(75);

  const subscriptionsQuery = linkedCustomerIds.length
    ? admin
        .from("subscriptions")
        .select(
          "id,sub_no,token,customer_id,plan_id,cadence,method,status,zone_id,address,boxes_sent,started_at," +
          "cancelled_at,paused_until,flavor_mode,flavor_preferences,flavor_requests,delivery_location_type," +
          "building_details,gate_code,delivery_notes,preferred_contact_method,preferred_delivery_timing," +
          "market_date_id,is_gift,recipient_name,gift_message,terms_accepted_at,terms_version,delivery_zip," +
          "temporary_delivery_notes,billing_mode,pending_plan_id,pending_cadence,plan_change_effective_date," +
          "plan_change_status,recurring_start_date,next_delivery_date,last_delivered_at"
        )
        .in("customer_id", linkedCustomerIds)
        .order("started_at", { ascending: false })
        .limit(30)
    : Promise.resolve({ data: [], error: null });

  const [ordersResult, subscriptionsResult, favoritesResult, linksResult] = await Promise.all([
    orderQuery,
    subscriptionsQuery,
    admin.from("customer_favorites").select("flavor_id,created_at").eq("account_id", account.id).order("created_at", { ascending: false }),
    admin.from("customer_account_customers").select("customer_id,linked_at,source").eq("account_id", account.id),
  ]);

  if (ordersResult.error) throw ordersResult.error;
  if (subscriptionsResult.error) throw subscriptionsResult.error;
  if (favoritesResult.error) throw favoritesResult.error;
  if (linksResult.error) throw linksResult.error;

  const orders = ordersResult.data || [];
  const subscriptions = subscriptionsResult.data || [];
  const activeSubscriptions = subscriptions.filter((row) =>
    !["cancelled", "canceled", "ended"].includes(String(row.status || "").toLowerCase())
  );
  const completedOrders = orders.filter((row) => String(row.status || "").toLowerCase() === "done");
  const reorderRetentionDays = 60;
  const reorderCutoffMs = Date.now() - reorderRetentionDays * 24 * 60 * 60 * 1000;
  const reorderEligibleOrders = completedOrders.filter((order) => {
    const completedAt = new Date(
      order.fulfilled_at || order.picked_up_at || order.updated_at || order.placed_at || 0
    ).getTime();
    return Number.isFinite(completedAt) && completedAt >= reorderCutoffMs;
  });
  const today = new Date().toISOString().slice(0, 10);

  let reorderSuggestion = null;
  for (const order of reorderEligibleOrders) {
    if (!order.reorder_due_on || order.reorder_due_on > today) continue;

    const completedAt = new Date(order.fulfilled_at || order.picked_up_at || order.updated_at || order.placed_at || 0).getTime();
    const hasLaterOrder = orders.some((candidate) => {
      if (String(candidate.id) === String(order.id)) return false;
      if (["cancelled", "canceled"].includes(String(candidate.status || "").toLowerCase())) return false;
      const placedAt = new Date(candidate.placed_at || 0).getTime();
      return Number.isFinite(completedAt) && placedAt > completedAt;
    });

    if (!hasLaterOrder) {
      reorderSuggestion = {
        orderId: order.id,
        orderNo: order.order_no,
        reorderDueOn: order.reorder_due_on,
      };
      break;
    }
  }

  return {
    account: safeAccount(account),
    orders,
    subscriptions,
    favorites: favoritesResult.data || [],
    linkedCustomerCount: (linksResult.data || []).length,
    repeatPurchase: {
      completedOrderCount: completedOrders.length,
      honeyClubEligible: completedOrders.length >= 3 && activeSubscriptions.length === 0,
      reorderRetentionDays,
      reorderSuggestion,
    },
  };
}

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { error: "My NectarFusions is not configured on this environment." });
  }

  let body = {};
  try { body = await req.json(); } catch { return json(400, { error: "Invalid account request." }); }

  try {
    const user = await identifyUser(req, supabaseUrl, anonKey);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const ensured = await ensureAccount(admin, user);
    const action = String(body.action || "context");

    if (action === "context" || action === "bootstrap") {
      return json(200, {
        ok: true,
        ...(await loadContext(admin, ensured.account, ensured.email, ensured.linkedCustomerIds)),
      });
    }

    if (action === "update_profile") {
      const profile = body.profile || {};
      const preferredFulfillment = clean(profile.preferredFulfillment, 20);
      const preferredContact = clean(profile.preferredContactMethod, 20);
      if (preferredFulfillment && !["market", "delivery", "ship", "flexible"].includes(preferredFulfillment)) {
        return json(400, { error: "Choose a valid fulfillment preference." });
      }
      if (preferredContact && !["text", "call", "email"].includes(preferredContact)) {
        return json(400, { error: "Choose text, call, or email as the contact preference." });
      }

      const patch = {
        name: clean(profile.name, 300),
        phone: clean(profile.phone, 60),
        preferred_fulfillment: preferredFulfillment,
        address_line1: clean(profile.addressLine1, 300),
        address_line2: clean(profile.addressLine2, 300),
        city: clean(profile.city, 150),
        state: normalizeState(profile.state),
        zip: normalizeZip(profile.zip),
        building_details: clean(profile.buildingDetails, 500),
        gate_code: clean(profile.gateCode, 200),
        delivery_notes: clean(profile.deliveryNotes, 1500),
        preferred_contact_method: preferredContact,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error } = await admin
        .from("customer_accounts")
        .update(patch)
        .eq("id", ensured.account.id)
        .select("*")
        .single();
      if (error) throw error;
      return json(200, { ok: true, account: safeAccount(updated) });
    }

    if (action === "set_favorite") {
      const flavorId = clean(body.flavorId, 80);
      if (!flavorId) return json(400, { error: "Choose a flavor." });

      const { data: flavor, error: flavorError } = await admin
        .from("flavors")
        .select("id,active")
        .eq("id", flavorId)
        .maybeSingle();
      if (flavorError) throw flavorError;
      if (!flavor || flavor.active === false) return json(400, { error: "That flavor is not currently available." });

      if (body.enabled === false) {
        const { error } = await admin
          .from("customer_favorites")
          .delete()
          .eq("account_id", ensured.account.id)
          .eq("flavor_id", flavorId);
        if (error) throw error;
      } else {
        const { error } = await admin
          .from("customer_favorites")
          .upsert({ account_id: ensured.account.id, flavor_id: flavorId }, { onConflict: "account_id,flavor_id" });
        if (error) throw error;
      }

      const { data: favorites, error: favoritesError } = await admin
        .from("customer_favorites")
        .select("flavor_id,created_at")
        .eq("account_id", ensured.account.id)
        .order("created_at", { ascending: false });
      if (favoritesError) throw favoritesError;
      return json(200, { ok: true, favorites: favorites || [] });
    }

    return json(400, { error: "Unknown My NectarFusions action." });
  } catch (error) {
    return json(error?.status || 500, { error: error?.message || "My NectarFusions could not be loaded." });
  }
};
