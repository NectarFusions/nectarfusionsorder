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

// nf-jar-return-discount-v2: The discount is applied on the server
// with a tracked obligation to return a qualifying 6 lb jar.
export function JarReturnCheckout({ eligible6, requested6, onChange, method }) {
  if (!eligible6) return null;
  const local = method === "market" || method === "delivery";
  const returning = requested6 > 0;
  return (
    <fieldset className="nf-jar-return-checkout" aria-label="Half-gallon jar return discount">
      <legend>Jar Return Rewards</legend>
      <h3>Returning an empty NectarFusions 6 lb jar?</h3>
      <p className="nf-jar-return-question">Get <strong>$4 OFF immediately</strong> for each eligible jar you agree to return with a same-size purchase.</p>
      {local ? (
        <>
          <div className="nf-jar-return-answer" role="group" aria-label="Will you be returning a 6 lb jar?">
            <button type="button" className={!returning ? "selected" : ""}
              aria-pressed={!returning} onClick={() => onChange("sixLb", 0)}>No, not this time</button>
            <button type="button" className={returning ? "selected" : ""}
              aria-pressed={returning} onClick={() => onChange("sixLb", Math.max(1, requested6))}>
              Yes, I'll return a jar
            </button>
          </div>
          {returning && (
            <div className="nf-jar-return-confirmation" role="status">
              {eligible6 > 1 && (
                <label>How many eligible jars will you return? (up to {eligible6})
                  <select value={requested6}
                    onChange={(event) => onChange("sixLb", Number(event.target.value))}>
                    {Array.from({length: eligible6}, (_, index) => index + 1).map((qty) => (
                      <option key={qty} value={qty}>{qty}</option>
                    ))}
                  </select>
                </label>
              )}
              <strong className="nf-jar-return-discount">−${(requested6 * 4).toFixed(2)} applied to your total now</strong>
              <p>Bring {requested6 === 1 ? "your original empty NectarFusions 6 lb jar" : `all ${requested6} original empty NectarFusions 6 lb jars`} to pickup or delivery. Each must be undamaged and accepted at handoff.</p>
              <p className="nf-jar-return-accountability">If you do not return an eligible jar, $4 per missing jar remains due to NectarFusions.</p>
            </div>
          )}
          {!returning && <p className="nf-jar-return-help">Your regular jar price applies unless you select Yes.</p>}
        </>
      ) : (
        <p className="nf-bulk-reward-caution">Jar returns are currently available with local pickup or local delivery, not standard shipping.</p>
      )}
      <p className="nf-jar-return-fineprint">One reward per original NectarFusions 6 lb jar and new 6 lb jar purchased. Containers are inspected and are not refilled at handoff.</p>
    </fieldset>
  );
}
export function BulkHoneyHomepageFeature({ onOpen }) {
  return (
    <section className="nf-wrap nf-bulk-home-teaser" aria-label="Half-gallon honey and jar return rewards">
      <div className="nf-bulk-home-copy">
        <span className="nf-bulk-eyebrow">MORE HONEY · LESS WASTE</span>
        <h2>Half-Gallon Honey. <em>A Sweet Return.</em></h2>
        <p className="nf-bulk-home-price">6 lb Raw Michigan Honey <strong>$70</strong> <span aria-hidden="true">·</span> Infused <strong>$95</strong></p>
        <div className="nf-bulk-home-reward">
          <strong>$4 BACK</strong><span>when you bring an eligible half-gallon jar back</span>
        </div>
      </div>
      <img className="nf-bulk-home-jar" src="/images/bulk/half-gallon-honey-jar.webp"
        alt="Gold-lidded glass jar of golden NectarFusions honey" width={182} height={244} loading="lazy" decoding="async"/>
      <button type="button" className="nf-bulk-link-button" onClick={onOpen}>Shop Half-Gallon Honey →</button>
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
                  {/* nf-half-gallon-photo-v1: user-supplied 6 lb jar photo, shared reference for both product types */}
                  <figure className="nf-bulk-product-photo">
                    <img
                      src="/images/bulk/half-gallon-honey-jar.webp"
                      alt="Wide-mouth glass jar filled with golden honey and topped with a gold lid"
                      width={1086}
                      height={1448}
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption>
                      {isInfused
                        ? "Jar photo for reference. Honey color may vary by infusion."
                        : "6 lb half-gallon honey jar"}
                    </figcaption>
                  </figure>
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
          <p>Bring back your original NectarFusions 6 lb jar with your half-gallon purchase. Select <strong>Yes</strong> at checkout to receive <strong>$4 OFF immediately</strong> per eligible returned jar.</p>
          <div className="nf-bulk-reward-grid"><div><span>6 LB / HALF-GALLON JAR</span><strong>$4 back</strong><small>One qualifying original jar returned per matching-size purchase</small></div></div>
          <h3>How it works</h3>
          <ol>
            <li>Buy a new 6 lb half-gallon jar at the regular listed price.</li>
            <li>At local pickup or delivery checkout, select <strong>Yes, I will return a jar</strong> to take $4 off now.</li>
            <li>Return your original NectarFusions 6 lb jar empty and free of chips, cracks, or contamination.</li>
            <li>Hand over your eligible jar at pickup or delivery. If it is missing or ineligible, $4 per missing jar remains due.</li>
          </ol>
          <p className="nf-bulk-reward-caution">Discount applies right away when you confirm your eligible return at checkout. One original 6 lb jar per matching purchase. Returned jars are inspected and never casually refilled.</p>
          <button type="button" className="nf-bulk-back" onClick={onShop}>Continue shopping →</button>
        </section>
      </main>
    </div>
  );
}
