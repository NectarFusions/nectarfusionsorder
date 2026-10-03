import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosCameraScanner from "./NfosCameraScanner";

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

const qty = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function NfosMarketOrderLogger({ notify }) {
  const [workspace, setWorkspace] = useState({ sessions: [], session_inventory: [], logs: [] });
  const [sessionId, setSessionId] = useState("");
  const [cart, setCart] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [camera, setCamera] = useState(false);
  const [scannedItem, setScannedItem] = useState(null);
  const [scanQty, setScanQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const flash = (type, text) => {
    if (type === "error") {
      setError(text);
      setMessage("");
    } else {
      setMessage(text);
      setError("");
    }
    notify?.(type, text);
  };

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await nfos.getMarketOrderWorkspace();
      setWorkspace(data || { sessions: [], session_inventory: [], logs: [] });
      setSessionId((current) =>
        current && data?.sessions?.some((s) => s.id === current)
          ? current
          : data?.sessions?.[0]?.id || ""
      );
    } catch (err) {
      flash("error", err?.message || "Could not load Market Management.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedSession = workspace.sessions?.find((s) => s.id === sessionId) || null;

  const availableMap = useMemo(
    () =>
      Object.fromEntries(
        (workspace.session_inventory || [])
          .filter((r) => r.session_id === sessionId)
          .map((r) => [r.item_id, Number(r.on_hand || 0)])
      ),
    [workspace.session_inventory, sessionId]
  );

  const total = cart.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cents || 0),
    0
  );
  const totalUnits = cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  const lookupBarcode = async (raw) => {
    const value = String(raw || "").trim();
    if (!value) return;

    if (!sessionId) {
      flash("error", "No market is assigned to this account yet.");
      return;
    }

    setCamera(false);
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const item = await nfos.marketLookupSellableBarcode(value);
      if (!item?.item_id) {
        throw new Error("This barcode is not an active sellable NectarFusions honey.");
      }

      const available = availableMap[item.item_id] ?? 0;
      const existing = cart.find((line) => line.item_id === item.item_id);
      const alreadyInSale = Number(existing?.quantity || 0);

      if (available <= alreadyInSale) {
        throw new Error(`${item.name} has no additional units available at this market.`);
      }

      setScannedItem({
        ...item,
        scanned_barcode: value,
        available,
        alreadyInSale,
      });
      setScanQty(1);
      setManualBarcode("");
    } catch (err) {
      flash("error", err?.message || "Could not identify the scanned honey.");
    } finally {
      setBusy(false);
    }
  };

  const setPopupQty = (value) => {
    if (!scannedItem) return;
    const maxAdd = Math.max(1, Number(scannedItem.available) - Number(scannedItem.alreadyInSale || 0));
    const next = Math.max(1, Math.floor(Number(value || 1)));
    setScanQty(Math.min(maxAdd, next));
  };

  const adjustPopupQty = (delta) => setPopupQty(Number(scanQty || 1) + delta);

  const addScannedItem = (scanAgain = false) => {
    if (!scannedItem) return;

    const addQty = Math.max(1, Math.floor(Number(scanQty || 1)));
    const existing = cart.find((line) => line.item_id === scannedItem.item_id);
    const nextQty = Number(existing?.quantity || 0) + addQty;

    if (nextQty > Number(scannedItem.available || 0)) {
      flash("error", `Only ${scannedItem.available} ${scannedItem.name} are available at this market.`);
      return;
    }

    if (existing) {
      setCart((current) =>
        current.map((line) =>
          line.item_id === scannedItem.item_id ? { ...line, quantity: nextQty } : line
        )
      );
    } else {
      setCart((current) => [...current, { ...scannedItem, quantity: addQty }]);
    }

    const name = scannedItem.name;
    setScannedItem(null);
    setScanQty(1);
    flash("success", `${addQty} × ${name} added to the current sale.`);

    if (scanAgain) window.setTimeout(() => setCamera(true), 120);
  };

  const updateCartQty = (itemId, value) => {
    const amount = Math.max(1, Math.floor(Number(value || 1)));
    const max = availableMap[itemId] ?? 0;

    if (amount > max) {
      flash("error", `Only ${max} available at this market.`);
      return;
    }

    setCart((current) =>
      current.map((line) => line.item_id === itemId ? { ...line, quantity: amount } : line)
    );
  };

  const clearDraft = () => {
    setCart([]);
    setEditingOrderId("");
    setNotes("");
    setManualBarcode("");
    setScannedItem(null);
    setScanQty(1);
  };

  const logOrder = async () => {
    if (!sessionId || !cart.length) {
      flash("error", "Scan at least one honey before logging the order.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const lines = cart.map((line) => ({
        item_id: line.item_id,
        quantity: Number(line.quantity),
      }));

      const result = editingOrderId
        ? await nfos.marketUpdateLoggedOrder(editingOrderId, lines, notes)
        : await nfos.marketLogOrder(sessionId, lines, notes);

      flash(
        "success",
        editingOrderId
          ? `${result.order_no || "Order"} updated.`
          : `${result.order_no} added to Today's Logs.`
      );

      clearDraft();
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not log this order.");
    } finally {
      setBusy(false);
    }
  };

  const editLog = (order) => {
    setSessionId(order.market_session_id);
    setEditingOrderId(order.id);
    setNotes(order.notes || "");
    setCart((order.items || []).map((line) => ({ ...line, quantity: Number(line.quantity) })));
    setScannedItem(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const done = async (order) => {
    setBusy(true);
    setError("");

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

  return (
    <>
      {error && <div className="nfos-error">{error}</div>}
      {message && <div className="nfos-success">{message}</div>}

      <div className="nfos-card nfos-market-phone-workspace">
        <div className="nfos-page-head nfos-market-mobile-head">
          <div>
            <h2>{editingOrderId ? "Edit Current Sale" : "Market Scanner"}</h2>
            <p>Scan the honey, enter how many sold, then scan the next flavor.</p>
          </div>
          {editingOrderId && (
            <button className="nfos-btn ghost" type="button" onClick={clearDraft}>Cancel edit</button>
          )}
        </div>

        {!workspace.sessions?.length ? (
          <div className="nfos-note">
            <strong>No market is assigned yet.</strong><br />
            An admin needs to create, load, and assign today's market to this Market Management account.
          </div>
        ) : (
          <>
            {workspace.sessions.length > 1 ? (
              <div className="nfos-field nfos-market-session-select">
                <label>Today's market</label>
                <select
                  value={sessionId}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    clearDraft();
                  }}
                >
                  {workspace.sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.venue_name} · {s.market_day}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="nfos-market-active-session">
                <span className="nfos-muted nfos-small">Today's market</span>
                <strong>{selectedSession?.venue_name}</strong>
                <span>{selectedSession?.market_day}</span>
              </div>
            )}

            <button
              className="nfos-market-scan-primary"
              type="button"
              onClick={() => setCamera(true)}
              disabled={busy}
            >
              <span className="nfos-market-scan-icon" aria-hidden="true">▣</span>
              <span>
                <strong>Scan Honey</strong>
                <small>Use phone camera</small>
              </span>
            </button>

            <details className="nfos-market-manual-fallback">
              <summary>Barcode won't scan?</summary>
              <div className="nfos-scan-order-manual">
                <input
                  placeholder="Type barcode number"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupBarcode(manualBarcode);
                    }
                  }}
                />
                <button className="nfos-btn ghost" type="button" onClick={() => lookupBarcode(manualBarcode)}>
                  Find Honey
                </button>
              </div>
            </details>

            <div className="nfos-market-current-sale">
              <div className="nfos-split-head">
                <div>
                  <h3>Current Sale</h3>
                  <span className="nfos-muted nfos-small">
                    {totalUnits} jar{totalUnits === 1 ? "" : "s"} · {cart.length} product{cart.length === 1 ? "" : "s"}
                  </span>
                </div>
                <strong className="nfos-market-sale-total">{money(total)}</strong>
              </div>

              {!cart.length ? (
                <div className="nfos-market-empty-sale">Scan a honey jar to start.</div>
              ) : (
                <div className="nfos-market-sale-lines">
                  {cart.map((line) => (
                    <div className="nfos-market-sale-line" key={line.item_id}>
                      <div className="nfos-market-sale-line-main">
                        <strong>{line.name}</strong>
                        <span>{line.size_label} · {line.texture || "regular"}</span>
                        <span>{money(line.unit_cents)} each</span>
                      </div>

                      <div className="nfos-market-sale-line-qty">
                        <label>Sold</label>
                        <div className="nfos-market-qty-control compact">
                          <button type="button" onClick={() => updateCartQty(line.item_id, Number(line.quantity) - 1)}>−</button>
                          <input
                            type="number"
                            min="1"
                            max={availableMap[line.item_id] || 0}
                            step="1"
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => updateCartQty(line.item_id, e.target.value)}
                          />
                          <button type="button" onClick={() => updateCartQty(line.item_id, Number(line.quantity) + 1)}>+</button>
                        </div>
                      </div>

                      <div className="nfos-market-sale-line-total">
                        <strong>{money(Number(line.unit_cents || 0) * Number(line.quantity || 0))}</strong>
                        <button
                          className="nfos-link-danger"
                          type="button"
                          onClick={() => setCart((current) => current.filter((x) => x.item_id !== line.item_id))}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <button
                  className="nfos-btn secondary nfos-market-scan-another"
                  type="button"
                  onClick={() => setCamera(true)}
                >
                  + Scan Another Honey
                </button>
              )}
            </div>

            {cart.length > 0 && (
              <>
                <details className="nfos-market-order-notes">
                  <summary>Add order note</summary>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional note for this sale"
                  />
                </details>

                <button className="nfos-market-log-order" disabled={busy} type="button" onClick={logOrder}>
                  {editingOrderId ? "Save Changes" : "Log Order"}
                  <span>{totalUnits} jar{totalUnits === 1 ? "" : "s"} · {money(total)}</span>
                </button>
              </>
            )}
          </>
        )}
      </div>

      {camera && (
        <div className="nfos-market-scan-overlay">
          <div className="nfos-market-scan-overlay-inner">
            <NfosCameraScanner onDetected={lookupBarcode} onClose={() => setCamera(false)} />
          </div>
        </div>
      )}

      {scannedItem && (
        <div className="nfos-market-item-overlay" role="dialog" aria-modal="true" aria-label="Scanned honey">
          <div className="nfos-market-item-popup">
            <div className="nfos-market-item-popup-head">
              <div>
                <span className="nfos-market-scanned-label">SCANNED HONEY</span>
                <h2>{scannedItem.name}</h2>
                <p>{scannedItem.size_label} · {scannedItem.texture || "regular"}</p>
              </div>
              <button
                className="nfos-market-popup-close"
                type="button"
                aria-label="Close"
                onClick={() => setScannedItem(null)}
              >
                ×
              </button>
            </div>

            <div className="nfos-market-item-facts">
              <div><span>Price</span><strong>{money(scannedItem.unit_cents)}</strong></div>
              <div><span>Available here</span><strong>{qty(scannedItem.available)}</strong></div>
              <div><span>Already in sale</span><strong>{qty(scannedItem.alreadyInSale)}</strong></div>
            </div>

            <div className="nfos-market-quantity-sold">
              <label>How many sold?</label>
              <div className="nfos-market-qty-control">
                <button type="button" onClick={() => adjustPopupQty(-1)}>−</button>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, Number(scannedItem.available) - Number(scannedItem.alreadyInSale || 0))}
                  inputMode="numeric"
                  step="1"
                  value={scanQty}
                  onChange={(e) => setPopupQty(e.target.value)}
                  autoFocus
                />
                <button type="button" onClick={() => adjustPopupQty(1)}>+</button>
              </div>
              <div className="nfos-market-popup-line-total">
                {scanQty} × {money(scannedItem.unit_cents)} ={" "}
                <strong>{money(Number(scanQty) * Number(scannedItem.unit_cents || 0))}</strong>
              </div>
            </div>

            <div className="nfos-market-popup-actions">
              <button className="nfos-btn ghost" type="button" onClick={() => setScannedItem(null)}>Cancel</button>
              <button className="nfos-btn secondary" type="button" onClick={() => addScannedItem(false)}>Add to Sale</button>
              <button className="nfos-btn" type="button" onClick={() => addScannedItem(true)}>Add & Scan Next</button>
            </div>
          </div>
        </div>
      )}

      <div className="nfos-card nfos-market-todays-logs">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Today's Logs</h2>
            <p>Review each logged sale. Click Done when it is ready for admin approval.</p>
          </div>
          <button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button>
        </div>

        {!workspace.logs?.length ? (
          <div className="nfos-empty">No orders logged today.</div>
        ) : (
          <div className="nfos-market-log-list">
            {workspace.logs.map((order) => (
              <div className="nfos-market-log-card" key={order.id}>
                <div className="nfos-split-head">
                  <div>
                    <strong>{order.order_no}</strong>
                    <div className="nfos-muted nfos-small">{order.venue_name} · {order.market_day}</div>
                  </div>
                  <span className={`nfos-pill ${order.status === "approved" ? "ok" : order.status === "returned" ? "low" : ""}`}>
                    {order.status}
                  </span>
                </div>

                <div className="nfos-market-log-lines">
                  {(order.items || []).map((line) => (
                    <span key={line.id}>{line.quantity} × {line.name} {line.size_label}</span>
                  ))}
                </div>

                {order.admin_notes && (
                  <div className="nfos-note"><strong>Admin note:</strong> {order.admin_notes}</div>
                )}

                <div className="nfos-inline-actions" style={{ marginTop: 10 }}>
                  {["logged", "returned"].includes(order.status) && (
                    <button className="nfos-btn ghost" onClick={() => editLog(order)}>Edit</button>
                  )}
                  {["logged", "returned"].includes(order.status) && (
                    <button className="nfos-btn" onClick={() => done(order)}>Done · Send for approval</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
