import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosMarketOrderApprovals from "./NfosMarketOrderApprovals";

const fmtDate=(value)=>{
  if(!value) return "—";
  const [y,m,d]=String(value).slice(0,10).split("-").map(Number);
  return y&&m&&d ? new Date(y,m-1,d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : String(value);
};
const money=(cents)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(cents||0)/100);
const qty=(v)=>{const n=Number(v||0);return Number.isInteger(n)?String(n):n.toLocaleString(undefined,{maximumFractionDigits:4});};
const pill=(v)=>String(v||"").replaceAll("_"," ");

export default function NfosMarkets({ manager=false, adminApprovals=false, notify }) {
  const [data,setData]=useState({market_dates:[],sessions:[],finished_items:[],session_inventory:[],team:[],reconciliations:[],square_mappings:[]});
  const [selectedId,setSelectedId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [createForm,setCreateForm]=useState({marketDateId:"",assignedMemberId:"",squareLocationId:"",notes:""});
  const [loadForm,setLoadForm]=useState({itemId:"",quantity:""});
  const [saleForm,setSaleForm]=useState({itemId:"",quantity:"1",unitPrice:"",paymentMethod:"cash",notes:""});
  const [squareLocations,setSquareLocations]=useState([]);
  const [squareCatalog,setSquareCatalog]=useState([]);
  const [squareStatus,setSquareStatus]=useState(null);
  const [mappingDraft,setMappingDraft]=useState({});

  const flash=(type,text)=>{
    if(type==="error"){setError(text);setMessage("");}
    else{setMessage(text);setError("");}
    notify?.(type,text);
  };

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const d=await nfos.marketGetWorkspace();
      setData(d || {});
      if(!selectedId && d?.sessions?.length) setSelectedId(d.sessions[0].id);
    }catch(err){setError(err?.message || "Could not load market operations.");}
    finally{setBusy(false);}
  },[selectedId]);

  useEffect(()=>{load();},[load]);

  const selected=useMemo(()=>data.sessions?.find((s)=>s.id===selectedId) || null,[data.sessions,selectedId]);
  const inventory=useMemo(()=>(data.session_inventory || []).filter((x)=>x.session_id===selectedId),[data.session_inventory,selectedId]);
  const recon=useMemo(()=>(data.reconciliations || []).find((x)=>x.session_id===selectedId) || null,[data.reconciliations,selectedId]);
  const mappedByVariation=useMemo(()=>Object.fromEntries((data.square_mappings || []).map((m)=>[m.square_variation_id,m])),[data.square_mappings]);
  const usedMarketDates=new Set((data.sessions || []).map((s)=>s.market_date_id).filter(Boolean));
  const availableDates=(data.market_dates || []).filter((d)=>!usedMarketDates.has(d.id));

  const loadSquareLocations=async()=>{
    setBusy(true);setError("");
    try{
      const result=await nfos.squareMarketRequest("locations");
      setSquareLocations(result.locations || []);
      if(result.default_location_id && !createForm.squareLocationId){
        setCreateForm((f)=>({...f,squareLocationId:result.default_location_id}));
      }
    }catch(err){flash("error",err?.message || "Could not load Square locations.");}
    finally{setBusy(false);}
  };

  const loadSquareCatalog=async()=>{
    setBusy(true);setError("");
    try{
      const result=await nfos.squareMarketRequest("catalog");
      setSquareCatalog(result.variations || []);
      flash("success",`Loaded ${result.variations?.length || 0} Square catalog variations. ${result.auto_mapped || 0} exact SKU matches were mapped automatically.`);
      await load();
    }catch(err){flash("error",err?.message || "Could not load Square catalog.");}
    finally{setBusy(false);}
  };

  const createSession=async(e)=>{
    e.preventDefault();setBusy(true);setError("");
    try{
      const result=await nfos.marketCreateSession(createForm);
      setSelectedId(result.id);
      flash("success","Market session created.");
      setCreateForm((f)=>({...f,marketDateId:"",notes:""}));
      await load();
    }catch(err){flash("error",err?.message || "Could not create market session.");}
    finally{setBusy(false);}
  };

  const assignSession=async(memberId)=>{
    if(!selected) return;
    setBusy(true);
    try{await nfos.marketAssignSession(selected.id,memberId);flash("success","Market operator assigned.");await load();}
    catch(err){flash("error",err?.message || "Could not assign market session.");}
    finally{setBusy(false);}
  };

  const setSquareLocation=async(locationId)=>{
    if(!selected) return;
    setBusy(true);
    try{await nfos.marketSetSquareLocation(selected.id,locationId);flash("success","Square location saved.");await load();}
    catch(err){flash("error",err?.message || "Could not save Square location.");}
    finally{setBusy(false);}
  };

  const loadItem=async(e)=>{
    e.preventDefault();if(!selected)return;setBusy(true);
    try{
      await nfos.marketLoadItem(selected.id,loadForm.itemId,Number(loadForm.quantity),null,"Loaded from Markets workspace.");
      setLoadForm({itemId:"",quantity:""});
      flash("success","Market inventory loaded.");
      await load();
    }catch(err){flash("error",err?.message || "Could not load market inventory.");}
    finally{setBusy(false);}
  };

  const openSession=async()=>{
    setBusy(true);
    try{await nfos.marketOpenSession(selected.id);flash("success","Market session opened.");await load();}
    catch(err){flash("error",err?.message || "Could not open market session.");}
    finally{setBusy(false);}
  };

  const recordSale=async(e)=>{
    e.preventDefault();setBusy(true);
    try{
      const unitCents=Math.round(Number(saleForm.unitPrice)*100);
      await nfos.marketRecordSale({
        sessionId:selected.id,itemId:saleForm.itemId,quantity:Number(saleForm.quantity),
        unitCents,paymentMethod:saleForm.paymentMethod,notes:saleForm.notes || null,
      });
      setSaleForm({itemId:"",quantity:"1",unitPrice:"",paymentMethod:"cash",notes:""});
      flash("success","Market sale recorded and inventory deducted.");
      await load();
    }catch(err){flash("error",err?.message || "Could not record market sale.");}
    finally{setBusy(false);}
  };

  const closeSession=async()=>{
    setBusy(true);
    try{
      const result=await nfos.marketCloseSession(selected.id,"Closed from Markets workspace.");
      flash("success",`Market closed. ${qty(result.returned_units)} unsold units returned to MAIN.`);
      await load();
    }catch(err){flash("error",err?.message || "Could not close market session.");}
    finally{setBusy(false);}
  };

  const syncSquare=async()=>{
    setBusy(true);setError("");
    try{
      const result=await nfos.squareMarketRequest("sync",{sessionId:selected.id});
      setSquareStatus(result);
      const review=(result.unmapped?.length || 0)+(result.errors?.length || 0);
      flash(review ? "error" : "success",review ? `Square sync completed with ${review} item(s) needing review.` : `Square sync matched. ${result.imported || 0} sale lines imported.`);
      await load();
    }catch(err){flash("error",err?.message || "Could not sync Square sales.");}
    finally{setBusy(false);}
  };

  const mapVariation=async(variation)=>{
    const itemId=mappingDraft[variation.id];
    if(!itemId){flash("error","Choose an NFOS item first.");return;}
    setBusy(true);
    try{
      await nfos.marketMapSquareVariation({
        itemId,
        variationId:variation.id,
        itemName:variation.item_name,
        variationName:variation.variation_name,
        sku:variation.sku || null,
      });
      flash("success","Square variation mapped.");
      await load();
    }catch(err){flash("error",err?.message || "Could not save Square mapping.");}
    finally{setBusy(false);}
  };

  return <>
    {adminApprovals&&<NfosMarketOrderApprovals notify={notify} onChanged={load}/>}
    {error&&<div className="nfos-error">{error}</div>}
    {message&&<div className="nfos-success">{message}</div>}

    <div className="nfos-grid two">
      <div className="nfos-card">
        <div className="nfos-page-head" style={{marginBottom:12}}>
          <div><h2>Create market session</h2><p>Uses the existing NectarFusions customer market calendar.</p></div>
          <button className="nfos-btn ghost" onClick={loadSquareLocations} disabled={busy}>Load Square locations</button>
        </div>
        <form className="nfos-form" onSubmit={createSession}>
          <div className="nfos-field full"><label>Market date</label><select required value={createForm.marketDateId} onChange={(e)=>setCreateForm({...createForm,marketDateId:e.target.value})}><option value="">Choose…</option>{availableDates.map((d)=><option key={d.id} value={d.id}>{fmtDate(d.day)} — {d.venue_name} — {d.hours || ""}</option>)}</select></div>
          {manager&&<div className="nfos-field full"><label>Assigned operator</label><select value={createForm.assignedMemberId} onChange={(e)=>setCreateForm({...createForm,assignedMemberId:e.target.value})}><option value="">Unassigned</option>{(data.team || []).map((m)=><option key={m.id} value={m.id}>{m.display_name} — {m.role.replaceAll("_"," ")}</option>)}</select></div>}
          <div className="nfos-field full"><label>Square location</label><select value={createForm.squareLocationId} onChange={(e)=>setCreateForm({...createForm,squareLocationId:e.target.value})}><option value="">Set later</option>{squareLocations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="nfos-field full"><label>Notes</label><input value={createForm.notes} onChange={(e)=>setCreateForm({...createForm,notes:e.target.value})}/></div>
          <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Create session</button></div>
        </form>
      </div>

      <div className="nfos-card">
        <h2>Market sessions</h2>
        {!data.sessions?.length?<div className="nfos-empty">No NFOS market sessions yet.</div>:<div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Date</th><th>Venue</th><th>Status</th><th>Loaded</th><th>Sold</th><th></th></tr></thead><tbody>{data.sessions.map((s)=><tr key={s.id}><td>{fmtDate(s.market_day)}</td><td><strong>{s.venue_name}</strong><div className="nfos-muted nfos-small">{s.assigned_member_name || "Unassigned"}</div></td><td><span className="nfos-pill">{pill(s.status)}</span></td><td>{qty(s.units_loaded)}</td><td>{qty(s.units_sold)}</td><td><button className="nfos-btn ghost" onClick={()=>setSelectedId(s.id)}>Open</button></td></tr>)}</tbody></table></div>}
      </div>
    </div>

    {selected&&<>
      <div className="nfos-card">
        <div className="nfos-page-head">
          <div><h2>{selected.venue_name}</h2><p>{fmtDate(selected.market_day)} · {pill(selected.status)} · {selected.inventory_location_name}</p></div>
          <div className="nfos-inline-actions">
            {["planned","loaded"].includes(selected.status)&&<button className="nfos-btn" onClick={openSession}>Open market</button>}
            {["loaded","open"].includes(selected.status)&&<button className="nfos-btn secondary" onClick={closeSession}>Close & return stock</button>}
            {selected.square_location_id&&["open","closed","reconciled"].includes(selected.status)&&<button className="nfos-btn ghost" onClick={syncSquare}>Sync Square</button>}
          </div>
        </div>

        <div className="nfos-grid four" style={{marginTop:14}}>
          <div className="nfos-stat"><div className="nfos-stat-label">Loaded</div><div className="nfos-stat-value">{qty(selected.units_loaded)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Sold</div><div className="nfos-stat-value">{qty(selected.units_sold)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">At market</div><div className="nfos-stat-value">{qty(selected.units_at_market)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Recorded sales</div><div className="nfos-stat-value">{money(selected.recorded_gross_cents)}</div></div>
        </div>

        <div className="nfos-form" style={{marginTop:16}}>
          {manager&&<div className="nfos-field"><label>Assigned operator</label><select value={selected.assigned_member_id || ""} onChange={(e)=>assignSession(e.target.value)}><option value="">Unassigned</option>{(data.team || []).map((m)=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div>}
          <div className="nfos-field"><label>Square location</label><select value={selected.square_location_id || ""} onChange={(e)=>setSquareLocation(e.target.value)}><option value="">Not linked</option>{squareLocations.map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
      </div>

      {["planned","loaded","open"].includes(selected.status)&&<div className="nfos-grid two">
        <div className="nfos-card">
          <h3>Load finished jars</h3>
          <p className="nfos-muted">NFOS automatically pulls the oldest available finished lots from MAIN and preserves batch traceability.</p>
          <form className="nfos-form" onSubmit={loadItem}>
            <div className="nfos-field full"><label>Finished SKU</label><select required value={loadForm.itemId} onChange={(e)=>setLoadForm({...loadForm,itemId:e.target.value})}><option value="">Choose…</option>{(data.finished_items || []).map((i)=><option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}</select></div>
            <div className="nfos-field"><label>Quantity</label><input required type="number" min="1" step="1" value={loadForm.quantity} onChange={(e)=>setLoadForm({...loadForm,quantity:e.target.value})}/></div>
            <div className="nfos-field"><button className="nfos-btn" disabled={busy}>Load to market</button></div>
          </form>
        </div>

        <div className="nfos-card">
          <h3>Current field inventory</h3>
          {!inventory.length?<div className="nfos-empty">No jars currently at this market.</div>:<div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>SKU</th><th>Item</th><th>On hand</th></tr></thead><tbody>{inventory.map((i)=><tr key={i.item_id}><td className="nfos-mono">{i.sku}</td><td>{i.name}</td><td><strong>{qty(i.on_hand)}</strong></td></tr>)}</tbody></table></div>}
        </div>
      </div>}

      {selected.status==="open"&&<div className="nfos-card">
        <h3>Record cash / non-Square sale</h3>
        <p className="nfos-muted">Do not manually re-enter Square POS card sales if you plan to use Square sync; sync imports those sale lines automatically.</p>
        <form className="nfos-form" onSubmit={recordSale}>
          <div className="nfos-field full"><label>Item</label><select required value={saleForm.itemId} onChange={(e)=>setSaleForm({...saleForm,itemId:e.target.value})}><option value="">Choose…</option>{inventory.filter((i)=>Number(i.on_hand)>0).map((i)=><option key={i.item_id} value={i.item_id}>{i.sku} — {i.name} — {qty(i.on_hand)} available</option>)}</select></div>
          <div className="nfos-field"><label>Quantity</label><input required type="number" min="1" step="1" value={saleForm.quantity} onChange={(e)=>setSaleForm({...saleForm,quantity:e.target.value})}/></div>
          <div className="nfos-field"><label>Unit price ($)</label><input required type="number" min="0" step="0.01" value={saleForm.unitPrice} onChange={(e)=>setSaleForm({...saleForm,unitPrice:e.target.value})}/></div>
          <div className="nfos-field"><label>Payment</label><select value={saleForm.paymentMethod} onChange={(e)=>setSaleForm({...saleForm,paymentMethod:e.target.value})}><option value="cash">Cash</option><option value="other">Other / offline</option></select></div>
          <div className="nfos-field full"><label>Notes</label><input value={saleForm.notes} onChange={(e)=>setSaleForm({...saleForm,notes:e.target.value})}/></div>
          <div className="nfos-field full"><button className="nfos-btn">Record sale</button></div>
        </form>
      </div>}

      <div className="nfos-card">
        <div className="nfos-page-head" style={{marginBottom:12}}>
          <div><h3>Square reconciliation</h3><p>Completed Square orders are matched by Catalog variation ID and deducted from the market's actual lots.</p></div>
          <div className="nfos-inline-actions"><button className="nfos-btn ghost" onClick={loadSquareLocations}>Square locations</button>{manager&&<button className="nfos-btn ghost" onClick={loadSquareCatalog}>Square catalog</button>}</div>
        </div>
        {recon?<div className="nfos-grid four">
          <div className="nfos-stat"><div className="nfos-stat-label">Square</div><div className="nfos-stat-value">{money(recon.square_gross_cents)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Imported Square</div><div className="nfos-stat-value">{money(recon.recorded_square_gross_cents)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Cash / manual</div><div className="nfos-stat-value">{money(recon.manual_gross_cents)}</div></div>
          <div className="nfos-stat"><div className="nfos-stat-label">Difference</div><div className="nfos-stat-value">{money(recon.difference_cents)}</div></div>
        </div>:<div className="nfos-note">No Square reconciliation has been run for this session yet.</div>}
        {squareStatus?.unmapped?.length>0&&<div className="nfos-error" style={{marginTop:12}}>{squareStatus.unmapped.length} Square line item(s) are unmapped. Open the catalog mapping section below.</div>}
        {squareStatus?.errors?.length>0&&<div className="nfos-error" style={{marginTop:12}}>{squareStatus.errors.length} Square line item(s) could not be imported. Re-sync after correcting inventory or mapping.</div>}
      </div>
    </>}

    {manager&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h2>Square catalog mapping</h2><p>Exact Square SKU = NFOS SKU matches are mapped automatically. Everything else requires confirmation.</p></div>
        <button className="nfos-btn secondary" onClick={loadSquareCatalog} disabled={busy}>Load / refresh Square catalog</button>
      </div>
      {!squareCatalog.length?<div className="nfos-empty">Load the Square catalog to review mappings.</div>:<div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Square item</th><th>Square SKU</th><th>NFOS mapping</th><th></th></tr></thead><tbody>{squareCatalog.map((v)=>{
        const mapped=mappedByVariation[v.id] || v.mapping || null;
        return <tr key={v.id}><td><strong>{v.item_name}</strong><div className="nfos-muted nfos-small">{v.variation_name || "Default variation"} · {money(v.price_cents)}</div></td><td className="nfos-mono">{v.sku || "—"}</td><td>{mapped?<><strong>{mapped.nfos_name}</strong><div className="nfos-muted nfos-small">{mapped.nfos_sku}</div></>:<select value={mappingDraft[v.id] || ""} onChange={(e)=>setMappingDraft({...mappingDraft,[v.id]:e.target.value})}><option value="">Choose NFOS item…</option>{(data.finished_items || []).map((i)=><option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}</select>}</td><td>{!mapped&&<button className="nfos-btn ghost" onClick={()=>mapVariation(v)}>Map</button>}</td></tr>;
      })}</tbody></table></div>}
    </div>}
  </>;
}

