import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosItemEditor from "./NfosItemEditor";
import NfosSupplierTermsEditor from "./NfosSupplierTermsEditor";

const pretty=(value)=>String(value||"").replaceAll("_"," ");
const fmtDate=(value)=>{
  if(!value)return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString();
};

function Pill({value}){
  const tone=value==="pass"?"ok":value==="fail"?"low":value==="attention"?"low":"";
  return <span className={`nfos-pill ${tone}`}>{pretty(value)}</span>;
}

export default function NfosSystemHealth({
  onOpenRoute,
  items = [],
  suppliers: supplierCatalog = [],
  locations = [],
  onChanged,
}) {
  const [data,setData]=useState(null);
  const [supplierReadiness,setSupplierReadiness]=useState([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [section,setSection]=useState("checks");
  const [editItem,setEditItem]=useState(null);
  const [itemFocus,setItemFocus]=useState("");
  const [supplierItem,setSupplierItem]=useState(null);

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const [readiness,supplierRows]=await Promise.all([
        nfos.getReleaseReadiness(),
        nfos.listSupplierReadiness(),
      ]);
      setData(readiness);
      setSupplierReadiness(supplierRows || []);
    }
    catch(err){setError(err?.message || "Could not load release readiness.");}
    finally{setBusy(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const checks=data?.checks || [];
  const drafts=data?.draft_recipes || [];
  const costs=data?.missing_cost_items || [];
  const supplierGaps=data?.supplier_gaps || [];

  const itemById=useMemo(()=>new Map(items.map((row)=>[row.id,row])),[items]);
  const itemBySku=useMemo(()=>new Map(items.map((row)=>[row.sku,row])),[items]);
  const readinessByItem=useMemo(()=>new Map(supplierReadiness.map((row)=>[row.item_id,row])),[supplierReadiness]);

  const summary=useMemo(()=>({
    passed:checks.filter((x)=>x.status==="pass").length,
    critical:checks.filter((x)=>x.status==="fail").length,
    setup:checks.filter((x)=>x.status==="setup").length,
    attention:checks.filter((x)=>x.status==="attention").length,
  }),[checks]);

  const changed=async(label)=>{
    setMessage(label || "Saved. System Health has been refreshed.");
    setEditItem(null);
    setSupplierItem(null);
    setItemFocus("");
    await onChanged?.();
    await load();
  };

  const openItem=(item,focus="")=>{
    if(!item)return;
    setItemFocus(focus);
    setEditItem(item);
  };

  const sectionForCheck=(key)=>({
    draft_catalog:"catalog",
    material_costs:"costs",
    supplier_terms:"suppliers",
  }[key] || "");

  return <>
    {error&&<div className="nfos-error">{error}</div>}
    {message&&<div className="nfos-success">{message}</div>}

    <div className="nfos-page-head" style={{marginBottom:16}}>
      <div>
        <h2>System Health & Release Readiness</h2>
        <p>See a gap, fix it here. Item costs and supplier terms can be corrected without leaving System Health.</p>
      </div>
      <button className="nfos-btn secondary" disabled={busy} onClick={load}>{busy?"Refreshing…":"Refresh"}</button>
    </div>

    <div className="nfos-grid four" style={{marginBottom:16}}>
      <div className="nfos-stat"><div className="nfos-stat-label">Operational integrity</div><div className="nfos-stat-value">{data?.operational_integrity_ready ? "READY" : "BLOCKED"}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Critical failures</div><div className="nfos-stat-value">{data?.critical_failures ?? "—"}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Full cost reporting</div><div className="nfos-stat-value">{data?.full_cost_reporting_ready ? "READY" : "SETUP"}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Purchasing automation</div><div className="nfos-stat-value">{data?.purchasing_automation_ready ? "READY" : "SETUP"}</div></div>
    </div>

    <div className="nfos-card">
      <div className="nfos-note">
        <strong>Current release state:</strong>{" "}
        {data?.operational_integrity_ready
          ? "NFOS integrity checks are passing. Remaining items are setup/business-data decisions unless a check below changes to FAIL."
          : "One or more critical integrity checks are failing. Resolve the failing check before relying on the affected workflow."}
        <br/>
        Business date: {data?.business_date || "—"} · Last generated: {fmtDate(data?.generated_at)}
      </div>
    </div>

    <div className="nfos-inline-actions nfos-health-tabs">
      <button className={`nfos-btn ${section==="checks"?"":"secondary"}`} onClick={()=>setSection("checks")}>Health checks</button>
      <button className={`nfos-btn ${section==="catalog"?"":"secondary"}`} onClick={()=>setSection("catalog")}>Draft catalog ({drafts.length})</button>
      <button className={`nfos-btn ${section==="costs"?"":"secondary"}`} onClick={()=>setSection("costs")}>Missing costs ({costs.length})</button>
      <button className={`nfos-btn ${section==="suppliers"?"":"secondary"}`} onClick={()=>setSection("suppliers")}>Supplier gaps ({supplierGaps.length})</button>
    </div>

    {section==="checks"&&<div className="nfos-card">
      <div className="nfos-grid four" style={{marginBottom:14}}>
        <div className="nfos-stat"><div className="nfos-stat-label">Passing</div><div className="nfos-stat-value">{summary.passed}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Critical fail</div><div className="nfos-stat-value">{summary.critical}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Setup</div><div className="nfos-stat-value">{summary.setup}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Attention</div><div className="nfos-stat-value">{summary.attention}</div></div>
      </div>
      <div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Check</th><th>Status</th><th>Count</th><th>Why it matters</th><th>Fix</th></tr></thead>
        <tbody>{checks.map((c)=>{
          const target=sectionForCheck(c.key);
          return <tr key={c.key}>
            <td><strong>{c.label}</strong><div className="nfos-muted nfos-small">{pretty(c.severity)}</div></td>
            <td><Pill value={c.status}/></td>
            <td><strong>{c.count}</strong></td>
            <td>{c.detail}</td>
            <td>{target && Number(c.count)>0 ? <button className="nfos-btn ghost" type="button" onClick={()=>setSection(target)}>Fix here</button> : <span className="nfos-muted">—</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>}

    {section==="catalog"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Draft recipe decisions</h3><p>Ingredient-item problems can be fixed here. Recipe/flavor/SKU mapping decisions stay in Recipes because they change the production definition itself.</p></div>
        {onOpenRoute&&<button className="nfos-btn ghost" onClick={()=>onOpenRoute("recipes")}>Open Recipes</button>}
      </div>
      {!drafts.length?<div className="nfos-empty">No Draft recipes remain.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Code</th><th>Recipe</th><th>Linked flavor</th><th>Blockers</th><th>Fix</th></tr></thead>
        <tbody>{drafts.map((r)=><tr key={r.product_code}>
          <td className="nfos-mono">{r.product_code}</td>
          <td><strong>{r.name}</strong><div className="nfos-muted nfos-small">{r.recipe_key}</div></td>
          <td>{r.linked_flavor || "None"}{r.linked_flavor&&<div className="nfos-muted nfos-small">{r.flavor_active?"Active":"Inactive"}</div>}</td>
          <td>
            <div className="nfos-health-blockers">
              {Object.entries(r.blockers || {}).map(([k,v])=><span className="nfos-pill low" key={k}>{pretty(k)}: {pretty(v)}</span>)}
              {(r.inactive_inputs || []).map((i)=><span className="nfos-pill low" key={i.sku}>{i.sku} {i.name}: inactive</span>)}
            </div>
          </td>
          <td>
            <div className="nfos-inline-actions">
              {(r.inactive_inputs || []).map((input)=>{
                const item=itemBySku.get(input.sku);
                return item ? <button key={input.sku} className="nfos-btn ghost" type="button" onClick={()=>openItem(item)}>Edit {input.sku}</button> : null;
              })}
              {onOpenRoute&&<button className="nfos-btn ghost" type="button" onClick={()=>onOpenRoute("recipes")}>Recipe setup</button>}
            </div>
          </td>
        </tr>)}</tbody>
      </table></div>}
    </div>}

    {section==="costs"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Missing trusted material costs</h3><p>Enter the real standard unit cost right here, or complete supplier cost terms. NFOS refreshes the readiness count after save.</p></div>
      </div>
      {!costs.length?<div className="nfos-empty">All active material and packaging costs are ready.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>SKU</th><th>Item</th><th>Type</th><th>Stocking unit</th><th>Status</th><th>Fix</th></tr></thead>
        <tbody>{costs.map((i)=>{
          const item=itemById.get(i.item_id);
          return <tr key={i.item_id}>
            <td className="nfos-mono">{i.sku}</td>
            <td><strong>{i.name}</strong></td>
            <td>{pretty(i.item_type)}</td>
            <td>{i.stocking_unit}</td>
            <td><Pill value={i.cost_readiness}/></td>
            <td><button className="nfos-btn" type="button" disabled={!item} onClick={()=>openItem(item,"cost")}>Fix cost here</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>}

    {section==="suppliers"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Supplier automation gaps</h3><p>Complete the missing supplier, lead time, cost, and ordering fields directly from this table.</p></div>
      </div>
      {!supplierGaps.length?<div className="nfos-empty">All reorder-controlled items have complete supplier terms.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>SKU</th><th>Item</th><th>Supplier</th><th>Status</th><th>Missing</th><th>Fix</th></tr></thead>
        <tbody>{supplierGaps.map((i)=>{
          const item=itemById.get(i.item_id);
          return <tr key={i.item_id}>
            <td className="nfos-mono">{i.sku}</td>
            <td><strong>{i.name}</strong></td>
            <td>{i.supplier_name || "Not assigned"}</td>
            <td><Pill value={i.readiness_status}/></td>
            <td>{(i.missing_fields || []).join(", ")}</td>
            <td><button className="nfos-btn" type="button" disabled={!item} onClick={()=>setSupplierItem(item)}>Fix supplier terms</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </div>}

    {editItem&&<NfosItemEditor
      item={editItem}
      suppliers={supplierCatalog}
      locations={locations}
      focus={itemFocus}
      title={itemFocus==="cost" ? `Fix cost · ${editItem.name}` : `Edit item · ${editItem.name}`}
      onClose={()=>{setEditItem(null);setItemFocus("");}}
      onSaved={()=>changed("Item saved. System Health has been refreshed.")}
    />}

    {supplierItem&&<NfosSupplierTermsEditor
      item={supplierItem}
      readiness={readinessByItem.get(supplierItem.id)}
      suppliers={supplierCatalog}
      onClose={()=>setSupplierItem(null)}
      onSaved={()=>changed("Supplier terms saved. System Health has been refreshed.")}
    />}
  </>;
}
