import { useEffect, useState } from "react";
import * as nfos from "../lib/nfosApi";

export default function NfosSupplierTermsEditor({
  item,
  readiness,
  suppliers = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    supplierId: "",
    leadTimeDays: "",
    minimumOrderQty: "",
    orderIncrement: "",
    unitCost: "",
    supplierSku: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm({
      supplierId: readiness?.supplier_id || item?.preferred_supplier_id || "",
      leadTimeDays: readiness?.lead_time_days ?? "",
      minimumOrderQty: readiness?.minimum_order_qty ?? "",
      orderIncrement: readiness?.order_increment ?? "",
      unitCost: readiness?.last_unit_cost ?? readiness?.standard_unit_cost ?? item?.standard_unit_cost ?? "",
      supplierSku: readiness?.supplier_sku || "",
      notes: "",
    });
  }, [item?.id, readiness?.supplier_id, readiness?.updated_at]);

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

  if (!item) return null;

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!form.supplierId) throw new Error("Choose a supplier.");

      const result = await nfos.setItemSupplierTerms({
        itemId: item.id,
        supplierId: form.supplierId,
        leadTimeDays: form.leadTimeDays,
        minimumOrderQty: form.minimumOrderQty,
        orderIncrement: form.orderIncrement,
        unitCost: form.unitCost,
        supplierSku: form.supplierSku,
        setPreferred: true,
        notes: form.notes,
      });

      await onSaved?.(result);
    } catch (err) {
      setError(err?.message || "Could not save supplier terms.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfos-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose?.();
    }}>
      <div className="nfos-dialog-panel nfos-supplier-editor-dialog" role="dialog" aria-modal="true" aria-label={`Fix supplier terms for ${item.name}`}>
        <div className="nfos-dialog-head">
          <div>
            <strong>Fix supplier terms</strong>
            <div className="nfos-muted nfos-small">{item.sku} · {item.name}</div>
          </div>
          <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose} aria-label="Close supplier editor">X</button>
        </div>

        {error && <div className="nfos-error nfos-dialog-message">{error}</div>}

        <form className="nfos-form nfos-dialog-form" onSubmit={save}>
          <div className="nfos-field full">
            <label>Supplier</label>
            <select required value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })}>
              <option value="">Choose supplier…</option>
              {suppliers.filter((row) => row.active).map((row) => (
                <option key={row.id} value={row.id}>{row.name}</option>
              ))}
            </select>
          </div>

          <div className="nfos-field">
            <label>Lead time (days)</label>
            <input type="number" min="0" step="1" value={form.leadTimeDays} onChange={(event) => setForm({ ...form, leadTimeDays: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Unit cost</label>
            <input type="number" min="0" step="0.0001" value={form.unitCost} onChange={(event) => setForm({ ...form, unitCost: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Minimum order quantity</label>
            <input type="number" min="0" step="any" value={form.minimumOrderQty} onChange={(event) => setForm({ ...form, minimumOrderQty: event.target.value })} />
          </div>

          <div className="nfos-field">
            <label>Order increment</label>
            <input type="number" min="0.0001" step="any" value={form.orderIncrement} onChange={(event) => setForm({ ...form, orderIncrement: event.target.value })} />
          </div>

          <div className="nfos-field full">
            <label>Supplier SKU</label>
            <input value={form.supplierSku} onChange={(event) => setForm({ ...form, supplierSku: event.target.value })} />
          </div>

          <div className="nfos-field full">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>

          <div className="nfos-note full">
            Missing now: {(readiness?.missing_fields || []).join(", ") || "No remaining fields detected."}
          </div>

          <div className="nfos-field full">
            <div className="nfos-inline-actions">
              <button className="nfos-btn" disabled={busy}>{busy ? "Saving…" : "Save supplier terms"}</button>
              <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
