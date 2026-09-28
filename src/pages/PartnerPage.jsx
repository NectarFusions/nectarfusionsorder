import { useMemo, useState } from "react";

const PROGRAMS = [
  {
    key: "retail",
    action: "Sell NectarFusions",
    label: "Retail Partners",
    copy: "Stock NectarFusions on your shelves with curated opening packages and simple replenishment.",
    accent: "#167BB6",
  },
  {
    key: "foodservice",
    action: "Serve NectarFusions",
    label: "Foodservice",
    copy: "Use NectarFusions in cafés, bakeries, restaurants, hospitality, beverage programs, and kitchens.",
    accent: "#E69B00",
  },
  {
    key: "business_gifting",
    action: "Gift NectarFusions",
    label: "Business Gifting",
    copy: "Choose individual 20, 50, or 100-gift packages for clients, employees, and events, or choose the boxed Signature Six tasting collection for premium gifting.",
    accent: "#73558F",
  },
  {
    key: "hive_partners",
    action: "Sponsor the Bees",
    label: "Hive Partners",
    copy: "Support NectarFusions apiaries through a structured business sponsorship program with annual renewal.",
    accent: "#527A3F",
  },
];

const BUSINESS_TYPES = [
  "Retail store or boutique",
  "Farm store or specialty grocery",
  "Café, bakery, restaurant, or kitchen",
  "Hospitality or venue",
  "Corporate or professional services",
  "Event or gifting business",
  "Other",
];

const CSS = `
.nf-partner-page{padding-bottom:180px}.nf-partner-main{padding-top:30px;padding-bottom:84px}.nf-program-hero{padding:clamp(30px,5vw,58px);border-radius:30px;background:radial-gradient(circle at 90% 10%,rgba(247,196,28,.22),transparent 30%),linear-gradient(145deg,#102E40 0%,#174C68 58%,#1B6F91 100%);color:#fff;box-shadow:0 24px 58px rgba(31,20,12,.18)}.nf-program-hero h2{max-width:760px;margin:10px 0 12px;font-family:'Bebas Neue',Impact,sans-serif;font-size:clamp(54px,7vw,86px);line-height:.92;letter-spacing:.015em}.nf-program-hero h2 span{color:#F7C41C}.nf-program-hero p{max-width:720px;margin:0;color:#E7F0F4;font-size:16px;line-height:1.72}.nf-program-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.nf-program-secondary{border-color:rgba(255,255,255,.52)!important;background:rgba(255,255,255,.1)!important;color:#fff!important}.nf-program-section{margin-top:50px}.nf-program-heading{max-width:780px;margin-bottom:20px}.nf-program-heading h2{margin:7px 0 8px;font-family:'Bebas Neue',Impact,sans-serif;font-size:46px;line-height:.95;color:#17120E}.nf-program-heading p{margin:0;color:#65584D;line-height:1.7}#partner-programs{scroll-margin-top:96px}.nf-program-choice-section{position:relative;padding:clamp(24px,4vw,38px);border:2px solid #D8E5EC;border-radius:28px;background:radial-gradient(circle at 92% 6%,rgba(247,196,28,.16),transparent 26%),linear-gradient(145deg,#F7FBFD 0%,#FFFDF7 100%);box-shadow:0 18px 46px rgba(30,60,77,.09)}.nf-program-choice-section .nf-program-heading{max-width:860px;margin-bottom:24px}.nf-program-choice-section .nf-program-heading h2{font-size:clamp(46px,5.2vw,62px);color:#173C52}.nf-program-choice-section .nf-program-heading p{max-width:760px;font-size:15px}.nf-program-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.nf-program-card{position:relative;overflow:hidden;display:grid;align-content:start;min-height:292px;padding:24px 22px 58px;border:2px solid color-mix(in srgb,var(--accent) 38%,#E2D9CF);border-top:6px solid var(--accent);border-radius:22px;background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 8%,#fff) 0%,#fff 48%);box-shadow:0 12px 30px rgba(45,31,20,.08);cursor:pointer;text-align:left;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}.nf-program-card::after{content:"Choose this program →";position:absolute;left:22px;right:22px;bottom:18px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--accent) 26%,#E6E0D8);color:var(--accent);font-size:12px;font-weight:950;letter-spacing:.025em}.nf-program-card:hover{transform:translateY(-5px);border-color:var(--accent);box-shadow:0 20px 38px color-mix(in srgb,var(--accent) 18%,rgba(45,31,20,.12))}.nf-program-card.selected{transform:translateY(-3px);border-color:var(--accent);background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 16%,#fff) 0%,#fff 54%);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent),0 18px 36px color-mix(in srgb,var(--accent) 17%,rgba(45,31,20,.1))}.nf-program-card.selected::after{content:"Selected ✓";color:var(--accent)}.nf-program-card .check{position:absolute;top:16px;right:16px;width:31px;height:31px;display:grid;place-items:center;border-radius:50%;border:2px solid color-mix(in srgb,var(--accent) 45%,#D5DEE2);background:#fff;color:transparent;font-weight:950;transition:.18s ease}.nf-program-card.selected .check{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 4px 12px color-mix(in srgb,var(--accent) 30%,transparent)}.nf-program-card .label{display:inline-flex;width:max-content;padding:7px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,#fff);border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);color:var(--accent);font-size:11px;font-weight:950;letter-spacing:.055em;text-transform:uppercase}.nf-program-card h3{margin:38px 0 7px;color:#173C52;font-size:24px;line-height:1.08}.nf-program-card h4{margin:0 0 11px;color:var(--accent);font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.07em}.nf-program-card p{margin:0;color:#5F554C;font-size:14px;line-height:1.65}.nf-program-note{margin-top:14px;padding:14px 16px;border-left:5px solid #F7C41C;border-radius:12px;background:#FFF9E8;color:#604A1C;line-height:1.6;font-size:14px}.nf-program-continue{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:18px;padding:18px 20px;border:2px solid #F7C41C;border-radius:18px;background:linear-gradient(135deg,#173C52 0%,#1B6685 100%);box-shadow:0 14px 30px rgba(23,60,82,.16);animation:nfProgramContinueIn .22s ease-out}.nf-program-continue-copy{min-width:0;color:#fff}.nf-program-continue-copy strong{display:block;font-size:16px;line-height:1.25}.nf-program-continue-copy span{display:block;margin-top:4px;color:#DCEBF2;font-size:13px;line-height:1.5}.nf-program-continue .btn{flex:0 0 auto;min-height:48px;padding:12px 18px;border-color:#F7C41C!important;background:#F7C41C!important;color:#173C52!important;font-weight:950;box-shadow:0 7px 18px rgba(0,0,0,.13)}#partner-application{scroll-margin-top:96px}@keyframes nfProgramContinueIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.nf-program-form-shell{display:grid;grid-template-columns:minmax(260px,.72fr) minmax(0,1.28fr);gap:28px;padding:clamp(22px,4vw,38px);border:1px solid #E1D5C8;border-radius:26px;background:linear-gradient(145deg,#FFFDF8,#F7F0E6);box-shadow:0 16px 40px rgba(45,31,20,.08)}.nf-program-form-intro h2{margin:8px 0 11px;font-family:'Bebas Neue',Impact,sans-serif;font-size:46px;line-height:.95}.nf-selected-list{display:grid;gap:7px;margin-top:16px}.nf-selected-chip{display:flex;justify-content:space-between;gap:8px;padding:9px 11px;border-radius:10px;background:#fff;border:1px solid #DED5CB;font-size:12px;font-weight:850}.nf-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nf-field{display:grid;gap:6px}.nf-field.full{grid-column:1/-1}.nf-field label{color:#4A3313;font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.nf-field input,.nf-field select,.nf-field textarea{width:100%;min-height:48px;padding:11px 13px;border:1.5px solid #CDB58D;border-radius:11px;background:#fff;color:#17120E;font:inherit}.nf-field textarea{min-height:100px;resize:vertical}.nf-consent{grid-column:1/-1;display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:11px;background:#fff;color:#5D5148;font-size:13px;line-height:1.55}.nf-consent input{width:18px!important;height:18px;flex:0 0 18px;margin-top:1px}.nf-submit{grid-column:1/-1;min-height:52px}.nf-form-error{grid-column:1/-1;padding:10px 12px;border-radius:10px;background:#FFF0EF;color:#8A3D36;font-size:13px}.nf-success{padding:24px;border:2px solid #9AB78B;border-radius:18px;background:#F6FBF3}.nf-success h3{margin:0 0 8px;font-family:'Bebas Neue',Impact,sans-serif;font-size:34px;color:#3F6031}.nf-success p{margin:0;color:#536948;line-height:1.65}.nf-success ul{margin:14px 0 0;padding-left:20px;color:#536948}.nf-process{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;counter-reset:step}.nf-process article{position:relative;padding:52px 17px 17px;border:1px solid #DDE8EF;border-radius:17px;background:#F6FBFE;min-height:145px}.nf-process article:before{counter-increment:step;content:counter(step);position:absolute;left:17px;top:16px;width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#173C52;color:#fff;font-weight:900}.nf-process h3{margin:0 0 6px;color:#173C52;font-size:15px}.nf-process p{margin:0;color:#617783;font-size:13px;line-height:1.6}@media(max-width:1000px){.nf-program-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.nf-program-form-shell{grid-template-columns:1fr}.nf-process{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.nf-partner-main{padding-top:20px}.nf-program-hero{padding:28px 20px;border-radius:22px}.nf-program-grid,.nf-form-grid,.nf-process{grid-template-columns:1fr}.nf-field.full,.nf-consent,.nf-submit{grid-column:auto}.nf-program-heading h2,.nf-program-form-intro h2{font-size:38px}.nf-program-continue{align-items:stretch;flex-direction:column}.nf-program-continue .btn{width:100%}}
`;

export default function PartnerPage({ Header, styles, onBack, onPartnerLogin, submitProgramApplication }) {
  const [specialEventReferral] = useState(() => {
    if (typeof window === "undefined") return false;

    try {
      const referred =
        window.sessionStorage.getItem(
          "nf-special-event-business-referral"
        ) === "1";

      if (referred) {
        window.sessionStorage.removeItem(
          "nf-special-event-business-referral"
        );
      }

      return referred;
    } catch {
      return false;
    }
  });

  const [selectedPrograms, setSelectedPrograms] = useState(() =>
    specialEventReferral ? ["business_gifting"] : []
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [honeypot, setHoneypot] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    contactName: "",
    businessName: "",
    businessType: "",
    email: "",
    phone: "",
    websiteSocial: "",
    salesLocation: "",
    message: "",
    consent: false,
  });

  const selectedDetails = useMemo(
    () => PROGRAMS.filter((program) => selectedPrograms.includes(program.key)),
    [selectedPrograms]
  );

  const canSubmit = Boolean(
    selectedPrograms.length &&
      form.contactName.trim() &&
      form.businessName.trim() &&
      form.businessType &&
      form.email.trim() &&
      form.salesLocation.trim() &&
      form.consent &&
      !busy
  );

  const update = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const toggleProgram = (key) => {
    setSelectedPrograms((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
    setError("");
  };

  const scrollToPrograms = () =>
    document.getElementById("partner-programs")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

  const scrollToApplication = () =>
    document.getElementById("partner-application")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError("Choose at least one program and complete the required business, contact, location, and consent fields.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await submitProgramApplication({
        ...form,
        programKeys: selectedPrograms,
        website: honeypot,
        formStartedAt,
      });
      setDone(result || { programKeys: selectedPrograms });
    } catch (submitError) {
      setError(submitError?.message || "Your partner application could not be submitted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nf nf-partner-page">
      <style>{styles}</style>
      <style>{CSS}</style>
      <Header
        eyebrow="Retail • Foodservice • Gifting • Hive Partners"
        title="PARTNER WITH NECTARFUSIONS"
        right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>}
      />

      <main className="nf-wrap nf-partner-main">
        <section className="nf-program-hero">
          <div className="nf-modern-kicker" style={{ color: "#72B7E4" }}>One account. The programs that fit your business.</div>
          <h2>Partner With <span>NectarFusions</span></h2>
          <p>
            Choose how your company wants to work with NectarFusions. You create one business account, and each
            program is reviewed and approved independently. Add another program later without creating another account.
          </p>
          <div className="nf-program-actions">
            <button type="button" className="btn solid" onClick={scrollToPrograms}>Choose Your Programs</button>
            <button type="button" className="btn nf-program-secondary" onClick={onPartnerLogin}>Partner Login</button>
          </div>
        </section>

        


        {specialEventReferral && (
          <section
            className="nf-program-section"
            style={{ marginTop: 20 }}
          >
            <div
              className="nf-program-note"
              style={{
                borderLeftWidth: 6,
                padding: "18px 20px",
                background: "#FFF7D9",
              }}
            >
              <strong
                style={{
                  display: "block",
                  marginBottom: 5,
                  color: "#4A3313",
                  fontSize: 17,
                }}
              >
                Planning a special event for a business?
              </strong>

              <span style={{ display: "block" }}>
                Business accounts are reviewed for partner-only
                special offers, volume event ordering, and
                business gifting options. We selected{" "}
                <strong>Business Gifting</strong> for you. Complete
                the Partner application to request access; once
                approved, your business offers and ordering tools
                will be available through the Partner Portal.
              </span>

              <button
                type="button"
                className="btn solid"
                onClick={scrollToApplication}
                style={{ marginTop: 13 }}
              >
                Continue to Partner Signup →
              </button>
            </div>
          </section>
        )}

        <section className="nf-program-section">
          <div className="nf-program-heading">
            <div className="nf-modern-kicker">How it works</div>
            <h2>One Business Account From Application to Reorder</h2>
          </div>
          <div className="nf-process">
            <article><h3>Choose program(s)</h3><p>Select Sell, Serve, Gift, Sponsor, or any combination that applies to your company.</p></article>
            <article><h3>Create one account</h3><p>Your business information is stored once and every selected program is attached to that account.</p></article>
            <article><h3>Programs are reviewed</h3><p>NectarFusions approves each program separately, so access can grow with your business.</p></article>
            <article><h3>Order from your portal</h3><p>Approved packages, orders, recurring activity, delivery settings, and reorders live in one secure place.</p></article>
          </div>
        </section>

        

        {/* PARTNER PROGRAM ORDER V10.6 */}
<section id="partner-programs" className="nf-program-section nf-program-choice-section">
          <div className="nf-program-heading">
            <div className="nf-modern-kicker">Select all that apply</div>
            <h2>How Do You Want to Partner?</h2>
            <p>A business can apply for one program or several. Each selection stays attached to the same NectarFusions partner account.</p>
          </div>

          <div className="nf-program-grid">
            {PROGRAMS.map((program) => {
              const selected = selectedPrograms.includes(program.key);
              return (
                <button
                  key={program.key}
                  type="button"
                  className={`nf-program-card${selected ? " selected" : ""}`}
                  style={{ "--accent": program.accent }}
                  aria-pressed={selected}
                  onClick={() => toggleProgram(program.key)}
                >
                  <span className="check" aria-hidden="true">✓</span>
                  <span className="label">{selected ? "Selected" : "Choose program"}</span>
                  <h3>{program.action}</h3>
                  <h4>{program.label}</h4>
                  <p>{program.copy}</p>
                </button>
              );
            })}
          </div>

          <div className="nf-program-note">
            <strong>Choose every program that fits your business.</strong>{" "}
            Program access is reviewed independently, so selecting multiple options keeps everything under one partner account without automatically approving every program.
          </div>

          {selectedPrograms.length > 0 && (
            <div className="nf-program-continue" role="status">
              <div className="nf-program-continue-copy">
                <strong>
                  {selectedPrograms.length} program{selectedPrograms.length === 1 ? "" : "s"} selected
                </strong>
                <span>
                  Ready for the next step? Add your business details to create your NectarFusions Partner account.
                </span>
              </div>

              <button
                type="button"
                className="btn solid"
                onClick={scrollToApplication}
              >
                Continue to Application →
              </button>
            </div>
          )}
        </section>

<section id="partner-application" className="nf-program-section nf-program-form-shell">
          <div className="nf-program-form-intro">
            <div className="nf-modern-kicker">Partner application</div>
            <h2>Create Your Business Account</h2>
            <p>Enter your company information once. We will create one NectarFusions partner account and place each selected program into review.</p>
            <div className="nf-selected-list">
              {selectedDetails.length ? selectedDetails.map((program) => (
                <div className="nf-selected-chip" key={program.key}><span>{program.action}</span><span>{program.label}</span></div>
              )) : <div className="nf-selected-chip"><span>No programs selected yet</span><span>Choose above</span></div>}
            </div>
          </div>

          {done ? (
            <div className="nf-success" role="status">
              <h3>Application Received</h3>
              <p>Your business account has been created or updated. These programs are now awaiting NectarFusions review:</p>
              <ul>{selectedDetails.map((program) => <li key={program.key}>{program.label}</li>)}</ul>
              <p style={{ marginTop: 12 }}>When your first program is approved, NectarFusions can enable your secure partner login. Additional approvals unlock inside the same account.</p>
            </div>
          ) : (
            <form className="nf-form-grid" onSubmit={submit}>
              <div className="nf-field"><label htmlFor="partner-contact">Contact name *</label><input id="partner-contact" value={form.contactName} onChange={update("contactName")} autoComplete="name" /></div>
              <div className="nf-field"><label htmlFor="partner-business">Business name *</label><input id="partner-business" value={form.businessName} onChange={update("businessName")} autoComplete="organization" /></div>
              <div className="nf-field"><label htmlFor="partner-type">Business type *</label><select id="partner-type" value={form.businessType} onChange={update("businessType")}><option value="">Choose one</option>{BUSINESS_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
              <div className="nf-field"><label htmlFor="partner-email">Email *</label><input id="partner-email" type="email" value={form.email} onChange={update("email")} autoComplete="email" /></div>
              <div className="nf-field"><label htmlFor="partner-phone">Phone</label><input id="partner-phone" value={form.phone} onChange={update("phone")} autoComplete="tel" /></div>
              <div className="nf-field"><label htmlFor="partner-site">Website or social</label><input id="partner-site" value={form.websiteSocial} onChange={update("websiteSocial")} /></div>
              <div className="nf-field full"><label htmlFor="partner-location">Where will NectarFusions be sold, served, gifted, or represented? *</label><input id="partner-location" value={form.salesLocation} onChange={update("salesLocation")} placeholder="City, storefront, café, service area, venue, etc." /></div>
              <div className="nf-field full"><label htmlFor="partner-message">Anything we should know?</label><textarea id="partner-message" value={form.message} onChange={update("message")} /></div>
              <div style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true"><label>Website<input tabIndex="-1" autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} /></label></div>
              <label className="nf-consent"><input type="checkbox" checked={form.consent} onChange={update("consent")} /><span>I confirm this information is accurate and give NectarFusions permission to contact me about the selected partner programs. *</span></label>
              {error && <div className="nf-form-error" role="alert">{error}</div>}
              <button className="btn solid nf-submit" type="submit" disabled={!canSubmit}>{busy ? "Submitting…" : `Submit ${selectedPrograms.length || ""} Program Application${selectedPrograms.length === 1 ? "" : "s"}`}</button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
