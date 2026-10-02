import { useCallback, useEffect, useState } from "react";
import * as nfos from "../lib/nfosApi";

const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

export default function NfosMarketOrderApprovals({ notify, onChanged }) {
  const [data, setData] = useState({ pending: [], history: [] });
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await nfos.adminGetMarketOrderApprovals() || { pending: [], history: [] });
    } catch (err) {
      setError(err?.message || "Could not load Market Order approvals.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (order, action) => {
    setBusy(true);
    setError("");
    try {
      await nfos.adminReviewMarketOrder(order.id, action, notes[order.id] || null);
      notify?.("success", action === "approve" ? `${order.order_no} approved and inventory posted.` : `${order.order_no} returned for changes.`);
      await load();
      await onChanged?.();
    } catch (err) {
      const msg = err?.message || "Could not review Market Order.";
      setError(msg);
      notify?.("error", msg);
    } finally {
      setBusy(false);
    }
  };

  return <div className="nfos-card nfos-market-approval-card">
    <div className="nfos-page-head" style={{ marginBottom: 12 }}>
      <div><h2>Market Orders Awaiting Approval</h2><p>Nothing affects inventory until you approve it here.</p></div>
      <div className="nfos-inline-actions"><span className="nfos-pill">{data.pending?.length || 0} pending</span><button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button></div>
    </div>
    {error && <div className="nfos-error">{error}</div>}
    {!data.pending?.length ? <div className="nfos-empty">No submitted Market Management orders are waiting for review.</div> :
      <div className="nfos-market-approval-list">{data.pending.map((order) => {
        const total = (order.items || []).reduce((sum, line) => sum + Number(line.line_total_cents || 0), 0);
        return <div className="nfos-market-approval-order" key={order.id}>
          <div className="nfos-split-head">
            <div><strong>{order.order_no}</strong><div className="nfos-muted nfos-small">{order.logged_by} · {order.venue_name} · {order.market_day || order.business_day}</div></div>
            <strong>{money(total)}</strong>
          </div>
          <div className="nfos-market-log-lines">{(order.items || []).map((line) => <span key={line.id}>{line.quantity} × {line.name} {line.size_label} · {money(line.line_total_cents)}</span>)}</div>
          {order.notes && <div className="nfos-note">{order.notes}</div>}
          <div className="nfos-form" style={{ marginTop: 10 }}>
            <div className="nfos-field full"><label>Admin note (optional)</label><input value={notes[order.id] || ""} onChange={(e) => setNotes({ ...notes, [order.id]: e.target.value })} /></div>
          </div>
          <div className="nfos-inline-actions">
            <button className="nfos-btn" disabled={busy} onClick={() => review(order, "approve")}>Approve · Post Sale</button>
            <button className="nfos-btn ghost" disabled={busy} onClick={() => review(order, "return")}>Return for changes</button>
          </div>
        </div>;
      })}</div>}
  </div>;
}
