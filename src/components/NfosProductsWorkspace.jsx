import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosAlphaBand, { alphaRangeMatch } from "./NfosAlphaBand";

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

const qty = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const MONTHS = [
  ["", "—"], ["1", "Jan"], ["2", "Feb"], ["3", "Mar"], ["4", "Apr"], ["5", "May"], ["6", "Jun"],
  ["7", "Jul"], ["8", "Aug"], ["9", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dec"],
];

export default function NfosProductsWorkspace() {
  const [data, setData] = useState({ products: [] });
  const [availability, setAvailability] = useState({ products: [] });
  const [retailLocations, setRetailLocations] = useState([]);
  const [search, setSearch] = useState("");
  const [alpha, setAlpha] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retailDraft, setRetailDraft] = useState({ retailLocationId: "", itemId: "", status: "in_stock", quantity: "", notes: "" });

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [result, availabilityResult, directory] = await Promise.all([
        nfos.getProductsWorkspace(),
        nfos.getProductAvailability(),
        nfos.getRetailLocationDirectory(),
      ]);
      setData(result || { products: [] });
      setAvailability(availabilityResult || { products: [] });
      setRetailLocations(directory?.locations || []);
      const products = result?.products || [];
      setSelectedId((current) => current && products.some((p) => p.flavor_id === current) ? current : products[0]?.flavor_id || "");
    } catch (err) {
      setError(err?.message || "Could not load Product Master.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data.products || []).filter((p) => {
    const hay = `${p.display_name} ${p.category || ""} ${p.product_tier || ""} ${p.product_status || ""}`.toLowerCase();
    return hay.includes(search.toLowerCase()) && alphaRangeMatch(p.display_name, alpha);
  }), [data.products, search, alpha]);

  const selected = (data.products || []).find((p) => p.flavor_id === selectedId) || null;
  const selectedAvailability = (availability.products || []).find((p) => p.flavor_id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({
      flavorId: selected.flavor_id,
      productStatus: selected.product_status || "active",
      category: selected.category || "",
      productTier: selected.product_tier || "",
      seasonality: selected.seasonality || "year_round",
      seasonStartMonth: selected.season_start_month ?? "",
      seasonEndMonth: selected.season_end_month ?? "",
      primaryRecipeId: selected.primary_recipe_id || "",
      shortDescription: selected.short_description || "",
      internalNotes: selected.internal_notes || "",
      variants: (selected.variants || []).map((v) => ({
        ...v,
        priceDollars: v.retail_price_cents == null ? "" : (Number(v.retail_price_cents) / 100).toFixed(2),
        reorderPoint: v.reorder_point ?? "",
        targetStock: v.target_stock ?? "",
        maxStock: v.max_stock ?? "",
        active: Boolean(v.active),
      })),
    });
  }, [selectedId, selected?.flavor_id, selected?.product_status, selected?.primary_recipe_id]);

  const setVariant = (itemId, patch) => {
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((v) => v.item_id === itemId ? { ...v, ...patch } : v),
    }));
  };

  const saveRetailAvailability = async () => {
    if (!retailDraft.retailLocationId || !retailDraft.itemId) {
      setError("Choose a retail location and product variant.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await nfos.setRetailItemAvailability({
        retailLocationId: retailDraft.retailLocationId,
        itemId: retailDraft.itemId,
        availabilityStatus: retailDraft.status,
        quantityOnHand: retailDraft.quantity === "" ? null : Number(retailDraft.quantity),
        source: "manual_admin",
        sourceReference: null,
        notes: retailDraft.notes || null,
      });
      setMessage("Retail availability saved.");
      setRetailDraft((current) => ({ ...current, quantity: "", notes: "" }));
      await load();
    } catch (err) {
      setError(err?.message || "Could not save retail availability.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await nfos.updateProductMaster({
        ...draft,
        variants: draft.variants.map((v) => ({
          item_id: v.item_id,
          retail_price_cents: v.priceDollars === "" ? null : Math.round(Number(v.priceDollars) * 100),
          reorder_point: v.reorderPoint === "" ? null : Number(v.reorderPoint),
          target_stock: v.targetStock === "" ? null : Number(v.targetStock),
          max_stock: v.maxStock === "" ? null : Number(v.maxStock),
          active: Boolean(v.active),
        })),
      });
      setMessage(`${selected.display_name} Product Master saved.`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not save Product Master.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    {error && <div className="nfos-error">{error}</div>}
    {message && <div className="nfos-success">{message}</div>}

    <div className="nfos-grid four" style={{ marginBottom: 16 }}>
      <div className="nfos-stat"><div className="nfos-stat-label">Products</div><div className="nfos-stat-value">{data.products?.length || 0}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Active / Seasonal</div><div className="nfos-stat-value">{(data.products || []).filter((p) => ["active", "seasonal", "limited"].includes(p.product_status)).length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Company jars</div><div className="nfos-stat-value">{qty((data.products || []).reduce((sum, p) => sum + Number(p.company_on_hand || 0), 0))}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">30-day market sales</div><div className="nfos-stat-value">{qty((data.products || []).reduce((sum, p) => sum + Number(p.units_sold_30d || 0), 0))}</div></div>
    </div>

    <div className="nfos-grid two nfos-product-master-grid">
      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 10 }}>
          <div><h2>Products / Flavors</h2><p>Business master. Recipes define how it is made; Items remain the physical SKU variants underneath.</p></div>
          <span className="nfos-pill">{rows.length} shown</span>
        </div>
        <div className="nfos-filterbar"><input placeholder="Search product, category or tier…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <NfosAlphaBand value={alpha} onChange={setAlpha} label="Products A–Z" />
        <div className="nfos-select-list nfos-product-list">
          {rows.map((p) => <button key={p.flavor_id} className={selectedId === p.flavor_id ? "active" : ""} onClick={() => setSelectedId(p.flavor_id)}>
            <span>
              <strong>{p.display_name}</strong>
              <small>{p.category || "Uncategorized"} · {String(p.product_status || "").replaceAll("_", " ")}</small>
            </span>
            <span className="nfos-inline-actions">
              <span className="nfos-pill">{qty(p.company_on_hand)} jars</span>
              <span className="nfos-pill">{money(p.revenue_30d_cents)} / 30d</span>
            </span>
          </button>)}
        </div>
      </div>

      <div className="nfos-card">
        {!draft || !selected ? <div className="nfos-empty">Select a product to manage its business rules.</div> : <>
          <div className="nfos-page-head" style={{ marginBottom: 14 }}>
            <div><h2>{selected.display_name}</h2><p>One business product → one primary recipe → multiple sellable size / texture SKUs.</p></div>
            <button className="nfos-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Product"}</button>
          </div>

          <div className="nfos-grid four" style={{ marginBottom: 16 }}>
            <div className="nfos-stat"><div className="nfos-stat-label">Company stock</div><div className="nfos-stat-value">{qty(selected.company_on_hand)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">30-day units</div><div className="nfos-stat-value">{qty(selected.units_sold_30d)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">30-day revenue</div><div className="nfos-stat-value">{money(selected.revenue_30d_cents)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">All-time revenue</div><div className="nfos-stat-value">{money(selected.revenue_all_time_cents)}</div></div>
          </div>

          <div className="nfos-form">
            <div className="nfos-field"><label>Product status</label><select value={draft.productStatus} onChange={(e) => setDraft({ ...draft, productStatus: e.target.value })}>
              <option value="active">Active</option><option value="seasonal">Seasonal</option><option value="limited">Limited</option><option value="development">Development</option><option value="retired">Retired</option>
            </select></div>
            <div className="nfos-field"><label>Category</label><input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Core, wellness, spicy, seasonal…" /></div>
            <div className="nfos-field"><label>Product tier</label><input value={draft.productTier} onChange={(e) => setDraft({ ...draft, productTier: e.target.value })} placeholder="Core, signature, limited…" /></div>
            <div className="nfos-field"><label>Seasonality</label><select value={draft.seasonality} onChange={(e) => setDraft({ ...draft, seasonality: e.target.value })}>
              <option value="year_round">Year round</option><option value="seasonal">Seasonal</option><option value="limited">Limited</option><option value="custom">Custom</option>
            </select></div>
            <div className="nfos-field"><label>Season starts</label><select value={draft.seasonStartMonth} onChange={(e) => setDraft({ ...draft, seasonStartMonth: e.target.value })}>{MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="nfos-field"><label>Season ends</label><select value={draft.seasonEndMonth} onChange={(e) => setDraft({ ...draft, seasonEndMonth: e.target.value })}>{MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="nfos-field full"><label>Primary recipe</label><select value={draft.primaryRecipeId} onChange={(e) => setDraft({ ...draft, primaryRecipeId: e.target.value })}>
              <option value="">No primary recipe</option>
              {(selected.recipes || []).map((r) => <option key={r.id} value={r.id}>{r.name} · v{r.version} · {r.status}</option>)}
            </select></div>
            <div className="nfos-field full"><label>Short product description</label><textarea value={draft.shortDescription} onChange={(e) => setDraft({ ...draft, shortDescription: e.target.value })} /></div>
            <div className="nfos-field full"><label>Internal product notes</label><textarea value={draft.internalNotes} onChange={(e) => setDraft({ ...draft, internalNotes: e.target.value })} /></div>
          </div>

          <div className="nfos-product-variants">
            <h3>Sellable variants</h3>
            <p className="nfos-muted">Price and stock rules belong to the finished-good SKU. Saving here updates the same Item record used everywhere else.</p>
            <div className="nfos-table-wrap"><table className="nfos-table">
              <thead><tr><th>Variant</th><th>SKU</th><th>On hand</th><th>Retail $</th><th>Reorder</th><th>Target</th><th>Max</th><th>Active</th></tr></thead>
              <tbody>{draft.variants.map((v) => <tr key={v.item_id}>
                <td><strong>{v.size_label}</strong><div className="nfos-muted nfos-small">{v.texture || "regular"}</div></td>
                <td className="nfos-mono">{v.sku}</td>
                <td>{qty(v.company_on_hand)}</td>
                <td><input className="nfos-inline-number" type="number" min="0" step="0.01" value={v.priceDollars} onChange={(e) => setVariant(v.item_id, { priceDollars: e.target.value })} /></td>
                <td><input className="nfos-inline-number" type="number" min="0" step="any" value={v.reorderPoint} onChange={(e) => setVariant(v.item_id, { reorderPoint: e.target.value })} /></td>
                <td><input className="nfos-inline-number" type="number" min="0" step="any" value={v.targetStock} onChange={(e) => setVariant(v.item_id, { targetStock: e.target.value })} /></td>
                <td><input className="nfos-inline-number" type="number" min="0" step="any" value={v.maxStock} onChange={(e) => setVariant(v.item_id, { maxStock: e.target.value })} /></td>
                <td><input type="checkbox" checked={v.active} onChange={(e) => setVariant(v.item_id, { active: e.target.checked })} /></td>
              </tr>)}</tbody>
            </table></div>
          </div>

          <div className="nfos-product-variants">
            <div className="nfos-page-head" style={{ marginBottom: 10 }}>
              <div><h3>Retail availability</h3><p>Set last-known store availability for this flavor. Market Management sees this read-only.</p></div>
            </div>
            <div className="nfos-form">
              <div className="nfos-field"><label>Retail location</label><select value={retailDraft.retailLocationId} onChange={(e) => setRetailDraft({ ...retailDraft, retailLocationId: e.target.value })}>
                <option value="">Choose store…</option>
                {retailLocations.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.city}, {r.state}</option>)}
              </select></div>
              <div className="nfos-field"><label>Variant</label><select value={retailDraft.itemId} onChange={(e) => setRetailDraft({ ...retailDraft, itemId: e.target.value })}>
                <option value="">Choose size / texture…</option>
                {draft.variants.map((v) => <option key={v.item_id} value={v.item_id}>{v.size_label} · {v.texture || "regular"}</option>)}
              </select></div>
              <div className="nfos-field"><label>Status</label><select value={retailDraft.status} onChange={(e) => setRetailDraft({ ...retailDraft, status: e.target.value })}>
                <option value="in_stock">In stock</option><option value="low">Low</option><option value="out_of_stock">Out of stock</option><option value="unknown">Unknown</option>
              </select></div>
              <div className="nfos-field"><label>Confirmed quantity (optional)</label><input type="number" min="0" step="1" value={retailDraft.quantity} onChange={(e) => setRetailDraft({ ...retailDraft, quantity: e.target.value })} /></div>
              <div className="nfos-field full"><label>Availability note</label><input value={retailDraft.notes} onChange={(e) => setRetailDraft({ ...retailDraft, notes: e.target.value })} placeholder="Optional context about the store count or confirmation" /></div>
              <div className="nfos-field full"><button className="nfos-btn secondary" type="button" onClick={saveRetailAvailability} disabled={busy}>Save retail availability</button></div>
            </div>

            <div className="nfos-retail-admin-list">
              {(selectedAvailability?.retail_locations || []).length ? (selectedAvailability.retail_locations || []).map((r) => <div className="nfos-retail-availability" key={r.retail_location_id}>
                <div className="nfos-split-head"><strong>{r.location_name}</strong><span className="nfos-pill">{String(r.availability_status || "unknown").replaceAll("_", " ")}</span></div>
                <div className="nfos-muted nfos-small">{[r.address_line_1, r.city, r.state, r.zip].filter(Boolean).join(", ")}</div>
                <div className="nfos-small">Quantity: <strong>{r.quantity_on_hand == null ? "Not independently counted" : qty(r.quantity_on_hand)}</strong></div>
              </div>) : <div className="nfos-empty">No retail availability is recorded for this flavor yet.</div>}
            </div>
          </div>
        </>}
      </div>
    </div>
  </>;
}
