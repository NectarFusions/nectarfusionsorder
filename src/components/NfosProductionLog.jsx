import { useMemo, useState } from "react";
import { workbookProductionHistory } from "../data/nfosWorkbookHistory";

const qty=(value)=>{
  if(value==null || value==="")return "—";
  const num=Number(value);
  return Number.isInteger(num)?String(num):num.toLocaleString(undefined,{maximumFractionDigits:4});
};

const pretty=(value)=>String(value||"").replaceAll("_"," ").replace(/\b\w/g,(m)=>m.toUpperCase());

export default function NfosProductionLog({ batches = [], onOpenBatch, onRefresh, busy }) {
  const [search,setSearch]=useState("");
  const [source,setSource]=useState("all");

  const legacy=useMemo(()=>workbookProductionHistory.map((row)=>({
    ...row,
    record_key:`workbook-${row.source_row}`,
    source:"Workbook history",
    sort_date:row.production_date,
  })),[]);

  const live=useMemo(()=>batches.map((batch)=>({
    record_key:`live-${batch.id}`,
    source:"NFOS",
    production_date:batch.started_at ? String(batch.started_at).slice(0,10) : batch.created_at ? String(batch.created_at).slice(0,10) : null,
    sort_date:batch.started_at || batch.created_at || "",
    batch_code:batch.batch_code,
    flavor:batch.flavor_name || batch.recipe_name,
    honey_used_lbs:null,
    extra_honey_oz:null,
    total_honey_oz:null,
    honey_lot_code:null,
    infusion_used_oz:null,
    suggested_infusion_oz:null,
    four_oz_yield:null,
    operator_name:null,
    status:pretty(batch.status),
    suggested_label_code:null,
    notes:batch.notes,
    batch_id:batch.id,
    planned_quantity:batch.planned_quantity,
    planned_unit:batch.planned_unit,
    texture:batch.texture,
  })),[batches]);

  const rows=useMemo(()=>[...legacy,...live]
    .filter((row)=>{
      if(source!=="all" && row.source!==source)return false;
      const hay=`${row.production_date||""} ${row.batch_code||""} ${row.flavor||""} ${row.honey_lot_code||""} ${row.operator_name||""} ${row.status||""} ${row.suggested_label_code||""} ${row.notes||""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    })
    .sort((a,b)=>String(b.sort_date||b.production_date||"").localeCompare(String(a.sort_date||a.production_date||""))),
    [legacy,live,source,search]);

  return <div className="nfos-card">
    <div className="nfos-page-head">
      <div>
        <h2>Production Log</h2>
        <p>One row per batch, using the same left-to-right workflow as the workbook Production tab. Historical workbook batches are reference-only; new NFOS batches remain fully traceable.</p>
      </div>
      <button className="nfos-btn secondary" onClick={onRefresh} disabled={busy}>{busy?"Refreshing…":"Refresh"}</button>
    </div>

    <div className="nfos-grid four" style={{marginBottom:14}}>
      <div className="nfos-stat"><div className="nfos-stat-label">Workbook batches</div><div className="nfos-stat-value">{legacy.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">NFOS batches</div><div className="nfos-stat-value">{live.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Visible rows</div><div className="nfos-stat-value">{rows.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Layout</div><div className="nfos-stat-value nfos-stat-word">LOG</div></div>
    </div>

    <div className="nfos-filterbar">
      <input placeholder="Search batch, flavor, honey lot, operator or label…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
      <select value={source} onChange={(e)=>setSource(e.target.value)}>
        <option value="all">All production</option>
        <option value="Workbook history">Workbook history</option>
        <option value="NFOS">NFOS live batches</option>
      </select>
    </div>

    <div className="nfos-table-wrap nfos-workbook-ledger">
      <table className="nfos-table nfos-production-ledger">
        <thead><tr>
          <th>Date</th><th>Batch Code</th><th>Flavor</th><th>Honey Used (lbs)</th><th>Extra Honey (oz)</th>
          <th>Total Honey (oz)</th><th>Honey Lot #</th><th>Infusion Used (oz)</th><th>Suggested Infusion (oz)</th>
          <th>4oz Yield</th><th>Operator</th><th>Status</th><th>Suggested Label Code</th><th>Notes</th>
        </tr></thead>
        <tbody>{rows.map((row)=><tr key={row.record_key} className={row.source==="NFOS"?"nfos-live-ledger-row":""}>
          <td>{row.production_date||"—"}<div className="nfos-muted nfos-small">{row.source}</div></td>
          <td className="nfos-mono">
            <strong>{row.batch_code||"—"}</strong>
            {row.batch_id&&<button type="button" className="nfos-ledger-link" onClick={()=>onOpenBatch?.(row.batch_id)}>Open batch</button>}
          </td>
          <td><strong>{row.flavor||"—"}</strong>{row.texture==="spun"&&<div className="nfos-muted nfos-small">Spun</div>}</td>
          <td>{row.honey_used_lbs==null ? <>{qty(row.honey_used_lbs)}{row.planned_unit==="lb"&&<div className="nfos-muted nfos-small">Planned {qty(row.planned_quantity)} lb</div>}</> : qty(row.honey_used_lbs)}</td>
          <td>{qty(row.extra_honey_oz)}</td>
          <td>{qty(row.total_honey_oz)}</td>
          <td className="nfos-mono">{row.honey_lot_code||"—"}</td>
          <td>{qty(row.infusion_used_oz)}</td>
          <td>{qty(row.suggested_infusion_oz)}</td>
          <td>{qty(row.four_oz_yield)}</td>
          <td>{row.operator_name||"—"}</td>
          <td><span className="nfos-pill">{row.status||"—"}</span></td>
          <td className="nfos-mono">{row.suggested_label_code||"—"}</td>
          <td>{row.notes||"—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
