import { useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import { workbookReceivingHistory } from "../data/nfosWorkbookHistory";

const qty = (value) => {
  if (value == null || value === "") return "—";
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const money = (value) => {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const typeLabel = (type) =>
  ({ finished_good: "Finished", material: "Infusion", packaging: "Packaging" }[type] || type || "—");

const localDateTime = () => {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const keyFor = (item, lot) =>
  `${String(item || "").trim().toLowerCase()}|${String(lot || "").trim().toLowerCase()}`;

export default function NfosReceivingWorkspace({ items, locations, suppliers, lots, onDone }) {
  const [mode, setMode] = useState("log");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [balances, setBalances] = useState([]);
  const [form, setForm] = useState({
    itemId:"",
    locationId:"",
    supplierId:"",
    quantity:"",
    lotCode:"",
    supplierLotCode:"",
    totalCost:"",
    receivedAt:localDateTime(),
    notes:"",
  });
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  useEffect(() => {
    const main=locations.find((x)=>x.code==="MAIN")?.id || locations.find((x)=>x.active)?.id || "";
    setForm((current)=>({...current,locationId:current.locationId || main}));
  }, [locations]);

  const loadBalances = async () => {
    try { setBalances((await nfos.listLotBalances()) || []); }
    catch { setBalances([]); }
  };
  useEffect(()=>{loadBalances();},[]);

  const itemMap = useMemo(()=>Object.fromEntries(items.map((row)=>[row.id,row])),[items]);
  const supplierMap = useMemo(()=>Object.fromEntries(suppliers.map((row)=>[row.id,row])),[suppliers]);
  const locationMap = useMemo(()=>Object.fromEntries(locations.map((row)=>[row.id,row])),[locations]);

  const balanceMap = useMemo(() => {
    const map = new Map();
    balances.forEach((row) => {
      if (!map.has(row.lot_id)) map.set(row.lot_id, { remaining: 0, locations: new Set() });
      const entry = map.get(row.lot_id);
      entry.remaining += Number(row.on_hand || 0);
      if (locationMap[row.location_id]?.name) entry.locations.add(locationMap[row.location_id].name);
    });
    return map;
  }, [balances, locationMap]);

  const liveByWorkbookKey = useMemo(() => {
    const map = new Map();
    lots.forEach((lot) => {
      const item = itemMap[lot.item_id];
      if (!item) return;
      map.set(keyFor(item.name, lot.lot_code), lot);
    });
    return map;
  }, [lots, itemMap]);

  const workbookRows = useMemo(() => workbookReceivingHistory.map((row) => {
    const liveLot = liveByWorkbookKey.get(keyFor(row.item_name, row.lot_number));
    if (!liveLot) return { ...row, source:"Workbook history", record_key:`workbook-${row.source_row}` };

    const current = balanceMap.get(liveLot.id);
    const remaining = current ? current.remaining : row.remaining_quantity;
    const received = liveLot.received_quantity == null ? row.quantity_received : Number(liveLot.received_quantity);
    return {
      ...row,
      source:"Workbook + NFOS",
      record_key:`workbook-${row.source_row}`,
      quantity_received:received,
      total_cost:liveLot.received_total_cost ?? row.total_cost,
      cost_per_unit:received > 0 && liveLot.received_total_cost != null
        ? Number(liveLot.received_total_cost) / received
        : row.cost_per_unit,
      used_quantity:received == null || remaining == null ? row.used_quantity : Math.max(received - remaining, 0),
      remaining_quantity:remaining,
      storage:current?.locations?.size ? [...current.locations].join(", ") : row.storage,
    };
  }), [liveByWorkbookKey, balanceMap]);

  const workbookKeys = useMemo(
    () => new Set(workbookReceivingHistory.map((row)=>keyFor(row.item_name,row.lot_number))),
    []
  );

  const liveOnlyRows = useMemo(() => lots
    .filter((lot) => {
      const item=itemMap[lot.item_id];
      return item && !workbookKeys.has(keyFor(item.name,lot.lot_code));
    })
    .map((lot) => {
      const item=itemMap[lot.item_id];
      const supplier=supplierMap[lot.supplier_id];
      const current=balanceMap.get(lot.id);
      const received=lot.received_quantity == null ? null : Number(lot.received_quantity);
      const remaining=current ? current.remaining : null;
      return {
        record_key:`live-${lot.id}`,
        source:"NFOS",
        received_date:lot.received_at ? String(lot.received_at).slice(0,10) : null,
        item_type:typeLabel(item.item_type),
        item_name:item.name,
        brand:supplier?.name || null,
        vendor_category:supplier?.category || null,
        lot_number:lot.lot_code,
        size_label:item.size_label,
        quantity_received:received,
        total_cost:lot.received_total_cost,
        cost_per_unit:received > 0 && lot.received_total_cost != null ? Number(lot.received_total_cost)/received : null,
        used_quantity:received == null || remaining == null ? null : Math.max(received-remaining,0),
        remaining_quantity:remaining,
        storage:current?.locations?.size ? [...current.locations].join(", ") : locationMap[item.default_location_id]?.name || null,
        notes:lot.notes,
      };
    }), [lots,itemMap,supplierMap,balanceMap,locationMap,workbookKeys]);

  const allRows = useMemo(
    () => [...workbookRows,...liveOnlyRows].sort((a,b)=>String(b.received_date||"").localeCompare(String(a.received_date||""))),
    [workbookRows,liveOnlyRows]
  );

  const filtered = useMemo(() => allRows.filter((row) => {
    if (source !== "all" && row.source !== source) return false;
    const hay = `${row.received_date||""} ${row.item_type||""} ${row.item_name||""} ${row.brand||""} ${row.vendor_category||""} ${row.lot_number||""} ${row.storage||""} ${row.notes||""}`.toLowerCase();
    return hay.includes(search.toLowerCase());
  }), [allRows,source,search]);

  const selected=items.find((row)=>row.id===form.itemId);
  const selectedSupplier=suppliers.find((row)=>row.id===form.supplierId);

  const submit=async(event)=>{
    event.preventDefault();
    setBusy(true);setError("");setSuccess("");
    try{
      const result=await nfos.receiveItem({
        ...form,
        receivedAt:form.receivedAt ? new Date(form.receivedAt).toISOString() : new Date().toISOString(),
      });
      setSuccess(`Received ${form.quantity} ${selected?.stocking_unit || "units"} of ${selected?.name || "item"}${result?.lot_code ? ` • Lot ${result.lot_code}` : ""}.`);
      setForm((current)=>({...current,quantity:"",lotCode:"",supplierLotCode:"",totalCost:"",notes:"",receivedAt:localDateTime()}));
      await onDone?.();
      await loadBalances();
      setMode("log");
    }catch(err){setError(err?.message || "Could not receive inventory.");}
    finally{setBusy(false);}
  };

  return <>
    <div className="nfos-workbook-view-switch">
      <button className={`nfos-btn ${mode==="log"?"":"secondary"}`} onClick={()=>setMode("log")}>Receiving Log</button>
      <button className={`nfos-btn ${mode==="new"?"":"secondary"}`} onClick={()=>setMode("new")}>Receive New Inventory</button>
    </div>

    {mode==="log" ? <div className="nfos-card">
      <div className="nfos-page-head">
        <div>
          <h2>Receiving Log</h2>
          <p>Matches the workbook Receiving tab: historical receipts plus new NFOS lots in one ledger.</p>
        </div>
        <span className="nfos-pill ok">{filtered.length} rows</span>
      </div>
      <div className="nfos-filterbar">
        <input placeholder="Search item, supplier, lot, storage or notes…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
        <select value={source} onChange={(e)=>setSource(e.target.value)}>
          <option value="all">All history</option>
          <option value="Workbook history">Workbook history</option>
          <option value="Workbook + NFOS">Workbook + NFOS</option>
          <option value="NFOS">NFOS only</option>
        </select>
      </div>
      <div className="nfos-table-wrap nfos-workbook-ledger">
        <table className="nfos-table nfos-receiving-ledger">
          <thead><tr>
            <th>Date</th><th>Item Type</th><th>Item</th><th>Brand / Supplier</th><th>Vendor Category</th>
            <th>Lot Number</th><th>Size</th><th>Qty Received</th><th>Total Cost</th><th>Cost / Unit</th>
            <th>Used</th><th>Remaining</th><th>Storage</th><th>Notes</th>
          </tr></thead>
          <tbody>{filtered.map((row)=><tr key={row.record_key}>
            <td>{row.received_date || "—"}<div className="nfos-muted nfos-small">{row.source}</div></td>
            <td>{row.item_type || "—"}</td>
            <td><strong>{row.item_name}</strong></td>
            <td>{row.brand || "—"}</td>
            <td>{row.vendor_category || "—"}</td>
            <td className="nfos-mono">{row.lot_number || "—"}</td>
            <td>{row.size_label || "—"}</td>
            <td>{qty(row.quantity_received)}</td>
            <td>{money(row.total_cost)}</td>
            <td>{money(row.cost_per_unit)}</td>
            <td>{qty(row.used_quantity)}</td>
            <td>{qty(row.remaining_quantity)}</td>
            <td>{row.storage || "—"}</td>
            <td>{row.notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div> : <div className="nfos-card">
      <h2>Receive inventory</h2>
      <p className="nfos-muted">The fields mirror the workbook, but new receipts also write to the NFOS inventory ledger and lot traceability.</p>
      {error&&<div className="nfos-error">{error}</div>}
      {success&&<div className="nfos-success">{success}</div>}
      <form className="nfos-form" onSubmit={submit}>
        <div className="nfos-field full"><label>Item</label><select required value={form.itemId} onChange={(e)=>{
          const item=items.find((x)=>x.id===e.target.value);
          setForm({...form,itemId:e.target.value,supplierId:item?.preferred_supplier_id || ""});
        }}><option value="">Choose item…</option>{items.filter((x)=>x.active).map((x)=><option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}</select></div>
        <div className="nfos-field"><label>Item type</label><input disabled value={selected ? typeLabel(selected.item_type) : "—"}/></div>
        <div className="nfos-field"><label>Size</label><input disabled value={selected?.size_label || selected?.stocking_unit || "—"}/></div>
        <div className="nfos-field"><label>Quantity received</label><input type="number" min="0.0001" step="any" required value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></div>
        <div className="nfos-field"><label>Storage location</label><select required value={form.locationId} onChange={(e)=>setForm({...form,locationId:e.target.value})}>{locations.filter((x)=>x.active).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field"><label>Brand / Supplier</label><select value={form.supplierId} onChange={(e)=>setForm({...form,supplierId:e.target.value})}><option value="">Not specified</option>{suppliers.filter((x)=>x.active).map((x)=><option key={x.id} value={x.id}>{x.name}{x.category ? ` · ${x.category}` : ""}</option>)}</select></div>
        <div className="nfos-field"><label>Vendor category</label><input disabled value={selectedSupplier?.category || "—"}/></div>
        <div className="nfos-field"><label>Received date / time</label><input type="datetime-local" value={form.receivedAt} onChange={(e)=>setForm({...form,receivedAt:e.target.value})}/></div>
        <div className="nfos-field"><label>Lot number</label><input value={form.lotCode} onChange={(e)=>setForm({...form,lotCode:e.target.value})} placeholder={selected?.track_lots ? "Required / auto if blank" : "Optional"}/></div>
        <div className="nfos-field"><label>Supplier lot code</label><input value={form.supplierLotCode} onChange={(e)=>setForm({...form,supplierLotCode:e.target.value})}/></div>
        <div className="nfos-field"><label>Total cost</label><input type="number" min="0" step="0.01" value={form.totalCost} onChange={(e)=>setForm({...form,totalCost:e.target.value})}/></div>
        <div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></div>
        <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>{busy?"Saving…":"Receive inventory"}</button></div>
      </form>
    </div>}
  </>;
}
