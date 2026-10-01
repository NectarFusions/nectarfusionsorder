import { useEffect, useState } from "react";
import * as nfos from "../lib/nfosApi";

export default function NfosBatchDeleteDialog({ batch, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !busy) onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = priorOverflow;
    };
  }, [busy, onClose]);

  if (!batch) return null;

  const remove = async (deleteProductionOrder) => {
    setBusy(true);
    setError("");
    try {
      const result = await nfos.deleteUnpostedBatch(batch.id, deleteProductionOrder);
      await onDeleted?.(result);
    } catch (err) {
      setError(err?.message || "Could not delete this batch.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfos-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose?.();
    }}>
      <div className="nfos-dialog-panel nfos-batch-delete-dialog" role="dialog" aria-modal="true" aria-label={`Delete ${batch.batch_code}`}>
        <div className="nfos-dialog-head">
          <div>
            <strong>Delete production batch</strong>
            <div className="nfos-muted nfos-small">{batch.batch_code} · {batch.flavor_name || batch.recipe_name}</div>
          </div>
          <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose} aria-label="Close delete dialog">X</button>
        </div>

        <div className="nfos-batch-delete-body">
          {error && <div className="nfos-error">{error}</div>}

          <div className="nfos-note">
            <strong>This is for accidental or test batches.</strong> NFOS will permanently delete this batch only when no ingredient consumption, finished output, or inventory transaction has been posted.
          </div>

          <div className="nfos-delete-choice">
            <div>
              <strong>Delete batch only</strong>
              <p>Removes {batch.batch_code} and its automatic SOP/QC checklist records. {batch.order_no ? `${batch.order_no} returns to the Production Queue so it can be started again or edited.` : "No source production order is attached."}</p>
            </div>
            <button className="nfos-btn danger" type="button" disabled={busy} onClick={() => remove(false)}>
              {busy ? "Deleting…" : "Delete batch"}
            </button>
          </div>

          {batch.production_order_id && (
            <div className="nfos-delete-choice nfos-delete-choice-strong">
              <div>
                <strong>Delete batch + source order</strong>
                <p>Use this when the entire test was accidental. This removes both {batch.batch_code} and {batch.order_no || "its source production order"} so it does not remain in the queue.</p>
              </div>
              <button className="nfos-btn danger" type="button" disabled={busy} onClick={() => remove(true)}>
                {busy ? "Deleting…" : "Delete both"}
              </button>
            </div>
          )}

          <div className="nfos-inline-actions">
            <button className="nfos-btn ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
