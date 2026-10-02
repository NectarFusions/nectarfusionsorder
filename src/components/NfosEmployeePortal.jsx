import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import useNfosResponsiveTables from "../lib/useNfosResponsiveTables";
import NfosSystemHealth from "./NfosSystemHealth";
import NfosReports from "./NfosReports";
import NfosMarkets from "./NfosMarkets";
import NfosNotificationCenter from "./NfosNotificationCenter";
import NfosSuggestionsPanel from "./NfosSuggestionsPanel";
import NfosMarketOrderLogger from "./NfosMarketOrderLogger";
import NfosFlavorAvailability from "./NfosFlavorAvailability";
import "../styles/nfos.css";

const roleLabel = (value) => ({
  owner: "Owner",
  operations_manager: "Operations Manager",
  production_operator: "Production Operator",
  inventory_operator: "Inventory Operator",
  purchasing_operator: "Purchasing Operator",
  market_manager: "Market Management",
  viewer: "Viewer",
}[value] || value || "Team Member");
const roleLabels = (roles, fallback) => {
  const values = Array.isArray(roles) && roles.length ? roles : [fallback].filter(Boolean);
  return values.map(roleLabel).join(" + ") || "Team Member";
};

const qty = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined,{maximumFractionDigits:4});
};

const fmtDate = (value) => {
  if (!value) return "—";
  const raw = String(value).slice(0,10);
  const [y,m,d] = raw.split("-").map(Number);
  return y && m && d ? new Date(y,m-1,d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}) : raw;
};

const fmtDateTime = (value) => value ? new Date(value).toLocaleString() : "—";

function StatusPill({ value }) {
  const text = String(value || "open").replaceAll("_"," ");
  const danger = ["critical","overdue","failed","hold"].includes(value);
  const ok = ["done","released","ready","passed","completed"].includes(value);
  return <span className={`nfos-pill ${danger ? "low" : ok ? "ok" : ""}`}>{text}</span>;
}

function MyWork({ work, onRefresh, busy, onTaskStatus, onOpenArea }) {
  return <div className="nfos-card">
    <div className="nfos-page-head" style={{marginBottom:12}}>
      <div><h2>My Work Today</h2><p>Only work assigned to your NFOS profile appears here.</p></div>
      <button className="nfos-btn secondary" onClick={onRefresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
    </div>
    {!work.length ? <div className="nfos-empty">Nothing is assigned to you right now.</div> :
      <div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Work</th><th>Due</th><th>Priority</th><th>Status</th><th>Area</th><th>Action</th></tr></thead>
        <tbody>{work.map((w)=><tr key={w.work_key}>
          <td><strong>{w.title}</strong><div className="nfos-muted nfos-small">{w.detail}</div></td>
          <td>{fmtDate(w.due_date)}</td>
          <td><StatusPill value={w.priority}/></td>
          <td><StatusPill value={w.status}/></td>
          <td>{w.route}</td>
          <td>
            <div className="nfos-inline-actions">
              {w.work_type === "manual_task" && w.status !== "done" && <>
                {w.status !== "in_progress" && <button className="nfos-btn ghost" onClick={()=>onTaskStatus(w.source_id,"in_progress")}>Start</button>}
                <button className="nfos-btn ghost" onClick={()=>onTaskStatus(w.source_id,"done")}>Done</button>
              </>}
              {w.route === "Production" && <button className="nfos-btn ghost" onClick={()=>onOpenArea("production")}>Open</button>}
              {w.route === "Purchasing" && <button className="nfos-btn ghost" onClick={()=>onOpenArea("purchasing")}>Open</button>}
              {w.route === "Inventory" && <button className="nfos-btn ghost" onClick={()=>onOpenArea("inventory")}>Open</button>}
            </div>
          </td>
        </tr>)}</tbody>
      </table></div>}
  </div>;
}

function ProductionPanel({ access, notify }) {
  const [workspace,setWorkspace]=useState({orders:[],batches:[]});
  const [selectedBatchId,setSelectedBatchId]=useState("");
  const [batchData,setBatchData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [qcDraft,setQcDraft]=useState({});
  const [inputDraft,setInputDraft]=useState({});
  const [outputDraft,setOutputDraft]=useState({});
  const [yieldValue,setYieldValue]=useState("");
  const [seed,setSeed]=useState({source:"",quantity:"",unit:"oz",notes:""});

  const load = useCallback(async()=>{
    setBusy(true);
    try {
      const data = await nfos.getEmployeeProductionWorkspace();
      setWorkspace(data || {orders:[],batches:[]});
    } catch(err){ notify("error",err?.message || "Could not load production."); }
    finally{ setBusy(false); }
  },[notify]);

  const loadBatch = useCallback(async(id)=>{
    if(!id){ setBatchData(null); return; }
    setBusy(true);
    try{
      const data=await nfos.getEmployeeBatchWorkspace(id);
      setBatchData(data);
      const q={};
      (data?.qc || []).forEach((row)=>{
        if(row.result_type==="number") q[row.check_key]=row.numeric_value ?? "";
        else if(row.result_type==="boolean") q[row.check_key]=row.boolean_value == null ? "" : String(row.boolean_value);
        else q[row.check_key]=row.text_value ?? "";
      });
      setQcDraft(q);

      const inputs={};
      (data?.recipe_inputs || []).forEach((row)=>{
        let initial="";
        const planned=Number(data?.batch?.planned_quantity || 0);
        if(row.is_base){
          if(String(row.stocking_unit).toLowerCase()===String(data?.batch?.planned_unit).toLowerCase()) initial=planned || "";
          else if(String(data?.batch?.planned_unit).toLowerCase()==="lb" && String(row.stocking_unit).toLowerCase()==="oz") initial=planned*16;
          else if(String(data?.batch?.planned_unit).toLowerCase()==="oz" && String(row.stocking_unit).toLowerCase()==="lb") initial=planned/16;
        } else if(row.calculation_method==="percent_of_base_weight" && row.rate_percent != null){
          let base=planned;
          if(String(data?.batch?.planned_unit).toLowerCase()==="lb" && String(row.stocking_unit).toLowerCase()==="oz") base=planned*16;
          if(String(data?.batch?.planned_unit).toLowerCase()==="oz" && String(row.stocking_unit).toLowerCase()==="lb") base=planned/16;
          initial=base*Number(row.rate_percent)/100;
        }
        inputs[row.recipe_input_id]={quantity:initial ? String(Number(initial.toFixed(4))) : "",lotId:"",unit:row.stocking_unit};
      });
      setInputDraft(inputs);

      const plannedMap=Object.fromEntries((data?.planned_outputs || []).map((x)=>[x.finished_item_id,Number(x.quantity_remaining || 0)]));
      const outs={};
      (data?.eligible_outputs || []).forEach((row)=>{
        const n=plannedMap[row.item_id] || 0;
        outs[row.item_id]={quantity:n>0 ? String(n) : "",lotCode:data?.batch?.batch_code || ""};
      });
      setOutputDraft(outs);
      setYieldValue(data?.batch?.actual_bulk_yield ?? data?.batch?.planned_quantity ?? "");
      setSeed({
        source:data?.batch?.seed_source_batch_code || "",
        quantity:data?.batch?.seed_actual_quantity ?? "",
        unit:data?.batch?.seed_unit || "oz",
        notes:"",
      });
    }catch(err){ notify("error",err?.message || "Could not load batch."); }
    finally{ setBusy(false); }
  },[notify]);

  useEffect(()=>{ load(); },[load]);
  useEffect(()=>{ if(selectedBatchId) loadBatch(selectedBatchId); },[selectedBatchId,loadBatch]);

  const startBatch=async(order)=>{
    const confirmed=window.confirm(
      `Start ${order.order_no} now?\n\nStarting creates the traceable production batch and locks admin Edit/Delete for this order.`
    );
    if(!confirmed)return;

    setBusy(true);
    try{
      const result=await nfos.employeeStartAssignedBatch(order.id,null,null,"Started by assigned operator from employee portal.");
      notify("success",`${result.batch_code} started. Admin Edit/Delete is now locked for this production order.`);
      await load();
      setSelectedBatchId(result.id);
    }catch(err){notify("error",err?.message || "Could not start production.");}
    finally{setBusy(false);}
  };

  const toggleStep=async(step,completed)=>{
    setBusy(true);
    try{
      await nfos.employeeSetBatchStepCompletion(batchData.batch.id,step.recipe_step_id,completed,step.notes || null);
      await loadBatch(batchData.batch.id);
    }catch(err){notify("error",err?.message || "Could not update SOP step.");}
    finally{setBusy(false);}
  };

  const saveQc=async(row)=>{
    const value=qcDraft[row.check_key];
    setBusy(true);
    try{
      await nfos.employeeRecordQualityCheck(batchData.batch.id,row.check_key,{
        numericValue:row.result_type==="number" ? Number(value) : null,
        textValue:row.result_type==="text" ? value : null,
        booleanValue:row.result_type==="boolean" ? value==="true" : null,
        notes:"Employee portal QC",
      });
      await loadBatch(batchData.batch.id);
      notify("success",`${row.label} saved.`);
    }catch(err){notify("error",err?.message || "Could not save QC.");}
    finally{setBusy(false);}
  };

  const saveSeed=async()=>{
    setBusy(true);
    try{
      await nfos.employeeSetSpunBatchDetails(batchData.batch.id,seed.source,Number(seed.quantity),seed.unit,seed.notes);
      await loadBatch(batchData.batch.id);
      notify("success","Spun seed details saved.");
    }catch(err){notify("error",err?.message || "Could not save seed details.");}
    finally{setBusy(false);}
  };

  const completeBatch=async()=>{
    const inputs=(batchData?.recipe_inputs || []).map((row)=>{
      const d=inputDraft[row.recipe_input_id] || {};
      return {
        recipe_input_id:row.recipe_input_id,
        item_id:row.item_id,
        lot_id:d.lotId || null,
        location_id:batchData.batch.production_location_id,
        quantity:Number(d.quantity),
        unit:d.unit || row.stocking_unit,
      };
    }).filter((x)=>Number(x.quantity)>0);

    const outputs=(batchData?.eligible_outputs || []).map((row)=>{
      const d=outputDraft[row.item_id] || {};
      return {
        item_id:row.item_id,
        location_id:batchData.batch.production_location_id,
        quantity:Number(d.quantity),
        lot_code:d.lotCode || batchData.batch.batch_code,
      };
    }).filter((x)=>Number(x.quantity)>0);

    if(!inputs.length || !outputs.length){ notify("error","Enter actual ingredient usage and at least one finished output."); return; }

    setBusy(true);
    try{
      await nfos.employeeCompleteBatch(
        batchData.batch.id,inputs,outputs,
        Number(yieldValue || batchData.batch.planned_quantity),
        batchData.batch.planned_unit,true,"Completed from employee portal."
      );
      notify("success",`${batchData.batch.batch_code} completed.`);
      await load();
      await loadBatch(batchData.batch.id);
    }catch(err){notify("error",err?.message || "Could not complete batch.");}
    finally{setBusy(false);}
  };

  const confirmCure=async()=>{
    setBusy(true);
    try{
      await nfos.employeeConfirmSpunCure(batchData.batch.id,"Cure confirmed from employee portal.");
      await loadBatch(batchData.batch.id);
      notify("success","Spun cure confirmed.");
    }catch(err){notify("error",err?.message || "Could not confirm cure.");}
    finally{setBusy(false);}
  };

  const releaseBatch=async()=>{
    setBusy(true);
    try{
      await nfos.employeeReleaseBatch(batchData.batch.id,"Released from employee portal.");
      await load();
      await loadBatch(batchData.batch.id);
      notify("success","Batch released.");
    }catch(err){notify("error",err?.message || "Could not release batch.");}
    finally{setBusy(false);}
  };

  const lotsFor=(itemId)=>(batchData?.available_lots || []).filter((l)=>l.item_id===itemId && Number(l.on_hand)>0);

  return <>
    <div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h2>Assigned production</h2><p>When you are ready to begin, press Start production. Until you start it, the admin can still edit or delete the planned order.</p></div>
        <button className="nfos-btn secondary" disabled={busy} onClick={load}>Refresh</button>
      </div>
      {!workspace.orders?.length ? <div className="nfos-empty">No open production orders are assigned to you.</div> :
        <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Order</th><th>Recipe</th><th>Plan</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>{workspace.orders.map((o)=><tr key={o.id}><td className="nfos-mono">{o.order_no}</td><td><strong>{o.recipe_name}</strong><div className="nfos-muted nfos-small">{o.flavor_name || ""}</div></td><td>{qty(o.planned_quantity)} {o.planned_unit} · {o.planned_texture}</td><td>{fmtDate(o.due_date)}</td><td><StatusPill value={o.status}/></td><td>{o.status === "planned" && !o.has_open_batch ? <button className="nfos-btn" disabled={busy} onClick={()=>startBatch(o)}>Start production</button> : <span className="nfos-pill ok nfos-started-label">Started</span>}</td></tr>)}</tbody>
        </table></div>}
    </div>

    <div className="nfos-card">
      <h2>Production batches</h2>
      <div className="nfos-field"><label>Open batch workspace</label>
        <select value={selectedBatchId} onChange={(e)=>setSelectedBatchId(e.target.value)}>
          <option value="">Choose batch…</option>
          {(workspace.batches || []).map((b)=><option value={b.id} key={b.id}>{b.batch_code} — {b.recipe_name} — {b.status}</option>)}
        </select>
      </div>
    </div>

    {batchData?.batch && <div className="nfos-card nfos-batch-workspace">
      <div className="nfos-page-head"><div><h2>{batchData.batch.batch_code}</h2><p>{batchData.batch.recipe_name} · {batchData.batch.texture} · {batchData.batch.production_location_name}</p></div><StatusPill value={batchData.batch.status}/></div>

      <h3>SOP</h3>
      <div className="nfos-sop-list">{(batchData.sop || []).map((s)=><div className="nfos-sop-row" key={s.recipe_step_id}>
        <div className="nfos-sop-main"><strong>{s.step_no}. {s.title}</strong><div className="nfos-muted nfos-small">{s.instructions}</div>{s.critical_control && <span className="nfos-pill low">Critical control</span>}</div>
        <div>{s.requires_confirmation ? <label className="nfos-check"><input type="checkbox" checked={Boolean(s.completed_at)} disabled={busy || batchData.batch.status==="completed"} onChange={(e)=>toggleStep(s,e.target.checked)}/> {s.completed_at ? "Complete" : "Confirm"}</label> : <span className="nfos-muted">Instruction</span>}</div>
      </div>)}</div>

      <h3 style={{marginTop:22}}>Quality control</h3>
      <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Check</th><th>Result</th><th>Status</th><th></th></tr></thead><tbody>{(batchData.qc || []).map((q)=><tr key={q.check_key}>
        <td><strong>{q.label}</strong><div className="nfos-muted nfos-small">{q.unit || ""}</div></td>
        <td>{q.result_type==="number" ? <input type="number" step="any" value={qcDraft[q.check_key] ?? ""} onChange={(e)=>setQcDraft({...qcDraft,[q.check_key]:e.target.value})}/> :
          q.result_type==="boolean" ? <select value={qcDraft[q.check_key] ?? ""} onChange={(e)=>setQcDraft({...qcDraft,[q.check_key]:e.target.value})}><option value="">Choose…</option><option value="true">Pass / Yes</option><option value="false">Fail / No</option></select> :
          <input value={qcDraft[q.check_key] ?? ""} onChange={(e)=>setQcDraft({...qcDraft,[q.check_key]:e.target.value})}/>}</td>
        <td><StatusPill value={q.status}/></td>
        <td>{batchData.batch.status!=="completed" && <button className="nfos-btn ghost" onClick={()=>saveQc(q)}>Save</button>}</td>
      </tr>)}</tbody></table></div>

      {batchData.batch.texture==="spun" && batchData.batch.status!=="completed" && <div className="nfos-spun-card">
        <h3>Spun seed</h3>
        <div className="nfos-form">
          <div className="nfos-field"><label>Source natural spun batch</label><input value={seed.source} onChange={(e)=>setSeed({...seed,source:e.target.value})}/></div>
          <div className="nfos-field"><label>Actual seed quantity</label><input type="number" step="any" value={seed.quantity} onChange={(e)=>setSeed({...seed,quantity:e.target.value})}/></div>
          <div className="nfos-field"><label>Unit</label><input value={seed.unit} onChange={(e)=>setSeed({...seed,unit:e.target.value})}/></div>
          <div className="nfos-field full"><label>Notes</label><input value={seed.notes} onChange={(e)=>setSeed({...seed,notes:e.target.value})}/></div>
          <div className="nfos-field full"><button className="nfos-btn" onClick={saveSeed}>Save seed details</button></div>
        </div>
      </div>}

      {batchData.batch.status!=="completed" && <>
        <h3 style={{marginTop:22}}>Actual ingredient usage</h3>
        <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Ingredient</th><th>Actual quantity</th><th>Unit</th><th>Lot</th></tr></thead><tbody>{(batchData.recipe_inputs || []).map((row)=>{
          const d=inputDraft[row.recipe_input_id] || {};
          return <tr key={row.recipe_input_id}><td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{row.is_base ? "Base honey" : row.calculation_method==="percent_of_base_weight" ? `${row.rate_percent}% of base` : row.calculation_method}</div></td><td><input type="number" step="any" min="0" value={d.quantity ?? ""} onChange={(e)=>setInputDraft({...inputDraft,[row.recipe_input_id]:{...d,quantity:e.target.value}})}/></td><td>{row.stocking_unit}</td><td>{row.track_lots ? <select value={d.lotId || ""} onChange={(e)=>setInputDraft({...inputDraft,[row.recipe_input_id]:{...d,lotId:e.target.value}})}><option value="">Choose lot…</option>{lotsFor(row.item_id).map((l)=><option key={l.lot_id} value={l.lot_id}>{l.lot_code} · {qty(l.on_hand)} {l.stocking_unit}</option>)}</select> : "Not lot tracked"}</td></tr>;
        })}</tbody></table></div>

        <h3 style={{marginTop:22}}>Finished output</h3>
        <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>SKU</th><th>Quantity made</th><th>Finished lot</th></tr></thead><tbody>{(batchData.eligible_outputs || []).map((row)=>{
          const d=outputDraft[row.item_id] || {};
          return <tr key={row.item_id}><td><strong>{row.name}</strong><div className="nfos-muted nfos-small">{row.sku}</div></td><td><input type="number" step="any" min="0" value={d.quantity ?? ""} onChange={(e)=>setOutputDraft({...outputDraft,[row.item_id]:{...d,quantity:e.target.value}})}/></td><td><input value={d.lotCode || ""} onChange={(e)=>setOutputDraft({...outputDraft,[row.item_id]:{...d,lotCode:e.target.value}})}/></td></tr>;
        })}</tbody></table></div>
        <div className="nfos-form" style={{marginTop:14}}>
          <div className="nfos-field"><label>Actual bulk yield</label><input type="number" step="any" min="0" value={yieldValue} onChange={(e)=>setYieldValue(e.target.value)}/></div>
          <div className="nfos-field"><label>Unit</label><input disabled value={batchData.batch.planned_unit || ""}/></div>
          <div className="nfos-field full"><button className="nfos-btn" disabled={busy} onClick={completeBatch}>Complete batch</button></div>
        </div>
      </>}

      {batchData.batch.status==="completed" && batchData.batch.texture==="spun" && !batchData.batch.spun_cure_confirmed_at && batchData.batch.release_not_before && new Date() >= new Date(batchData.batch.release_not_before) &&
        <button className="nfos-btn" onClick={confirmCure}>Confirm completed 14-day cure</button>}

      {batchData.batch.status==="completed" && access?.permissions?.includes("production.release") && !batchData.batch.released_at &&
        <button className="nfos-btn" style={{marginTop:10}} onClick={releaseBatch}>Release finished batch</button>}
    </div>}
  </>;
}

function InventoryPanel({ notify }) {
  const [data,setData]=useState({inventory:[],locations:[],lots:[],suppliers:[]});
  const [mode,setMode]=useState("receive");
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({itemId:"",locationId:"",fromLocationId:"",toLocationId:"",supplierId:"",quantity:"",lotId:"",lotCode:"",supplierLotCode:"",totalCost:"",direction:"add",reason:"Physical count",notes:""});

  const load=useCallback(async()=>{
    setBusy(true);
    try{
      const d=await nfos.getEmployeeInventoryWorkspace();
      setData(d || {inventory:[],locations:[],lots:[],suppliers:[]});
      const main=(d?.locations || []).find((x)=>x.code==="MAIN")?.id || d?.locations?.[0]?.id || "";
      setForm((f)=>({...f,locationId:f.locationId||main,fromLocationId:f.fromLocationId||main}));
    }catch(err){notify("error",err?.message || "Could not load inventory workspace.");}
    finally{setBusy(false);}
  },[notify]);

  useEffect(()=>{load();},[load]);
  const selected=data.inventory.find((x)=>x.item_id===form.itemId);
  const itemLots=(data.lots || []).filter((l)=>l.item_id===form.itemId && Number(l.on_hand)>0);

  const submit=async(e)=>{
    e.preventDefault(); setBusy(true);
    try{
      if(mode==="receive"){
        await nfos.employeeReceiveItem({
          itemId:form.itemId,locationId:form.locationId,quantity:Number(form.quantity),
          lotCode:form.lotCode || null,supplierId:form.supplierId || null,
          supplierLotCode:form.supplierLotCode || null,totalCost:form.totalCost ? Number(form.totalCost) : null,
          notes:form.notes || null,
        });
        notify("success","Inventory received.");
      }else if(mode==="adjust"){
        await nfos.employeeAdjustInventory({
          itemId:form.itemId,locationId:form.locationId,
          quantityDelta:(form.direction==="remove" ? -1 : 1)*Number(form.quantity),
          lotId:form.lotId || null,reason:form.reason,notes:form.notes || null,
        });
        notify("success","Inventory adjustment recorded.");
      }else{
        await nfos.employeeTransferInventory({
          itemId:form.itemId,quantity:Number(form.quantity),
          fromLocationId:form.fromLocationId,toLocationId:form.toLocationId,
          lotId:form.lotId || null,notes:form.notes || null,
        });
        notify("success","Inventory transfer recorded.");
      }
      setForm((f)=>({...f,quantity:"",lotId:"",lotCode:"",supplierLotCode:"",totalCost:"",notes:""}));
      await load();
    }catch(err){notify("error",err?.message || "Could not save inventory action.");}
    finally{setBusy(false);}
  };

  return <div className="nfos-card">
    <div className="nfos-page-head"><div><h2>Inventory operations</h2><p>Receive, count-adjust, or transfer NFOS inventory.</p></div><button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button></div>
    <div className="nfos-inline-actions" style={{marginBottom:16}}>
      {["receive","adjust","transfer"].map((m)=><button key={m} className={`nfos-btn ${mode===m ? "" : "secondary"}`} onClick={()=>setMode(m)}>{m[0].toUpperCase()+m.slice(1)}</button>)}
    </div>
    <form className="nfos-form" onSubmit={submit}>
      <div className="nfos-field full"><label>Item</label><select required value={form.itemId} onChange={(e)=>setForm({...form,itemId:e.target.value,lotId:""})}><option value="">Choose item…</option>{(data.inventory || []).map((x)=><option key={x.item_id} value={x.item_id}>{x.sku} — {x.name} — {qty(x.planning_on_hand)} {x.stocking_unit}</option>)}</select></div>
      <div className="nfos-field"><label>Quantity</label><input required type="number" step="any" min="0.0001" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/></div>
      <div className="nfos-field"><label>Unit</label><input disabled value={selected?.stocking_unit || "—"}/></div>

      {mode==="receive" && <>
        <div className="nfos-field"><label>Location</label><select required value={form.locationId} onChange={(e)=>setForm({...form,locationId:e.target.value})}>{(data.locations || []).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field"><label>Supplier</label><select value={form.supplierId} onChange={(e)=>setForm({...form,supplierId:e.target.value})}><option value="">Not specified</option>{(data.suppliers || []).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        {selected?.track_lots && <div className="nfos-field"><label>Actual lot number</label><input required value={form.lotCode} onChange={(e)=>setForm({...form,lotCode:e.target.value})}/></div>}
        <div className="nfos-field"><label>Supplier lot</label><input value={form.supplierLotCode} onChange={(e)=>setForm({...form,supplierLotCode:e.target.value})}/></div>
        <div className="nfos-field"><label>Total cost</label><input type="number" step="0.01" min="0" value={form.totalCost} onChange={(e)=>setForm({...form,totalCost:e.target.value})}/></div>
      </>}

      {mode==="adjust" && <>
        <div className="nfos-field"><label>Direction</label><select value={form.direction} onChange={(e)=>setForm({...form,direction:e.target.value})}><option value="add">Add</option><option value="remove">Remove</option></select></div>
        <div className="nfos-field"><label>Location</label><select required value={form.locationId} onChange={(e)=>setForm({...form,locationId:e.target.value})}>{(data.locations || []).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field"><label>Lot</label><select value={form.lotId} onChange={(e)=>setForm({...form,lotId:e.target.value})}><option value="">Any / not lot-specific</option>{itemLots.map((l)=><option key={l.lot_id} value={l.lot_id}>{l.lot_code} · {qty(l.on_hand)}</option>)}</select></div>
        <div className="nfos-field"><label>Reason</label><select value={form.reason} onChange={(e)=>setForm({...form,reason:e.target.value})}><option>Physical count</option><option>Damage</option><option>Sample / giveaway</option><option>Spill / waste</option><option>Return</option><option>Correction</option><option>Other</option></select></div>
      </>}

      {mode==="transfer" && <>
        <div className="nfos-field"><label>From</label><select required value={form.fromLocationId} onChange={(e)=>setForm({...form,fromLocationId:e.target.value})}>{(data.locations || []).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field"><label>To</label><select required value={form.toLocationId} onChange={(e)=>setForm({...form,toLocationId:e.target.value})}><option value="">Choose destination…</option>{(data.locations || []).filter((x)=>x.id!==form.fromLocationId).map((x)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Lot</label><select value={form.lotId} onChange={(e)=>setForm({...form,lotId:e.target.value})}><option value="">Any / not lot-specific</option>{itemLots.filter((l)=>l.location_id===form.fromLocationId).map((l)=><option key={l.lot_id} value={l.lot_id}>{l.lot_code} · {qty(l.on_hand)}</option>)}</select></div>
      </>}

      <div className="nfos-field full"><label>Notes</label><textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></div>
      <div className="nfos-field full"><button className="nfos-btn" disabled={busy}>Save {mode}</button></div>
    </form>
  </div>;
}

function PurchasingPanel({ notify }) {
  const [data,setData]=useState({recommendations:[],purchase_orders:[],lines:[],suppliers:[],items:[],supplier_readiness:[],locations:[]});
  const [busy,setBusy]=useState(false);
  const [poForm,setPoForm]=useState({supplierId:"",expectedDate:"",locationId:"",notes:""});
  const [lineForm,setLineForm]=useState({poId:"",itemId:"",quantity:"",unitCost:""});
  const [receiveForm,setReceiveForm]=useState({lineId:"",quantity:"",lotCode:"",supplierLotCode:""});
  const [terms,setTerms]=useState({itemId:"",supplierId:"",leadTimeDays:"",minimumOrderQty:"",orderIncrement:"",unitCost:"",supplierSku:""});

  const load=useCallback(async()=>{
    setBusy(true);
    try{
      const d=await nfos.getEmployeePurchasingWorkspace();
      setData(d || {});
      const main=(d?.locations || []).find((x)=>x.code==="MAIN")?.id || d?.locations?.[0]?.id || "";
      setPoForm((f)=>({...f,locationId:f.locationId||main}));
    }catch(err){notify("error",err?.message || "Could not load purchasing.");}
    finally{setBusy(false);}
  },[notify]);
  useEffect(()=>{load();},[load]);

  const createPo=async(e)=>{
    e.preventDefault(); setBusy(true);
    try{
      const result=await nfos.employeeCreatePurchaseOrder(poForm);
      setLineForm((f)=>({...f,poId:result.id}));
      notify("success",`${result.po_number} created.`);
      await load();
    }catch(err){notify("error",err?.message || "Could not create PO.");}
    finally{setBusy(false);}
  };

  const createReorder=async(supplierId)=>{
    setBusy(true);
    try{
      const result=await nfos.employeeCreateReorderPo(supplierId,poForm.expectedDate || null,poForm.locationId || null,"Created from employee purchasing portal.");
      notify("success",`${result.po_number} created from current recommendations.`);
      await load();
    }catch(err){notify("error",err?.message || "Could not create reorder PO.");}
    finally{setBusy(false);}
  };

  const addLine=async(e)=>{
    e.preventDefault(); setBusy(true);
    try{
      await nfos.employeeAddPurchaseOrderLine(lineForm.poId,lineForm.itemId,Number(lineForm.quantity),lineForm.unitCost ? Number(lineForm.unitCost) : null,"Employee purchasing line.");
      notify("success","PO line saved.");
      setLineForm((f)=>({...f,itemId:"",quantity:"",unitCost:""}));
      await load();
    }catch(err){notify("error",err?.message || "Could not save PO line.");}
    finally{setBusy(false);}
  };

  const submitPo=async(id)=>{
    setBusy(true);
    try{await nfos.employeeSubmitPurchaseOrder(id);notify("success","Purchase order submitted.");await load();}
    catch(err){notify("error",err?.message || "Could not submit PO.");}
    finally{setBusy(false);}
  };

  const receiveLine=async(e)=>{
    e.preventDefault(); setBusy(true);
    try{
      await nfos.employeeReceivePurchaseOrderLine(receiveForm.lineId,Number(receiveForm.quantity),receiveForm.lotCode || null,receiveForm.supplierLotCode || null);
      notify("success","PO receipt recorded.");
      setReceiveForm({lineId:"",quantity:"",lotCode:"",supplierLotCode:""});
      await load();
    }catch(err){notify("error",err?.message || "Could not receive PO line.");}
    finally{setBusy(false);}
  };

  const saveTerms=async(e)=>{
    e.preventDefault(); setBusy(true);
    try{
      await nfos.employeeSetItemSupplierTerms(terms);
      notify("success","Supplier terms saved.");
      await load();
    }catch(err){notify("error",err?.message || "Could not save supplier terms.");}
    finally{setBusy(false);}
  };

  const recSuppliers=[...new Map((data.recommendations || []).filter((x)=>x.supplier_id).map((x)=>[x.supplier_id,x.supplier_name])).entries()];

  return <>
    <div className="nfos-card">
      <div className="nfos-page-head"><div><h2>Purchasing</h2><p>Recommendations, POs, supplier terms, and receiving.</p></div><button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button></div>
      {(data.recommendations || []).length ? <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Item</th><th>Supplier</th><th>Order by</th><th>Suggested</th><th>Reason</th></tr></thead><tbody>{data.recommendations.map((r)=><tr key={r.item_id}><td><strong>{r.name}</strong></td><td>{r.supplier_name || "Supplier needed"}</td><td>{fmtDate(r.order_by_date)}</td><td>{qty(r.suggested_order_quantity)} {r.stocking_unit}</td><td><StatusPill value={r.recommendation_reason}/></td></tr>)}</tbody></table></div> : <div className="nfos-empty">No current purchase recommendations.</div>}
      <div className="nfos-inline-actions" style={{marginTop:14}}>{recSuppliers.map(([id,name])=><button key={id} className="nfos-btn ghost" onClick={()=>createReorder(id)}>Create reorder PO · {name}</button>)}</div>
    </div>

    <div className="nfos-grid two">
      <div className="nfos-card"><h3>Create purchase order</h3><form className="nfos-form" onSubmit={createPo}>
        <div className="nfos-field full"><label>Supplier</label><select required value={poForm.supplierId} onChange={(e)=>setPoForm({...poForm,supplierId:e.target.value})}><option value="">Choose…</option>{(data.suppliers || []).map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="nfos-field"><label>Expected date</label><input type="date" value={poForm.expectedDate} onChange={(e)=>setPoForm({...poForm,expectedDate:e.target.value})}/></div>
        <div className="nfos-field"><label>Destination</label><select value={poForm.locationId} onChange={(e)=>setPoForm({...poForm,locationId:e.target.value})}>{(data.locations || []).map((l)=><option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Notes</label><input value={poForm.notes} onChange={(e)=>setPoForm({...poForm,notes:e.target.value})}/></div>
        <div className="nfos-field full"><button className="nfos-btn">Create draft PO</button></div>
      </form></div>

      <div className="nfos-card"><h3>Add / update PO line</h3><form className="nfos-form" onSubmit={addLine}>
        <div className="nfos-field full"><label>Draft PO</label><select required value={lineForm.poId} onChange={(e)=>setLineForm({...lineForm,poId:e.target.value})}><option value="">Choose…</option>{(data.purchase_orders || []).filter((p)=>p.status==="draft").map((p)=><option key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</option>)}</select></div>
        <div className="nfos-field full"><label>Item</label><select required value={lineForm.itemId} onChange={(e)=>setLineForm({...lineForm,itemId:e.target.value})}><option value="">Choose…</option>{(data.items || []).map((i)=><option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}</select></div>
        <div className="nfos-field"><label>Quantity</label><input required type="number" step="any" min="0.0001" value={lineForm.quantity} onChange={(e)=>setLineForm({...lineForm,quantity:e.target.value})}/></div>
        <div className="nfos-field"><label>Unit cost</label><input type="number" step="0.0001" min="0" value={lineForm.unitCost} onChange={(e)=>setLineForm({...lineForm,unitCost:e.target.value})}/></div>
        <div className="nfos-field full"><button className="nfos-btn">Save line</button></div>
      </form></div>
    </div>

    <div className="nfos-card"><h3>Open purchase orders</h3>
      <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Expected</th><th>Open</th><th></th></tr></thead><tbody>{(data.purchase_orders || []).map((p)=><tr key={p.id}><td className="nfos-mono">{p.po_number}</td><td>{p.supplier_name}</td><td><StatusPill value={p.status}/></td><td>{fmtDate(p.expected_date)}</td><td>{qty(p.units_open)}</td><td>{p.status==="draft" && <button className="nfos-btn ghost" onClick={()=>submitPo(p.id)}>Submit</button>}</td></tr>)}</tbody></table></div>
    </div>

    <div className="nfos-grid two">
      <div className="nfos-card"><h3>Receive PO line</h3><form className="nfos-form" onSubmit={receiveLine}>
        <div className="nfos-field full"><label>Open line</label><select required value={receiveForm.lineId} onChange={(e)=>setReceiveForm({...receiveForm,lineId:e.target.value})}><option value="">Choose…</option>{(data.lines || []).filter((l)=>["ordered","partial"].includes(l.po_status) && Number(l.quantity_open)>0).map((l)=><option key={l.id} value={l.id}>{l.po_number} — {l.item_name} — {qty(l.quantity_open)} open</option>)}</select></div>
        <div className="nfos-field"><label>Quantity received</label><input required type="number" step="any" min="0.0001" value={receiveForm.quantity} onChange={(e)=>setReceiveForm({...receiveForm,quantity:e.target.value})}/></div>
        <div className="nfos-field"><label>Lot number</label><input value={receiveForm.lotCode} onChange={(e)=>setReceiveForm({...receiveForm,lotCode:e.target.value})}/></div>
        <div className="nfos-field full"><label>Supplier lot</label><input value={receiveForm.supplierLotCode} onChange={(e)=>setReceiveForm({...receiveForm,supplierLotCode:e.target.value})}/></div>
        <div className="nfos-field full"><button className="nfos-btn">Receive</button></div>
      </form></div>

      <div className="nfos-card"><h3>Supplier terms</h3><form className="nfos-form" onSubmit={saveTerms}>
        <div className="nfos-field full"><label>Item</label><select required value={terms.itemId} onChange={(e)=>setTerms({...terms,itemId:e.target.value})}><option value="">Choose…</option>{(data.items || []).map((i)=><option key={i.id} value={i.id}>{i.sku} — {i.name}</option>)}</select></div>
        <div className="nfos-field full"><label>Supplier</label><select required value={terms.supplierId} onChange={(e)=>setTerms({...terms,supplierId:e.target.value})}><option value="">Choose…</option>{(data.suppliers || []).map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="nfos-field"><label>Lead time days</label><input type="number" min="0" value={terms.leadTimeDays} onChange={(e)=>setTerms({...terms,leadTimeDays:e.target.value})}/></div>
        <div className="nfos-field"><label>Minimum order</label><input type="number" step="any" min="0" value={terms.minimumOrderQty} onChange={(e)=>setTerms({...terms,minimumOrderQty:e.target.value})}/></div>
        <div className="nfos-field"><label>Order increment</label><input type="number" step="any" min="0" value={terms.orderIncrement} onChange={(e)=>setTerms({...terms,orderIncrement:e.target.value})}/></div>
        <div className="nfos-field"><label>Unit cost</label><input type="number" step="0.0001" min="0" value={terms.unitCost} onChange={(e)=>setTerms({...terms,unitCost:e.target.value})}/></div>
        <div className="nfos-field full"><label>Supplier SKU</label><input value={terms.supplierSku} onChange={(e)=>setTerms({...terms,supplierSku:e.target.value})}/></div>
        <div className="nfos-field full"><button className="nfos-btn">Save supplier terms</button></div>
      </form></div>
    </div>
  </>;
}

function ManagerPanel({ notify }) {
  const [data,setData]=useState({team:[],actions:[],production_orders:[]});
  const [busy,setBusy]=useState(false);
  const [task,setTask]=useState({title:"",detail:"",category:"general",priority:"normal",dueDate:"",assignedMemberId:""});

  const load=useCallback(async()=>{
    setBusy(true);
    try{setData(await nfos.getEmployeeManagerWorkspace() || {});}
    catch(err){notify("error",err?.message || "Could not load management workspace.");}
    finally{setBusy(false);}
  },[notify]);
  useEffect(()=>{load();},[load]);

  const assignAction=async(key,memberId)=>{
    setBusy(true);
    try{await nfos.employeeAssignAction(key,memberId);notify("success","Action assigned.");await load();}
    catch(err){notify("error",err?.message || "Could not assign action.");}
    finally{setBusy(false);}
  };
  const assignOrder=async(orderId,memberId)=>{
    setBusy(true);
    try{await nfos.employeeAssignProductionOrder(orderId,memberId);notify("success","Production order assigned.");await load();}
    catch(err){notify("error",err?.message || "Could not assign production.");}
    finally{setBusy(false);}
  };
  const createTask=async(e)=>{
    e.preventDefault();setBusy(true);
    try{
      await nfos.employeeCreateWorkItem(task);
      setTask({title:"",detail:"",category:"general",priority:"normal",dueDate:"",assignedMemberId:""});
      notify("success","Work item created.");await load();
    }catch(err){notify("error",err?.message || "Could not create work item.");}
    finally{setBusy(false);}
  };

  return <>
    <div className="nfos-card"><div className="nfos-page-head"><div><h2>Manage work</h2><p>Assign generated NFOS actions and production without changing team roles.</p></div><button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button></div>
      <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Action</th><th>Priority</th><th>Due</th><th>Assigned to</th></tr></thead><tbody>{(data.actions || []).map((a)=><tr key={a.action_key}><td><strong>{a.title}</strong><div className="nfos-muted nfos-small">{a.detail}</div></td><td><StatusPill value={a.priority}/></td><td>{fmtDate(a.action_date)}</td><td><select value={a.assigned_member_id || ""} onChange={(e)=>assignAction(a.action_key,e.target.value)}><option value="">Unassigned</option>{(data.team || []).map((m)=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></td></tr>)}</tbody></table></div>
    </div>
    <div className="nfos-card"><h3>Production assignments</h3><div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Order</th><th>Recipe</th><th>Due</th><th>Assigned to</th></tr></thead><tbody>{(data.production_orders || []).map((o)=><tr key={o.id}><td className="nfos-mono">{o.order_no}</td><td>{o.recipe_name}</td><td>{fmtDate(o.due_date)}</td><td><select value={o.assigned_member_id || ""} onChange={(e)=>assignOrder(o.id,e.target.value)}><option value="">Unassigned</option>{(data.team || []).filter((m)=>["owner","operations_manager","production_operator"].includes(m.role)).map((m)=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></td></tr>)}</tbody></table></div></div>
    <div className="nfos-card"><h3>Create manual work item</h3><form className="nfos-form" onSubmit={createTask}>
      <div className="nfos-field full"><label>Title</label><input required value={task.title} onChange={(e)=>setTask({...task,title:e.target.value})}/></div>
      <div className="nfos-field full"><label>Detail</label><input value={task.detail} onChange={(e)=>setTask({...task,detail:e.target.value})}/></div>
      <div className="nfos-field"><label>Category</label><select value={task.category} onChange={(e)=>setTask({...task,category:e.target.value})}><option value="production">Production</option><option value="inventory">Inventory</option><option value="purchasing">Purchasing</option><option value="quality">Quality</option><option value="general">General</option></select></div>
      <div className="nfos-field"><label>Priority</label><select value={task.priority} onChange={(e)=>setTask({...task,priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
      <div className="nfos-field"><label>Due date</label><input type="date" value={task.dueDate} onChange={(e)=>setTask({...task,dueDate:e.target.value})}/></div>
      <div className="nfos-field"><label>Assigned to</label><select value={task.assignedMemberId} onChange={(e)=>setTask({...task,assignedMemberId:e.target.value})}><option value="">Unassigned</option>{(data.team || []).map((m)=><option key={m.id} value={m.id}>{m.display_name}</option>)}</select></div>
      <div className="nfos-field full"><button className="nfos-btn">Create work item</button></div>
    </form></div>
  </>;
}

function AccessPanel({ access, firstSetup = false }) {
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const savePassword=async(e)=>{
    e.preventDefault();setError("");setMessage("");
    if(password.length<8){setError("Use at least 8 characters.");return;}
    if(password!==confirm){setError("Passwords do not match.");return;}
    setBusy(true);
    try{
      await nfos.updateMyPassword(password);
      setPassword("");
      setConfirm("");
      if(firstSetup){
        const url=new URL(window.location.href);
        url.searchParams.delete("setup");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        setMessage("Password created. You can now sign in with your email and this password.");
      }else{
        setMessage("Password saved.");
      }
    }
    catch(err){setError(err?.message || "Could not update password.");}
    finally{setBusy(false);}
  };

  return <div className="nfos-grid two">
    <div className="nfos-card"><h2>My NFOS access</h2><div className="nfos-note"><strong>{roleLabels(access?.roles, access?.role)}</strong><br/>The portal combines permissions from all of your assigned roles and only renders areas those roles are authorized to use. Every write action is also permission-checked again on the server.</div><div className="nfos-permission-list">{(access?.permissions || []).map((p)=><span className="nfos-pill" key={p}>{p.replaceAll("_"," ")}</span>)}</div></div>
    <div className="nfos-card"><h2>{firstSetup ? "Create your password" : "Change password"}</h2>{firstSetup&&<div className="nfos-note" style={{marginBottom:12}}>Create the password you will use with your email for future NFOS sign-ins.</div>}{error&&<div className="nfos-error">{error}</div>}{message&&<div className="nfos-success">{message}</div>}<form className="nfos-form" onSubmit={savePassword}><div className="nfos-field full"><label>{firstSetup ? "Create password" : "New password"}</label><input type="password" autoComplete="new-password" minLength="8" required value={password} onChange={(e)=>setPassword(e.target.value)}/></div><div className="nfos-field full"><label>Confirm password</label><input type="password" autoComplete="new-password" minLength="8" required value={confirm} onChange={(e)=>setConfirm(e.target.value)}/></div><div className="nfos-field full"><button className="nfos-btn" disabled={busy}>{busy ? "Saving…" : firstSetup ? "Create password" : "Save password"}</button></div></form></div>
  </div>;
}

export default function NfosEmployeePortal({ session, access, onSignOut, forcePasswordSetup = false }) {
  useNfosResponsiveTables();
  const permissions=useMemo(()=>new Set(access?.permissions || []),[access]);
  const tabs=useMemo(()=>{
    const rows=[["work","My Work"],["notifications","Notifications"],["suggestions","Suggest Edits"]];
    if(permissions.has("production.execute")) rows.push(["production","Production"]);
    if(permissions.has("inventory.manage")) rows.push(["inventory","Inventory"]);
    if(permissions.has("purchasing.manage")) rows.push(["purchasing","Purchasing"]);
    if(permissions.has("market.order.log")) rows.push(["market_orders","Scan Orders"]);
    if(permissions.has("products.view")) rows.push(["flavor_availability","Flavor Availability"]);
    if(permissions.has("market.manage")) rows.push(["markets","Markets"]);
    if(permissions.has("team.assign")) rows.push(["manager","Manage Work"]);
    if(permissions.has("reports.view")) rows.push(["reports","Reports"]);
    if(permissions.has("reports.view")) rows.push(["health","System Health"]);
    rows.push(["access","Access"]);
    return rows;
  },[permissions]);

  const [tab,setTab]=useState(forcePasswordSetup ? "access" : "work");
  const [work,setWork]=useState([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const notify=useCallback((type,text)=>{
    if(type==="error"){setError(text);setMessage("");}
    else{setMessage(text);setError("");}
  },[]);

  const loadWork=useCallback(async()=>{
    setBusy(true);setError("");
    try{await nfos.syncNotifications().catch(()=>null);setWork(await nfos.getEmployeeWork() || []);}
    catch(err){setError(err?.message || "Could not load your work.");}
    finally{setBusy(false);}
  },[]);
  useEffect(()=>{loadWork();},[loadWork]);

  const taskStatus=async(id,status)=>{
    setBusy(true);
    try{await nfos.employeeSetWorkItemStatus(id,status);notify("success",status==="done" ? "Task completed." : "Task started.");await loadWork();}
    catch(err){notify("error",err?.message || "Could not update task.");}
    finally{setBusy(false);}
  };

  const counts=useMemo(()=>({
    total:work.length,
    critical:work.filter((w)=>w.priority==="critical").length,
    production:work.filter((w)=>w.route==="Production").length,
    tasks:work.filter((w)=>w.work_type==="manual_task").length,
  }),[work]);

  return <div className="nfos-shell">
    <header className="nfos-topbar"><div className="nfos-topbar-inner">
      <div className="nfos-brand"><div className="nfos-mark">NF</div><div><div className="nfos-brand-title">NECTARFUSIONS OPERATIONS</div><div className="nfos-brand-sub">{roleLabels(access?.roles, access?.role)}</div></div></div>
      <div className="nfos-inline-actions top-actions"><span className="nfos-muted nfos-small">{session?.user?.email}</span><button className="nfos-btn ghost" onClick={onSignOut}>Sign out</button></div>
    </div></header>

    <div className="nfos-layout">
      <aside className="nfos-side">
        <label className="nfos-mobile-nav"><span>Section</span><select aria-label="NFOS employee section" value={tab} onChange={(e)=>setTab(e.target.value)}>{tabs.map(([key,label])=><option key={key} value={key}>{label}{key==="work" && work.length ? ` (${work.length})` : ""}</option>)}</select></label>
        <nav className="nfos-nav">{tabs.map(([key,label])=><button key={key} className={tab===key ? "active" : ""} onClick={()=>setTab(key)}>{label}{key==="work" && work.length ? ` (${work.length})` : ""}</button>)}</nav>
      </aside>
      <main className="nfos-main">
        <div className="nfos-page-head"><div><h1>{tabs.find((x)=>x[0]===tab)?.[1] || "My Work"}</h1><p>Hi, {access?.display_name || "Team Member"} · {roleLabels(access?.roles, access?.role)}</p></div></div>
        {error&&<div className="nfos-error">{error}</div>}
        {message&&<div className="nfos-success">{message}</div>}

        {tab==="work" && <>
          <div className="nfos-grid four" style={{marginBottom:16}}>
            <div className="nfos-stat"><div className="nfos-stat-label">Assigned work</div><div className="nfos-stat-value">{counts.total}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Critical</div><div className="nfos-stat-value">{counts.critical}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Production</div><div className="nfos-stat-value">{counts.production}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Manual tasks</div><div className="nfos-stat-value">{counts.tasks}</div></div>
          </div>
          <MyWork work={work} onRefresh={loadWork} busy={busy} onTaskStatus={taskStatus} onOpenArea={setTab}/>
        </>}
        {tab==="notifications" && <NfosNotificationCenter manager={permissions.has("team.assign")} onOpenRoute={setTab}/>}\n        {tab==="suggestions" && <NfosSuggestionsPanel notify={notify}/>}
        {tab==="production" && <ProductionPanel access={access} notify={notify}/>}
        {tab==="inventory" && <InventoryPanel notify={notify}/>}
        {tab==="purchasing" && <PurchasingPanel notify={notify}/>}
        {tab==="market_orders" && <NfosMarketOrderLogger notify={notify}/>}
        {tab==="flavor_availability" && <NfosFlavorAvailability/>}
        {tab==="markets" && <NfosMarkets manager={permissions.has("team.assign")} notify={notify}/>}

        {tab==="reports" && <NfosReports onOpenRoute={setTab}/>}
        {tab==="health" && <NfosSystemHealth onOpenRoute={setTab}/>}
        {tab==="manager" && <ManagerPanel notify={notify}/>}
        {tab==="access" && <AccessPanel access={access} firstSetup={forcePasswordSetup}/>}
      </main>
    </div>
  </div>;
}

