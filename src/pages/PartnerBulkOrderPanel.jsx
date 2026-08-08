import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-bulk{margin-top:14px;padding:clamp(20px,3vw,30px);border:1px solid #D8C9B8;border-radius:22px;background:radial-gradient(circle at 96% 5%,rgba(247,196,28,.14),transparent 28%),linear-gradient(145deg,#FFFFFF,#FBF7F1)}
.nf-bulk-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.nf-bulk-head h2{margin:6px 0 8px;color:#23170F;font-family:'Bebas Neue',Impact,sans-serif;font-size:38px;line-height:1}.nf-bulk-head p{max-width:720px;margin:0;color:#67594D;line-height:1.65}.nf-bulk-tag{flex:0 0 auto;padding:9px 13px;border:1px solid #E5C953;border-radius:999px;background:#FFF4BE;color:#59430F;font-size:11px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
.nf-bulk-prices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:18px}.nf-bulk-price{padding:13px;border:1px solid #E4D8C9;border-radius:13px;background:#fff}.nf-bulk-price strong{display:block;color:#173C52}.nf-bulk-price span{display:block;margin-top:5px;color:#6F6258;font-size:12px;line-height:1.5}
.nf-bulk-tabs{display:flex;gap:9px;flex-wrap:wrap;margin-top:20px}.nf-bulk-tabs button{min-height:42px;padding:9px 14px;border:1px solid #CBB9A5;border-radius:999px;background:#fff;color:#5B493C;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.nf-bulk-tabs button[aria-selected="true"]{border-color:#173C52;background:#173C52;color:#fff}
.nf-bulk-message{margin-top:16px;padding:13px 15px;border-radius:13px;line-height:1.55}.nf-bulk-message[data-kind="error"]{border:1px solid #E1A3A3;background:#FFF2F2;color:#8C2525}.nf-bulk-message[data-kind="success"]{border:1px solid #A9D2B6;background:#F3FBF5;color:#285A37}
.nf-bulk-form{display:grid;gap:18px;margin-top:20px}.nf-bulk-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nf-bulk-field{display:grid;gap:6px}.nf-bulk-field.full{grid-column:1/-1}.nf-bulk-field label,.nf-bulk-days legend,.nf-bulk-line label{color:#4A3313;font-size:10.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.nf-bulk-field input,.nf-bulk-field select,.nf-bulk-field textarea,.nf-bulk-line input,.nf-bulk-line select,.nf-bulk-reply textarea{width:100%;box-sizing:border-box;border:1.5px solid #CDB58D;border-radius:11px;background:#fff;color:#17120E;font:inherit}.nf-bulk-field input,.nf-bulk-field select,.nf-bulk-line input,.nf-bulk-line select{min-height:47px;padding:10px 12px}.nf-bulk-field textarea,.nf-bulk-reply textarea{min-height:96px;padding:11px 12px;resize:vertical}.nf-bulk-days{grid-column:1/-1;margin:0;padding:14px;border:1px solid #E3D8CB;border-radius:14px;background:#FFFCF7}.nf-bulk-day-grid{display:flex;flex-wrap:wrap;gap:8px}.nf-bulk-day-grid label{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #DDD0C0;border-radius:999px;background:#fff;color:#5E5147;font-size:12px;cursor:pointer}.nf-bulk-day-grid input{width:16px;height:16px;margin:0}
.nf-bulk-items{display:grid;gap:10px}.nf-bulk-items-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.nf-bulk-items-head h3{margin:0;color:#281A12;font-size:17px}.nf-bulk-items-head p{margin:3px 0 0;color:#75685E;font-size:12px}.nf-bulk-line{display:grid;grid-template-columns:minmax(140px,.8fr) minmax(140px,.9fr) minmax(190px,1.2fr) minmax(90px,.55fr) auto;gap:9px;align-items:end;padding:13px;border:1px solid #E0D5C8;border-radius:15px;background:#fff}.nf-bulk-line-field{display:grid;gap:5px}.nf-bulk-line-price{margin-top:5px;color:#3B6A4B;font-size:11px;font-weight:800}.nf-bulk-remove{min-height:47px;padding:9px 12px;border:1px solid #D8A5A5;border-radius:11px;background:#FFF6F6;color:#8C2525;font:inherit;font-size:12px;font-weight:850;cursor:pointer}.nf-bulk-line-notes{grid-column:1/-1}.nf-bulk-line-notes input{min-height:42px}
.nf-bulk-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.nf-bulk-summary div{padding:13px;border-radius:12px;background:#F0F7FB}.nf-bulk-summary span{display:block;color:#587386;font-size:9.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.nf-bulk-summary strong{display:block;margin-top:6px;color:#173C52;font-size:19px}.nf-bulk-note{padding:13px 14px;border-left:4px solid #F7C41C;border-radius:11px;background:#FFF9E8;color:#604A1C;line-height:1.6}
.nf-bulk-history{display:grid;gap:12px;margin-top:20px}.nf-bulk-empty{margin-top:18px;padding:20px;border:1px dashed #CBB9A5;border-radius:15px;background:#fff;color:#6A5D52;line-height:1.65;text-align:center}.nf-bulk-request{overflow:hidden;border:1px solid #DDD0C0;border-radius:17px;background:#fff}.nf-bulk-request-head{display:flex;justify-content:space-between;gap:14px;padding:16px 17px;background:#F8F4EE}.nf-bulk-request-head h3{margin:0;color:#281A12;font-size:16px}.nf-bulk-request-head p{margin:5px 0 0;color:#74675D;font-size:11.5px}.nf-bulk-status{align-self:flex-start;padding:7px 10px;border-radius:999px;background:#E8F4FB;color:#175D85;font-size:10px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.nf-bulk-status[data-status="accepted"],.nf-bulk-status[data-status="paid"],.nf-bulk-status[data-status="fulfilled"]{background:#EAF6ED;color:#285A37}.nf-bulk-status[data-status="needs_information"],.nf-bulk-status[data-status="quoted"]{background:#FFF2BF;color:#6A4E00}.nf-bulk-status[data-status="cancelled"],.nf-bulk-status[data-status="declined"]{background:#F8E6E6;color:#842C2C}.nf-bulk-request-body{display:grid;gap:14px;padding:16px 17px 18px}.nf-bulk-request-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.nf-bulk-request-meta div{padding:11px;border-radius:11px;background:#F6FAFC}.nf-bulk-request-meta span{display:block;color:#6B7D87;font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}.nf-bulk-request-meta strong{display:block;margin-top:5px;color:#173C52;font-size:12px}.nf-bulk-request-items{display:grid;gap:7px}.nf-bulk-request-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid #ECE3D8;border-radius:11px}.nf-bulk-request-item strong{color:#35251A;font-size:13px}.nf-bulk-request-item span{color:#74675D;font-size:11.5px}.nf-bulk-response{padding:13px 14px;border-left:4px solid #F7C41C;border-radius:11px;background:#FFF9E8;color:#604A1C;white-space:pre-wrap;line-height:1.6}.nf-bulk-actions{display:flex;gap:8px;flex-wrap:wrap}.nf-bulk-reply{display:grid;gap:8px}
@media(max-width:850px){.nf-bulk-head{flex-direction:column}.nf-bulk-prices,.nf-bulk-meta,.nf-bulk-summary,.nf-bulk-request-meta{grid-template-columns:1fr}.nf-bulk-line{grid-template-columns:1fr 1fr}.nf-bulk-line-notes{grid-column:1/-1}}@media(max-width:520px){.nf-bulk-line{grid-template-columns:1fr}.nf-bulk-line>*{grid-column:auto}.nf-bulk-request-item{grid-template-columns:1fr;gap:4px}}
`;

const DAYS = [
  ["monday", "Monday"], ["tuesday", "Tuesday"], ["wednesday", "Wednesday"],
  ["thursday", "Thursday"], ["friday", "Friday"], ["saturday", "Saturday"], ["sunday", "Sunday"],
];
const emptyLine = () => ({ honeyType: "natural", sizeId: "half_gallon", flavorId: "", quantity: 1, notes: "" });
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
const cleanStatus = (value) => String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const shortDate = (value) => { if (!value) return "Not specified"; const date = new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime()) ? "Not specified" : new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" }).format(date); };
const dateTime = (value) => { if (!value) return ""; const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric", hour:"numeric", minute:"2-digit" }).format(date); };
const todayIso = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join("-"); };
const actionMessage = (error) => String(error?.message || error || "The bulk request could not be updated.");

export default function PartnerBulkOrderPanel() {
  const [tab, setTab] = useState("new");
  const [catalog, setCatalog] = useState({ enabled:false, sizes:[], flavors:[] });
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [replyById, setReplyById] = useState({});
  const [form, setForm] = useState({ neededBy:"", fulfillmentMethod:"flexible", preferredDeliveryDays:[], requestNotes:"", items:[emptyLine()] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCatalog, nextRequests] = await Promise.all([
        api.getPartnerBulkOrderCatalog(),
        api.listPartnerBulkOrderRequests(),
      ]);
      setCatalog(nextCatalog);
      setRequests(nextRequests);
      setError("");
    } catch (loadError) {
      setError(actionMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sizeById = useMemo(() => new Map((catalog.sizes || []).map((size) => [size.id, size])), [catalog.sizes]);
  const flavorById = useMemo(() => new Map((catalog.flavors || []).map((flavor) => [flavor.id, flavor])), [catalog.flavors]);
  const priceFor = (line) => {
    const size = sizeById.get(line.sizeId);
    if (!size) return 0;
    return Number(line.honeyType === "infused" ? size.infused_price_cents : size.natural_price_cents) || 0;
  };
  const lineKey = (line) => `${line.honeyType}|${line.sizeId}|${line.honeyType === "infused" ? line.flavorId : "natural"}`;
  const validLines = form.items.every((line) => Number.isInteger(Number(line.quantity)) && Number(line.quantity) >= 1 && Number(line.quantity) <= 999 && sizeById.has(line.sizeId) && ["natural","infused"].includes(line.honeyType) && (line.honeyType === "natural" || flavorById.has(line.flavorId)));
  const duplicateSelections = new Set(form.items.map(lineKey)).size !== form.items.length;
  const subtotalCents = form.items.reduce((sum, line) => sum + priceFor(line) * Number(line.quantity || 0), 0);
  const totalContainers = form.items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const canSubmit = !loading && !busy && catalog.enabled && validLines && !duplicateSelections && subtotalCents > 0;

  const updateForm = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setError(""); setSuccess(""); };
  const updateLine = (index, key, value) => { setForm((current) => ({ ...current, items: current.items.map((line, i) => i === index ? { ...line, [key]: value, ...(key === "honeyType" && value === "natural" ? { flavorId:"" } : {}) } : line) })); setError(""); setSuccess(""); };
  const toggleDay = (day) => setForm((current) => ({ ...current, preferredDeliveryDays: current.preferredDeliveryDays.includes(day) ? current.preferredDeliveryDays.filter((item) => item !== day) : [...current.preferredDeliveryDays, day] }));

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError(duplicateSelections ? "Combine duplicate bulk selections into one line." : "Complete each bulk line with a valid container, type, flavor when infused, and quantity.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      const submission = await api.submitPartnerBulkOrder({
        neededBy: form.neededBy || null,
        fulfillmentMethod: form.fulfillmentMethod,
        preferredDeliveryDays: form.preferredDeliveryDays,
        requestNotes: form.requestNotes.trim() || null,
        items: form.items.map((line) => ({ honey_type: line.honeyType, size_id: line.sizeId, flavor_id: line.honeyType === "infused" ? line.flavorId : null, quantity: Number(line.quantity), notes: line.notes.trim() || null })),
      });
      setSuccess(submission.emailWarning ? `Bulk request ${submission.requestId} was saved. NectarFusions will verify the owner notification in Admin.` : `Bulk request ${submission.requestId} was submitted and NectarFusions was notified.`);
      setForm({ neededBy:"", fulfillmentMethod:"flexible", preferredDeliveryDays:[], requestNotes:"", items:[emptyLine()] });
      await load();
      setTab("history");
    } catch (submitError) {
      const message = actionMessage(submitError);
      const unknown = submitError?.code === "BULK_ORDER_SUBMISSION_UNKNOWN" || /failed to fetch|networkerror|load failed/i.test(message);
      if (!unknown) setError(`${message} Review the form and try again.`);
      else {
        setError("We could not confirm whether the bulk request was submitted. Checking Bulk Order History before you try again.");
        try {
          const previous = new Set(requests.map((request) => request.id));
          const next = await api.listPartnerBulkOrderRequests();
          const recovered = next.find((request) => !previous.has(request.id));
          setRequests(next); setTab("history");
          if (recovered) { setError(""); setSuccess(`Bulk request ${recovered.id} appears in history and was received. Do not submit it again.`); }
        } catch { setError("We could not confirm the submission. Contact NectarFusions before submitting the same bulk request again."); }
      }
    } finally { setBusy(false); }
  };

  const runAction = async (request, action) => {
    if (actionBusyId) return;
    const reply = replyById[request.id]?.trim() || null;
    if (action === "provide_information" && !reply) { setError("Enter the information NectarFusions requested."); return; }
    if (action === "accept" && !window.confirm("Accept this bulk quote and confirm the displayed total?")) return;
    if (action === "cancel" && !window.confirm("Cancel this bulk request? This cannot be undone.")) return;
    setActionBusyId(request.id); setError(""); setSuccess("");
    try {
      await api.partnerBulkOrderAction(request.id, action, reply);
      setReplyById((current) => ({ ...current, [request.id]:"" }));
      setSuccess(action === "accept" ? "The bulk quote was accepted." : action === "provide_information" ? "Your information was sent for review." : "The bulk request was cancelled.");
      await load();
    } catch (actionError) { setError(actionMessage(actionError)); }
    finally { setActionBusyId(""); }
  };

  if (!loading && (!catalog.enabled || !catalog.eligible)) return null;

  return (
    <section className="nf-bulk" aria-labelledby="partner-bulk-title">
      <style>{CSS}</style>
      <div className="nf-bulk-head">
        <div>
          <div className="nf-modern-kicker">Restaurant & foodservice</div>
          <h2 id="partner-bulk-title">Foodservice & Bulk Honey</h2>
          <p>Order larger containers separately from retail replenishment. Bulk pricing is fixed at submission, then NectarFusions reviews timing and any delivery or shipping charge before you accept the final quote.</p>
        </div>
        <div className="nf-bulk-tag">Bulk pricing · {catalog.price_version || "bulk-2026-08"}</div>
      </div>

      <div className="nf-bulk-prices">
        {(catalog.sizes || []).map((size) => (
          <div className="nf-bulk-price" key={size.id}>
            <strong>{size.label}</strong>
            <span>Natural {money(size.natural_price_cents)} · Infused {money(size.infused_price_cents)}</span>
          </div>
        ))}
      </div>

      <div className="nf-bulk-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "new"} onClick={() => setTab("new")}>New Bulk Request</button>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>Bulk Order History ({requests.length})</button>
      </div>

      {error && <div className="nf-bulk-message" data-kind="error" role="alert">{error}</div>}
      {success && <div className="nf-bulk-message" data-kind="success" role="status">{success}</div>}

      {loading ? <div className="nf-bulk-empty">Loading secure bulk ordering…</div> : tab === "new" ? (
        <form className="nf-bulk-form" onSubmit={submit}>
          <div className="nf-bulk-note"><strong>No retail or Square pricing is changed by this request.</strong> This is a separate partner quote workflow. Natural and infused prices below are bulk container prices only.</div>
          <div className="nf-bulk-meta">
            <div className="nf-bulk-field"><label htmlFor="bulk-needed-by">Needed by</label><input id="bulk-needed-by" type="date" min={todayIso()} value={form.neededBy} onChange={(event) => updateForm("neededBy", event.target.value)} /></div>
            <div className="nf-bulk-field"><label htmlFor="bulk-fulfillment">Preferred fulfillment</label><select id="bulk-fulfillment" value={form.fulfillmentMethod} onChange={(event) => updateForm("fulfillmentMethod", event.target.value)}><option value="flexible">Flexible</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="shipping">Shipping</option></select></div>
            <fieldset className="nf-bulk-days"><legend>Preferred delivery days</legend><div className="nf-bulk-day-grid">{DAYS.map(([value,label]) => <label key={value}><input type="checkbox" checked={form.preferredDeliveryDays.includes(value)} onChange={() => toggleDay(value)} /><span>{label}</span></label>)}</div></fieldset>
            <div className="nf-bulk-field full"><label htmlFor="bulk-notes">Request notes</label><textarea id="bulk-notes" maxLength={5000} value={form.requestNotes} onChange={(event) => updateForm("requestNotes", event.target.value)} placeholder="Add timing, use case, delivery, packaging, or other details." /></div>
          </div>

          <div className="nf-bulk-items">
            <div className="nf-bulk-items-head"><div><h3>Bulk containers</h3><p>Whole-container quantities start at one. Infused selections require a flavor.</p></div><button type="button" className="btn ghost" disabled={form.items.length >= 50} onClick={() => setForm((current) => ({ ...current, items:[...current.items, emptyLine()] }))}>Add Product</button></div>
            {form.items.map((line,index) => {
              const size = sizeById.get(line.sizeId);
              const unitPrice = priceFor(line);
              return <div className="nf-bulk-line" key={`bulk-line-${index}`}>
                <div className="nf-bulk-line-field"><label>Honey</label><select value={line.honeyType} onChange={(event) => updateLine(index,"honeyType",event.target.value)}><option value="natural">Natural</option><option value="infused">Infused</option></select></div>
                <div className="nf-bulk-line-field"><label>Container</label><select value={line.sizeId} onChange={(event) => updateLine(index,"sizeId",event.target.value)}>{(catalog.sizes || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{size && <span className="nf-bulk-line-price">{money(unitPrice)} each</span>}</div>
                <div className="nf-bulk-line-field"><label>Flavor {line.honeyType === "infused" ? "" : "(not needed)"}</label>{line.honeyType === "infused" ? <select value={line.flavorId} onChange={(event) => updateLine(index,"flavorId",event.target.value)}><option value="">Choose an infused flavor</option>{(catalog.flavors || []).map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}</select> : <input value="Natural Raw Honey" disabled />}</div>
                <div className="nf-bulk-line-field"><label>Containers</label><input type="number" min="1" max="999" step="1" value={line.quantity} onChange={(event) => updateLine(index,"quantity",event.target.value)} /></div>
                <button type="button" className="nf-bulk-remove" onClick={() => setForm((current) => ({ ...current, items: current.items.length === 1 ? [emptyLine()] : current.items.filter((_,i) => i !== index) }))}>Remove</button>
                <div className="nf-bulk-line-notes"><input aria-label={`Notes for bulk product ${index+1}`} maxLength={1000} value={line.notes} onChange={(event) => updateLine(index,"notes",event.target.value)} placeholder="Optional item notes" /></div>
              </div>;
            })}
          </div>

          <div className="nf-bulk-summary"><div><span>Product lines</span><strong>{form.items.length}</strong></div><div><span>Total containers</span><strong>{totalContainers}</strong></div><div><span>Requested subtotal</span><strong>{money(subtotalCents)}</strong></div></div>
          <button type="submit" className="btn solid" disabled={!canSubmit}>{busy ? "Submitting Bulk Request…" : "Submit Bulk Order Request"}</button>
        </form>
      ) : requests.length === 0 ? <div className="nf-bulk-empty">No bulk order requests have been submitted yet.</div> : (
        <div className="nf-bulk-history">
          {requests.map((request) => {
            const mayCancel = ["submitted","under_review","needs_information","quoted"].includes(request.status);
            return <article className="nf-bulk-request" key={request.id}>
              <div className="nf-bulk-request-head"><div><h3>Bulk request submitted {dateTime(request.submitted_at)}</h3><p>Request ID: {request.id}</p></div><span className="nf-bulk-status" data-status={request.status}>{cleanStatus(request.status)}</span></div>
              <div className="nf-bulk-request-body">
                <div className="nf-bulk-request-meta"><div><span>Needed by</span><strong>{shortDate(request.needed_by)}</strong></div><div><span>Fulfillment</span><strong>{cleanStatus(request.fulfillment_method)}</strong></div><div><span>Requested subtotal</span><strong>{money(request.requested_subtotal_cents)}</strong></div><div><span>Confirmed total</span><strong>{request.confirmed_total_cents == null ? "Pending quote" : money(request.confirmed_total_cents)}</strong></div></div>
                <div className="nf-bulk-request-items">{(request.items || []).map((item) => <div className="nf-bulk-request-item" key={item.id}><strong>{item.honey_type === "natural" ? "Natural Honey" : `${item.flavor_name} Infused Honey`}</strong><span>{item.size_label}</span><span>{item.quantity} container{item.quantity === 1 ? "" : "s"} · {money(item.line_total_cents)}</span></div>)}</div>
                {request.partner_response && <div className="nf-bulk-response"><strong>NectarFusions response</strong><br />{request.partner_response}</div>}
                {request.status === "needs_information" && <div className="nf-bulk-reply"><label htmlFor={`bulk-reply-${request.id}`}>Requested information</label><textarea id={`bulk-reply-${request.id}`} maxLength={5000} value={replyById[request.id] || ""} onChange={(event) => setReplyById((current) => ({ ...current, [request.id]:event.target.value }))} /><button type="button" className="btn solid" disabled={actionBusyId === request.id} onClick={() => runAction(request,"provide_information")}>Send Information</button></div>}
                <div className="nf-bulk-actions">{request.status === "quoted" && <button type="button" className="btn solid" disabled={actionBusyId === request.id} onClick={() => runAction(request,"accept")}>Accept Quote</button>}{mayCancel && <button type="button" className="btn ghost" disabled={actionBusyId === request.id} onClick={() => runAction(request,"cancel")}>Cancel Request</button>}</div>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
