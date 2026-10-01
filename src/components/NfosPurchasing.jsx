import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const qty = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num)
    ? String(num)
    : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });

const dateLabel = (value) => {
  if (!value) return "—";
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
};

function Empty({ children }) {
  return <div className="nfos-empty">{children}</div>;
}

export default function NfosPurchasing({ locations = [], onInventoryChanged }) {
  const [recommendations, setRecommendations] = useState([]);
  const [purchaseTiming, setPurchaseTiming] = useState([]);
  const [supplierReadiness, setSupplierReadiness] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [termDrafts, setTermDrafts] = useState({});
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [lines, setLines] = useState([]);
  const [receiptDrafts, setReceiptDrafts] = useState({});
  const [expectedDate, setExpectedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const mainLocationId = useMemo(
    () => locations.find((x) => x.code === "MAIN")?.id || locations.find((x) => x.active)?.id || "",
    [locations]
  );

  const selectedPo = purchaseOrders.find((x) => x.id === selectedPoId) || null;

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [recs, pos, timingRows, readinessRows, supplierRows] = await Promise.all([
        nfos.listReorderRecommendations(),
        nfos.listPurchaseOrders(),
        nfos.listPurchaseTiming(),
        nfos.listSupplierReadiness(),
        nfos.listSuppliers(),
      ]);
      setRecommendations(recs || []);
      setPurchaseTiming(timingRows || []);
      setSupplierReadiness(readinessRows || []);
      setSuppliers(supplierRows || []);
      setTermDrafts((current) => {
        const next = { ...current };
        (readinessRows || []).forEach((row) => {
          if (!next[row.item_id]) {
            next[row.item_id] = {
              supplierId: row.supplier_id || "",
              leadTimeDays: row.lead_time_days ?? "",
              minimumOrderQty: row.minimum_order_qty ?? "",
              orderIncrement: row.order_increment ?? "",
              unitCost: row.last_unit_cost ?? row.standard_unit_cost ?? "",
              supplierSku: row.supplier_sku || "",
            };
          }
        });
        return next;
      });
      setPurchaseOrders(pos || []);
      setSelectedPoId((current) => {
        if (current && (pos || []).some((x) => x.id === current)) return current;
        return (pos || []).find((x) => ["draft", "ordered", "partial"].includes(x.status))?.id || (pos || [])[0]?.id || "";
      });
    } catch (err) {
      setError(err?.message || "Could not load purchasing data.");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadLines = useCallback(async () => {
    if (!selectedPoId) {
      setLines([]);
      return;
    }
    try {
      const rows = await nfos.listPurchaseOrderLines(selectedPoId);
      setLines(rows || []);
      setReceiptDrafts((current) => {
        const next = { ...current };
        (rows || []).forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = {
              quantity: row.quantity_open ? String(row.quantity_open) : "",
              lotCode: "",
              supplierLotCode: "",
              notes: "",
            };
          }
        });
        return next;
      });
    } catch (err) {
      setError(err?.message || "Could not load purchase-order lines.");
    }
  }, [selectedPoId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLines(); }, [loadLines]);

  const readyRecommendations = recommendations.filter((x) => Boolean(x.supplier_id));
  const supplierNeeded = recommendations.filter((x) => !x.supplier_id);
  const productionDriven = recommendations.filter((x) => String(x.recommendation_reason || "").startsWith("production"));
  const supplierSetupRows = supplierReadiness.filter((x) => x.reorder_point != null && x.readiness_status !== "ready");
  const timingAttention = purchaseTiming.filter((x) => ["overdue", "due_today", "due_soon", "lead_time_missing", "supplier_missing", "cost_missing"].includes(x.timing_status));
  const supplierGroups = useMemo(() => {
    const map = new Map();
    readyRecommendations.forEach((row) => {
      if (!row.supplier_id) return;
      if (!map.has(row.supplier_id)) {
        map.set(row.supplier_id, {
          supplierId: row.supplier_id,
          supplierName: row.supplier_name || "Supplier",
          rows: [],
          total: 0,
        });
      }
      const group = map.get(row.supplier_id);
      group.rows.push(row);
      group.total += Number(row.estimated_line_cost || 0);
    });
    return [...map.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [readyRecommendations]);

  const createSupplierPo = async (group) => {
    if (!mainLocationId) {
      setError("Main Inventory location is not available.");
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nfos.createReorderPurchaseOrder({
        supplierId: group.supplierId,
        expectedDate: expectedDate || null,
        destinationLocationId: mainLocationId,
        notes: "Created from NFOS production-aware purchase recommendations.",
      });
      setMessage(`${result.po_number} created as a draft with ${result.line_count} recommended item${Number(result.line_count) === 1 ? "" : "s"}.`);
      await load();
      setSelectedPoId(result.id);
    } catch (err) {
      setError(err?.message || "Could not create purchase order.");
    } finally {
      setBusy(false);
    }
  };

  const submitPo = async () => {
    if (!selectedPoId) return;
    if (!window.confirm(`Mark ${selectedPo?.po_number || "this PO"} as ordered? Its quantities will count as incoming inventory.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nfos.submitPurchaseOrder(selectedPoId);
      setMessage(`${result.po_number} is now ordered. NFOS is counting its open quantities as incoming stock.`);
      await load();
      await loadLines();
    } catch (err) {
      setError(err?.message || "Could not submit purchase order.");
    } finally {
      setBusy(false);
    }
  };

  const setReceipt = (lineId, patch) => {
    setReceiptDrafts((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] || {}), ...patch },
    }));
  };

  const setTermDraft = (itemId, patch) => {
    setTermDrafts((current) => ({
      ...current,
      [itemId]: { ...(current[itemId] || {}), ...patch },
    }));
  };

  const saveSupplierTerms = async (row) => {
    const draft = termDrafts[row.item_id] || {};
    if (!draft.supplierId) {
      setError(`Choose a supplier for ${row.name}.`);
      return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nfos.setItemSupplierTerms({
        itemId: row.item_id,
        supplierId: draft.supplierId,
        leadTimeDays: draft.leadTimeDays,
        minimumOrderQty: draft.minimumOrderQty,
        orderIncrement: draft.orderIncrement,
        unitCost: draft.unitCost,
        supplierSku: draft.supplierSku,
        setPreferred: true,
      });
      setMessage(`${row.name} supplier terms saved${result.lead_time_days == null ? ". Add lead time when known so NFOS can calculate an order-by date." : "."}`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not save supplier terms.");
    } finally {
      setBusy(false);
    }
  };

  const receiveLine = async (line) => {
    const draft = receiptDrafts[line.id] || {};
    const amount = Number(draft.quantity || 0);
    if (!amount || amount <= 0) {
      setError("Enter a positive receipt quantity.");
      return;
    }
    if (line.track_lots && !draft.lotCode?.trim()) {
      setError(`Enter the actual lot number for ${line.item_name} before receiving it.`);
      return;
    }
    if (!window.confirm(`Receive ${qty(amount)} ${line.unit} of ${line.item_name} against ${line.po_number}?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await nfos.receivePurchaseOrderLine({
        purchaseOrderLineId: line.id,
        quantity: amount,
        lotCode: draft.lotCode,
        supplierLotCode: draft.supplierLotCode,
        notes: draft.notes,
      });
      setMessage(`Received ${qty(amount)} ${line.unit} of ${line.item_name}. PO status: ${result.po_status}.`);
      setReceiptDrafts((current) => ({
        ...current,
        [line.id]: { quantity: "", lotCode: "", supplierLotCode: "", notes: "" },
      }));
      await Promise.all([load(), loadLines(), onInventoryChanged?.()]);
    } catch (err) {
      setError(err?.message || "Could not receive purchase-order line.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <div className="nfos-error">{error}</div>}
      {message && <div className="nfos-success">{message}</div>}

      <div className="nfos-grid four" style={{ marginBottom: 16 }}>
        <div className="nfos-stat"><div className="nfos-stat-label">Purchase recommendations</div><div className="nfos-stat-value">{recommendations.length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Production-driven</div><div className="nfos-stat-value">{productionDriven.length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Supplier needed</div><div className="nfos-stat-value">{supplierNeeded.length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Open POs</div><div className="nfos-stat-value">{purchaseOrders.filter((x) => ["draft", "ordered", "partial"].includes(x.status)).length}</div></div>
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Inventory + production purchasing</h2>
            <p>NFOS subtracts open production demand from on-hand and incoming inventory before recommending what to buy.</p>
          </div>
          <button className="nfos-btn secondary" disabled={busy} onClick={load}>Refresh</button>
        </div>

        {recommendations.length === 0 ? <Empty>No materials or packaging currently need purchasing.</Empty> : (
          <div className="nfos-table-wrap">
            <table className="nfos-table">
              <thead><tr><th>Item</th><th>On hand</th><th>Incoming</th><th>Production demand</th><th>After production</th><th>Target</th><th>Suggested order</th><th>Reason</th><th>Supplier</th><th>Est. cost</th></tr></thead>
              <tbody>{recommendations.map((row) => <tr key={row.item_id}>
                <td><strong>{row.name}</strong><div className="nfos-mono nfos-muted">{row.sku}</div></td>
                <td>{qty(row.planning_on_hand)} {row.stocking_unit}</td>
                <td>{qty(row.incoming_quantity)} {row.stocking_unit}</td>
                <td>{qty(row.open_production_demand)} {row.stocking_unit}</td>
                <td><strong>{qty(row.projected_after_production)} {row.stocking_unit}</strong></td>
                <td>{qty(row.target_stock)}</td>
                <td><strong>{qty(row.suggested_order_quantity)} {row.stocking_unit}</strong></td>
                <td><span className={`nfos-pill ${row.recommendation_reason === "production_shortage" ? "low" : ""}`}>{String(row.recommendation_reason || "stock_reorder").replaceAll("_", " ")}</span></td>
                <td>{row.supplier_name || <span className="nfos-pill low">Supplier needed</span>}</td>
                <td>{row.estimated_unit_cost == null ? "—" : money(row.estimated_line_cost)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Order timing</h2>
            <p>When production is planned, NFOS works backward from the earliest need date using the supplier lead time.</p>
          </div>
          <span className={`nfos-pill ${timingAttention.length ? "low" : "ok"}`}>{timingAttention.length} need attention</span>
        </div>
        {purchaseTiming.length === 0 ? <Empty>No purchase timing is currently required. Production need dates will appear here as orders are planned.</Empty> : (
          <div className="nfos-table-wrap">
            <table className="nfos-table">
              <thead><tr><th>Item</th><th>Supplier</th><th>Needed by</th><th>Lead time</th><th>Order by</th><th>Status</th><th>Production orders</th></tr></thead>
              <tbody>{purchaseTiming.map((row) => <tr key={row.item_id}>
                <td><strong>{row.name}</strong><div className="nfos-mono nfos-muted">{row.sku}</div></td>
                <td>{row.supplier_name || <span className="nfos-pill low">Supplier missing</span>}</td>
                <td>{dateLabel(row.earliest_need_date)}</td>
                <td>{row.lead_time_days == null ? "—" : `${row.lead_time_days} day${Number(row.lead_time_days) === 1 ? "" : "s"}`}</td>
                <td><strong>{dateLabel(row.order_by_date)}</strong></td>
                <td><span className={`nfos-pill ${["overdue", "due_today", "lead_time_missing", "supplier_missing", "cost_missing"].includes(row.timing_status) ? "low" : row.timing_status === "scheduled" ? "ok" : ""}`}>{String(row.timing_status || "").replaceAll("_", " ")}</span></td>
                <td>{row.production_orders || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Supplier readiness</h2>
            <p>Fill only the terms you actually know. NFOS will keep missing data visible rather than guessing.</p>
          </div>
          <span className={`nfos-pill ${supplierSetupRows.length ? "low" : "ok"}`}>{supplierSetupRows.length} incomplete</span>
        </div>
        {supplierSetupRows.length === 0 ? <Empty>All reorder-controlled materials and packaging have complete supplier timing data.</Empty> : (
          <div className="nfos-supplier-setup-list">
            {supplierSetupRows.map((row) => {
              const draft = termDrafts[row.item_id] || {};
              return <div className="nfos-supplier-setup-row" key={row.item_id}>
                <div className="nfos-supplier-setup-title">
                  <strong>{row.name}</strong>
                  <div className="nfos-mono nfos-muted">{row.sku} • {String(row.readiness_status || "").replaceAll("_", " ")}</div>
                </div>
                <div className="nfos-field"><label>Supplier</label><select value={draft.supplierId || ""} onChange={(e) => setTermDraft(row.item_id, { supplierId: e.target.value })}><option value="">Choose…</option>{suppliers.filter((x) => x.active).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></div>
                <div className="nfos-field"><label>Lead time (days)</label><input type="number" min="0" step="1" value={draft.leadTimeDays ?? ""} onChange={(e) => setTermDraft(row.item_id, { leadTimeDays: e.target.value })} /></div>
                <div className="nfos-field"><label>Minimum order</label><input type="number" min="0" step="any" value={draft.minimumOrderQty ?? ""} onChange={(e) => setTermDraft(row.item_id, { minimumOrderQty: e.target.value })} /></div>
                <div className="nfos-field"><label>Order increment</label><input type="number" min="0" step="any" value={draft.orderIncrement ?? ""} onChange={(e) => setTermDraft(row.item_id, { orderIncrement: e.target.value })} /></div>
                <div className="nfos-field"><label>Unit cost</label><input type="number" min="0" step="any" value={draft.unitCost ?? ""} onChange={(e) => setTermDraft(row.item_id, { unitCost: e.target.value })} /></div>
                <div className="nfos-field"><label>Supplier SKU</label><input value={draft.supplierSku || ""} onChange={(e) => setTermDraft(row.item_id, { supplierSku: e.target.value })} /></div>
                <div className="nfos-field nfos-supplier-save"><button className="nfos-btn" disabled={busy} onClick={() => saveSupplierTerms(row)}>Save terms</button></div>
              </div>;
            })}
          </div>
        )}
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div><h2>Create recommended purchase orders</h2><p>Recommendations include both stock thresholds and demand from open production orders. One draft PO is created per supplier.</p></div>
          <div className="nfos-field" style={{ minWidth: 190 }}><label>Expected date</label><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
        </div>
        {supplierGroups.length === 0 ? <Empty>No supplier-ready purchase recommendations right now.</Empty> : (
          <div className="nfos-purchase-supplier-grid">
            {supplierGroups.map((group) => <div className="nfos-purchase-supplier" key={group.supplierId}>
              <div><strong>{group.supplierName}</strong><div className="nfos-muted nfos-small">{group.rows.length} recommended item{group.rows.length === 1 ? "" : "s"} • {money(group.total)} estimated</div></div>
              <button className="nfos-btn" disabled={busy} onClick={() => createSupplierPo(group)}>Create draft PO</button>
            </div>)}
          </div>
        )}
        {supplierNeeded.length > 0 && <div className="nfos-note" style={{ marginTop: 14 }}><strong>{supplierNeeded.length} item{supplierNeeded.length === 1 ? "" : "s"} still need a preferred supplier.</strong> Assign the supplier under Items/Suppliers and they will automatically move into supplier-ready purchasing.</div>}
      </div>

      <div className="nfos-grid two nfos-purchasing-grid">
        <div className="nfos-card">
          <h2>Purchase orders</h2>
          {purchaseOrders.length === 0 ? <Empty>No purchase orders yet.</Empty> : (
            <div className="nfos-purchase-list">{purchaseOrders.map((po) => <button type="button" key={po.id} className={`nfos-purchase-row ${selectedPoId === po.id ? "selected" : ""}`} onClick={() => setSelectedPoId(po.id)}>
              <div><strong>{po.po_number}</strong><div className="nfos-muted nfos-small">{po.supplier_name} • {po.line_count} line{Number(po.line_count) === 1 ? "" : "s"}</div></div>
              <div className="nfos-purchase-row-right"><span className={`nfos-pill ${po.status === "received" ? "ok" : po.status === "cancelled" ? "low" : ""}`}>{po.status}</span><strong>{money(po.estimated_total)}</strong></div>
            </button>)}</div>
          )}
        </div>

        <div className="nfos-card">
          <div className="nfos-page-head" style={{ marginBottom: 12 }}><div><h2>{selectedPo?.po_number || "PO details"}</h2>{selectedPo && <p>{selectedPo.supplier_name} • Expected {dateLabel(selectedPo.expected_date)}</p>}</div>{selectedPo?.status === "draft" && <button className="nfos-btn" disabled={busy} onClick={submitPo}>Mark ordered</button>}</div>
          {!selectedPo ? <Empty>Select a purchase order.</Empty> : lines.length === 0 ? <Empty>No lines on this purchase order.</Empty> : (
            <div className="nfos-purchase-lines">{lines.map((line) => {
              const draft = receiptDrafts[line.id] || {};
              const canReceive = ["ordered", "partial"].includes(selectedPo.status) && Number(line.quantity_open || 0) > 0;
              return <div className="nfos-purchase-line" key={line.id}>
                <div className="nfos-purchase-line-head"><div><strong>{line.item_name}</strong><div className="nfos-mono nfos-muted">{line.sku}</div></div><div><strong>{qty(line.quantity_received)} / {qty(line.quantity_ordered)} {line.unit}</strong><div className="nfos-muted nfos-small">Open {qty(line.quantity_open)}</div></div></div>
                <div className="nfos-muted nfos-small">Unit cost {line.unit_cost == null ? "—" : money(line.unit_cost)} • Est. line {money(line.estimated_line_total)}</div>
                {canReceive && <div className="nfos-receipt-form">
                  <div className="nfos-field"><label>Receive qty</label><input type="number" min="0.0001" max={line.quantity_open} step="any" value={draft.quantity ?? ""} onChange={(e) => setReceipt(line.id, { quantity: e.target.value })} /></div>
                  <div className="nfos-field"><label>Lot number {line.track_lots ? "(required)" : ""}</label><input value={draft.lotCode || ""} onChange={(e) => setReceipt(line.id, { lotCode: e.target.value })} /></div>
                  <div className="nfos-field"><label>Supplier lot</label><input value={draft.supplierLotCode || ""} onChange={(e) => setReceipt(line.id, { supplierLotCode: e.target.value })} /></div>
                  <div className="nfos-field"><label>Notes</label><input value={draft.notes || ""} onChange={(e) => setReceipt(line.id, { notes: e.target.value })} /></div>
                  <div className="nfos-field full"><button className="nfos-btn" disabled={busy} onClick={() => receiveLine(line)}>Receive into NFOS</button></div>
                </div>}
              </div>;
            })}</div>
          )}
        </div>
      </div>
    </>
  );
}
