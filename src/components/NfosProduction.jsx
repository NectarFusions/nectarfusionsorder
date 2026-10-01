import { useCallback, useEffect, useMemo, useState } from "react";
import NfosBarcode from "./NfosBarcode";
import * as nfos from "../lib/nfosApi";

const qty = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num)
    ? String(num)
    : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const fmtDate = (value) => (value ? new Date(value).toLocaleString() : "—");

function Notice({ type = "success", children }) {
  if (!children) return null;
  return <div className={type === "error" ? "nfos-error" : "nfos-success"}>{children}</div>;
}

function Empty({ children = "Nothing to show yet." }) {
  return <div className="nfos-empty">{children}</div>;
}

function StatusPill({ value }) {
  const key = String(value || "").toLowerCase();
  const cls = ["active", "completed", "passed", "available", "released", "eligible", "ready"].includes(key)
    ? "ok"
    : ["failed", "cancelled", "hold", "qc_hold", "quarantined", "rejected"].includes(key)
      ? "off"
      : ["planned", "draft", "pending", "in_progress", "holding", "not_ready", "cure_pending"].includes(key)
        ? "low"
        : "";
  return <span className={`nfos-pill ${cls}`}>{value || "—"}</span>;
}

function RecipeDetail({ recipe, items, onChanged }) {
  const [inputs, setInputs] = useState([]);
  const [steps, setSteps] = useState([]);
  const [specs, setSpecs] = useState([]);
  const [finishedItemId, setFinishedItemId] = useState("");
  const [bom, setBom] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const ingredientItems = useMemo(
    () => items.filter((x) => x.item_type === "material" && x.active),
    [items]
  );
  const packagingItems = useMemo(
    () => items.filter((x) => x.item_type === "packaging" && x.active),
    [items]
  );
  const finishedItems = useMemo(
    () =>
      items.filter(
        (x) =>
          x.item_type === "finished_good" &&
          x.active &&
          (!recipe.legacy_flavor_id || x.legacy_flavor_id === recipe.legacy_flavor_id)
      ),
    [items, recipe.legacy_flavor_id]
  );

  const [inputForm, setInputForm] = useState({
    itemId: "",
    calculationMethod: "fixed_per_basis",
    quantity: "",
    ratePercent: "",
    phase: "infusion",
    sequence: 10,
    notes: "",
  });
  const [stepForm, setStepForm] = useState({
    title: "",
    instruction: "",
    expectedMinutes: "",
    requiresConfirmation: false,
    criticalControl: false,
  });
  const [specForm, setSpecForm] = useState({
    checkKey: "",
    label: "",
    resultType: "number",
    unit: "",
    minValue: "",
    maxValue: "",
    expectedText: "",
    instructions: "",
    required: true,
  });
  const [bomForm, setBomForm] = useState({ componentItemId: "", quantityPerUnit: "1" });

  const itemMap = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);

  const load = useCallback(async () => {
    if (!recipe?.id) return;
    setBusy(true);
    setError("");
    try {
      const [a, b, c] = await Promise.all([
        nfos.listRecipeInputs(recipe.id),
        nfos.listRecipeSteps(recipe.id),
        nfos.listRecipeQualitySpecs(recipe.id),
      ]);
      setInputs(a || []);
      setSteps(b || []);
      setSpecs(c || []);
    } catch (err) {
      setError(err?.message || "Could not load recipe details.");
    } finally {
      setBusy(false);
    }
  }, [recipe?.id]);

  useEffect(() => {
    setFinishedItemId("");
    setBom([]);
    load();
  }, [load]);

  const loadBom = useCallback(async () => {
    if (!finishedItemId) {
      setBom([]);
      return;
    }
    try {
      setBom((await nfos.listSkuBom(finishedItemId)) || []);
    } catch (err) {
      setError(err?.message || "Could not load packaging BOM.");
    }
  }, [finishedItemId]);

  useEffect(() => {
    loadBom();
  }, [loadBom]);

  const run = async (work, success) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
      await load();
      await loadBom();
      await onChanged?.();
    } catch (err) {
      setError(err?.message || "NFOS could not save this change.");
    } finally {
      setBusy(false);
    }
  };

  const addInput = (event) => {
    event.preventDefault();
    const item = itemMap[inputForm.itemId];
    if (!item) return;
    run(
      () =>
        nfos.addRecipeInput({
          recipeId: recipe.id,
          itemId: item.id,
          calculationMethod: inputForm.calculationMethod,
          quantity: inputForm.quantity,
          ratePercent: inputForm.ratePercent,
          phase: inputForm.calculationMethod === "base_actual" ? "base" : inputForm.phase,
          sequence: inputForm.sequence,
          notes: inputForm.notes,
        }),
      "Recipe input added."
    ).then(() => setInputForm({
      itemId: "", calculationMethod: "fixed_per_basis", quantity: "", ratePercent: "",
      phase: "infusion", sequence: 10, notes: ""
    }));
  };

  const addStep = (event) => {
    event.preventDefault();
    run(
      () =>
        nfos.addRecipeStep({
          recipeId: recipe.id,
          stepNo: steps.length ? Math.max(...steps.map((x) => Number(x.step_no))) + 1 : 1,
          ...stepForm,
        }),
      "SOP step added."
    ).then(() =>
      setStepForm({
        title: "",
        instruction: "",
        expectedMinutes: "",
        requiresConfirmation: false,
        criticalControl: false,
      })
    );
  };

  const addSpec = (event) => {
    event.preventDefault();
    run(
      () => nfos.addRecipeQualitySpec({ recipeId: recipe.id, sequence: specs.length * 10 + 10, ...specForm }),
      "Quality specification added."
    ).then(() =>
      setSpecForm({
        checkKey: "",
        label: "",
        resultType: "number",
        unit: "",
        minValue: "",
        maxValue: "",
        expectedText: "",
        instructions: "",
        required: true,
      })
    );
  };

  const addBom = (event) => {
    event.preventDefault();
    const component = itemMap[bomForm.componentItemId];
    if (!finishedItemId || !component) return;
    run(
      () =>
        nfos.upsertSkuBom({
          finishedItemId,
          componentItemId: component.id,
          quantityPerUnit: bomForm.quantityPerUnit,
          unit: component.stocking_unit,
        }),
      "Packaging BOM updated."
    ).then(() => setBomForm({ componentItemId: "", quantityPerUnit: "1" }));
  };

  return (
    <>
      <div className="nfos-card">
        <div className="nfos-split-head">
          <div>
            <h2 style={{ marginBottom: 5 }}>{recipe.name}</h2>
            <div className="nfos-muted">
              <span className="nfos-mono">{recipe.recipe_key}</span> • Version {recipe.version} • {recipe.flavor_name || "No flavor linked"}
            </div>
          </div>
          <div className="nfos-inline-actions">
            <StatusPill value={recipe.status} />
            {recipe.status === "draft" && (
              <button className="nfos-btn" disabled={busy || inputs.length === 0} onClick={() => run(() => nfos.activateRecipe(recipe.id), "Recipe activated for production.")}>Activate</button>
            )}
            <button className="nfos-btn ghost" disabled={busy} onClick={() => run(() => nfos.cloneRecipeVersion(recipe.id, `Cloned from version ${recipe.version}`), "New draft version created.")}>New version</button>
          </div>
        </div>
        <div className="nfos-grid four nfos-compact-stats" style={{ marginTop: 14 }}>
          <div className="nfos-stat"><div className="nfos-stat-label">Basis</div><div className="nfos-stat-value">{qty(recipe.basis_quantity)} {recipe.basis_unit}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Inputs</div><div className="nfos-stat-value">{inputs.length}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">SOP steps</div><div className="nfos-stat-value">{steps.length}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">QC checks</div><div className="nfos-stat-value">{specs.length}</div></div>
        </div>
      </div>

      <Notice type="error">{error}</Notice>
      <Notice>{message}</Notice>

      <div className="nfos-grid two">
        <div className="nfos-card">
          <h3>Formula inputs</h3>
          <p className="nfos-muted">Define the relationship once. Every production batch records the actual amount used and NFOS calculates expected usage from the actual base amount.</p>
          {inputs.length ? (
            <div className="nfos-table-wrap">
              <table className="nfos-table">
                <thead><tr><th>Ingredient</th><th>Relationship</th><th>Basis equivalent</th><th></th></tr></thead>
                <tbody>{inputs.map((row) => {
                  const item = itemMap[row.item_id];
                  const relationship = row.is_base
                    ? "Variable base ingredient"
                    : row.calculation_method === "percent_of_base_weight"
                      ? `${qty(row.rate_percent)}% of actual base weight`
                      : `Fixed per ${qty(recipe.basis_quantity)} ${recipe.basis_unit}`;
                  return <tr key={row.id}><td><strong>{item?.name || row.item_id}</strong><div className="nfos-mono nfos-muted">{item?.sku}</div></td><td>{relationship}</td><td>{qty(row.quantity)} {row.unit}</td><td><button className="nfos-btn ghost" disabled={busy || recipe.status !== "draft"} onClick={() => run(() => nfos.deleteRecipeInput(row.id), "Recipe input removed.")}>Remove</button></td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : <Empty>Add the variable honey base first, then the infusion ingredients.</Empty>}
          {recipe.status === "draft" && (
            <form className="nfos-form" onSubmit={addInput} style={{ marginTop: 14 }}>
              <div className="nfos-field full"><label>Ingredient / material</label><select required value={inputForm.itemId} onChange={(e) => setInputForm({ ...inputForm, itemId: e.target.value })}><option value="">Choose ingredient…</option>{ingredientItems.map((x) => <option key={x.id} value={x.id}>{x.sku} — {x.name} ({x.stocking_unit})</option>)}</select></div>
              <div className="nfos-field full"><label>How this ingredient is calculated</label><select value={inputForm.calculationMethod} onChange={(e) => setInputForm({ ...inputForm, calculationMethod: e.target.value, quantity: "", ratePercent: "" })}><option value="base_actual">Variable base ingredient — record actual amount every batch</option><option value="percent_of_base_weight">Percentage of actual base weight</option><option value="fixed_per_basis">Fixed amount per recipe basis</option></select></div>
              {inputForm.calculationMethod === "percent_of_base_weight" && <div className="nfos-field"><label>Target % of base weight</label><input required type="number" min="0.0001" step="any" value={inputForm.ratePercent} onChange={(e) => setInputForm({ ...inputForm, ratePercent: e.target.value })} /></div>}
              {inputForm.calculationMethod === "fixed_per_basis" && <div className="nfos-field"><label>Quantity per {qty(recipe.basis_quantity)} {recipe.basis_unit}</label><input required type="number" min="0.0001" step="any" value={inputForm.quantity} onChange={(e) => setInputForm({ ...inputForm, quantity: e.target.value })} /></div>}
              {inputForm.calculationMethod !== "base_actual" && <div className="nfos-field"><label>Phase</label><input value={inputForm.phase} onChange={(e) => setInputForm({ ...inputForm, phase: e.target.value })} /></div>}
              {inputForm.calculationMethod === "base_actual" && <div className="nfos-note full">The operator will enter the real base amount for every batch. For honey stocked in pounds, NFOS can accept pounds + ounces and converts it for inventory automatically.</div>}
              <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Add input</button></div>
            </form>
          )}
        </div>

        <div className="nfos-card">
          <h3>Embedded SOP</h3>
          <p className="nfos-muted">The operator will eventually see these instructions while completing the batch instead of relying on a separate document.</p>
          {steps.length ? <ol className="nfos-step-list">{steps.map((row) => <li key={row.id}><div><strong>{row.title || `Step ${row.step_no}`}</strong>{row.critical_control && <span className="nfos-pill low" style={{ marginLeft: 8 }}>CRITICAL</span>}<div className="nfos-muted" style={{ marginTop: 5 }}>{row.instruction}</div></div>{recipe.status === "draft" && <button className="nfos-btn ghost" onClick={() => run(() => nfos.deleteRecipeStep(row.id), "SOP step removed.")}>Remove</button>}</li>)}</ol> : <Empty>No SOP steps added yet.</Empty>}
          {recipe.status === "draft" && <form className="nfos-form" onSubmit={addStep} style={{ marginTop: 14 }}><div className="nfos-field full"><label>Step title</label><input value={stepForm.title} onChange={(e) => setStepForm({ ...stepForm, title: e.target.value })} /></div><div className="nfos-field full"><label>Instruction</label><textarea required value={stepForm.instruction} onChange={(e) => setStepForm({ ...stepForm, instruction: e.target.value })} /></div><div className="nfos-field"><label>Expected minutes</label><input type="number" min="0" step="any" value={stepForm.expectedMinutes} onChange={(e) => setStepForm({ ...stepForm, expectedMinutes: e.target.value })} /></div><div className="nfos-field nfos-check-field"><label><input type="checkbox" checked={stepForm.criticalControl} onChange={(e) => setStepForm({ ...stepForm, criticalControl: e.target.checked })} /> Critical control step</label><label><input type="checkbox" checked={stepForm.requiresConfirmation} onChange={(e) => setStepForm({ ...stepForm, requiresConfirmation: e.target.checked })} /> Require operator confirmation</label></div><div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Add SOP step</button></div></form>}
        </div>
      </div>

      <div className="nfos-grid two">
        <div className="nfos-card">
          <h3>Quality specifications</h3>
          {specs.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Check</th><th>Rule</th><th></th></tr></thead><tbody>{specs.map((row) => <tr key={row.id}><td><strong>{row.label}</strong><div className="nfos-mono nfos-muted">{row.check_key}</div></td><td>{row.result_type === "number" ? `${row.min_value ?? "—"} to ${row.max_value ?? "—"} ${row.unit || ""}` : row.result_type === "boolean" ? "Must pass" : row.expected_text || "Recorded text"}</td><td>{recipe.status === "draft" && <button className="nfos-btn ghost" onClick={() => run(() => nfos.deleteRecipeQualitySpec(row.id), "Quality specification removed.")}>Remove</button>}</td></tr>)}</tbody></table></div> : <Empty>No required QC checks are configured.</Empty>}
          {recipe.status === "draft" && <form className="nfos-form" onSubmit={addSpec} style={{ marginTop: 14 }}><div className="nfos-field"><label>Check key</label><input required placeholder="final_ph" value={specForm.checkKey} onChange={(e) => setSpecForm({ ...specForm, checkKey: e.target.value })} /></div><div className="nfos-field"><label>Label</label><input required placeholder="Final pH" value={specForm.label} onChange={(e) => setSpecForm({ ...specForm, label: e.target.value })} /></div><div className="nfos-field"><label>Result type</label><select value={specForm.resultType} onChange={(e) => setSpecForm({ ...specForm, resultType: e.target.value })}><option value="number">Number</option><option value="boolean">Pass / fail</option><option value="text">Text</option></select></div><div className="nfos-field"><label>Unit</label><input value={specForm.unit} onChange={(e) => setSpecForm({ ...specForm, unit: e.target.value })} /></div>{specForm.resultType === "number" && <><div className="nfos-field"><label>Minimum</label><input type="number" step="any" value={specForm.minValue} onChange={(e) => setSpecForm({ ...specForm, minValue: e.target.value })} /></div><div className="nfos-field"><label>Maximum</label><input type="number" step="any" value={specForm.maxValue} onChange={(e) => setSpecForm({ ...specForm, maxValue: e.target.value })} /></div></>}{specForm.resultType === "text" && <div className="nfos-field full"><label>Expected text, if exact match is required</label><input value={specForm.expectedText} onChange={(e) => setSpecForm({ ...specForm, expectedText: e.target.value })} /></div>}<div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Add QC specification</button></div></form>}
        </div>

        <div className="nfos-card">
          <h3>Packaging BOM by finished SKU</h3>
          <p className="nfos-muted">Tell NFOS what packaging one finished jar consumes. When a batch is completed, these components can be deducted automatically.</p>
          <div className="nfos-field"><label>Finished SKU</label><select value={finishedItemId} onChange={(e) => setFinishedItemId(e.target.value)}><option value="">Choose finished SKU…</option>{finishedItems.map((x) => <option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}</select></div>
          {finishedItemId && <>{bom.length ? <div className="nfos-table-wrap" style={{ marginTop: 14 }}><table className="nfos-table"><thead><tr><th>Component</th><th>Per jar</th><th></th></tr></thead><tbody>{bom.map((row) => { const item = itemMap[row.component_item_id]; return <tr key={row.id}><td><strong>{item?.name || row.component_item_id}</strong></td><td>{qty(row.quantity_per_unit)} {row.unit}</td><td><button className="nfos-btn ghost" onClick={() => run(() => nfos.deleteSkuBom(row.id), "Packaging component removed.")}>Remove</button></td></tr>; })}</tbody></table></div> : <Empty>No packaging components configured for this SKU.</Empty>}<form className="nfos-form" onSubmit={addBom} style={{ marginTop: 14 }}><div className="nfos-field full"><label>Packaging component</label><select required value={bomForm.componentItemId} onChange={(e) => setBomForm({ ...bomForm, componentItemId: e.target.value })}><option value="">Choose packaging…</option>{packagingItems.map((x) => <option key={x.id} value={x.id}>{x.sku} — {x.name} ({x.stocking_unit})</option>)}</select></div><div className="nfos-field"><label>Quantity per finished jar</label><input required type="number" min="0.0001" step="any" value={bomForm.quantityPerUnit} onChange={(e) => setBomForm({ ...bomForm, quantityPerUnit: e.target.value })} /></div><div className="nfos-field"><label>Unit</label><input disabled value={itemMap[bomForm.componentItemId]?.stocking_unit || "each"} /></div><div className="nfos-field full"><button className="nfos-btn">Add / update component</button></div></form></>}
        </div>
      </div>
    </>
  );
}

export function RecipesModule({ items, onRefresh }) {
  const [recipes, setRecipes] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    recipeKey: "",
    name: "",
    flavorId: "",
    basisQuantity: "1",
    basisUnit: "lb",
    expectedYieldQuantity: "",
    expectedYieldUnit: "lb",
    instructions: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [recipeRows, flavorRows] = await Promise.all([nfos.listRecipes(), nfos.listFlavors()]);
      setRecipes(recipeRows || []);
      setFlavors(flavorRows || []);
      setSelectedId((current) => current || recipeRows?.[0]?.id || "");
    } catch (err) {
      setError(err?.message || "Could not load recipes.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = recipes.find((x) => x.id === selectedId);

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await nfos.createRecipe(form);
      setMessage(`Draft recipe version ${result.version} created.`);
      setForm({ recipeKey: "", name: "", flavorId: "", basisQuantity: "1", basisUnit: "lb", expectedYieldQuantity: "", expectedYieldUnit: "lb", instructions: "", notes: "" });
      await load();
      setSelectedId(result.id);
      await onRefresh?.();
    } catch (err) {
      setError(err?.message || "Could not create recipe.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Notice type="error">{error}</Notice><Notice>{message}</Notice>
    <div className="nfos-grid two nfos-recipes-layout">
      <div>
        <div className="nfos-card">
          <h2>Recipe versions</h2>
          <p className="nfos-muted">A batch always points to the exact recipe version used. Editing the future never rewrites the past.</p>
          {recipes.length ? <div className="nfos-select-list">{recipes.map((r) => <button key={r.id} className={selectedId === r.id ? "active" : ""} onClick={() => setSelectedId(r.id)}><span><strong>{r.name}</strong><small>{r.flavor_name || r.recipe_key} • v{r.version}</small></span><StatusPill value={r.status} /></button>)}</div> : <Empty>No recipes have been entered yet.</Empty>}
        </div>
        <div className="nfos-card">
          <h3>Create recipe</h3>
          <form className="nfos-form" onSubmit={create}>
            <div className="nfos-field full"><label>Recipe name</label><input required placeholder="Cinnamon Honey" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="nfos-field"><label>Flavor</label><select value={form.flavorId} onChange={(e) => setForm({ ...form, flavorId: e.target.value })}><option value="">No flavor link</option>{flavors.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="nfos-field"><label>Recipe key (optional)</label><input placeholder="CINNAMON" value={form.recipeKey} onChange={(e) => setForm({ ...form, recipeKey: e.target.value })} /></div>
            <div className="nfos-field"><label>Formula basis quantity</label><input required type="number" min="0.0001" step="any" value={form.basisQuantity} onChange={(e) => setForm({ ...form, basisQuantity: e.target.value })} /></div>
            <div className="nfos-field"><label>Basis unit</label><input required value={form.basisUnit} onChange={(e) => setForm({ ...form, basisUnit: e.target.value })} /></div>
            <div className="nfos-field"><label>Expected bulk yield</label><input type="number" min="0" step="any" value={form.expectedYieldQuantity} onChange={(e) => setForm({ ...form, expectedYieldQuantity: e.target.value })} /></div>
            <div className="nfos-field"><label>Yield unit</label><input value={form.expectedYieldUnit} onChange={(e) => setForm({ ...form, expectedYieldUnit: e.target.value })} /></div>
            <div className="nfos-field full"><label>Recipe overview / notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Create draft recipe</button></div>
          </form>
        </div>
      </div>
      <div>{selected ? <RecipeDetail recipe={selected} items={items} onChanged={load} /> : <div className="nfos-card"><Empty>Select or create a recipe.</Empty></div>}</div>
    </div>
  </>;
}

function BatchWorkspace({ batch, items, locations, lots, onChanged }) {
  const [requirements, setRequirements] = useState([]);
  const [lotBalances, setLotBalances] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [sopSteps, setSopSteps] = useState([]);
  const [inputDrafts, setInputDrafts] = useState({});
  const [formulaPreview, setFormulaPreview] = useState([]);
  const [baseEntry, setBaseEntry] = useState({ pounds: "", ounces: "", quantity: "" });
  const [qcDrafts, setQcDrafts] = useState({});
  const [outputs, setOutputs] = useState({});
  const [actualYield, setActualYield] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [quickLotOpen, setQuickLotOpen] = useState(false);
  const [quickLotForm, setQuickLotForm] = useState({ lotCode: "", quantity: "", supplierId: "", sourceNote: "" });
  const [seedForm, setSeedForm] = useState({ sourceBatchCode: "", actualQuantity: "", notes: "" });

  const itemMap = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const lotMap = useMemo(() => Object.fromEntries(lots.map((x) => [x.id, x])), [lots]);
  const locationMap = useMemo(() => Object.fromEntries(locations.map((x) => [x.id, x])), [locations]);
  const finishedItems = useMemo(() => items.filter((x) => x.item_type === "finished_good" && x.active && (!batch.legacy_flavor_id || x.legacy_flavor_id === batch.legacy_flavor_id) && (!batch.texture || x.legacy_texture === batch.texture)), [items, batch.legacy_flavor_id, batch.texture]);
  const baseRequirement = requirements.find((x) => x.is_base) || null;
  const baseItem = baseRequirement ? itemMap[baseRequirement.item_id] : null;
  const previewMap = useMemo(() => Object.fromEntries(formulaPreview.map((x) => [x.recipe_input_id, x])), [formulaPreview]);

  const baseRequest = useMemo(() => {
    if (!baseRequirement || !baseItem) return null;
    if (baseItem.stocking_unit === "lb") {
      const pounds = Number(baseEntry.pounds || 0);
      const ounces = Number(baseEntry.ounces || 0);
      const totalOz = pounds * 16 + ounces;
      return totalOz > 0 ? { quantity: totalOz, unit: "oz" } : null;
    }
    const amount = Number(baseEntry.quantity || 0);
    return amount > 0 ? { quantity: amount, unit: baseItem.stocking_unit } : null;
  }, [baseEntry, baseItem, baseRequirement]);

  const expectedSeedOz = useMemo(() => {
    if (batch.texture !== "spun" || !baseRequest) return null;
    const baseOz = baseRequest.unit === "oz"
      ? Number(baseRequest.quantity)
      : baseRequest.unit === "lb"
        ? Number(baseRequest.quantity) * 16
        : null;
    return baseOz && baseOz > 0 ? Number((baseOz * 0.10).toFixed(4)) : null;
  }, [batch.texture, baseRequest?.quantity, baseRequest?.unit]);

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [req, balances, qc, supplierRows, sopRows] = await Promise.all([
        nfos.listBatchRequirements(batch.id),
        nfos.listLotBalances(),
        nfos.listQualityChecks(batch.id),
        nfos.listSuppliers(),
        nfos.listBatchSop(batch.id),
      ]);
      setRequirements(req || []);
      setLotBalances(balances || []);
      setQualityChecks(qc || []);
      setSuppliers((supplierRows || []).filter((row) => row.active));
      setSopSteps(sopRows || []);
      setSeedForm((current) => ({
        sourceBatchCode: current.sourceBatchCode || batch.seed_source_batch_code || "",
        actualQuantity: current.actualQuantity || (batch.seed_actual_quantity ?? ""),
        notes: current.notes || batch.seed_notes || "",
      }));
      setInputDrafts((current) => {
        const next = { ...current };
        (req || []).forEach((row) => {
          if (!next[row.recipe_input_id]) next[row.recipe_input_id] = { quantity: "", lotId: "" };
        });
        return next;
      });
      setQcDrafts((current) => {
        const next = { ...current };
        (qc || []).forEach((row) => { if (!next[row.check_key]) next[row.check_key] = { value: "", notes: "" }; });
        return next;
      });
    } catch (err) { setError(err?.message || "Could not load batch workspace."); }
    finally { setBusy(false); }
  }, [batch.id]);

  useEffect(() => {
    setBaseEntry({ pounds: "", ounces: "", quantity: "" });
    setFormulaPreview([]);
    setInputDrafts({});
    setQuickLotOpen(false);
    setQuickLotForm({ lotCode: "", quantity: "", supplierId: "", sourceNote: "" });
    setSeedForm({ sourceBatchCode: batch.seed_source_batch_code || "", actualQuantity: batch.seed_actual_quantity ?? "", notes: batch.seed_notes || "" });
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!baseRequest || !batch.recipe_id) {
      setFormulaPreview([]);
      return () => { cancelled = true; };
    }
    const timer = setTimeout(() => {
      nfos.calculateRecipeRequirements(batch.recipe_id, baseRequest.quantity, baseRequest.unit)
        .then((rows) => {
          if (cancelled) return;
          setFormulaPreview(rows || []);
        })
        .catch((err) => {
          if (!cancelled) setError(err?.message || "Could not calculate expected ingredient amounts.");
        });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [baseRequest?.quantity, baseRequest?.unit, batch.recipe_id]);

  useEffect(() => {
    if (batch.texture !== "spun" || !expectedSeedOz) return;
    setSeedForm((current) => current.actualQuantity
      ? current
      : { ...current, actualQuantity: String(expectedSeedOz) });
  }, [batch.texture, expectedSeedOz]);

  const availableLots = (itemId) => lotBalances.filter((x) => x.item_id === itemId && Number(x.on_hand) > 0 && x.location_id === batch.production_location_id);

  const addBaseLot = async () => {
    if (!baseRequirement || !baseItem) return;
    const lotCode = quickLotForm.lotCode.trim();
    const quantity = Number(quickLotForm.quantity || 0);
    setBusy(true); setError(""); setMessage("");
    try {
      if (!lotCode) throw new Error("Enter the honey lot number exactly as it appears on the source lot.");

      const existing = lots.find(
        (lot) => lot.item_id === baseRequirement.item_id && String(lot.lot_code || "").trim().toLowerCase() === lotCode.toLowerCase()
      );
      if (existing) {
        setInputDrafts((current) => ({
          ...current,
          [baseRequirement.recipe_input_id]: {
            ...(current[baseRequirement.recipe_input_id] || {}),
            lotId: existing.id,
          },
        }));
        setMessage(`Lot ${lotCode} already exists in NFOS and was selected. No inventory was added.`);
        setQuickLotOpen(false);
        return;
      }

      if (!quantity || quantity <= 0) throw new Error(`Enter the amount of this lot being added to inventory in ${baseItem.stocking_unit}.`);

      const result = await nfos.receiveItem({
        itemId: baseRequirement.item_id,
        locationId: batch.production_location_id,
        quantity,
        lotCode,
        supplierLotCode: lotCode,
        supplierId: quickLotForm.supplierId || null,
        totalCost: "",
        receivedAt: new Date().toISOString(),
        notes: [
          `Quick-added during production batch ${batch.batch_code}.`,
          quickLotForm.sourceNote.trim() ? `Brand/source: ${quickLotForm.sourceNote.trim()}` : "",
        ].filter(Boolean).join(" "),
      });

      setInputDrafts((current) => ({
        ...current,
        [baseRequirement.recipe_input_id]: {
          ...(current[baseRequirement.recipe_input_id] || {}),
          lotId: result?.lot_id || "",
        },
      }));
      setQuickLotForm({ lotCode: "", quantity: "", supplierId: "", sourceNote: "" });
      setQuickLotOpen(false);
      setMessage(`Honey lot ${lotCode} was received into NFOS and selected for this batch.`);
      await load();
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not add the honey lot."); }
    finally { setBusy(false); }
  };

  const deleteBaseLot = async () => {
    if (!baseRequirement) return;
    const selectedLotId = (inputDrafts[baseRequirement.recipe_input_id] || {}).lotId || "";
    if (!selectedLotId) {
      setError("Choose the honey lot you want to delete first.");
      return;
    }
    const selectedLot = lotMap[selectedLotId];
    const lotCode = selectedLot?.lot_code || selectedLotId;
    const confirmed = window.confirm(
      `Delete honey lot ${lotCode}? This is only allowed when the lot has never been used in production. Its received quantity will be removed from active inventory, while NFOS keeps an audit record of the correction.`
    );
    if (!confirmed) return;
    const reason = window.prompt("Reason for deleting this lot:", "Typo / mistyped lot number");
    if (reason === null) return;

    setBusy(true); setError(""); setMessage("");
    try {
      await nfos.voidUnusedLot({ lotId: selectedLotId, reason });
      setInputDrafts((current) => ({
        ...current,
        [baseRequirement.recipe_input_id]: {
          ...(current[baseRequirement.recipe_input_id] || {}),
          lotId: "",
        },
      }));
      setMessage(`Honey lot ${lotCode} was removed from active inventory.`);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err?.message || "Could not delete the lot.");
    } finally {
      setBusy(false);
    }
  };

  const saveSpunDetails = async () => {
    if (batch.texture !== "spun") return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (!seedForm.sourceBatchCode.trim()) throw new Error("Enter the prior natural spun-honey seed batch code.");
      if (!Number(seedForm.actualQuantity || 0)) throw new Error("Enter the actual seed quantity used.");
      await nfos.setSpunBatchDetails({
        batchId: batch.id,
        seedSourceBatchCode: seedForm.sourceBatchCode,
        seedActualQuantity: seedForm.actualQuantity,
        seedUnit: "oz",
        notes: seedForm.notes,
      });
      setMessage("Spun seed provenance saved.");
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not save spun seed details."); }
    finally { setBusy(false); }
  };

  const toggleSopStep = async (step) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await nfos.setBatchStepCompletion({
        batchId: batch.id,
        recipeStepId: step.recipe_step_id,
        completed: !step.completed_at,
      });
      await load();
    } catch (err) { setError(err?.message || "Could not update the SOP step."); }
    finally { setBusy(false); }
  };

  const saveQc = async (row) => {
    const draft = qcDrafts[row.check_key] || { value: "", notes: "" };
    setBusy(true); setError(""); setMessage("");
    try {
      const input = { batchId: batch.id, checkKey: row.check_key, notes: draft.notes };
      if (row.result_type === "number") input.numericValue = draft.value;
      else if (row.result_type === "boolean") input.booleanValue = draft.value === "true";
      else input.textValue = draft.value;
      await nfos.recordQualityCheck(input);
      setMessage(`${row.label} saved.`);
      await load();
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not save QC result."); }
    finally { setBusy(false); }
  };

  const complete = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      if (!baseRequirement || !baseItem || !baseRequest) throw new Error("Enter the actual base ingredient amount before completing the batch.");
      if (batch.texture === "spun") {
        if (!seedForm.sourceBatchCode.trim()) throw new Error("Enter the prior natural spun-honey seed batch code.");
        if (!Number(seedForm.actualQuantity || 0)) throw new Error("Enter the actual seed quantity used.");
        await nfos.setSpunBatchDetails({
          batchId: batch.id,
          seedSourceBatchCode: seedForm.sourceBatchCode,
          seedActualQuantity: seedForm.actualQuantity,
          seedUnit: "oz",
          notes: seedForm.notes,
        });
      }
      const inputs = requirements.map((row) => {
        const draft = inputDrafts[row.recipe_input_id] || {};
        const item = itemMap[row.item_id];
        const isBase = Boolean(row.is_base);
        const quantity = isBase ? baseRequest.quantity : Number(draft.quantity || 0);
        const unit = isBase ? baseRequest.unit : item?.stocking_unit;
        if (!quantity || Number(quantity) <= 0) throw new Error(`Enter the actual quantity used for ${item?.name || row.item_name}.`);
        if (item?.track_lots && !draft.lotId) throw new Error(`Select the lot used for ${item.name}.`);
        return {
          recipe_input_id: row.recipe_input_id,
          item_id: row.item_id,
          lot_id: draft.lotId || null,
          location_id: batch.production_location_id,
          quantity: Number(quantity),
          unit,
        };
      });
      const finishedOutputs = finishedItems.map((item) => ({ item_id: item.id, location_id: batch.production_location_id, quantity: Number(outputs[item.id] || 0), lot_code: batch.batch_code })).filter((x) => x.quantity > 0);
      if (!finishedOutputs.length) throw new Error("Enter at least one finished jar quantity before completing the batch.");
      const confirmed = window.confirm(
        `Complete ${batch.batch_code}? This will permanently post actual ingredient consumption, packaging usage, finished inventory and any required release hold. Only continue when this production batch is truly finished.`
      );
      if (!confirmed) return;
      await nfos.completeBatch({ batchId: batch.id, inputs, outputs: finishedOutputs, actualBulkYield: actualYield, yieldUnit: batch.planned_unit, includePackagingBom: true, notes });
      setMessage("Batch completed. Actual ingredient usage, variance, lots and finished inventory were recorded.");
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not complete batch."); }
    finally { setBusy(false); }
  };

  const releaseBatch = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      await nfos.releaseBatch(batch.id, "Released after required production hold.");
      setMessage("Batch released to sellable inventory.");
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not release batch."); }
    finally { setBusy(false); }
  };

  const confirmSpunCure = async () => {
    const notes = window.prompt("Optional cure notes (for example refrigerator log reference):", batch.spun_cure_notes || "");
    if (notes === null) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await nfos.confirmSpunCure(batch.id, notes);
      setMessage("Two-week spun cure below 41°F confirmed.");
      await onChanged?.();
    } catch (err) { setError(err?.message || "Could not confirm the spun cure."); }
    finally { setBusy(false); }
  };

  return <>
    <div className="nfos-card">
      <div className="nfos-split-head"><div><h2 style={{ marginBottom: 4 }}>{batch.batch_code}</h2><div className="nfos-muted">{batch.flavor_name || batch.recipe_name} • Recipe v{batch.recipe_version} • <strong>{batch.texture === "spun" ? "Spun" : "Regular"}</strong> • {locationMap[batch.production_location_id]?.name || batch.production_location_name}</div></div><div className="nfos-inline-actions"><StatusPill value={batch.status} /><StatusPill value={batch.quality_status} /></div></div>
      <div style={{ maxWidth: 420, marginTop: 16 }}><NfosBarcode value={batch.barcode_value} title={batch.batch_code} subtitle={`${batch.flavor_name || batch.recipe_name} • Batch`} /></div>
    </div>
    <Notice type="error">{error}</Notice><Notice>{message}</Notice>
    {batch.status === "completed" ? <>
      <div className="nfos-card nfos-release-card">
        <div className="nfos-split-head">
          <div><h3 style={{ marginBottom: 5 }}>Release control</h3><div className="nfos-muted">Finished inventory remains controlled until all required release conditions are met.</div></div>
          <StatusPill value={batch.release_status || "ready"} />
        </div>
        <div className="nfos-grid two nfos-release-grid" style={{ marginTop: 14 }}>
          <div><span className="nfos-stat-label">Completed</span><strong>{fmtDate(batch.completed_at)}</strong></div>
          <div><span className="nfos-stat-label">Release eligible</span><strong>{fmtDate(batch.release_not_before || batch.completed_at)}</strong></div>
        </div>
        {Number(batch.release_hold_days || 0) > 0 && <div className="nfos-note" style={{ marginTop: 14 }}><strong>{batch.release_hold_days}-day infusion hold.</strong> Finished jars count as NectarFusions inventory but are not available for online sale or fulfillment until released.</div>}
        {batch.release_status === "holding" && <div className="nfos-note" style={{ marginTop: 12 }}>{batch.texture === "spun" ? "This spun batch is completing its mandatory 14-day cure below 41°F. NFOS will not allow early release." : "This batch is still in its required infusion hold. NFOS will not allow early release."}</div>}
        {batch.release_status === "cure_pending" && <div className="nfos-note" style={{ marginTop: 12 }}><strong>14-day cure window is complete.</strong> Confirm that the spun honey remained below 41°F for the required cure before release.</div>}
        {batch.release_status === "cure_pending" && <div className="nfos-inline-actions" style={{ marginTop: 14 }}><button className="nfos-btn" disabled={busy} onClick={confirmSpunCure}>Confirm 2-week cure below 41°F</button></div>}
        {["eligible", "ready"].includes(batch.release_status) && !batch.released_at && <div className="nfos-inline-actions" style={{ marginTop: 14 }}><button className="nfos-btn" disabled={busy} onClick={releaseBatch}>Release to sellable inventory</button></div>}
        {batch.release_status === "released" && <div className="nfos-success" style={{ marginTop: 12 }}>Released {fmtDate(batch.released_at)}. Finished jars are now available through sellable inventory locations.</div>}
      </div>
      <div className="nfos-note">This batch is complete and its production inventory transactions are locked in the ledger. Use Traceability to inspect the source lots, actual usage, QC results and finished lots.</div>
    </> : <>
      <div className="nfos-card">
        <h3>1. Actual ingredients used</h3>
        <p className="nfos-muted">Enter the actual base amount first. NFOS calculates the expected formula from that amount, then you record what was actually used.</p>
        {baseRequirement && baseItem ? <div className="nfos-base-entry">
          <div><strong>{baseRequirement.item_name}</strong><div className="nfos-small nfos-muted">Variable base ingredient • Company on hand {qty(baseRequirement.company_on_hand)} {baseItem.stocking_unit}</div></div>
          {baseItem.stocking_unit === "lb" ? <div className="nfos-base-pair"><div className="nfos-field"><label>Actual pounds</label><input type="number" min="0" step="1" value={baseEntry.pounds} onChange={(e) => setBaseEntry({ ...baseEntry, pounds: e.target.value })} /></div><div className="nfos-field"><label>Additional ounces</label><input type="number" min="0" max="15.9999" step="any" value={baseEntry.ounces} onChange={(e) => setBaseEntry({ ...baseEntry, ounces: e.target.value })} /></div></div> : <div className="nfos-field"><label>Actual amount ({baseItem.stocking_unit})</label><input type="number" min="0.0001" step="any" value={baseEntry.quantity} onChange={(e) => setBaseEntry({ ...baseEntry, quantity: e.target.value })} /></div>}
          <div className="nfos-field"><label>Base lot</label><select value={(inputDrafts[baseRequirement.recipe_input_id] || {}).lotId || ""} onChange={(e) => setInputDrafts({ ...inputDrafts, [baseRequirement.recipe_input_id]: { ...(inputDrafts[baseRequirement.recipe_input_id] || {}), lotId: e.target.value } })}><option value="">Choose lot…</option>{availableLots(baseRequirement.item_id).map((lb) => <option key={`${lb.lot_id}-${lb.location_id}`} value={lb.lot_id}>{lotMap[lb.lot_id]?.lot_code || lb.lot_id} • {qty(lb.on_hand)} {baseItem.stocking_unit}</option>)}</select><button type="button" className="nfos-btn secondary nfos-quick-lot-toggle" disabled={busy} onClick={() => {
            if (quickLotOpen) {
              setQuickLotOpen(false);
              return;
            }
            const suggestedQuantity = baseRequest
              ? (baseItem.stocking_unit === "lb" && baseRequest.unit === "oz"
                ? Number(baseRequest.quantity) / 16
                : Number(baseRequest.quantity))
              : null;
            setQuickLotForm((current) => ({
              ...current,
              quantity: suggestedQuantity && suggestedQuantity > 0
                ? String(Number(suggestedQuantity.toFixed(4)))
                : current.quantity,
            }));
            setQuickLotOpen(true);
          }}>{quickLotOpen ? "Cancel new lot" : "+ Add new honey lot"}</button>{(inputDrafts[baseRequirement.recipe_input_id] || {}).lotId ? <button type="button" className="nfos-btn ghost nfos-quick-lot-toggle" disabled={busy} onClick={deleteBaseLot}>Delete selected lot</button> : null}</div>
          {quickLotOpen && <div className="nfos-quick-lot"><div><strong>Add honey lot without leaving Production</strong><div className="nfos-small nfos-muted">The lot number is entered manually and saved exactly as entered. This also creates a Receiving inventory entry so NFOS can consume the lot.</div></div><div className="nfos-quick-lot-grid"><div className="nfos-field"><label>Honey lot number</label><input autoFocus value={quickLotForm.lotCode} onChange={(e) => setQuickLotForm({ ...quickLotForm, lotCode: e.target.value })} placeholder="Enter exact lot number" /></div><div className="nfos-field"><label>Quantity added to inventory ({baseItem.stocking_unit})</label><input type="number" min="0.0001" step="any" value={quickLotForm.quantity} onChange={(e) => setQuickLotForm({ ...quickLotForm, quantity: e.target.value })} /></div><div className="nfos-field"><label>Supplier, optional</label><select value={quickLotForm.supplierId} onChange={(e) => setQuickLotForm({ ...quickLotForm, supplierId: e.target.value })}><option value="">No supplier selected</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div><div className="nfos-field"><label>Brand / source, optional</label><input value={quickLotForm.sourceNote} onChange={(e) => setQuickLotForm({ ...quickLotForm, sourceNote: e.target.value })} placeholder="Brand or source name" /></div></div><div className="nfos-note">Enter the total amount from this lot that is being added to inventory at this location, not merely the amount you plan to use in this batch.</div><div className="nfos-inline-actions"><button type="button" className="nfos-btn" disabled={busy || !quickLotForm.lotCode.trim() || !Number(quickLotForm.quantity || 0)} onClick={addBaseLot}>Save lot + select it</button><button type="button" className="nfos-btn ghost" disabled={busy} onClick={() => setQuickLotOpen(false)}>Cancel</button></div></div>}
          {baseRequest && <div className="nfos-note">NFOS will consume {baseItem.stocking_unit === "lb" ? `${qty(baseRequest.quantity)} oz (${qty(Number(baseRequest.quantity) / 16)} lb)` : `${qty(baseRequest.quantity)} ${baseRequest.unit}`} from the selected base lot.</div>}
        </div> : <div className="nfos-error">This recipe does not define a base ingredient.</div>}
        {requirements.filter((row) => !row.is_base).length ? <div className="nfos-table-wrap" style={{ marginTop: 16 }}><table className="nfos-table"><thead><tr><th>Input</th><th>Expected</th><th>Actual used</th><th>Variance</th><th>Lot</th></tr></thead><tbody>{requirements.filter((row) => !row.is_base).map((row) => { const item = itemMap[row.item_id]; const draft = inputDrafts[row.recipe_input_id] || {}; const expected = previewMap[row.recipe_input_id]?.expected_quantity; const actual = Number(draft.quantity || 0); const variance = expected == null || !draft.quantity ? null : actual - Number(expected); const itemLots = availableLots(row.item_id); return <tr key={row.recipe_input_id}><td><strong>{row.item_name}</strong><div className="nfos-mono nfos-muted">{row.sku}</div><div className="nfos-small nfos-muted">{row.calculation_method === "percent_of_base_weight" ? `${qty(row.rate_percent)}% of actual base weight` : "Fixed formula amount"}</div></td><td>{expected == null ? <span className="nfos-muted">Enter base amount</span> : <strong>{qty(expected)} {item?.stocking_unit}</strong>}</td><td><input className="nfos-table-input" type="number" min="0.0001" step="any" value={draft.quantity || ""} onChange={(e) => setInputDrafts({ ...inputDrafts, [row.recipe_input_id]: { ...draft, quantity: e.target.value } })} /></td><td>{variance == null ? "—" : <span className={Math.abs(variance) < 0.0001 ? "nfos-muted" : ""}>{variance > 0 ? "+" : ""}{qty(variance)} {item?.stocking_unit}</span>}</td><td>{item?.track_lots ? <select className="nfos-table-input" value={draft.lotId || ""} onChange={(e) => setInputDrafts({ ...inputDrafts, [row.recipe_input_id]: { ...draft, lotId: e.target.value } })}><option value="">Choose lot…</option>{itemLots.map((lb) => <option key={`${lb.lot_id}-${lb.location_id}`} value={lb.lot_id}>{lotMap[lb.lot_id]?.lot_code || lb.lot_id} • {qty(lb.on_hand)} {item.stocking_unit}</option>)}</select> : "Not lot tracked"}</td></tr>; })}</tbody></table></div> : null}
      </div>
      {batch.texture === "spun" && <div className="nfos-card nfos-spun-card"><h3>2. Spun honey seed</h3><p className="nfos-muted">Seed must come from a prior NectarFusions spun batch made with natural honey. NFOS calculates the target at 10% of the original honey weight.</p><div className="nfos-grid two"><div className="nfos-field"><label>Expected seed</label><input disabled value={expectedSeedOz == null ? "Enter actual honey weight first" : `${qty(expectedSeedOz)} oz`} /></div><div className="nfos-field"><label>Actual seed used (oz)</label><input type="number" min="0.0001" step="any" value={seedForm.actualQuantity} onChange={(e) => setSeedForm({ ...seedForm, actualQuantity: e.target.value })} /></div><div className="nfos-field"><label>Source natural spun batch code</label><input value={seedForm.sourceBatchCode} onChange={(e) => setSeedForm({ ...seedForm, sourceBatchCode: e.target.value })} placeholder="Enter prior NFOS batch code" /></div><div className="nfos-field"><label>Seed notes, optional</label><input value={seedForm.notes} onChange={(e) => setSeedForm({ ...seedForm, notes: e.target.value })} placeholder="Source / handling note" /></div></div><div className="nfos-inline-actions" style={{ marginTop: 12 }}><button className="nfos-btn secondary" disabled={busy || !seedForm.sourceBatchCode.trim() || !Number(seedForm.actualQuantity || 0)} onClick={saveSpunDetails}>Save seed details</button></div>{expectedSeedOz != null && seedForm.actualQuantity && <div className="nfos-note" style={{ marginTop: 12 }}>Expected {qty(expectedSeedOz)} oz • Actual {qty(seedForm.actualQuantity)} oz • Variance {Number(seedForm.actualQuantity) - Number(expectedSeedOz) > 0 ? "+" : ""}{qty(Number(seedForm.actualQuantity) - Number(expectedSeedOz))} oz</div>}</div>}
      <div className="nfos-card"><h3>{batch.texture === "spun" ? "3" : "2"}. Production SOP</h3><p className="nfos-muted">Only the steps that apply to this batch’s {batch.texture === "spun" ? "Spun" : "Regular"} process are shown. Required confirmations must be complete before NFOS will close the batch.</p>{sopSteps.length ? <div className="nfos-sop-list">{sopSteps.map((step) => <div key={step.recipe_step_id} className={`nfos-sop-step ${step.completed_at ? "done" : ""}`}><div className="nfos-sop-step-head"><div><strong>{step.step_no}. {step.title}</strong>{step.critical_control && <span className="nfos-pill low" style={{ marginLeft: 8 }}>critical</span>}</div>{step.requires_confirmation ? <label className="nfos-sop-check"><input type="checkbox" checked={Boolean(step.completed_at)} disabled={busy} onChange={() => toggleSopStep(step)} /> Confirmed</label> : <span className="nfos-muted nfos-small">Reference</span>}</div><div className="nfos-sop-instruction">{step.instruction}</div>{step.expected_minutes != null && <div className="nfos-muted nfos-small">Expected time: {qty(step.expected_minutes)} minutes</div>}{step.notes && <div className="nfos-muted nfos-small">{step.notes}</div>}</div>)}</div> : <Empty>No SOP steps apply to this batch.</Empty>}</div>
      <div className="nfos-card"><h3>{batch.texture === "spun" ? "4" : "3"}. Quality control</h3>{qualityChecks.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Check</th><th>Result</th><th>Status</th><th></th></tr></thead><tbody>{qualityChecks.map((row) => { const draft = qcDrafts[row.check_key] || {}; return <tr key={row.id}><td><strong>{row.label}</strong><div className="nfos-muted nfos-small">{row.unit || row.result_type}</div></td><td>{row.result_type === "boolean" ? <select className="nfos-table-input" value={draft.value || ""} onChange={(e) => setQcDrafts({ ...qcDrafts, [row.check_key]: { ...draft, value: e.target.value } })}><option value="">Choose…</option><option value="true">Pass / Yes</option><option value="false">Fail / No</option></select> : <input className="nfos-table-input" type={row.result_type === "number" ? "number" : "text"} step="any" value={draft.value || ""} onChange={(e) => setQcDrafts({ ...qcDrafts, [row.check_key]: { ...draft, value: e.target.value } })} />}</td><td><StatusPill value={row.status} /></td><td><button className="nfos-btn ghost" disabled={busy} onClick={() => saveQc(row)}>Save check</button></td></tr>; })}</tbody></table></div> : <div className="nfos-note">This recipe has no required QC checks. NFOS will allow the batch to complete without a QC gate.</div>}</div>
      <div className="nfos-card"><h3>{batch.texture === "spun" ? "5" : "4"}. Finished outputs</h3><p className="nfos-muted">Only {batch.texture === "spun" ? "Spun" : "Regular"} finished SKUs are available for this batch. Enter exactly how many finished jars were produced by size. NFOS will create finished lots using the batch code. Recipes with a required release hold stay in non-sellable inventory until an authorized release.</p>{finishedItems.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Finished SKU</th><th>Quantity produced</th><th>Lot</th></tr></thead><tbody>{finishedItems.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><div className="nfos-mono nfos-muted">{item.sku}</div></td><td><input className="nfos-table-input" type="number" min="0" step="1" value={outputs[item.id] || ""} onChange={(e) => setOutputs({ ...outputs, [item.id]: e.target.value })} /></td><td className="nfos-mono">{batch.batch_code}</td></tr>)}</tbody></table></div> : <Empty>No finished SKUs are linked to this recipe’s flavor.</Empty>}<div className="nfos-form" style={{ marginTop: 14 }}><div className="nfos-field"><label>Actual bulk yield, optional</label><input type="number" min="0" step="any" value={actualYield} onChange={(e) => setActualYield(e.target.value)} /></div><div className="nfos-field"><label>Yield unit</label><input disabled value={batch.planned_unit} /></div><div className="nfos-field full"><label>Completion notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div><div className="nfos-field full"><button className="nfos-btn" disabled={busy || batch.quality_status === "failed" || batch.quality_status === "hold"} onClick={complete}>Complete batch + update inventory</button></div></div></div>
    </>}
  </>;
}

export function ProductionModule({ items, locations, lots, onRefresh }) {
  const [recipes, setRecipes] = useState([]);
  const [queue, setQueue] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orderForm, setOrderForm] = useState({ recipeId: "", plannedQuantity: "", plannedUnit: "", texture: "regular", outputs: {}, dueDate: "", priority: "normal", notes: "" });
  const [startOrderId, setStartOrderId] = useState("");
  const [startLocationId, setStartLocationId] = useState("");
  const [startTexture, setStartTexture] = useState("regular");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [recipeRows, queueRows, batchRows] = await Promise.all([nfos.listRecipes(), nfos.listProductionQueue(), nfos.listBatches()]);
      setRecipes(recipeRows || []); setQueue(queueRows || []); setBatches(batchRows || []);
      setSelectedBatchId((current) => current || batchRows?.find((x) => x.status !== "completed")?.id || batchRows?.[0]?.id || "");
      setStartLocationId((current) => current || locations.find((x) => x.code === "MAIN")?.id || locations.find((x) => x.active)?.id || "");
    } catch (err) { setError(err?.message || "Could not load production."); }
    finally { setBusy(false); }
  }, [locations]);
  useEffect(() => { load(); }, [load]);

  const activeRecipes = recipes.filter((x) => x.status === "active");
  const selectedBatch = batches.find((x) => x.id === selectedBatchId);
  const selectedOrderRecipe = recipes.find((x) => x.id === orderForm.recipeId) || null;
  const plannedFinishedItems = useMemo(() => items.filter((item) =>
    item.item_type === "finished_good" &&
    item.active &&
    selectedOrderRecipe?.legacy_flavor_id &&
    item.legacy_flavor_id === selectedOrderRecipe.legacy_flavor_id &&
    item.legacy_texture === orderForm.texture
  ).sort((a, b) => String(a.legacy_size_id || a.name).localeCompare(String(b.legacy_size_id || b.name))), [items, selectedOrderRecipe?.legacy_flavor_id, orderForm.texture]);
  const plannedOutputUnits = plannedFinishedItems.reduce((sum, item) => sum + Number(orderForm.outputs?.[item.id] || 0), 0);
  const selectedStartOrder = queue.find((x) => x.id === startOrderId) || null;
  const selectedStartRecipe = selectedStartOrder ? recipes.find((x) => x.id === selectedStartOrder.recipe_id) : null;

  useEffect(() => {
    if (selectedStartOrder) setStartTexture(selectedStartOrder.planned_texture || "regular");
  }, [selectedStartOrder?.id, selectedStartOrder?.planned_texture]);

  const createOrder = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const recipe = recipes.find((x) => x.id === orderForm.recipeId);
      if (!recipe) throw new Error("Choose an active recipe.");
      if (orderForm.texture === "spun" && !recipe.spun_eligible) throw new Error("This recipe is not approved for Spun honey.");
      const plannedOutputs = plannedFinishedItems
        .map((item) => ({ item_id: item.id, quantity: Number(orderForm.outputs?.[item.id] || 0) }))
        .filter((row) => row.quantity > 0);
      const result = await nfos.createProductionOrderWithPlan({
        ...orderForm,
        plannedUnit: recipe?.basis_unit || orderForm.plannedUnit,
        outputs: plannedOutputs,
      });
      setMessage(plannedOutputs.length
        ? `${result.order_no} created. Ingredient and packaging demand are now included in Purchasing.`
        : `${result.order_no} created. Ingredient demand is forecast now; add a jar mix before production if you want packaging demand forecast too.`
      );
      setOrderForm({ recipeId: "", plannedQuantity: "", plannedUnit: "", texture: "regular", outputs: {}, dueDate: "", priority: "normal", notes: "" });
      await load();
    } catch (err) { setError(err?.message || "Could not create production order."); }
    finally { setBusy(false); }
  };

  const start = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nfos.startBatch({ productionOrderId: startOrderId, locationId: startLocationId, texture: startTexture });
      setMessage(`Batch ${result.batch_code} started.`); await load(); setSelectedBatchId(result.id); await onRefresh?.();
    } catch (err) { setError(err?.message || "Could not start batch."); }
    finally { setBusy(false); }
  };

  const changed = async () => { await load(); await onRefresh?.(); };

  return <>
    <Notice type="error">{error}</Notice><Notice>{message}</Notice>
    <div className="nfos-grid two">
      <div className="nfos-card"><h2>Production queue</h2><p className="nfos-muted">Planned orders now feed ingredient and packaging demand directly into Purchasing before production begins.</p>{queue.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Order</th><th>Recipe</th><th>Planned</th><th>Texture</th><th>Jar plan</th><th>Due</th><th>Status</th></tr></thead><tbody>{queue.map((row) => <tr key={row.id}><td className="nfos-mono">{row.order_no}</td><td><strong>{row.flavor_name || row.recipe_name}</strong><div className="nfos-muted nfos-small">{row.recipe_name}</div></td><td>{qty(row.planned_quantity)} {row.planned_unit}</td><td>{row.planned_texture === "spun" ? "Spun" : "Regular"}</td><td>{row.packaging_plan_complete ? <><strong>{qty(row.planned_finished_units)} jars</strong><div className="nfos-muted nfos-small">{row.planned_output_sku_count} SKU{Number(row.planned_output_sku_count) === 1 ? "" : "s"}</div></> : <span className="nfos-pill low">Packaging plan incomplete</span>}</td><td>{row.due_date || "—"}</td><td><StatusPill value={row.status} /></td></tr>)}</tbody></table></div> : <Empty>No production orders yet.</Empty>}</div>
      <div className="nfos-card"><h2>Create production order</h2><form className="nfos-form" onSubmit={createOrder}><div className="nfos-field full"><label>Active recipe</label><select required value={orderForm.recipeId} onChange={(e) => setOrderForm({ ...orderForm, recipeId: e.target.value, texture: "regular", outputs: {} })}><option value="">Choose recipe…</option>{activeRecipes.map((x) => <option key={x.id} value={x.id}>{x.flavor_name || x.name} — {x.name} v{x.version}</option>)}</select></div><div className="nfos-field"><label>Planned batch quantity</label><input required type="number" min="0.0001" step="any" value={orderForm.plannedQuantity} onChange={(e) => setOrderForm({ ...orderForm, plannedQuantity: e.target.value })} /></div><div className="nfos-field"><label>Recipe basis unit</label><input disabled value={selectedOrderRecipe?.basis_unit || "—"} /></div><div className="nfos-field"><label>Texture</label><select value={orderForm.texture} disabled={!selectedOrderRecipe} onChange={(e) => setOrderForm({ ...orderForm, texture: e.target.value, outputs: {} })}><option value="regular">Regular</option><option value="spun" disabled={selectedOrderRecipe && !selectedOrderRecipe.spun_eligible}>Spun</option></select>{selectedOrderRecipe && !selectedOrderRecipe.spun_eligible && <div className="nfos-muted nfos-small">This SOP is Regular only.</div>}</div><div className="nfos-field"><label>Due date</label><input type="date" value={orderForm.dueDate} onChange={(e) => setOrderForm({ ...orderForm, dueDate: e.target.value })} /></div><div className="nfos-field"><label>Priority</label><select value={orderForm.priority} onChange={(e) => setOrderForm({ ...orderForm, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></div><div className="nfos-field full"><label>Planned finished jars</label>{plannedFinishedItems.length ? <div className="nfos-plan-output-grid">{plannedFinishedItems.map((item) => <div className="nfos-plan-output" key={item.id}><div><strong>{item.name}</strong><div className="nfos-mono nfos-muted nfos-small">{item.sku}</div></div><input type="number" min="0" step="1" value={orderForm.outputs?.[item.id] || ""} onChange={(e) => setOrderForm({ ...orderForm, outputs: { ...(orderForm.outputs || {}), [item.id]: e.target.value } })} placeholder="0" /></div>)}</div> : <div className="nfos-note">Choose a recipe and texture to plan finished jar quantities.</div>}<div className="nfos-muted nfos-small" style={{ marginTop: 8 }}>{plannedOutputUnits > 0 ? `${qty(plannedOutputUnits)} total finished jars planned. NFOS will forecast their packaging automatically.` : "Jar quantities are optional at first. Ingredient demand will still be forecast, but packaging demand stays incomplete until jars are planned."}</div></div>{orderForm.texture === "spun" && orderForm.plannedQuantity && <div className="nfos-field full"><div className="nfos-note"><strong>Spun seed planning:</strong> this order will require approximately {qty(Number(orderForm.plannedQuantity || 0) * 16 * 0.10)} oz of prior NectarFusions natural spun honey seed. Seed remains a controlled production input, not a supplier purchase item.</div></div>}<div className="nfos-field full"><label>Notes</label><textarea value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} /></div><div className="nfos-field full"><button className="nfos-btn" disabled={busy || !activeRecipes.length}>Add to production queue</button></div></form></div>
    </div>
    <div className="nfos-card"><h2>Start a batch</h2><div className="nfos-form"><div className="nfos-field"><label>Production order</label><select value={startOrderId} onChange={(e) => setStartOrderId(e.target.value)}><option value="">Choose queued order…</option>{queue.filter((x) => !["completed", "cancelled"].includes(x.status)).map((x) => <option key={x.id} value={x.id}>{x.order_no} — {x.flavor_name || x.recipe_name} — {x.planned_texture === "spun" ? "Spun" : "Regular"} — {qty(x.planned_quantity)} {x.planned_unit}</option>)}</select></div><div className="nfos-field"><label>Production location</label><select value={startLocationId} onChange={(e) => setStartLocationId(e.target.value)}><option value="">Choose location…</option>{locations.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div><div className="nfos-field"><label>Planned texture</label><input disabled value={selectedStartOrder ? (selectedStartOrder.planned_texture === "spun" ? "Spun" : "Regular") : "—"} />{selectedStartOrder?.planned_texture === "spun" && <div className="nfos-muted nfos-small">10% seed + 14-day cure controls will apply automatically.</div>}</div><div className="nfos-field full"><button className="nfos-btn" disabled={busy || !startOrderId || !startLocationId} onClick={start}>Start {startTexture === "spun" ? "Spun" : "Regular"} batch</button></div></div></div>
    <div className="nfos-card"><h2>Batches</h2>{batches.length ? <div className="nfos-select-list nfos-batch-list">{batches.map((b) => <button key={b.id} className={selectedBatchId === b.id ? "active" : ""} onClick={() => setSelectedBatchId(b.id)}><span><strong>{b.batch_code}</strong><small>{b.flavor_name || b.recipe_name} • {b.texture === "spun" ? "Spun" : "Regular"} • {fmtDate(b.started_at)}</small></span><span className="nfos-inline-actions"><StatusPill value={b.status} /><StatusPill value={b.quality_status} />{b.status === "completed" && <StatusPill value={b.release_status} />}</span></button>)}</div> : <Empty>No production batches yet.</Empty>}</div>
    {selectedBatch && <BatchWorkspace batch={selectedBatch} items={items} locations={locations} lots={lots} onChanged={changed} />}
  </>;
}

export function TraceabilityModule({ items, lots }) {
  const [batches, setBatches] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [inputs, setInputs] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [quality, setQuality] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const itemMap = useMemo(() => Object.fromEntries(items.map((x) => [x.id, x])), [items]);
  const lotMap = useMemo(() => Object.fromEntries(lots.map((x) => [x.id, x])), [lots]);
  const selected = batches.find((x) => x.id === selectedId);
  const filtered = useMemo(() => batches.filter((x) => `${x.batch_code} ${x.flavor_name || ""} ${x.recipe_name || ""} ${x.barcode_value || ""}`.toLowerCase().includes(search.toLowerCase())), [batches, search]);

  const loadBatches = useCallback(async () => {
    try { const rows = await nfos.listBatches(); setBatches(rows || []); setSelectedId((current) => current || rows?.[0]?.id || ""); }
    catch (err) { setError(err?.message || "Could not load traceability."); }
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => {
    if (!selectedId) { setInputs([]); setOutputs([]); setQuality([]); return; }
    Promise.all([nfos.listBatchInputs(selectedId), nfos.listBatchOutputs(selectedId), nfos.listQualityChecks(selectedId)])
      .then(([a, b, c]) => { setInputs(a || []); setOutputs(b || []); setQuality(c || []); })
      .catch((err) => setError(err?.message || "Could not load batch traceability."));
  }, [selectedId]);

  const scan = async (event) => {
    event.preventDefault();
    try {
      const found = await nfos.lookupBarcode(search);
      if (found?.entity_type === "batch") { setSelectedId(found.entity_id); setSearch(""); }
      else if (found) setError(`That barcode belongs to a ${found.entity_type}, not a production batch.`);
      else setError("Barcode not found.");
    } catch (err) { setError(err?.message || "Could not look up barcode."); }
  };

  return <>
    <Notice type="error">{error}</Notice>
    <div className="nfos-grid two nfos-trace-layout"><div className="nfos-card"><h2>Find batch</h2><form className="nfos-scan" onSubmit={scan}><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batch, flavor or scan batch barcode…" /><button className="nfos-btn">Scan / search</button></form><div className="nfos-select-list" style={{ marginTop: 14 }}>{filtered.slice(0, 100).map((b) => <button key={b.id} className={selectedId === b.id ? "active" : ""} onClick={() => setSelectedId(b.id)}><span><strong>{b.batch_code}</strong><small>{b.flavor_name || b.recipe_name} • {fmtDate(b.started_at)}</small></span><StatusPill value={b.status} /></button>)}</div></div><div>{selected ? <><div className="nfos-card"><div className="nfos-split-head"><div><h2>{selected.batch_code}</h2><p className="nfos-muted">{selected.flavor_name || selected.recipe_name} • Recipe v{selected.recipe_version}</p></div><div className="nfos-inline-actions"><StatusPill value={selected.status} /><StatusPill value={selected.quality_status} /></div></div><NfosBarcode value={selected.barcode_value} title={selected.batch_code} subtitle="Production batch" /></div><div className="nfos-card"><h3>Inputs / source lots</h3>{inputs.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Material</th><th>Actual</th><th>Expected</th><th>Variance</th><th>Lot</th></tr></thead><tbody>{inputs.map((x) => <tr key={x.id}><td><strong>{itemMap[x.item_id]?.name || x.item_id}</strong><div className="nfos-mono nfos-muted">{itemMap[x.item_id]?.sku}</div></td><td>{x.entered_quantity != null ? `${qty(x.entered_quantity)} ${x.entered_unit || x.unit}` : `${qty(x.quantity)} ${x.unit}`}</td><td>{x.expected_quantity == null ? "—" : `${qty(x.expected_quantity)} ${x.unit}`}</td><td>{x.variance_quantity == null ? "—" : `${Number(x.variance_quantity) > 0 ? "+" : ""}${qty(x.variance_quantity)} ${x.unit}`}</td><td>{lotMap[x.lot_id]?.lot_code || (x.lot_id ? x.lot_id : "Not lot tracked")}</td></tr>)}</tbody></table></div> : <Empty>No batch inputs recorded yet.</Empty>}</div><div className="nfos-card"><h3>Finished lots</h3>{outputs.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Finished SKU</th><th>Qty</th><th>Finished lot</th></tr></thead><tbody>{outputs.map((x) => <tr key={x.id}><td><strong>{itemMap[x.item_id]?.name || x.item_id}</strong><div className="nfos-mono nfos-muted">{itemMap[x.item_id]?.sku}</div></td><td>{qty(x.quantity)} {x.unit}</td><td>{lotMap[x.lot_id]?.lot_code || x.lot_id}</td></tr>)}</tbody></table></div> : <Empty>No finished outputs recorded yet.</Empty>}</div><div className="nfos-card"><h3>Quality record</h3>{quality.length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Check</th><th>Value</th><th>Status</th><th>Checked</th></tr></thead><tbody>{quality.map((q) => <tr key={q.id}><td>{q.label}</td><td>{q.numeric_value ?? q.text_value ?? (q.boolean_value == null ? "—" : q.boolean_value ? "Yes" : "No")} {q.unit || ""}</td><td><StatusPill value={q.status} /></td><td>{fmtDate(q.checked_at)}</td></tr>)}</tbody></table></div> : <Empty>No QC record for this batch.</Empty>}</div><div className="nfos-note">Release 2 traceability covers source material lots → production batch → finished lots. Assigning each customer/retailer sale to a finished lot is the next traceability layer.</div></> : <div className="nfos-card"><Empty>Select a batch.</Empty></div>}</div></div>
  </>;
}

