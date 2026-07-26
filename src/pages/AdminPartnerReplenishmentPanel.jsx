import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-arr{display:grid;gap:14px;padding:18px;border:1px solid #D8CBBE;border-radius:18px;background:#fff}
.nf-arr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.nf-arr-head h3{margin:0;color:#2B1C13;font-size:20px}
.nf-arr-head p{margin:5px 0 0;color:#71645A;font-size:12px;line-height:1.55}
.nf-arr-note{padding:11px 13px;border-left:4px solid #F7C41C;border-radius:10px;background:#FFF9ED;color:#695126;font-size:11.5px;line-height:1.55}
.nf-arr-msg{padding:11px 13px;border-radius:12px;font-size:13px;line-height:1.55}
.nf-arr-msg.error{border:1px solid #E0A0A0;background:#FFF1F1;color:#8A2929}
.nf-arr-msg.success{border:1px solid #A8D1B3;background:#F1FAF3;color:#315E3D}
.nf-arr-tools{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.nf-arr-filters{display:flex;gap:7px;flex-wrap:wrap}
.nf-arr-filters button{border:1px solid #D8CBBE;border-radius:999px;padding:7px 11px;background:#fff;color:#5F5147;font-size:11px;font-weight:800;cursor:pointer}
.nf-arr-filters button.active{border-color:#167BB6;background:#EAF6FD;color:#173C52}
.nf-arr-badge{display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;background:#F1F8FC;color:#173C52;font-size:9px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
.nf-arr-empty{padding:22px 16px;border:1px dashed #CEBFAE;border-radius:14px;background:#FFFCF8;color:#706359;text-align:center;line-height:1.6}
.nf-arr-layout{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);gap:14px;align-items:start}
.nf-arr-list{display:grid;gap:8px;max-height:700px;overflow:auto;padding-right:2px}
.nf-arr-request{width:100%;display:grid;gap:5px;padding:12px;border:1px solid #DDD1C5;border-radius:13px;background:#fff;color:#2B1C13;text-align:left;cursor:pointer}
.nf-arr-request:hover{border-color:#7EB9DC;background:#F5FBFE}
.nf-arr-request.selected{border-color:#167BB6;background:#EAF6FD;box-shadow:0 0 0 2px rgba(36,160,237,.1)}
.nf-arr-request-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.nf-arr-request strong{font-size:12px;overflow-wrap:anywhere}
.nf-arr-request small{color:#74675D;font-size:10px;line-height:1.4}
.nf-arr-detail{min-width:0;display:grid;gap:12px}
.nf-arr-card{padding:16px;border:1px solid #E1D6CA;border-radius:15px;background:linear-gradient(145deg,#fff,#FCF8F2)}
.nf-arr-card h4{margin:0;color:#2B1C13;font-size:17px}
.nf-arr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.nf-arr-grid div{padding:10px;border-radius:11px;background:#F1F8FC}
.nf-arr-grid span{display:block;color:#607C8D;font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-arr-grid strong{display:block;margin-top:4px;color:#173C52;font-size:12px;overflow-wrap:anywhere}
.nf-arr-copy{margin-top:10px;padding:10px 11px;border-radius:10px;background:#FBF7F1;color:#5E4D40;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.nf-arr-copy.partner{background:#F1F8FC;color:#173C52}
.nf-arr-table-wrap{overflow:auto;border:1px solid #E2D7CB;border-radius:13px}
.nf-arr-table{width:100%;border-collapse:collapse;min-width:650px}
.nf-arr-table th,.nf-arr-table td{padding:10px;border-bottom:1px solid #E8DED3;text-align:left;font-size:11px}
.nf-arr-table th{background:#FBF7F1;color:#654B1B;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-arr-table td{color:#4F443B}
.nf-arr-table tr:last-child td{border-bottom:0}
.nf-arr-money{text-align:right!important;white-space:nowrap}
.nf-arr-editor{padding:15px;border:1px solid #D9CDBC;border-radius:15px;background:#FFFCF8}
.nf-arr-editor h4{margin:0;color:#2B1C13;font-size:16px}
.nf-arr-help{margin:5px 0 0;color:#74675D;font-size:11px;line-height:1.55}
.nf-arr-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.nf-arr-field{display:grid;gap:6px}
.nf-arr-field.wide{grid-column:1/-1}
.nf-arr-field span{color:#654B1B;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-arr-field input,.nf-arr-field textarea{width:100%;box-sizing:border-box}
.nf-arr-field textarea{resize:vertical}
.nf-arr-preview{display:flex;justify-content:flex-end;gap:16px;flex-wrap:wrap;margin-top:11px;padding:10px 12px;border-radius:11px;background:#F1F8FC;color:#173C52;font-size:12px}
.nf-arr-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:12px}
.nf-arr-actions .btn{padding:9px 12px}
.nf-arr-actions .danger{border-color:#C67777;color:#8A2929}
@media(max-width:900px){.nf-arr-layout{grid-template-columns:1fr}.nf-arr-list{max-height:280px}}
@media(max-width:640px){.nf-arr-head,.nf-arr-tools{align-items:stretch;flex-direction:column}.nf-arr-grid,.nf-arr-fields{grid-template-columns:1fr}.nf-arr-field.wide{grid-column:auto}}
`;

const CLOSED = new Set(["fulfilled", "cancelled", "declined"]);
const ACTIVE = new Set([
  "submitted",
  "under_review",
  "needs_information",
  "quoted",
  "accepted",
  "paid",
]);

const label = (value) =>
  String(value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0) / 100);

const dateTime = (value) => {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const dateOnly = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const itemSubtotal = (request) =>
  (request?.items || []).reduce(
    (sum, item) => sum + Number(item.line_total_cents || 0),
    0
  );

const requiresFreshPartnerResponse = (request) =>
  request?.status === "under_review" &&
  Boolean(request?.partner_reply);

const draftFrom = (request) => ({
  partnerResponse: requiresFreshPartnerResponse(request)
    ? ""
    : request?.partner_response || "",
  adminNotes: request?.admin_notes || "",
  fulfillmentCharge:
    request?.fulfillment_charge_cents === null ||
    request?.fulfillment_charge_cents === undefined
      ? "0.00"
      : (Number(request.fulfillment_charge_cents || 0) / 100).toFixed(2),
});

const notices = {
  save_notes: "Private Admin notes saved.",
  under_review: "Request moved under review.",
  needs_information: "Information request published to the Partner Portal.",
  quote: "Quote published to the Partner Portal.",
  mark_paid: "Request marked paid.",
  fulfill: "Request marked fulfilled.",
  decline: "Request declined.",
  cancel: "Request cancelled.",
};

const confirmation = (
  action,
  request,
  total,
  partnerResponse
) => {
  const id = request?.id || "this request";
  if (action === "needs_information") {
    return `Send the information request for ${id} to the Partner Portal?`;
  }
  if (action === "quote") {
    return (
      `Publish a confirmed quote of ${money(total)} for ${id}?\n\n` +
      `Partner-visible message:\n${partnerResponse}`
    );
  }
  if (action === "mark_paid") {
    return `Mark ${id} as paid? Only do this after payment is confirmed.`;
  }
  if (action === "fulfill") {
    return `Mark ${id} as fulfilled? Only do this after the order has been completed.`;
  }
  if (action === "decline") {
    return `Decline ${id}? The Partner will see the explanation.`;
  }
  if (action === "cancel") {
    return `Cancel ${id}? The Partner will see the explanation.`;
  }
  return "";
};

export default function AdminPartnerReplenishmentPanel({
  partner,
  onRequestsChanged,
}) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("active");
  const [draft, setDraft] = useState(draftFrom(null));
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => requests.find((request) => request.id === selectedId) || null,
    [requests, selectedId]
  );

  const visibleRequests = useMemo(() => {
    if (filter === "all") return requests;
    if (filter === "closed") {
      return requests.filter((request) => CLOSED.has(request.status));
    }
    return requests.filter((request) => ACTIVE.has(request.status));
  }, [filter, requests]);

  const loadRequests = useCallback(
    async ({ preserveSelection = true } = {}) => {
      if (!partner?.id) {
        setRequests([]);
        setSelectedId("");
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const rows = await api.getAdminPartnerReplenishmentHistory(
          partner.id
        );
        setRequests(rows);
        onRequestsChanged?.(partner.id, rows);
        setSelectedId((current) => {
          if (
            preserveSelection &&
            current &&
            rows.some((request) => request.id === current)
          ) {
            return current;
          }
          return rows[0]?.id || "";
        });
        setError("");
      } catch (loadError) {
        setError(
          `${loadError.message} Refresh this section. If the problem continues, verify the Admin session before taking any request action.`
        );
      } finally {
        setLoading(false);
      }
    },
    [onRequestsChanged, partner?.id]
  );

  useEffect(() => {
    setError("");
    setNotice("");
    setSelectedId("");
    setDraft(draftFrom(null));
    loadRequests({ preserveSelection: false });
  }, [loadRequests]);

  useEffect(() => {
    setDraft(draftFrom(selected));
    setError("");
    setNotice("");
  }, [selected?.id]);

  const fulfillmentCents = useMemo(() => {
    const value = Number(draft.fulfillmentCharge);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }, [draft.fulfillmentCharge]);

  const subtotal = selected ? itemSubtotal(selected) : 0;
  const quoteTotal =
    fulfillmentCents === null ? subtotal : subtotal + fulfillmentCents;

  const updateDraft = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError("");
    setNotice("");
  };

  const runAction = async (action) => {
    if (!selected || busyAction) return;

    const partnerResponse = draft.partnerResponse.trim() || null;
    const adminNotes = draft.adminNotes.trim() || null;

    if (
      ["needs_information", "quote", "decline", "cancel"].includes(action) &&
      !partnerResponse
    ) {
      setError(
        "Enter the Partner-visible response before taking this action."
      );
      return;
    }

    if (
      action === "quote" &&
      selected.partner_reply &&
      partnerResponse ===
        (selected.partner_response || "").trim()
    ) {
      setError(
        "Enter a new Partner-visible quote response. The prior information request cannot be reused as the quote message."
      );
      return;
    }

    if (action === "quote" && fulfillmentCents === null) {
      setError(
        "Enter a fulfillment charge of $0.00 or more before publishing the quote."
      );
      return;
    }

    const prompt = confirmation(
      action,
      selected,
      quoteTotal,
      partnerResponse
    );
    if (prompt && !window.confirm(prompt)) return;

    setBusyAction(action);
    setError("");
    setNotice("");

    try {
      await api.adminPartnerReplenishmentAction(selected.id, action, {
        partnerResponse,
        adminNotes,
        fulfillmentChargeCents:
          action === "quote" ? fulfillmentCents : null,
      });
      await loadRequests();
      setNotice(notices[action] || "Replenishment request updated.");
    } catch (actionError) {
      setError(
        `${actionError.message} Review the request status and required fields before trying again.`
      );
    } finally {
      setBusyAction("");
    }
  };

  const status = selected?.status || "";
  const canUnderReview = ["submitted", "needs_information"].includes(status);
  const canNeedsInfo = ["submitted", "under_review"].includes(status);
  const canQuote = [
    "submitted",
    "under_review",
    "needs_information",
    "quoted",
  ].includes(status);
  const canMarkPaid = status === "accepted";
  const canFulfill = status === "paid";
  const canDecline = [
    "submitted",
    "under_review",
    "needs_information",
    "quoted",
  ].includes(status);
  const canCancel =
    status && !["fulfilled", "cancelled", "declined"].includes(status);

  return (
    <div className="nf-arr">
      <style>{CSS}</style>

      <div className="nf-arr-head">
        <div>
          <h3>Replenishment Requests</h3>
          <p>
            Review products, request information, publish quotes, record
            payment, and complete fulfillment through guarded Admin actions.
          </p>
        </div>

        <button
          type="button"
          className="btn ghost"
          disabled={loading || Boolean(busyAction)}
          onClick={() => loadRequests()}
        >
          {loading ? "Refreshing…" : "Refresh Requests"}
        </button>
      </div>

      <div className="nf-arr-note">
        Partner product choices come from active flavors with in-stock 7 oz
        or 1 lb inventory. Use the existing Admin inventory controls to make
        a flavor, size, or texture available or unavailable.
      </div>

      {error && (
        <div className="nf-arr-msg error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="nf-arr-msg success" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      <div className="nf-arr-tools">
        <div className="nf-arr-filters" aria-label="Request filter">
          {[
            ["active", "Active"],
            ["closed", "Closed"],
            ["all", "All"],
          ].map(([value, text]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {text}
            </button>
          ))}
        </div>

        <span className="nf-arr-badge">
          {requests.length} total request{requests.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="nf-arr-empty">Loading replenishment requests…</div>
      ) : requests.length === 0 ? (
        <div className="nf-arr-empty">
          This partner has not submitted a replenishment request.
        </div>
      ) : (
        <div className="nf-arr-layout">
          <div className="nf-arr-list">
            {visibleRequests.length === 0 ? (
              <div className="nf-arr-empty">
                No requests match this filter.
              </div>
            ) : (
              visibleRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={`nf-arr-request ${
                    selectedId === request.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedId(request.id)}
                >
                  <div className="nf-arr-request-top">
                    <strong>{request.id}</strong>
                    <span className="nf-arr-badge">
                      {label(request.status)}
                    </span>
                  </div>
                  <small>
                    {dateTime(request.submitted_at)} ·{" "}
                    {money(
                      request.confirmed_total_cents ||
                        request.requested_subtotal_cents
                    )}
                  </small>
                  <small>
                    {(request.items || []).length} product line
                    {(request.items || []).length === 1 ? "" : "s"}
                  </small>
                </button>
              ))
            )}
          </div>

          {!selected ? (
            <div className="nf-arr-empty">
              Select a request to review it.
            </div>
          ) : (
            <div className="nf-arr-detail">
              <div className="nf-arr-card">
                <h4>{selected.id}</h4>

                <div className="nf-arr-grid">
                  <div>
                    <span>Status</span>
                    <strong>{label(selected.status)}</strong>
                  </div>
                  <div>
                    <span>Submitted</span>
                    <strong>{dateTime(selected.submitted_at)}</strong>
                  </div>
                  <div>
                    <span>Needed by</span>
                    <strong>{dateOnly(selected.needed_by)}</strong>
                  </div>
                  <div>
                    <span>Fulfillment</span>
                    <strong>{label(selected.fulfillment_method)}</strong>
                  </div>
                  <div>
                    <span>Requested subtotal</span>
                    <strong>{money(selected.requested_subtotal_cents)}</strong>
                  </div>
                  <div>
                    <span>Confirmed total</span>
                    <strong>
                      {selected.confirmed_total_cents
                        ? money(selected.confirmed_total_cents)
                        : "Not quoted"}
                    </strong>
                  </div>
                </div>

                {selected.preferred_delivery_days?.length > 0 && (
                  <div className="nf-arr-copy">
                    <strong>Preferred days:</strong>{" "}
                    {selected.preferred_delivery_days.map(label).join(", ")}
                  </div>
                )}

                {selected.current_inventory_notes && (
                  <div className="nf-arr-copy">
                    <strong>Current inventory notes:</strong>
                    <br />
                    {selected.current_inventory_notes}
                  </div>
                )}

                {selected.request_notes && (
                  <div className="nf-arr-copy">
                    <strong>Partner request notes:</strong>
                    <br />
                    {selected.request_notes}
                  </div>
                )}

                {selected.partner_reply && (
                  <div className="nf-arr-copy partner">
                    <strong>Partner reply:</strong>
                    <br />
                    {selected.partner_reply}
                  </div>
                )}
              </div>

              <div className="nf-arr-table-wrap">
                <table className="nf-arr-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Texture</th>
                      <th>Quantity</th>
                      <th>Jars on hand</th>
                      <th>Item note</th>
                      <th className="nf-arr-money">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.items || []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.flavor_name}</strong>
                          <br />
                          {item.size_id}
                        </td>
                        <td>{label(item.texture)}</td>
                        <td>{item.quantity}</td>
                        <td>{item.on_hand_count ?? "Not provided"}</td>
                        <td>{item.notes || "—"}</td>
                        <td className="nf-arr-money">
                          {money(item.line_total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="nf-arr-editor">
                <h4>Admin Review and Response</h4>
                <p className="nf-arr-help">
                  Partner-visible responses appear in Request History.
                  Private Admin notes never appear in the Partner Portal.
                </p>

                <div className="nf-arr-fields">
                  <label className="nf-arr-field wide">
                    <span>
                      {requiresFreshPartnerResponse(selected)
                        ? "New Partner-visible quote response"
                        : "Partner-visible response"}
                    </span>
                    <textarea
                      rows={4}
                      maxLength={5000}
                      value={draft.partnerResponse}
                      onChange={(event) =>
                        updateDraft({
                          partnerResponse: event.target.value,
                        })
                      }
                      placeholder="Explain the information needed, quote details, decline reason, cancellation reason, or next step."
                    />

                    {requiresFreshPartnerResponse(selected) && (
                      <small
                        style={{
                          color: "#9A231A",
                          fontWeight: 800,
                          lineHeight: 1.45,
                        }}
                      >
                        The Partner replied to the previous information
                        request. Enter a new quote or next-step message;
                        the earlier question will not be reused.
                      </small>
                    )}
                  </label>

                  <label className="nf-arr-field wide">
                    <span>Private Admin notes</span>
                    <textarea
                      rows={4}
                      maxLength={10000}
                      value={draft.adminNotes}
                      onChange={(event) =>
                        updateDraft({ adminNotes: event.target.value })
                      }
                      placeholder="Internal notes visible only to authorized Admin users."
                    />
                  </label>

                  <label className="nf-arr-field">
                    <span>Fulfillment charge</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={draft.fulfillmentCharge}
                      onChange={(event) =>
                        updateDraft({
                          fulfillmentCharge: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="nf-arr-preview">
                  <span>
                    Item subtotal: <strong>{money(subtotal)}</strong>
                  </span>
                  <span>
                    Fulfillment:{" "}
                    <strong>
                      {fulfillmentCents === null
                        ? "Invalid"
                        : money(fulfillmentCents)}
                    </strong>
                  </span>
                  <span>
                    Quote total: <strong>{money(quoteTotal)}</strong>
                  </span>
                </div>

                <div className="nf-arr-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={Boolean(busyAction)}
                    onClick={() => runAction("save_notes")}
                  >
                    {busyAction === "save_notes"
                      ? "Saving…"
                      : "Save Private Notes"}
                  </button>

                  {canUnderReview && (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("under_review")}
                    >
                      {busyAction === "under_review"
                        ? "Updating…"
                        : "Move Under Review"}
                    </button>
                  )}

                  {canNeedsInfo && (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("needs_information")}
                    >
                      {busyAction === "needs_information"
                        ? "Sending…"
                        : "Request Information"}
                    </button>
                  )}

                  {canQuote && (
                    <button
                      type="button"
                      className="btn solid"
                      disabled={
                        Boolean(busyAction) || fulfillmentCents === null
                      }
                      onClick={() => runAction("quote")}
                    >
                      {busyAction === "quote"
                        ? "Publishing…"
                        : status === "quoted"
                          ? "Update Quote"
                          : "Publish Quote"}
                    </button>
                  )}

                  {canMarkPaid && (
                    <button
                      type="button"
                      className="btn solid"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("mark_paid")}
                    >
                      {busyAction === "mark_paid"
                        ? "Updating…"
                        : "Mark Paid"}
                    </button>
                  )}

                  {canFulfill && (
                    <button
                      type="button"
                      className="btn solid"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("fulfill")}
                    >
                      {busyAction === "fulfill"
                        ? "Updating…"
                        : "Mark Fulfilled"}
                    </button>
                  )}

                  {canDecline && (
                    <button
                      type="button"
                      className="btn ghost danger"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("decline")}
                    >
                      {busyAction === "decline"
                        ? "Declining…"
                        : "Decline Request"}
                    </button>
                  )}

                  {canCancel && (
                    <button
                      type="button"
                      className="btn ghost danger"
                      disabled={Boolean(busyAction)}
                      onClick={() => runAction("cancel")}
                    >
                      {busyAction === "cancel"
                        ? "Cancelling…"
                        : "Cancel Request"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
