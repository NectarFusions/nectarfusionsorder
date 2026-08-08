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
    marketDates: marketDates
      .filter((m) => m.active !== false)
      .map((m) => {
        const venue = venues.find((v) => v.id === m.venue_id);
        if (!venue) return { ...m, venue: null };
        return {
          ...m,
          venue: {
            ...venue,
            where_at: m.where_at ?? venue.where_at,
            hours: m.hours ?? venue.hours,
          },
        };
      })
      .filter((m) => m.venue),
    blockedDates: blocked.map((b) => b.day),
    plans: plans.map((p) => ({ ...p, price: p.price_cents / 100 })),
    bestSeller: cfg.best_seller ?? "",
    homepageHeroImage:
      typeof cfg.homepage_hero_image === "string"
        ? cfg.homepage_hero_image
        : "",
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

async function requestOrderConfirmationEmails(token) {
  let lastFailure = "Unknown email error";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("/.netlify/functions/order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        keepalive: true,
      });

      if (response.ok) return true;

      const detail = await response.text();
      lastFailure = `${response.status} ${detail}`.trim();

      // A new order can briefly be unavailable to the independent function.
      // Retry server failures and the short-lived not-found race only.
      if (response.status < 500 && response.status !== 404) break;
    } catch (emailError) {
      lastFailure = emailError?.message || String(emailError);
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 450));
    }
  }

  // The order is already saved. Never make a customer place it twice
  // because the independent email service was temporarily unavailable.
  console.error("Order confirmation email request failed:", lastFailure);
  return false;
}

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

    // Ask the Netlify email function immediately after the database confirms
    // the order. The existing Supabase webhook remains a server-side backup.
    // Resend idempotency keys in that function prevent duplicate messages.
    await requestOrderConfirmationEmails(row.token);

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

export async function getPartnerPortalContext() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);

  const userId = sessionData?.session?.user?.id;

  if (!userId) {
    return { kind: "signed_out" };
  }

  const { data: partnerId, error: partnerIdError } =
    await supabase.rpc("nf_partner_id_for_user");

  if (partnerIdError) {
    throw new Error(partnerIdError.message);
  }

  if (partnerId) {
    const [
      accountResult,
      mappingResult,
      milestonesResult,
      goalsResult,
      resourcesResult,
      eventsResult,
    ] = await Promise.all([
      supabase
        .from("partner_accounts")
        .select(
          "id,business_name,public_name,contact_name,email,partner_type," +
          "relationship_status,partner_level,partner_level_updated_at," +
          "auth_access_enabled,preferred_delivery_days,preferred_fulfillment," +
          "receiving_notes,delivery_notes,locator_permission," +
          "event_submission_enabled,address_line1,address_line2,city,state,zip"
        )
        .eq("id", partnerId)
        .maybeSingle(),

      supabase
        .from("partner_users")
        .select(
          "partner_id,user_id,email,partner_role,active,invited_at,last_access_at"
        )
        .eq("user_id", userId)
        .eq("partner_id", partnerId)
        .maybeSingle(),

      supabase
        .from("partner_milestones")
        .select(
          "id,milestone_key,title,description,status,responsible_party," +
          "next_action,due_at,completed_at,partner_visible_notes,sort"
        )
        .eq("partner_id", partnerId)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("partner_goals")
        .select(
          "id,title,description,goal_type,status,target_value,current_value," +
          "unit_label,start_on,due_on,completed_at,next_action," +
          "partner_visible_notes,sort"
        )
        .eq("partner_id", partnerId)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true }),

      supabase
        .from("partner_resources")
        .select(
          "id,title,description,category,storage_bucket,storage_path," +
          "version_label,effective_at,expires_at,sort"
        )
        .order("sort", { ascending: true })
        .order("title", { ascending: true }),

      supabase
        .from("partner_events")
        .select(
          "id,partner_id,title,description,start_at,end_at,venue_name," +
          "address_line1,address_line2,city,state,zip,image_bucket," +
          "image_path,status,rejection_reason,submitted_at,approved_at," +
          "published_at,created_at,updated_at"
        )
        .eq("partner_id", partnerId)
        .order("start_at", { ascending: false }),
    ]);

    if (accountResult.error) {
      throw new Error(accountResult.error.message);
    }

    if (mappingResult.error) {
      throw new Error(mappingResult.error.message);
    }

    if (milestonesResult.error) {
      throw new Error(milestonesResult.error.message);
    }

    if (goalsResult.error) {
      throw new Error(goalsResult.error.message);
    }

    if (resourcesResult.error) {
      throw new Error(resourcesResult.error.message);
    }

    if (eventsResult.error) {
      throw new Error(eventsResult.error.message);
    }

    if (!accountResult.data || !mappingResult.data) {
      return { kind: "unauthorized" };
    }

    return {
      kind: "partner",
      account: accountResult.data,
      mapping: mappingResult.data,
      milestones: milestonesResult.data ?? [],
      goals: goalsResult.data ?? [],
      resources: resourcesResult.data ?? [],
      events: eventsResult.data ?? [],
    };
  }

  if (await amAdmin()) {
    return { kind: "admin" };
  }

  return { kind: "unauthorized" };
}


/* ---------- partner replenishment ---------- */

export async function getPartnerReplenishmentCatalog() {
  const { data, error } = await supabase.rpc(
    "get_partner_replenishment_catalog"
  );

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function listPartnerReplenishmentRequests() {
  const { data, error } = await supabase
    .from("partner_replenishment_requests")
    .select(
      "id,partner_id,status,needed_by,fulfillment_method," +
      "preferred_delivery_days,current_inventory_notes,request_notes," +
      "partner_response,partner_reply,partner_replied_at,price_version," +
      "requested_subtotal_cents,quote_subtotal_cents," +
      "fulfillment_charge_cents,confirmed_total_cents,submitted_at," +
      "reviewed_at,created_at,updated_at,quoted_at,accepted_at,paid_at," +
      "fulfilled_at,cancelled_at,declined_at," +
      "items:partner_replenishment_items(" +
      "id,request_id,flavor_id,flavor_name,size_id,texture,quantity," +
      "on_hand_count,notes,unit_price_cents,price_version,line_total_cents" +
      ")"
    )
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitPartnerReplenishment(payload) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);

  const accessToken =
    sessionData?.session?.access_token;

  if (!accessToken) {
    throw new Error("Partner authentication is required.");
  }

  let response;

  try {
    response = await fetch(
      "/.netlify/functions/partner-replenishment-submit",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      }
    );
  } catch {
    const connectionError = new Error(
      "The connection was interrupted before the submission could be confirmed."
    );
    connectionError.code =
      "REPLENISHMENT_SUBMISSION_UNKNOWN";
    throw connectionError;
  }

  let data;

  try {
    data = await response.json();
  } catch {
    const responseError = new Error(
      "The replenishment service returned an incomplete response."
    );
    responseError.code =
      "REPLENISHMENT_SUBMISSION_UNKNOWN";
    throw responseError;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      "The replenishment request could not be submitted."
    );
  }

  if (!data?.requestId) {
    const confirmationError = new Error(
      "The request may have been saved, but its confirmation could not be loaded."
    );
    confirmationError.code =
      "REPLENISHMENT_SUBMISSION_UNKNOWN";
    throw confirmationError;
  }

  return {
    requestId: data.requestId,
    emailWarning: data.emailWarning === true,
  };
}

export async function partnerReplenishmentAction(
  requestId,
  action,
  partnerReply = null
) {
  const { data, error } = await supabase.rpc(
    "partner_replenishment_action",
    {
      p_request_id: requestId,
      p_action: action,
      p_partner_reply: partnerReply,
    }
  );

  if (error) throw new Error(error.message);
  return data;
}


/* ---------- partner foodservice & bulk ordering ---------- */

export async function getPartnerBulkOrderCatalog() {
  const { data, error } = await supabase.rpc(
    "get_partner_bulk_order_catalog"
  );

  if (error) {
    const message = String(error.message || "");
    if (/get_partner_bulk_order_catalog|does not exist|schema cache/i.test(message)) {
      return {
        enabled: false,
        eligible: false,
        unavailable: true,
        price_version: "bulk-2026-08",
        sizes: [],
        flavors: [],
      };
    }
    throw new Error(message);
  }

  return {
    enabled: data?.enabled === true,
    eligible: data?.eligible === true,
    unavailable: false,
    price_version: data?.price_version || "bulk-2026-08",
    sizes: Array.isArray(data?.sizes) ? data.sizes : [],
    flavors: Array.isArray(data?.flavors) ? data.flavors : [],
  };
}

export async function listPartnerBulkOrderRequests() {
  const { data, error } = await supabase
    .from("partner_bulk_order_requests")
    .select(
      "id,partner_id,status,needed_by,fulfillment_method," +
      "preferred_delivery_days,request_notes,partner_response,partner_reply," +
      "partner_replied_at,price_version,requested_subtotal_cents," +
      "quote_subtotal_cents,fulfillment_charge_cents,confirmed_total_cents," +
      "submitted_at,reviewed_at,created_at,updated_at,quoted_at,accepted_at," +
      "paid_at,fulfilled_at,cancelled_at,declined_at," +
      "items:partner_bulk_order_items(" +
      "id,request_id,honey_type,flavor_id,flavor_name,size_id,size_label," +
      "quantity,notes,unit_price_cents,price_version,line_total_cents" +
      ")"
    )
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    const message = String(error.message || "");
    if (/partner_bulk_order_requests|does not exist|schema cache/i.test(message)) {
      return [];
    }
    throw new Error(message);
  }
  return data ?? [];
}

export async function submitPartnerBulkOrder(payload) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);

  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("Partner authentication is required.");

  let response;
  try {
    response = await fetch("/.netlify/functions/partner-bulk-order-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    const connectionError = new Error(
      "The connection was interrupted before the bulk order submission could be confirmed."
    );
    connectionError.code = "BULK_ORDER_SUBMISSION_UNKNOWN";
    throw connectionError;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const responseError = new Error(
      "The bulk ordering service returned an incomplete response."
    );
    responseError.code = "BULK_ORDER_SUBMISSION_UNKNOWN";
    throw responseError;
  }

  if (!response.ok) {
    throw new Error(data?.error || "The bulk order request could not be submitted.");
  }

  if (!data?.requestId) {
    const confirmationError = new Error(
      "The bulk request may have been saved, but its confirmation could not be loaded."
    );
    confirmationError.code = "BULK_ORDER_SUBMISSION_UNKNOWN";
    throw confirmationError;
  }

  return {
    requestId: data.requestId,
    emailWarning: data.emailWarning === true,
  };
}

export async function partnerBulkOrderAction(
  requestId,
  action,
  partnerReply = null
) {
  const { data, error } = await supabase.rpc("partner_bulk_order_action", {
    p_request_id: requestId,
    p_action: action,
    p_partner_reply: partnerReply,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function getAdminPartnerBulkOrderHistory(
  partnerId = null,
  requestId = null
) {
  const { data, error } = await supabase.rpc(
    "get_admin_partner_bulk_order_history",
    {
      p_partner_id: partnerId,
      p_request_id: requestId,
    }
  );

  if (error) {
    const message = String(error.message || "");
    if (/get_admin_partner_bulk_order_history|does not exist|schema cache/i.test(message)) {
      return [];
    }
    throw new Error(message);
  }

  return Array.isArray(data?.requests) ? data.requests : [];
}

export async function adminPartnerBulkOrderAction(
  requestId,
  action,
  {
    partnerResponse = null,
    adminNotes = null,
    fulfillmentChargeCents = null,
  } = {}
) {
  if (!requestId) throw new Error("Choose a bulk order request.");

  const allowedActions = [
    "save_notes",
    "under_review",
    "needs_information",
    "quote",
    "mark_paid",
    "fulfill",
    "decline",
    "cancel",
  ];

  if (!allowedActions.includes(action)) {
    throw new Error("Choose a valid bulk order action.");
  }

  const { data, error } = await supabase.rpc(
    "admin_partner_bulk_order_action",
    {
      p_request_id: requestId,
      p_action: action,
      p_partner_response: partnerResponse,
      p_admin_notes: adminNotes,
      p_fulfillment_charge_cents: fulfillmentChargeCents,
    }
  );

  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("The bulk order action returned no updated request.");
  return data;
}


/* ---------- admin ---------- */

const cleanAdminPatch = (patch, allowedFields) =>
  Object.fromEntries(
    Object.entries(patch || {}).filter(([key]) =>
      allowedFields.includes(key)
    )
  );

export async function listAdminPartnerAccounts() {
  const { data, error } = await supabase
    .from("partner_accounts")
    .select(
      "id,business_name,public_name,contact_name,email,partner_type," +
      "relationship_status,partner_level,partner_level_updated_at," +
      "auth_access_enabled,locator_permission,event_submission_enabled," +
      "created_at,updated_at"
    )
    .order("business_name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAdminPartnerReplenishmentHistory(
  partnerId = null,
  requestId = null
) {
  const { data, error } = await supabase.rpc(
    "get_admin_partner_replenishment_history",
    {
      p_partner_id: partnerId,
      p_request_id: requestId,
    }
  );

  if (error) throw new Error(error.message);

  return Array.isArray(data?.requests)
    ? data.requests
    : [];
}

export async function adminPartnerReplenishmentAction(
  requestId,
  action,
  {
    partnerResponse = null,
    adminNotes = null,
    fulfillmentChargeCents = null,
  } = {}
) {
  if (!requestId) {
    throw new Error("Choose a replenishment request.");
  }

  const allowedActions = [
    "save_notes",
    "under_review",
    "needs_information",
    "quote",
    "mark_paid",
    "fulfill",
    "decline",
    "cancel",
  ];

  if (!allowedActions.includes(action)) {
    throw new Error("Choose a valid replenishment action.");
  }

  const { data, error } = await supabase.rpc(
    "admin_partner_replenishment_action",
    {
      p_request_id: requestId,
      p_action: action,
      p_partner_response: partnerResponse,
      p_admin_notes: adminNotes,
      p_fulfillment_charge_cents: fulfillmentChargeCents,
    }
  );

  if (error) throw new Error(error.message);

  if (!data?.id) {
    throw new Error(
      "The replenishment action returned no updated request."
    );
  }

  return data;
}

export async function getAdminPartnerProgress(partnerId) {
  if (!partnerId) throw new Error("Choose a partner account.");

  const [milestonesResult, goalsResult] = await Promise.all([
    supabase
      .from("partner_milestones")
      .select(
        "id,partner_id,milestone_key,title,description,status," +
        "responsible_party,next_action,due_at,completed_at," +
        "partner_visible_notes,visible_to_partner,sort,created_at,updated_at"
      )
      .eq("partner_id", partnerId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("partner_goals")
      .select(
        "id,partner_id,title,description,goal_type,status,target_value," +
        "current_value,unit_label,start_on,due_on,completed_at,next_action," +
        "partner_visible_notes,visible_to_partner,sort,created_at,updated_at"
      )
      .eq("partner_id", partnerId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (milestonesResult.error) {
    throw new Error(milestonesResult.error.message);
  }

  if (goalsResult.error) {
    throw new Error(goalsResult.error.message);
  }

  return {
    milestones: milestonesResult.data ?? [],
    goals: goalsResult.data ?? [],
  };
}

export async function updateAdminPartnerLevel(partnerId, partnerLevel) {
  const allowedLevels = ["starter", "growth", "strategic"];

  if (!allowedLevels.includes(partnerLevel)) {
    throw new Error("Choose a valid partner level.");
  }

  const { data, error } = await supabase
    .from("partner_accounts")
    .update({ partner_level: partnerLevel })
    .eq("id", partnerId)
    .select(
      "id,business_name,public_name,contact_name,email,partner_type," +
      "relationship_status,partner_level,partner_level_updated_at," +
      "auth_access_enabled,locator_permission,event_submission_enabled," +
      "created_at,updated_at"
    )
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAdminPartnerMilestone(id, patch) {
  const allowedFields = [
    "status",
    "responsible_party",
    "next_action",
    "due_at",
    "partner_visible_notes",
    "visible_to_partner",
  ];

  const payload = cleanAdminPatch(patch, allowedFields);

  const { data, error } = await supabase
    .from("partner_milestones")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createAdminPartnerGoal(partnerId, goal) {
  const title = String(goal?.title || "").trim();

  if (!title) throw new Error("Enter a goal title.");

  const allowedFields = [
    "description",
    "goal_type",
    "status",
    "target_value",
    "current_value",
    "unit_label",
    "start_on",
    "due_on",
    "next_action",
    "partner_visible_notes",
    "visible_to_partner",
  ];

  const payload = {
    partner_id: partnerId,
    title,
    ...cleanAdminPatch(goal, allowedFields),
  };

  const { data, error } = await supabase
    .from("partner_goals")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateAdminPartnerGoal(id, goal) {
  const title = String(goal?.title || "").trim();

  if (!title) throw new Error("Every goal requires a title.");

  const allowedFields = [
    "description",
    "goal_type",
    "status",
    "target_value",
    "current_value",
    "unit_label",
    "start_on",
    "due_on",
    "next_action",
    "partner_visible_notes",
    "visible_to_partner",
  ];

  const payload = {
    title,
    ...cleanAdminPatch(goal, allowedFields),
  };

  const { data, error } = await supabase
    .from("partner_goals")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteAdminPartnerGoal(id) {
  const { error } = await supabase
    .from("partner_goals")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

const PARTNER_EVENT_SELECT =
  "id,partner_id,title,description,start_at,end_at,venue_name," +
  "address_line1,address_line2,city,state,zip,image_bucket,image_path," +
  "status,rejection_reason,submitted_at,approved_at,approved_by," +
  "published_at,created_at,updated_at";

const partnerEventWordCount = (value) => {
  const cleaned = String(value || "").trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
};

const partnerEventOptionalText = (value) => {
  const cleaned = String(value || "").trim();
  return cleaned || null;
};

const partnerEventIsoDate = (value, label, required = false) => {
  if (!value) {
    if (required) throw new Error(`Choose the event ${label}.`);
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Choose a valid event ${label}.`);
  return date.toISOString();
};

const partnerEventPayload = (event) => {
  const title = String(event?.title || "").trim();
  const description = String(event?.description || "").trim();
  const zip = String(event?.zip || "").replace(/\D/g, "");
  const startAt = partnerEventIsoDate(event?.start_at, "start date and time", true);
  const endAt = partnerEventIsoDate(event?.end_at, "end date and time");

  if (!title) throw new Error("Enter an event title.");
  if (title.length > 120) throw new Error("Event titles may contain no more than 120 characters.");
  if (!description) throw new Error("Enter an event description.");
  if (partnerEventWordCount(description) > 50) throw new Error("Event descriptions may contain no more than 50 words.");
  if (endAt && new Date(endAt) < new Date(startAt)) throw new Error("The event end time cannot be before the start time.");
  if (zip && zip.length !== 5) throw new Error("Enter a complete five-digit event ZIP code.");

  return {
    title,
    description,
    start_at: startAt,
    end_at: endAt,
    venue_name: partnerEventOptionalText(event?.venue_name),
    address_line1: partnerEventOptionalText(event?.address_line1),
    address_line2: partnerEventOptionalText(event?.address_line2),
    city: partnerEventOptionalText(event?.city),
    state: partnerEventOptionalText(event?.state)?.toUpperCase().slice(0, 2) || null,
    zip: zip || null,
  };
};

const partnerEventUuid = () => {
  const value = globalThis.crypto?.randomUUID?.();
  if (!value) throw new Error("This browser cannot securely create a new event identifier.");
  return value;
};

const partnerEventSafeName = (name) =>
  String(name || "event-flyer")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "event-flyer";

const validatePartnerEventFlyer = (file) => {
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Event flyers must be PNG, JPG, or WebP images.");
  }
  if (file.size > 8 * 1024 * 1024) throw new Error("Event flyers must be 8 MB or smaller.");
};

async function uploadPartnerEventFlyer(event, file) {
  validatePartnerEventFlyer(file);
  if (!file) return event;
  if (!["draft", "rejected"].includes(event.status)) {
    throw new Error("Submitted and approved event flyers are locked for review.");
  }

  const existingPath = String(event.image_path || "");
  const storagePath = existingPath ||
    `${event.partner_id}/${event.id}/${partnerEventUuid()}-${partnerEventSafeName(file.name)}`;

  let prepared = event;

  if (!existingPath) {
    const { data, error } = await supabase
      .from("partner_events")
      .update({
        image_bucket: "partner-event-images",
        image_path: storagePath,
        status: "draft",
      })
      .eq("id", event.id)
      .in("status", ["draft", "rejected"])
      .select(PARTNER_EVENT_SELECT)
      .single();

    if (error) throw new Error(error.message);
    prepared = data;
  }

  const { error: uploadError } = await supabase.storage
    .from("partner-event-images")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: !!existingPath,
    });

  if (uploadError) {
    if (!existingPath) {
      await supabase
        .from("partner_events")
        .update({ image_path: null })
        .eq("id", event.id)
        .eq("status", "draft");
    }
    throw new Error(uploadError.message);
  }

  return { ...prepared, image_bucket: "partner-event-images", image_path: storagePath };
}

export async function createPartnerEventDraft(partnerId, event, flyer) {
  if (!partnerId) throw new Error("A connected partner account is required.");
  validatePartnerEventFlyer(flyer);

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);

  const userId = sessionData?.session?.user?.id;
  if (!userId) throw new Error("Partner authentication is required.");

  const { data, error } = await supabase
    .from("partner_events")
    .insert({
      id: partnerEventUuid(),
      partner_id: partnerId,
      submitted_by: userId,
      status: "draft",
      image_bucket: "partner-event-images",
      image_path: null,
      ...partnerEventPayload(event),
    })
    .select(PARTNER_EVENT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return flyer ? uploadPartnerEventFlyer(data, flyer) : data;
}

export async function updatePartnerEventDraft(eventId, event, flyer) {
  if (!eventId) throw new Error("Choose an editable event.");
  validatePartnerEventFlyer(flyer);

  const { data, error } = await supabase
    .from("partner_events")
    .update({
      ...partnerEventPayload(event),
      status: "draft",
      rejection_reason: null,
    })
    .eq("id", eventId)
    .in("status", ["draft", "rejected"])
    .select(PARTNER_EVENT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return flyer ? uploadPartnerEventFlyer(data, flyer) : data;
}

export async function submitPartnerEvent(eventId) {
  if (!eventId) throw new Error("Choose an event to submit.");

  const { data, error } = await supabase
    .from("partner_events")
    .update({ status: "submitted", rejection_reason: null })
    .eq("id", eventId)
    .in("status", ["draft", "rejected"])
    .select(PARTNER_EVENT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPartnerEventFlyerUrl(event) {
  const bucket = String(event?.image_bucket || "partner-event-images");
  const storagePath = String(event?.image_path || "");

  if (bucket !== "partner-event-images" || !storagePath) throw new Error("This event does not have a flyer.");

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 120);
  if (error) throw new Error(error.message);
  if (!data?.signedUrl) throw new Error("The private flyer link could not be created.");
  return data.signedUrl;
}

export async function listAdminPartnerEvents() {
  const { data, error } = await supabase
    .from("partner_events")
    .select(PARTNER_EVENT_SELECT)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateAdminPartnerEventAccess(partnerId, patch) {
  const payload = cleanAdminPatch(patch, ["event_submission_enabled", "locator_permission"]);

  const { data, error } = await supabase
    .from("partner_accounts")
    .update(payload)
    .eq("id", partnerId)
    .select(
      "id,business_name,public_name,contact_name,email,partner_type," +
      "relationship_status,partner_level,partner_level_updated_at," +
      "auth_access_enabled,locator_permission,event_submission_enabled," +
      "created_at,updated_at"
    )
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function reviewAdminPartnerEvent(eventId, decision, rejectionReason = "") {
  if (!["approved", "rejected", "cancelled"].includes(decision)) {
    throw new Error("Choose a valid event review decision.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);

  const userId = sessionData?.session?.user?.id;
  if (!userId) throw new Error("Admin authentication is required.");

  const now = new Date().toISOString();
  let payload;

  if (decision === "approved") {
    payload = {
      status: "approved",
      rejection_reason: null,
      approved_at: now,
      approved_by: userId,
      published_at: now,
    };
  } else if (decision === "rejected") {
    const reason = String(rejectionReason || "").trim();
    if (!reason) throw new Error("Enter the revision requested before rejecting the event.");

    payload = {
      status: "rejected",
      rejection_reason: reason,
      approved_at: null,
      approved_by: null,
      published_at: null,
    };
  } else {
    payload = { status: "cancelled", published_at: null };
  }

  const { data, error } = await supabase
    .from("partner_events")
    .update(payload)
    .eq("id", eventId)
    .select(PARTNER_EVENT_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPartnerResourceDownloadUrl(resource) {
  const bucket = String(
    resource?.storage_bucket || "partner-resources"
  );
  const storagePath = String(resource?.storage_path || "");

  if (bucket !== "partner-resources" || !storagePath) {
    throw new Error("This resource does not have a valid private file.");
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 120, {
      download: true,
    });

  if (error) throw new Error(error.message);
  if (!data?.signedUrl) {
    throw new Error("The private download link could not be created.");
  }

  return data.signedUrl;
}

export async function listAdminPartnerResources() {
  const { data, error } = await supabase
    .from("partner_resources")
    .select(
      "id,title,description,category,storage_bucket,storage_path," +
      "visible_to_partner_types,status,version_label,effective_at," +
      "expires_at,sort,created_by,created_at,updated_at"
    )
    .order("sort", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

const partnerResourceSafeName = (name) =>
  String(name || "resource")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "resource";

export async function createAdminPartnerResource(file, resource) {
  if (!file) throw new Error("Choose a resource file.");

  const allowedMimeTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
  ];

  if (!allowedMimeTypes.includes(file.type)) {
    throw new Error(
      "Resources must be PDF, PNG, JPG, or WebP files."
    );
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Resource files must be 25 MB or smaller.");
  }

  const title = String(resource?.title || "").trim();

  if (!title) throw new Error("Enter a resource title.");

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);

  const userId = sessionData?.session?.user?.id;

  if (!userId) throw new Error("Admin authentication is required.");

  const randomPart =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const safeName = partnerResourceSafeName(file.name);
  const storagePath =
    `resources/${new Date().toISOString().slice(0, 10)}/` +
    `${randomPart}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("partner-resources")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const allowedFields = [
    "description",
    "category",
    "visible_to_partner_types",
    "version_label",
    "expires_at",
    "sort",
  ];

  const payload = {
    title,
    storage_bucket: "partner-resources",
    storage_path: storagePath,
    status: "draft",
    created_by: userId,
    ...cleanAdminPatch(resource, allowedFields),
  };

  const { data, error } = await supabase
    .from("partner_resources")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    await supabase.storage
      .from("partner-resources")
      .remove([storagePath]);

    throw new Error(error.message);
  }

  return data;
}

export async function updateAdminPartnerResource(id, patch) {
  const allowedFields = [
    "title",
    "description",
    "category",
    "visible_to_partner_types",
    "status",
    "version_label",
    "expires_at",
    "sort",
  ];

  const payload = cleanAdminPatch(patch, allowedFields);

  if (
    Object.prototype.hasOwnProperty.call(payload, "title") &&
    !String(payload.title || "").trim()
  ) {
    throw new Error("Every resource requires a title.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    payload.title = String(payload.title).trim();
  }

  const { data, error } = await supabase
    .from("partner_resources")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/* ---------- existing admin operations ---------- */

export const listOrders = () =>
  supabase.from("orders")
    .select("*, order_items(*), order_item_changes(*), customers(flagged, consecutive_noshows), market_dates(*, venues(name, hours, where_at))")
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

export const setHomepageHeroImage = async (imageUrl) => {
  const value = String(imageUrl || "").trim();

  const { data, error } = await supabase
    .from("settings")
    .upsert(
      { key: "homepage_hero_image", value },
      { onConflict: "key" }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export async function uploadHomepageHeroImage(file) {
  if (!file) throw new Error("Choose an image first.");

  const extension = (file.name.split(".").pop() || "png").toLowerCase();
  const safeExtension = ["png", "jpg", "jpeg", "webp"].includes(extension)
    ? extension
    : "png";
  const path = `homepage/hero-${Date.now()}.${safeExtension}`;

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

export async function addMarketDate(venue_id, day) {
  const { data: venue, error: venueError } = await supabase
    .from("venues")
    .select("where_at,hours")
    .eq("id", venue_id)
    .single();

  if (venueError) throw new Error(venueError.message);

  let result = await supabase
    .from("market_dates")
    .insert({
      venue_id,
      day,
      active: true,
      where_at: venue?.where_at || null,
      hours: venue?.hours || null,
    })
    .select()
    .single();

  // The migration is additive and may be applied immediately after deploy.
  // Until then, keep date creation working with the original schema.
  if (
    result.error &&
    (result.error.code === "PGRST204" ||
      /active|where_at|hours/i.test(result.error.message || ""))
  ) {
    result = await supabase
      .from("market_dates")
      .insert({ venue_id, day })
      .select()
      .single();
  }

  if (result.error?.code === "23505") {
    throw new Error("That market is already scheduled for this date.");
  }
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export const updateMarketDate = (id, patch) =>
  supabase.from("market_dates").update(patch).eq("id", id).then(throwIf);

export const removeMarketDate = (id) =>
  supabase.from("market_dates")
    .update({ active: false })
    .eq("id", id)
    .then(throwIf);

export const restoreMarketDate = (id) =>
  supabase.from("market_dates")
    .update({ active: true })
    .eq("id", id)
    .then(throwIf);

export const listAllMarketDates = () =>
  supabase.from("market_dates")
    .select("*, venues(name, where_at, hours)")
    .order("day")
    .then(throwIf);

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
  const response = await fetch("/.netlify/functions/pay-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  const rawBody = await response.text();
  let payload = {};

  if (rawBody.trim()) {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Payment service returned an unreadable response (${response.status}).`
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      payload.error ||
      `Payment service could not create the Square payment link (${response.status}).`
    );
  }

  if (!payload.url) {
    throw new Error(
      "The payment service returned an empty response. The order is saved, but no Square payment link was created."
    );
  }

  return payload.url;
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
