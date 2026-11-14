import { useState } from "react";
import "./BulkHoneyPage.css";

// Each server-priced size is a distinct SKU. Never charge an infused price
// from a raw size record (or vice versa).
const PRODUCTS = [
  { id: "bulk-3lb-original", volume: "3 lb", kind: "raw", name: "Original Raw Michigan Honey", expected: 40, credit: 2 },
  { id: "bulk-3lb-infused", volume: "3 lb", kind: "infused", name: "Infused Michigan Honey", expected: 55, credit: 2 },
  { id: "bulk-6lb-original", volume: "6 lb · Half Gallon", kind: "raw", name: "Original Raw Michigan Honey", expected: 70, credit: 4 },
  { id: "bulk-6lb-infused", volume: "6 lb · Half Gallon", kind: "infused", name: "Infused Michigan Honey", expected: 95, credit: 4 },
];

const isRaw = (name) => String(name || "").trim().toLowerCase() === "original";

const stockRemaining = (flavor, sizeId, cart) => {
  if (!flavor) return 0;
  const row = flavor.stock?.[`${sizeId}:regular`];
  // Bulk products must have explicitly counted, enabled inventory.
  if (row?.in_stock !== true || !Number.isInteger(row.on_hand)) return 0;
  const inCart = (cart || []).filter((line) =>
    line.flavor_id === flavor.id && line.size_id === sizeId && line.type === "regular"
  ).reduce((n, line) => n + Number(line.qty || 0), 0);
  return Math.max(0, row.on_hand - inCart);
};

export function JarReturnCheckout({ eligible3, eligible6, requested3, requested6, onChange, method }) {
  if (!(eligible3 || eligible6)) return null;
  const localOnly = method === "market" || method === "delivery";
  const projected = (localOnly ? requested3 * 2 + requested6 * 4 : 0);
  return (
    <div className="nf-jar-return-checkout">
      <div className="nf-bulk-eyebrow">Jar Return Rewards</div>
      <strong>Bringing back a NectarFusions jar?</strong>
      <p>Request your return reward here. One qualifying jar per matching-size honey purchase. We verify the empty, undamaged jar at handoff.</p>
      {localOnly ? (
        <div className="nf-jar-return-selects">
          {eligible3 > 0 && (
            <label>3 lb jars to return <small>($2 each, up to {eligible3})</small>
              <input type="number" min="0" max={eligible3} step="1" inputMode="numeric" value={requested3}
                onChange={(e) => onChange("threeLb", Math.max(0, Math.min(eligible3, Number.parseInt(e.target.value, 10) || 0)))} />
            </label>
          )}
          {eligible6 > 0 && (
            <label>6 lb jars to return <small>($4 each, up to {eligible6})</small>
              <input type="number" min="0" max={eligible6} step="1" inputMode="numeric" value={requested6}
                onChange={(e) => onChange("sixLb", Math.max(0, Math.min(eligible6, Number.parseInt(e.target.value, 10) || 0)))} />
            </label>
          )}
          {projected > 0 && <div className="nf-jar-projected-credit">Potential return credit: ${projected.toFixed(2)} · pending inspection</div>}
        </div>
      ) : (
        <p className="nf-bulk-reward-caution">Jar returns are accepted during eligible local pickup or delivery. Choose a local option to request credit; shipping orders require a separate return arrangement.</p>
      )}
      <small>Checkout charges the regular price. After we receive and approve your jar, we will process the qualifying credit separately. Do not refill jars at pickup.</small>
    </div>
  );
}

export function BulkHoneyHomepageFeature({ onOpen }) {
  return (
    <section className="nf-wrap nf-bulk-home-teaser" aria-label="Bulk honey and jar return rewards">
      <div>
        <span className="nf-bulk-eyebrow">More honey · Less waste</span>
        <h2>Big Jars. Better Value.</h2>
        <p>Shop 3 lb and half-gallon Michigan honey, plus earn $2 or $4 back when you return an eligible NectarFusions jar.</p>
      </div>
      <button type="button" className="nf-bulk-link-button" onClick={onOpen}>Explore Bulk Honey &amp; Jar Rewards →</button>
    </section>
  );
}

export default function BulkHoneyPage({ Header, styles, catalog, cart, onShop, onAddBulk }) {
  const [chosenInfusedFlavor, setChosenInfusedFlavor] = useState({});
  const flavors = (catalog?.flavors || []).filter((f) => f.active !== false);
  const rawFlavor = flavors.find((f) => isRaw(f.name));
  const infusedFlavors = flavors.filter((f) => !isRaw(f.name));
  return (
    <div className="nf nf-bulk-page">
      <style>{styles}</style>
      <Header title="BULK HONEY & JAR REWARDS" right={<button type="button" className="btn ghost" onClick={onShop}>Back to shop</button>} />
      <main className="nf-wrap nf-bulk-main">
        <section className="nf-bulk-hero">
          <span className="nf-bulk-eyebrow">NECTARFUSIONS · MICHIGAN HONEY</span>
          <h1>More of the honey you love.</h1>
          <p>Stock the pantry with 3 lb jars or our 6 lb half-gallon size. Choose original raw Michigan honey or one of our infused flavors.</p>
          <div className="nf-bulk-hero-note">Local market pickup and eligible local delivery · Ask us about shipping large jars</div>
        </section>

        <section className="nf-bulk-section" aria-labelledby="nf-bulk-products-title">
          <span className="nf-bulk-eyebrow">SHOP LARGER SIZES</span>
          <h2 id="nf-bulk-products-title">Choose your honey</h2>
          <div className="nf-bulk-product-grid">
            {PRODUCTS.map((product) => {
              const size = catalog?.sizes?.find((s) => s.id === product.id);
              const dbPriceMatches = size && Number(size.price) === product.expected;
              const flavor = product.kind === "raw" ? rawFlavor : infusedFlavors.find((f) => f.id === chosenInfusedFlavor[product.id]);
              const remaining = dbPriceMatches ? stockRemaining(flavor, product.id, cart) : 0;
              return (
                <article className="nf-bulk-card" key={product.id}>
                  <div className="nf-bulk-card-top">
                    <span className="nf-bulk-size">{product.volume}</span>
                    <span className="nf-bulk-type">{product.kind === "raw" ? "RAW · UNFILTERED" : "INFUSED"}</span>
                  </div>
                  <h3>{product.name}</h3>
                  <div className="nf-bulk-price">${(size?.price ?? product.expected).toFixed(2)}</div>
                  <p>Return one qualifying {product.volume.startsWith("6") ? "half-gallon" : "3 lb"} NectarFusions jar for a ${product.credit} reward on a matching-size purchase.</p>
                  {product.kind === "infused" && (
                    <label className="nf-bulk-flavor-label">
                      Choose an infused flavor
                      <select value={chosenInfusedFlavor[product.id] || ""}
                        onChange={(e) => setChosenInfusedFlavor((current) => ({ ...current, [product.id]: e.target.value }))}>
                        <option value="">Select flavor</option>
                        {infusedFlavors.map((f) => <option value={f.id} key={f.id}>{f.name.trim()}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" className="nf-bulk-add" disabled={remaining < 1}
                    onClick={() => onAddBulk(product.id, flavor.id)}>
                    {remaining > 0 ? "Add to cart →" : "Currently unavailable"}
                  </button>
                  {dbPriceMatches && remaining > 0
                    ? <small>{remaining} available · Checkout through Square</small>
                    : <small>{size && !dbPriceMatches ? "Price configuration is being checked." : "Contact us about upcoming bulk availability."}</small>}
                </article>
              );
            })}
          </div>
        </section>

        <section className="nf-bulk-rewards" aria-labelledby="nf-bulk-rewards-title">
          <span className="nf-bulk-eyebrow">RETURN · REWARD · REPEAT</span>
          <h2 id="nf-bulk-rewards-title">Jar Return Rewards</h2>
          <p>Bring back your original empty NectarFusions jar when buying the same size. Help reduce packaging waste and receive credit for a qualifying return.</p>
          <div className="nf-bulk-reward-grid">
            <div><span>3 LB JAR</span><strong>$2 back</strong><small>For one qualifying 3 lb jar returned with a 3 lb purchase</small></div>
            <div><span>6 LB / HALF GALLON</span><strong>$4 back</strong><small>For one qualifying half-gallon jar returned with a half-gallon purchase</small></div>
          </div>
          <h3>How it works</h3>
          <ol>
            <li>Place your bulk honey order at the regular listed price.</li>
            <li>Choose a local pickup or delivery option, and enter the number of same-size jars you plan to return.</li>
            <li>Bring back your original NectarFusions jars, empty and free from cracks, chips, damage, or contamination.</li>
            <li>After we inspect and approve the jars, your eligible $2 or $4 return credit will be processed separately.</li>
          </ol>
          <p className="nf-bulk-reward-caution">One credit per qualifying jar and same-size purchase. Returned jars are not refilled at pickup; any reuse follows our approved cleaning and sanitizing process.</p>
          <button type="button" className="nf-bulk-back" onClick={onShop}>Continue shopping →</button>
        </section>
      </main>
    </div>
  );
}
