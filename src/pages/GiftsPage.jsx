import { useState } from "react";
import "./GiftsPage.css";

const EMAIL = "info@nectar-fusions.com";

function giftEmail(subject, details) {
  const query = new URLSearchParams({
    subject: "NectarFusions | " + subject,
    body: "Hi NectarFusions,\n\nI'm interested in " + details + ".\n\nName:\nPreferred quantity:\nNeeded by:\nPickup, local delivery, or shipping:\nAdditional details:\n\nThank you!",
  });
  return "mailto:" + EMAIL + "?" + query.toString();
}

const giftProducts = [
  {
    key: "bear13",
    title: "13 oz Raw Michigan Honey Bear",
    eyebrow: "A holiday statement • Raw Michigan honey",
    price: "$24.00",
    copy: "A beautiful way to share a little piece of Michigan this holiday season. Filled with premium raw Michigan honey, gently strained to retain its naturally occurring pollen. Pure golden goodness in a charming glass bear that makes gifting feel extra special.",
    image: "/images/gifts/honey-bear-13oz.jpg",
    alt: "13 oz glass honey bear filled with raw Michigan honey, black lid",
  },
  {
    key: "bear6",
    title: "6 oz Glass Honey Bear",
    eyebrow: "A thoughtful little gift • Choose your flavor",
    price: "$16.00",
    copy: "A sweet little taste of Michigan for stockings, holiday hosts, teachers, and honey lovers. Choose classic raw Michigan honey or festive cranberry-infused honey in the same giftable glass bear.",
    image: "/images/gifts/honey-bear-6oz.jpg",
    alt: "6 oz glass honey bear packaging with metallic lid; honey color varies by selected flavor",
  },
];

// These keys are the existing flavor-specific inventory records in App.jsx.
// Do not merge their stock counts: 6 oz raw and cranberry are separate products.
const sixOunceFlavors = [
  { key: "bear6", label: "Raw Michigan Honey" },
  { key: "bear6cranberry", label: "Cranberry Infused Honey" },
];

function GiftTabs({ mode }) {
  const links = [
    ["overview", "/gifts", "All Gifts"],
    ["holiday", "/gifts/holiday", "Holiday Gifts"],
    ["business", "/gifts/business", "Business & Private Label"],
  ];
  return (
    <nav className="nf-gifts-tabs" aria-label="Gift collections">
      {links.map(([id, href, label]) => (
        <a key={id} href={href} aria-current={mode === id ? "page" : undefined} className={mode === id ? "current" : ""}>{label}</a>
      ))}
    </nav>
  );
}

// nf-gift-personalized-tags-v1: One dipper and one custom tag per selected bear.
// The text is validated here and again in the App before the order is placed.
const tidyGiftWords = (value) => String(value || "").replace(/\s+/g, " ").trim();
const giftWordCount = (value) => tidyGiftWords(value).split(" ").filter(Boolean).length;

function GiftCards({ onAddGift, giftInventory }) {
  const [sixOunceFlavor, setSixOunceFlavor] = useState("");
  const [flavorChoicesOpen, setFlavorChoicesOpen] = useState(false);
  const [giftSettings, setGiftSettings] = useState({
    bear6: { enabled: false, tag: "" },
    bear13: { enabled: false, tag: "" },
  });
  const updateGiftSetting = (key, changes) => {
    setGiftSettings((current) => ({
      ...current,
      [key]: { ...current[key], ...changes },
    }));
  };

  return (
    <>
      <div className="nf-gifts-featured-grid">
        {giftProducts.map((item) => {
          const needsFlavorChoice = item.key === "bear6";
          const chosenKey = needsFlavorChoice ? sixOunceFlavor : item.key;
          const state = chosenKey ? giftInventory?.[chosenKey] : null;
          const available = state?.available === true;
          const standardPrice = needsFlavorChoice
            ? (giftInventory?.bear6?.price ?? giftInventory?.bear6cranberry?.price)
            : giftInventory?.bear13?.price;
          const price = typeof standardPrice === "number"
            ? `$${standardPrice.toFixed(2)}`
            : item.price;
          const selectedFlavor = sixOunceFlavors.find((flavor) => flavor.key === sixOunceFlavor);
          const gift = giftSettings[item.key];
          const tag = tidyGiftWords(gift.tag);
          const tagWords = giftWordCount(gift.tag);
          const giftDetailsReady = !gift.enabled || (tagWords >= 1 && tagWords <= 5 && tag.length <= 80);

          return (
            <article key={item.key} className="nf-gifts-featured-card">
              <div className="nf-gifts-featured-image">
                <img loading="lazy" src={item.image} alt={item.alt} />
              </div>
              <div className="nf-gifts-featured-copy">
                <div className="nf-gifts-eyebrow">{item.eyebrow}</div>
                <h3>{item.title}</h3>
                <strong className="nf-gifts-price">{price}</strong>
                <p>{item.copy}</p>

                {needsFlavorChoice && (
                  <div className="nf-gifts-flavor-picker">
                    <button
                      type="button"
                      className="nf-gifts-flavor-trigger"
                      aria-expanded={flavorChoicesOpen}
                      aria-controls="nf-gift-six-ounce-flavors"
                      onClick={() => setFlavorChoicesOpen((open) => !open)}
                    >
                      <span>
                        <span className="nf-gifts-flavor-trigger-caption">Choose Flavor</span>
                        <strong>{selectedFlavor?.label || "Select a honey flavor"}</strong>
                      </span>
                      <span className="nf-gifts-flavor-chevron" aria-hidden="true">⌄</span>
                    </button>
                    <div
                      id="nf-gift-six-ounce-flavors"
                      className="nf-gifts-flavor-options"
                      role="group"
                      aria-label="6 oz honey bear flavors"
                      hidden={!flavorChoicesOpen}
                    >
                      {sixOunceFlavors.map((flavor) => {
                        const flavorStock = giftInventory?.[flavor.key];
                        return (
                          <button
                            key={flavor.key}
                            type="button"
                            className={`nf-gifts-flavor-option ${sixOunceFlavor === flavor.key ? "selected" : ""}`}
                            aria-pressed={sixOunceFlavor === flavor.key}
                            onClick={() => {
                              setSixOunceFlavor(flavor.key);
                              setFlavorChoicesOpen(false);
                            }}
                          >
                            <span>{flavor.label}</span>
                            <small>{flavorStock?.available ? `${flavorStock.remaining} available` : "Currently unavailable"}</small>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="nf-gifts-make-gift">
                  <label className="nf-gifts-make-gift-toggle">
                    <input
                      type="checkbox"
                      checked={gift.enabled}
                      onChange={(event) => updateGiftSetting(item.key, { enabled: event.target.checked })}
                    />
                    <span>
                      <strong>Make it a gift</strong>
                      <small>Includes 1 honey dipper + 1 personalized tag per bear</small>
                    </span>
                  </label>
                  {gift.enabled && (
                    <div className="nf-gifts-custom-tag">
                      <label htmlFor={`nf-gifts-tag-${item.key}`}>Personalized tag <span>(5 words maximum)</span></label>
                      <input
                        id={`nf-gifts-tag-${item.key}`}
                        type="text"
                        autoComplete="off"
                        maxLength={80}
                        value={gift.tag}
                        placeholder="e.g., Wishing You Sweet Holidays"
                        onChange={(event) => {
                          const next = event.target.value.replace(/[\r\n\t]+/g, " ");
                          if (giftWordCount(next) <= 5) updateGiftSetting(item.key, { tag: next });
                        }}
                        aria-describedby={`nf-gifts-tag-help-${item.key}`}
                      />
                      <small id={`nf-gifts-tag-help-${item.key}`} className="nf-gifts-custom-tag-help">
                        {tagWords}/5 words · One tag per gifted bear. Each bear will receive the same text if you add multiple.
                      </small>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="nf-gifts-primary"
                  disabled={!chosenKey || !available || !giftDetailsReady}
                  onClick={() => onAddGift?.(chosenKey, gift.enabled ? { giftWrap: true, giftTag: tag } : { giftWrap: false })}
                  aria-label={needsFlavorChoice
                    ? `Add 6 oz ${selectedFlavor?.label || "honey"} bear to cart`
                    : `Add ${item.title} to cart`}
                >
                  {!chosenKey ? "Choose Flavor First" : !giftDetailsReady ? "Add Tag Text First" : available ? "Add to Cart →" : "Currently Unavailable"}
                </button>
                {!chosenKey ? (
                  <small className="nf-gifts-stock-note">Select Raw or Cranberry Infused above.</small>
                ) : available ? (
                  <small className="nf-gifts-stock-note">{state.remaining} available · Complete checkout with Square</small>
                ) : (
                  <small className="nf-gifts-stock-note">Temporarily unavailable or sold out.</small>
                )}
                {needsFlavorChoice && (
                  <small className="nf-gifts-stock-note">
                    Photo shows the bear jar; cranberry-infused honey may look different.
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="nf-gifts-wrapped-inset">
        <img loading="lazy" src="/images/gifts/honey-bear-gift-wrapped.jpg" alt="13 oz NectarFusions honey bear displayed in clear holiday wrapping with a ribbon and honey dipper" />
        <div>
          <div className="nf-gifts-eyebrow">Nature's happiness, gifted</div>
          <h3>Made to Give. Made in Michigan.</h3>
          <p>Good honey is a gift all on its own. Our glass honey bears bring the warmth of Michigan honey to your holiday celebrations.</p>
          <p className="nf-gifts-fineprint">Select “Make it a gift” on either honey bear to include a honey dipper and one personalized tag per bear. Decorative wrapping shown in photos is subject to availability and is not included unless specified.</p>
        </div>
      </div>
    </>
  );
}

function BusinessOptions({ onBusinessApply }) {
  return (
    <>
      <section className="nf-gifts-section" aria-labelledby="gift-business-options">
        <div className="nf-gifts-section-title">
          <div className="nf-gifts-eyebrow">Made for meaningful connections</div>
          <h2 id="gift-business-options">Your Brand. Our Honey.</h2>
          <p>From thoughtful client gifts to custom-branded honey, start with the option that fits your business.</p>
        </div>
        <div className="nf-gifts-business-grid">
          <article>
            <span className="nf-gifts-option-icon" aria-hidden="true">✦</span>
            <h3>Corporate & Client Gifts</h3>
            <p>Gift sets and honey favors for customers, teams, events, and appreciation.</p>
            <a href={giftEmail("Corporate Honey Gifts", "honey gifts for a business or organization")}>Ask about business gifting →</a>
          </article>
          <article>
            <span className="nf-gifts-option-icon" aria-hidden="true">◇</span>
            <h3>Custom Labels</h3>
            <p>Explore the possibility of adding your event, business, or occasion to the presentation.</p>
            <a href={giftEmail("Custom-Label Honey", "custom labels on honey gifts")}>Discuss custom labels →</a>
          </article>
          <article>
            <span className="nf-gifts-option-icon" aria-hidden="true">✳</span>
            <h3>Private Label Honey</h3>
            <p>Looking for honey sold under your own brand? Tell us about your vision, quantities, and timeline.</p>
            <a href={giftEmail("Private-Label Honey Inquiry", "a private-label honey project for my business")}>Explore private label →</a>
          </article>
        </div>
      </section>
      <section className="nf-gifts-business-banner">
        <div>
          <div className="nf-gifts-eyebrow">Businesses and organizations</div>
          <h2>Let's make something sweet together.</h2>
          <p>Our existing Partner program handles business gifting applications. Private-label and custom-branding projects are quoted individually, subject to feasibility and labeling requirements.</p>
        </div>
        <button type="button" onClick={onBusinessApply} className="nf-gifts-primary">Start a Business Gifting Application →</button>
      </section>
    </>
  );
}

export function GiftsHomepageFeature({ onHoliday, onBusiness }) {
  return (
    <section className="nf-gifts-home-banner nf-wrap" aria-labelledby="nf-gift-home-heading">
      <div className="nf-gifts-home-copy">
        <div className="nf-gifts-eyebrow">The NectarFusions gift collection · Holiday 2026</div>
        <h2 id="nf-gift-home-heading">A little honey.<br /><em>A lot of happiness.</em></h2>
        <p>Michigan honey, raw or cranberry infused, in giftable glass bear jars for the holidays.</p>
        <div className="nf-gifts-home-actions">
          <button type="button" className="nf-gifts-primary" onClick={onHoliday}>Explore Holiday Gifts →</button>
          <button type="button" className="nf-gifts-quiet" onClick={onBusiness}>Business & Private Label</button>
        </div>
      </div>
      <img src="/images/gifts/honey-bears-together.jpg" alt="Two NectarFusions raw Michigan honey bear jars in 13 oz and 6 oz sizes" />
    </section>
  );
}

export default function GiftsPage({ mode = "overview", Header, styles, onShop, onAddGift, giftInventory, onEvents, onBusinessApply }) {
  const isBusiness = mode === "business";
  const isHoliday = mode === "holiday";
  return (
    <div className="nf nf-gifts-page">
      <style>{styles}</style>
      <Header title="NECTARFUSIONS GIFTS" right={<button type="button" className="btn ghost nf-back-to-shop" onClick={onShop}>Back to shop</button>} />
      <main className="nf-wrap nf-gifts-main">
        <GiftTabs mode={mode} />
        {isBusiness ? (
          <section className="nf-gifts-hero nf-gifts-hero-business">
            <div className="nf-gifts-hero-copy">
              <div className="nf-gifts-eyebrow">Business gifting & private label</div>
              <h1>Good Honey.<br /><em>Your Signature.</em></h1>
              <p>Thoughtful gifts for your clients and team. Custom labels and private-label conversations for brands that want something different.</p>
              <a href={giftEmail("Private-Label & Business Gifting", "a custom-branded business honey project")} className="nf-gifts-primary">Tell us what you're planning →</a>
            </div>
            <img src="/images/partner-gift-hexagonal.jpg" alt="NectarFusions honey in giftable packaging" />
          </section>
        ) : (
          <section className="nf-gifts-hero">
            <div className="nf-gifts-hero-copy">
              <div className="nf-gifts-eyebrow">Holiday 2026 · Premium Raw Michigan Honey</div>
              <h1>A Little Piece of Michigan.<br /><em>A Whole Lot of Honey.</em></h1>
              <p>Michigan honey in giftable glass bears—choose pure raw honey or a festive cranberry-infused option.</p>
              <div className="nf-gifts-hero-actions">
                <a className="nf-gifts-primary" href="/gifts/holiday">{isHoliday ? "Browse the Gift Collection ↓" : "Explore Holiday Gifts →"}</a>
                <a className="nf-gifts-quiet" href="/gifts/business">Business & Private Label</a>
              </div>
            </div>
            <img src="/images/gifts/honey-bear-gift-wrapped.jpg" alt="NectarFusions raw Michigan honey bear dressed for holiday gifting" />
          </section>
        )}

        {!isBusiness && (
          <>
            <section className="nf-gifts-section" aria-labelledby="gift-collection-heading">
              <div className="nf-gifts-section-title">
                <div className="nf-gifts-eyebrow">Choose something sweet</div>
                <h2 id="gift-collection-heading">Holiday Honey Bears, Ready for Gifting</h2>
                <p>Two glass bear sizes, three honey options. Choose a flavor for the 6 oz bear or select the 13 oz raw honey bear, then add to cart and check out securely.</p>
              </div>
              <GiftCards onAddGift={onAddGift} giftInventory={giftInventory} />
              <p className="nf-gifts-photo-note">Gift photographs show our glass bear packaging. Cranberry-infused honey may differ in appearance. Wrapping and additional accessories are not included unless clearly specified.</p>
            </section>
            <section className="nf-gifts-choice-grid" aria-label="More ways to give honey">
              <div className="nf-gifts-choice-card nf-gifts-personal">
                <div className="nf-gifts-eyebrow">Build your own sweetness</div>
                <h2>Know Their Favorite Flavor?</h2>
                <p>Pick individual jars from the current NectarFusions collection and shop through our regular checkout.</p>
                <button type="button" className="nf-gifts-card-cta" onClick={onShop}>Shop Individual Honey Jars →</button>
              </div>
              <div className="nf-gifts-choice-card nf-gifts-events">
                <div className="nf-gifts-eyebrow">Celebrations & occasions</div>
                <h2>Little Favors. Lasting Smiles.</h2>
                <p>Plan small honey favors for weddings, showers, celebrations, and events.</p>
                <button type="button" className="nf-gifts-card-cta" onClick={onEvents}>Explore Event Favors →</button>
              </div>
            </section>
            <section className="nf-gifts-business-teaser">
              <div>
                <div className="nf-gifts-eyebrow">For your business</div>
                <h2>Gifts that mean business.</h2>
                <p>Client appreciation, employee gifting, custom labels, and private-label honey inquiries.</p>
              </div>
              <a href="/gifts/business" className="nf-gifts-primary">Explore Business Gifting →</a>
            </section>
          </>
        )}
        {isBusiness && <BusinessOptions onBusinessApply={onBusinessApply} />}
        <footer className="nf-gifts-footer">
          <p>Have something special in mind? <a href={giftEmail("Custom Gift Inquiry", "a custom honey gift")}>Tell us what you have in mind.</a></p>
          <button type="button" onClick={onShop}>← Back to NectarFusions Honey</button>
        </footer>
      </main>
    </div>
  );
}
