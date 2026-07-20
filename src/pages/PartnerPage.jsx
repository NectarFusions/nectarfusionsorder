import { useMemo, useState } from "react";

const PARTNER_CSS = `
.nf-partner-page { padding-bottom:190px; }
.nf-partner-main { padding-top:34px; padding-bottom:80px; }
.nf-partner-hero {
  position:relative;
  overflow:hidden;
  display:grid;
  grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);
  gap:34px;
  padding:clamp(28px,5vw,58px);
  border-radius:30px;
  background:
    radial-gradient(circle at 92% 10%,rgba(247,196,28,.18),transparent 27%),
    linear-gradient(145deg,#21140D 0%,#392417 58%,#173C52 100%);
  color:#FFFFFF;
  box-shadow:0 24px 58px rgba(31,20,12,.22);
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
.nf-partner-hero-copy,.nf-partner-hero-card { position:relative; z-index:1; }
.nf-partner-hero h2 {
  margin:12px 0 0;
  max-width:650px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(52px,7vw,84px);
  line-height:.9;
  letter-spacing:.015em;
}
.nf-partner-hero h2 span { color:#F7C41C; }
.nf-partner-hero p { max-width:650px; margin:20px 0 0; color:#F6ECDD; font-size:16px; line-height:1.75; }
.nf-partner-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:26px; }
.nf-partner-actions button { min-height:48px; padding:12px 18px; }
.nf-partner-secondary {
  border-color:rgba(255,255,255,.55) !important;
  background:rgba(255,255,255,.1) !important;
  color:#FFFFFF !important;
}
.nf-partner-hero-card {
  align-self:stretch;
  display:grid;
  align-content:center;
  gap:15px;
  padding:26px;
  border:1px solid rgba(255,255,255,.24);
  border-radius:22px;
  background:rgba(255,255,255,.09);
  backdrop-filter:blur(8px);
}
.nf-partner-hero-card strong { color:#FFF4CE; font-size:18px; }
.nf-partner-hero-card ul { display:grid; gap:12px; margin:0; padding:0; list-style:none; }
.nf-partner-hero-card li { display:grid; grid-template-columns:28px minmax(0,1fr); gap:9px; align-items:start; color:#FFFFFF; line-height:1.5; }
.nf-partner-hero-card li span:first-child { color:#F7C41C; font-weight:950; }
.nf-partner-section { margin-top:56px; }
.nf-partner-heading { max-width:760px; margin-bottom:22px; }
.nf-partner-heading h2 { margin:8px 0 0; font-family:'Bebas Neue',Impact,sans-serif; font-size:46px; line-height:.95; color:#17120E; }
.nf-partner-heading p { margin:12px 0 0; color:#5D5148; font-size:15px; line-height:1.75; }
.nf-partner-benefits { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.nf-partner-benefit {
  padding:22px;
  border:1px solid #E7DED3;
  border-radius:20px;
  background:linear-gradient(145deg,#FFFFFF,#FBF7F1);
  box-shadow:0 10px 26px rgba(45,31,20,.07);
}
.nf-partner-benefit-icon { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; background:#EAF7FF; color:#167BB6; font-size:20px; }
.nf-partner-benefit h3 { margin:15px 0 7px; color:#24170F; font-size:17px; }
.nf-partner-benefit p { margin:0; color:#65584D; font-size:13.5px; line-height:1.65; }
.nf-partner-process { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; counter-reset:partner-step; }
.nf-partner-step {
  position:relative;
  min-height:155px;
  padding:22px 20px 20px 68px;
  border:1px solid #DDE8EF;
  border-radius:18px;
  background:#F6FBFE;
}
.nf-partner-step::before {
  counter-increment:partner-step;
  content:counter(partner-step);
  position:absolute;
  left:18px;
  top:19px;
  width:36px;
  height:36px;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#24A0ED;
  color:#FFFFFF;
  font-weight:950;
}
.nf-partner-step h3 { margin:2px 0 7px; color:#173C52; font-size:16px; }
.nf-partner-step p { margin:0; color:#5B7180; font-size:13px; line-height:1.6; }
.nf-partner-program-note {
  margin-top:16px;
  padding:18px 20px;
  border-left:5px solid #F7C41C;
  border-radius:14px;
  background:#FFF9E8;
  color:#604A1C;
  font-size:14px;
  line-height:1.7;
}
.nf-partner-portal-note {
  display:none;
  margin-top:15px;
  padding:16px;
  border:1px solid #8FC4E4;
  border-radius:14px;
  background:#EAF7FF;
  color:#173C52;
  line-height:1.65;
}
.nf-partner-portal-note.visible { display:block; }
.nf-partner-form-shell {
  display:grid;
  grid-template-columns:minmax(250px,.72fr) minmax(0,1.28fr);
  gap:28px;
  padding:clamp(22px,4vw,38px);
  border:1px solid #E2D5C6;
  border-radius:26px;
  background:linear-gradient(145deg,#FFFDF8,#F7F0E6);
  box-shadow:0 16px 40px rgba(45,31,20,.09);
}
.nf-partner-form-intro h2 { margin:9px 0 12px; font-family:'Bebas Neue',Impact,sans-serif; font-size:46px; line-height:.95; }
.nf-partner-form-intro p { color:#62554A; font-size:14px; line-height:1.75; }
.nf-partner-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.nf-partner-field { display:grid; gap:6px; }
.nf-partner-field.full { grid-column:1/-1; }
.nf-partner-field label { color:#4A3313; font-size:11px; font-weight:850; letter-spacing:.05em; text-transform:uppercase; }
.nf-partner-field select { width:100%; min-height:50px; padding:12px 14px; border:1.5px solid #CDB58D; border-radius:12px; background:#FFFFFF; color:#17120E; font:inherit; font-size:15px; }
.nf-partner-field textarea { min-height:110px; resize:vertical; }
.nf-partner-consent { grid-column:1/-1; display:flex; align-items:flex-start; gap:10px; padding:12px; border-radius:12px; background:#FFFFFF; color:#5D5148; font-size:12.5px; line-height:1.55; }
.nf-partner-consent input { width:18px !important; height:18px; flex:0 0 18px; margin-top:1px; box-shadow:none !important; }
.nf-partner-submit { grid-column:1/-1; min-height:52px; }
.nf-partner-success { padding:24px; border:2px solid #8FA97B; border-radius:18px; background:#F7FBF4; text-align:center; }
.nf-partner-success h3 { margin:0; font-family:'Bebas Neue',Impact,sans-serif; font-size:34px; color:#3F6031; }
.nf-partner-success p { margin:8px 0 0; color:#536948; line-height:1.65; }
.nf-partner-faq { display:grid; gap:10px; }
.nf-partner-faq details { border:1px solid #E5DBCF; border-radius:15px; background:#FFFFFF; }
.nf-partner-faq summary { padding:16px 18px; cursor:pointer; color:#2B211A; font-weight:800; }
.nf-partner-faq p { margin:0; padding:0 18px 18px; color:#65584D; font-size:13.5px; line-height:1.7; }
@media (max-width:850px) {
  .nf-partner-hero,.nf-partner-form-shell { grid-template-columns:1fr; }
  .nf-partner-benefits,.nf-partner-process { grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (max-width:600px) {
  .nf-partner-page { padding-bottom:165px; }
  .nf-partner-main { padding-top:20px; }
  .nf-partner-hero { padding:27px 20px; border-radius:22px; }
  .nf-partner-hero h2 { font-size:52px; }
  .nf-partner-benefits,.nf-partner-process,.nf-partner-form-grid { grid-template-columns:1fr; }
  .nf-partner-field.full,.nf-partner-consent,.nf-partner-submit { grid-column:auto; }
  .nf-partner-section { margin-top:42px; }
  .nf-partner-heading h2,.nf-partner-form-intro h2 { font-size:38px; }
}
`;

const BUSINESS_TYPES = [
  "Boutique or gift shop",
  "Farm store or market",
  "Café, bakery, or restaurant",
  "Specialty food retailer",
  "Hospitality or lodging",
  "Corporate or gifting program",
  "Other",
];

const BENEFITS = [
  ["✦", "Distinctive Michigan-made honey", "A broad infused-honey collection made in small batches with real ingredients."],
  ["◌", "Built for discovery", "Flavors invite sampling, conversation, pairing ideas, and repeat visits."],
  ["▣", "Shelf-friendly presentation", "Giftable jars designed to work in boutiques, cafés, farm stores, and specialty retailers."],
  ["↻", "Reorder support", "Approved partners can request replenishment and receive direct help with timing and assortment."],
  ["▤", "Partner materials", "Product information, flavor guidance, and approved brand resources will live in the Partner Portal."],
  ["♥", "A direct relationship", "You work directly with the NectarFusions team rather than through a distant distributor."],
];

const PROCESS = [
  ["Apply", "Tell us about your business, customers, and where NectarFusions would be sold."],
  ["We review the fit", "We look at location, assortment, timing, and the kind of partnership that makes sense."],
  ["Receive program details", "Approved businesses receive current product options, order expectations, and next steps."],
  ["Place an opening order", "Choose the assortment and fulfillment plan confirmed with NectarFusions."],
  ["Receive products and materials", "We prepare the jars and provide the information needed to merchandise them confidently."],
  ["Request replenishment", "Current partners use the secure portal to request restocks and access updated resources."],
];

const FAQS = [
  ["Who may apply?", "Boutiques, gift shops, farm stores, cafés, specialty food retailers, hospitality businesses, and other established businesses that are a strong fit for the brand."],
  ["Is there a minimum opening order?", "Opening-order requirements are provided after review because the right assortment depends on the business, product format, and fulfillment plan."],
  ["Can we choose our flavors?", "Yes. Availability changes by season and inventory, but approved partners can discuss an assortment that fits their customers."],
  ["Is local pickup available?", "Pickup may be available for approved Michigan partners. Shipping or delivery details are confirmed during setup."],
  ["Do you offer consignment?", "Wholesale purchasing is the standard program. A limited trial arrangement may be considered for select local businesses when both sides agree to the terms in writing."],
  ["How do reorders work?", "Current partners will submit replenishment requests through the secure Partner Portal. A request is reviewed and confirmed before it becomes a final order."],
  ["How should the honey be stored?", "Store jars sealed at room temperature, away from direct sunlight and excessive heat. Product-specific handling guidance is provided to approved partners."],
  ["Who should we contact?", "Email info@nectar-fusions.com or call or text (989) 941-6385."],
];

export default function PartnerPage({ Header, styles, onBack, submitInquiry }) {
  const [portalNotice, setPortalNotice] = useState(false);
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
    businessAddress: "",
    salesLocation: "",
    openingTiming: "",
    interests: "",
    assortment: "",
    heard: "",
    message: "",
    consent: false,
  });

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  };

  const canSubmit = useMemo(
    () => form.contactName.trim() && form.businessName.trim() && form.businessType &&
      form.email.trim() && form.salesLocation.trim() && form.consent && !busy,
    [form, busy]
  );

  const scrollToApplication = () => {
    document.getElementById("partner-application")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("Complete the required business, contact, sales-location, and consent fields.");
      return;
    }

    setBusy(true);
    setError("");

    const details = [
      "PARTNER INQUIRY",
      `Business: ${form.businessName.trim()}`,
      `Business type: ${form.businessType}`,
      `Website or social: ${form.websiteSocial.trim() || "Not provided"}`,
      `Business address: ${form.businessAddress.trim() || "Not provided"}`,
      `Where products would be sold: ${form.salesLocation.trim()}`,
      `Estimated opening timing: ${form.openingTiming.trim() || "Not provided"}`,
      `Products or flavors of interest: ${form.interests.trim() || "Not provided"}`,
      `Current retail assortment: ${form.assortment.trim() || "Not provided"}`,
      `How they heard about NectarFusions: ${form.heard.trim() || "Not provided"}`,
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
        eyebrow="Retail & Wholesale"
        title="PARTNER WITH NECTARFUSIONS"
        right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>}
      />

      <main className="nf-wrap nf-partner-main">
        <section className="nf-partner-hero">
          <div className="nf-partner-hero-copy">
            <div className="nf-modern-kicker" style={{ color: "#72B7E4" }}>For shops, cafés, markets, and gifting</div>
            <h2>Bring NectarFusions to <span>Your Customers</span></h2>
            <p>
              Add a Michigan-made infused honey collection that encourages discovery, conversation, gifting, and
              memorable flavor experiences. We work directly with approved retail and hospitality partners.
            </p>
            <div className="nf-partner-actions">
              <button type="button" className="btn solid" onClick={scrollToApplication}>Become a Partner</button>
              <button type="button" className="btn nf-partner-secondary" onClick={() => setPortalNotice((open) => !open)}>
                Current Partner Login
              </button>
            </div>
            <div className={`nf-partner-portal-note ${portalNotice ? "visible" : ""}`} role="status">
              Secure portal access is the next build in this project. Current partners can contact
              <strong> info@nectar-fusions.com</strong> for materials or replenishment support while it is completed.
            </div>
          </div>

          <aside className="nf-partner-hero-card" aria-label="Partner program overview">
            <strong>A thoughtful retail partnership</strong>
            <ul>
              <li><span>01</span><span>Wholesale is the standard path for approved accounts.</span></li>
              <li><span>02</span><span>Assortment and opening-order details are reviewed with each business.</span></li>
              <li><span>03</span><span>Limited local trials may be considered when clearly documented.</span></li>
              <li><span>04</span><span>Replenishment requests are confirmed based on stock and timing.</span></li>
            </ul>
          </aside>
        </section>

        <section className="nf-partner-section">
          <div className="nf-partner-heading">
            <div className="nf-modern-kicker">Why partner with us</div>
            <h2>Honey That Gives People Something to Talk About</h2>
            <p>
              NectarFusions combines raw Michigan honey with real ingredients in flavors designed to be sampled,
              shared, gifted, paired, and remembered.
            </p>
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
            <h2>A Clear Path From Application to Reorder</h2>
          </div>
          <div className="nf-partner-process">
            {PROCESS.map(([title, copy]) => (
              <article className="nf-partner-step" key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div className="nf-partner-program-note">
            Pricing, quantities, lead times, and product availability are provided from current program information
            after review rather than being permanently hard-coded into this page.
          </div>
        </section>

        <section id="partner-application" className="nf-partner-section nf-partner-form-shell">
          <div className="nf-partner-form-intro">
            <div className="nf-modern-kicker">Partner inquiry</div>
            <h2>Tell Us About Your Business</h2>
            <p>
              This first form is intentionally focused. We need enough information to understand the fit without asking
              for detailed financial records before we have spoken with you.
            </p>
            <p><strong>Required fields are marked with an asterisk.</strong></p>
          </div>

          {done ? (
            <div className="nf-partner-success" role="status">
              <h3>Inquiry received</h3>
              <p>Thank you. NectarFusions will review the information and contact you using the details provided.</p>
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
                <label htmlFor="partner-email">Email *</label>
                <input id="partner-email" type="email" value={form.email} onChange={update("email")} />
              </div>
              <div className="nf-partner-field">
                <label htmlFor="partner-phone">Phone</label>
                <input id="partner-phone" inputMode="tel" value={form.phone} onChange={update("phone")} />
              </div>
              <div className="nf-partner-field">
                <label htmlFor="partner-web">Website or social link</label>
                <input id="partner-web" value={form.websiteSocial} onChange={update("websiteSocial")} />
              </div>
              <div className="nf-partner-field full">
                <label htmlFor="partner-address">Business address</label>
                <input id="partner-address" value={form.businessAddress} onChange={update("businessAddress")} />
              </div>
              <div className="nf-partner-field full">
                <label htmlFor="partner-sold">Where would NectarFusions be sold? *</label>
                <textarea id="partner-sold" value={form.salesLocation} onChange={update("salesLocation")}
                  placeholder="Store location, market, café counter, gifting program, online shop, or other sales setting" />
              </div>
              <div className="nf-partner-field">
                <label htmlFor="partner-timing">Estimated opening timing</label>
                <input id="partner-timing" value={form.openingTiming} onChange={update("openingTiming")}
                  placeholder="For example: within 30 days" />
              </div>
              <div className="nf-partner-field">
                <label htmlFor="partner-heard">How did you hear about us?</label>
                <input id="partner-heard" value={form.heard} onChange={update("heard")} />
              </div>
              <div className="nf-partner-field full">
                <label htmlFor="partner-interests">Flavors or product categories of interest</label>
                <textarea id="partner-interests" value={form.interests} onChange={update("interests")} />
              </div>
              <div className="nf-partner-field full">
                <label htmlFor="partner-assortment">Current retail assortment</label>
                <textarea id="partner-assortment" value={form.assortment} onChange={update("assortment")}
                  placeholder="What products, gifts, foods, or brands do you currently carry?" />
              </div>
              <div className="nf-partner-field full">
                <label htmlFor="partner-message">Additional questions or message</label>
                <textarea id="partner-message" value={form.message} onChange={update("message")} />
              </div>

              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="partner-website-check">Leave this field empty</label>
                <input id="partner-website-check" tabIndex={-1} autoComplete="off" value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)} />
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
            <div className="nf-modern-kicker">Partner FAQ</div>
            <h2>Before You Apply</h2>
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
