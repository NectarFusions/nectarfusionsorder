import { useCallback, useEffect, useState } from "react";
import * as nfos from "../lib/nfosApi";

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
const qty = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const signedMoney = (cents) => {
  const value = Number(cents || 0);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
};
const signedQty = (value) => {
  const number = Number(value || 0);
  return `${number > 0 ? "+" : number < 0 ? "−" : ""}${qty(Math.abs(number))}`;
};

export default function NfosMarketCloseoutApprovals({ notify, onChanged }) {
  const [data, setData] = useState({ pending: [], history: [] });
  const [notes, setNotes] = useState({});
  const [acceptVariance, setAcceptVariance] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await nfos.adminGetMarketCloseoutApprovals() || { pending: [], history: [] });
    } catch (err) {
      setError(err?.message || "Could not load market closeouts.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (closeout, action) => {
    setBusy(true);
    setError("");
    try {
      await nfos.adminReviewMarketCloseout(
        closeout.session_id,
        action,
        notes[closeout.session_id] || null,
        Boolean(acceptVariance[closeout.session_id])
      );
      notify?.(
        "success",
        action === "approve"
          ? `${closeout.venue_name} closeout approved. Sales and final inventory movement are posted.`
          : `${closeout.venue_name} closeout returned for correction.`
      );
      await load();
      await onChanged?.();
    } catch (err) {
      const message = err?.message || "Could not review market closeout.";
      setError(message);
      notify?.("error", message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfos-card nfos-market-approval-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div>
          <h2>Market Closeouts Awaiting Approval</h2>
          <p>One approval reconciles the full market. Inventory-only markets reconcile physical inventory and logged sales; payment comparison appears only when Square reconciliation was enabled.</p>
        </div>
        <div className="nfos-inline-actions">
          <span className="nfos-pill">{data.pending?.length || 0} pending</span>
          <button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button>
        </div>
      </div>

      {error && <div className="nfos-error">{error}</div>}

      {!data.pending?.length ? (
        <div className="nfos-empty">No submitted market closeouts are waiting for review.</div>
      ) : (
        <div className="nfos-market-approval-list">
          {data.pending.map((closeout) => {
            const inventoryVariance = Number(closeout.inventory_variance_units || 0);
            const paymentVariance = closeout.payment_variance_cents == null ? null : Number(closeout.payment_variance_cents || 0);
            const cashVariance = closeout.cash_variance_cents == null ? null : Number(closeout.cash_variance_cents || 0);
            const squareVariance = closeout.square_variance_cents == null ? null : Number(closeout.square_variance_cents || 0);
            const hasVariance = inventoryVariance !== 0
              || (paymentVariance != null && paymentVariance !== 0)
              || (cashVariance != null && cashVariance !== 0)
              || (squareVariance != null && squareVariance !== 0);

            return (
              <div className="nfos-market-approval-order" key={closeout.session_id}>
                <div className="nfos-split-head">
                  <div>
                    <strong>{closeout.venue_name}</strong>
                    <div className="nfos-muted nfos-small">
                      {closeout.market_day} · submitted by {closeout.submitted_by || "Market Manager"}
                    </div>
                  </div>
                  <span className={`nfos-pill ${hasVariance ? "low" : "ok"}`}>
                    {hasVariance ? "Needs review" : "Balanced"}
                  </span>
                </div>

                <div className="nfos-grid four" style={{ marginTop: 14 }}>
                  <div className="nfos-stat"><div className="nfos-stat-label">Taken</div><div className="nfos-stat-value">{qty(closeout.opening_units)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Logged sold</div><div className="nfos-stat-value">{qty(closeout.logged_units)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Counted back</div><div className="nfos-stat-value">{qty(closeout.returned_units)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Inventory variance</div><div className="nfos-stat-value">{qty(inventoryVariance)}</div></div>
                </div>

                <div className="nfos-grid four" style={{ marginTop: 12 }}>
                  <div className="nfos-stat"><div className="nfos-stat-label">Logged sales</div><div className="nfos-stat-value">{money(closeout.logged_gross_cents)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Square / noncash</div><div className="nfos-stat-value">{closeout.square_gross_cents == null ? "Not synced" : money(closeout.square_gross_cents)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Reported cash</div><div className="nfos-stat-value">{money(closeout.reported_cash_cents)}</div></div>
                  <div className="nfos-stat"><div className="nfos-stat-label">Payment variance</div><div className="nfos-stat-value">{paymentVariance == null ? "—" : signedMoney(paymentVariance)}</div></div>
                </div>

                {closeout.square_cash_cents > 0 && (
                  <div className="nfos-note" style={{ marginTop: 12 }}>
                    Square also recorded {money(closeout.square_cash_cents)} in cash tenders.
                    {cashVariance != null && <> Physical cash vs Square cash variance: <strong>{signedMoney(cashVariance)}</strong>.</>}
                  </div>
                )}

                <div className="nfos-table-wrap" style={{ marginTop: 14 }}>
                  <table className="nfos-table">
                    <thead>
                      <tr><th>Honey</th><th>Taken</th><th>Sold</th><th>Other use</th><th>Expected back</th><th>Counted back</th><th>Variance</th></tr>
                    </thead>
                    <tbody>
                      {(closeout.items || []).map((item) => (
                        <tr key={item.item_id}>
                          <td><strong>{item.name}</strong><div className="nfos-muted nfos-small">{item.size_label}</div></td>
                          <td>{qty(item.opening_quantity)}</td>
                          <td>{qty(item.sold_quantity)}</td>
                          <td>{qty(item.adjustment_quantity)}</td>
                          <td>{qty(item.expected_return_quantity)}</td>
                          <td>{qty(item.returned_quantity)}</td>
                          <td><strong>{signedQty(item.variance_quantity)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {(closeout.adjustments || []).length > 0 && (
                  <div className="nfos-note" style={{ marginTop: 12 }}>
                    <strong>Recorded non-sale product:</strong>{" "}
                    {(closeout.adjustments || []).map((item, index) => (
                      <span key={item.id}>{index ? " · " : ""}{item.quantity} × {item.name} {item.size_label} ({String(item.reason || "other").replaceAll("_", " ")})</span>
                    ))}
                  </div>
                )}

                {closeout.notes && <div className="nfos-note" style={{ marginTop: 12 }}><strong>Market note:</strong> {closeout.notes}</div>}

                {hasVariance && (
                  <label className="nfos-note" style={{ marginTop: 12, display: "block" }}>
                    <input
                      type="checkbox"
                      checked={Boolean(acceptVariance[closeout.session_id])}
                      onChange={(event) => setAcceptVariance({ ...acceptVariance, [closeout.session_id]: event.target.checked })}
                      style={{ marginRight: 8 }}
                    />
                    I reviewed the inventory/payment variance and accept it for this closeout.
                  </label>
                )}

                <div className="nfos-form" style={{ marginTop: 12 }}>
                  <div className="nfos-field full">
                    <label>Admin note (optional)</label>
                    <input
                      value={notes[closeout.session_id] || ""}
                      onChange={(event) => setNotes({ ...notes, [closeout.session_id]: event.target.value })}
                    />
                  </div>
                </div>

                <div className="nfos-inline-actions">
                  <button
                    className="nfos-btn"
                    disabled={busy || (hasVariance && !acceptVariance[closeout.session_id])}
                    onClick={() => review(closeout, "approve")}
                  >
                    {hasVariance ? "Approve · Accept Variance & Post" : "Approve Market · Post All"}
                  </button>
                  <button className="nfos-btn ghost" disabled={busy} onClick={() => review(closeout, "return")}>
                    Return for correction
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(data.history || []).length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary>Recent closeout history</summary>
          <div className="nfos-table-wrap" style={{ marginTop: 10 }}>
            <table className="nfos-table">
              <thead><tr><th>Market</th><th>Status</th><th>Inventory variance</th><th>Payment variance</th><th>Reviewed</th></tr></thead>
              <tbody>
                {(data.history || []).map((row) => (
                  <tr key={`${row.session_id}-${row.reviewed_at}`}>
                    <td><strong>{row.venue_name}</strong><div className="nfos-muted nfos-small">{row.market_day}</div></td>
                    <td><span className={`nfos-pill ${row.status === "approved" ? "ok" : "low"}`}>{row.status}</span></td>
                    <td>{qty(row.inventory_variance_units)}</td>
                    <td>{row.payment_variance_cents == null ? "—" : signedMoney(row.payment_variance_cents)}</td>
                    <td>{row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
