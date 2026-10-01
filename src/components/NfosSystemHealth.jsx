import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

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

export default function NfosSystemHealth({ onOpenRoute }) {
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [section,setSection]=useState("checks");

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{setData(await nfos.getReleaseReadiness());}
    catch(err){setError(err?.message || "Could not load release readiness.");}
    finally{setBusy(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const checks=data?.checks || [];
  const drafts=data?.draft_recipes || [];
  const costs=data?.missing_cost_items || [];
  const suppliers=data?.supplier_gaps || [];

  const summary=useMemo(()=>({
    passed:checks.filter((x)=>x.status==="pass").length,
    critical:checks.filter((x)=>x.status==="fail").length,
    setup:checks.filter((x)=>x.status==="setup").length,
    attention:checks.filter((x)=>x.status==="attention").length,
  }),[checks]);

  return <>
    {error&&<div className="nfos-error">{error}</div>}

    <div className="nfos-page-head" style={{marginBottom:16}}>
      <div>
        <h2>System Health & Release Readiness</h2>
        <p>Separates NFOS integrity failures from business setup that can remain incomplete without corrupting operations.</p>
      </div>
      <button className="nfos-btn secondary" disabled={busy} onClick={load}>{busy?"Refreshing…":"Refresh"}</button>
    </div>

    <div className="nfos-grid four" style={{marginBottom:16}}>
      <div className="nfos-stat">
        <div className="nfos-stat-label">Operational integrity</div>
        <div className="nfos-stat-value">{data?.operational_integrity_ready ? "READY" : "BLOCKED"}</div>
      </div>
      <div className="nfos-stat">
        <div className="nfos-stat-label">Critical failures</div>
        <div className="nfos-stat-value">{data?.critical_failures ?? "—"}</div>
      </div>
      <div className="nfos-stat">
        <div className="nfos-stat-label">Full cost reporting</div>
        <div className="nfos-stat-value">{data?.full_cost_reporting_ready ? "READY" : "SETUP"}</div>
      </div>
      <div className="nfos-stat">
        <div className="nfos-stat-label">Purchasing automation</div>
        <div className="nfos-stat-value">{data?.purchasing_automation_ready ? "READY" : "SETUP"}</div>
      </div>
    </div>

    <div className="nfos-card">
      <div className="nfos-note">
        <strong>Current release state:</strong>{" "}
        {data?.operational_integrity_ready
          ? "NFOS integrity checks are passing. Remaining items are setup/business-data decisions unless a check below changes to FAIL."
          : "One or more critical integrity checks are failing. Do not push the final release until they are resolved."}
        <br/>
        Business date: {data?.business_date || "—"} · Last generated: {fmtDate(data?.generated_at)}
      </div>
    </div>

    <div className="nfos-inline-actions nfos-health-tabs">
      <button className={`nfos-btn ${section==="checks"?"":"secondary"}`} onClick={()=>setSection("checks")}>Health checks</button>
      <button className={`nfos-btn ${section==="catalog"?"":"secondary"}`} onClick={()=>setSection("catalog")}>Draft catalog ({drafts.length})</button>
      <button className={`nfos-btn ${section==="costs"?"":"secondary"}`} onClick={()=>setSection("costs")}>Missing costs ({costs.length})</button>
      <button className={`nfos-btn ${section==="suppliers"?"":"secondary"}`} onClick={()=>setSection("suppliers")}>Supplier gaps ({suppliers.length})</button>
    </div>

    {section==="checks"&&<div className="nfos-card">
      <div className="nfos-grid four" style={{marginBottom:14}}>
        <div className="nfos-stat"><div className="nfos-stat-label">Passing</div><div className="nfos-stat-value">{summary.passed}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Critical fail</div><div className="nfos-stat-value">{summary.critical}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Setup</div><div className="nfos-stat-value">{summary.setup}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Attention</div><div className="nfos-stat-value">{summary.attention}</div></div>
      </div>
      <div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Check</th><th>Status</th><th>Count</th><th>Why it matters</th></tr></thead>
        <tbody>{checks.map((c)=><tr key={c.key}>
          <td><strong>{c.label}</strong><div className="nfos-muted nfos-small">{pretty(c.severity)}</div></td>
          <td><Pill value={c.status}/></td>
          <td><strong>{c.count}</strong></td>
          <td>{c.detail}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}

    {section==="catalog"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Draft recipe decisions</h3><p>Draft recipes are intentionally excluded from production. Do not activate one until every blocker is intentionally resolved.</p></div>
      </div>
      {!drafts.length?<div className="nfos-empty">No Draft recipes remain.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Code</th><th>Recipe</th><th>Linked flavor</th><th>Blockers</th></tr></thead>
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
        </tr>)}</tbody>
      </table></div>}
    </div>}

    {section==="costs"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Missing trusted material costs</h3><p>NFOS will not fabricate margins. A real receipt cost, standard cost, or supplier cost closes each gap.</p></div>
        {onOpenRoute&&<button className="nfos-btn ghost" onClick={()=>onOpenRoute("purchasing")}>Open Purchasing</button>}
      </div>
      {!costs.length?<div className="nfos-empty">All active material and packaging costs are ready.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>SKU</th><th>Item</th><th>Type</th><th>Stocking unit</th><th>Status</th></tr></thead>
        <tbody>{costs.map((i)=><tr key={i.item_id}>
          <td className="nfos-mono">{i.sku}</td><td><strong>{i.name}</strong></td><td>{pretty(i.item_type)}</td><td>{i.stocking_unit}</td><td><Pill value={i.cost_readiness}/></td>
        </tr>)}</tbody>
      </table></div>}
    </div>}

    {section==="suppliers"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Supplier automation gaps</h3><p>These are the exact fields preventing NFOS from calculating a complete automated order-by recommendation.</p></div>
        {onOpenRoute&&<button className="nfos-btn ghost" onClick={()=>onOpenRoute("purchasing")}>Open Purchasing</button>}
      </div>
      {!suppliers.length?<div className="nfos-empty">All reorder-controlled items have complete supplier terms.</div>:<div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>SKU</th><th>Item</th><th>Supplier</th><th>Status</th><th>Missing</th></tr></thead>
        <tbody>{suppliers.map((i)=><tr key={i.item_id}>
          <td className="nfos-mono">{i.sku}</td><td><strong>{i.name}</strong></td><td>{i.supplier_name || "Not assigned"}</td><td><Pill value={i.readiness_status}/></td><td>{(i.missing_fields || []).join(", ")}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>}
  </>;
}

