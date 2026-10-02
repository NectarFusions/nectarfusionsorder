import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosAlphaBand, { alphaRangeMatch } from "./NfosAlphaBand";

const qty = (v) => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const dateTime = (v) => v ? new Date(v).toLocaleString() : "Not confirmed";

export default function NfosFlavorAvailability() {
  const [data, setData] = useState({ products: [] });
  const [search, setSearch] = useState("");
  const [alpha, setAlpha] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await nfos.getProductAvailability();
      setData(result || { products: [] });
      setSelectedId((current) => current && result?.products?.some((p) => p.flavor_id === current) ? current : result?.products?.[0]?.flavor_id || "");
    } catch (err) {
      setError(err?.message || "Could not load flavor availability.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data.products || []).filter((p) => {
    const hay = `${p.display_name} ${p.category || ""} ${p.product_tier || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase()) && alphaRangeMatch(p.display_name, alpha);
  }), [data.products, search, alpha]);

  const selected = (data.products || []).find((p) => p.flavor_id === selectedId) || null;

  return <>
    {error && <div className="nfos-error">{error}</div>}
    <div className="nfos-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div><h2>Flavor Availability</h2><p>Read-only view of current NFOS inventory plus last-known retail availability.</p></div>
        <button className="nfos-btn secondary" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
      <div className="nfos-note">
        <strong>How to read this:</strong> Company and active-market counts are live NFOS quantities. Independent retail-store availability is the last information NFOS has confirmed from fulfillment or a future store count; it is not presented as an exact shelf count unless a quantity was actually confirmed.
      </div>
      <div className="nfos-filterbar" style={{ marginTop: 12 }}><input placeholder="Search flavor…" value={search} onChange={(e) => setSearch(e.target.value)} /><span className="nfos-muted nfos-small">{rows.length} flavors</span></div>
      <NfosAlphaBand value={alpha} onChange={setAlpha} label="Flavors A–Z" />
      <div className="nfos-table-wrap"><table className="nfos-table">
        <thead><tr><th>Flavor</th><th>Status</th><th>Company stock</th><th>At active markets</th><th>Retail locations</th><th></th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.flavor_id}>
          <td><strong>{p.display_name}</strong><div className="nfos-muted nfos-small">{p.category || "—"}{p.product_tier ? ` · ${p.product_tier}` : ""}</div></td>
          <td><span className="nfos-pill">{String(p.product_status || "").replaceAll("_", " ")}</span></td>
          <td><strong>{qty(p.company_on_hand)}</strong></td>
          <td><strong>{qty(p.market_on_hand)}</strong></td>
          <td>{(p.retail_locations || []).filter((r) => ["in_stock", "low"].includes(r.availability_status)).length}</td>
          <td><button className="nfos-btn ghost" onClick={() => setSelectedId(p.flavor_id)}>View</button></td>
        </tr>)}</tbody>
      </table></div>
    </div>

    {selected && <div className="nfos-grid three nfos-availability-detail">
      <div className="nfos-card">
        <h3>{selected.display_name} · Company</h3>
        <div className="nfos-stat-value">{qty(selected.company_on_hand)}</div>
        {(selected.company_locations || []).length ? (selected.company_locations || []).map((l) => <div className="nfos-availability-row" key={l.location_id}><span>{l.location_name}</span><strong>{qty(l.on_hand)}</strong></div>) : <div className="nfos-muted">No company stock currently recorded.</div>}
      </div>

      <div className="nfos-card">
        <h3>Active markets</h3>
        <div className="nfos-stat-value">{qty(selected.market_on_hand)}</div>
        {(selected.markets || []).length ? (selected.markets || []).map((m) => <div className="nfos-availability-row" key={m.session_id}><span>{m.venue_name}<small>{m.market_day}</small></span><strong>{qty(m.on_hand)}</strong></div>) : <div className="nfos-muted">Not currently loaded at an active market.</div>}
      </div>

      <div className="nfos-card">
        <h3>Retail stores · last known</h3>
        {(selected.retail_locations || []).length ? (selected.retail_locations || []).map((r) => <div className="nfos-retail-availability" key={r.retail_location_id}>
          <div className="nfos-split-head"><strong>{r.location_name}</strong><span className={`nfos-pill ${r.availability_status === "in_stock" ? "ok" : r.availability_status === "out_of_stock" ? "low" : ""}`}>{String(r.availability_status || "unknown").replaceAll("_", " ")}</span></div>
          <div className="nfos-muted nfos-small">{[r.address_line_1, r.city, r.state, r.zip].filter(Boolean).join(", ")}</div>
          <div className="nfos-small">Quantity: <strong>{r.quantity_on_hand == null ? "Not independently counted" : qty(r.quantity_on_hand)}</strong></div>
          <div className="nfos-muted nfos-small">Last confirmed: {dateTime(r.last_confirmed_at)}</div>
        </div>) : <div className="nfos-muted">No retail-store availability has been confirmed yet.</div>}
      </div>
    </div>}
  </>;
}
