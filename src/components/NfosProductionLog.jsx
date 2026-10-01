import { useMemo, useState } from "react";
import { workbookProductionHistory } from "../data/nfosWorkbookHistory";

const qty = (value) => {
  if (value == null || value === "") return "—";
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const pretty = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());

function Th({ label, sublabel = "", className = "" }) {
  return (
    <th className={className}>
      <div className="nfos-ledger-th-main">{label}</div>
      {sublabel ? <div className="nfos-ledger-th-sub">{sublabel}</div> : null}
    </th>
  );
}

export default function NfosProductionLog({ batches = [], onOpenBatch, onRefresh, busy }) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");

  const legacy = useMemo(() => workbookProductionHistory.map((row) => ({
    ...row,
    record_key: `workbook-${row.source_row}`,
    source: "Workbook history",
    sort_date: row.production_date,
  })), []);

  const live = useMemo(() => batches.map((batch) => ({
    record_key: `live-${batch.id}`,
    source: "NFOS",
    production_date: batch.started_at ? String(batch.started_at).slice(0, 10) : batch.created_at ? String(batch.created_at).slice(0, 10) : null,
    sort_date: batch.started_at || batch.created_at || "",
    batch_code: batch.batch_code,
    flavor: batch.flavor_name || batch.recipe_name,
    honey_used_lbs: null,
    extra_honey_oz: null,
    total_honey_oz: null,
    honey_lot_code: null,
    infusion_used_oz: null,
    suggested_infusion_oz: null,
    four_oz_yield: null,
    operator_name: null,
    status: pretty(batch.status),
    suggested_label_code: null,
    notes: batch.notes,
    batch_id: batch.id,
    planned_quantity: batch.planned_quantity,
    planned_unit: batch.planned_unit,
    texture: batch.texture,
  })), [batches]);

  const rows = useMemo(() => [...legacy, ...live]
    .filter((row) => {
      if (source !== "all" && row.source !== source) return false;
      const hay = `${row.production_date || ""} ${row.batch_code || ""} ${row.flavor || ""} ${row.honey_lot_code || ""} ${row.operator_name || ""} ${row.status || ""} ${row.suggested_label_code || ""} ${row.notes || ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    })
    .sort((a, b) => String(b.sort_date || b.production_date || "").localeCompare(String(a.sort_date || a.production_date || ""))),
  [legacy, live, source, search]);

  return <div className="nfos-card nfos-production-log-card">
    <div className="nfos-page-head">
      <div>
        <h2>Production Log</h2>
        <p>One row per batch, with a desktop-friendly ledger layout based on the workbook Production tab.</p>
      </div>
      <button className="nfos-btn secondary" onClick={onRefresh} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
    </div>

    <div className="nfos-grid four" style={{ marginBottom: 14 }}>
      <div className="nfos-stat"><div className="nfos-stat-label">Workbook batches</div><div className="nfos-stat-value">{legacy.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">NFOS batches</div><div className="nfos-stat-value">{live.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Visible rows</div><div className="nfos-stat-value">{rows.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Layout</div><div className="nfos-stat-value nfos-stat-word">DESKTOP LOG</div></div>
    </div>

    <div className="nfos-note nfos-production-log-note">
      <strong>Desktop tip:</strong> the first three columns stay readable, and the table scrolls horizontally for the rest of the batch details. The goal is easier scanning, not squeezing every column into a narrow space.
    </div>

    <div className="nfos-filterbar">
      <input placeholder="Search batch, flavor, honey lot, operator or label…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select value={source} onChange={(e) => setSource(e.target.value)}>
        <option value="all">All production</option>
        <option value="Workbook history">Workbook history</option>
        <option value="NFOS">NFOS live batches</option>
      </select>
    </div>

    <div className="nfos-table-wrap nfos-workbook-ledger nfos-production-log-wrap">
      <table className="nfos-table nfos-production-ledger nfos-production-ledger-readable">
        <colgroup>
          <col style={{ width: "132px" }} />
          <col style={{ width: "150px" }} />
          <col style={{ width: "165px" }} />
          <col style={{ width: "112px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "112px" }} />
          <col style={{ width: "126px" }} />
          <col style={{ width: "118px" }} />
          <col style={{ width: "128px" }} />
          <col style={{ width: "98px" }} />
          <col style={{ width: "128px" }} />
          <col style={{ width: "110px" }} />
          <col style={{ width: "140px" }} />
          <col style={{ width: "260px" }} />
        </colgroup>
        <thead>
          <tr>
            <Th label="Date" sublabel="Production date" className="is-sticky-1" />
            <Th label="Batch Code" sublabel="NFOS / workbook" className="is-sticky-2" />
            <Th label="Flavor" sublabel="Recipe / flavor" className="is-sticky-3" />
            <Th label="Honey Used" sublabel="lbs" />
            <Th label="Extra Honey" sublabel="oz" />
            <Th label="Total Honey" sublabel="oz" />
            <Th label="Honey Lot #" sublabel="Lot code" />
            <Th label="Infusion Used" sublabel="oz" />
            <Th label="Suggested Infusion" sublabel="oz" />
            <Th label="4oz Yield" sublabel="jars" />
            <Th label="Operator" sublabel="Assigned / recorded" />
            <Th label="Status" sublabel="Batch stage" />
            <Th label="Suggested Label Code" sublabel="Reference" />
            <Th label="Notes" sublabel="Comments" />
          </tr>
        </thead>
        <tbody>{rows.map((row) => <tr key={row.record_key} className={row.source === "NFOS" ? "nfos-live-ledger-row" : ""}>
          <td className="is-sticky-1 nfos-ledger-date-cell">
            <strong>{row.production_date || "—"}</strong>
            <div className="nfos-muted nfos-small">{row.source}</div>
          </td>
          <td className="is-sticky-2 nfos-ledger-batch-cell">
            <div className="nfos-mono"><strong>{row.batch_code || "—"}</strong></div>
            {row.batch_id && <button type="button" className="nfos-ledger-link" onClick={() => onOpenBatch?.(row.batch_id)}>Open batch</button>}
          </td>
          <td className="is-sticky-3 nfos-ledger-flavor-cell">
            <strong>{row.flavor || "—"}</strong>
            {row.texture === "spun" && <div className="nfos-muted nfos-small">Spun</div>}
          </td>
          <td className="nfos-ledger-num">{row.honey_used_lbs == null ? <>{qty(row.honey_used_lbs)}{row.planned_unit === "lb" && <div className="nfos-muted nfos-small">Planned {qty(row.planned_quantity)} lb</div>}</> : qty(row.honey_used_lbs)}</td>
          <td className="nfos-ledger-num">{qty(row.extra_honey_oz)}</td>
          <td className="nfos-ledger-num">{qty(row.total_honey_oz)}</td>
          <td className="nfos-mono">{row.honey_lot_code || "—"}</td>
          <td className="nfos-ledger-num">{qty(row.infusion_used_oz)}</td>
          <td className="nfos-ledger-num">{qty(row.suggested_infusion_oz)}</td>
          <td className="nfos-ledger-num">{qty(row.four_oz_yield)}</td>
          <td>{row.operator_name || "—"}</td>
          <td><span className="nfos-pill">{row.status || "—"}</span></td>
          <td className="nfos-mono">{row.suggested_label_code || "—"}</td>
          <td className="nfos-ledger-notes">{row.notes || "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
