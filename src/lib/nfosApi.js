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

export async function signInNfos(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;

  const session = data?.session || null;
  if (!session) throw new Error("NFOS sign in did not create a session.");

  let allowed = false;
  try {
    allowed = await isAdmin();
    if (!allowed) {
      const access = await getEmployeeAccess();
      allowed = Boolean(access?.permissions?.includes("ops.view"));
    }
  } catch {
    allowed = false;
  }

  if (!allowed) {
    await supabase.auth.signOut();
    throw new Error("This account does not have NectarFusions NFOS access.");
  }

  return session;
}

export async function signInAdmin(email, password) {
  return signInNfos(email, password);
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


export async function updateSupplier(supplierId, input) {
  return take(
    supabase
      .from("nfos_suppliers")
      .update({
        name: input.name.trim(),
        vendor_code: input.vendorCode?.trim() || null,
        category: input.category?.trim() || null,
        contact_name: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        products_supplied: input.productsSupplied?.trim() || null,
        preferred: Boolean(input.preferred),
        active: input.active !== false,
        notes: input.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplierId)
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

// ============================================================
// NFOS Release 2 — Recipes, Production, QC and Traceability
// ============================================================

export async function listFlavors() {
  return take(
    supabase
      .from("flavors")
      .select("id,name,active")
      .order("active", { ascending: false })
      .order("name")
  );
}

export async function listRecipes() {
  return take(
    supabase
      .from("nfos_recipe_overview")
      .select("*")
      .order("recipe_key")
      .order("version", { ascending: false })
  );
}

export async function createRecipe(input) {
  return take(
    supabase.rpc("nfos_create_recipe", {
      p_recipe_key: input.recipeKey?.trim() || null,
      p_name: input.name.trim(),
      p_legacy_flavor_id: input.flavorId || null,
      p_basis_quantity: Number(input.basisQuantity),
      p_basis_unit: input.basisUnit.trim(),
      p_expected_yield_quantity:
        input.expectedYieldQuantity === "" || input.expectedYieldQuantity == null
          ? null
          : Number(input.expectedYieldQuantity),
      p_expected_yield_unit: input.expectedYieldUnit?.trim() || null,
      p_instructions: input.instructions?.trim() || null,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function updateRecipe(recipeId, patch) {
  return take(
    supabase
      .from("nfos_recipes")
      .update(patch)
      .eq("id", recipeId)
      .select("*")
      .single()
  );
}

export async function activateRecipe(recipeId) {
  return take(supabase.rpc("nfos_activate_recipe", { p_recipe_id: recipeId }));
}

export async function cloneRecipeVersion(recipeId, notes = null) {
  return take(
    supabase.rpc("nfos_clone_recipe_version", {
      p_recipe_id: recipeId,
      p_notes: notes?.trim() || null,
    })
  );
}

export async function listRecipeInputs(recipeId) {
  return take(
    supabase
      .from("nfos_recipe_inputs")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("phase")
      .order("sequence")
  );
}

export async function addRecipeInput(input) {
  return take(
    supabase.rpc("nfos_add_recipe_input", {
      p_recipe_id: input.recipeId,
      p_item_id: input.itemId,
      p_calculation_method: input.calculationMethod || "fixed_per_basis",
      p_quantity:
        input.quantity === "" || input.quantity == null ? null : Number(input.quantity),
      p_rate_percent:
        input.ratePercent === "" || input.ratePercent == null ? null : Number(input.ratePercent),
      p_phase: input.phase?.trim() || "infusion",
      p_sequence: Number(input.sequence || 10),
      p_required: input.required !== false,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function calculateRecipeRequirements(recipeId, baseQuantity, baseUnit) {
  return take(
    supabase.rpc("nfos_calculate_recipe_requirements", {
      p_recipe_id: recipeId,
      p_base_quantity: Number(baseQuantity),
      p_base_unit: baseUnit,
    })
  );
}

export async function deleteRecipeInput(id) {
  return take(supabase.from("nfos_recipe_inputs").delete().eq("id", id));
}

export async function listRecipeSteps(recipeId) {
  return take(
    supabase
      .from("nfos_recipe_steps")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("step_no")
  );
}

export async function addRecipeStep(input) {
  return take(
    supabase
      .from("nfos_recipe_steps")
      .insert({
        recipe_id: input.recipeId,
        step_no: Number(input.stepNo),
        title: input.title?.trim() || null,
        instruction: input.instruction.trim(),
        requires_confirmation: Boolean(input.requiresConfirmation),
        critical_control: Boolean(input.criticalControl),
        expected_minutes:
          input.expectedMinutes === "" || input.expectedMinutes == null
            ? null
            : Number(input.expectedMinutes),
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single()
  );
}

export async function deleteRecipeStep(id) {
  return take(supabase.from("nfos_recipe_steps").delete().eq("id", id));
}

export async function listRecipeQualitySpecs(recipeId) {
  return take(
    supabase
      .from("nfos_recipe_quality_specs")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("sequence")
  );
}

export async function addRecipeQualitySpec(input) {
  return take(
    supabase
      .from("nfos_recipe_quality_specs")
      .insert({
        recipe_id: input.recipeId,
        check_key: input.checkKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: input.label.trim(),
        result_type: input.resultType,
        unit: input.unit?.trim() || null,
        min_value:
          input.minValue === "" || input.minValue == null ? null : Number(input.minValue),
        max_value:
          input.maxValue === "" || input.maxValue == null ? null : Number(input.maxValue),
        expected_text: input.expectedText?.trim() || null,
        required: input.required !== false,
        sequence: Number(input.sequence || 10),
        instructions: input.instructions?.trim() || null,
      })
      .select("*")
      .single()
  );
}

export async function deleteRecipeQualitySpec(id) {
  return take(supabase.from("nfos_recipe_quality_specs").delete().eq("id", id));
}

export async function listSkuBom(finishedItemId) {
  return take(
    supabase
      .from("nfos_sku_bom_items")
      .select("*")
      .eq("finished_item_id", finishedItemId)
      .order("created_at")
  );
}

export async function upsertSkuBom(input) {
  return take(
    supabase
      .from("nfos_sku_bom_items")
      .upsert(
        {
          finished_item_id: input.finishedItemId,
          component_item_id: input.componentItemId,
          quantity_per_unit: Number(input.quantityPerUnit),
          unit: input.unit,
          required: input.required !== false,
          notes: input.notes?.trim() || null,
        },
        { onConflict: "finished_item_id,component_item_id" }
      )
      .select("*")
      .single()
  );
}

export async function deleteSkuBom(id) {
  return take(supabase.from("nfos_sku_bom_items").delete().eq("id", id));
}

export async function listProductionQueue() {
  return take(
    supabase
      .from("nfos_production_queue")
      .select("*")
      .order("status")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
  );
}

export async function createProductionOrder(input) {
  return take(
    supabase.rpc("nfos_create_production_order", {
      p_recipe_id: input.recipeId,
      p_planned_quantity: Number(input.plannedQuantity),
      p_planned_unit: input.plannedUnit?.trim() || null,
      p_due_date: input.dueDate || null,
      p_priority: input.priority || "normal",
      p_assigned_to: null,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function createProductionOrderWithPlan(input) {
  return take(
    supabase.rpc("nfos_create_production_order_with_plan", {
      p_recipe_id: input.recipeId,
      p_planned_quantity: Number(input.plannedQuantity),
      p_planned_unit: input.plannedUnit?.trim() || null,
      p_texture: input.texture || null,
      p_outputs: (input.outputs || []).map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        notes: row.notes?.trim() || null,
      })),
      p_due_date: input.dueDate || null,
      p_priority: input.priority || "normal",
      p_assigned_to: null,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function listProductionOrderOutputs(productionOrderId) {
  return take(
    supabase
      .from("nfos_production_order_outputs")
      .select("id,production_order_id,finished_item_id,quantity_planned,notes")
      .eq("production_order_id", productionOrderId)
      .order("created_at")
  );
}

export async function updateProductionOrderWithPlan(input) {
  return take(
    supabase.rpc("nfos_update_production_order_with_plan", {
      p_production_order_id: input.productionOrderId,
      p_recipe_id: input.recipeId,
      p_planned_quantity: Number(input.plannedQuantity),
      p_texture: input.texture || "regular",
      p_outputs: (input.outputs || []).map((row) => ({
        item_id: row.item_id,
        quantity: Number(row.quantity),
        notes: row.notes?.trim() || null,
      })),
      p_due_date: input.dueDate || null,
      p_priority: input.priority || "normal",
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function deleteProductionOrder(productionOrderId) {
  return take(
    supabase.rpc("nfos_delete_production_order", {
      p_production_order_id: productionOrderId,
    })
  );
}

export async function deleteUnpostedBatch(batchId, deleteProductionOrder = false) {
  return take(
    supabase.rpc("nfos_delete_unposted_batch", {
      p_batch_id: batchId,
      p_delete_production_order: Boolean(deleteProductionOrder),
    })
  );
}

export async function listBatches() {
  return take(
    supabase
      .from("nfos_batch_overview")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(250)
  );
}

export async function startBatch(input) {
  return take(
    supabase.rpc("nfos_start_batch_with_texture", {
      p_recipe_id: input.recipeId || null,
      p_production_order_id: input.productionOrderId || null,
      p_location_id: input.locationId || null,
      p_planned_quantity:
        input.plannedQuantity === "" || input.plannedQuantity == null
          ? null
          : Number(input.plannedQuantity),
      p_planned_unit: input.plannedUnit?.trim() || null,
      p_texture: input.texture || "regular",
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function listBatchSop(batchId) {
  return take(
    supabase
      .from("nfos_batch_sop")
      .select("*")
      .eq("batch_id", batchId)
      .order("step_no")
  );
}

export async function setBatchStepCompletion(input) {
  return take(
    supabase.rpc("nfos_set_batch_step_completion", {
      p_batch_id: input.batchId,
      p_recipe_step_id: input.recipeStepId,
      p_completed: Boolean(input.completed),
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function setSpunBatchDetails(input) {
  return take(
    supabase.rpc("nfos_set_spun_batch_details", {
      p_batch_id: input.batchId,
      p_seed_source_batch_code: input.seedSourceBatchCode?.trim() || null,
      p_seed_actual_quantity:
        input.seedActualQuantity === "" || input.seedActualQuantity == null
          ? null
          : Number(input.seedActualQuantity),
      p_seed_unit: input.seedUnit || "oz",
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function confirmSpunCure(batchId, notes = "") {
  return take(
    supabase.rpc("nfos_confirm_spun_cure", {
      p_batch_id: batchId,
      p_notes: notes?.trim() || null,
    })
  );
}

export async function listBatchRequirements(batchId) {
  return take(
    supabase
      .from("nfos_batch_requirements")
      .select("*")
      .eq("batch_id", batchId)
      .order("phase")
      .order("sequence")
  );
}

export async function listLotBalances(itemId = null) {
  let query = supabase
    .from("nfos_lot_balances")
    .select("*")
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });
  if (itemId) query = query.eq("item_id", itemId);
  return take(query);
}

export async function voidUnusedLot(input) {
  return take(
    supabase.rpc("nfos_void_unused_lot", {
      p_lot_id: input.lotId,
      p_reason: input.reason?.trim() || "Typo / entry error",
    })
  );
}

export async function listQualityChecks(batchId) {
  return take(
    supabase
      .from("nfos_quality_checks")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at")
  );
}

export async function recordQualityCheck(input) {
  return take(
    supabase.rpc("nfos_record_quality_check", {
      p_batch_id: input.batchId,
      p_check_key: input.checkKey,
      p_numeric_value:
        input.numericValue === "" || input.numericValue == null
          ? null
          : Number(input.numericValue),
      p_text_value: input.textValue?.trim() || null,
      p_boolean_value:
        input.booleanValue === "" || input.booleanValue == null
          ? null
          : Boolean(input.booleanValue),
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function completeBatch(input) {
  return take(
    supabase.rpc("nfos_complete_batch", {
      p_batch_id: input.batchId,
      p_inputs: input.inputs || [],
      p_outputs: input.outputs || [],
      p_actual_bulk_yield:
        input.actualBulkYield === "" || input.actualBulkYield == null
          ? null
          : Number(input.actualBulkYield),
      p_yield_unit: input.yieldUnit?.trim() || null,
      p_include_packaging_bom: input.includePackagingBom !== false,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function listBatchInputs(batchId) {
  return take(
    supabase
      .from("nfos_batch_inputs")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at")
  );
}

export async function listBatchOutputs(batchId) {
  return take(
    supabase
      .from("nfos_batch_outputs")
      .select("*")
      .eq("batch_id", batchId)
      .order("created_at")
  );
}


// NFOS Purchasing + Reorder Planning
export async function listReorderRecommendations() {
  return take(
    supabase
      .from("nfos_purchase_recommendations")
      .select("*")
      .order("recommendation_reason")
      .order("supplier_name", { nullsFirst: false })
      .order("name")
  );
}

export async function listPurchaseOrders() {
  return take(
    supabase
      .from("nfos_purchase_order_overview")
      .select("*")
      .order("created_at", { ascending: false })
  );
}

export async function listPurchaseOrderLines(purchaseOrderId) {
  return take(
    supabase
      .from("nfos_purchase_order_line_overview")
      .select("*")
      .eq("purchase_order_id", purchaseOrderId)
      .order("item_name")
  );
}

export async function createReorderPurchaseOrder(input) {
  return take(
    supabase.rpc("nfos_create_reorder_po", {
      p_supplier_id: input.supplierId,
      p_expected_date: input.expectedDate || null,
      p_destination_location_id: input.destinationLocationId || null,
      p_notes: input.notes?.trim() || null,
    })
  );
}

export async function submitPurchaseOrder(purchaseOrderId) {
  return take(
    supabase.rpc("nfos_submit_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
    })
  );
}

export async function receivePurchaseOrderLine(input) {
  return take(
    supabase.rpc("nfos_receive_purchase_order_line", {
      p_purchase_order_line_id: input.purchaseOrderLineId,
      p_quantity: Number(input.quantity),
      p_lot_code: input.lotCode?.trim() || null,
      p_supplier_lot_code: input.supplierLotCode?.trim() || null,
      p_received_at: input.receivedAt || new Date().toISOString(),
      p_notes: input.notes?.trim() || null,
    })
  );
}


// NFOS Production-driven planning
export async function listProductionDemand() {
  return take(
    supabase
      .from("nfos_production_demand")
      .select("*")
      .order("item_type")
      .order("name")
  );
}

export async function listSpunSeedRequirements() {
  return take(
    supabase
      .from("nfos_spun_seed_requirements")
      .select("*")
      .order("order_no")
  );
}


// NFOS supplier readiness + order timing
export async function listPurchaseTiming() {
  return take(
    supabase
      .from("nfos_purchase_timing")
      .select("*")
      .order("order_by_date", { nullsFirst: false })
      .order("name")
  );
}

export async function listSupplierReadiness() {
  return take(
    supabase
      .from("nfos_supplier_readiness")
      .select("*")
      .order("readiness_status")
      .order("item_type")
      .order("name")
  );
}

export async function setItemSupplierTerms(input) {
  return take(
    supabase.rpc("nfos_set_item_supplier_terms", {
      p_item_id: input.itemId,
      p_supplier_id: input.supplierId,
      p_lead_time_days:
        input.leadTimeDays === "" || input.leadTimeDays == null
          ? null
          : Number(input.leadTimeDays),
      p_minimum_order_qty:
        input.minimumOrderQty === "" || input.minimumOrderQty == null
          ? null
          : Number(input.minimumOrderQty),
      p_order_increment:
        input.orderIncrement === "" || input.orderIncrement == null
          ? null
          : Number(input.orderIncrement),
      p_unit_cost:
        input.unitCost === "" || input.unitCost == null
          ? null
          : Number(input.unitCost),
      p_supplier_sku: input.supplierSku?.trim() || null,
      p_set_preferred: input.setPreferred !== false,
      p_notes: input.notes?.trim() || null,
    })
  );
}


// NFOS Operations Calendar + Action Dashboard
export async function getTodaySummary() {
  return take(
    supabase
      .from("nfos_today_summary")
      .select("*")
      .single()
  );
}

export async function listActionQueue() {
  return take(
    supabase
      .from("nfos_action_queue")
      .select("*")
      .order("priority_rank")
      .order("action_date")
      .order("title")
  );
}

export async function listOperationsCalendar() {
  return take(
    supabase
      .from("nfos_operations_calendar")
      .select("*")
      .order("event_date")
      .order("title")
  );
}


// NFOS Team + Operator Accountability
export async function listTeamMembers() {
  return take(supabase.from("nfos_team_directory").select("*").order("active", { ascending: false }).order("display_name"));
}

export async function listTeamWorkload() {
  return take(supabase.from("nfos_team_workload").select("*").order("total_open_work", { ascending: false }).order("display_name"));
}

export async function listMyWorkToday() {
  return take(supabase.from("nfos_my_work_today").select("*").order("priority_rank").order("due_date").order("title"));
}

export async function listAssignedActions() {
  return take(supabase.from("nfos_action_queue_assigned").select("*").order("priority_rank").order("action_date").order("title"));
}

export async function listWorkItems() {
  return take(supabase.from("nfos_work_items").select("*").order("status").order("due_date", { nullsFirst: false }).order("created_at", { ascending: false }));
}

export async function listTeamActivity() {
  return take(supabase.from("nfos_team_activity_feed").select("*").order("activity_at", { ascending: false }).limit(100));
}

export async function listOpenProductionOrdersForTeam() {
  return take(supabase.from("nfos_production_orders").select("*").in("status", ["planned", "in_progress"]).order("due_date", { nullsFirst: false }).order("created_at"));
}

export async function createTeamMember(form) {
  const { data, error } = await supabase.rpc("nfos_create_team_member_v2", {
    p_display_name: form.displayName?.trim(),
    p_email: form.email?.trim() || null,
    p_roles: Array.isArray(form.roles) && form.roles.length ? form.roles : ["viewer"],
    p_default_location_id: form.defaultLocationId || null,
    p_notes: form.notes?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function setTeamMemberRoles(memberId, roles) {
  const { data, error } = await supabase.rpc("nfos_set_team_member_roles", {
    p_member_id: memberId,
    p_roles: roles,
  });
  if (error) throw error;
  return data;
}

export async function updateTeamMember(memberId, form) {
  const { data, error } = await supabase.rpc("nfos_update_team_member", {
    p_member_id: memberId,
    p_display_name: form.displayName?.trim() || null,
    p_role: form.role || null,
    p_active: form.active ?? null,
    p_default_location_id: form.defaultLocationId || null,
    p_notes: form.notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function assignAction(actionKey, memberId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_assign_action", { p_action_key: actionKey, p_member_id: memberId, p_notes: notes });
  if (error) throw error;
  return data;
}

export async function unassignAction(actionKey) {
  const { data, error } = await supabase.rpc("nfos_unassign_action", { p_action_key: actionKey });
  if (error) throw error;
  return data;
}

export async function createWorkItem(form) {
  const { data, error } = await supabase.rpc("nfos_create_work_item", {
    p_title: form.title?.trim(),
    p_detail: form.detail?.trim() || null,
    p_category: form.category || "general",
    p_priority: form.priority || "normal",
    p_due_date: form.dueDate || null,
    p_assigned_member_id: form.assignedMemberId || null,
    p_notes: form.notes?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function setWorkItemStatus(workItemId, status, notes = null) {
  const { data, error } = await supabase.rpc("nfos_set_work_item_status", { p_work_item_id: workItemId, p_status: status, p_notes: notes });
  if (error) throw error;
  return data;
}

export async function assignProductionOrder(productionOrderId, memberId) {
  const { data, error } = await supabase.rpc("nfos_assign_production_order", { p_production_order_id: productionOrderId, p_member_id: memberId });
  if (error) throw error;
  return data;
}


// NFOS Employee Login — Phase 1
export async function getEmployeeAccess() {
  const { data, error } = await supabase.rpc("nfos_get_employee_access");
  if (error) throw error;
  return data;
}

export async function getEmployeeWork() {
  return take(
    supabase
      .rpc("nfos_get_employee_work")
  );
}

export async function inviteTeamMember(memberId) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your admin session has expired. Sign in again before sending an invite.");

  const response = await fetch("/.netlify/functions/nfos-team-invite-direct", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ memberId }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const error = new Error(data?.error || `Invitation delivery failed (${response.status}).`);
    if (data?.hint) error.hint = data.hint;
    throw error;
  }

  return data;
}


export async function deleteTeamMember(memberId) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Your admin session has expired. Sign in again before deleting a team member.");

  const { data, error } = await supabase.functions.invoke("nfos-team-member-admin", {
    body: { action: "delete", memberId },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function updateMyPassword(password) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
}

// NFOS Employee Role Execution — Phase 2
export async function employeeSetWorkItemStatus(workItemId, status, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_set_work_item_status", {
    p_work_item_id: workItemId, p_status: status, p_notes: notes,
  });
  if (error) throw error;
  return data;
}

export async function getEmployeeProductionWorkspace() {
  const { data, error } = await supabase.rpc("nfos_employee_get_production_workspace");
  if (error) throw error;
  return data;
}
export async function getEmployeeBatchWorkspace(batchId) {
  const { data, error } = await supabase.rpc("nfos_employee_get_batch_workspace", { p_batch_id: batchId });
  if (error) throw error;
  return data;
}
export async function employeeStartAssignedBatch(orderId, locationId = null, plannedQuantity = null, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_start_assigned_batch", {
    p_production_order_id: orderId, p_location_id: locationId, p_planned_quantity: plannedQuantity, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function getEmployeeSuggestionWorkspace() {
  const { data, error } = await supabase.rpc("nfos_employee_get_suggestion_workspace");
  if (error) throw error;
  return data;
}

export async function employeeSubmitProductionEditSuggestion(input) {
  const { data, error } = await supabase.rpc("nfos_employee_submit_production_edit_suggestion", {
    p_production_order_id: input.productionOrderId,
    p_planned_quantity: Number(input.plannedQuantity),
    p_due_date: input.dueDate || null,
    p_priority: input.priority || "normal",
    p_notes: input.notes?.trim() || null,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function getAdminSuggestionWorkspace() {
  const { data, error } = await supabase.rpc("nfos_admin_get_suggestion_workspace");
  if (error) throw error;
  return data;
}

export async function adminReviewProductionEditSuggestion(requestId, action, reviewNotes = null) {
  const { data, error } = await supabase.rpc("nfos_admin_review_production_edit_suggestion", {
    p_request_id: requestId,
    p_action: action,
    p_review_notes: reviewNotes?.trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function employeeSetBatchStepCompletion(batchId, recipeStepId, completed, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_set_batch_step_completion", {
    p_batch_id: batchId, p_recipe_step_id: recipeStepId, p_completed: completed, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeRecordQualityCheck(batchId, checkKey, values = {}) {
  const { data, error } = await supabase.rpc("nfos_employee_record_quality_check", {
    p_batch_id: batchId, p_check_key: checkKey,
    p_numeric_value: values.numericValue ?? null,
    p_text_value: values.textValue ?? null,
    p_boolean_value: values.booleanValue ?? null,
    p_notes: values.notes ?? null,
  });
  if (error) throw error;
  return data;
}
export async function employeeSetSpunBatchDetails(batchId, sourceBatchCode, actualQty, unit = "oz", notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_set_spun_batch_details", {
    p_batch_id: batchId, p_seed_source_batch_code: sourceBatchCode,
    p_seed_actual_quantity: actualQty, p_seed_unit: unit, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeCompleteBatch(batchId, inputs, outputs, actualBulkYield, yieldUnit, includePackagingBom = true, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_complete_batch", {
    p_batch_id: batchId, p_inputs: inputs, p_outputs: outputs,
    p_actual_bulk_yield: actualBulkYield, p_yield_unit: yieldUnit,
    p_include_packaging_bom: includePackagingBom, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeConfirmSpunCure(batchId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_confirm_spun_cure", { p_batch_id: batchId, p_notes: notes });
  if (error) throw error;
  return data;
}
export async function employeeReleaseBatch(batchId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_release_batch", { p_batch_id: batchId, p_notes: notes });
  if (error) throw error;
  return data;
}

export async function getEmployeeInventoryWorkspace() {
  const { data, error } = await supabase.rpc("nfos_employee_get_inventory_workspace");
  if (error) throw error;
  return data;
}
export async function employeeReceiveItem(form) {
  const { data, error } = await supabase.rpc("nfos_employee_receive_item", {
    p_item_id: form.itemId, p_location_id: form.locationId, p_quantity: form.quantity,
    p_lot_code: form.lotCode ?? null, p_supplier_id: form.supplierId ?? null,
    p_supplier_lot_code: form.supplierLotCode ?? null, p_total_cost: form.totalCost ?? null,
    p_notes: form.notes ?? null,
  });
  if (error) throw error;
  return data;
}
export async function employeeAdjustInventory(form) {
  const { data, error } = await supabase.rpc("nfos_employee_adjust_inventory", {
    p_item_id: form.itemId, p_location_id: form.locationId, p_quantity_delta: form.quantityDelta,
    p_lot_id: form.lotId ?? null, p_reason: form.reason ?? null, p_notes: form.notes ?? null,
  });
  if (error) throw error;
  return data;
}
export async function employeeTransferInventory(form) {
  const { data, error } = await supabase.rpc("nfos_employee_transfer_inventory", {
    p_item_id: form.itemId, p_quantity: form.quantity, p_from_location_id: form.fromLocationId,
    p_to_location_id: form.toLocationId, p_lot_id: form.lotId ?? null,
    p_reference_type: "transfer", p_reference_id: null, p_notes: form.notes ?? null,
  });
  if (error) throw error;
  return data;
}

export async function getEmployeePurchasingWorkspace() {
  const { data, error } = await supabase.rpc("nfos_employee_get_purchasing_workspace");
  if (error) throw error;
  return data;
}
export async function employeeCreatePurchaseOrder(form) {
  const { data, error } = await supabase.rpc("nfos_employee_create_purchase_order", {
    p_supplier_id: form.supplierId, p_expected_date: form.expectedDate || null,
    p_destination_location_id: form.locationId || null, p_notes: form.notes || null,
  });
  if (error) throw error;
  return data;
}
export async function employeeCreateReorderPo(supplierId, expectedDate = null, locationId = null, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_create_reorder_po", {
    p_supplier_id: supplierId, p_expected_date: expectedDate,
    p_destination_location_id: locationId, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeAddPurchaseOrderLine(poId, itemId, quantity = null, unitCost = null, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_add_purchase_order_line", {
    p_purchase_order_id: poId, p_item_id: itemId, p_quantity: quantity,
    p_unit_cost: unitCost, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeSubmitPurchaseOrder(poId) {
  const { data, error } = await supabase.rpc("nfos_employee_submit_purchase_order", { p_purchase_order_id: poId });
  if (error) throw error;
  return data;
}
export async function employeeReceivePurchaseOrderLine(lineId, quantity, lotCode = null, supplierLotCode = null, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_receive_purchase_order_line", {
    p_purchase_order_line_id: lineId, p_quantity: quantity,
    p_lot_code: lotCode, p_supplier_lot_code: supplierLotCode, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeSetItemSupplierTerms(form) {
  const { data, error } = await supabase.rpc("nfos_employee_set_item_supplier_terms", {
    p_item_id: form.itemId, p_supplier_id: form.supplierId,
    p_lead_time_days: form.leadTimeDays === "" ? null : Number(form.leadTimeDays),
    p_minimum_order_qty: form.minimumOrderQty === "" ? null : Number(form.minimumOrderQty),
    p_order_increment: form.orderIncrement === "" ? null : Number(form.orderIncrement),
    p_unit_cost: form.unitCost === "" ? null : Number(form.unitCost),
    p_supplier_sku: form.supplierSku || null, p_set_preferred: true, p_notes: null,
  });
  if (error) throw error;
  return data;
}

export async function getEmployeeManagerWorkspace() {
  const { data, error } = await supabase.rpc("nfos_employee_get_manager_workspace");
  if (error) throw error;
  return data;
}
export async function employeeAssignAction(actionKey, memberId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_employee_assign_action", {
    p_action_key: actionKey, p_member_id: memberId, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function employeeAssignProductionOrder(orderId, memberId) {
  const { data, error } = await supabase.rpc("nfos_employee_assign_production_order", {
    p_production_order_id: orderId, p_member_id: memberId,
  });
  if (error) throw error;
  return data;
}
export async function employeeCreateWorkItem(form) {
  const { data, error } = await supabase.rpc("nfos_employee_create_work_item", {
    p_title: form.title, p_detail: form.detail || null, p_category: form.category,
    p_priority: form.priority, p_due_date: form.dueDate || null,
    p_assigned_member_id: form.assignedMemberId || null, p_notes: null,
  });
  if (error) throw error;
  return data;
}

// NFOS Notifications + Escalation — Phase 3
export async function syncNotifications() {
  const { data, error } = await supabase.rpc("nfos_sync_notifications");
  if (error) throw error;
  return data;
}
export async function getMyNotifications() {
  const { data, error } = await supabase.rpc("nfos_get_my_notifications");
  if (error) throw error;
  return data || [];
}
export async function setNotificationStatus(notificationId, status) {
  const { data, error } = await supabase.rpc("nfos_set_notification_status", {
    p_notification_id: notificationId,
    p_status: status,
  });
  if (error) throw error;
  return data;
}
export async function getNotificationPreferences() {
  const { data, error } = await supabase.rpc("nfos_get_notification_preferences");
  if (error) throw error;
  return data;
}
export async function setNotificationPreferences(emailEnabled, criticalEmailEnabled) {
  const { data, error } = await supabase.rpc("nfos_set_notification_preferences", {
    p_email_enabled: Boolean(emailEnabled),
    p_critical_email_enabled: Boolean(criticalEmailEnabled),
  });
  if (error) throw error;
  return data;
}
export async function getManagerNotificationSummary() {
  const { data, error } = await supabase.rpc("nfos_get_manager_notification_summary");
  if (error) throw error;
  return data;
}

// NFOS Markets + Square Reconciliation — Phase 4
export async function marketGetWorkspace() {
  const { data, error } = await supabase.rpc("nfos_market_get_workspace");
  if (error) throw error;
  return data;
}
export async function marketCreateSession(form) {
  const { data, error } = await supabase.rpc("nfos_market_create_session", {
    p_market_date_id: form.marketDateId,
    p_assigned_member_id: form.assignedMemberId || null,
    p_square_location_id: form.squareLocationId || null,
    p_notes: form.notes || null,
  });
  if (error) throw error;
  return data;
}
export async function marketAssignSession(sessionId, memberId) {
  const { data, error } = await supabase.rpc("nfos_market_assign_session", {
    p_session_id: sessionId, p_member_id: memberId,
  });
  if (error) throw error;
  return data;
}
export async function marketLoadItem(sessionId, itemId, quantity, sourceLocationId = null, notes = null) {
  const { data, error } = await supabase.rpc("nfos_market_load_item", {
    p_session_id: sessionId, p_item_id: itemId, p_quantity: quantity,
    p_source_location_id: sourceLocationId, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function marketOpenSession(sessionId) {
  const { data, error } = await supabase.rpc("nfos_market_open_session", { p_session_id: sessionId });
  if (error) throw error;
  return data;
}
export async function marketRecordSale(form) {
  const { data, error } = await supabase.rpc("nfos_market_record_sale", {
    p_session_id: form.sessionId, p_item_id: form.itemId, p_quantity: form.quantity,
    p_unit_cents: form.unitCents, p_payment_method: form.paymentMethod || null,
    p_source: "manual", p_external_order_id: null, p_external_payment_id: null,
    p_external_line_id: null, p_notes: form.notes || null,
  });
  if (error) throw error;
  return data;
}
export async function marketCloseSession(sessionId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_market_close_session", {
    p_session_id: sessionId, p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function marketSetSquareLocation(sessionId, squareLocationId) {
  const { data, error } = await supabase.rpc("nfos_market_set_square_location", {
    p_session_id: sessionId, p_square_location_id: squareLocationId,
  });
  if (error) throw error;
  return data;
}
export async function marketMapSquareVariation(form) {
  const { data, error } = await supabase.rpc("nfos_market_map_square_variation", {
    p_item_id: form.itemId, p_square_variation_id: form.variationId,
    p_square_item_name: form.itemName || null, p_square_variation_name: form.variationName || null,
    p_square_sku: form.sku || null,
  });
  if (error) throw error;
  return data;
}
export async function squareMarketRequest(action, payload = {}) {
  const { data:{ session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to NFOS first.");
  const response = await fetch("/.netlify/functions/nfos-square-market-sync", {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      Authorization:`Bearer ${session.access_token}`,
    },
    body:JSON.stringify({ action, ...payload }),
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(body?.error || "Square market request failed.");
  return body;
}


// NFOS Product Master + Market Management
export async function getProductsWorkspace() {
  const { data, error } = await supabase.rpc("nfos_get_products_workspace");
  if (error) throw error;
  return data;
}
export async function updateProductMaster(input) {
  const { data, error } = await supabase.rpc("nfos_update_product_master", {
    p_flavor_id: input.flavorId,
    p_product_status: input.productStatus,
    p_category: input.category || null,
    p_product_tier: input.productTier || null,
    p_seasonality: input.seasonality || "year_round",
    p_season_start_month: input.seasonStartMonth === "" ? null : Number(input.seasonStartMonth),
    p_season_end_month: input.seasonEndMonth === "" ? null : Number(input.seasonEndMonth),
    p_primary_recipe_id: input.primaryRecipeId || null,
    p_short_description: input.shortDescription || null,
    p_internal_notes: input.internalNotes || null,
    p_variants: input.variants || [],
  });
  if (error) throw error;
  return data;
}
export async function getProductAvailability() {
  const { data, error } = await supabase.rpc("nfos_get_product_availability");
  if (error) throw error;
  return data;
}
export async function getRetailLocationDirectory() {
  const { data, error } = await supabase.rpc("nfos_get_retail_location_directory");
  if (error) throw error;
  return data;
}
export async function setRetailItemAvailability(input) {
  const { data, error } = await supabase.rpc("nfos_set_retail_item_availability", {
    p_retail_location_id: input.retailLocationId,
    p_item_id: input.itemId,
    p_availability_status: input.availabilityStatus,
    p_quantity_on_hand: input.quantityOnHand,
    p_source: input.source || "manual",
    p_source_reference: input.sourceReference || null,
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return data;
}
export async function getMarketOrderWorkspace() {
  const { data, error } = await supabase.rpc("nfos_market_get_order_workspace");
  if (error) throw error;
  return data;
}
export async function marketLookupSellableBarcode(barcode) {
  const { data, error } = await supabase.rpc("nfos_market_lookup_sellable_barcode", { p_barcode: barcode });
  if (error) throw error;
  return data;
}
export async function marketLogOrder(sessionId, lines, notes = null) {
  const { data, error } = await supabase.rpc("nfos_market_log_order", {
    p_market_session_id: sessionId,
    p_lines: lines,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function marketUpdateLoggedOrder(orderId, lines, notes = null) {
  const { data, error } = await supabase.rpc("nfos_market_update_logged_order", {
    p_order_id: orderId,
    p_lines: lines,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}
export async function marketSubmitLoggedOrder(orderId) {
  const { data, error } = await supabase.rpc("nfos_market_submit_logged_order", { p_order_id: orderId });
  if (error) throw error;
  return data;
}
export async function adminGetMarketOrderApprovals() {
  const { data, error } = await supabase.rpc("nfos_admin_get_market_order_approvals");
  if (error) throw error;
  return data;
}
export async function adminReviewMarketOrder(orderId, action, adminNotes = null) {
  const { data, error } = await supabase.rpc("nfos_admin_review_market_order", {
    p_order_id: orderId,
    p_action: action,
    p_admin_notes: adminNotes,
  });
  if (error) throw error;
  return data;
}

// NFOS Costing + Management Reporting — Phase 5
export async function getReportingWorkspace() {
  const { data, error } = await supabase.rpc("nfos_get_reporting_workspace");
  if (error) throw error;
  return data;
}

// NFOS System Health + Release Readiness — Phase 6
export async function getReleaseReadiness() {
  const { data, error } = await supabase.rpc("nfos_get_release_readiness");
  if (error) throw error;
  return data;
}

// NFOS production release compatibility export.
export async function releaseBatch(batchId, notes = null) {
  const { data, error } = await supabase.rpc("nfos_release_batch", {
    p_batch_id: batchId,
    p_notes: notes,
  });
  if (error) throw error;
  return data;
}

// ============================================================
// NFOS Market Closeout Reconciliation — scan-first field workflow
// ============================================================
export async function marketStartSession(form = {}) {
  const { data, error } = await supabase.rpc("nfos_market_start", {
    p_market_date_id: form.marketDateId || null,
    p_venue_name: form.venueName || null,
    p_square_location_id: form.squareLocationId || null,
    p_notes: form.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function marketSetOpeningInventory(sessionId, lines) {
  const { data, error } = await supabase.rpc("nfos_market_set_opening_inventory", {
    p_session_id: sessionId,
    p_lines: lines || [],
  });
  if (error) throw error;
  return data;
}

export async function marketLogSale(sessionId, lines, notes = null, saleTotalCents = null) {
  const { data, error } = await supabase.rpc("nfos_market_log_sale", {
    p_market_session_id: sessionId,
    p_lines: lines || [],
    p_notes: notes || null,
    p_payment_method: "unclassified",
    p_sale_total_cents: saleTotalCents == null ? null : Number(saleTotalCents),
  });
  if (error) throw error;
  return data;
}

export async function marketUpdateLoggedSale(orderId, lines, notes = null, saleTotalCents = null) {
  const { data, error } = await supabase.rpc("nfos_market_update_logged_sale", {
    p_order_id: orderId,
    p_lines: lines || [],
    p_notes: notes || null,
    p_payment_method: "unclassified",
    p_sale_total_cents: saleTotalCents == null ? null : Number(saleTotalCents),
  });
  if (error) throw error;
  return data;
}

export async function marketSubmitCloseout(input) {
  const { data, error } = await supabase.rpc("nfos_market_submit_closeout", {
    p_session_id: input.sessionId,
    p_return_lines: input.returnLines || [],
    p_adjustments: input.adjustments || [],
    p_reported_cash_cents: Number(input.reportedCashCents || 0),
    p_notes: input.notes || null,
  });
  if (error) throw error;
  return data;
}

export async function adminGetMarketCloseoutApprovals() {
  const { data, error } = await supabase.rpc("nfos_admin_get_market_closeout_approvals");
  if (error) throw error;
  return data || { pending: [], history: [] };
}

export async function adminReviewMarketCloseout(sessionId, action, adminNotes = null, acceptVariance = false) {
  const { data, error } = await supabase.rpc("nfos_admin_review_market_closeout", {
    p_session_id: sessionId,
    p_action: action,
    p_admin_notes: adminNotes || null,
    p_accept_variance: Boolean(acceptVariance),
  });
  if (error) throw error;
  return data;
}
