import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosCameraScanner from "./NfosCameraScanner";

const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
const qty = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function NfosMarketOrderLogger({ notify }) {
  const [workspace, setWorkspace] = useState({ sessions: [], session_inventory: [], logs: [] });
  const [sessionId, setSessionId] = useState("");
  const [cart, setCart] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [barcode, setBarcode] = useState("");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const flash = (type, text) => {
    if (type === "error") { setError(text); setMessage(""); }
    else { setMessage(text); setError(""); }
    notify?.(type, text);
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const data = await nfos.getMarketOrderWorkspace();
      setWorkspace(data || { sessions: [], session_inventory: [], logs: [] });
      setSessionId((current) => current && data?.sessions?.some((s) => s.id === current) ? current : data?.sessions?.[0]?.id || "");
    } catch (err) {
      flash("error", err?.message || "Could not load Market Management orders.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableMap = useMemo(() => Object.fromEntries(
    (workspace.session_inventory || []).filter((r) => r.session_id === sessionId).map((r) => [r.item_id, Number(r.on_hand || 0)])
  ), [workspace.session_inventory, sessionId]);

  const total = cart.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cents || 0), 0);

  const addBarcode = async (raw) => {
    const value = String(raw || "").trim();
    if (!value) return;
    if (!sessionId) { flash("error", "Choose an assigned market session first."); return; }
    setBusy(true);
    try {
      const item = await nfos.marketLookupSellableBarcode(value);
      if (!item?.item_id) throw new Error("Barcode is not an active sellable NectarFusions item.");
      const available = availableMap[item.item_id] ?? 0;
      const existing = cart.find((line) => line.item_id === item.item_id);
      const nextQty = Number(existing?.quantity || 0) + 1;
      if (nextQty > available) throw new Error(`${item.name} only has ${available} available at this market.`);
      if (existing) {
        setCart(cart.map((line) => line.item_id === item.item_id ? { ...line, quantity: nextQty } : line));
      } else {
        setCart([...cart, { ...item, quantity: 1 }]);
      }
      setBarcode("");
      flash("success", `${item.name} added.`);
    } catch (err) {
      flash("error", err?.message || "Could not add scanned item.");
    } finally {
      setBusy(false);
      setCamera(false);
    }
  };

  const updateQty = (itemId, value) => {
    const amount = Math.max(1, Math.floor(Number(value || 1)));
    const max = availableMap[itemId] ?? 0;
    if (amount > max) { flash("error", `Only ${max} available at this market.`); return; }
    setCart(cart.map((line) => line.item_id === itemId ? { ...line, quantity: amount } : line));
  };

  const clearDraft = () => { setCart([]); setEditingOrderId(""); setNotes(""); setBarcode(""); };

  const logOrder = async () => {
    if (!sessionId || !cart.length) { flash("error", "Choose a market and scan at least one item."); return; }
    setBusy(true);
    try {
      const lines = cart.map((line) => ({ item_id: line.item_id, quantity: Number(line.quantity) }));
      const result = editingOrderId
        ? await nfos.marketUpdateLoggedOrder(editingOrderId, lines, notes)
        : await nfos.marketLogOrder(sessionId, lines, notes);
      flash("success", editingOrderId ? `${result.order_no || "Order"} updated.` : `${result.order_no} logged for today.`);
      clearDraft();
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not log order.");
    } finally {
      setBusy(false);
    }
  };

  const editLog = (order) => {
    setSessionId(order.market_session_id);
    setEditingOrderId(order.id);
    setNotes(order.notes || "");
    setCart((order.items || []).map((line) => ({ ...line, quantity: Number(line.quantity) })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const done = async (order) => {
    setBusy(true);
    try {
      await nfos.marketSubmitLoggedOrder(order.id);
      flash("success", `${order.order_no} sent to admin for approval.`);
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not submit order.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    {error && <div className="nfos-error">{error}</div>}
    {message && <div className="nfos-success">{message}</div>}

    <div className="nfos-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div><h2>{editingOrderId ? "Edit scanned order" : "Scan order"}</h2><p>Build the order first. Inventory does not change until an admin approves the submitted log.</p></div>
        {editingOrderId && <button className="nfos-btn ghost" onClick={clearDraft}>Cancel edit</button>}
      </div>

      {!workspace.sessions?.length ? <div className="nfos-note">No loaded/open market session is assigned to your NFOS account right now. An admin must create, load and assign a market session before orders can be scanned.</div> : <>
        <div className="nfos-form">
          <div className="nfos-field full"><label>Assigned market</label><select value={sessionId} onChange={(e) => { setSessionId(e.target.value); clearDraft(); }}>
            {workspace.sessions.map((s) => <option key={s.id} value={s.id}>{s.market_day} · {s.venue_name} · {s.status}</option>)}
          </select></div>
        </div>

        <div className="nfos-scan-order-tools">
          <button className="nfos-btn" type="button" onClick={() => setCamera(true)}>Scan item with camera</button>
          <div className="nfos-scan-order-manual">
            <input placeholder="Or type / scan barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBarcode(barcode); } }} />
            <button className="nfos-btn ghost" type="button" onClick={() => addBarcode(barcode)}>Add</button>
          </div>
        </div>

        {camera && <NfosCameraScanner onDetected={addBarcode} onClose={() => setCamera(false)} />}

        <div className="nfos-market-cart">
          {!cart.length ? <div className="nfos-empty">Scan the first item to begin this order.</div> : <div className="nfos-table-wrap"><table className="nfos-table">
            <thead><tr><th>Item</th><th>Available</th><th>Qty</th><th>Price</th><th>Line total</th><th></th></tr></thead>
            <tbody>{cart.map((line) => <tr key={line.item_id}>
              <td><strong>{line.name}</strong><div className="nfos-muted nfos-small">{line.size_label} · {line.texture || "regular"} · {line.sku}</div></td>
              <td>{qty(availableMap[line.item_id] || 0)}</td>
              <td><input className="nfos-inline-number" type="number" min="1" max={availableMap[line.item_id] || 0} step="1" value={line.quantity} onChange={(e) => updateQty(line.item_id, e.target.value)} /></td>
              <td>{money(line.unit_cents)}</td>
              <td><strong>{money(Number(line.unit_cents || 0) * Number(line.quantity || 0))}</strong></td>
              <td><button className="nfos-btn danger" type="button" onClick={() => setCart(cart.filter((x) => x.item_id !== line.item_id))}>Delete</button></td>
            </tr>)}</tbody>
          </table></div>}
        </div>

        <div className="nfos-form" style={{ marginTop: 12 }}>
          <div className="nfos-field full"><label>Order notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <div className="nfos-split-head">
          <div><span className="nfos-muted">Estimated order total</span><div className="nfos-stat-value">{money(total)}</div></div>
          <button className="nfos-btn" disabled={busy || !cart.length} onClick={logOrder}>{editingOrderId ? "Save changes" : "Log Order"}</button>
        </div>
      </>}
    </div>

    <div className="nfos-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div><h2>Today's Logs</h2><p>Edit logged orders, then click Done when they are ready for admin approval.</p></div>
        <button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button>
      </div>
      {!workspace.logs?.length ? <div className="nfos-empty">No orders logged today.</div> : <div className="nfos-market-log-list">
        {workspace.logs.map((order) => <div className="nfos-market-log-card" key={order.id}>
          <div className="nfos-split-head">
            <div><strong>{order.order_no}</strong><div className="nfos-muted nfos-small">{order.venue_name} · {order.market_day}</div></div>
            <span className={`nfos-pill ${order.status === "approved" ? "ok" : order.status === "returned" ? "low" : ""}`}>{order.status}</span>
          </div>
          <div className="nfos-market-log-lines">{(order.items || []).map((line) => <span key={line.id}>{line.quantity} × {line.name} {line.size_label}</span>)}</div>
          {order.admin_notes && <div className="nfos-note"><strong>Admin note:</strong> {order.admin_notes}</div>}
          <div className="nfos-inline-actions" style={{ marginTop: 10 }}>
            {["logged", "returned"].includes(order.status) && <button className="nfos-btn ghost" onClick={() => editLog(order)}>Edit</button>}
            {["logged", "returned"].includes(order.status) && <button className="nfos-btn" onClick={() => done(order)}>Done · Send for approval</button>}
          </div>
        </div>)}
      </div>}
    </div>
  </>;
}
