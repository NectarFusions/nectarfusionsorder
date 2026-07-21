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
          limited: index === 0 && pick?.limited === true,
          limited_label: String(
            pick?.limited_label || "Limited Release"
          ),
          limited_message: String(
            pick?.limited_message ||
            "Small batch. Once it’s gone, it’s gone."
          ),
          remaining: Math.max(
            0,
            Number.parseInt(pick?.remaining, 10) || 0
          ),
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
    spunAvailability: {
      enabled: cfg.spun_availability?.enabled !== false,
      message: String(
        cfg.spun_availability?.message ||
        "Spun honey is temporarily unavailable. Warm weather can soften or melt its whipped texture."
      ),
    },
    flavorCategories:
      cfg.flavor_categories &&
      typeof cfg.flavor_categories === "object" &&
      !Array.isArray(cfg.flavor_categories)
        ? cfg.flavor_categories
        : {},
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
  try {
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
    if (!row?.token || !row?.order_no) {
      throw new Error(
        "The order service returned an empty response. Your order was not confirmed."
      );
    }

    return {
      orderNo: row.order_no,
      token: row.token,
      total: Number(row.total_cents || 0) / 100,
    };
  } catch (error) {
    const message = String(error?.message || error || "");

    if (
      message.includes("Unexpected end of JSON input") ||
      message.includes("Failed to execute 'json'")
    ) {
      throw new Error(
        "We could not confirm whether the order was received. Check your confirmation email before trying again, or use Order Help."
      );
    }

    throw error;
  }
}

export async function getOrder(token) {
  try {
    const { data, error } = await supabase.rpc("get_order", { p_token: token });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("The order confirmation could not be loaded.");
    return data;
  } catch (error) {
    const message = String(error?.message || error || "");

    if (
      message.includes("Unexpected end of JSON input") ||
      message.includes("Failed to execute 'json'")
    ) {
      throw new Error(
        "The order service returned an incomplete confirmation. Check your confirmation email or use Order Help."
      );
    }

    throw error;
  }
}


const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getOrderWithRetry(
  token,
  { attempts = 6, initialDelayMs = 350 } = {}
) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const order = await getOrder(token);
      if (order) return order;
      lastError = new Error("The order confirmation response was empty.");
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) {
      await wait(initialDelayMs * (attempt + 1));
    }
  }

  const message = String(lastError?.message || "");
  if (
    message.includes("Unexpected end of JSON input") ||
    message.includes("Failed to execute 'json'") ||
    message.includes("empty")
  ) {
    throw new Error(
      "Your order was created, but its confirmation is still loading. " +
      "Please check your email or refresh this order page instead of placing the order again."
    );
  }

  throw lastError || new Error(
    "Your order was created, but its confirmation could not be loaded. " +
    "Please check your email before trying again."
  );
}

export async function cancelOrder(token) {
  const { error } = await supabase.rpc("cancel_order", { p_token: token });
  if (error) throw new Error(error.message);
}

export async function findOrder(orderNo, email) {
  const { data, error } = await supabase.rpc("find_order", { p_order_no: orderNo, p_email: email });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("We could not locate an order using those details.");
  return data;
}

export async function replaceOrderFlavor(token, orderItemId, newFlavorId) {
  const { data, error } = await supabase.rpc("replace_order_flavor", {
    p_token: token, p_order_item_id: orderItemId, p_new_flavor_id: newFlavorId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The order could not be updated.");
  return data;
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
    .select("*, order_items(*), order_item_changes(*), customers(flagged, consecutive_noshows), market_dates(day, venues(name, hours))")
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

export const setFlavorCategory = async (flavorId, category) => {
  const normalizedCategory = [
    "core",
    "seasonal",
    "limited",
    "other",
  ].includes(category)
    ? category
    : "other";

  const { data: existing, error: readError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "flavor_categories")
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  const current =
    existing?.value &&
    typeof existing.value === "object" &&
    !Array.isArray(existing.value)
      ? existing.value
      : {};

  const value = {
    ...current,
    [String(flavorId)]: normalizedCategory,
  };

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      { key: "flavor_categories", value },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const setBestSeller = (name) =>
  supabase.from("settings").update({ value: name }).eq("key", "best_seller").then(throwIf);

export const setSpunAvailability = async (enabled, message) => {
  const value = {
    enabled: !!enabled,
    message: String(message || "").trim() ||
      "Spun honey is temporarily unavailable. Warm weather can soften or melt its whipped texture.",
  };

  const { data, error } = await supabase
    .from("settings")
    .upsert({ key: "spun_availability", value }, { onConflict: "key" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const setTopPicks = async (picks) => {
  const clean = (Array.isArray(picks) ? picks : []).slice(0, 8).map((pick, index) => ({
    flavor_id: pick.flavor_id || null,
    tagline: String(pick.tagline || "").trim().slice(0, 60),
    image_url: String(pick.image_url || "").trim(),
    active: pick.active !== false,
    limited: index === 0 && pick.limited === true,
    limited_label: String(
      pick.limited_label || "Limited Release"
    ).trim().slice(0, 36),
    limited_message: String(
      pick.limited_message ||
      "Small batch. Once it’s gone, it’s gone."
    ).trim().slice(0, 140),
    remaining: Math.max(
      0,
      Number.parseInt(pick.remaining, 10) || 0
    ),
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

  const { error: preferenceError } = await supabase.rpc("set_subscription_preferences", {
    p_token: row.token,
    p_flavor_mode: s.flavorMode ?? "surprise",
    p_flavor_preferences: s.flavorPreferences ?? [],
    p_flavor_requests: s.flavorRequests ?? null,
  });

  if (preferenceError) throw new Error(preferenceError.message);

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

export async function getCustomerSubscription(token) {
  const response = await fetch(
    "/.netlify/functions/customer-subscription",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    }
  );

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Your Honey Club membership could not be loaded."
    );
  }

  return data.subscription;
}

export async function requestSubscriptionCancellation(token) {
  const response = await fetch(
    "/.netlify/functions/customer-subscription-cancel-request",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    }
  );

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      "Your cancellation request could not be sent."
    );
  }

  return data;
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

  const text = await r.text();
  let result = {};

  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = {
      error:
        text ||
        "Honey Club checkout returned an unreadable response. Please contact NectarFusions.",
    };
  }

  if (!r.ok) {
    throw new Error(
      result.error ||
        "Honey Club checkout is temporarily unavailable. Please contact NectarFusions."
    );
  }

  if (!result.url) {
    throw new Error(
      "Honey Club checkout did not return a payment link. Please contact NectarFusions."
    );
  }

  return result.url;
}

/* ---------- helpers ---------- */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
