import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosCameraScanner from "./NfosCameraScanner";

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

const whole = (value) => Math.max(0, Math.floor(Number(value || 0)));
const dollarsToCents = (value) => Math.round(Math.max(0, Number(value || 0)) * 100);

const reasonLabels = {
  sample_promo: "Sample / promotional use",
  damaged: "Damaged / broken",
  gift_comp: "Gift / comp",
  transferred: "Transferred elsewhere",
  count_correction: "Counting correction",
  other: "Other",
};

function calculateBundleTotal(cart, bundle) {
  const base = cart.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cents || 0),
    0
  );

  const bundleCount = Number(bundle?.count || 0);
  const bundlePrice = Number(bundle?.price_cents || 0);
  const sizeId = String(bundle?.size_id || "");
  if (!bundleCount || !bundlePrice || !sizeId) return { total: base, bundleGroups: 0 };

  const matching = cart.filter((line) => String(line.size_id || "") === sizeId);
  const units = matching.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const groups = Math.floor(units / bundleCount);
  if (!groups) return { total: base, bundleGroups: 0 };

  const standardUnit = Number(matching.find((line) => Number(line.unit_cents || 0) > 0)?.unit_cents || 0);
  if (!standardUnit) return { total: base, bundleGroups: 0 };

  const normalBundleValue = groups * bundleCount * standardUnit;
  const discountedBundleValue = groups * bundlePrice;
  return {
    total: Math.max(0, base - normalBundleValue + discountedBundleValue),
    bundleGroups: groups,
  };
}

export default function NfosMarketOrderLogger({ notify }) {
  const [workspace, setWorkspace] = useState({
    sessions: [],
    available_markets: [],
    opening_inventory: [],
    logs: [],
    closeouts: [],
    reconciliations: [],
    bundle: {},
  });
  const [sessionId, setSessionId] = useState("");
  const [squareLocations, setSquareLocations] = useState([]);
  const [startForm, setStartForm] = useState({ marketDateId: "", customVenue: "", squareLocationId: "" });

  const [openingCart, setOpeningCart] = useState([]);
  const [editingOpening, setEditingOpening] = useState(false);

  const [cart, setCart] = useState([]);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [notes, setNotes] = useState("");
  const [saleTotalInput, setSaleTotalInput] = useState("");
  const [saleTotalTouched, setSaleTotalTouched] = useState(false);

  const [manualBarcode, setManualBarcode] = useState("");
  const [cameraMode, setCameraMode] = useState("");
  const [scannedItem, setScannedItem] = useState(null);
  const [scanQty, setScanQty] = useState(1);

  const [closeoutOpen, setCloseoutOpen] = useState(false);
  const [returnCounts, setReturnCounts] = useState({});
  const [reportedCash, setReportedCash] = useState("");
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [adjustments, setAdjustments] = useState([]);
  const [adjustDraft, setAdjustDraft] = useState({ itemId: "", quantity: "", reason: "sample_promo", notes: "" });
  const [squareStatus, setSquareStatus] = useState(null);

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
      const next = data || {};
      setWorkspace({
        sessions: next.sessions || [],
        available_markets: next.available_markets || [],
        opening_inventory: next.opening_inventory || [],
        logs: next.logs || [],
        closeouts: next.closeouts || [],
        reconciliations: next.reconciliations || [],
        bundle: next.bundle || {},
        business_day: next.business_day,
      });
      setSessionId((current) => {
        if (current && next.sessions?.some((session) => session.id === current)) return current;
        return next.sessions?.find((session) => session.closeout_status !== "approved")?.id || next.sessions?.[0]?.id || "";
      });
    } catch (err) {
      flash("error", err?.message || "Could not load Market Management.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSquareLocations = useCallback(async () => {
    try {
      const result = await nfos.squareMarketRequest("locations");
      setSquareLocations(result.locations || []);
    } catch {
      // Inventory-only markets do not depend on Square availability.
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSquareLocations(); }, [loadSquareLocations]);

  const selectedSession = workspace.sessions.find((session) => session.id === sessionId) || null;
  const openingRows = workspace.opening_inventory.filter((row) => row.session_id === sessionId);
  const sessionLogs = workspace.logs.filter((order) => order.market_session_id === sessionId && order.status !== "cancelled");
  const closeout = workspace.closeouts.find((row) => row.session_id === sessionId) || null;
  const reconciliation = workspace.reconciliations.find((row) => row.session_id === sessionId) || null;

  const soldByItem = useMemo(() => {
    const map = {};
    for (const order of sessionLogs) {
      for (const line of order.items || []) {
        map[line.item_id] = Number(map[line.item_id] || 0) + Number(line.quantity || 0);
      }
    }
    return map;
  }, [sessionLogs]);

  const loggedGross = sessionLogs.reduce((sum, order) => sum + Number(order.sale_total_cents || 0), 0);
  const loggedUnits = sessionLogs.reduce(
    (sum, order) => sum + (order.items || []).reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0),
    0
  );

  const bundleCalc = useMemo(() => calculateBundleTotal(cart, workspace.bundle), [cart, workspace.bundle]);

  useEffect(() => {
    if (!saleTotalTouched) setSaleTotalInput((bundleCalc.total / 100).toFixed(2));
  }, [bundleCalc.total, saleTotalTouched]);

  const expectedRemainingByItem = useMemo(() => {
    const map = {};
    for (const row of openingRows) map[row.item_id] = Number(row.quantity || 0) - Number(soldByItem[row.item_id] || 0);
    return map;
  }, [openingRows, soldByItem]);

  const startMarket = async (event) => {
    event.preventDefault();
    const marketDateId = startForm.marketDateId && startForm.marketDateId !== "custom" ? startForm.marketDateId : null;
    const venueName = startForm.marketDateId === "custom" || !marketDateId ? startForm.customVenue.trim() : null;
    if (!marketDateId && !venueName) {
      flash("error", "Choose today's market or enter the market/event name.");
      return;
    }

    setBusy(true);
    try {
      const result = await nfos.marketStartSession({
        marketDateId,
        venueName,
        squareLocationId: startForm.squareLocationId || null,
      });
      setSessionId(result.id);
      flash("success", result.existing ? "Today's market is already open." : "Market started. Now record what honey you took with you.");
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not start the market.");
    } finally {
      setBusy(false);
    }
  };

  const lookupBarcode = async (raw, mode = cameraMode || "sale") => {
    const value = String(raw || "").trim();
    if (!value) return;
    if (!selectedSession) {
      flash("error", "Start a market first.");
      return;
    }

    setCameraMode("");
    setBusy(true);
    setError("");
    try {
      const item = await nfos.marketLookupSellableBarcode(value);
      if (!item?.item_id) throw new Error("This barcode is not an active sellable NectarFusions honey.");

      const openingQty = Number(openingRows.find((row) => row.item_id === item.item_id)?.quantity || 0);
      const alreadySold = Number(soldByItem[item.item_id] || 0);
      setScannedItem({
        ...item,
        scanned_barcode: value,
        mode,
        openingQty,
        alreadySold,
        expectedRemaining: openingQty - alreadySold,
      });

      if (mode === "opening") {
        setScanQty(Number(openingCart.find((row) => row.item_id === item.item_id)?.quantity || 1));
      } else if (mode === "return") {
        const existing = returnCounts[item.item_id];
        setScanQty(existing === "" || existing == null ? Math.max(0, openingQty - alreadySold) : Number(existing));
      } else {
        setScanQty(1);
      }
      setManualBarcode("");
    } catch (err) {
      flash("error", err?.message || "Could not identify the scanned honey.");
    } finally {
      setBusy(false);
    }
  };

  const addScannedItem = (scanAgain = false) => {
    if (!scannedItem) return;
    const amount = whole(scanQty);

    if (scannedItem.mode !== "return" && amount < 1) {
      flash("error", "Enter at least 1 jar.");
      return;
    }

    if (scannedItem.mode === "opening") {
      setOpeningCart((current) => {
        const exists = current.some((row) => row.item_id === scannedItem.item_id);
        if (exists) return current.map((row) => row.item_id === scannedItem.item_id ? { ...row, ...scannedItem, quantity: amount } : row);
        return [...current, { ...scannedItem, quantity: amount }];
      });
    } else if (scannedItem.mode === "return") {
      setReturnCounts((current) => ({ ...current, [scannedItem.item_id]: amount }));
    } else {
      setCart((current) => {
        const exists = current.find((row) => row.item_id === scannedItem.item_id);
        if (exists) {
          return current.map((row) => row.item_id === scannedItem.item_id ? { ...row, quantity: Number(row.quantity || 0) + amount } : row);
        }
        return [...current, { ...scannedItem, quantity: amount }];
      });
      setSaleTotalTouched(false);
    }

    const mode = scannedItem.mode;
    const name = scannedItem.name;
    setScannedItem(null);
    setScanQty(1);
    flash("success", mode === "return" ? `${name} return count saved.` : `${amount} × ${name} added.`);
    if (scanAgain) window.setTimeout(() => setCameraMode(mode), 120);
  };

  const confirmOpening = async () => {
    if (!openingCart.length) {
      flash("error", "Scan the honey you are taking to the market first.");
      return;
    }
    setBusy(true);
    try {
      await nfos.marketSetOpeningInventory(
        selectedSession.id,
        openingCart.map((line) => ({ item_id: line.item_id, quantity: whole(line.quantity) }))
      );
      setOpeningCart([]);
      setEditingOpening(false);
      flash("success", "Opening market inventory confirmed. You can start scanning customer sales.");
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not confirm opening inventory.");
    } finally {
      setBusy(false);
    }
  };

  const beginEditOpening = () => {
    setOpeningCart(openingRows.map((row) => ({ ...row, quantity: Number(row.quantity || 0) })));
    setEditingOpening(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearSale = () => {
    setCart([]);
    setEditingOrderId("");
    setNotes("");
    setSaleTotalTouched(false);
    setSaleTotalInput("");
    setScannedItem(null);
  };

  const logSale = async () => {
    if (!cart.length) {
      flash("error", "Scan at least one honey before logging the sale.");
      return;
    }

    const saleTotalCents = dollarsToCents(saleTotalInput);
    setBusy(true);
    try {
      const lines = cart.map((line) => ({ item_id: line.item_id, quantity: whole(line.quantity) }));
      const result = editingOrderId
        ? await nfos.marketUpdateLoggedSale(editingOrderId, lines, notes, saleTotalCents)
        : await nfos.marketLogSale(selectedSession.id, lines, notes, saleTotalCents);

      flash("success", editingOrderId ? `${result.order_no || "Sale"} updated.` : `${result.order_no} logged.`);
      clearSale();
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not log this sale.");
    } finally {
      setBusy(false);
    }
  };

  const editLog = (order) => {
    setEditingOrderId(order.id);
    setNotes(order.notes || "");
    setCart((order.items || []).map((line) => ({ ...line, quantity: Number(line.quantity || 0) })));
    setSaleTotalInput((Number(order.sale_total_cents || 0) / 100).toFixed(2));
    setSaleTotalTouched(true);
    setCloseoutOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const syncSquare = async () => {
    if (!selectedSession?.square_location_id) {
      flash("error", "This market is running in Inventory Only mode. Square reconciliation is not enabled.");
      return null;
    }

    setBusy(true);
    try {
      const result = await nfos.squareMarketRequest("sync", { sessionId: selectedSession.id });
      setSquareStatus(result);
      flash("success", `Square synced: ${money(result.square_noncash_cents)} non-cash across ${result.orders || 0} completed order${result.orders === 1 ? "" : "s"}.`);
      await load();
      return result;
    } catch (err) {
      flash("error", err?.message || "Could not sync Square.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const beginCloseout = async () => {
    const seed = {};
    for (const row of openingRows) seed[row.item_id] = returnCounts[row.item_id] ?? "";
    for (const order of sessionLogs) {
      for (const line of order.items || []) {
        if (!(line.item_id in seed)) seed[line.item_id] = returnCounts[line.item_id] ?? "";
      }
    }
    setReturnCounts(seed);
    setReportedCash("");
    setCloseoutOpen(true);
    setSquareStatus(null);
    window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 50);
    if (selectedSession?.square_location_id) await syncSquare();
  };

  const addAdjustment = () => {
    const amount = whole(adjustDraft.quantity);
    if (!adjustDraft.itemId || amount < 1) {
      flash("error", "Choose the honey and enter the number of jars used outside a sale.");
      return;
    }
    setAdjustments((current) => [
      ...current,
      {
        key: `${Date.now()}-${current.length}`,
        item_id: adjustDraft.itemId,
        quantity: amount,
        reason: adjustDraft.reason,
        notes: adjustDraft.notes.trim() || null,
      },
    ]);
    setAdjustDraft({ itemId: "", quantity: "", reason: "sample_promo", notes: "" });
  };

  const closeoutItems = useMemo(() => {
    const map = new Map();
    const addMeta = (item) => {
      if (!item?.item_id) return;
      if (!map.has(item.item_id)) {
        map.set(item.item_id, {
          item_id: item.item_id,
          name: item.name || item.flavor_name || "Honey",
          size_label: item.size_label || "",
          opening: 0,
          sold: 0,
          adjustments: 0,
        });
      }
    };

    for (const row of openingRows) {
      addMeta(row);
      map.get(row.item_id).opening = Number(row.quantity || 0);
    }
    for (const order of sessionLogs) {
      for (const line of order.items || []) {
        addMeta(line);
        map.get(line.item_id).sold += Number(line.quantity || 0);
      }
    }
    for (const adj of adjustments) {
      const source = openingRows.find((row) => row.item_id === adj.item_id)
        || sessionLogs.flatMap((order) => order.items || []).find((line) => line.item_id === adj.item_id)
        || { item_id: adj.item_id, name: "Honey" };
      addMeta(source);
      map.get(adj.item_id).adjustments += Number(adj.quantity || 0);
    }

    return [...map.values()].map((row) => {
      const expected = row.opening - row.sold - row.adjustments;
      const rawReturn = returnCounts[row.item_id];
      const returned = rawReturn === "" || rawReturn == null ? null : whole(rawReturn);
      return {
        ...row,
        expected,
        returned,
        variance: returned == null ? null : expected - returned,
      };
    }).sort((a, b) => `${a.name} ${a.size_label}`.localeCompare(`${b.name} ${b.size_label}`));
  }, [openingRows, sessionLogs, adjustments, returnCounts]);

  const missingReturnCounts = closeoutItems.some((row) => row.returned == null);
  const inventoryVarianceUnits = closeoutItems.reduce((sum, row) => sum + (row.variance == null ? 0 : Math.abs(row.variance)), 0);
  const activeReconciliation = squareStatus
    ? {
        square_noncash_cents: squareStatus.square_noncash_cents,
        square_cash_cents: squareStatus.square_cash_cents,
        square_order_total_cents: squareStatus.square_order_total_cents,
        square_transaction_count: squareStatus.orders,
        synced_at: new Date().toISOString(),
      }
    : reconciliation;
  const inventoryOnly = !selectedSession?.square_location_id;
  const reportedCashCents = inventoryOnly ? 0 : (reportedCash === "" ? null : dollarsToCents(reportedCash));
  const squareNoncashCents = Number(activeReconciliation?.square_noncash_cents || 0);
  const accountedPayments = inventoryOnly || reportedCashCents == null ? null : squareNoncashCents + reportedCashCents;
  const paymentVariance = inventoryOnly || accountedPayments == null ? null : accountedPayments - loggedGross;

  const submitCloseout = async () => {
    if (missingReturnCounts) {
      flash("error", "Enter the physical return count for every honey, including 0 when none came back.");
      return;
    }
    if (!inventoryOnly && reportedCashCents == null) {
      flash("error", "Enter the cash actually collected at the market, including 0 if there was no cash.");
      return;
    }
    if (selectedSession.square_location_id && !activeReconciliation?.synced_at) {
      flash("error", "Sync Square before submitting the closeout.");
      return;
    }

    setBusy(true);
    try {
      const result = await nfos.marketSubmitCloseout({
        sessionId: selectedSession.id,
        returnLines: closeoutItems.map((row) => ({ item_id: row.item_id, quantity: Number(row.returned || 0) })),
        adjustments: adjustments.map(({ item_id, quantity, reason, notes: adjustmentNotes }) => ({
          item_id,
          quantity,
          reason,
          notes: adjustmentNotes,
        })),
        reportedCashCents,
        notes: closeoutNotes,
      });
      flash("success", inventoryOnly
        ? `Market closeout submitted. Inventory variance: ${result.inventory_variance_units || 0} jar(s). Payments were not reconciled.`
        : `Market closeout submitted. Inventory variance: ${result.inventory_variance_units || 0} jar(s); payment variance: ${money(result.payment_variance_cents || 0)}.`);
      setCloseoutOpen(false);
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not submit the market closeout.");
    } finally {
      setBusy(false);
    }
  };

  const openingMode = Boolean(selectedSession && (!selectedSession.opening_confirmed || editingOpening));
  const lockedCloseout = closeout && ["submitted", "approved"].includes(closeout.status);

  return (
    <>
      {error && <div className="nfos-error">{error}</div>}
      {message && <div className="nfos-success">{message}</div>}

      {!selectedSession ? (
        <div className="nfos-card">
          <div className="nfos-page-head" style={{ marginBottom: 14 }}>
            <div>
              <h2>Start Market</h2>
              <p>No admin assignment is needed. Start today's market, then record what honey physically went with you.</p>
            </div>
          </div>
          <form className="nfos-form" onSubmit={startMarket}>
            <div className="nfos-field full">
              <label>Where are you selling today?</label>
              <select value={startForm.marketDateId} onChange={(e) => setStartForm({ ...startForm, marketDateId: e.target.value })}>
                <option value="">Choose today's scheduled market…</option>
                {(workspace.available_markets || []).map((market) => (
                  <option key={market.market_date_id} value={market.market_date_id}>{market.venue_name} · {market.hours || "today"}</option>
                ))}
                <option value="custom">Other market / event</option>
              </select>
            </div>
            {(startForm.marketDateId === "custom" || (!workspace.available_markets?.length && !startForm.marketDateId)) && (
              <div className="nfos-field full">
                <label>Market / event name</label>
                <input value={startForm.customVenue} onChange={(e) => setStartForm({ ...startForm, customVenue: e.target.value })} placeholder="Example: Midland Farmers Market" />
              </div>
            )}
            <div className="nfos-field full">
              <label>Market tracking mode</label>
              <select value={startForm.squareLocationId} onChange={(e) => setStartForm({ ...startForm, squareLocationId: e.target.value })}>
                <option value="">Inventory Only — no Square reconciliation</option>
                {squareLocations.map((location) => <option key={location.id} value={location.id}>Inventory + Square reconciliation · {location.name}</option>)}
              </select>
              <span className="nfos-muted nfos-small">Inventory Only is the normal mode. Use your Square reader separately for payments; NFOS tracks the jars and inventory movement.</span>
            </div>
            <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Start Market</button></div>
          </form>
        </div>
      ) : lockedCloseout ? (
        <div className="nfos-card">
          <div className="nfos-page-head">
            <div>
              <h2>{selectedSession.venue_name}</h2>
              <p>{selectedSession.market_day} · Market closeout {closeout.status}</p>
            </div>
            <span className={`nfos-pill ${closeout.status === "approved" ? "ok" : ""}`}>{closeout.status}</span>
          </div>
          <div className="nfos-grid four" style={{ marginTop: 14 }}>
            <div className="nfos-stat"><div className="nfos-stat-label">Opening jars</div><div className="nfos-stat-value">{closeout.opening_units}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Logged sold</div><div className="nfos-stat-value">{closeout.logged_units}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Inventory variance</div><div className="nfos-stat-value">{closeout.inventory_variance_units}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Money variance</div><div className="nfos-stat-value">{money(closeout.payment_variance_cents)}</div></div>
          </div>
          <div className="nfos-note" style={{ marginTop: 14 }}>
            {closeout.status === "approved"
              ? "Approved. NFOS has posted the sales, returns, adjustments, and final inventory movement."
              : "Submitted for admin review. Sales and inventory remain staged until the full market closeout is approved."}
          </div>
        </div>
      ) : openingMode ? (
        <div className="nfos-card nfos-market-phone-workspace">
          <div className="nfos-page-head">
            <div>
              <h2>{editingOpening ? "Edit Opening Count" : "What did you take to market?"}</h2>
              <p>Scan each honey once and enter the total number of that flavor and size physically taken.</p>
            </div>
          </div>
          <div className="nfos-note" style={{ marginBottom: 14 }}><strong>{selectedSession.venue_name}</strong> · {selectedSession.market_day}</div>
          <button className="nfos-market-scan-primary" type="button" onClick={() => setCameraMode("opening")} disabled={busy}>
            <span className="nfos-market-scan-icon" aria-hidden="true">▣</span>
            <span><strong>Scan Honey</strong><small>Add opening inventory</small></span>
          </button>
          <details className="nfos-market-manual-fallback">
            <summary>Barcode won't scan?</summary>
            <div className="nfos-scan-order-manual">
              <input value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} placeholder="Type barcode number" />
              <button className="nfos-btn ghost" type="button" onClick={() => lookupBarcode(manualBarcode, "opening")}>Find Honey</button>
            </div>
          </details>

          <div className="nfos-card" style={{ marginTop: 16 }}>
            <div className="nfos-split-head"><h3>Opening Market Inventory</h3><strong>{openingCart.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} jars</strong></div>
            {!openingCart.length ? <div className="nfos-empty">Scan the first honey you are taking.</div> : (
              <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Honey</th><th>Size</th><th>Taken</th><th></th></tr></thead><tbody>
                {openingCart.map((row) => <tr key={row.item_id}><td><strong>{row.name}</strong></td><td>{row.size_label}</td><td><input style={{ width: 90 }} type="number" min="1" step="1" value={row.quantity} onChange={(e) => setOpeningCart((current) => current.map((item) => item.item_id === row.item_id ? { ...item, quantity: whole(e.target.value) } : item))} /></td><td><button className="nfos-btn ghost" type="button" onClick={() => setOpeningCart((current) => current.filter((item) => item.item_id !== row.item_id))}>Remove</button></td></tr>)}
              </tbody></table></div>
            )}
            <div className="nfos-inline-actions" style={{ marginTop: 14 }}>
              {editingOpening && <button className="nfos-btn ghost" type="button" onClick={() => { setEditingOpening(false); setOpeningCart([]); }}>Cancel</button>}
              <button className="nfos-btn" type="button" onClick={confirmOpening} disabled={busy || !openingCart.length}>Confirm Market Load</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {closeout?.status === "returned" && <div className="nfos-error"><strong>Closeout returned for correction.</strong> {closeout.admin_notes || "Review the market sales and counts, then resubmit."}</div>}

          <div className="nfos-card nfos-market-phone-workspace">
            <div className="nfos-page-head nfos-market-mobile-head">
              <div>
                <h2>{editingOrderId ? "Edit Sale" : "Market Scanner"}</h2>
                <p>{selectedSession.venue_name} · Scan what the customer is buying.</p>
              </div>
              <div className="nfos-inline-actions">
                {!sessionLogs.length && <button className="nfos-btn ghost" type="button" onClick={beginEditOpening}>Edit opening count</button>}
                {editingOrderId && <button className="nfos-btn ghost" type="button" onClick={clearSale}>Cancel edit</button>}
              </div>
            </div>

            <div className="nfos-grid four" style={{ marginBottom: 14 }}>
              <div className="nfos-stat"><div className="nfos-stat-label">Taken</div><div className="nfos-stat-value">{openingRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Logged sold</div><div className="nfos-stat-value">{loggedUnits}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Sales</div><div className="nfos-stat-value">{sessionLogs.length}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Logged value</div><div className="nfos-stat-value">{money(loggedGross)}</div></div>
            </div>

            <button className="nfos-market-scan-primary" type="button" onClick={() => setCameraMode("sale")} disabled={busy || closeoutOpen}>
              <span className="nfos-market-scan-icon" aria-hidden="true">▣</span>
              <span><strong>Scan Honey</strong><small>Build current customer sale</small></span>
            </button>

            <details className="nfos-market-manual-fallback">
              <summary>Barcode won't scan?</summary>
              <div className="nfos-scan-order-manual">
                <input value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} placeholder="Type barcode number" />
                <button className="nfos-btn ghost" type="button" onClick={() => lookupBarcode(manualBarcode, "sale")}>Find Honey</button>
              </div>
            </details>

            <div className="nfos-market-current-sale">
              <div className="nfos-split-head">
                <div><h3>Current Sale</h3><span className="nfos-muted nfos-small">{cart.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} jars</span></div>
                <strong className="nfos-market-sale-total">{money(bundleCalc.total)}</strong>
              </div>
              {!cart.length ? <div className="nfos-market-empty-sale">Scan a honey jar to start.</div> : (
                <div className="nfos-market-sale-lines">
                  {cart.map((line) => <div className="nfos-market-sale-line" key={line.item_id}>
                    <div className="nfos-market-sale-line-main"><strong>{line.name}</strong><span>{line.size_label}</span><span>{money(line.unit_cents)} each</span></div>
                    <div className="nfos-market-sale-line-qty"><label>Sold</label><div className="nfos-market-qty-control compact"><button type="button" onClick={() => { setCart((current) => current.map((row) => row.item_id === line.item_id ? { ...row, quantity: Math.max(1, Number(row.quantity) - 1) } : row)); setSaleTotalTouched(false); }}>−</button><input type="number" min="1" step="1" inputMode="numeric" value={line.quantity} onChange={(e) => { setCart((current) => current.map((row) => row.item_id === line.item_id ? { ...row, quantity: Math.max(1, whole(e.target.value)) } : row)); setSaleTotalTouched(false); }} /><button type="button" onClick={() => { setCart((current) => current.map((row) => row.item_id === line.item_id ? { ...row, quantity: Number(row.quantity) + 1 } : row)); setSaleTotalTouched(false); }}>+</button></div></div>
                    <div className="nfos-market-sale-line-total"><strong>{money(Number(line.unit_cents || 0) * Number(line.quantity || 0))}</strong><button className="nfos-link-danger" type="button" onClick={() => { setCart((current) => current.filter((row) => row.item_id !== line.item_id)); setSaleTotalTouched(false); }}>Remove</button></div>
                  </div>)}
                </div>
              )}
              {bundleCalc.bundleGroups > 0 && <div className="nfos-note" style={{ marginTop: 10 }}>Bundle pricing applied automatically: {bundleCalc.bundleGroups} × {workspace.bundle.count}-jar bundle at {money(workspace.bundle.price_cents)}.</div>}
              {cart.length > 0 && <button className="nfos-btn secondary nfos-market-scan-another" type="button" onClick={() => setCameraMode("sale")}>+ Scan Another Honey</button>}
            </div>

            {cart.length > 0 && <>
              <div className="nfos-form" style={{ marginTop: 14 }}>
                <div className="nfos-field"><label>Amount charged</label><input type="number" min="0" step="0.01" inputMode="decimal" value={saleTotalInput} onChange={(e) => { setSaleTotalInput(e.target.value); setSaleTotalTouched(true); }} /></div>
                <div className="nfos-field"><label>Sale note (optional)</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Discount, special circumstance, etc." /></div>
              </div>
              <button className="nfos-market-log-order" disabled={busy} type="button" onClick={logSale}>{editingOrderId ? "Save Sale Changes" : "Log Sale"}<span>{money(dollarsToCents(saleTotalInput))}</span></button>
            </>}
          </div>

          <div className="nfos-card nfos-market-todays-logs">
            <div className="nfos-page-head" style={{ marginBottom: 12 }}>
              <div><h2>Today's Sales</h2><p>These stay editable until the full market closeout is submitted.</p></div>
              <button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button>
            </div>
            {!sessionLogs.length ? <div className="nfos-empty">No customer sales logged yet.</div> : (
              <div className="nfos-market-log-list">{sessionLogs.map((order) => <div className="nfos-market-log-card" key={order.id}>
                <div className="nfos-split-head"><div><strong>{order.order_no}</strong><div className="nfos-muted nfos-small">{new Date(order.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div><strong>{money(order.sale_total_cents)}</strong></div>
                <div className="nfos-market-log-lines">{(order.items || []).map((line) => <span key={line.id}>{line.quantity} × {line.name} {line.size_label}</span>)}</div>
                {["logged", "returned"].includes(order.status) && !closeoutOpen && <div className="nfos-inline-actions" style={{ marginTop: 10 }}><button className="nfos-btn ghost" onClick={() => editLog(order)}>Edit sale</button></div>}
              </div>)}</div>
            )}
            {!closeoutOpen && <button className="nfos-btn" style={{ marginTop: 16 }} onClick={beginCloseout} disabled={busy}>Close Market · Reconcile Everything</button>}
          </div>

          {closeoutOpen && <div className="nfos-card">
            <div className="nfos-page-head">
              <div><h2>Market Closeout</h2><p>Count what came back, report cash, and let NFOS compare physical inventory, logged sales, Square, and cash.</p></div>
              <button className="nfos-btn ghost" onClick={() => setCloseoutOpen(false)}>Back to sales</button>
            </div>

            <div className="nfos-card" style={{ marginTop: 14 }}>
              <div className="nfos-split-head"><div><h3>1. Count physical returns</h3><p className="nfos-muted">Enter what physically came back for every honey. Use 0 when none remained.</p></div><button className="nfos-btn secondary" onClick={() => setCameraMode("return")}>Scan Returns</button></div>
              <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Honey</th><th>Taken</th><th>Sold</th><th>Non-sale</th><th>Expected back</th><th>Counted back</th><th>Variance</th></tr></thead><tbody>
                {closeoutItems.map((row) => <tr key={row.item_id}><td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{row.size_label}</div></td><td>{row.opening}</td><td>{row.sold}</td><td>{row.adjustments}</td><td>{row.expected}</td><td><input style={{ width: 82 }} type="number" min="0" step="1" value={returnCounts[row.item_id] ?? ""} onChange={(e) => setReturnCounts((current) => ({ ...current, [row.item_id]: e.target.value === "" ? "" : whole(e.target.value) }))} /></td><td><span className={`nfos-pill ${row.variance === 0 ? "ok" : row.variance == null ? "" : "low"}`}>{row.variance == null ? "—" : row.variance === 0 ? "0 ✓" : row.variance}</span></td></tr>)}
              </tbody></table></div>
            </div>

            <div className="nfos-card" style={{ marginTop: 14 }}>
              <h3>2. Record samples, damage, gifts or transfers</h3>
              <p className="nfos-muted">Only use this when product legitimately left inventory without being a customer sale.</p>
              <div className="nfos-form">
                <div className="nfos-field full"><label>Honey</label><select value={adjustDraft.itemId} onChange={(e) => setAdjustDraft({ ...adjustDraft, itemId: e.target.value })}><option value="">Choose honey…</option>{closeoutItems.map((row) => <option key={row.item_id} value={row.item_id}>{row.name} {row.size_label}</option>)}</select></div>
                <div className="nfos-field"><label>Quantity</label><input type="number" min="1" step="1" value={adjustDraft.quantity} onChange={(e) => setAdjustDraft({ ...adjustDraft, quantity: e.target.value })} /></div>
                <div className="nfos-field"><label>Reason</label><select value={adjustDraft.reason} onChange={(e) => setAdjustDraft({ ...adjustDraft, reason: e.target.value })}>{Object.entries(reasonLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
                <div className="nfos-field full"><label>Note (optional)</label><input value={adjustDraft.notes} onChange={(e) => setAdjustDraft({ ...adjustDraft, notes: e.target.value })} /></div>
                <div className="nfos-field full"><button className="nfos-btn secondary" type="button" onClick={addAdjustment}>Add non-sale use</button></div>
              </div>
              {adjustments.length > 0 && <div className="nfos-market-log-list">{adjustments.map((adj) => { const item = closeoutItems.find((row) => row.item_id === adj.item_id); return <div className="nfos-market-log-card" key={adj.key}><div className="nfos-split-head"><strong>{adj.quantity} × {item?.name || "Honey"} {item?.size_label || ""}</strong><button className="nfos-btn ghost" onClick={() => setAdjustments((current) => current.filter((row) => row.key !== adj.key))}>Remove</button></div><div className="nfos-muted nfos-small">{reasonLabels[adj.reason]}{adj.notes ? ` · ${adj.notes}` : ""}</div></div>; })}</div>}
            </div>

            <div className="nfos-card" style={{ marginTop: 14 }}>
              <div className="nfos-split-head"><div><h3>{inventoryOnly ? "3. Inventory tracking only" : "3. Reconcile money"}</h3><p className="nfos-muted">{inventoryOnly ? "Payments are handled separately. NFOS is only reconciling product movement for this market." : "Square is pulled directly. You only report the cash actually collected."}</p></div>{selectedSession.square_location_id && <button className="nfos-btn secondary" onClick={syncSquare} disabled={busy}>Sync Square Now</button>}</div>
              <div className="nfos-grid four" style={{ marginTop: 12 }}>
                <div className="nfos-stat"><div className="nfos-stat-label">Logged sales</div><div className="nfos-stat-value">{money(loggedGross)}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">Square / non-cash</div><div className="nfos-stat-value">{inventoryOnly ? "Not tracked" : activeReconciliation?.synced_at ? money(squareNoncashCents) : "—"}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">Reported cash</div><div className="nfos-stat-value">{inventoryOnly ? "Not tracked" : reportedCashCents == null ? "—" : money(reportedCashCents)}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">Money variance</div><div className="nfos-stat-value">{inventoryOnly ? "Not tracked" : paymentVariance == null ? "—" : money(paymentVariance)}</div></div>
              </div>
              <div className="nfos-form" style={{ marginTop: 14 }}>
                <div className="nfos-field"><label>{inventoryOnly ? "Cash tracking" : "Cash physically collected ($)"}</label><input disabled={inventoryOnly} type="number" min="0" step="0.01" inputMode="decimal" placeholder={inventoryOnly ? "Not tracked" : "0.00"} value={inventoryOnly ? "" : reportedCash} onChange={(e) => setReportedCash(e.target.value)} /></div>
                <div className="nfos-field"><label>Square completed orders</label><input disabled value={inventoryOnly ? "Not tracked" : (activeReconciliation?.square_transaction_count ?? "Not synced")} /></div>
              </div>
              {Number(activeReconciliation?.square_cash_cents || 0) > 0 && reportedCashCents != null && <div className="nfos-note">Square also shows {money(activeReconciliation.square_cash_cents)} in cash tenders. Your physical cash differs by {money(reportedCashCents - Number(activeReconciliation.square_cash_cents || 0))}.</div>}
            </div>

            <div className="nfos-card" style={{ marginTop: 14 }}>
              <h3>4. Review & submit</h3>
              <div className="nfos-grid four" style={{ marginTop: 12 }}>
                <div className="nfos-stat"><div className="nfos-stat-label">Opening</div><div className="nfos-stat-value">{openingRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0)}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">Sold</div><div className="nfos-stat-value">{loggedUnits}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">Inventory variance</div><div className="nfos-stat-value">{missingReturnCounts ? "—" : inventoryVarianceUnits}</div></div>
                <div className="nfos-stat"><div className="nfos-stat-label">{inventoryOnly ? "Payment tracking" : "Payment variance"}</div><div className="nfos-stat-value">{inventoryOnly ? "Not tracked" : paymentVariance == null ? "—" : money(paymentVariance)}</div></div>
              </div>
              <div className="nfos-field" style={{ marginTop: 14 }}><label>Closeout note (optional)</label><textarea value={closeoutNotes} onChange={(e) => setCloseoutNotes(e.target.value)} placeholder="Explain anything the admin should know." /></div>
              {(inventoryVarianceUnits !== 0 || (paymentVariance != null && paymentVariance !== 0)) && <div className="nfos-error" style={{ marginTop: 12 }}>This market has a variance. Submit it anyway so the admin can review the exact discrepancy; inventory will not finalize until approval.</div>}
              <button className="nfos-btn" style={{ marginTop: 14 }} onClick={submitCloseout} disabled={busy || missingReturnCounts || (!inventoryOnly && reportedCashCents == null) || (Boolean(selectedSession.square_location_id) && !activeReconciliation?.synced_at)}>Submit Market Closeout for Approval</button>
            </div>
          </div>}
        </>
      )}

      {cameraMode && <div className="nfos-market-scan-overlay"><div className="nfos-market-scan-overlay-inner"><NfosCameraScanner onDetected={(value) => lookupBarcode(value, cameraMode)} onClose={() => setCameraMode("")} /></div></div>}

      {scannedItem && <div className="nfos-market-item-overlay" role="dialog" aria-modal="true" aria-label="Scanned honey">
        <div className="nfos-market-item-popup">
          <div className="nfos-market-item-popup-head"><div><span className="nfos-market-scanned-label">SCANNED HONEY</span><h2>{scannedItem.name}</h2><p>{scannedItem.size_label} · {scannedItem.texture || "regular"}</p></div><button className="nfos-market-popup-close" type="button" aria-label="Close" onClick={() => setScannedItem(null)}>×</button></div>
          <div className="nfos-market-item-facts">
            <div><span>Price</span><strong>{money(scannedItem.unit_cents)}</strong></div>
            <div><span>Taken</span><strong>{scannedItem.openingQty}</strong></div>
            <div><span>Logged sold</span><strong>{scannedItem.alreadySold}</strong></div>
          </div>
          <div className="nfos-market-quantity-sold">
            <label>{scannedItem.mode === "opening" ? "How many taken?" : scannedItem.mode === "return" ? "How many came back?" : "How many sold?"}</label>
            <div className="nfos-market-qty-control"><button type="button" onClick={() => setScanQty(Math.max(scannedItem.mode === "return" ? 0 : 1, Number(scanQty || 0) - 1))}>−</button><input type="number" min={scannedItem.mode === "return" ? "0" : "1"} step="1" inputMode="numeric" value={scanQty} onChange={(e) => setScanQty(whole(e.target.value))} autoFocus /><button type="button" onClick={() => setScanQty(Number(scanQty || 0) + 1)}>+</button></div>
            {scannedItem.mode === "sale" && scannedItem.expectedRemaining < Number(scanQty || 0) && <div className="nfos-error" style={{ marginTop: 10 }}>This would put logged sales above the opening count. NFOS will allow it, but the market will show an inventory variance at closeout.</div>}
          </div>
          <div className="nfos-market-popup-actions"><button className="nfos-btn ghost" type="button" onClick={() => setScannedItem(null)}>Cancel</button><button className="nfos-btn secondary" type="button" onClick={() => addScannedItem(false)}>Save</button><button className="nfos-btn" type="button" onClick={() => addScannedItem(true)}>Save & Scan Next</button></div>
        </div>
      </div>}
    </>
  );
}
