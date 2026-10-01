import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NfosBarcode from "../components/NfosBarcode";
import NfosCameraScanner from "../components/NfosCameraScanner";
import { ProductionModule, RecipesModule, TraceabilityModule } from "../components/NfosProduction";
import * as nfos from "../lib/nfosApi";
import NfosSystemHealth from "../components/NfosSystemHealth";
import NfosReports from "../components/NfosReports";
import NfosMarkets from "../components/NfosMarkets";
import NfosNotificationCenter from "../components/NfosNotificationCenter";
import NfosPurchasing from "../components/NfosPurchasing";
import { NfosTodayDashboard, NfosOperationsCalendar } from "../components/NfosActionDashboard";
import NfosTeamAccountability from "../components/NfosTeamAccountability";
import NfosEmployeePortal from "../components/NfosEmployeePortal";
import useNfosResponsiveTables from "../lib/useNfosResponsiveTables";
import "../styles/nfos.css";

const TABS = [
  ["overview", "Today"],
  ["health", "System Health"],
  ["reports", "Reports"],
  ["markets", "Markets"],
  ["notifications", "Notifications"],
  ["calendar", "Calendar"],
  ["team", "Team"],
  ["inventory", "Inventory"],
  ["receive", "Receive"],
  ["move", "Adjust / Transfer"],
  ["items", "Items"],
  ["locations", "Locations"],
  ["suppliers", "Suppliers"],
  ["purchasing", "Purchasing"],
  ["recipes", "Recipes"],
  ["production", "Production"],
  ["traceability", "Traceability"],
  ["barcodes", "Barcodes"],
  ["history", "History"],
];

const typeLabel = (type) =>
  ({ finished_good: "Finished", material: "Ingredient", packaging: "Packaging" }[type] || type);

const qty = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const money = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, { style: "currency", currency: "USD" });
};

const localDateTime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function AdminLogin({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await nfos.signInAdmin(email, password);
      onSignedIn(session);
    } catch (err) {
      setError(err?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nfos-login">
      <div className="nfos-login-card">
        <div className="nfos-brand">
          <div className="nfos-mark">NF</div>
          <div>
            <div className="nfos-brand-title">NECTARFUSIONS</div>
            <div className="nfos-brand-sub">Operations System</div>
          </div>
        </div>
        <h1 style={{ marginTop: 22 }}>Admin Operations</h1>
        <p className="nfos-muted">Use your existing NectarFusions admin account.</p>
        {error && <div className="nfos-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="nfos-field">
            <label>Email</label>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="nfos-field">
            <label>Password</label>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="nfos-btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </div>
  );
}

function Empty({ children = "Nothing to show yet." }) {
  return <div className="nfos-empty">{children}</div>;
}

function Overview({ inventory, lowStock, setTab }) {
  const totals = useMemo(() => {
    const byType = { finished_good: 0, material: 0, packaging: 0 };
    inventory.forEach((row) => {
      byType[row.item_type] = (byType[row.item_type] || 0) + Number(row.company_on_hand || 0);
    });
    return byType;
  }, [inventory]);

  return (
    <>
      <div className="nfos-grid four" style={{ marginBottom: 16 }}>
        <div className="nfos-stat"><div className="nfos-stat-label">Finished jars</div><div className="nfos-stat-value">{qty(totals.finished_good)}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Active ingredients</div><div className="nfos-stat-value">{inventory.filter((row) => row.item_type === "material" && row.active).length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Packaging units</div><div className="nfos-stat-value">{qty(totals.packaging)}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Needs attention</div><div className="nfos-stat-value">{lowStock.length}</div></div>
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div><h2>Needs attention</h2><p>Items at or below their reorder or production threshold.</p></div>
          <button className="nfos-btn secondary" onClick={() => setTab("inventory")}>Open inventory</button>
        </div>
        {lowStock.length === 0 ? <Empty>Everything is above its current threshold.</Empty> : (
          <div className="nfos-table-wrap">
            <table className="nfos-table">
              <thead><tr><th>Item</th><th>SKU</th><th>Available</th><th>Threshold</th><th>Action</th><th>Suggested Qty</th></tr></thead>
              <tbody>{lowStock.map((row) => (
                <tr key={row.item_id}>
                  <td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{typeLabel(row.item_type)}</div></td>
                  <td className="nfos-mono">{row.sku}</td>
                  <td>{qty(row.planning_on_hand)} {row.stocking_unit}</td>
                  <td>{qty(row.reorder_point)}</td>
                  <td><span className="nfos-pill low">{row.suggested_action}</span></td>
                  <td><strong>{qty(row.suggested_quantity)}</strong></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="nfos-grid two">
        <div className="nfos-card">
          <h3>Quick actions</h3>
          <p className="nfos-muted">Record what happened once. NFOS handles the inventory movement behind it.</p>
          <div className="nfos-inline-actions">
            <button className="nfos-btn" onClick={() => setTab("receive")}>Receive inventory</button>
            <button className="nfos-btn secondary" onClick={() => setTab("move")}>Adjust / transfer</button>
            <button className="nfos-btn secondary" onClick={() => setTab("purchasing")}>Purchasing</button>
            <button className="nfos-btn secondary" onClick={() => setTab("production")}>Production</button>
            <button className="nfos-btn ghost" onClick={() => setTab("barcodes")}>Scan barcode</button>
          </div>
        </div>
        <div className="nfos-card">
          <h3>Release 2 status</h3>
          <div className="nfos-note">
            NFOS now connects inventory with versioned recipes, production orders, batches, quality checks, source lots, finished lots and batch barcodes. Complete a batch once and the inventory ledger updates behind it.
          </div>
        </div>
      </div>
    </>
  );
}

function Inventory({ inventory, onSelectBarcode }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const rows = useMemo(() => inventory.filter((row) => {
    const hay = `${row.name} ${row.sku} ${row.category || ""}`.toLowerCase();
    return (type === "all" || row.item_type === type) && hay.includes(search.toLowerCase());
  }), [inventory, search, type]);

  return (
    <div className="nfos-card">
      <div className="nfos-filterbar">
        <input placeholder="Search item, SKU or category" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All inventory</option><option value="finished_good">Finished goods</option><option value="material">Ingredients</option><option value="packaging">Packaging</option>
        </select>
        <span className="nfos-muted nfos-small">{rows.length} records</span>
      </div>
      <div className="nfos-table-wrap">
        <table className="nfos-table">
          <thead><tr><th>Item</th><th>SKU</th><th>Type</th><th>Company On Hand</th><th>Online</th><th>Reorder</th><th>Target</th><th>Status</th><th>Barcode</th></tr></thead>
          <tbody>{rows.map((row) => {
            const threshold = row.reorder_point == null ? null : Number(row.reorder_point);
            const planning = Number(row.planning_on_hand || 0);
            const isLow = threshold != null && planning <= threshold;
            return <tr key={row.item_id}>
              <td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{row.category || "—"}</div></td>
              <td className="nfos-mono">{row.sku}</td>
              <td>{typeLabel(row.item_type)}</td>
              <td>{qty(row.company_on_hand)} {row.stocking_unit}</td>
              <td>{row.item_type === "finished_good" ? qty(row.online_on_hand) : "—"}</td>
              <td>{row.reorder_point == null ? "—" : qty(row.reorder_point)}</td>
              <td>{row.target_stock == null ? "—" : qty(row.target_stock)}</td>
              <td><span className={`nfos-pill ${isLow ? "low" : "ok"}`}>{isLow ? "LOW" : "OK"}</span></td>
              <td><button className="nfos-btn ghost" type="button" onClick={() => onSelectBarcode(row)}>View</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

function Receive({ items, locations, suppliers, onDone }) {
  const [form, setForm] = useState({ itemId:"", locationId:"", supplierId:"", quantity:"", lotCode:"", supplierLotCode:"", totalCost:"", receivedAt:localDateTime(), notes:"" });
  const [busy, setBusy] = useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const selected = items.find((x) => x.id === form.itemId);
  useEffect(() => {
    setForm((f) => ({ ...f, locationId: f.locationId || locations.find((x)=>x.code==="MAIN")?.id || locations[0]?.id || "" }));
  }, [locations]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const result = await nfos.receiveItem({ ...form, receivedAt: form.receivedAt ? new Date(form.receivedAt).toISOString() : new Date().toISOString() });
      setSuccess(`Received ${form.quantity} ${selected?.stocking_unit || "units"} of ${selected?.name || "item"}${result?.lot_code ? ` • Lot ${result.lot_code}` : ""}.`);
      setForm((f)=>({ ...f, quantity:"", lotCode:"", supplierLotCode:"", totalCost:"", notes:"", receivedAt:localDateTime() }));
      await onDone();
    } catch (err) { setError(err?.message || "Could not receive inventory."); } finally { setBusy(false); }
  };

  return <div className="nfos-card">
    <h2>Receive inventory</h2><p className="nfos-muted">Use this when honey, ingredients, packaging or other tracked inventory physically arrives.</p>
    {error && <div className="nfos-error">{error}</div>}{success && <div className="nfos-success">{success}</div>}
    <form className="nfos-form" onSubmit={submit}>
      <div className="nfos-field full"><label>Item</label><select required value={form.itemId} onChange={(e)=>setForm({...form,itemId:e.target.value,supplierId:items.find(x=>x.id===e.target.value)?.preferred_supplier_id || ""})}><option value="">Choose item…</option>{items.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}</select></div>
      <div className="nfos-field"><label>Quantity received</label><input type="number" min="0.0001" step="any" required value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></div>
      <div className="nfos-field"><label>Unit</label><input disabled value={selected?.stocking_unit || "—"}/></div>
      <div className="nfos-field"><label>Location</label><select required value={form.locationId} onChange={(e)=>setForm({...form,locationId:e.target.value})}>{locations.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="nfos-field"><label>Supplier</label><select value={form.supplierId} onChange={(e)=>setForm({...form,supplierId:e.target.value})}><option value="">Not specified</option>{suppliers.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      <div className="nfos-field"><label>Received date / time</label><input type="datetime-local" value={form.receivedAt} onChange={(e)=>setForm({...form,receivedAt:e.target.value})}/></div>
      <div className="nfos-field"><label>Total cost</label><input type="number" min="0" step="0.01" placeholder="Optional" value={form.totalCost} onChange={(e)=>setForm({...form,totalCost:e.target.value})}/></div>
      <div className="nfos-field"><label>NFOS lot code {selected?.track_lots ? "(tracked)" : "(optional)"}</label><input value={form.lotCode} placeholder={selected?.track_lots ? "Leave blank to auto-generate" : "Optional"} onChange={(e)=>setForm({...form,lotCode:e.target.value})}/></div>
      <div className="nfos-field"><label>Supplier lot code</label><input value={form.supplierLotCode} onChange={(e)=>setForm({...form,supplierLotCode:e.target.value})}/></div>
      <div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></div>
      <div className="nfos-field full"><div className="nfos-inline-actions"><button className="nfos-btn" disabled={busy}>{busy ? "Saving…" : "Receive inventory"}</button>{selected?.track_lots && <span className="nfos-pill ok">Lot tracking enabled</span>}</div></div>
    </form>
  </div>;
}

function MoveInventory({ items, locations, lots, onDone }) {
  const [mode,setMode]=useState("adjust");
  const [form,setForm]=useState({itemId:"",quantity:"",direction:"add",locationId:"",fromLocationId:"",toLocationId:"",lotId:"",reason:"Physical count",notes:""});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  useEffect(()=>{ const main=locations.find(x=>x.code==="MAIN")?.id || locations[0]?.id || ""; setForm(f=>({...f,locationId:f.locationId||main,fromLocationId:f.fromLocationId||main})); },[locations]);
  const itemLots = lots.filter(l=>l.item_id===form.itemId);
  const submit=async(e)=>{e.preventDefault();setBusy(true);setError("");setSuccess("");try{
    if(mode==="adjust") await nfos.adjustInventory(form); else await nfos.transferInventory(form);
    setSuccess(mode==="adjust"?"Inventory adjustment recorded.":"Inventory transfer recorded.");
    setForm(f=>({...f,quantity:"",notes:"",referenceId:""})); await onDone();
  }catch(err){setError(err?.message||"Could not record inventory movement.");}finally{setBusy(false);}};
  return <div className="nfos-card"><div className="nfos-inline-actions" style={{marginBottom:14}}><button type="button" className={`nfos-btn ${mode==="adjust"?"":"secondary"}`} onClick={()=>setMode("adjust")}>Adjustment</button><button type="button" className={`nfos-btn ${mode==="transfer"?"":"secondary"}`} onClick={()=>setMode("transfer")}>Transfer</button></div>
    {error&&<div className="nfos-error">{error}</div>}{success&&<div className="nfos-success">{success}</div>}
    <form className="nfos-form" onSubmit={submit}>
      <div className="nfos-field full"><label>Item</label><select required value={form.itemId} onChange={e=>setForm({...form,itemId:e.target.value,lotId:""})}><option value="">Choose item…</option>{items.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}</select></div>
      <div className="nfos-field"><label>Quantity</label><input required type="number" min="0.0001" step="any" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></div>
      <div className="nfos-field"><label>Lot</label><select value={form.lotId} onChange={e=>setForm({...form,lotId:e.target.value})}><option value="">Any / not lot-specific</option>{itemLots.map(l=><option key={l.id} value={l.id}>{l.lot_code}</option>)}</select></div>
      {mode==="adjust" ? <>
        <div className="nfos-field"><label>Direction</label><select value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="add">Add</option><option value="remove">Remove</option></select></div>
        <div className="nfos-field"><label>Location</label><select required value={form.locationId} onChange={e=>setForm({...form,locationId:e.target.value})}>{locations.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Reason</label><select value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}><option>Physical count</option><option>Damage</option><option>Sample / giveaway</option><option>Spill / waste</option><option>Return</option><option>Correction</option><option>Other</option></select></div>
      </> : <>
        <div className="nfos-field"><label>From</label><select required value={form.fromLocationId} onChange={e=>setForm({...form,fromLocationId:e.target.value})}>{locations.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field"><label>To</label><select required value={form.toLocationId} onChange={e=>setForm({...form,toLocationId:e.target.value})}><option value="">Choose destination…</option>{locations.filter(x=>x.active && x.id!==form.fromLocationId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      </>}
      <div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
      <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>{busy?"Saving…":mode==="adjust"?"Record adjustment":"Record transfer"}</button></div>
    </form>
  </div>;
}

function Items({ items, suppliers, locations, onDone, onSelectBarcode }) {
  const [search,setSearch]=useState(""); const [selectedId,setSelectedId]=useState("");
  const selected=items.find(x=>x.id===selectedId);
  const [draft,setDraft]=useState(null); const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  useEffect(()=>{ if(selected) setDraft({...selected}); },[selectedId, selected]);
  const rows=items.filter(x=>`${x.name} ${x.sku}`.toLowerCase().includes(search.toLowerCase()));
  const save=async()=>{setBusy(true);setError("");setMessage("");try{await nfos.updateItem(selected.id,{reorder_point:draft.reorder_point===""?null:Number(draft.reorder_point),target_stock:draft.target_stock===""?null:Number(draft.target_stock),preferred_order_qty:draft.preferred_order_qty===""?null:Number(draft.preferred_order_qty),preferred_supplier_id:draft.preferred_supplier_id||null,default_location_id:draft.default_location_id||null,active:Boolean(draft.active),notes:draft.notes||null});setMessage("Item settings saved.");await onDone();}catch(e){setError(e?.message||"Could not update item.");}finally{setBusy(false);}};
  return <div className="nfos-grid two">
    <div className="nfos-card"><div className="nfos-filterbar"><input placeholder="Search items" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Item</th><th>Type</th><th>SKU</th></tr></thead><tbody>{rows.map(x=><tr key={x.id} onClick={()=>setSelectedId(x.id)} style={{cursor:"pointer",background:selectedId===x.id?"#eef6f7":undefined}}><td><strong>{x.name}</strong></td><td>{typeLabel(x.item_type)}</td><td className="nfos-mono">{x.sku}</td></tr>)}</tbody></table></div></div>
    <div className="nfos-card">{!draft?<Empty>Select an item to manage its operating rules.</Empty>:<>
      <h2>{draft.name}</h2><div className="nfos-muted nfos-mono" style={{marginBottom:14}}>{draft.sku}</div>{error&&<div className="nfos-error">{error}</div>}{message&&<div className="nfos-success">{message}</div>}
      <div className="nfos-form">
        <div className="nfos-field"><label>Reorder / make point</label><input type="number" step="any" value={draft.reorder_point??""} onChange={e=>setDraft({...draft,reorder_point:e.target.value})}/></div>
        <div className="nfos-field"><label>Target stock</label><input type="number" step="any" value={draft.target_stock??""} onChange={e=>setDraft({...draft,target_stock:e.target.value})}/></div>
        <div className="nfos-field"><label>Preferred order qty</label><input type="number" step="any" value={draft.preferred_order_qty??""} onChange={e=>setDraft({...draft,preferred_order_qty:e.target.value})}/></div>
        <div className="nfos-field"><label>Default location</label><select value={draft.default_location_id||""} onChange={e=>setDraft({...draft,default_location_id:e.target.value})}><option value="">None</option>{locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Preferred supplier</label><select value={draft.preferred_supplier_id||""} onChange={e=>setDraft({...draft,preferred_supplier_id:e.target.value})}><option value="">None</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Notes</label><textarea value={draft.notes||""} onChange={e=>setDraft({...draft,notes:e.target.value})}/></div>
        <div className="nfos-field full"><label><input type="checkbox" checked={Boolean(draft.active)} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Active</label></div>
      </div>
      <div className="nfos-inline-actions" style={{marginTop:14}}><button className="nfos-btn" onClick={save} disabled={busy}>{busy?"Saving…":"Save rules"}</button><button className="nfos-btn ghost" onClick={()=>onSelectBarcode(draft)}>Barcode</button></div>
    </>}</div>
  </div>;
}

function Locations({ locations, onDone }) {
  const [form,setForm]=useState({code:"",name:"",locationType:"market",countsAsCompanyInventory:true,availableToSellOnline:false,notes:""}); const [error,setError]=useState(""),[message,setMessage]=useState("");
  const submit=async(e)=>{e.preventDefault();setError("");setMessage("");try{await nfos.createLocation(form);setMessage("Location created.");setForm({...form,code:"",name:"",notes:""});await onDone();}catch(err){setError(err?.message||"Could not create location.");}};
  return <div className="nfos-grid two"><div className="nfos-card"><h2>Inventory locations</h2><div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Code</th><th>Location</th><th>Type</th><th>Company inventory?</th><th>Online?</th></tr></thead><tbody>{locations.map(x=><tr key={x.id}><td className="nfos-mono">{x.code}</td><td><strong>{x.name}</strong></td><td>{x.location_type}</td><td>{x.counts_as_company_inventory?"Yes":"No"}</td><td>{x.available_to_sell_online?"Yes":"No"}</td></tr>)}</tbody></table></div></div>
    <div className="nfos-card"><h2>Add location</h2>{error&&<div className="nfos-error">{error}</div>}{message&&<div className="nfos-success">{message}</div>}<form className="nfos-form" onSubmit={submit}><div className="nfos-field"><label>Code</label><input required placeholder="BAYCITY" value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></div><div className="nfos-field"><label>Name</label><input required placeholder="Bay City Market" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div className="nfos-field full"><label>Type</label><select value={form.locationType} onChange={e=>setForm({...form,locationType:e.target.value})}><option value="facility">Facility</option><option value="storage">Storage</option><option value="market">Market</option><option value="vehicle">Vehicle</option><option value="retailer_consignment">Retailer consignment</option><option value="other">Other</option></select></div><div className="nfos-field full"><label><input type="checkbox" checked={form.countsAsCompanyInventory} onChange={e=>setForm({...form,countsAsCompanyInventory:e.target.checked})}/> Counts as NectarFusions-owned inventory</label></div><div className="nfos-field full"><label><input type="checkbox" checked={form.availableToSellOnline} onChange={e=>setForm({...form,availableToSellOnline:e.target.checked})}/> Can feed public website availability</label></div><div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div><div className="nfos-field full"><button className="nfos-btn">Create location</button></div></form></div></div>;
}

function Suppliers({ suppliers, onDone }) {
  const [form,setForm]=useState({name:"",vendorCode:"",category:"",contactName:"",phone:"",email:"",productsSupplied:"",preferred:false,notes:""}); const [error,setError]=useState(""),[message,setMessage]=useState("");
  const submit=async(e)=>{e.preventDefault();setError("");setMessage("");try{await nfos.createSupplier(form);setMessage("Supplier created.");setForm({name:"",vendorCode:"",category:"",contactName:"",phone:"",email:"",productsSupplied:"",preferred:false,notes:""});await onDone();}catch(err){setError(err?.message||"Could not create supplier.");}};
  return <div className="nfos-grid two"><div className="nfos-card"><h2>Suppliers</h2><div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Supplier</th><th>Code</th><th>Category</th><th>Preferred</th></tr></thead><tbody>{suppliers.map(x=><tr key={x.id}><td><strong>{x.name}</strong><div className="nfos-muted nfos-small">{x.email||x.phone||""}</div></td><td>{x.vendor_code||"—"}</td><td>{x.category||"—"}</td><td>{x.preferred?"Yes":""}</td></tr>)}</tbody></table></div></div><div className="nfos-card"><h2>Add supplier</h2>{error&&<div className="nfos-error">{error}</div>}{message&&<div className="nfos-success">{message}</div>}<form className="nfos-form" onSubmit={submit}><div className="nfos-field full"><label>Supplier name</label><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div className="nfos-field"><label>Vendor code</label><input value={form.vendorCode} onChange={e=>setForm({...form,vendorCode:e.target.value})}/></div><div className="nfos-field"><label>Category</label><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></div><div className="nfos-field"><label>Contact</label><input value={form.contactName} onChange={e=>setForm({...form,contactName:e.target.value})}/></div><div className="nfos-field"><label>Phone</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div><div className="nfos-field full"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div><div className="nfos-field full"><label>Products supplied</label><input value={form.productsSupplied} onChange={e=>setForm({...form,productsSupplied:e.target.value})}/></div><div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div><div className="nfos-field full"><button className="nfos-btn">Create supplier</button></div></form></div></div>;
}

function Barcodes({ items, lots, initial, clearInitial, onFoundEntity }) {
  const [scan,setScan]=useState("");
  const [found,setFound]=useState(null);
  const [error,setError]=useState("");
  const [lookupBusy,setLookupBusy]=useState(false);
  const [cameraOpen,setCameraOpen]=useState(false);
  const inputRef=useRef(null);
  const [selectedItemId,setSelectedItemId]=useState("");

  useEffect(()=>{
    if(initial?.barcode_value){
      setFound({
        entity_type:"item",
        entity_id:initial.item_id||initial.id,
        barcode_value:initial.barcode_value,
        label:initial.name,
        subtitle:initial.sku
      });
      setSelectedItemId(initial.item_id||initial.id);
      clearInitial?.();
    }
  },[initial,clearInitial]);

  useEffect(()=>{inputRef.current?.focus();},[]);

  const lookupValue=async(value,{source="manual"}={})=>{
    const code=String(value||"").trim();
    if(!code)return;

    setError("");
    setLookupBusy(true);
    try{
      const result=await nfos.lookupBarcode(code);
      if(!result){
        setFound(null);
        setError(`Barcode ${code} was not found in NFOS.`);
        return;
      }

      setFound(result);
      if(source==="camera") onFoundEntity?.(result);
    }catch(err){
      setError(err?.message||"Could not look up barcode.");
    }finally{
      setLookupBusy(false);
    }
  };

  const lookup=async(e)=>{
    e?.preventDefault();
    const code=scan;
    setScan("");
    await lookupValue(code);
  };

  const cameraDetected=async(value)=>{
    setCameraOpen(false);
    setScan(value);
    await lookupValue(value,{source:"camera"});
    setScan("");
  };

  const selected=items.find(x=>x.id===selectedItemId);
  const entityLabel=found?.entity_type==="batch"?"Production batch":found?.entity_type==="lot"?"Inventory lot":found?.entity_type==="item"?"NFOS item":"NFOS record";

  return <>
    <div className="nfos-card">
      <div className="nfos-split-head">
        <div>
          <h2>Scan / look up</h2>
          <p className="nfos-muted">Use your phone camera, a USB/Bluetooth scanner, or type an NFOS barcode manually.</p>
        </div>
        <button className="nfos-btn" type="button" onClick={()=>setCameraOpen((open)=>!open)}>
          {cameraOpen?"Close camera":"Scan with phone camera"}
        </button>
      </div>

      {cameraOpen&&<NfosCameraScanner onDetected={cameraDetected} onClose={()=>setCameraOpen(false)}/>}

      <form className="nfos-scan" onSubmit={lookup} style={{marginTop:cameraOpen?14:0}}>
        <input
          ref={inputRef}
          value={scan}
          onChange={e=>setScan(e.target.value)}
          placeholder="Scan or type NFOS barcode…"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
        />
        <button className="nfos-btn" disabled={lookupBusy}>{lookupBusy?"Looking up…":"Look up"}</button>
      </form>

      {error&&<div className="nfos-error" style={{marginTop:12}}>{error}</div>}

      {found&&<div className="nfos-scan-result">
        <div className="nfos-split-head">
          <div>
            <span className="nfos-pill ok">{entityLabel}</span>
            <h3 style={{margin:"8px 0 3px"}}>{found.label}</h3>
            <div className="nfos-muted">{found.subtitle||""}</div>
          </div>
          <div className="nfos-mono">{found.barcode_value}</div>
        </div>
        <div style={{marginTop:14}}>
          <NfosBarcode value={found.barcode_value} title={found.label} subtitle={found.subtitle}/>
        </div>
        {found.entity_type==="batch"&&<div className="nfos-note" style={{marginTop:12}}>Batch scans from the phone camera open this batch directly in Traceability.</div>}
      </div>}
    </div>

    <div className="nfos-grid two">
      <div className="nfos-card">
        <h2>Item labels</h2>
        <div className="nfos-field">
          <label>Choose item</label>
          <select value={selectedItemId} onChange={e=>setSelectedItemId(e.target.value)}>
            <option value="">Choose item…</option>
            {items.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}
          </select>
        </div>
        {selected&&<div style={{marginTop:16}}><NfosBarcode value={selected.barcode_value} title={selected.name} subtitle={selected.sku}/></div>}
      </div>

      <div className="nfos-card">
        <h2>Lot labels</h2>
        {lots.length===0?<Empty>No lots have been received yet.</Empty>:<div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Lot</th><th>Received</th><th>Label</th></tr></thead><tbody>{lots.slice(0,40).map(l=>{const item=items.find(i=>i.id===l.item_id);return <tr key={l.id}><td><strong>{l.lot_code}</strong><div className="nfos-muted nfos-small">{item?.name||""}</div></td><td>{l.received_at?new Date(l.received_at).toLocaleDateString():"—"}</td><td><NfosBarcode compact value={l.barcode_value} /></td></tr>})}</tbody></table></div>}
      </div>
    </div>

    <div className="nfos-note">NFOS barcodes are internal Code 128 operational identifiers. Phone scanning recognizes item, lot and production-batch barcodes. They are not GS1 retail UPC/GTIN codes for grocery checkout.</div>
  </>;
}


function History({ transactions, items, locations, lots }) {
  const itemMap=useMemo(()=>Object.fromEntries(items.map(x=>[x.id,x])),[items]); const locMap=useMemo(()=>Object.fromEntries(locations.map(x=>[x.id,x])),[locations]); const lotMap=useMemo(()=>Object.fromEntries(lots.map(x=>[x.id,x])),[lots]);
  return <div className="nfos-card"><h2>Inventory ledger</h2><p className="nfos-muted">Every inventory change has a reason and direction. This becomes the audit trail behind the on-hand number.</p><div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Date</th><th>Item</th><th>Movement</th><th>Qty</th><th>From</th><th>To</th><th>Lot</th><th>Source</th></tr></thead><tbody>{transactions.map(t=><tr key={t.id}><td>{new Date(t.occurred_at).toLocaleString()}</td><td><strong>{itemMap[t.item_id]?.name||t.item_id}</strong><div className="nfos-mono nfos-muted">{itemMap[t.item_id]?.sku||""}</div></td><td>{t.movement_type}</td><td>{qty(t.quantity)}</td><td>{locMap[t.from_location_id]?.name||"—"}</td><td>{locMap[t.to_location_id]?.name||"—"}</td><td>{lotMap[t.lot_id]?.lot_code||"—"}</td><td>{t.source}</td></tr>)}</tbody></table></div></div>;
}

export default function AdminOperationsPage() {
  useNfosResponsiveTables();
  const [authState,setAuthState]=useState("loading"); const [session,setSession]=useState(null);
  const [employeeAccess,setEmployeeAccess]=useState(null);
  const [tab,setTab]=useState("overview"); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const [inventory,setInventory]=useState([]),[lowStock,setLowStock]=useState([]),[items,setItems]=useState([]),[locations,setLocations]=useState([]),[suppliers,setSuppliers]=useState([]),[lots,setLots]=useState([]),[transactions,setTransactions]=useState([]);
  const [barcodeInitial,setBarcodeInitial]=useState(null);
  const [traceabilityInitialBatchId,setTraceabilityInitialBatchId]=useState("");

  const refresh=useCallback(async()=>{setBusy(true);setError("");try{const [inventoryRows,lowRows,itemRows,locationRows,supplierRows,lotRows,txRows]=await Promise.all([nfos.listInventory(),nfos.listLowStock(),nfos.listItems(),nfos.listLocations(),nfos.listSuppliers(),nfos.listLots(),nfos.listTransactions()]);setInventory(inventoryRows||[]);setLowStock(lowRows||[]);setItems(itemRows||[]);setLocations(locationRows||[]);setSuppliers(supplierRows||[]);setLots(lotRows||[]);setTransactions(txRows||[]);}catch(err){setError(err?.message||"Could not load NFOS.");}finally{setBusy(false);}},[]);

  useEffect(()=>{let alive=true;(async()=>{try{const s=await nfos.getSession();if(!alive)return;if(!s){setAuthState("signed_out");return;}const admin=await nfos.isAdmin();if(!alive)return;setSession(s);if(admin){setEmployeeAccess(null);setAuthState("ready");return;}try{const access=await nfos.getEmployeeAccess();if(!alive)return;if(access?.permissions?.includes("ops.view")){setEmployeeAccess(access);setAuthState("employee");return;}}catch{}setAuthState("signed_out");}catch{if(alive)setAuthState("signed_out");}})();return()=>{alive=false};},[]);
  useEffect(()=>{if(authState==="ready") refresh();},[authState,refresh]);

  const chooseBarcode=(row)=>{setBarcodeInitial(row);setTab("barcodes");};
  const handleScannedEntity=(found)=>{if(found?.entity_type==="batch"){setTraceabilityInitialBatchId(found.entity_id);setTab("traceability");}};
  const logout=async()=>{await nfos.signOutAdmin();setSession(null);setEmployeeAccess(null);setAuthState("signed_out");};

  if(authState==="loading") return <div className="nfos-login"><div className="nfos-login-card"><h2>Loading NFOS…</h2></div></div>;
  if(authState==="employee") return <NfosEmployeePortal session={session} access={employeeAccess} onSignOut={logout}/>;
  if(authState!=="ready") return <AdminLogin onSignedIn={(s)=>{setSession(s);window.location.reload();}}/>;

  const content = {
    overview:<NfosTodayDashboard inventory={inventory} lowStock={lowStock} setTab={setTab} onRefresh={refresh}/>,
    markets:<NfosMarkets manager notify={(type,msg)=>type==="error"?setError(msg):null}/>,
    notifications:<NfosNotificationCenter manager onOpenRoute={setTab}/>,
    calendar:<NfosOperationsCalendar setTab={setTab}/>,
    team:<NfosTeamAccountability/>,
    inventory:<Inventory inventory={inventory} onSelectBarcode={chooseBarcode}/>,
    receive:<Receive items={items} locations={locations} suppliers={suppliers} onDone={refresh}/>,
    move:<MoveInventory items={items} locations={locations} lots={lots} onDone={refresh}/>,
    items:<Items items={items} suppliers={suppliers} locations={locations} onDone={refresh} onSelectBarcode={chooseBarcode}/>,
    locations:<Locations locations={locations} onDone={refresh}/>,
    suppliers:<Suppliers suppliers={suppliers} onDone={refresh}/>,
    purchasing:<NfosPurchasing locations={locations} onInventoryChanged={refresh}/>,
    recipes:<RecipesModule items={items} onRefresh={refresh}/>,
    production:<ProductionModule items={items} locations={locations} lots={lots} onRefresh={refresh}/>,
    traceability:<TraceabilityModule items={items} lots={lots} initialBatchId={traceabilityInitialBatchId}/>,
    barcodes:<Barcodes items={items} lots={lots} initial={barcodeInitial} clearInitial={()=>setBarcodeInitial(null)} onFoundEntity={handleScannedEntity}/>,
    history:<History transactions={transactions} items={items} locations={locations} lots={lots}/>,
    reports:<NfosReports onOpenRoute={setTab}/>,
    health:<NfosSystemHealth onOpenRoute={setTab}/>,
  }[tab];

  const currentTitle=TABS.find(x=>x[0]===tab)?.[1]||"Operations";
  return <div className="nfos-shell"><header className="nfos-topbar"><div className="nfos-topbar-inner"><div className="nfos-brand"><div className="nfos-mark">NF</div><div><div className="nfos-brand-title">NECTARFUSIONS OPERATIONS</div><div className="nfos-brand-sub">NFOS • Inventory + Production</div></div></div><div className="nfos-inline-actions top-actions"><span className="nfos-muted nfos-small">{session?.user?.email}</span><a className="nfos-btn ghost" href="/">Website</a><button className="nfos-btn ghost" onClick={logout}>Sign out</button></div></div></header>
    <div className="nfos-layout"><aside className="nfos-side">
      <label className="nfos-mobile-nav"><span>Section</span><select aria-label="NFOS section" value={tab} onChange={(e)=>setTab(e.target.value)}>{TABS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <nav className="nfos-nav">{TABS.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    </aside>
      <main className="nfos-main"><div className="nfos-page-head"><div><h1>{currentTitle}</h1><p>{tab==="overview"?"What needs attention now, without hunting through spreadsheets.":tab==="calendar"?"Production, purchasing, deliveries and release dates in one operating calendar.":tab==="team"?"Assign work, see workload and preserve who did what.":"NectarFusions operational data is stored once and reused everywhere."}</p></div><button className="nfos-btn secondary" onClick={refresh} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button></div>{error&&<div className="nfos-error">{error}</div>}{content}</main></div></div>;
}
