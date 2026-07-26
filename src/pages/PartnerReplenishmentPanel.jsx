import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const REPLENISHMENT_CSS = `
.nf-replenishment-panel {
  margin-top:22px;
  padding:clamp(20px,3vw,30px);
  border:1px solid #D8C9B8;
  border-radius:22px;
  background:
    radial-gradient(circle at 96% 5%,rgba(247,196,28,.14),transparent 28%),
    linear-gradient(145deg,#FFFFFF,#FBF7F1);
}
.nf-replenishment-header {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:18px;
}
.nf-replenishment-header h2 {
  margin:6px 0 8px;
  color:#23170F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  line-height:1;
}
.nf-replenishment-header p {
  max-width:690px;
  margin:0;
  color:#67594D;
  line-height:1.65;
}
.nf-replenishment-price-note {
  flex:0 0 auto;
  padding:9px 13px;
  border:1px solid #E5C953;
  border-radius:999px;
  background:#FFF4BE;
  color:#59430F;
  font-size:11px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-action-alert {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:16px;
  margin-bottom:18px;
  padding:15px 17px;
  border:1px solid #D97777;
  border-left:6px solid #B42318;
  border-radius:14px;
  background:#FFF1F1;
  color:#7A1F1F;
  box-shadow:0 8px 20px rgba(180,35,24,.08);
}
.nf-replenishment-action-alert strong {
  display:block;
  font-size:15px;
}
.nf-replenishment-action-alert span {
  display:block;
  margin-top:4px;
  font-size:12px;
  line-height:1.55;
}
.nf-replenishment-action-alert .btn {
  flex:0 0 auto;
  border-color:#B42318;
  background:#B42318;
  color:#FFFFFF;
}
.nf-replenishment-action-alert .btn:hover {
  background:#8F1C14;
}
.nf-replenishment-tabs {
  display:flex;
  flex-wrap:wrap;
  gap:9px;
  margin-top:20px;
}
.nf-replenishment-tabs button {
  min-height:42px;
  padding:9px 14px;
  border:1px solid #CBB9A5;
  border-radius:999px;
  background:#FFFFFF;
  color:#5B493C;
  font:inherit;
  font-size:12px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-tabs button[aria-selected="true"] {
  border-color:#173C52;
  background:#173C52;
  color:#FFFFFF;
}
.nf-replenishment-tabs button[data-action-required="true"] {
  border-color:#B42318;
  background:#FFF1F1;
  color:#9A231A;
  box-shadow:0 0 0 2px rgba(180,35,24,.08);
}
.nf-replenishment-tabs button[aria-selected="true"][data-action-required="true"] {
  border-color:#B42318;
  background:#B42318;
  color:#FFFFFF;
}
.nf-replenishment-message {
  margin-top:16px;
  padding:13px 15px;
  border-radius:13px;
  line-height:1.55;
}
.nf-replenishment-message[data-kind="error"] {
  border:1px solid #E1A3A3;
  background:#FFF2F2;
  color:#8C2525;
}
.nf-replenishment-message[data-kind="success"] {
  border:1px solid #A9D2B6;
  background:#F3FBF5;
  color:#285A37;
}
.nf-replenishment-form {
  display:grid;
  gap:18px;
  margin-top:20px;
}
.nf-replenishment-meta-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
}
.nf-replenishment-field {
  display:grid;
  gap:6px;
}
.nf-replenishment-field.full {
  grid-column:1/-1;
}
.nf-replenishment-field label,
.nf-replenishment-days legend {
  color:#4A3313;
  font-size:10.5px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-replenishment-field input,
.nf-replenishment-field select,
.nf-replenishment-field textarea,
.nf-replenishment-line select,
.nf-replenishment-line input,
.nf-replenishment-reply textarea {
  width:100%;
  box-sizing:border-box;
  border:1.5px solid #CDB58D;
  border-radius:11px;
  background:#FFFFFF;
  color:#17120E;
  font:inherit;
}
.nf-replenishment-field input,
.nf-replenishment-field select,
.nf-replenishment-line select,
.nf-replenishment-line input {
  min-height:47px;
  padding:10px 12px;
}
.nf-replenishment-field textarea,
.nf-replenishment-reply textarea {
  min-height:96px;
  padding:11px 12px;
  resize:vertical;
}
.nf-replenishment-field input:focus,
.nf-replenishment-field select:focus,
.nf-replenishment-field textarea:focus,
.nf-replenishment-line select:focus,
.nf-replenishment-line input:focus,
.nf-replenishment-reply textarea:focus {
  border-color:#167BB6;
  outline:3px solid rgba(36,160,237,.14);
}
.nf-replenishment-days {
  grid-column:1/-1;
  margin:0;
  padding:14px;
  border:1px solid #E3D8CB;
  border-radius:14px;
  background:#FFFCF7;
}
.nf-replenishment-days legend {
  padding:0 5px;
}
.nf-replenishment-day-grid {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.nf-replenishment-day-grid label {
  display:flex;
  align-items:center;
  gap:7px;
  padding:8px 10px;
  border:1px solid #DDD0C0;
  border-radius:999px;
  background:#FFFFFF;
  color:#5E5147;
  font-size:12px;
  cursor:pointer;
}
.nf-replenishment-day-grid input {
  width:16px;
  height:16px;
  margin:0;
}
.nf-replenishment-items {
  display:grid;
  gap:10px;
}
.nf-replenishment-items-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.nf-replenishment-items-header h3 {
  margin:0;
  color:#281A12;
  font-size:17px;
}
.nf-replenishment-items-header p {
  margin:3px 0 0;
  color:#75685E;
  font-size:12px;
}
.nf-replenishment-line {
  display:grid;
  grid-template-columns:minmax(240px,2.2fr) minmax(95px,.7fr) minmax(95px,.7fr) auto;
  gap:9px;
  align-items:end;
  padding:13px;
  border:1px solid #E0D5C8;
  border-radius:15px;
  background:#FFFFFF;
}
.nf-replenishment-line-field {
  display:grid;
  gap:5px;
}
.nf-replenishment-line-field label {
  color:#66564A;
  font-size:9.5px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-line-price {
  margin-top:5px;
  color:#3B6A4B;
  font-size:11px;
  font-weight:800;
}
.nf-replenishment-remove {
  min-height:47px;
  padding:9px 12px;
  border:1px solid #D8A5A5;
  border-radius:11px;
  background:#FFF6F6;
  color:#8C2525;
  font:inherit;
  font-size:12px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-line-notes {
  grid-column:1/-1;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:9px;
  align-items:center;
}
.nf-replenishment-line-notes input {
  min-height:42px;
}
.nf-replenishment-summary {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
}
.nf-replenishment-summary div {
  padding:15px;
  border-radius:14px;
  background:#F1F8FC;
}
.nf-replenishment-summary span {
  display:block;
  color:#587386;
  font-size:9.5px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-replenishment-summary strong {
  display:block;
  margin-top:6px;
  color:#173C52;
  font-size:19px;
}
.nf-replenishment-submit {
  min-height:52px;
}
.nf-replenishment-history {
  display:grid;
  gap:12px;
  margin-top:20px;
}
.nf-replenishment-empty {
  padding:20px;
  border:1px dashed #CBB9A5;
  border-radius:15px;
  background:#FFFFFF;
  color:#6A5D52;
  line-height:1.65;
  text-align:center;
}
.nf-replenishment-request {
  overflow:hidden;
  border:1px solid #DDD0C0;
  border-radius:17px;
  background:#FFFFFF;
}
.nf-replenishment-request-head {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:16px 17px;
  background:#F8F4EE;
}
.nf-replenishment-request-head h3 {
  margin:0;
  color:#281A12;
  font-size:16px;
}
.nf-replenishment-request-head p {
  margin:5px 0 0;
  color:#74675D;
  font-size:11.5px;
}
.nf-replenishment-status {
  align-self:flex-start;
  padding:7px 10px;
  border-radius:999px;
  background:#E8F4FB;
  color:#175D85;
  font-size:10px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-status[data-status="accepted"],
.nf-replenishment-status[data-status="paid"],
.nf-replenishment-status[data-status="fulfilled"] {
  background:#EAF6ED;
  color:#285A37;
}
.nf-replenishment-status[data-status="needs_information"],
.nf-replenishment-status[data-status="quoted"] {
  background:#FFF2BF;
  color:#6A4E00;
}
.nf-replenishment-status[data-status="cancelled"],
.nf-replenishment-status[data-status="declined"] {
  background:#F8E6E6;
  color:#842C2C;
}
.nf-replenishment-request-body {
  display:grid;
  gap:14px;
  padding:16px 17px 18px;
}
.nf-replenishment-request-meta {
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-replenishment-request-meta div {
  padding:11px;
  border-radius:11px;
  background:#F6FAFC;
}
.nf-replenishment-request-meta span {
  display:block;
  color:#6B7D87;
  font-size:9px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-request-meta strong {
  display:block;
  margin-top:5px;
  color:#173C52;
  font-size:12px;
}
.nf-replenishment-request-items {
  display:grid;
  gap:7px;
}
.nf-replenishment-request-item {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto;
  gap:12px;
  align-items:center;
  padding:10px 12px;
  border:1px solid #ECE3D8;
  border-radius:11px;
}
.nf-replenishment-request-item strong {
  color:#35251A;
  font-size:13px;
}
.nf-replenishment-request-item span {
  color:#74675D;
  font-size:11.5px;
}
.nf-replenishment-response {
  padding:13px 14px;
  border-left:4px solid #F7C41C;
  border-radius:11px;
  background:#FFF9E8;
  color:#604A1C;
  white-space:pre-wrap;
  line-height:1.6;
}
.nf-replenishment-actions {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.nf-replenishment-actions .btn {
  min-height:43px;
}
.nf-replenishment-reply {
  display:grid;
  gap:8px;
}
@media (max-width:800px) {
  .nf-replenishment-action-alert {
    align-items:flex-start;
    flex-direction:column;
  }
  .nf-replenishment-action-alert .btn {
    width:100%;
  }
  .nf-replenishment-header {
    flex-direction:column;
  }
  .nf-replenishment-meta-grid,
  .nf-replenishment-summary,
  .nf-replenishment-request-meta {
    grid-template-columns:1fr;
  }
  .nf-replenishment-line {
    grid-template-columns:1fr 1fr;
  }
  .nf-replenishment-line > :first-child,
  .nf-replenishment-line-notes {
    grid-column:1/-1;
  }
}
@media (max-width:520px) {
  .nf-replenishment-line {
    grid-template-columns:1fr;
  }
  .nf-replenishment-line > *,
  .nf-replenishment-line-notes {
    grid-column:auto;
  }
  .nf-replenishment-line-notes {
    grid-template-columns:1fr;
  }
  .nf-replenishment-request-item {
    grid-template-columns:1fr;
    gap:4px;
  }
}
`;

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
];

const emptyLine = () => ({
  selectionKey: "",
  quantity: 6,
  onHandCount: "",
  notes: "",
});

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const shortDate = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const dateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const todayIso = () => {
  const now = new Date();
  const local = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, "0"),
    String(local.getDate()).padStart(2, "0"),
  ].join("-");
};

const actionMessage = (error) =>
  String(error?.message || error || "The request could not be updated.");

export default function PartnerReplenishmentPanel() {
  const [tab, setTab] = useState("new");
  const [catalog, setCatalog] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [replyById, setReplyById] = useState({});
  const [form, setForm] = useState({
    neededBy: "",
    fulfillmentMethod: "flexible",
    preferredDeliveryDays: [],
    currentInventoryNotes: "",
    requestNotes: "",
    items: [emptyLine(), emptyLine()],
  });

  const actionRequiredRequests = useMemo(
    () =>
      requests.filter((request) =>
        ["needs_information", "quoted"].includes(
          request.status
        )
      ),
    [requests]
  );

  const primaryActionRequest =
    actionRequiredRequests[0] || null;

  const actionRequiredCopy =
    actionRequiredRequests.length > 1
      ? `${actionRequiredRequests.length} replenishment requests need your attention.`
      : primaryActionRequest?.status === "quoted"
        ? "A replenishment quote is ready for your review."
        : "NectarFusions needs additional information for a replenishment request.";

  const catalogByKey = useMemo(
    () =>
      new Map(
        catalog.map((row) => [
          `${row.flavor_id}|${row.size_id}|${row.texture}`,
          row,
        ])
      ),
    [catalog]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextCatalog, nextRequests] = await Promise.all([
        api.getPartnerReplenishmentCatalog(),
        api.listPartnerReplenishmentRequests(),
      ]);

      setCatalog(nextCatalog);
      setRequests(nextRequests);
    } catch (loadError) {
      setError(actionMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const toggleDay = (day) => {
    setForm((current) => {
      const selected = current.preferredDeliveryDays.includes(day);
      return {
        ...current,
        preferredDeliveryDays: selected
          ? current.preferredDeliveryDays.filter((item) => item !== day)
          : [...current.preferredDeliveryDays, day],
      };
    });
  };

  const updateLine = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line
      ),
    }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const selectedLines = useMemo(
    () =>
      form.items
        .map((line) => ({
          line,
          catalogRow: catalogByKey.get(line.selectionKey),
        }))
        .filter(({ catalogRow }) => Boolean(catalogRow)),
    [catalogByKey, form.items]
  );

  const totalQuantity = selectedLines.reduce(
    (sum, { line }) => sum + Number(line.quantity || 0),
    0
  );

  const subtotalCents = selectedLines.reduce(
    (sum, { line, catalogRow }) =>
      sum +
      Number(line.quantity || 0) *
        Number(catalogRow.unit_price_cents || 0),
    0
  );

  const duplicateSelections = useMemo(() => {
    const keys = form.items
      .map((line) => line.selectionKey)
      .filter(Boolean);
    return new Set(keys).size !== keys.length;
  }, [form.items]);

  const validLines =
    selectedLines.length > 0 &&
    selectedLines.every(({ line }) => {
      const quantity = Number(line.quantity);
      const onHand =
        line.onHandCount === "" ? null : Number(line.onHandCount);

      return (
        Number.isInteger(quantity) &&
        quantity >= 6 &&
        quantity <= 996 &&
        quantity % 6 === 0 &&
        (onHand === null ||
          (Number.isInteger(onHand) && onHand >= 0 && onHand <= 9999))
      );
    });

  const canSubmit =
    !loading &&
    !busy &&
    catalog.length > 0 &&
    validLines &&
    !duplicateSelections &&
    totalQuantity >= 12;

  const submit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setError(
        duplicateSelections
          ? "Combine duplicate flavor, size, and texture selections."
          : "Choose valid six-jar increments totaling at least twelve jars."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const submission =
        await api.submitPartnerReplenishment({
          neededBy: form.neededBy || null,
          fulfillmentMethod: form.fulfillmentMethod,
          preferredDeliveryDays:
            form.preferredDeliveryDays,
          currentInventoryNotes:
            form.currentInventoryNotes.trim() || null,
          requestNotes:
            form.requestNotes.trim() || null,
          items: selectedLines.map(
            ({ line, catalogRow }) => ({
              flavor_id: catalogRow.flavor_id,
              size_id: catalogRow.size_id,
              texture: catalogRow.texture,
              quantity: Number(line.quantity),
              on_hand_count:
                line.onHandCount === ""
                  ? null
                  : Number(line.onHandCount),
              notes: line.notes.trim() || null,
            })
          ),
        });

      setSuccess(
        submission.emailWarning
          ? `Request ${submission.requestId} was saved. The immediate owner email could not be confirmed, so NectarFusions will verify the request in Admin.`
          : `Request ${submission.requestId} was submitted and NectarFusions was notified.`
      );
      setForm({
        neededBy: "",
        fulfillmentMethod: "flexible",
        preferredDeliveryDays: [],
        currentInventoryNotes: "",
        requestNotes: "",
        items: [emptyLine(), emptyLine()],
      });
      await load();
      setTab("history");
    } catch (submitError) {
      const message = actionMessage(submitError);
      const submissionUnknown =
        submitError?.code ===
          "REPLENISHMENT_SUBMISSION_UNKNOWN" ||
        /failed to fetch|networkerror|load failed/i.test(
          message
        );

      if (!submissionUnknown) {
        setError(
          `${message} Review the form and try again. If the problem continues, contact NectarFusions at info@nectar-fusions.com.`
        );
      } else {
        setError(
          "We could not confirm whether your request was submitted because the connection was interrupted. We are checking Request History before you try again."
        );

        try {
          const previousIds = new Set(
            requests.map((request) => request.id)
          );
          const nextRequests =
            await api.listPartnerReplenishmentRequests();
          const recoveredRequest = nextRequests.find(
            (request) => !previousIds.has(request.id)
          );

          setRequests(nextRequests);
          setTab("history");

          if (recoveredRequest) {
            setError("");
            setSuccess(
              `Request ${recoveredRequest.id} appears in Request History. It was received, so do not submit it again.`
            );
          } else {
            setError(
              "No new request appeared in Request History. Return to New Request and try once more. If it still does not submit, contact NectarFusions at info@nectar-fusions.com."
            );
          }
        } catch {
          setError(
            "We could not confirm the submission or refresh Request History. Do not submit again yet. Contact NectarFusions at info@nectar-fusions.com so the request can be checked safely."
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (request, action) => {
    if (actionBusyId) return;

    const reply = replyById[request.id]?.trim() || null;

    if (action === "provide_information" && !reply) {
      setError("Enter the information NectarFusions requested.");
      return;
    }

    if (
      action === "accept" &&
      !window.confirm(
        "Accept this quote and confirm the displayed total?"
      )
    ) {
      return;
    }

    if (
      action === "cancel" &&
      !window.confirm(
        "Cancel this replenishment request? This cannot be undone."
      )
    ) {
      return;
    }

    setActionBusyId(request.id);
    setError("");
    setSuccess("");

    try {
      await api.partnerReplenishmentAction(
        request.id,
        action,
        reply
      );
      setReplyById((current) => ({
        ...current,
        [request.id]: "",
      }));
      setSuccess(
        action === "accept"
          ? "The quote was accepted."
          : action === "provide_information"
          ? "Your information was sent for review."
          : "The request was cancelled."
      );
      await load();
    } catch (actionError) {
      setError(actionMessage(actionError));
    } finally {
      setActionBusyId("");
    }
  };

  return (
    <section
      className="nf-replenishment-panel"
      aria-labelledby="partner-replenishment-title"
    >
      <style>{REPLENISHMENT_CSS}</style>

      {primaryActionRequest && (
        <div
          className="nf-replenishment-action-alert"
          role="alert"
          aria-live="polite"
        >
          <div>
            <strong>Action required</strong>
            <span>{actionRequiredCopy}</span>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => setTab("history")}
          >
            Review Request
          </button>
        </div>
      )}

      <div className="nf-replenishment-header">
        <div>
          <div className="nf-modern-kicker">Wholesale restock</div>
          <h2 id="partner-replenishment-title">
            Replenishment Requests
          </h2>
          <p>
            Build a restock request using currently available 7 oz and
            1 lb wholesale selections. Quantities are submitted in
            six-jar increments with a twelve-jar request minimum.
          </p>
        </div>

        <div className="nf-replenishment-price-note">
          Published wholesale pricing
        </div>
      </div>

      <div className="nf-replenishment-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
        >
          New Request
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          data-action-required={
            actionRequiredRequests.length > 0
              ? "true"
              : "false"
          }
          onClick={() => setTab("history")}
        >
          Request History ({requests.length})
          {actionRequiredRequests.length > 0
            ? ` · Action Needed (${actionRequiredRequests.length})`
            : ""}
        </button>
      </div>

      {error && (
        <div
          className="nf-replenishment-message"
          data-kind="error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="nf-replenishment-message"
          data-kind="success"
          role="status"
        >
          {success}
        </div>
      )}

      {loading ? (
        <div className="nf-replenishment-empty" role="status">
          Loading secure replenishment tools…
        </div>
      ) : tab === "new" ? (
        <form className="nf-replenishment-form" onSubmit={submit}>
          <div className="nf-replenishment-meta-grid">
            <div className="nf-replenishment-field">
              <label htmlFor="replenishment-needed-by">
                Needed by
              </label>
              <input
                id="replenishment-needed-by"
                type="date"
                min={todayIso()}
                value={form.neededBy}
                onChange={(event) =>
                  updateForm("neededBy", event.target.value)
                }
              />
            </div>

            <div className="nf-replenishment-field">
              <label htmlFor="replenishment-fulfillment">
                Preferred fulfillment
              </label>
              <select
                id="replenishment-fulfillment"
                value={form.fulfillmentMethod}
                onChange={(event) =>
                  updateForm(
                    "fulfillmentMethod",
                    event.target.value
                  )
                }
              >
                <option value="flexible">Flexible</option>
                <option value="pickup">Pickup</option>
                <option value="delivery">Delivery</option>
                <option value="shipping">Shipping</option>
              </select>
            </div>

            <fieldset className="nf-replenishment-days">
              <legend>Preferred delivery days</legend>
              <div className="nf-replenishment-day-grid">
                {DAYS.map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      checked={form.preferredDeliveryDays.includes(
                        value
                      )}
                      onChange={() => toggleDay(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="nf-replenishment-field full">
              <label htmlFor="replenishment-inventory">
                Current inventory notes
              </label>
              <textarea
                id="replenishment-inventory"
                maxLength={5000}
                value={form.currentInventoryNotes}
                onChange={(event) =>
                  updateForm(
                    "currentInventoryNotes",
                    event.target.value
                  )
                }
                placeholder="Share current on-hand conditions, fastest sellers, or low-stock concerns."
              />
            </div>

            <div className="nf-replenishment-field full">
              <label htmlFor="replenishment-notes">
                Request notes
              </label>
              <textarea
                id="replenishment-notes"
                maxLength={5000}
                value={form.requestNotes}
                onChange={(event) =>
                  updateForm("requestNotes", event.target.value)
                }
                placeholder="Add timing, assortment, delivery, or other request details."
              />
            </div>
          </div>

          <div className="nf-replenishment-items">
            <div className="nf-replenishment-items-header">
              <div>
                <h3>Requested products</h3>
                <p>
                  Each flavor, size, and texture must use a quantity
                  divisible by six.
                </p>
              </div>
              <button
                type="button"
                className="btn ghost"
                disabled={form.items.length >= 100}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    items:
                      current.items.length >= 100
                        ? current.items
                        : [...current.items, emptyLine()],
                  }))
                }
              >
                {form.items.length >= 100
                  ? "Product Limit Reached"
                  : "Add Product"}
              </button>
            </div>

            {form.items.map((line, index) => {
              const catalogRow =
                catalogByKey.get(line.selectionKey) || null;

              return (
                <div
                  className="nf-replenishment-line"
                  key={`replenishment-line-${index}`}
                >
                  <div className="nf-replenishment-line-field">
                    <label htmlFor={`replenishment-product-${index}`}>
                      Flavor, size, and texture
                    </label>
                    <select
                      id={`replenishment-product-${index}`}
                      value={line.selectionKey}
                      onChange={(event) =>
                        updateLine(
                          index,
                          "selectionKey",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Choose a product</option>
                      {catalog.map((row) => {
                        const key =
                          `${row.flavor_id}|${row.size_id}|` +
                          row.texture;
                        return (
                          <option key={key} value={key}>
                            {row.flavor_name} · {row.size_label} ·{" "}
                            {cleanStatus(row.texture)} ·{" "}
                            {money(row.unit_price_cents)}
                          </option>
                        );
                      })}
                    </select>
                    {catalogRow && (
                      <span className="nf-replenishment-line-price">
                        {money(catalogRow.unit_price_cents)} each ·{" "}
                        {money(
                          Number(catalogRow.unit_price_cents) *
                            Number(line.quantity || 0)
                        )}{" "}
                        line total
                      </span>
                    )}
                  </div>

                  <div className="nf-replenishment-line-field">
                    <label htmlFor={`replenishment-quantity-${index}`}>
                      Quantity
                    </label>
                    <input
                      id={`replenishment-quantity-${index}`}
                      type="number"
                      min="6"
                      max="996"
                      step="6"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(
                          index,
                          "quantity",
                          event.target.value
                        )
                      }
                    />
                  </div>

                  <div className="nf-replenishment-line-field">
                    <label htmlFor={`replenishment-on-hand-${index}`}>
                      Jars currently on hand (optional)
                    </label>
                    <input
                      id={`replenishment-on-hand-${index}`}
                      type="number"
                      min="0"
                      max="9999"
                      step="1"
                      value={line.onHandCount}
                      onChange={(event) =>
                        updateLine(
                          index,
                          "onHandCount",
                          event.target.value
                        )
                      }
                      placeholder="Optional"
                    />
                  </div>

                  <button
                    type="button"
                    className="nf-replenishment-remove"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        items:
                          current.items.length === 1
                            ? [emptyLine()]
                            : current.items.filter(
                                (_, lineIndex) =>
                                  lineIndex !== index
                              ),
                      }))
                    }
                  >
                    Remove
                  </button>

                  <div className="nf-replenishment-line-notes">
                    <input
                      aria-label={`Notes for product ${index + 1}`}
                      maxLength={1000}
                      value={line.notes}
                      onChange={(event) =>
                        updateLine(
                          index,
                          "notes",
                          event.target.value
                        )
                      }
                      placeholder="Optional product notes"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="nf-replenishment-summary">
            <div>
              <span>Selected lines</span>
              <strong>{selectedLines.length}</strong>
            </div>
            <div>
              <span>Total jars</span>
              <strong>{totalQuantity}</strong>
            </div>
            <div>
              <span>Requested subtotal</span>
              <strong>{money(subtotalCents)}</strong>
            </div>
          </div>

          <button
            type="submit"
            className="btn solid nf-replenishment-submit"
            disabled={!canSubmit}
          >
            {busy
              ? "Submitting Request…"
              : "Submit Replenishment Request"}
          </button>
        </form>
      ) : requests.length === 0 ? (
        <div className="nf-replenishment-empty">
          No replenishment requests have been submitted yet.
        </div>
      ) : (
        <div className="nf-replenishment-history">
          {requests.map((request) => {
            const mayCancel = [
              "submitted",
              "under_review",
              "needs_information",
              "quoted",
            ].includes(request.status);
            const items = Array.isArray(request.items)
              ? request.items
              : [];

            return (
              <article
                className="nf-replenishment-request"
                key={request.id}
              >
                <div className="nf-replenishment-request-head">
                  <div>
                    <h3>
                      Request submitted{" "}
                      {dateTime(request.submitted_at)}
                    </h3>
                    <p>Request ID: {request.id}</p>
                  </div>
                  <span
                    className="nf-replenishment-status"
                    data-status={request.status}
                  >
                    {cleanStatus(request.status)}
                  </span>
                </div>

                <div className="nf-replenishment-request-body">
                  <div className="nf-replenishment-request-meta">
                    <div>
                      <span>Needed by</span>
                      <strong>{shortDate(request.needed_by)}</strong>
                    </div>
                    <div>
                      <span>Fulfillment</span>
                      <strong>
                        {cleanStatus(
                          request.fulfillment_method || "flexible"
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Requested subtotal</span>
                      <strong>
                        {money(
                          request.requested_subtotal_cents
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Confirmed total</span>
                      <strong>
                        {request.confirmed_total_cents === null ||
                        request.confirmed_total_cents === undefined
                          ? "Pending quote"
                          : money(
                              request.confirmed_total_cents
                            )}
                      </strong>
                    </div>
                  </div>

                  <div className="nf-replenishment-request-items">
                    {items.map((item) => (
                      <div
                        className="nf-replenishment-request-item"
                        key={item.id}
                      >
                        <strong>{item.flavor_name}</strong>
                        <span>
                          {item.size_id} ·{" "}
                          {cleanStatus(item.texture)}
                        </span>
                        <span>
                          {item.quantity} jars ·{" "}
                          {money(item.line_total_cents)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {request.partner_response && (
                    <div className="nf-replenishment-response">
                      <strong>NectarFusions response</strong>
                      <br />
                      {request.partner_response}
                    </div>
                  )}

                  {request.status === "needs_information" && (
                    <div className="nf-replenishment-reply">
                      <label
                        htmlFor={`replenishment-reply-${request.id}`}
                      >
                        Requested information
                      </label>
                      <textarea
                        id={`replenishment-reply-${request.id}`}
                        maxLength={5000}
                        value={replyById[request.id] || ""}
                        onChange={(event) =>
                          setReplyById((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn solid"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          runAction(
                            request,
                            "provide_information"
                          )
                        }
                      >
                        Send Information
                      </button>
                    </div>
                  )}

                  <div className="nf-replenishment-actions">
                    {request.status === "quoted" && (
                      <button
                        type="button"
                        className="btn solid"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          runAction(request, "accept")
                        }
                      >
                        Accept Quote
                      </button>
                    )}

                    {mayCancel && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          runAction(request, "cancel")
                        }
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
