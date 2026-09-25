import { useMemo, useState } from "react";

const PARTNER_CSS = `
.nf-partner-page { padding-bottom:180px; }
.nf-partner-main { padding-top:30px; padding-bottom:84px; }
.nf-partner-hero {
  position:relative;
  overflow:hidden;
  display:grid;
  grid-template-columns:minmax(0,1.12fr) minmax(300px,.88fr);
  gap:34px;
  padding:clamp(30px,5vw,60px);
  border-radius:30px;
  background:
    radial-gradient(circle at 92% 10%,rgba(247,196,28,.22),transparent 28%),
    radial-gradient(circle at 8% 88%,rgba(114,183,228,.14),transparent 30%),
    linear-gradient(145deg,#102E40 0%,#174C68 55%,#1B6F91 100%);
  color:#fff;
  box-shadow:0 24px 58px rgba(31,20,12,.2);
}
.nf-partner-hero::after {
  content:"";
  position:absolute;
  width:260px;
  height:260px;
  right:-110px;
  bottom:-150px;
  border-radius:50%;
  border:34px solid rgba(114,183,228,.12);
}
.nf-partner-hero-copy,.nf-partner-format-card { position:relative; z-index:1; }
.nf-partner-hero h2 {
  max-width:690px;
  margin:12px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(54px,7vw,86px);
  line-height:.9;
  letter-spacing:.015em;
}
.nf-partner-hero h2 span { color:#F7C41C; }
.nf-partner-hero p {
  max-width:680px;
  margin:20px 0 0;
  color:#F6ECDD;
  font-size:16px;
  line-height:1.72;
}
.nf-partner-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.nf-partner-actions button { min-height:48px; padding:12px 18px; }
.nf-partner-secondary {
  border-color:rgba(255,255,255,.55)!important;
  background:rgba(255,255,255,.1)!important;
  color:#fff!important;
}
.nf-partner-format-card {
  align-self:stretch;
  display:grid;
  align-content:center;
  gap:15px;
  padding:26px;
  border:1px solid rgba(255,255,255,.3);
  border-radius:22px;
  background:rgba(255,255,255,.11);
  backdrop-filter:blur(8px);
}
.nf-partner-format-card strong { color:#FFF4CE; font-size:18px; }
.nf-partner-format-list { display:grid; gap:9px; }
.nf-partner-format-row {
  display:flex;
  justify-content:space-between;
  gap:16px;
  padding:11px 12px;
  border-radius:12px;
  background:rgba(255,255,255,.08);
}
.nf-partner-format-row span:first-child { color:#D8EAF5; font-size:14px; font-weight:850; }
.nf-partner-format-row span:last-child { color:#fff; font-size:14px; font-weight:900; text-align:right; }
.nf-partner-format-note { margin:0!important; color:#D7CFC6!important; font-size:11.5px!important; line-height:1.55!important; }

.nf-partner-section { margin-top:56px; }
.nf-partner-heading { max-width:760px; margin-bottom:22px; }
.nf-partner-heading h2 {
  margin:8px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:46px;
  line-height:.95;
  color:#17120E;
}
.nf-partner-heading p { margin:12px 0 0; color:#5D5148; font-size:15px; line-height:1.72; }

.nf-partner-programs { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.nf-partner-program {
  position:relative;
  overflow:hidden;
  min-height:260px;
  padding:24px;
  border:1px solid #E3D8CB;
  border-radius:21px;
  background:#fff;
  box-shadow:0 10px 28px rgba(45,31,20,.07);
}
.nf-partner-program::after {
  content:"";
  position:absolute;
  width:120px;
  height:120px;
  right:-54px;
  top:-54px;
  border-radius:50%;
  background:rgba(36,160,237,.08);
}
.nf-partner-program[data-kind="bulk"]::after { background:rgba(247,196,28,.13); }
.nf-partner-program[data-kind="gifting"]::after { background:rgba(140,108,180,.11); }
.nf-partner-program-label {
  display:inline-flex;
  padding:6px 9px;
  border-radius:999px;
  background:#EAF7FF;
  color:#175D85;
  font-size:14px;
  font-weight:950;
  letter-spacing:.045em;
  text-transform:uppercase;
}
.nf-partner-program[data-kind="bulk"] .nf-partner-program-label { background:#FFF4BE; color:#664B00; }
.nf-partner-program[data-kind="gifting"] .nf-partner-program-label { background:#F2EAF8; color:#68488A; }
.nf-partner-program h3 { margin:16px 0 8px; color:#25180F; font-size:21px; }
.nf-partner-program > p { margin:0; color:#67594D; font-size:14px; line-height:1.65; }
.nf-partner-program ul { display:grid; gap:8px; margin:18px 0 0; padding:0; list-style:none; }
.nf-partner-program li { display:grid; grid-template-columns:16px minmax(0,1fr); gap:8px; color:#54483F; font-size:14px; line-height:1.5; }
.nf-partner-program li::before { content:"✓"; color:#167BB6; font-weight:950; }

.nf-partner-benefits { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.nf-partner-benefit {
  padding:20px;
  border:1px solid #E7DED3;
  border-radius:18px;
  background:linear-gradient(145deg,#FFFFFF,#FBF7F1);
}
.nf-partner-benefit-icon {
  width:38px;
  height:38px;
  display:grid;
  place-items:center;
  border-radius:12px;
  background:#EAF7FF;
  color:#167BB6;
  font-size:17px;
  font-weight:900;
}
.nf-partner-benefit h3 { margin:14px 0 7px; color:#24170F; font-size:15px; }
.nf-partner-benefit p { margin:0; color:#65584D; font-size:14px; line-height:1.6; }

.nf-partner-process { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; counter-reset:partner-step; }
.nf-partner-step {
  position:relative;
  min-height:150px;
  padding:56px 18px 18px;
  border:1px solid #DDE8EF;
  border-radius:18px;
  background:#F6FBFE;
}
.nf-partner-step::before {
  counter-increment:partner-step;
  content:counter(partner-step);
  position:absolute;
  left:18px;
  top:17px;
  width:30px;
  height:30px;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#173C52;
  color:#fff;
  font-size:14px;
  font-weight:950;
}
.nf-partner-step h3 { margin:0 0 7px; color:#173C52; font-size:15px; }
.nf-partner-step p { margin:0; color:#5B7180; font-size:14px; line-height:1.6; }

.nf-partner-pricing-note {
  margin-top:18px;
  padding:16px 18px;
  border-left:5px solid #F7C41C;
  border-radius:13px;
  background:#FFF9E8;
  color:#604A1C;
  font-size:14px;
  line-height:1.65;
}

.nf-partner-form-shell {
  display:grid;
  grid-template-columns:minmax(250px,.7fr) minmax(0,1.3fr);
  gap:30px;
  padding:clamp(22px,4vw,38px);
  border:1px solid #E2D5C6;
  border-radius:26px;
  background:linear-gradient(145deg,#FFFDF8,#F7F0E6);
  box-shadow:0 16px 40px rgba(45,31,20,.09);
}
.nf-partner-form-intro h2 {
  margin:9px 0 12px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:46px;
  line-height:.95;
}
.nf-partner-form-intro p { color:#62554A; font-size:14px; line-height:1.72; }
.nf-partner-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.nf-partner-field { display:grid; gap:6px; }
.nf-partner-field.full { grid-column:1/-1; }
.nf-partner-field label {
  color:#4A3313;
  font-size:14px;
  font-weight:850;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.nf-partner-field select {
  width:100%;
  min-height:50px;
  padding:12px 14px;
  border:1.5px solid #CDB58D;
  border-radius:12px;
  background:#fff;
  color:#17120E;
  font:inherit;
  font-size:15px;
}
.nf-partner-field textarea { min-height:95px; resize:vertical; }
.nf-partner-consent {
  grid-column:1/-1;
  display:flex;
  align-items:flex-start;
  gap:10px;
  padding:12px;
  border-radius:12px;
  background:#fff;
  color:#5D5148;
  font-size:14px;
  line-height:1.55;
}
.nf-partner-consent input { width:18px!important; height:18px; flex:0 0 18px; margin-top:1px; box-shadow:none!important; }
.nf-partner-submit { grid-column:1/-1; min-height:52px; }
.nf-partner-success { padding:24px; border:2px solid #8FA97B; border-radius:18px; background:#F7FBF4; text-align:center; }
.nf-partner-success h3 { margin:0; font-family:'Bebas Neue',Impact,sans-serif; font-size:34px; color:#3F6031; }
.nf-partner-success p { margin:8px 0 0; color:#536948; line-height:1.65; }

.nf-partner-faq { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
.nf-partner-faq details { border:1px solid #E5DBCF; border-radius:15px; background:#fff; }
.nf-partner-faq summary { padding:16px 18px; cursor:pointer; color:#2B211A; font-size:14px; font-weight:850; }
.nf-partner-faq p { margin:0; padding:0 18px 18px; color:#65584D; font-size:14px; line-height:1.68; }

@media (max-width:900px) {
  .nf-partner-hero,.nf-partner-form-shell { grid-template-columns:1fr; }
  .nf-partner-programs { grid-template-columns:1fr; }
  .nf-partner-benefits,.nf-partner-process { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (max-width:600px) {
  .nf-partner-page { padding-bottom:165px; }
  .nf-partner-main { padding-top:20px; }
  .nf-partner-hero { padding:28px 20px; border-radius:22px; }
  .nf-partner-hero h2 { font-size:54px; }
  .nf-partner-section { margin-top:42px; }
  .nf-partner-heading h2,.nf-partner-form-intro h2 { font-size:38px; }
  .nf-partner-benefits,.nf-partner-process,.nf-partner-form-grid,.nf-partner-faq { grid-template-columns:1fr; }
  .nf-partner-field.full,.nf-partner-consent,.nf-partner-submit { grid-column:auto; }
}
`;

const BUSINESS_TYPES = [
  "Boutique or gift shop",
  "Michigan-made shop",
  "Farm store or specialty grocery",
  "Café, bakery, restaurant, or wholesale buyer",
  "Winery, cheese shop, or butcher",
  "Hospitality or tourism business",
  "Corporate or event gifting",
  "Other",
];

const PARTNER_INTERESTS = [
  "Retail shelf products",
  "Wholesale or bulk honey",
  "Event favors or gifting",
  "Custom labels or packaging",
  "Multiple partner options",
];

const BENEFITS = [
  ["MI", "Michigan Honey", "Raw Michigan honey with the pollen left in and a growing collection of real-ingredient infusions."],
  ["✦", "Made to Stand Out", "Distinctive flavors and giftable formats designed to spark sampling, conversation, and repeat purchases."],
  ["↔", "Flexible Formats", "Retail jars, bulk honey, and small gifting formats let the partnership match how your business actually sells or serves."],
  ["↻", "Direct Support", "Approved partners get secure ordering tools, resources, event support, and a direct relationship with NectarFusions."],
];

const PROGRAMS = [
  {
    kind: "retail",
    label: "Retail",
    title: "Retail Shelves",
    copy: "For boutiques, farm stores, specialty grocers, cafés, and Michigan-made shops.",
    bullets: [
      "4 oz, 7 oz, and 1 lb retail jars",
      "Core flavors: Chipotle, Cinnamon, Lemon, Madagascar Vanilla, and Original",
      "Curated opening assortment and easy replenishment",
      "Current pricing and order history through the Partner Portal",
    ],
  },
  {
    kind: "bulk",
    label: "Wholesale",
    title: "Bulk Honey",
    copy: "For cafés, bakeries, kitchens, hospitality, beverage programs, and higher-volume use.",
    bullets: [
      "1/2 gallon, 1 gallon, and 5 gallon formats",
      "Natural or infused honey options",
      "Pickup, delivery, or shipping requests",
      "Bulk ordering enabled for eligible partner accounts",
    ],
  },
  {
    kind: "gifting",
    label: "Events & Gifting",
    title: "Small Favors + Custom Requests",
    copy: "For weddings, client gifts, corporate events, hospitality, and branded gifting.",
    bullets: [
      "2 oz plastic honey bears",
      "Small glass hexagonal containers",
      "Flavor selection and presentation requests",
      "Custom label requests available for reviewed partner orders",
    ],
  },
];

const PROCESS = [
  ["Tell us about your business", "Send a short partner inquiry with where and how you plan to sell, serve, or gift NectarFusions."],
  ["We match the right program", "We review your business and determine the best retail, bulk, gifting, or combined partner setup."],
  ["Get approved and connected", "Approved partners receive current terms, pricing, resources, and secure Partner Portal access."],
  ["Order and grow", "Place replenishment or eligible bulk requests through the portal and work directly with NectarFusions as needs change."],
];

const FAQS = [
  ["What sizes are available?", "Retail partners currently order 4 oz, 7 oz, and 1 lb jars. Eligible wholesale and bulk partners can request 1/2 gallon, 1 gallon, and 5 gallon formats. Gifting options include 2 oz plastic bears and small glass hexagonal containers."],
  ["What are the retail order minimums?", "The retail program uses a 12-jar minimum, with quantities ordered in six-jar increments by flavor, size, and texture. Available products can be mixed within the same order."],
  ["Can partners order both natural and infused honey?", "Yes. Available selections depend on the program, current inventory, and partner eligibility. Wholesale and bulk ordering supports both natural and infused options."],
  ["Do you offer custom labels or event favors?", "Yes. Eligible partner requests can include small gifting containers, custom label requests, packaging details, and event-specific needs. Custom pricing is provided after review."],
  ["Where do I see current pricing?", "Approved partners receive current pricing and ordering access through NectarFusions partner materials and the secure Partner Portal. This keeps public information simple while partner pricing stays current."],
  ["How do reorders work?", "Approved retail partners submit replenishment requests through the Partner Portal. Eligible accounts can also access wholesale, bulk, gifting, and custom-request tools from the same secure account."],
];

export default function PartnerPage({ Header, styles, onBack, onPartnerLogin, submitInquiry }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    contactName: "",
    businessName: "",
    businessType: "",
    email: "",
    phone: "",
    websiteSocial: "",
    interests: "",
    salesLocation: "",
    message: "",
    consent: false,
  });

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const canSubmit = useMemo(
    () =>
      form.contactName.trim() &&
      form.businessName.trim() &&
      form.businessType &&
      form.email.trim() &&
      form.interests &&
      form.salesLocation.trim() &&
      form.consent &&
      !busy,
    [form, busy]
  );

  const scrollToApplication = () => {
    document.getElementById("partner-application")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("Complete the required business, contact, partner-interest, sales-location, and consent fields.");
      return;
    }

    setBusy(true);
    setError("");

    const details = [
      "PARTNER INQUIRY",
      `Business: ${form.businessName.trim()}`,
      `Business type: ${form.businessType}`,
      `Partnership interest: ${form.interests}`,
      `Website or social: ${form.websiteSocial.trim() || "Not provided"}`,
      `Where NectarFusions would be sold or used: ${form.salesLocation.trim()}`,
      `Additional message: ${form.message.trim() || "None"}`,
      "Consent to be contacted: Yes",
    ].join("\n");

    try {
      await submitInquiry({
        requestKind: "special_request",
        accountKind: "general",
        accountNumber: "Partner inquiry",
        name: form.contactName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        details,
        website: honeypot,
        formStartedAt,
      });
      setDone(true);
    } catch (submitError) {
      setError(submitError?.message || "The partner inquiry could not be sent.");
    }

    setBusy(false);
  };

  return (
    <div className="nf nf-partner-page">
      <style>{styles}</style>
      <style>{PARTNER_CSS}</style>
      <Header
        eyebrow="Retail • Wholesale • Gifting"
        title="PARTNER WITH NECTARFUSIONS"
        right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>}
      />

      <main className="nf-wrap nf-partner-main">
        <section className="nf-partner-hero">
          <div className="nf-partner-hero-copy">
            <div className="nf-modern-kicker" style={{ color: "#72B7E4" }}>
              Wholesale partnerships built to fit your business
            </div>
            <h2>Michigan Honey, <span>Made to Move</span></h2>
            <p>
              Stock it, serve it, or gift it. NectarFusions partners get access to raw Michigan honey,
              core retail flavors, multiple product formats, and a secure portal built for easy reorders and support.
            </p>
            <div className="nf-partner-actions">
              <button type="button" className="btn solid" onClick={scrollToApplication}>Apply to Partner</button>
              <button type="button" className="btn nf-partner-secondary" onClick={onPartnerLogin}>
                Partner Login
              </button>
            </div>
          </div>

          <aside className="nf-partner-format-card" aria-label="Available NectarFusions partner formats">
            <strong>Available Partner Formats</strong>
            <div className="nf-partner-format-list">
              <div className="nf-partner-format-row"><span>Retail</span><span>4 oz • 7 oz • 1 lb</span></div>
              <div className="nf-partner-format-row"><span>Wholesale</span><span>1/2 gal • 1 gal • 5 gal</span></div>
              <div className="nf-partner-format-row"><span>Gifting</span><span>2 oz bears • glass hex</span></div>
              <div className="nf-partner-format-row"><span>Honey</span><span>Natural + infused</span></div>
            </div>
            <p className="nf-partner-format-note">
              Product access depends on partner type, inventory, and program approval.
            </p>
          </aside>
        </section>

        <section className="nf-partner-section">
          <div className="nf-partner-heading">
            <div className="nf-modern-kicker">Choose what fits</div>
            <h2>One Partnership. Multiple Ways to Sell It.</h2>
            <p>
              Start with the program that fits your business today. Approved partners can expand into additional
              formats as their needs grow.
            </p>
          </div>

          <div className="nf-partner-programs">
            {PROGRAMS.map((program) => (
              <article className="nf-partner-program" data-kind={program.kind} key={program.title}>
                <div className="nf-partner-program-label">{program.label}</div>
                <h3>{program.title}</h3>
                <p>{program.copy}</p>
                <ul>
                  {program.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              </article>
            ))}
          </div>

          <div className="nf-partner-pricing-note">
            Current partner pricing is provided during approval and through the secure Partner Portal, so the
            information partners use to order stays current.
          </div>
        </section>

        <section className="nf-partner-section">
          <div className="nf-partner-heading">
            <div className="nf-modern-kicker">Why NectarFusions</div>
            <h2>Built for More Than a Shelf</h2>
          </div>

          <div className="nf-partner-benefits">
            {BENEFITS.map(([icon, title, copy]) => (
              <article className="nf-partner-benefit" key={title}>
                <div className="nf-partner-benefit-icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="nf-partner-section">
          <div className="nf-partner-heading">
            <div className="nf-modern-kicker">How it works</div>
            <h2>Simple From First Hello to Reorder</h2>
          </div>

          <div className="nf-partner-process">
            {PROCESS.map(([title, copy]) => (
              <article className="nf-partner-step" key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="partner-application" className="nf-partner-section nf-partner-form-shell">
          <div className="nf-partner-form-intro">
            <div className="nf-modern-kicker">Partner inquiry</div>
            <h2>Let’s See What Fits Your Business</h2>
            <p>
              Tell us a little about your business and what you are interested in. We will review the fit and follow
              up with the right partner options, current pricing, and next steps.
            </p>
            <p><strong>Required fields are marked with an asterisk.</strong></p>
          </div>

          {done ? (
            <div className="nf-partner-success" role="status">
              <h3>Inquiry Received</h3>
              <p>Thank you. NectarFusions will review your information and contact you using the details provided.</p>
            </div>
          ) : (
            <form className="nf-partner-form-grid" onSubmit={submit}>
              <div className="nf-partner-field">
                <label htmlFor="partner-contact">Contact name *</label>
                <input id="partner-contact" value={form.contactName} onChange={update("contactName")} />
              </div>

              <div className="nf-partner-field">
                <label htmlFor="partner-business">Business name *</label>
                <input id="partner-business" value={form.businessName} onChange={update("businessName")} />
              </div>

              <div className="nf-partner-field">
                <label htmlFor="partner-type">Business type *</label>
                <select id="partner-type" value={form.businessType} onChange={update("businessType")}>
                  <option value="">Choose one</option>
                  {BUSINESS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div className="nf-partner-field">
                <label htmlFor="partner-interest">What are you interested in? *</label>
                <select id="partner-interest" value={form.interests} onChange={update("interests")}>
                  <option value="">Choose one</option>
                  {PARTNER_INTERESTS.map((interest) => <option key={interest} value={interest}>{interest}</option>)}
                </select>
              </div>

              <div className="nf-partner-field">
                <label htmlFor="partner-email">Email *</label>
                <input id="partner-email" type="email" value={form.email} onChange={update("email")} />
              </div>

              <div className="nf-partner-field">
                <label htmlFor="partner-phone">Phone</label>
                <input id="partner-phone" inputMode="tel" value={form.phone} onChange={update("phone")} />
              </div>

              <div className="nf-partner-field full">
                <label htmlFor="partner-web">Website or social link</label>
                <input id="partner-web" value={form.websiteSocial} onChange={update("websiteSocial")} />
              </div>

              <div className="nf-partner-field full">
                <label htmlFor="partner-sold">Where would NectarFusions be sold or used? *</label>
                <textarea
                  id="partner-sold"
                  value={form.salesLocation}
                  onChange={update("salesLocation")}
                  placeholder="Store, café, bakery, restaurant, event program, client gifting, online shop, or other setting"
                />
              </div>

              <div className="nf-partner-field full">
                <label htmlFor="partner-message">Anything else we should know?</label>
                <textarea id="partner-message" value={form.message} onChange={update("message")} />
              </div>

              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="partner-website-check">Leave this field empty</label>
                <input
                  id="partner-website-check"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>

              <label className="nf-partner-consent">
                <input type="checkbox" checked={form.consent} onChange={update("consent")} />
                <span>I agree that NectarFusions may contact me about this partner inquiry. *</span>
              </label>

              {error && <div className="err nf-partner-field full" role="alert">{error}</div>}

              <button type="submit" className="btn solid nf-partner-submit" disabled={!canSubmit}>
                {busy ? "Sending inquiry…" : "Submit Partner Inquiry"}
              </button>
            </form>
          )}
        </section>

        <section className="nf-partner-section">
          <div className="nf-partner-heading">
            <div className="nf-modern-kicker">Quick answers</div>
            <h2>Partner FAQ</h2>
          </div>

          <div className="nf-partner-faq">
            {FAQS.map(([question, answer]) => (
              <details key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

