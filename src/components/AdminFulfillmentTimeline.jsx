// nf-fulfillment-messages-v9 — customer notifications in the order workflow.
// nf-fulfillment-copy-text-v10: reusable manual clipboard updates, separate from email send statuses.
// In development we simulate clicks locally, never sending customer messages.
import { useEffect, useState } from "react";
import * as api from "../lib/api";
import { copyTextForOrder, trackingForText } from "../lib/fulfillmentCopyText.mjs";

const PREVIEW = import.meta.env.DEV || import.meta.env.VITE_READ_ONLY_PREVIEW === "true";
// Until the server endpoint and idempotent delivery proof are separately released,
// this UI can ONLY copy draft text. It cannot send emails or change order state.
const EMAIL_UPDATES_ENABLED = false;
const pretty = (date) => date ? new Date(date).toLocaleString(undefined, {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
}) : "";
const statusFor = (statuses, key) => statuses?.[key]?.state || "unknown";

function stepsFor(method) {
  const common = [{ kind: "confirmed", title: "Order placed", automatic: true },
    { kind: "processing", title: "In progress" }];
  if (method === "ship") return [...common, { kind: "shipped", title: "Shipped" }];
  if (method === "market") return [...common, { kind: "ready_for_pickup", title: "Ready for pickup" }];
  return [...common, { kind: "out_for_delivery", title: "Out for delivery" },
    { kind: "delivered", title: "Delivered", photo: true }];
}

async function photoAsJpeg(file) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) throw new Error("Choose a photograph, not another file type.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("This photo could not be opened."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1500 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL("image/jpeg", 0.77);
    if (dataUrl.length > 2_100_000) dataUrl = canvas.toDataURL("image/jpeg", 0.58);
    if (dataUrl.length > 2_100_000) throw new Error("Photo is still too large; choose a smaller image.");
    return { mime: "image/jpeg", base64: dataUrl.split(",")[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminFulfillmentTimeline({ order, readOnlyPreview = false, onCompleted }) {
  const preview = PREVIEW || readOnlyPreview;
  const [statuses, setStatuses] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [tracking, setTracking] = useState("");
  const [copyCount, setCopyCount] = useState({});
  const [copyBusy, setCopyBusy] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [copyError, setCopyError] = useState("");
  const honeyClub = Boolean(order.isHoneyClub);
  const valid = !honeyClub && ["delivery", "ship", "market"].includes(order.method);
  const paymentHold = Boolean(order.requires_prepay && !order.paid);
  const inactive = order.status === "cancelled" || paymentHold || !order.email;
  const stages = stepsFor(order.method);

  // This records that text was COPIED, never that it was sent. Local to this browser.
  useEffect(() => {
    const prefix = `nf-copy-text-v10:${order.id}:`;
    const counts = {};
    try {
      for (const step of stepsFor(order.method)) {
        const value = Number(window.localStorage.getItem(prefix + step.kind) || 0);
        counts[step.kind] = Number.isSafeInteger(value) && value > 0 ? value : 0;
      }
    } catch { /* Clipboard still works when local storage is blocked. */ }
    setCopyCount(counts);
    setCopyMessage(""); setCopyError(""); setTracking(""); setCopyBusy("");
  }, [order.id, order.method]);

  useEffect(() => {
    setStatuses({}); setLoaded(false); setMessage(""); setError(""); setFile(null);
    if (!valid) { setLoaded(true); return; }
    if (preview || !EMAIL_UPDATES_ENABLED) { setLoaded(true); return; } // No message backend requests.
    let mounted = true;
    (async () => {
      try {
        const session = await api.session();
        if (!session?.access_token) throw new Error("Sign in again to check message history.");
        const response = await fetch(`/.netlify/functions/order-fulfillment-message?orderId=${encodeURIComponent(order.id)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store"
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Cannot check email records.");
        if (mounted) setStatuses(data.statuses || {});
      } catch (cause) {
        if (mounted) setError(`Email history unavailable: ${cause.message}`);
      } finally { if (mounted) setLoaded(true); }
    })();
    return () => { mounted = false; };
  }, [order.id, valid, preview]);

  useEffect(() => {
    if (!file) { setPhotoUrl(""); return; }
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!valid) return <div className="card" style={{ marginTop: 12, padding: 13, background: "#FFFBF1" }}>
    <strong>Customer notification timeline</strong>
    <p style={{ fontSize: 12.5, marginBottom: 0 }}>
      Honey Club boxes require a separate recurring-cycle email record. Messaging is safely disabled here until that integration is approved.
    </p>
  </div>;

  const copyText = async (step) => {
    if (copyBusy) return;
    setCopyBusy(step.kind); setCopyError(""); setCopyMessage("");
    try {
      const text = copyTextForOrder(order, step.kind, tracking);
      // In modern browsers, this works on HTTPS or localhost. Fall back when
      // Clipboard API is denied/unavailable (e.g. when opening the HTML demo).
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); copied = true; }
        catch { /* Try manual selection fallback. */ }
      }
      if (!copied) {
        const node = document.createElement("textarea");
        node.value = text;
        node.setAttribute("readonly", "");
        node.style.position = "fixed";
        node.style.left = "-9999px";
        document.body.appendChild(node);
        try {
          node.focus(); node.select();
          copied = document.execCommand("copy");
        } finally { node.remove(); }
      }
      if (!copied) throw new Error("Your browser blocked clipboard access. Open 'View text' and copy manually.");
      const key = `nf-copy-text-v10:${order.id}:${step.kind}`;
      // Functional local indicator, not a record of customer contact.
      let next = (copyCount[step.kind] || 0) + 1;
      try {
        const previous = Number(window.localStorage.getItem(key) || 0);
        next = Math.max(next, (Number.isSafeInteger(previous) ? previous : 0) + 1);
        window.localStorage.setItem(key, String(next));
      } catch { /* This device may not support persistence. */ }
      setCopyCount((previous) => ({ ...previous, [step.kind]: next }));
      setCopyMessage(`${step.title} text copied. Paste it wherever you'd like. Copying does NOT send it.`);
    } catch (cause) {
      setCopyError(cause?.message || "Text could not be copied.");
    } finally { setCopyBusy(""); }
  };

  const notify = async (step) => {
    if (!EMAIL_UPDATES_ENABLED) return; // Fail closed: no unavailable email endpoints.
    if (busy || inactive || statusFor(statuses, step.kind) === "sent") return;
    const recipient = order.email || "the customer";
    const prompt = step.kind === "processing"
      ? `Send the PROCESSING (not out-for-delivery) email for #${order.order_no} to ${recipient}?`
      : step.kind === "delivered"
        ? `Confirm order #${order.order_no} was physically delivered? ${file ? "The selected photo will be attached to" : "No proof photo was selected for"} the delivery email to ${recipient}.`
        : `Confirm order #${order.order_no} is really ${step.title.toLowerCase()}? Send that notice to ${recipient}?`;
    if (!preview && !window.confirm(prompt)) return;
    setBusy(step.kind); setError(""); setMessage("");
    try {
      if (preview) {
        setStatuses((old) => ({ ...old, [step.kind]: { state: "preview", sentAt: null, hasPhoto: !!file } }));
        setMessage("Preview simulation only. No email was sent or order changed.");
        return;
      }
      const session = await api.session();
      if (!session?.access_token) throw new Error("Please sign in again.");
      const isExisting = ["shipped", "out_for_delivery"].includes(step.kind);
      const endpoint = isExisting ? "/.netlify/functions/order-delivery-notify" : "/.netlify/functions/order-fulfillment-message";
      const photo = step.kind === "delivered" ? await photoAsJpeg(file) : null;
      const response = await fetch(endpoint, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(isExisting ? { orderId: order.id, acknowledged: true } : {
          orderId: order.id, kind: step.kind, acknowledged: true, ...(photo ? { photo } : {})
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.state === "sent" || data.state === "pending") setStatuses((old) => ({ ...old, [step.kind]: { state: data.state, sentAt: data.sentAt } }));
        throw new Error(data.error || "Could not send the email.");
      }
      if (data.state !== "sent") throw new Error("Email acceptance was not confirmed. Check history before retrying.");
      setStatuses((old) => ({ ...old, [step.kind]: {
        state: "sent", sentAt: data.sentAt || new Date().toISOString(), hasPhoto: !!photo
      } }));
      setMessage("Email accepted and recorded. This step cannot be sent twice.");
      if (["shipped", "delivered"].includes(step.kind)) {
        try {
          if (step.kind === "shipped") await api.markShippedAndArchive(order.id);
          else { await api.setOrderStatus(order.id, "done"); await api.archiveOrder(order.id); }
          setMessage("Email accepted. Order completed and archived.");
          onCompleted?.();
        } catch (archiveError) {
          setError(`Email was SENT, but archiving needs attention: ${archiveError.message}. Do not resend the email.`);
        }
      }
    } catch (cause) { setError(cause.message || "Could not complete this step."); }
    finally { setBusy(""); }
  };

  return <section style={{ marginTop: 14, border: "1px solid #DBC792", borderRadius: 12, padding: 12, background: "#FFFCF5" }} aria-label={`Customer email timeline for order ${order.order_no}`}>
    <strong style={{ display: "block", color: "#4A3313", fontSize: 14 }}>Customer updates · {order.method === "ship" ? "Shipping" : order.method === "market" ? "Market pickup" : "Local delivery"}</strong>
    <div style={{ color: "#77664D", fontSize: 12, margin: "5px 0 10px", lineHeight: 1.45 }}>
      {!EMAIL_UPDATES_ENABLED ?
        "Copy-only release: email sending and message history are unavailable here. Nothing is sent automatically; use existing approved notification tools separately." :
        preview ? "LOCAL PREVIEW · Buttons simulate progress. No customer emails will be sent." :
        "Each message can be sent once. Done means the email provider accepted and the database recorded the message."}
    </div>
    <p style={{ fontSize: 11.5, color: "#786449", margin: "0 0 9px" }}>Copy Text works independently from email and never sends a message. A copied indicator does not mean the customer received a text.</p>
    <div style={{ display: "grid", gap: 8 }}>
      {stages.map((step, index) => {
        const record = statuses[step.kind] || {};
        const done = record.state === "sent";
        const fake = record.state === "preview";
        const pending = record.state === "pending";
        const previous = index > 1 ? stages[index - 1] : null;
        const locked = !!previous && !["sent", "preview"].includes(statusFor(statuses, previous.kind));
        const disabled = !!busy || inactive || done || fake || pending || !loaded || (!preview && locked);
        return <div key={step.kind} style={{ border: "1px solid #E7DCC9", borderRadius: 10, background: "#FFF", padding: "10px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 180px" }}>
              <strong style={{ color: "#4A3313", fontSize: 13.5 }}>{index + 1}. {step.title}</strong>
              {step.automatic && <div style={{ fontSize: 11.5, color: "#79644B" }}>Automatically generated at checkout. Historical sends may not have audit records.</div>}
              {done && <div style={{ fontSize: 11.5, color: "#276435" }}>Provider accepted · {pretty(record.sentAt) || "time not recorded"}{record.hasPhoto ? " · Photo attached" : ""}</div>}
              {fake && <div style={{ fontSize: 11.5, color: "#805B1F" }}>Preview only · No message sent</div>}
              {pending && <div style={{ fontSize: 11.5, color: "#805B1F" }}>Send reserved or delivery status uncertain. Do not click again.</div>}
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
              {step.automatic ? <span style={{ fontWeight: 800, fontSize: 12, color: done ? "#286F39" : "#815C24" }}>
                {done ? "Done ✓" : "Confirmation not verified"}
              </span> : <button type="button" className={`btn ${done || fake ? "on" : ""}`}
                style={{ padding: "9px 12px", fontSize: 12 }} disabled={disabled || !EMAIL_UPDATES_ENABLED} onClick={() => notify(step)}>
                {!EMAIL_UPDATES_ENABLED ? "Email unavailable" : done ? "Done ✓" : fake ? "Preview done ✓" : pending ? "Pending · do not resend" : busy === step.kind ? "Sending…" :
                  !loaded ? "Checking…" : preview ? `Simulate ${step.title}` : `Send ${step.title}`}
              </button>}
              <button type="button" className="btn" disabled={!!copyBusy || paymentHold || order.status === "cancelled"}
                onClick={() => copyText(step)}
                aria-label={`Copy ${step.title} text for order ${order.order_no}`}
                title="Copies text only. Does not send a message. Can be used repeatedly."
                style={{ padding: "9px 12px", fontSize: 12, border: "1px solid #C2A14E", background: "#FFF9E6", color: "#614318", whiteSpace: "normal" }}>
                {copyBusy === step.kind ? "Copying…" : copyCount[step.kind] ? `Copied ✓ (${copyCount[step.kind]}) · Copy again` :
                  step.automatic ? "Copy order summary" : "Copy text"}
              </button>
            </div>
          </div>
          {step.kind === "processing" && <p style={{ fontSize: 12, lineHeight: 1.55, margin: "8px 0 0", color: "#654B29" }}>
            Customer email: <strong>YOUR HONEY ORDER IS BEING PROCESSED.</strong> Your order is not out for delivery yet.
            You will receive another message when it {order.method === "ship" ? "has shipped" : order.method === "market" ? "is ready for pickup" : "is packaged and out for delivery"}.
          </p>}
          {step.kind === "shipped" && <label style={{ display: "block", fontSize: 12, fontWeight: 750, marginTop: 10, color: "#654B29" }}>
            Tracking number (copied message only, not sent by email)
            <input value={tracking} type="text" maxLength={120} autoComplete="off"
              placeholder="Type or paste tracking number" onChange={(event) => setTracking(trackingForText(event.target.value))}
              style={{ width: "100%", marginTop: 5, fontSize: 13 }} />
            <span style={{ display: "block", fontSize: 11.5, color: "#79644B", fontWeight: 400, marginTop: 4 }}>
              Leave blank to copy the placeholder [ENTER TRACKING NUMBER] and fill it in later.
            </span>
          </label>}
          <details style={{ marginTop: 9, fontSize: 12.5, color: "#654B29" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700 }}>View text to copy</summary>
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 11, background: "#FBF8EF", borderRadius: 8, marginTop: 7, border: "1px solid #E7DCC9", lineHeight: 1.6, userSelect: "text" }}>
              {copyTextForOrder(order, step.kind, tracking)}
            </div>
            {step.automatic && <p style={{ fontSize: 11.5 }}>This is a short text summary, not the full checkout receipt.</p>}
            {step.kind === "delivered" && <p style={{ fontSize: 11.5 }}>Copying text does not include a photo. Attach a delivery photo separately in your messaging app if desired.</p>}
          </details>
          {EMAIL_UPDATES_ENABLED && step.photo && !done && !fake && <div style={{ marginTop: 9 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 750 }}>Delivery photo (optional, attached to customer email)</label>
            <input type="file" accept="image/*" capture="environment" disabled={!!busy || inactive}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              style={{ width: "100%", fontSize: 12, marginTop: 5 }} />
            {photoUrl && <img src={photoUrl} alt="Selected delivery proof" style={{ width: 126, height: 92, objectFit: "cover", borderRadius: 8, marginTop: 7 }} />}
          </div>}
        </div>;
      })}
    </div>
    {copyMessage && <div role="status" style={{ fontSize: 12.5, color: "#276435", marginTop: 9, fontWeight: 700 }}>{copyMessage}</div>}
    {copyError && <div role="alert" style={{ fontSize: 12.5, color: "#A5281A", marginTop: 9 }}>{copyError}</div>}
    {inactive && <p style={{ fontSize: 12, color: "#A5281A" }}>Sending unavailable: order cancelled, payment unconfirmed, or customer email missing.</p>}
    {error && <div role="alert" style={{ fontSize: 12, color: "#A5281A", marginTop: 8 }}>{error}</div>}
    {message && <div role="status" style={{ fontSize: 12, color: "#276435", marginTop: 8 }}>{message}</div>}
  </section>;
}
