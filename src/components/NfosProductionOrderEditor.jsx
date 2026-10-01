import { useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

export default function NfosProductionOrderEditor({ order, recipes, items, onClose, onSaved }) {
  const [form, setForm] = useState({
    recipeId: order?.recipe_id || "",
    plannedQuantity: order?.planned_quantity == null ? "" : String(order.planned_quantity),
    texture: order?.planned_texture || "regular",
    outputs: {},
    dueDate: order?.due_date || "",
    priority: order?.priority || "normal",
    notes: order?.notes || "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const recipeOptions = useMemo(
    () => recipes.filter((recipe) => recipe.status === "active" || recipe.id === order?.recipe_id),
    [recipes, order?.recipe_id]
  );
  const selectedRecipe = recipes.find((recipe) => recipe.id === form.recipeId) || null;

  const finishedItems = useMemo(
    () =>
      items
        .filter((item) =>
          item.item_type === "finished_good" &&
          item.active &&
          selectedRecipe?.legacy_flavor_id &&
          item.legacy_flavor_id === selectedRecipe.legacy_flavor_id &&
          item.legacy_texture === form.texture
        )
        .sort((a, b) => String(a.legacy_size_id || a.name).localeCompare(String(b.legacy_size_id || b.name))),
    [items, selectedRecipe?.legacy_flavor_id, form.texture]
  );

  const totalJars = finishedItems.reduce(
    (sum, item) => sum + Number(form.outputs?.[item.id] || 0),
    0
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    nfos.listProductionOrderOutputs(order.id)
      .then((rows) => {
        if (!alive) return;
        const outputs = {};
        (rows || []).forEach((row) => {
          outputs[row.finished_item_id] = String(row.quantity_planned);
        });
        setForm((current) => ({ ...current, outputs }));
      })
      .catch((err) => {
        if (alive) setError(err?.message || "Could not load the production jar plan.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [order.id]);

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !saving) onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
    };
  }, [onClose, saving]);

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);

    try {
      if (!selectedRecipe) throw new Error("Choose an active recipe.");
      if (!Number(form.plannedQuantity || 0)) throw new Error("Planned quantity must be greater than zero.");
      if (form.texture === "spun" && !selectedRecipe.spun_eligible) {
        throw new Error("This recipe is not approved for Spun honey.");
      }

      const outputs = finishedItems
        .map((item) => ({
          item_id: item.id,
          quantity: Number(form.outputs?.[item.id] || 0),
        }))
        .filter((row) => row.quantity > 0);

      const result = await nfos.updateProductionOrderWithPlan({
        productionOrderId: order.id,
        recipeId: form.recipeId,
        plannedQuantity: form.plannedQuantity,
        texture: form.texture,
        outputs,
        dueDate: form.dueDate,
        priority: form.priority,
        notes: form.notes,
      });

      await onSaved?.(result);
    } catch (err) {
      setError(err?.message || "Could not update the production order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nfos-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose?.();
    }}>
      <div className="nfos-dialog-panel nfos-production-edit-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${order.order_no}`}>
        <div className="nfos-dialog-head">
          <div>
            <strong>Edit production order</strong>
            <div className="nfos-mono nfos-muted nfos-small">{order.order_no}</div>
          </div>
          <button className="nfos-btn ghost" type="button" disabled={saving} onClick={onClose} aria-label="Close editor">X</button>
        </div>

        {error && <div className="nfos-error">{error}</div>}

        {loading ? (
          <div className="nfos-empty">Loading production plan…</div>
        ) : (
          <form className="nfos-form" onSubmit={save}>
            <div className="nfos-field full">
              <label>Recipe</label>
              <select required value={form.recipeId} onChange={(event) => setForm({
                ...form,
                recipeId: event.target.value,
                texture: "regular",
                outputs: {},
              })}>
                <option value="">Choose recipe…</option>
                {recipeOptions.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.flavor_name || recipe.name} - {recipe.name} v{recipe.version}
                  </option>
                ))}
              </select>
            </div>

            <div className="nfos-field">
              <label>Planned batch quantity</label>
              <input required type="number" min="0.0001" step="any" value={form.plannedQuantity} onChange={(event) => setForm({ ...form, plannedQuantity: event.target.value })} />
            </div>

            <div className="nfos-field">
              <label>Recipe basis unit</label>
              <input disabled value={selectedRecipe?.basis_unit || order.planned_unit || "-"} />
            </div>

            <div className="nfos-field">
              <label>Texture</label>
              <select value={form.texture} disabled={!selectedRecipe} onChange={(event) => setForm({ ...form, texture: event.target.value, outputs: {} })}>
                <option value="regular">Regular</option>
                <option value="spun" disabled={selectedRecipe && !selectedRecipe.spun_eligible}>Spun</option>
              </select>
            </div>

            <div className="nfos-field">
              <label>Due date</label>
              <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
            </div>

            <div className="nfos-field">
              <label>Priority</label>
              <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className="nfos-field full">
              <label>Planned finished jars</label>
              {finishedItems.length ? (
                <div className="nfos-plan-output-grid">
                  {finishedItems.map((item) => (
                    <div className="nfos-plan-output" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <div className="nfos-mono nfos-muted nfos-small">{item.sku}</div>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.outputs?.[item.id] || ""}
                        onChange={(event) => setForm({
                          ...form,
                          outputs: { ...(form.outputs || {}), [item.id]: event.target.value },
                        })}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="nfos-note">Choose a recipe and texture to plan finished jar quantities.</div>
              )}
              <div className="nfos-muted nfos-small" style={{ marginTop: 8 }}>
                {totalJars > 0 ? `${totalJars} total finished jars planned.` : "No finished jars are currently planned."}
              </div>
            </div>

            <div className="nfos-field full">
              <label>Notes</label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>

            <div className="nfos-field full">
              <div className="nfos-inline-actions">
                <button className="nfos-btn" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
                <button className="nfos-btn ghost" type="button" disabled={saving} onClick={onClose}>Cancel</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
