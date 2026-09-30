import { supabase } from "./supabase";

const take = async (promise) => {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
};

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function signInAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  const ok = await isAdmin();
  if (!ok) {
    await supabase.auth.signOut();
    throw new Error("This account does not have NectarFusions Admin access.");
  }
  return data?.session || null;
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function isAdmin() {
  const { data, error } = await supabase.rpc("nf_is_admin");
  if (error) throw error;
  return Boolean(data);
}

export async function listInventory() {
  return take(
    supabase
      .from("nfos_inventory_summary")
      .select("*")
      .order("item_type")
      .order("name")
  );
}

export async function listLowStock() {
  return take(
    supabase
      .from("nfos_low_stock")
      .select("*")
      .order("item_type")
      .order("name")
  );
}

export async function listItems() {
  return take(
    supabase
      .from("nfos_items")
      .select("*")
      .order("item_type")
      .order("name")
  );
}

export async function listLocations() {
  return take(
    supabase
      .from("nfos_locations")
      .select("*")
      .order("active", { ascending: false })
      .order("name")
  );
}

export async function listSuppliers() {
  return take(
    supabase
      .from("nfos_suppliers")
      .select("*")
      .order("active", { ascending: false })
      .order("name")
  );
}

export async function listLots(itemId = null) {
  let query = supabase
    .from("nfos_lots")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(250);
  if (itemId) query = query.eq("item_id", itemId);
  return take(query);
}

export async function listTransactions(limit = 150) {
  return take(
    supabase
      .from("nfos_inventory_transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(limit)
  );
}

export async function receiveItem(payload) {
  return take(
    supabase.rpc("nfos_receive_item", {
      p_item_id: payload.itemId,
      p_location_id: payload.locationId,
      p_quantity: Number(payload.quantity),
      p_lot_code: payload.lotCode?.trim() || null,
      p_supplier_id: payload.supplierId || null,
      p_supplier_lot_code: payload.supplierLotCode?.trim() || null,
      p_total_cost:
        payload.totalCost === "" || payload.totalCost == null
          ? null
          : Number(payload.totalCost),
      p_received_at: payload.receivedAt || new Date().toISOString(),
      p_notes: payload.notes?.trim() || null,
    })
  );
}

export async function adjustInventory(payload) {
  const amount = Math.abs(Number(payload.quantity));
  const delta = payload.direction === "remove" ? -amount : amount;
  return take(
    supabase.rpc("nfos_adjust_inventory", {
      p_item_id: payload.itemId,
      p_location_id: payload.locationId,
      p_quantity_delta: delta,
      p_lot_id: payload.lotId || null,
      p_reason: payload.reason?.trim() || null,
      p_notes: payload.notes?.trim() || null,
    })
  );
}

export async function transferInventory(payload) {
  return take(
    supabase.rpc("nfos_transfer_inventory", {
      p_item_id: payload.itemId,
      p_quantity: Number(payload.quantity),
      p_from_location_id: payload.fromLocationId,
      p_to_location_id: payload.toLocationId,
      p_lot_id: payload.lotId || null,
      p_reference_type: payload.referenceType || "transfer",
      p_reference_id: payload.referenceId?.trim() || null,
      p_notes: payload.notes?.trim() || null,
    })
  );
}

export async function updateItem(itemId, patch) {
  return take(
    supabase
      .from("nfos_items")
      .update(patch)
      .eq("id", itemId)
      .select("*")
      .single()
  );
}

export async function createItem(input) {
  const payload = {
    item_type: input.itemType,
    sku: input.sku.trim(),
    name: input.name.trim(),
    category: input.category?.trim() || null,
    size_label: input.sizeLabel?.trim() || null,
    stocking_unit: input.stockingUnit?.trim() || "each",
    track_lots: Boolean(input.trackLots),
    reorder_point: input.reorderPoint === "" ? null : Number(input.reorderPoint),
    target_stock: input.targetStock === "" ? null : Number(input.targetStock),
    preferred_order_qty:
      input.preferredOrderQty === "" ? null : Number(input.preferredOrderQty),
    preferred_supplier_id: input.preferredSupplierId || null,
    default_location_id: input.defaultLocationId || null,
    active: true,
    notes: input.notes?.trim() || null,
  };
  return take(
    supabase.from("nfos_items").insert(payload).select("*").single()
  );
}

export async function createLocation(input) {
  return take(
    supabase
      .from("nfos_locations")
      .insert({
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        location_type: input.locationType,
        counts_as_company_inventory: Boolean(input.countsAsCompanyInventory),
        available_to_sell_online: Boolean(input.availableToSellOnline),
        active: true,
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single()
  );
}

export async function createSupplier(input) {
  return take(
    supabase
      .from("nfos_suppliers")
      .insert({
        name: input.name.trim(),
        vendor_code: input.vendorCode?.trim() || null,
        category: input.category?.trim() || null,
        contact_name: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        products_supplied: input.productsSupplied?.trim() || null,
        preferred: Boolean(input.preferred),
        active: true,
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single()
  );
}

export async function lookupBarcode(value) {
  const code = value.trim();
  if (!code) return null;
  const { data, error } = await supabase
    .from("nfos_barcode_lookup")
    .select("*")
    .eq("barcode_value", code)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
