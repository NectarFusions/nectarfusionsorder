import { supabase } from "./supabase";

/* Every database call lives here. Nothing else in the app talks to
   Supabase directly — so if a query is wrong, there's one place to look. */

const throwIf = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const stockKey = (sizeId, type) => `${sizeId}:${type}`;

/* ---------- public catalog ---------- */

export async function getCatalog() {
  const [sizes, flavors, stock, zones, venues, marketDates, blocked, plans, settings] = await Promise.all([
    supabase.from("sizes").select("*").order("sort").then(throwIf),
    supabase.from("flavors").select("*").order("sort").then(throwIf),
    supabase.from("stock").select("*").then(throwIf),
    supabase.from("zones").select("*").then(throwIf),
    supabase.from("venues").select("*").order("name").then(throwIf),
    supabase.from("market_dates").select("*").gte("day", today()).order("day").then(throwIf),
    supabase.from("blocked_dates").select("*").then(throwIf),
    supabase.from("plans").select("*").order("sort").then(throwIf),
    supabase.from("settings").select("*").then(throwIf),
  ]);

  const byFlavor = {};
  for (const s of stock) {
    (byFlavor[s.flavor_id] ??= {})[stockKey(s.size_id, s.type)] = {
      in_stock: s.in_stock,
      on_hand: s.on_hand,
    };
  }

  const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]));

  return {
    sizes: sizes.map((s) => ({ ...s, price: s.price_cents / 100 })),
    flavors: flavors.map((f) => ({ ...f, stock: byFlavor[f.id] || {} })),
    zones: zones.map((z) => ({
      ...z,
      fee: z.fee_cents / 100,
      minimum: z.minimum_cents / 100,
      freeOver: z.free_over_cents / 100,
    })),
    venues,
    marketDates: marketDates.map((m) => ({ ...m, venue: venues.find((v) => v.id === m.venue_id) }))
      .filter((m) => m.venue),
    blockedDates: blocked.map((b) => b.day),
    plans: plans.map((p) => ({ ...p, price: p.price_cents / 100 })),
    bestSeller: cfg.best_seller ?? "",
    topPicks: Array.isArray(cfg.top_picks)
      ? cfg.top_picks.map((pick, index) => ({
          flavor_id: pick?.flavor_id ?? null,
          tagline: String(pick?.tagline || ""),
          image_url: String(pick?.image_url || ""),
          active: pick?.active !== false,
          sort: index,
        }))
      : [],
    bundle: {
      size: cfg.bundle?.size_id ?? "4oz",
      count: cfg.bundle?.count ?? 3,
      price: (cfg.bundle?.price_cents ?? 2000) / 100,
    },
    shipFreeOver: (cfg.shipping?.free_over_cents ?? 7500) / 100,
    cancelMinutes: cfg.cancel_minutes ?? 60,
  };
}

export const inStock = (flavor, sizeId, type) => {
  const row = flavor.stock?.[stockKey(sizeId, type)];
  if (typeof row === "boolean") return row;
  return row?.in_stock !== false;
};

export const stockCount = (flavor, sizeId, type) => {
  const row = flavor.stock?.[stockKey(sizeId, type)];
  if (!row || typeof row === "boolean") return "";
  return row.on_hand ?? "";
};

/* ---------- ordering (anonymous, via security-definer RPCs) ---------- */

export async function placeOrder(payload) {
  const { data, error } = await supabase.rpc("place_order", {
    p_items: payload.items,          // [{flavor_id, size_id, type, qty}]
    p_method: payload.method,        // 'market' | 'delivery' | 'ship'
    p_name: payload.name,
    p_phone: payload.phone,
    p_email: payload.email,
    p_address: payload.address ?? null,
    p_notes: payload.notes ?? null,
    p_zip: payload.zip ?? null,
    p_day: payload.day ?? null,                  // 'YYYY-MM-DD'
    p_market_date_id: payload.marketDateId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { orderNo: row.order_no, token: row.token, total: row.total_cents / 100 };
}

export async function getOrder(token) {
  const { data, error } = await supabase.rpc("get_order", { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelOrder(token) {
  const { error } = await supabase.rpc("cancel_order", { p_token: token });
  if (error) throw new Error(error.message);
}

/* ---------- retail locator ---------- */

export async function findRetailLocations(zip) {
  const { data, error } = await supabase.rpc("find_retail_locations", {
    p_zip: zip,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* ---------- customer help ---------- */

export async function submitCustomerRequest(request) {
  const response = await fetch("/.netlify/functions/customer-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Your request could not be sent.");
  }

  return data;
}

/* ---------- auth ---------- */

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password }).then(({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  });

export const signOut = () => supabase.auth.signOut();
export const session = () => supabase.auth.getSession().then(({ data }) => data.session);
export const onAuth = (cb) => supabase.auth.onAuthStateChange((_e, s) => cb(s));

export async function amAdmin() {
  const { data, error } = await supabase.from("admins").select("user_id").maybeSingle();
  if (error) return false;
  return !!data;
}

/* ---------- admin ---------- */

export const listOrders = () =>
  supabase.from("orders")
    .select("*, order_items(*), customers(flagged, consecutive_noshows), market_dates(day, venues(name, hours))")
    .order("placed_at", { ascending: false })
    .limit(200)
    .then(throwIf);

export const setOrderStatus = (id, status) =>
  supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", id).then(throwIf);

export async function marketOrderAction(orderId, action) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const response = await fetch("/.netlify/functions/market-order-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orderId, action }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The market order could not be updated.");
  return result;
}

export async function archiveOrder(id) {
  const { error } = await supabase.rpc("archive_order_admin", { p_order_id: id });
  if (error) throw new Error(error.message);
}

export async function restoreOrder(id) {
  const { error } = await supabase.rpc("restore_order_admin", { p_order_id: id });
  if (error) throw new Error(error.message);
}

export async function deleteArchivedOrder(id) {
  const { error } = await supabase.rpc("delete_archived_order_admin", { p_order_id: id });
  if (error) throw new Error(error.message);
}

export const listSubs = () =>
  supabase.from("subscriptions").select("*, customers(name, phone, email)")
    .order("started_at", { ascending: false }).then(throwIf);

/* Pausing or cancelling MUST reach Square — Square holds the card.
   Writing only to Supabase would leave a "cancelled" member being
   billed forever. This goes through a function that does both. */
export async function subAction(subId, action) {   // 'pause' | 'resume' | 'cancel'
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Not signed in.");

  const r = await fetch("/.netlify/functions/sub-action", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ subId, action }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Square didn't accept that.");
  return j;
}

export async function archiveSubscription(id) {
  const { error } = await supabase.rpc("archive_subscription_admin", { p_subscription_id: id });
  if (error) throw new Error(error.message);
}

export async function restoreSubscription(id) {
  const { error } = await supabase.rpc("restore_subscription_admin", { p_subscription_id: id });
  if (error) throw new Error(error.message);
}

export async function deleteArchivedSubscription(id) {
  const { error } = await supabase.rpc("delete_archived_subscription_admin", { p_subscription_id: id });
  if (error) throw new Error(error.message);
}

export const setStock = (flavorId, sizeId, type, on) =>
  supabase.from("stock").update({ in_stock: on })
    .eq("flavor_id", flavorId).eq("size_id", sizeId).eq("type", type).then(throwIf);

export const setStockCount = (flavorId, sizeId, type, count) => {
  const safeCount = Math.max(0, Number.parseInt(count, 10) || 0);
  return supabase.from("stock")
    .update({ on_hand: safeCount, in_stock: safeCount > 0 })
    .eq("flavor_id", flavorId)
    .eq("size_id", sizeId)
    .eq("type", type)
    .then(throwIf);
};

export const setFlavorStockAll = async (flavorId, on) =>
  supabase.from("stock").update({ in_stock: on }).eq("flavor_id", flavorId).then(throwIf);

export const addFlavor = (name, hex) =>
  supabase.from("flavors").insert({ name, hex }).select().single().then(throwIf);

export const updateFlavor = (id, patch) =>
  supabase.from("flavors").update(patch).eq("id", id).then(throwIf);

export async function uploadFlavorImage(flavorId, file) {
  if (!file) throw new Error("Choose an image first.");

  const extension = (file.name.split(".").pop() || "png").toLowerCase();
  const safeExtension = ["png", "jpg", "jpeg", "webp"].includes(extension)
    ? extension
    : "png";
  const path = `${flavorId}/lid-${Date.now()}.${safeExtension}`;

  const { error: uploadError } = await supabase.storage
    .from("flavor-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage
    .from("flavor-images")
    .getPublicUrl(path);

  const imageUrl = data.publicUrl;
  await updateFlavor(flavorId, { image_url: imageUrl });
  return imageUrl;
}

export const deleteFlavor = (id) =>
  supabase.from("flavors")
    .update({ active: false })
    .eq("id", id)
    .then(throwIf);

export const restoreFlavor = (id) =>
  supabase.from("flavors")
    .update({ active: true })
    .eq("id", id)
    .then(throwIf);

export const setBestSeller = (name) =>
  supabase.from("settings").update({ value: name }).eq("key", "best_seller").then(throwIf);

export const setTopPicks = async (picks) => {
  const clean = (Array.isArray(picks) ? picks : []).slice(0, 8).map((pick) => ({
    flavor_id: pick.flavor_id || null,
    tagline: String(pick.tagline || "").trim().slice(0, 60),
    image_url: String(pick.image_url || "").trim(),
    active: pick.active !== false,
  }));

  const { data, error } = await supabase
    .from("settings")
    .upsert({ key: "top_picks", value: clean }, { onConflict: "key" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export async function uploadTopPickImage(file) {
  if (!file) throw new Error("Choose an image first.");

  const extension = (file.name.split(".").pop() || "png").toLowerCase();
  const safeExtension = ["png", "jpg", "jpeg", "webp"].includes(extension)
    ? extension
    : "png";
  const path = `top-picks/top-pick-${Date.now()}.${safeExtension}`;

  const { error: uploadError } = await supabase.storage
    .from("flavor-images")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage
    .from("flavor-images")
    .getPublicUrl(path);

  return data.publicUrl;
}

export const addVenue = (v) =>
  supabase.from("venues").insert(v).select().single().then(throwIf);

export const updateVenue = (id, patch) =>
  supabase.from("venues").update(patch).eq("id", id).then(throwIf);

export const deleteVenue = (id) =>
  supabase.from("venues").delete().eq("id", id).then(throwIf);

export const addMarketDate = (venue_id, day) =>
  supabase.from("market_dates").insert({ venue_id, day }).select().single().then(throwIf);

export const deleteMarketDate = (id) =>
  supabase.from("market_dates").delete().eq("id", id).then(throwIf);

export const listAllMarketDates = () =>
  supabase.from("market_dates").select("*, venues(name)").order("day").then(throwIf);

export const blockDay = (day) =>
  supabase.from("blocked_dates").insert({ day }).then(throwIf);

export const unblockDay = (day) =>
  supabase.from("blocked_dates").delete().eq("day", day).then(throwIf);

export const listRetailLocations = () =>
  supabase.from("retail_locations")
    .select("*")
    .order("active", { ascending: false })
    .order("sort")
    .order("name")
    .then(throwIf);

export const addRetailLocation = (location) =>
  supabase.from("retail_locations")
    .insert(location)
    .select()
    .single()
    .then(throwIf);

export const updateRetailLocation = (id, patch) =>
  supabase.from("retail_locations")
    .update(patch)
    .eq("id", id)
    .then(throwIf);

export const deleteRetailLocation = (id) =>
  supabase.from("retail_locations")
    .delete()
    .eq("id", id)
    .then(throwIf);

export const listCustomerRequests = () =>
  supabase.from("customer_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .then(throwIf);

export const updateCustomerRequest = (id, patch) =>
  supabase.from("customer_requests")
    .update(patch)
    .eq("id", id)
    .then(throwIf);

export const deleteCustomerRequest = (id) =>
  supabase.from("customer_requests")
    .delete()
    .eq("id", id)
    .then(throwIf);

/* ---------- subscriptions (enrolment only; Square does the billing) ---------- */

export async function startSubscription(s) {
  const { data, error } = await supabase.rpc("start_subscription", {
    p_plan_id: s.planId,
    p_cadence: s.cadence,        // '1mo' | '2mo'
    p_method: s.method,          // 'market' | 'delivery' | 'ship'
    p_name: s.name,
    p_phone: s.phone,
    p_email: s.email,
    p_address: s.address ?? null,
    p_zip: s.zip ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { subNo: row.sub_no, token: row.token, price: row.price_cents / 100 };
}

export async function getSubscription(token) {
  const { data, error } = await supabase.rpc("get_subscription", { p_token: token });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelSubscription(token) {
  const { error } = await supabase.rpc("cancel_subscription", { p_token: token });
  if (error) throw new Error(error.message);
}

/* ---------- Square (via Netlify functions) ---------- */

export async function payLink(token) {
  const r = await fetch("/.netlify/functions/pay-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Couldn't create a payment link.");
  return j.url;
}

export async function subscribeLink(token) {
  const r = await fetch("/.netlify/functions/subscribe-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Couldn't create a checkout link.");
  return j.url;
}

/* ---------- helpers ---------- */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
