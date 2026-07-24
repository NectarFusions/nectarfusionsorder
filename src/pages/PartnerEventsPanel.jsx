import { useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-partner-events{margin-top:22px;padding:clamp(20px,3vw,30px);border:1px solid #D9C8B4;border-radius:22px;background:linear-gradient(145deg,#fff,#fff9ec)}
.nf-pe-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.nf-pe-head h2{margin:6px 0 8px;color:#23170f;font-family:'Bebas Neue',Impact,sans-serif;font-size:38px;line-height:1}
.nf-pe-head p{max-width:680px;margin:0;color:#67594d;line-height:1.65}
.nf-pe-count,.nf-pe-status{padding:7px 10px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
.nf-pe-count{flex:0 0 auto;border:1px solid #e4c54c;background:#fff4be;color:#5f470b}
.nf-pe-message{margin-top:14px;padding:12px 14px;border-radius:12px;line-height:1.55}
.nf-pe-message.error{border:1px solid #e0a0a0;background:#fff1f1;color:#8a2929}
.nf-pe-message.success{border:1px solid #a8d1b3;background:#f1faf3;color:#315e3d}
.nf-pe-disabled{margin-top:18px;padding:17px;border:1px solid #bdd7e5;border-left:5px solid #167bb6;border-radius:14px;background:#f1f9fd;color:#4e6878;line-height:1.65}
.nf-pe-form{margin-top:20px;padding:18px;border:1px solid #dccca9;border-radius:18px;background:#fff}
.nf-pe-form h3,.nf-pe-subheading{margin:0 0 14px;color:#2b1c13;font-size:20px}
.nf-pe-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
.nf-pe-field{display:grid;gap:6px}.nf-pe-field.wide{grid-column:1/-1}
.nf-pe-field>span{color:#654b1b;font-size:9.5px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
.nf-pe-field input,.nf-pe-field textarea{width:100%;box-sizing:border-box}.nf-pe-field textarea{resize:vertical}
.nf-pe-small{margin:0;color:#75685d;font-size:11px;line-height:1.5}.nf-pe-words{text-align:right}.nf-pe-words.over{color:#a62d2d;font-weight:900}
.nf-pe-actions,.nf-pe-card-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px}
.nf-pe-subheading{margin-top:27px}.nf-pe-list{display:grid;gap:12px}
.nf-pe-card{padding:17px;border:1px solid #e0d5c8;border-radius:17px;background:#fff}.nf-pe-card-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.nf-pe-card h3{margin:0;color:#2a1c13;font-size:18px}.nf-pe-card p{margin:9px 0 0;color:#6a5d52;font-size:13px;line-height:1.58}
.nf-pe-meta{display:flex;flex-wrap:wrap;gap:7px 15px;margin-top:10px;color:#6c7d87;font-size:11.5px}.nf-pe-status{background:#eee8e0;color:#62564c}
.nf-pe-status[data-status="submitted"]{background:#ddf1fc;color:#146a9a}.nf-pe-status[data-status="approved"]{background:#dff3e5;color:#285f3a}
.nf-pe-status[data-status="rejected"]{background:#ffe1e1;color:#8a2929}.nf-pe-status[data-status="draft"]{background:#fff0c4;color:#745400}.nf-pe-status[data-status="cancelled"]{background:#ece8f2;color:#615773}
.nf-pe-rejection{margin-top:12px;padding:11px 12px;border:1px solid #e5aaaa;border-radius:11px;background:#fff3f3;color:#832a2a;line-height:1.55}
.nf-pe-empty{padding:20px;border:1px dashed #cdbfaf;border-radius:15px;background:#fff;color:#706258;text-align:center;line-height:1.6}
@media(max-width:760px){.nf-pe-head,.nf-pe-card-top{flex-direction:column}.nf-pe-grid{grid-template-columns:1fr}.nf-pe-field.wide{grid-column:auto}}
`;

const label = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const words = (value) => { const clean = String(value || "").trim(); return clean ? clean.split(/\s+/).length : 0; };

const toLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const displayDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

const blank = (account) => ({
  title: "", description: "", start_at: "", end_at: "", venue_name: "",
  address_line1: account?.address_line1 || "", address_line2: account?.address_line2 || "",
  city: account?.city || "", state: account?.state || "MI", zip: account?.zip || "",
});

const fromEvent = (event) => ({
  title: event.title || "", description: event.description || "", start_at: toLocal(event.start_at), end_at: toLocal(event.end_at),
  venue_name: event.venue_name || "", address_line1: event.address_line1 || "", address_line2: event.address_line2 || "",
  city: event.city || "", state: event.state || "MI", zip: event.zip || "",
});

export default function PartnerEventsPanel({ account, events = [], onRefresh }) {
  const [form, setForm] = useState(() => blank(account));
  const [editingId, setEditingId] = useState("");
  const [flyer, setFlyer] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const descriptionWords = words(form.description);
  const sorted = useMemo(() => [...events].sort((a, b) => new Date(b.start_at || b.created_at || 0) - new Date(a.start_at || a.created_at || 0)), [events]);

  const reset = () => { setForm(blank(account)); setEditingId(""); setFlyer(null); setFileKey((current) => current + 1); };
  const refresh = async () => { if (typeof onRefresh === "function") await onRefresh(); };

  const save = async (submitAfterSave) => {
    if (busy) return;
    if (!form.title.trim()) return setError("Enter an event title.");
    if (!form.description.trim()) return setError("Enter an event description.");
    if (descriptionWords > 50) return setError("Event descriptions may contain no more than 50 words.");
    if (!form.start_at) return setError("Choose an event start date and time.");

    setBusy(submitAfterSave ? "submit" : "save"); setError(""); setNotice("");
    try {
      let saved = editingId
        ? await api.updatePartnerEventDraft(editingId, form, flyer)
        : await api.createPartnerEventDraft(account.id, form, flyer);
      if (submitAfterSave) saved = await api.submitPartnerEvent(saved.id);
      await refresh(); reset();
      setNotice(submitAfterSave ? `${saved.title} was submitted for NectarFusions review.` : `${saved.title} was saved as a private draft.`);
    } catch (saveError) {
      setError(saveError.message);
      try { await refresh(); } catch { /* preserve original error */ }
    } finally { setBusy(""); }
  };

  const submitExisting = async (event) => {
    if (busy || !window.confirm(`Submit "${event.title}" for NectarFusions review? The event and flyer will be locked while reviewed.`)) return;
    setBusy(`submit:${event.id}`); setError(""); setNotice("");
    try { const submitted = await api.submitPartnerEvent(event.id); await refresh(); setNotice(`${submitted.title} was submitted for NectarFusions review.`); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(""); }
  };

  const viewFlyer = async (event) => {
    if (busy) return;
    setBusy(`flyer:${event.id}`); setError("");
    try { const url = await api.getPartnerEventFlyerUrl(event); window.open(url, "_blank", "noopener,noreferrer"); }
    catch (flyerError) { setError(flyerError.message); }
    finally { setBusy(""); }
  };

  const edit = (event) => {
    setEditingId(event.id); setForm(fromEvent(event)); setFlyer(null); setFileKey((current) => current + 1); setError(""); setNotice("");
    setTimeout(() => document.getElementById("partner-event-form")?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  return (
    <section className="nf-partner-events" aria-labelledby="partner-events-title">
      <style>{CSS}</style>
      <div className="nf-pe-head">
        <div><div className="nf-modern-kicker">Events and local visibility</div><h2 id="partner-events-title">Partner Events</h2><p>Create event details and upload an optional flyer. Events remain private until submitted, reviewed, and approved by NectarFusions.</p></div>
        <div className="nf-pe-count">{events.length} {events.length === 1 ? "Event" : "Events"}</div>
      </div>

      {error && <div className="nf-pe-message error" role="alert">{error}</div>}
      {notice && <div className="nf-pe-message success" role="status">{notice}</div>}

      {!account?.event_submission_enabled ? (
        <div className="nf-pe-disabled">Event submission is not enabled for this partner account yet. Contact NectarFusions before preparing a public event listing. Existing submissions remain visible below.</div>
      ) : (
        <div id="partner-event-form" className="nf-pe-form">
          <h3>{editingId ? "Edit Event Submission" : "Create an Event"}</h3>
          <div className="nf-pe-grid">
            <label className="nf-pe-field wide"><span>Event title</span><input maxLength={120} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} /></label>
            <label className="nf-pe-field wide"><span>Description</span><textarea rows={4} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} /><div className={`nf-pe-small nf-pe-words ${descriptionWords > 50 ? "over" : ""}`}>{descriptionWords} of 50 words</div></label>
            <label className="nf-pe-field"><span>Starts</span><input type="datetime-local" value={form.start_at} onChange={(e) => setForm((current) => ({ ...current, start_at: e.target.value }))} /></label>
            <label className="nf-pe-field"><span>Ends</span><input type="datetime-local" value={form.end_at} onChange={(e) => setForm((current) => ({ ...current, end_at: e.target.value }))} /></label>
            <label className="nf-pe-field wide"><span>Venue name</span><input value={form.venue_name} onChange={(e) => setForm((current) => ({ ...current, venue_name: e.target.value }))} /></label>
            <label className="nf-pe-field wide"><span>Street address</span><input value={form.address_line1} onChange={(e) => setForm((current) => ({ ...current, address_line1: e.target.value }))} /></label>
            <label className="nf-pe-field wide"><span>Address line 2</span><input value={form.address_line2} onChange={(e) => setForm((current) => ({ ...current, address_line2: e.target.value }))} /></label>
            <label className="nf-pe-field"><span>City</span><input value={form.city} onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))} /></label>
            <label className="nf-pe-field"><span>State</span><input maxLength={2} value={form.state} onChange={(e) => setForm((current) => ({ ...current, state: e.target.value.toUpperCase() }))} /></label>
            <label className="nf-pe-field"><span>ZIP code</span><input maxLength={5} inputMode="numeric" value={form.zip} onChange={(e) => setForm((current) => ({ ...current, zip: e.target.value.replace(/\D/g, "") }))} /></label>
            <label className="nf-pe-field"><span>Event flyer</span><input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFlyer(e.target.files?.[0] || null)} /><p className="nf-pe-small">{flyer ? `${flyer.name} · ${Math.max(0.01, flyer.size / 1024 / 1024).toFixed(2)} MB` : editingId ? "Leave blank to keep the existing flyer." : "PNG, JPG, or WebP. Maximum 8 MB."}</p></label>
          </div>
          <div className="nf-pe-actions">
            {editingId && <button type="button" className="btn ghost" disabled={!!busy} onClick={reset}>Cancel Editing</button>}
            <button type="button" className="btn ghost" disabled={!!busy} onClick={() => save(false)}>{busy === "save" ? "Saving…" : "Save Private Draft"}</button>
            <button type="button" className="btn solid" disabled={!!busy} onClick={() => save(true)}>{busy === "submit" ? "Submitting…" : "Save and Submit for Review"}</button>
          </div>
        </div>
      )}

      <h3 className="nf-pe-subheading">Your Event Submissions</h3>
      {sorted.length === 0 ? <div className="nf-pe-empty">No event submissions have been created for this account.</div> : (
        <div className="nf-pe-list">{sorted.map((event) => {
          const editable = event.status === "draft" || event.status === "rejected";
          return <article key={event.id} className="nf-pe-card">
            <div className="nf-pe-card-top"><div><h3>{event.title}</h3><div className="nf-pe-meta"><span>{displayDate(event.start_at)}</span>{event.venue_name && <span>{event.venue_name}</span>}{event.zip && <span>ZIP {event.zip}</span>}</div></div><span className="nf-pe-status" data-status={event.status}>{label(event.status)}</span></div>
            <p>{event.description}</p>
            {event.rejection_reason && <div className="nf-pe-rejection"><strong>Revision requested:</strong> {event.rejection_reason}</div>}
            <div className="nf-pe-card-actions">
              {event.image_path && <button type="button" className="btn ghost" disabled={!!busy} onClick={() => viewFlyer(event)}>{busy === `flyer:${event.id}` ? "Preparing…" : "View Flyer"}</button>}
              {editable && account?.event_submission_enabled && <><button type="button" className="btn ghost" disabled={!!busy} onClick={() => edit(event)}>Edit</button><button type="button" className="btn solid" disabled={!!busy} onClick={() => submitExisting(event)}>{busy === `submit:${event.id}` ? "Submitting…" : "Submit for Review"}</button></>}
            </div>
          </article>;
        })}</div>
      )}
    </section>
  );
}
