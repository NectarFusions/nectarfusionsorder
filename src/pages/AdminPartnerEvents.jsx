import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const FILTERS = [["all","All"],["submitted","Submitted"],["approved","Approved"],["rejected","Rejected"],["draft","Draft"],["cancelled","Cancelled"]];

const CSS = `
.nf-admin-events{display:grid;gap:18px}.nf-ae-intro{padding:18px 20px;border:1px solid #b8d9ea;border-left:5px solid #167bb6;border-radius:16px;background:#f1f9fd;color:#4d6877;line-height:1.65}.nf-ae-intro strong{color:#173c52}
.nf-ae-message{padding:12px 14px;border-radius:12px;line-height:1.55}.nf-ae-message.error{border:1px solid #e0a0a0;background:#fff1f1;color:#8a2929}.nf-ae-message.success{border:1px solid #a8d1b3;background:#f1faf3;color:#315e3d}
.nf-ae-section{padding:18px;border:1px solid #e0d5c8;border-radius:18px;background:#fff}.nf-ae-section h3{margin:0;color:#2b1c13;font-size:21px}.nf-ae-section>p{margin:6px 0 15px;color:#71645a;font-size:12.5px;line-height:1.55}
.nf-ae-access,.nf-ae-list{display:grid;gap:11px}.nf-ae-access-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px;border:1px solid #e3d8cb;border-radius:14px;background:#fffcf8}
.nf-ae-access-card strong{display:block;color:#2c1d14}.nf-ae-access-card small{display:block;margin-top:4px;color:#796c61}.nf-ae-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:13px}.nf-ae-access-card .nf-ae-actions{margin-top:0}
.nf-ae-filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-bottom:14px}.nf-ae-filters .btn{padding:9px 8px;font-size:11.5px}
.nf-ae-card{padding:17px;border:1px solid #e2d8cd;border-radius:16px;background:linear-gradient(145deg,#fff,#fcf9f5)}.nf-ae-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.nf-ae-card h4{margin:0;color:#2a1c13;font-size:18px}.nf-ae-partner{margin-top:5px;color:#537184;font-size:12px;font-weight:800}
.nf-ae-card p{margin:10px 0 0;color:#6a5d52;font-size:13px;line-height:1.58}.nf-ae-meta{display:flex;flex-wrap:wrap;gap:7px 15px;margin-top:11px;color:#6c7d87;font-size:11.5px}
.nf-ae-location,.nf-ae-warning{margin-top:10px;padding:10px 12px;border-radius:11px;font-size:12px;line-height:1.55}.nf-ae-location{background:#f5f9fb;color:#526b79}.nf-ae-warning{border:1px solid #e2c45a;background:#fff7d3;color:#67500d}
.nf-ae-status{padding:6px 9px;border-radius:999px;background:#eee8e0;color:#62564c;font-size:9.5px;font-weight:900;text-transform:uppercase}.nf-ae-status[data-status="submitted"]{background:#ddf1fc;color:#146a9a}.nf-ae-status[data-status="approved"]{background:#dff3e5;color:#285f3a}.nf-ae-status[data-status="rejected"]{background:#ffe1e1;color:#8a2929}.nf-ae-status[data-status="draft"]{background:#fff0c4;color:#745400}.nf-ae-status[data-status="cancelled"]{background:#ece8f2;color:#615773}
.nf-ae-reason{display:grid;gap:6px;margin-top:13px}.nf-ae-reason span{color:#654b1b;font-size:9.5px;font-weight:900;text-transform:uppercase}.nf-ae-reason textarea{width:100%;box-sizing:border-box;resize:vertical}.nf-ae-empty{padding:22px;border:1px dashed #cdbead;border-radius:15px;background:#fffcf8;color:#706359;text-align:center;line-height:1.6}
@media(max-width:720px){.nf-ae-access-card{grid-template-columns:1fr}.nf-ae-actions{justify-content:flex-start}.nf-ae-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.nf-ae-top{flex-direction:column}}
`;

const label = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const displayDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date);
};

export default function AdminPartnerEvents() {
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("submitted");
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountRows, eventRows] = await Promise.all([api.listAdminPartnerAccounts(), api.listAdminPartnerEvents()]);
      setAccounts(accountRows); setEvents(eventRows); setError("");
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const accountMap = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const shown = useMemo(() => events.filter((event) => filter === "all" || event.status === filter), [events, filter]);
  const count = (status) => status === "all" ? events.length : events.filter((event) => event.status === status).length;

  const toggle = async (account, field) => {
    if (busy) return;
    const next = !account[field];
    setBusy(`access:${account.id}:${field}`); setError(""); setNotice("");
    try {
      const updated = await api.updateAdminPartnerEventAccess(account.id, { [field]: next });
      setAccounts((current) => current.map((row) => row.id === updated.id ? updated : row));
      setNotice(`${updated.business_name}: ${field === "event_submission_enabled" ? "event submissions" : "public locator permission"} ${next ? "enabled" : "disabled"}.`);
    } catch (accessError) { setError(accessError.message); }
    finally { setBusy(""); }
  };

  const flyer = async (event) => {
    if (busy) return;
    setBusy(`flyer:${event.id}`); setError("");
    try { const url = await api.getPartnerEventFlyerUrl(event); window.open(url, "_blank", "noopener,noreferrer"); }
    catch (flyerError) { setError(flyerError.message); }
    finally { setBusy(""); }
  };

  const review = async (event, decision) => {
    if (busy) return;
    const reason = String(reasons[event.id] || "").trim();
    if (decision === "rejected" && !reason) return setError("Enter the revision requested before rejecting the event.");
    const wording = decision === "approved" ? `Approve "${event.title}"?` : decision === "rejected" ? `Return "${event.title}" to the partner for revision?` : `Cancel publication of "${event.title}"?`;
    if (!window.confirm(wording)) return;

    setBusy(`review:${event.id}:${decision}`); setError(""); setNotice("");
    try {
      const updated = await api.reviewAdminPartnerEvent(event.id, decision, reason);
      setEvents((current) => current.map((row) => row.id === updated.id ? updated : row));
      setReasons((current) => ({ ...current, [event.id]: "" }));
      const partner = accountMap.get(event.partner_id);
      setNotice(decision === "approved" ? `${updated.title} was approved.${partner?.locator_permission ? "" : " Public locator permission is still off."}` : decision === "rejected" ? `${updated.title} was returned for revision.` : `${updated.title} was cancelled.`);
    } catch (reviewError) { setError(reviewError.message); }
    finally { setBusy(""); }
  };

  return <div className="nf-admin-events">
    <style>{CSS}</style>
    <div className="eyebrow">Partner Events</div>
    <div className="nf-ae-intro"><strong>Partner events remain separate from Retail Locator.</strong> Enable submissions only for eligible accounts. Approving an event does not add it to the retail-location table.</div>
    {error && <div className="nf-ae-message error" role="alert">{error}</div>}
    {notice && <div className="nf-ae-message success" role="status">{notice}</div>}

    <section className="nf-ae-section">
      <h3>Partner Event Access</h3><p>Event submission controls creation and editing. Locator permission is separately required for future public display.</p>
      <div className="nf-ae-access">{accounts.map((account) => <article key={account.id} className="nf-ae-access-card">
        <div><strong>{account.business_name}</strong><small>{account.email} · {label(account.partner_type)} · {label(account.relationship_status)}</small></div>
        <div className="nf-ae-actions">
          <button type="button" className={`btn ${account.event_submission_enabled ? "on" : ""}`} disabled={!!busy} onClick={() => toggle(account, "event_submission_enabled")}>{account.event_submission_enabled ? "Submissions Enabled" : "Enable Submissions"}</button>
          <button type="button" className={`btn ${account.locator_permission ? "on" : ""}`} disabled={!!busy} onClick={() => toggle(account, "locator_permission")}>{account.locator_permission ? "Locator Permission On" : "Enable Locator Permission"}</button>
        </div>
      </article>)}</div>
    </section>

    <section className="nf-ae-section">
      <h3>Event Review Queue · {events.length}</h3><p>Submitted events are locked from partner editing until approved or returned for revision.</p>
      <div className="nf-ae-filters">{FILTERS.map(([value, text]) => <button key={value} type="button" className={`btn ${filter === value ? "on" : ""}`} onClick={() => setFilter(value)}>{text} · {count(value)}</button>)}</div>
      {loading ? <div className="nf-ae-empty">Loading partner events…</div> : shown.length === 0 ? <div className="nf-ae-empty">No events match this review filter.</div> : <div className="nf-ae-list">{shown.map((event) => {
        const partner = accountMap.get(event.partner_id);
        const address = [event.address_line1,event.address_line2,event.city,event.state,event.zip].filter(Boolean).join(", ");
        return <article key={event.id} className="nf-ae-card">
          <div className="nf-ae-top"><div><h4>{event.title}</h4><div className="nf-ae-partner">{partner?.business_name || "Unknown partner account"}</div></div><span className="nf-ae-status" data-status={event.status}>{label(event.status)}</span></div>
          <p>{event.description}</p>
          <div className="nf-ae-meta"><span>Starts {displayDate(event.start_at)}</span>{event.end_at && <span>Ends {displayDate(event.end_at)}</span>}{event.submitted_at && <span>Submitted {displayDate(event.submitted_at)}</span>}</div>
          {(event.venue_name || address) && <div className="nf-ae-location">{event.venue_name && <strong>{event.venue_name}</strong>}{event.venue_name && address && <br />}{address}</div>}
          {event.status === "submitted" && !partner?.locator_permission && <div className="nf-ae-warning">Public locator permission is currently off. Approval is allowed, but later public lookup must continue to enforce that permission.</div>}
          {event.rejection_reason && <div className="nf-ae-warning"><strong>Revision request:</strong> {event.rejection_reason}</div>}
          {event.status === "submitted" && <label className="nf-ae-reason"><span>Revision request if rejected</span><textarea rows={3} value={reasons[event.id] || ""} onChange={(e) => setReasons((current) => ({ ...current, [event.id]: e.target.value }))} /></label>}
          <div className="nf-ae-actions">
            {event.image_path && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => flyer(event)}>{busy === `flyer:${event.id}` ? "Preparing…" : "View Private Flyer"}</button>}
            {event.status === "submitted" && <><button type="button" className="btn danger" disabled={!!busy} onClick={() => review(event, "rejected")}>{busy === `review:${event.id}:rejected` ? "Returning…" : "Request Revision"}</button><button type="button" className="btn solid" disabled={!!busy} onClick={() => review(event, "approved")}>{busy === `review:${event.id}:approved` ? "Approving…" : "Approve Event"}</button></>}
            {event.status === "approved" && <button type="button" className="btn danger" disabled={!!busy} onClick={() => review(event, "cancelled")}>{busy === `review:${event.id}:cancelled` ? "Cancelling…" : "Cancel Publication"}</button>}
          </div>
        </article>;
      })}</div>}
    </section>
  </div>;
}
