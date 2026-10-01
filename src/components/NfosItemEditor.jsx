import { useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const numberOrNull = (value) =>
  value === "" || value == null ? null : Number(value);

const typeLabel = (type) =>
  ({ finished_good: "Finished good", material: "Ingredient", packaging: "Packaging" }[type] || type);

export default function NfosItemEditor({
  item,
  suppliers = [],
  locations = [],
  onClose,
  onSaved,
  focus = "",
  title = "Edit inventory item",
}) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setForm({
      name: item.name || "",
      category: item.category || "",
      sizeLabel: item.size_label || "",
      reorderPoint: item.reorder_point ?? "",
      targetStock: item.target_stock ?? "",
      maxStock: item.max_stock ?? "",
      preferredOrderQty: item.preferred_order_qty ?? "",
      standardUnitCost: item.standard_unit_cost ?? "",
      preferredSupplierId: item.preferred_supplier_id || "",
      defaultLocationId: item.default_location_id || "",
      notes: item.notes || "",
      active: Boolean(item.active),
    });
  }, [item?.id]);

  useEffect(() => {
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      document.body.style.overflow = prior;
    };
  }, [busy, onClose]);

  const selectedSupplier = useMemo(
    () => suppliers.find((row) => row.id === form?.preferredSupplierId) || null,
    [suppliers, form?.preferredSupplierId]
  );

  if (!item || !form) return null;

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!form.name.trim()) throw new Error("Item name is required.");

      const result = await nfos.updateItem(item.id, {
        name: form.name.trim(),
        category: form.category.trim() || null,
        size_label: form.sizeLabel.trim() || null,
        reorder_point: numberOrNull(form.reorderPoint),
        target_stock: numberOrNull(form.targetStock),
        max_stock: numberOrNull(form.maxStock),
        preferred_order_qty: numberOrNull(form.preferredOrderQty),
        standard_unit_cost: numberOrNull(form.standardUnitCost),
        preferred_supplier_id: form.preferredSupplierId || null,
        default_location_id: form.defaultLocationId || null,
        notes: form.notes.trim() || null,
        active: Boolean(form.active),
      });

      await onSaved?.(result);
    } catch (err) {
      setError(err?.message || "Could not save item changes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfos-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose?.();
    }}>
      <div className="nfos-dialog-panel nfos-item-editor-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="nfos-dialog-head">
          <div>
            <strong>{title}</strong>
            <div className="nfos-muted nfos-small">
              {item.sku} · {typeLabel(item.item_type)} · Stocking unit: {item.stocking_unit}
            </div>
          </div>
          <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose} aria-label="Close item editor">X</button>
        </div>

        {error && <div className="nfos-error nfos-dialog-message">{error}</div>}

        <form className="nfos-form nfos-dialog-form" onSubmit={save}>
          <div className="nfos-field full">
            <label>Item name</label>
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Category</label>
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Size label</label>
            <input value={form.sizeLabel} onChange={(event) => setForm({ ...form, sizeLabel: event.target.value })} />
          </div>

          <div className={`nfos-field ${focus === "cost" ? "nfos-health-focus-field" : ""}`}>
            <label>Standard unit cost</label>
            <input
              autoFocus={focus === "cost"}
              type="number"
              min="0"
              step="0.0001"
              placeholder={`Cost per ${item.stocking_unit}`}
              value={form.standardUnitCost}
              onChange={(event) => setForm({ ...form, standardUnitCost: event.target.value })}
            />
            <div className="nfos-muted nfos-small">Cost per {item.stocking_unit}.</div>
          </div>

          <div className="nfos-field">
            <label>Preferred supplier</label>
            <select value={form.preferredSupplierId} onChange={(event) => setForm({ ...form, preferredSupplierId: event.target.value })}>
              <option value="">None</option>
              {suppliers.filter((row) => row.active).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
            {selectedSupplier && <div className="nfos-muted nfos-small">Complete ordering terms from System Health if needed.</div>}
          </div>

          <div className="nfos-field">
            <label>Reorder / make point</label>
            <input type="number" min="0" step="any" value={form.reorderPoint} onChange={(event) => setForm({ ...form, reorderPoint: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Target stock</label>
            <input type="number" min="0" step="any" value={form.targetStock} onChange={(event) => setForm({ ...form, targetStock: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Maximum stock</label>
            <input type="number" min="0" step="any" value={form.maxStock} onChange={(event) => setForm({ ...form, maxStock: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Preferred order quantity</label>
            <input type="number" min="0" step="any" value={form.preferredOrderQty} onChange={(event) => setForm({ ...form, preferredOrderQty: event.target.value })} />
          </div>

          <div className="nfos-field full">
            <label>Default location</label>
            <select value={form.defaultLocationId} onChange={(event) => setForm({ ...form, defaultLocationId: event.target.value })}>
              <option value="">None</option>
              {locations.filter((row) => row.active).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>

          <div className="nfos-field full">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          <div className="nfos-field full">
            <label><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Active item</label>
          </div>

          <div className="nfos-note full">
            SKU, item type, stocking unit, barcode, and on-hand quantity are not free-edited here. Quantity corrections use Adjust Inventory so the inventory ledger remains auditable.
          </div>

          <div className="nfos-field full">
            <div className="nfos-inline-actions">
              <button className="nfos-btn" disabled={busy}>{busy ? "Saving…" : "Save item"}</button>
              <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
