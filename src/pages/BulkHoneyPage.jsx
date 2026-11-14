import { useState } from "react";
import "./BulkHoneyPage.css";

// Five best-selling *active* infusions ranked by units sold in the existing
// NectarFusions order records (November 2026 snapshot). All five share ONE
// three-jar inventory pool. An inactive checkout-only flavor stores that pool.
const FEATURED_INFUSIONS = [
  "Pumpkin Spice",
  "Cinnamon",
  "Chipotle",
  "Espresso",
  "Hot Thai Chili",
];
const INFUSED_POOL = "Bulk Infused Selection";
const PRODUCTS = [
  { id: "bulk-6lb-original", name: "Original Raw Michigan Honey", expected: 70, kind: "raw" },
  { id: "bulk-6lb-infused", name: "Infused Michigan Honey", expected: 95, kind: "infused" },
];
const nameEquals = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const countStock = (flavor, sizeId, cart) => {
  if (!flavor) return 0;
  const stock = flavor.stock?.[`${sizeId}:regular`];
  if (stock?.in_stock !== true || !Number.isInteger(stock?.on_hand)) return 0;
  const alreadyInCart = (cart ?? [])
    .filter((line) => line.flavor_id === flavor.id && line.size_id === sizeId && line.type === "regular")
    .reduce((sum, line) => sum + Number(line.qty || 0), 0);
  return Math.max(0, stock.on_hand - alreadyInCart);
};

// Return credit is a request only. Existing server-priced checkout charges
// full price until eligible returned jars are inspected and approved.
export function JarReturnCheckout({ eligible6, requested6, onChange, method }) {
  if (!eligible6) return null;
  const local = method === "market" || method === "delivery";
  return (
    <div className="nf-jar-return-checkout">
      <span className="nf-bulk-eyebrow">Jar Return Rewards</span>
      <strong>Returning a NectarFusions half-gallon jar?</strong>
      <p>Receive $4 back for each qualifying original 6 lb NectarFusions jar returned with a matching-size purchase.</p>
      {local ? (
        <div className="nf-jar-return-selects">
          <label>6 lb jars you plan to return <small>(up to {eligible6})</small>
            <input type="number" min="0" max={eligible6} step="1" inputMode="numeric" value={requested6}
              onChange={(event) => onChange("sixLb", Math.max(0, Math.min(eligible6, Number.parseInt(event.target.value, 10) || 0)))} />
          </label>
          {requested6 > 0 && <div className="nf-jar-projected-credit">Potential reward: ${(requested6 * 4).toFixed(2)} after inspection</div>}
        </div>
      ) : (
        <p className="nf-bulk-reward-caution">Select market pickup or local delivery to request a return reward. Contact us for arrangements outside these methods.</p>
      )}
      <small>Checkout charges the regular honey price. Return credit is issued separately only after the empty, undamaged jar is inspected. We do not refill returned jars at pickup.</small>
    </div>
  );
}

export function BulkHoneyHomepageFeature({ onOpen }) {
  return (
    <section className="nf-wrap nf-bulk-home-teaser" aria-label="Half-gallon honey and jar return rewards">
      <div>
        <span className="nf-bulk-eyebrow">More honey · Less waste</span>
        <h2>Half-Gallon Honey. A Sweet Return.</h2>
        <p>Shop 6 lb Original Raw for $70 or choose from five infused favorites for $95. Return an eligible half-gallon jar for a $4 reward.</p>
      </div>
      <button type="button" className="nf-bulk-link-button" onClick={onOpen}>Explore Half-Gallon Honey →</button>
    </section>
  );
}

export default function BulkHoneyPage({ Header, styles, catalog, cart, onShop, onAddBulk }) {
  const [infusion, setInfusion] = useState("");
  const flavors = catalog?.flavors ?? [];
  const raw = flavors.find((f) => f.active !== false && nameEquals(f.name, "Original"));
  const pool = flavors.find((f) => nameEquals(f.name, INFUSED_POOL));
  const offered = FEATURED_INFUSIONS.filter((name) => flavors.some((f) => f.active !== false && nameEquals(f.name, name)));
  return (
    <div className="nf nf-bulk-page">
      <style>{styles}</style>
      <Header title="HALF-GALLON HONEY & JAR REWARDS" right={<button type="button" className="btn ghost" onClick={onShop}>Back to shop</button>} />
      <main className="nf-wrap nf-bulk-main">
        <section className="nf-bulk-hero">
          <span className="nf-bulk-eyebrow">NECTARFUSIONS · MICHIGAN HONEY</span>
          <h1>A little more honey to love.</h1>
          <p>Choose our 6 lb half-gallon jar of Original Raw Michigan Honey or one of our five most-ordered infused flavors.</p>
          <div className="nf-bulk-hero-note">Local market pickup or eligible local delivery · Contact us for a shipping quote</div>
        </section>
        <section className="nf-bulk-section" aria-labelledby="nf-bulk-products-title">
          <span className="nf-bulk-eyebrow">SHOP HALF-GALLON HONEY</span>
          <h2 id="nf-bulk-products-title">Choose your honey</h2>
          <div className="nf-bulk-product-grid">
            {PRODUCTS.map((product) => {
              const isInfused = product.kind === "infused";
              const stockFlavor = isInfused ? pool : raw;
              const size = catalog?.sizes?.find((s) => s.id === product.id);
              const priceMatches = Number(size?.price) === product.expected;
              const remaining = priceMatches ? countStock(stockFlavor, product.id, cart) : 0;
              const canAdd = remaining > 0 && (!isInfused || offered.includes(infusion));
              return (
                <article className="nf-bulk-card" key={product.id}>
                  <div className="nf-bulk-card-top">
                    <span className="nf-bulk-size">6 LB · HALF-GALLON</span>
                    <span className="nf-bulk-type">{isInfused ? "INFUSED" : "RAW · UNFILTERED"}</span>
                  </div>
                  <h3>{product.name}</h3>
                  <div className="nf-bulk-price">${product.expected.toFixed(2)}</div>
                  <p>{isInfused
                    ? "Choose from five best-selling infused honey flavors. Just three infused half-gallons are available across all flavor choices."
                    : "Our signature golden Original Raw Michigan Honey in a generously sized half-gallon jar."}</p>
                  {isInfused && (
                    <label className="nf-bulk-flavor-label">
                      Choose one of our five infused flavors
                      <select value={infusion} onChange={(event) => setInfusion(event.target.value)}>
                        <option value="">Select a flavor</option>
                        {offered.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" className="nf-bulk-add" disabled={!canAdd}
                    onClick={() => onAddBulk(product.id, stockFlavor?.id, isInfused ? infusion : null)}>
                    {canAdd ? "Add to cart →" : remaining <= 0 ? "Currently unavailable" : "Choose a flavor first"}
                  </button>
                  <small>{priceMatches && remaining > 0
                    ? `${remaining} available${isInfused ? " total across all infused flavors" : ""} · Secure Square checkout`
                    : priceMatches ? "Currently sold out" : "Available after inventory configuration"}</small>
                </article>
              );
            })}
          </div>
        </section>
        <section className="nf-bulk-rewards" aria-labelledby="nf-bulk-rewards-title">
          <span className="nf-bulk-eyebrow">RETURN · REWARD · REPEAT</span>
          <h2 id="nf-bulk-rewards-title">Jar Return Rewards</h2>
          <p>Return an original NectarFusions 6 lb jar with your new half-gallon honey purchase. Your qualifying return earns $4 back.</p>
          <div className="nf-bulk-reward-grid"><div><span>6 LB / HALF-GALLON JAR</span><strong>$4 back</strong><small>One qualifying original jar returned per matching-size purchase</small></div></div>
          <h3>How it works</h3>
          <ol>
            <li>Buy a new 6 lb half-gallon jar at the regular listed price.</li>
            <li>At checkout, choose a local pickup or delivery option and request your return reward.</li>
            <li>Return your original NectarFusions 6 lb jar empty and free of chips, cracks, or contamination.</li>
            <li>After inspection and approval, receive a separate $4 credit for each qualifying return.</li>
          </ol>
          <p className="nf-bulk-reward-caution">Returns are inspected before credit. Containers are not refilled at handoff. Any reuse requires the approved cleaning and sanitizing process.</p>
          <button type="button" className="nf-bulk-back" onClick={onShop}>Continue shopping →</button>
        </section>
      </main>
    </div>
  );
}
