import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const PROGRAMS = [
  ["retail", "Retail"],
  ["foodservice", "Foodservice"],
  ["business_gifting", "Business Gifting"],
  ["hive_partners", "Hive Partners"],
];
const PROGRAM_STATUS = ["pending", "approved", "declined", "suspended"];
const APPLICATION_STATUS = ["pending", "under_review", "needs_information", "approved", "declined", "withdrawn"];
/* PARTNER PAYMENT INTEGRITY V15 */
const PAYMENT_PENDING_STATUS = ["awaiting_payment", "cancelled"];
const PAID_FULFILLMENT_STATUS = [
  "queued",
  "preparing",
  "ready",
  "out_for_delivery",
  "pickup_ready",
  "fulfilled",
  "cancelled",
];
const FULFILLMENT_STATUS = new Set(["paid", ...PAID_FULFILLMENT_STATUS]);

const orderStatusOptions = (order) => {
  if (!order?.paid) {
    return [...new Set([order?.status, ...PAYMENT_PENDING_STATUS].filter(Boolean))];
  }

  if (order?.status === "paid") {
    return ["paid", ...PAID_FULFILLMENT_STATUS];
  }

  return [
    ...new Set([order?.status, ...PAID_FULFILLMENT_STATUS].filter(Boolean)),
  ];
};
const TABS = [
  ["applications", "Applications"],
  ["partners", "Partners"],
  ["packages", "Packages"],
  ["orders", "Orders"],
  ["fulfillment", "Fulfillment"],
  ["recurring", "Recurring"],
  ["automation", "Automation"],
];

const pretty = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
const date = (value) => value ? new Date(value).toLocaleDateString() : "—";
const splitCsv = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const programLabel = (key) => PROGRAMS.find(([id]) => id === key)?.[1] || pretty(key);

const emptyPackage = () => ({
  id: null,
  package_key: "",
  program_key: "retail",
  name: "",
  description: "",
  image_url: "",
  active: false,
  package_type: "starter",
  price_mode: "catalog",
  base_price_cents: "",
  minimum_quantity: "",
  default_quantity: "",
  quantity_increment: "6",
  flavor_selection_count: "",
  allowed_flavor_names: [],
  allowed_size_ids: [],
  allowed_textures: [],
  pickup_allowed: true,
  delivery_allowed: true,
  recurring_allowed: false,
  default_reorder_interval_days: "",
  configuration_schema: {},
  sort: 0,
});

const emptyPackageItem = (packageId = null) => ({
  id: null,
  package_id: packageId,
  product_key: "",
  category: "bulk",
  quantity: "",
  flavor_id: null,
  flavor_name: "",
  size_id: "",
  texture: "",
  unit_price_cents: "",
  rules: {},
  sort: 0,
});

const CSS = `
.nf-apc{display:grid;gap:16px}.nf-apc-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.nf-apc-head h2,.nf-apc-head h3{margin:3px 0 5px}.nf-apc-head p{margin:0;color:#6b7d87;max-width:820px;line-height:1.5}.nf-apc-tabs{display:flex;gap:7px;flex-wrap:wrap;padding:7px;border:1px solid #dce8ed;border-radius:14px;background:#f7fafb}.nf-apc-tabs button{border:0;background:transparent;border-radius:9px;padding:9px 13px;font:inherit;font-size:12px;font-weight:900;color:#496777;cursor:pointer}.nf-apc-tabs button[aria-selected=true]{background:#102e40;color:#fff}.nf-apc-tab-label{display:inline-flex;align-items:center;gap:7px}.nf-apc-tab-badge{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#ff3b30;color:#fff;font-size:10px;font-weight:950;line-height:1;box-shadow:0 0 0 2px rgba(255,255,255,.72)}.nf-apc-tabs button[aria-selected=true] .nf-apc-tab-badge{background:#f7c41c;color:#102e40;box-shadow:none}.nf-apc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nf-apc-card{border:1px solid #dce8ed;border-radius:14px;padding:14px;background:#fff}.nf-apc-card h3,.nf-apc-card h4{margin:0 0 8px}.nf-apc-card p{color:#6b7d87;line-height:1.5}.nf-apc-row{display:grid;grid-template-columns:1.2fr .8fr .8fr auto;gap:10px;align-items:center;border:1px solid #e0eaee;border-radius:11px;padding:11px}.nf-apc-row+.nf-apc-row{margin-top:8px}.nf-apc-row span{font-size:10px;color:#7a8d96;text-transform:uppercase;letter-spacing:.045em;display:block}.nf-apc-row strong{font-size:13px;color:#173c4f}.nf-apc-btn{border:1px solid #1c6181;border-radius:9px;padding:9px 12px;background:#fff;color:#174d66;font:inherit;font-size:12px;font-weight:900;cursor:pointer}.nf-apc-btn.primary{background:#102e40;color:#fff;border-color:#102e40}.nf-apc-btn.warn{border-color:#c28a24;color:#7a5718}.nf-apc-btn.danger{border-color:#b45f59;color:#8a3d36}.nf-apc-btn:disabled{opacity:.5;cursor:not-allowed}.nf-apc-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.nf-apc-message{padding:10px 12px;border-radius:9px;font-size:12px}.nf-apc-message.error{background:#fff0ef;color:#8a3d36}.nf-apc-message.success{background:#edf8f1;color:#2f6845}.nf-apc-programs{display:grid;gap:7px}.nf-apc-program-row{display:grid;grid-template-columns:1fr 155px;gap:9px;align-items:center}.nf-apc-program-row select,.nf-apc-field input,.nf-apc-field textarea,.nf-apc-field select,.nf-apc-row select{width:100%;border:1px solid #ccdde4;border-radius:9px;padding:9px;font:inherit;background:#fff}.nf-apc-field{display:grid;gap:5px}.nf-apc-field>span{font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:900;color:#56717e}.nf-apc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.nf-apc-field.wide{grid-column:1/-1}.nf-apc-checks{display:flex;gap:12px;flex-wrap:wrap}.nf-apc-checks label{display:flex;gap:6px;align-items:center;font-size:12px;font-weight:800}.nf-apc-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eff5f7;color:#426171;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.nf-apc-app{display:grid;grid-template-columns:1.1fr .75fr .8fr 1.1fr;gap:11px;border:1px solid #dce8ed;border-radius:13px;padding:13px;background:#fff}.nf-apc-app .meta{font-size:11px;color:#6d818a;line-height:1.5}.nf-apc-app h4{margin:2px 0 6px;color:#173c4f}.nf-apc-note{padding:11px 13px;border-left:4px solid #f7c41c;border-radius:9px;background:#fff9e8;color:#685221;font-size:12px;line-height:1.55}.nf-apc-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.nf-apc-stat{padding:12px;border:1px solid #dce8ed;border-radius:12px;background:#fff}.nf-apc-stat span{font-size:10px;color:#78909c;text-transform:uppercase;letter-spacing:.05em}.nf-apc-stat strong{display:block;margin-top:5px;color:#173c4f;font-size:20px}.nf-apc-subsection{margin-top:18px;padding-top:16px;border-top:1px solid #e2ebef}.nf-apc-item-grid{display:grid;gap:8px}.nf-apc-item{display:grid;grid-template-columns:1.2fr .8fr .6fr .8fr auto;gap:8px;align-items:end;padding:11px;border:1px solid #e0eaee;border-radius:11px;background:#fbfdfe}.nf-apc-auto-log{display:grid;grid-template-columns:1fr .8fr .7fr .7fr;gap:9px;padding:10px;border-bottom:1px solid #edf2f4;font-size:12px}.nf-apc-auto-log:last-child{border-bottom:0}.nf-apc-auto-log small{color:#718690}.nf-apc-template{display:grid;gap:7px;margin-top:9px;padding-top:9px;border-top:1px solid #edf2f4}@media(max-width:950px){.nf-apc-app,.nf-apc-row,.nf-apc-item,.nf-apc-auto-log{grid-template-columns:1fr 1fr}.nf-apc-stat-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.nf-apc-head{flex-direction:column}.nf-apc-grid,.nf-apc-form{grid-template-columns:1fr}.nf-apc-field.wide{grid-column:auto}.nf-apc-program-row,.nf-apc-app,.nf-apc-row,.nf-apc-item,.nf-apc-auto-log{grid-template-columns:1fr}.nf-apc-stat-grid{grid-template-columns:1fr 1fr}.nf-apc-actions{justify-content:flex-start}}`;

export default function AdminPartnerCommerce() {
  const [tab, setTab] = useState("applications");
  const [applications, setApplications] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [packages, setPackages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [automation, setAutomation] = useState([]);
  const [automationEvents, setAutomationEvents] = useState([]);
  /* PARTNER AUTOMATION PREVIEW V14 */
  const [dueOrders, setDueOrders] = useState([]);
  const [draft, setDraft] = useState(emptyPackage());
  const [itemDraft, setItemDraft] = useState(emptyPackageItem());
  const [itemRulesText, setItemRulesText] = useState("{}");
  const [configText, setConfigText] = useState("{}");
  const [customizationText, setCustomizationText] = useState("{}");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [applicationRows, accountRows, packageRows, orderRows, recurringRows, automationRows, automationEventRows, dueRows] = await Promise.all([
        api.listAdminPartnerProgramApplications(),
        api.listAdminPartnerProgramAccounts(),
        api.listAdminPartnerPackages(),
        api.listAllAdminPartnerStoreOrders(),
        api.listAdminPartnerRecurringOrders(),
        api.listAdminPartnerAutomationRules(),
        api.listAdminPartnerAutomationEvents(),
        api.listAdminPartnerReorderDueOrders(),
      ]);
      setApplications(applicationRows);
      setAccounts(accountRows);
      setPackages(packageRows);
      setOrders(orderRows);
      setRecurring(recurringRows);
      setAutomation(automationRows);
      setAutomationEvents(automationEventRows);
      setDueOrders(dueRows);
    } catch (loadError) {
      setError(loadError?.message || "Partner Commerce could not be loaded.");
    }
  };

  useEffect(() => { refresh(); }, []);

  const packageByProgram = useMemo(() => Object.fromEntries(PROGRAMS.map(([key]) => [key, packages.filter((pkg) => pkg.program_key === key)])), [packages]);
  const fulfillmentOrders = useMemo(() => orders.filter((order) => FULFILLMENT_STATUS.has(order.status)), [orders]);
  const pendingApplications = useMemo(() => applications.filter((row) => ["pending", "under_review", "needs_information"].includes(row.status)), [applications]);
  const newApplications = useMemo(() => applications.filter((row) => row.status === "pending"), [applications]);

  const reviewApplication = async (application, status) => {
    const key = `application:${application.id}`;
    setBusy(key); setError(""); setNotice("");
    try {
      const result = await api.adminReviewPartnerProgramApplication(application.id, status);
      setNotice(
        result?.inviteError
          ? `${programLabel(application.program_key)} was approved, but the portal invite needs attention: ${result.inviteError}`
          : `${programLabel(application.program_key)} application ${pretty(status).toLowerCase()}${result?.invited ? "; portal invite sent" : ""}.`
      );
      await refresh();
    } catch (saveError) { setError(saveError?.message || "Application could not be updated."); }
    finally { setBusy(""); }
  };

  const setProgramStatus = async (partnerId, programKey, status) => {
    const key = `program:${partnerId}:${programKey}`;
    setBusy(key); setError(""); setNotice("");
    try {
      const result = await api.adminSetPartnerProgramStatus(partnerId, programKey, status);
      setNotice(result?.inviteError
        ? `${programLabel(programKey)} access updated, but the portal invite needs attention: ${result.inviteError}`
        : `${programLabel(programKey)} access updated.`);
      await refresh();
    } catch (saveError) { setError(saveError?.message || "Program access could not be updated."); }
    finally { setBusy(""); }
  };

  const editPackage = (pkg) => {
    setDraft({ ...emptyPackage(), ...pkg, base_price_cents: pkg.base_price_cents ?? "", minimum_quantity: pkg.minimum_quantity ?? "", default_quantity: pkg.default_quantity ?? "", quantity_increment: pkg.quantity_increment ?? "", flavor_selection_count: pkg.flavor_selection_count ?? "", default_reorder_interval_days: pkg.default_reorder_interval_days ?? "" });
    setConfigText(JSON.stringify(pkg.configuration_schema || {}, null, 2));
    setCustomizationText(JSON.stringify(pkg.customization_options || {}, null, 2));
    setItemDraft(emptyPackageItem(pkg.id));
    setItemRulesText("{}");
    setTab("packages");
    requestAnimationFrame(() => document.getElementById("nf-apc-editor")?.scrollIntoView({ behavior: "smooth" }));
  };

  const savePackage = async () => {
    setBusy("package"); setError(""); setNotice("");
    try {
      let configuration;
      let customization;
      try { configuration = JSON.parse(configText || "{}"); } catch { throw new Error("Configuration JSON is not valid JSON."); }
      try { customization = JSON.parse(customizationText || "{}"); } catch { throw new Error("Customization JSON is not valid JSON."); }
      if (!draft.package_key.trim() || !draft.name.trim()) throw new Error("Package key and package name are required.");
      const saved = await api.adminSavePartnerPackage({ ...draft, configuration_schema: configuration, customization_options: customization });
      setNotice(`${saved.name || draft.name} saved.`);
      setDraft({ ...emptyPackage(), ...saved, items: draft.items || saved.items || [] });
      setConfigText(JSON.stringify(saved.configuration_schema || configuration || {}, null, 2));
      setCustomizationText(JSON.stringify(saved.customization_options || customization || {}, null, 2));
      setItemDraft(emptyPackageItem(saved.id));
      setItemRulesText("{}");
      await refresh();
    } catch (saveError) { setError(saveError?.message || "Package could not be saved."); }
    finally { setBusy(""); }
  };

  const changeOrderStatus = async (orderId, status) => {
    setBusy(`order:${orderId}`); setError("");
    try { await api.adminSetPartnerStoreOrderStatus(orderId, status); await refresh(); }
    catch (saveError) { setError(saveError?.message || "Order status could not be changed."); }
    finally { setBusy(""); }
  };


  /* PARTNER SQUARE RECONCILE V12 */
  const checkPartnerSquareStatus = async (order) => {
    const key = `square:${order.id}`;
    setBusy(key);
    setError("");
    setNotice("");

    try {
      const result = await api.syncPartnerStoreOrderSquare(order.id);

      if (!result.synced) {
        setError(
          result.message ||
          "Square has not confirmed this partner payment yet."
        );
        return;
      }

      setNotice(
        result.message ||
        `Square confirmed partner order ${order.order_no} is paid.`
      );

      if (result.recurringWarning) {
        setError(result.recurringWarning);
      }

      await refresh();
    } catch (syncError) {
      setError(
        syncError?.message ||
        "Partner Square status could not be checked."
      );
    } finally {
      setBusy("");
    }
  };

  const changeRecurringStatus = async (id, status) => {
    setBusy(`recurring:${id}`); setError("");
    try { await api.adminUpdatePartnerRecurringOrder(id, { status }); await refresh(); }
    catch (saveError) { setError(saveError?.message || "Recurring order could not be updated."); }
    finally { setBusy(""); }
  };

  const saveAutomation = async (rule, patch) => {
    setBusy(`automation:${rule.id}`); setError("");
    try { await api.adminSavePartnerAutomationRule({ ...rule, ...patch }); await refresh(); }
    catch (saveError) { setError(saveError?.message || "Automation rule could not be saved."); }
    finally { setBusy(""); }
  };


  const savePackageItem = async () => {
    if (!draft.id) { setError("Save the package before adding package contents."); return; }
    if (!String(itemDraft.product_key || "").trim()) { setError("Package items require a product key."); return; }
    setBusy("package-item"); setError(""); setNotice("");
    try {
      let itemRules;
      try { itemRules = JSON.parse(itemRulesText || "{}"); } catch { throw new Error("Package item rules JSON is not valid JSON."); }
      const saved = await api.adminSavePartnerPackageItem({ ...itemDraft, package_id: draft.id, rules: itemRules });
      setNotice(`${saved.product_key} saved to ${draft.name}.`);
      setItemDraft(emptyPackageItem(draft.id));
      setItemRulesText("{}");
      await refresh();
      const latest = await api.listAdminPartnerPackages();
      const pkg = latest.find((row) => row.id === draft.id);
      if (pkg) setDraft((current) => ({ ...current, items: pkg.items || [] }));
    } catch (saveError) { setError(saveError?.message || "Package item could not be saved."); }
    finally { setBusy(""); }
  };

  const editPackageItem = (item) => {
    setItemDraft({ ...emptyPackageItem(draft.id), ...item, quantity: item.quantity ?? "", unit_price_cents: item.unit_price_cents ?? "" });
    setItemRulesText(JSON.stringify(item.rules || {}, null, 2));
  };

  const deletePackageItem = async (item) => {
    if (!window.confirm(`Remove ${item.product_key} from this package?`)) return;
    setBusy(`delete-item:${item.id}`); setError("");
    try {
      await api.adminDeletePartnerPackageItem(item.id);
      setDraft((current) => ({ ...current, items: (current.items || []).filter((row) => row.id !== item.id) }));
      if (itemDraft.id === item.id) { setItemDraft(emptyPackageItem(draft.id)); setItemRulesText("{}"); }
      setNotice("Package item removed.");
    } catch (saveError) { setError(saveError?.message || "Package item could not be removed."); }
    finally { setBusy(""); }
  };

  const previewAutomation = async (rule) => {
    const previewWindow = window.open(
      "",
      "_blank",
      "width=760,height=900,scrollbars=yes,resizable=yes"
    );

    if (!previewWindow) {
      setError("Allow pop-ups for this site to preview automation emails.");
      return;
    }

    previewWindow.opener = null;
    previewWindow.document.title = "NectarFusions Automation Preview";
    previewWindow.document.body.style.fontFamily = "Arial, sans-serif";
    previewWindow.document.body.style.padding = "24px";
    previewWindow.document.body.textContent = "Building preview…";

    setBusy(`preview:${rule.id}`);
    setError("");

    try {
      const result = await api.previewAdminPartnerAutomationRule(rule.id);

      previewWindow.document.open();
      previewWindow.document.write("<!doctype html><html><head><meta charset='utf-8'><title>NectarFusions Automation Preview</title></head><body></body></html>");
      previewWindow.document.close();

      const summary = previewWindow.document.createElement("div");
      summary.style.maxWidth = "620px";
      summary.style.margin = "0 auto 18px";
      summary.style.padding = "14px 16px";
      summary.style.border = "1px solid #dce8ed";
      summary.style.borderRadius = "12px";
      summary.style.background = "#f7fbfd";

      const label = previewWindow.document.createElement("div");
      label.textContent = "PREVIEW ONLY · NO EMAIL SENT";
      label.style.fontSize = "11px";
      label.style.fontWeight = "800";
      label.style.letterSpacing = ".08em";
      label.style.color = "#167bb6";

      const subject = previewWindow.document.createElement("div");
      subject.textContent = `Subject: ${result.subject || "NectarFusions Partner Reminder"}`;
      subject.style.marginTop = "8px";
      subject.style.fontWeight = "700";
      subject.style.color = "#173c4f";

      summary.append(label, subject);
      previewWindow.document.body.appendChild(summary);

      const frame = previewWindow.document.createElement("iframe");
      frame.title = "Partner automation email preview";
      frame.style.width = "100%";
      frame.style.minHeight = "680px";
      frame.style.border = "0";
      frame.srcdoc = result.html || "<p>No email body was returned.</p>";
      previewWindow.document.body.appendChild(frame);
    } catch (previewError) {
      previewWindow.document.body.textContent =
        previewError?.message || "Automation preview could not be created.";
      setError(
        previewError?.message || "Automation preview could not be created."
      );
    } finally {
      setBusy("");
    }
  };

  const runAutomationNow = async () => {
    setBusy("run-automation"); setError(""); setNotice("");
    try {
      const result = await api.runAdminPartnerAutomationNow();
      setNotice(`Automation checked ${result.candidates || 0} candidate${Number(result.candidates || 0) === 1 ? "" : "s"}: ${result.sent || 0} sent, ${result.skipped || 0} skipped, ${result.failed || 0} failed.`);
      await refresh();
    } catch (runError) { setError(runError?.message || "Automation could not be run."); }
    finally { setBusy(""); }
  };

  return (
    <section className="nf-apc">
      <style>{CSS}</style>
      <div className="nf-apc-head">
        <div><div className="eyebrow">Partner Commerce</div><h2>One Account. Program Based Access.</h2><p>Applications, partners, packages, orders, fulfillment, recurring activity, and automation all use the same four program model.</p></div>
        <button className="nf-apc-btn" type="button" onClick={refresh}>Refresh</button>
      </div>

      <div className="nf-apc-stat-grid">
        <div className="nf-apc-stat"><span>Needs review</span><strong>{pendingApplications.length}</strong></div>
        <div className="nf-apc-stat"><span>Partner accounts</span><strong>{accounts.length}</strong></div>
        <div className="nf-apc-stat"><span>Open fulfillment</span><strong>{fulfillmentOrders.length}</strong></div>
        <div className="nf-apc-stat"><span>Reorder reminders due</span><strong>{dueOrders.length}</strong></div>
      </div>

      <div className="nf-apc-tabs" role="tablist">
        {TABS.map(([id, label]) => {
          const badgeCount = id === "applications" ? newApplications.length : 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => { setTab(id); setError(""); setNotice(""); }}
            >
              <span className="nf-apc-tab-label">
                {label}
                {badgeCount > 0 && (
                  <span
                    className="nf-apc-tab-badge"
                    aria-label={`${badgeCount} new submission${badgeCount === 1 ? "" : "s"}`}
                    title={`${badgeCount} new partner submission${badgeCount === 1 ? "" : "s"}`}
                  >
                    {badgeCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {error && <div className="nf-apc-message error" role="alert">{error}</div>}
      {notice && <div className="nf-apc-message success" role="status">{notice}</div>}

      {tab === "applications" && <div className="nf-apc-card">
        <div className="nf-apc-head"><div><h3>Program Applications</h3><p>Every selected program is reviewed separately. Approving the first program enables the same partner account; later approvals unlock additional programs.</p></div></div>
        <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
          {applications.map((application) => <div className="nf-apc-app" key={application.id}>
            <div><span className="nf-apc-pill">{programLabel(application.program_key)}</span><h4>{application.partner?.business_name || "Partner account"}</h4><div className="meta">{application.applicant_name || application.partner?.contact_name || "—"}<br />{application.applicant_email || application.partner?.email || "—"}<br />Submitted {date(application.submitted_at)}</div></div>
            <div><span>Business type</span><strong>{application.business_type || "—"}</strong><div className="meta" style={{ marginTop: 8 }}>{application.use_location || "No location supplied"}</div></div>
            <div><span>Status</span><strong>{pretty(application.status)}</strong>{application.application_notes && <div className="meta" style={{ marginTop: 8 }}>{application.application_notes}</div>}</div>
            <div className="nf-apc-actions">
              <button className="nf-apc-btn" disabled={busy === `application:${application.id}`} onClick={() => reviewApplication(application, "under_review")}>Review</button>
              <button className="nf-apc-btn warn" disabled={busy === `application:${application.id}`} onClick={() => reviewApplication(application, "needs_information")}>Needs Info</button>
              <button className="nf-apc-btn primary" disabled={busy === `application:${application.id}`} onClick={() => reviewApplication(application, "approved")}>Approve</button>
              <button className="nf-apc-btn danger" disabled={busy === `application:${application.id}`} onClick={() => reviewApplication(application, "declined")}>Decline</button>
            </div>
          </div>)}
          {!applications.length && <p>No program applications yet.</p>}
        </div>
      </div>}

      {tab === "partners" && <div className="nf-apc-grid">
        {accounts.map((account) => {
          const byKey = new Map((account.programs || []).map((row) => [row.program_key, row]));
          return <article className="nf-apc-card" key={account.id}>
            <h3>{account.business_name}</h3>
            <p style={{ marginTop: 0, fontSize: 12 }}>{account.contact_name || account.email} · {pretty(account.relationship_status)} · Portal {account.auth_access_enabled ? "enabled" : "not enabled"}</p>
            <div className="nf-apc-programs">{PROGRAMS.map(([key, label]) => {
              const row = byKey.get(key); const current = row?.status || "pending";
              return <label className="nf-apc-program-row" key={key}><strong>{label}</strong><select disabled={busy === `program:${account.id}:${key}`} value={current} onChange={(event) => setProgramStatus(account.id, key, event.target.value)}>{PROGRAM_STATUS.map((status) => <option key={status} value={status}>{pretty(status)}</option>)}</select></label>;
            })}</div>
          </article>;
        })}
      </div>}

      {tab === "packages" && <>
        <div className="nf-apc-grid">{PROGRAMS.map(([key, label]) => <div className="nf-apc-card" key={key}><h3>{label}</h3><div>{(packageByProgram[key] || []).map((pkg) => <div className="nf-apc-row" key={pkg.id}><div><span>Package</span><strong>{pkg.name}</strong></div><div><span>Contents</span><strong>{pkg.items?.length || 0} item{pkg.items?.length === 1 ? "" : "s"}</strong></div><div><span>Status</span><strong>{pkg.active ? "Active" : "Inactive"}</strong></div><button className="nf-apc-btn" onClick={() => editPackage(pkg)}>Edit</button></div>)}{!packageByProgram[key]?.length && <p>No packages yet.</p>}</div></div>)}</div>
        <div className="nf-apc-card" id="nf-apc-editor">
          <div className="nf-apc-head"><div><h3>{draft.id ? `Edit ${draft.name}` : "Create Package"}</h3><p>Package rules and contents live in Supabase. Foodservice and Hive packages can stay inactive until their exact quantities, inclusions, and prices are ready.</p></div>{draft.id && <button className="nf-apc-btn" onClick={() => { setDraft(emptyPackage()); setConfigText("{}"); setCustomizationText("{}"); setItemDraft(emptyPackageItem()); }}>New Package</button>}</div>
          <div className="nf-apc-form" style={{ marginTop: 12 }}>
            <label className="nf-apc-field"><span>Package key</span><input value={draft.package_key} onChange={(e) => setDraft((c) => ({ ...c, package_key: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-") }))} /></label>
            <label className="nf-apc-field"><span>Program</span><select value={draft.program_key} onChange={(e) => setDraft((c) => ({ ...c, program_key: e.target.value }))}>{PROGRAMS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label className="nf-apc-field wide"><span>Name</span><input value={draft.name} onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} /></label>
            <label className="nf-apc-field wide"><span>Description</span><textarea rows={3} value={draft.description || ""} onChange={(e) => setDraft((c) => ({ ...c, description: e.target.value }))} /></label>
            <label className="nf-apc-field wide"><span>Image URL</span><input value={draft.image_url || ""} onChange={(e) => setDraft((c) => ({ ...c, image_url: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Package type</span><select value={draft.package_type} onChange={(e) => setDraft((c) => ({ ...c, package_type: e.target.value }))}><option value="starter">Starter</option><option value="replenishment">Replenishment</option><option value="recurring">Recurring</option><option value="sponsorship">Sponsorship</option></select></label>
            <label className="nf-apc-field"><span>Price mode</span><select value={draft.price_mode || "catalog"} onChange={(e) => setDraft((c) => ({ ...c, price_mode: e.target.value }))}><option value="catalog">Catalog pricing</option><option value="fixed">Fixed package price</option><option value="itemized">Package item pricing</option></select></label>
            <label className="nf-apc-field"><span>Base price cents</span><input type="number" min="0" value={draft.base_price_cents} onChange={(e) => setDraft((c) => ({ ...c, base_price_cents: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Minimum quantity</span><input type="number" min="0" value={draft.minimum_quantity} onChange={(e) => setDraft((c) => ({ ...c, minimum_quantity: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Default quantity</span><input type="number" min="0" value={draft.default_quantity} onChange={(e) => setDraft((c) => ({ ...c, default_quantity: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Quantity increment</span><input type="number" min="1" value={draft.quantity_increment} onChange={(e) => setDraft((c) => ({ ...c, quantity_increment: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Flavor selections</span><input type="number" min="0" value={draft.flavor_selection_count} onChange={(e) => setDraft((c) => ({ ...c, flavor_selection_count: e.target.value }))} /></label>
            <label className="nf-apc-field wide"><span>Allowed flavors</span><input value={(draft.allowed_flavor_names || []).join(", ")} onChange={(e) => setDraft((c) => ({ ...c, allowed_flavor_names: splitCsv(e.target.value) }))} /></label>
            <label className="nf-apc-field"><span>Allowed sizes</span><input value={(draft.allowed_size_ids || []).join(", ")} onChange={(e) => setDraft((c) => ({ ...c, allowed_size_ids: splitCsv(e.target.value) }))} /></label>
            <label className="nf-apc-field"><span>Allowed textures</span><input value={(draft.allowed_textures || []).join(", ")} onChange={(e) => setDraft((c) => ({ ...c, allowed_textures: splitCsv(e.target.value) }))} /></label>
            <label className="nf-apc-field"><span>Reorder interval days</span><input type="number" min="1" value={draft.default_reorder_interval_days} onChange={(e) => setDraft((c) => ({ ...c, default_reorder_interval_days: e.target.value }))} /></label>
            <label className="nf-apc-field"><span>Display order</span><input type="number" value={draft.sort} onChange={(e) => setDraft((c) => ({ ...c, sort: e.target.value }))} /></label>
            <div className="nf-apc-field wide"><span>Availability</span><div className="nf-apc-checks"><label><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((c) => ({ ...c, active: e.target.checked }))} /> Active</label><label><input type="checkbox" checked={draft.pickup_allowed} onChange={(e) => setDraft((c) => ({ ...c, pickup_allowed: e.target.checked }))} /> Pickup</label><label><input type="checkbox" checked={draft.delivery_allowed} onChange={(e) => setDraft((c) => ({ ...c, delivery_allowed: e.target.checked }))} /> Delivery</label><label><input type="checkbox" checked={draft.recurring_allowed} onChange={(e) => setDraft((c) => ({ ...c, recurring_allowed: e.target.checked }))} /> Recurring</label></div></div>
            <label className="nf-apc-field wide"><span>Customization options JSON</span><textarea rows={5} spellCheck={false} value={customizationText} onChange={(e) => setCustomizationText(e.target.value)} /></label>
            <label className="nf-apc-field wide"><span>Configuration JSON</span><textarea rows={8} spellCheck={false} value={configText} onChange={(e) => setConfigText(e.target.value)} /></label>
          </div><div className="nf-apc-actions" style={{ marginTop: 10 }}><button className="nf-apc-btn primary" disabled={busy === "package"} onClick={savePackage}>{busy === "package" ? "Saving…" : "Save Package"}</button></div>

          <div className="nf-apc-subsection">
            <div className="nf-apc-head"><div><h3>Package Contents</h3><p>Define the actual SKUs or service line items contained in this package. These records drive the Foodservice and Hive storefront builders, so you can change quantities, prices, labels, flavor rules, and benefits without another React edit.</p></div></div>
            <div className="nf-apc-note" style={{ marginTop: 10 }}>Foodservice item rules examples: <code>{`{"honey_type":"infused","label":"Café flavor 1","description":"Choose one infused flavor"}`}</code> or <code>{`{"honey_type":"choice"}`}</code>. Hive item rules can include <code>{`{"benefits":["Hive sign recognition","Annual honey gift"]}`}</code>.</div>
            {!draft.id ? <div className="nf-apc-note">Save the package first. Then add its package contents here.</div> : <>
              <div className="nf-apc-item-grid" style={{ marginTop: 10 }}>
                {(draft.items || []).map((item) => <div className="nf-apc-item" key={item.id}>
                  <div><span>Product</span><strong>{item.product_key}</strong><div style={{ fontSize: 11, color: "#718690" }}>{pretty(item.category)}{item.flavor_name ? ` · ${item.flavor_name}` : ""}</div></div>
                  <div><span>Format</span><strong>{item.size_id || "—"}{item.texture ? ` · ${pretty(item.texture)}` : ""}</strong></div>
                  <div><span>Qty</span><strong>{item.quantity ?? "—"}</strong></div>
                  <div><span>Price</span><strong>{item.unit_price_cents == null ? "Catalog / package" : money(item.unit_price_cents)}</strong></div>
                  <div className="nf-apc-actions"><button className="nf-apc-btn" onClick={() => editPackageItem(item)}>Edit</button><button className="nf-apc-btn danger" disabled={busy === `delete-item:${item.id}`} onClick={() => deletePackageItem(item)}>Remove</button></div>
                </div>)}
                {!(draft.items || []).length && <p>No package contents have been defined yet.</p>}
              </div>
              <div className="nf-apc-form" style={{ marginTop: 14 }}>
                <label className="nf-apc-field"><span>Product key / SKU</span><input value={itemDraft.product_key || ""} onChange={(e) => setItemDraft((c) => ({ ...c, product_key: e.target.value }))} placeholder="one_gallon or colony_partner" /></label>
                <label className="nf-apc-field"><span>Category</span><select value={itemDraft.category || "bulk"} onChange={(e) => setItemDraft((c) => ({ ...c, category: e.target.value }))}><option value="retail">Retail jar</option><option value="bulk">Foodservice / bulk</option><option value="gift">Gift product</option><option value="gift_addon">Gift add-on</option><option value="custom_label">Custom label</option><option value="sponsorship">Hive sponsorship</option></select></label>
                <label className="nf-apc-field"><span>Quantity</span><input type="number" min="1" value={itemDraft.quantity ?? ""} onChange={(e) => setItemDraft((c) => ({ ...c, quantity: e.target.value }))} /></label>
                <label className="nf-apc-field"><span>Unit price cents</span><input type="number" min="0" value={itemDraft.unit_price_cents ?? ""} onChange={(e) => setItemDraft((c) => ({ ...c, unit_price_cents: e.target.value }))} /></label>
                <label className="nf-apc-field"><span>Flavor name / rule</span><input value={itemDraft.flavor_name || ""} onChange={(e) => setItemDraft((c) => ({ ...c, flavor_name: e.target.value }))} placeholder="Optional" /></label>
                <label className="nf-apc-field"><span>Size ID</span><input value={itemDraft.size_id || ""} onChange={(e) => setItemDraft((c) => ({ ...c, size_id: e.target.value }))} placeholder="4oz, half_gallon…" /></label>
                <label className="nf-apc-field"><span>Texture</span><input value={itemDraft.texture || ""} onChange={(e) => setItemDraft((c) => ({ ...c, texture: e.target.value }))} placeholder="regular / spun / optional" /></label>
                <label className="nf-apc-field"><span>Display order</span><input type="number" value={itemDraft.sort ?? 0} onChange={(e) => setItemDraft((c) => ({ ...c, sort: e.target.value }))} /></label>
                <label className="nf-apc-field wide"><span>Item rules JSON</span><textarea rows={6} spellCheck={false} value={itemRulesText} onChange={(e) => setItemRulesText(e.target.value)} placeholder='{ "honey_type": "infused", "label": "Café flavor 1" }' /></label>
              </div>
              <div className="nf-apc-actions" style={{ marginTop: 10 }}><button className="nf-apc-btn" onClick={() => { setItemDraft(emptyPackageItem(draft.id)); setItemRulesText("{}"); }}>Clear</button><button className="nf-apc-btn primary" disabled={busy === "package-item"} onClick={savePackageItem}>{busy === "package-item" ? "Saving…" : itemDraft.id ? "Update Package Item" : "Add Package Item"}</button></div>
            </>}
          </div>
        </div>
      </>}

      {tab === "orders" && <div className="nf-apc-card"><h3>Partner Orders</h3><p>Every order carries its program and package snapshot. Paid status is controlled by Square. If a webhook is delayed, use Check Square Status to verify payment before fulfillment.</p>{orders.map((order) => <div className="nf-apc-row" key={order.id}><div><span>Order</span><strong>{order.order_no}<br />{order.business_name}</strong></div><div><span>Program / package</span><strong>{programLabel(order.program_key)}<br />{order.package_snapshot?.name || "Legacy order"}</strong></div><div><span>Total</span><strong>{money(order.total_cents)}<br />{order.paid ? "Paid" : "Unpaid"}</strong></div><div style={{ display: "grid", gap: 6 }}><select value={order.status} disabled={busy === `order:${order.id}` || busy === `square:${order.id}`} onChange={(e) => changeOrderStatus(order.id, e.target.value)}>{orderStatusOptions(order).map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={status === "paid"}
                  >
                    {status === "paid" ? "Paid · Square verified" : pretty(status)}
                  </option>
                ))}</select>{!order.paid && order.status === "awaiting_payment" ? <button className="nf-apc-btn" type="button" disabled={busy === `square:${order.id}`} onClick={() => checkPartnerSquareStatus(order)}>{busy === `square:${order.id}` ? "Checking Square…" : "Check Square Status"}</button> : null}</div></div>)}{!orders.length && <p>No partner orders yet.</p>}</div>}

      {tab === "fulfillment" && <div className="nf-apc-card"><h3>Fulfillment Queue</h3><p>Paid partner orders from every program move through one operational queue.</p>{fulfillmentOrders.map((order) => <div className="nf-apc-row" key={order.id}><div><span>Order</span><strong>{order.order_no}<br />{order.business_name}</strong></div><div><span>Program</span><strong>{programLabel(order.program_key)}</strong></div><div><span>Fulfillment</span><strong>{pretty(order.fulfillment_method)}<br />{order.package_snapshot?.name || "Partner order"}</strong></div><select value={order.status} disabled={busy === `order:${order.id}`} onChange={(e) => changeOrderStatus(order.id, e.target.value)}>{orderStatusOptions(order).map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={status === "paid"}
                  >
                    {status === "paid" ? "Paid · Square verified" : pretty(status)}
                  </option>
                ))}</select></div>)}{!fulfillmentOrders.length && <p>No paid partner orders are waiting for fulfillment.</p>}</div>}

      {tab === "recurring" && <div className="nf-apc-card"><h3>Recurring Orders</h3><p>Recurring gifting, future Foodservice schedules, and sponsorship renewals stay tied to the same partner and program.</p>{recurring.map((row) => <div className="nf-apc-row" key={row.id}><div><span>Partner</span><strong>{row.partner?.business_name || "Partner"}<br />{programLabel(row.program_key)}</strong></div><div><span>Package</span><strong>{row.package?.name || "—"}</strong></div><div><span>Cadence / next</span><strong>{row.cadence_value} {pretty(row.cadence_unit)}<br />{date(row.next_order_on)}</strong></div><select value={row.status} disabled={busy === `recurring:${row.id}`} onChange={(e) => changeRecurringStatus(row.id, e.target.value)}><option value="active">Active</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></select></div>)}{!recurring.length && <p>No recurring partner orders yet.</p>}</div>}

      {tab === "automation" && <div style={{ display: "grid", gap: 12 }}>
        <div className="nf-apc-note">Automation is now operational, not just a due-date list. Fulfilled-order reminders run from the package rule, recurring schedules can send on each cadence, every attempt is logged, and failed sends can be retried on the next run.</div>
        <div className="nf-apc-card">
          <div className="nf-apc-head"><div><h3>Automation Rules</h3>{/* PARTNER AUTOMATION PREVIEW V14.1 */}<p>{"Use placeholders in templates: {{business_name}}, {{contact_name}}, {{package_name}}, {{order_no}}, {{due_date}}, {{portal_url}}."}</p></div><button className="nf-apc-btn primary" disabled={busy === "run-automation"} onClick={runAutomationNow}>{busy === "run-automation" ? "Running…" : "Run Due Automation Now"}</button></div>
          {automation.map((rule) => <div className="nf-apc-card" style={{ marginTop: 9, padding: 11 }} key={rule.id}>
            <div className="nf-apc-row" style={{ border: 0, padding: 0 }}>
              <div><span>Package</span><strong>{rule.package?.name || programLabel(rule.program_key)}</strong></div>
              <div><span>Trigger</span><strong>{pretty(rule.event_key)}<br />{pretty(rule.action_key)}</strong></div>
              <label className="nf-apc-field"><span>{rule.event_key === "fulfilled" ? "Days after fulfillment" : "Days before due date"}</span><input type="number" min="0" defaultValue={rule.delay_days} onBlur={(e) => Number(e.target.value) !== Number(rule.delay_days) && saveAutomation(rule, { delay_days: Number(e.target.value) })} /></label>
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800 }}><input type="checkbox" checked={rule.active} onChange={(e) => saveAutomation(rule, { active: e.target.checked })} /> Active</label>
              <button
                className="nf-apc-btn"
                type="button"
                disabled={busy === `preview:${rule.id}`}
                onClick={() => previewAutomation(rule)}
              >
                {busy === `preview:${rule.id}` ? "Opening…" : "Preview Email"}
              </button>
            </div>
            <div className="nf-apc-template">
              <label className="nf-apc-field"><span>Email subject override</span><input defaultValue={rule.subject_template || ""} placeholder="Leave blank for the NectarFusions default" onBlur={(e) => e.target.value !== (rule.subject_template || "") && saveAutomation(rule, { subject_template: e.target.value || null })} /></label>
              <label className="nf-apc-field"><span>Email message override</span><textarea rows={3} defaultValue={rule.body_template || ""} placeholder="Leave blank for the branded default reminder" onBlur={(e) => e.target.value !== (rule.body_template || "") && saveAutomation(rule, { body_template: e.target.value || null })} /></label>
            </div>
          </div>)}
          {!automation.length && <p>No automation rules yet.</p>}
        </div>
        <div className="nf-apc-grid">
          <div className="nf-apc-card"><h3>Reorder Candidates Due</h3>{dueOrders.map((order) => <div className="nf-apc-row" key={order.id}><div><span>Partner</span><strong>{order.business_name}</strong></div><div><span>Order</span><strong>{order.order_no}</strong></div><div><span>Package</span><strong>{order.package_snapshot?.name || "Partner order"}</strong></div><div><span>Due</span><strong>{date(order.reorder_due_on)}</strong></div></div>)}{!dueOrders.length && <p>No fulfilled-order reorder dates are currently due.</p>}</div>
          <div className="nf-apc-card"><h3>Recent Automation Activity</h3>{automationEvents.slice(0, 50).map((event) => <div className="nf-apc-auto-log" key={event.id}><div><strong>{event.partner?.business_name || event.recipient_email || "Partner"}</strong><br /><small>{event.package?.name || programLabel(event.program_key)}</small></div><div><strong>{pretty(event.action_key)}</strong><br /><small>{event.subject || "Default message"}</small></div><div><strong>{pretty(event.status)}</strong><br /><small>{event.attempt_count} attempt{event.attempt_count === 1 ? "" : "s"}</small></div><div><strong>{date(event.sent_at || event.last_attempt_at)}</strong><br /><small>Due {date(event.due_on)}</small></div></div>)}{!automationEvents.length && <p>No automation messages have run yet.</p>}</div>
        </div>
      </div>}

    </section>
  );
}
