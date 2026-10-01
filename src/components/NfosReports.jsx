import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const money=(value)=>value==null?"—":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value||0));
const cents=(value)=>value==null?"—":money(Number(value)/100);
const qty=(value)=>{const n=Number(value||0);return Number.isInteger(n)?String(n):n.toLocaleString(undefined,{maximumFractionDigits:4});};
const pct=(value)=>value==null?"—":`${Number(value).toFixed(2)}%`;
const fmtDate=(value)=>{
  if(!value)return "—";
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? String(value).slice(0,10) : d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
};

function Pill({children,tone=""}){return <span className={`nfos-pill ${tone}`}>{children}</span>;}

export default function NfosReports({ onOpenRoute }) {
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [section,setSection]=useState("costing");

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{setData(await nfos.getReportingWorkspace());}
    catch(err){setError(err?.message || "Could not load NFOS reports.");}
    finally{setBusy(false);}
  },[]);

  useEffect(()=>{load();},[load]);

  const k=data?.kpis || {};
  const dash=data?.costing_dashboard || {};
  const readiness=data?.cost_readiness || [];
  const missingCosts=useMemo(()=>readiness.filter((r)=>r.cost_readiness!=="ready"),[readiness]);
  const batchCosts=data?.batch_costs || [];
  const finished=data?.finished_costs || [];
  const markets=data?.market_performance || [];
  const valuation=data?.inventory_valuation || [];

  const knownValue=valuation.reduce((sum,row)=>sum+(row.inventory_value==null?0:Number(row.inventory_value)),0);
  const valueMissing=valuation.filter((row)=>!row.cost_complete && Number(row.company_on_hand)!==0).length;

  return <>
    {error&&<div className="nfos-error">{error}</div>}

    <div className="nfos-page-head" style={{marginBottom:16}}>
      <div><h2>Management reporting</h2><p>Actual production costs, margin readiness, inventory value, and market performance from the NFOS ledger.</p></div>
      <button className="nfos-btn secondary" onClick={load} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button>
    </div>

    <div className="nfos-grid four" style={{marginBottom:16}}>
      <div className="nfos-stat"><div className="nfos-stat-label">Known inventory value</div><div className="nfos-stat-value">{money(k.known_inventory_value ?? knownValue)}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Missing cost items</div><div className="nfos-stat-value">{k.inventory_items_missing_cost ?? valueMissing}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Finished units · 30d</div><div className="nfos-stat-value">{qty(k.finished_units_30d)}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Market gross · 30d</div><div className="nfos-stat-value">{cents(k.market_gross_cents_30d)}</div></div>
    </div>

    <div className="nfos-inline-actions nfos-report-tabs">
      <button className={`nfos-btn ${section==="costing"?"":"secondary"}`} onClick={()=>setSection("costing")}>Costing</button>
      <button className={`nfos-btn ${section==="batches"?"":"secondary"}`} onClick={()=>setSection("batches")}>Batch history</button>
      <button className={`nfos-btn ${section==="markets"?"":"secondary"}`} onClick={()=>setSection("markets")}>Markets</button>
      <button className={`nfos-btn ${section==="valuation"?"":"secondary"}`} onClick={()=>setSection("valuation")}>Inventory value</button>
    </div>

    {section==="costing"&&<>
      <div className="nfos-grid four" style={{marginTop:16}}>
        <div className="nfos-stat"><div className="nfos-stat-label">Cost-controlled inputs</div><div className="nfos-stat-value">{dash.tracked_cost_items ?? readiness.length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Cost ready</div><div className="nfos-stat-value">{dash.cost_ready_items ?? 0}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Cost missing</div><div className="nfos-stat-value">{dash.missing_cost_items ?? missingCosts.length}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Known retail margin</div><div className="nfos-stat-value">{pct(dash.avg_current_retail_margin_percent)}</div></div>
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{marginBottom:12}}>
          <div><h3>Cost readiness</h3><p>A margin is only shown after every actual batch input has a trusted cost source.</p></div>
          {onOpenRoute&&<button className="nfos-btn ghost" onClick={()=>onOpenRoute("purchasing")}>Open Purchasing</button>}
        </div>
        {!missingCosts.length?<div className="nfos-empty">Every active material and packaging item has a usable cost source.</div>:
          <div className="nfos-table-wrap"><table className="nfos-table">
            <thead><tr><th>Item</th><th>Type</th><th>Unit</th><th>Status</th><th>Available cost source</th></tr></thead>
            <tbody>{missingCosts.map((r)=><tr key={r.item_id}>
              <td><strong>{r.name}</strong><div className="nfos-muted nfos-small">{r.sku}</div></td>
              <td>{String(r.item_type).replaceAll("_"," ")}</td>
              <td>{r.stocking_unit}</td>
              <td><Pill tone="low">Cost missing</Pill></td>
              <td>{r.latest_lot_unit_cost!=null?`Lot ${money(r.latest_lot_unit_cost)}`:r.standard_unit_cost!=null?`Standard ${money(r.standard_unit_cost)}`:r.supplier_last_unit_cost!=null?`Supplier ${money(r.supplier_last_unit_cost)}`:"None yet"}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>

      <div className="nfos-card">
        <h3>Finished SKU cost & retail margin</h3>
        {!finished.length?<div className="nfos-empty">No completed, costed production output exists yet. This table will populate automatically after real batches are completed with costed inputs.</div>:
          <div className="nfos-table-wrap"><table className="nfos-table">
            <thead><tr><th>Batch</th><th>SKU</th><th>Units</th><th>Cost / unit</th><th>Retail</th><th>Gross profit</th><th>Gross margin</th><th>Complete?</th></tr></thead>
            <tbody>{finished.map((r)=><tr key={`${r.batch_id}-${r.item_id}`}>
              <td><strong>{r.batch_code}</strong><div className="nfos-muted nfos-small">{fmtDate(r.completed_at)}</div></td>
              <td><strong>{r.finished_item_name}</strong><div className="nfos-muted nfos-small">{r.sku}</div></td>
              <td>{qty(r.finished_quantity)}</td>
              <td>{money(r.cost_per_unit)}</td>
              <td>{cents(r.current_retail_price_cents)}</td>
              <td>{money(r.retail_gross_profit_per_unit)}</td>
              <td>{pct(r.retail_gross_margin_percent)}</td>
              <td><Pill tone={r.cost_complete?"ok":"low"}>{r.cost_complete?"Yes":"No"}</Pill></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}

    {section==="batches"&&<div className="nfos-card">
      <h3>Actual production cost history</h3>
      {!batchCosts.length?<div className="nfos-empty">No completed production batches yet.</div>:
        <div className="nfos-table-wrap"><table className="nfos-table">
          <thead><tr><th>Batch</th><th>Recipe</th><th>Completed</th><th>Materials</th><th>Packaging</th><th>Total</th><th>Units</th><th>Cost status</th></tr></thead>
          <tbody>{batchCosts.map((b)=><tr key={b.batch_id}>
            <td className="nfos-mono">{b.batch_code}</td>
            <td><strong>{b.recipe_name}</strong><div className="nfos-muted nfos-small">{b.texture}</div></td>
            <td>{fmtDate(b.completed_at)}</td>
            <td>{money(b.material_cost)}</td>
            <td>{money(b.packaging_cost)}</td>
            <td><strong>{money(b.total_batch_cost)}</strong></td>
            <td>{qty(b.finished_units)}</td>
            <td><Pill tone={b.cost_complete?"ok":"low"}>{b.cost_complete?"Complete":`${b.missing_cost_lines} missing`}</Pill></td>
          </tr>)}</tbody>
        </table></div>}
    </div>}

    {section==="markets"&&<>
      <div className="nfos-grid three" style={{marginTop:16}}>
        <div className="nfos-stat"><div className="nfos-stat-label">Avg sell-through · 30d</div><div className="nfos-stat-value">{pct(k.avg_market_sell_through_30d)}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Reconciliation review</div><div className="nfos-stat-value">{k.market_reconciliations_needing_review ?? 0}</div></div>
        <div className="nfos-stat"><div className="nfos-stat-label">Market gross · 30d</div><div className="nfos-stat-value">{cents(k.market_gross_cents_30d)}</div></div>
      </div>
      <div className="nfos-card">
        <h3>Market performance</h3>
        {!markets.length?<div className="nfos-empty">Market performance will appear after NFOS market sessions are used.</div>:
          <div className="nfos-table-wrap"><table className="nfos-table">
            <thead><tr><th>Date</th><th>Venue</th><th>Operator</th><th>Loaded</th><th>Sold</th><th>Sell-through</th><th>Gross</th><th>Avg / unit</th><th>Square status</th></tr></thead>
            <tbody>{markets.map((m)=><tr key={m.session_id}>
              <td>{fmtDate(m.market_day)}</td>
              <td><strong>{m.venue_name}</strong></td>
              <td>{m.assigned_member_name || "—"}</td>
              <td>{qty(m.units_loaded)}</td>
              <td>{qty(m.units_sold)}</td>
              <td>{pct(m.sell_through_percent)}</td>
              <td>{cents(m.recorded_gross_cents)}</td>
              <td>{money(m.average_revenue_per_unit)}</td>
              <td><Pill tone={m.reconciliation_status==="review_required"?"low":m.reconciliation_status==="matched"?"ok":""}>{m.reconciliation_status?String(m.reconciliation_status).replaceAll("_"," "):"Not synced"}</Pill></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </>}

    {section==="valuation"&&<div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div><h3>Inventory valuation</h3><p>Only items with a trusted current cost are included in the known inventory value.</p></div>
        <div className="nfos-inline-actions"><Pill tone={valueMissing?"low":"ok"}>{valueMissing} missing cost</Pill><Pill>{money(knownValue)} known value</Pill></div>
      </div>
      {!valuation.length?<div className="nfos-empty">No company inventory is currently on hand.</div>:
        <div className="nfos-table-wrap"><table className="nfos-table">
          <thead><tr><th>Item</th><th>Type</th><th>On hand</th><th>Current cost</th><th>Inventory value</th><th>Status</th></tr></thead>
          <tbody>{valuation.map((r)=><tr key={r.item_id}>
            <td><strong>{r.name}</strong><div className="nfos-muted nfos-small">{r.sku}</div></td>
            <td>{String(r.item_type).replaceAll("_"," ")}</td>
            <td>{qty(r.company_on_hand)} {r.stocking_unit}</td>
            <td>{money(r.current_unit_cost)}</td>
            <td>{money(r.inventory_value)}</td>
            <td><Pill tone={r.cost_complete?"ok":"low"}>{r.cost_complete?"Costed":"Missing cost"}</Pill></td>
          </tr>)}</tbody>
        </table></div>}
    </div>}
  </>;
}

