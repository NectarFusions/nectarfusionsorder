import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-abr{display:grid;gap:14px;padding:18px;border:1px solid #D8CBBE;border-radius:18px;background:#fff}
.nf-abr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}
.nf-abr-head h3{margin:0;color:#2B1C13;font-size:20px}
.nf-abr-head p{margin:5px 0 0;color:#71645A;font-size:12px;line-height:1.55}
.nf-abr-note{padding:11px 13px;border-left:4px solid #F7C41C;border-radius:10px;background:#FFF9ED;color:#695126;font-size:11.5px;line-height:1.55}
.nf-abr-msg{padding:11px 13px;border-radius:12px;font-size:13px;line-height:1.55}
.nf-abr-msg.error{border:1px solid #E0A0A0;background:#FFF1F1;color:#8A2929}
.nf-abr-msg.success{border:1px solid #A8D1B3;background:#F1FAF3;color:#315E3D}
.nf-abr-tools{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.nf-abr-filters{display:flex;gap:7px;flex-wrap:wrap}
.nf-abr-filters button{border:1px solid #D8CBBE;border-radius:999px;padding:7px 11px;background:#fff;color:#5F5147;font-size:11px;font-weight:800;cursor:pointer}
.nf-abr-filters button.active{border-color:#167BB6;background:#EAF6FD;color:#173C52}
.nf-abr-badge{display:inline-flex;width:max-content;padding:4px 8px;border-radius:999px;background:#F1F8FC;color:#173C52;font-size:9px;font-weight:900;letter-spacing:.04em;text-transform:uppercase}
.nf-abr-empty{padding:22px 16px;border:1px dashed #CEBFAE;border-radius:14px;background:#FFFCF8;color:#706359;text-align:center;line-height:1.6}
.nf-abr-layout{display:grid;grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);gap:14px;align-items:start}
.nf-abr-list{display:grid;gap:8px;max-height:700px;overflow:auto;padding-right:2px}
.nf-abr-request{width:100%;display:grid;gap:5px;padding:12px;border:1px solid #DDD1C5;border-radius:13px;background:#fff;color:#2B1C13;text-align:left;cursor:pointer}
.nf-abr-request:hover{border-color:#7EB9DC;background:#F5FBFE}
.nf-abr-request.selected{border-color:#167BB6;background:#EAF6FD;box-shadow:0 0 0 2px rgba(36,160,237,.1)}
.nf-abr-request-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.nf-abr-request strong{font-size:12px;overflow-wrap:anywhere}
.nf-abr-request small{color:#74675D;font-size:10px;line-height:1.4}
.nf-abr-detail{min-width:0;display:grid;gap:12px}
.nf-abr-card{padding:16px;border:1px solid #E1D6CA;border-radius:15px;background:linear-gradient(145deg,#fff,#FCF8F2)}
.nf-abr-card h4{margin:0;color:#2B1C13;font-size:17px}
.nf-abr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}
.nf-abr-grid div{padding:10px;border-radius:11px;background:#F1F8FC}
.nf-abr-grid span{display:block;color:#607C8D;font-size:8.5px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-abr-grid strong{display:block;margin-top:4px;color:#173C52;font-size:12px;overflow-wrap:anywhere}
.nf-abr-copy{margin-top:10px;padding:10px 11px;border-radius:10px;background:#FBF7F1;color:#5E4D40;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
.nf-abr-copy.partner{background:#F1F8FC;color:#173C52}
.nf-abr-table-wrap{overflow:auto;border:1px solid #E2D7CB;border-radius:13px}
.nf-abr-table{width:100%;border-collapse:collapse;min-width:650px}
.nf-abr-table th,.nf-abr-table td{padding:10px;border-bottom:1px solid #E8DED3;text-align:left;font-size:11px}
.nf-abr-table th{background:#FBF7F1;color:#654B1B;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-abr-table td{color:#4F443B}
.nf-abr-table tr:last-child td{border-bottom:0}
.nf-abr-money{text-align:right!important;white-space:nowrap}
.nf-abr-editor{padding:15px;border:1px solid #D9CDBC;border-radius:15px;background:#FFFCF8}
.nf-abr-editor h4{margin:0;color:#2B1C13;font-size:16px}
.nf-abr-help{margin:5px 0 0;color:#74675D;font-size:11px;line-height:1.55}
.nf-abr-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}
.nf-abr-field{display:grid;gap:6px}
.nf-abr-field.wide{grid-column:1/-1}
.nf-abr-field span{color:#654B1B;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
.nf-abr-field input,.nf-abr-field textarea{width:100%;box-sizing:border-box}
.nf-abr-field textarea{resize:vertical}
.nf-abr-preview{display:flex;justify-content:flex-end;gap:16px;flex-wrap:wrap;margin-top:11px;padding:10px 12px;border-radius:11px;background:#F1F8FC;color:#173C52;font-size:12px}
.nf-abr-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:12px}
.nf-abr-actions .btn{padding:9px 12px}
.nf-abr-actions .danger{border-color:#C67777;color:#8A2929}
@media(max-width:900px){.nf-abr-layout{grid-template-columns:1fr}.nf-abr-list{max-height:280px}}
@media(max-width:640px){.nf-abr-head,.nf-abr-tools{align-items:stretch;flex-direction:column}.nf-abr-grid,.nf-abr-fields{grid-template-columns:1fr}.nf-abr-field.wide{grid-column:auto}}
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

const draftFrom = (request) => {
  const payAtFulfillment = ["pickup", "delivery"].includes(
    request?.fulfillment_method
  );

  return {
    partnerResponse: requiresFreshPartnerResponse(request)
      ? ""
      : request?.partner_response || "",
    adminNotes: request?.admin_notes || "",
    customItemCharge:
      request?.custom_item_charge_cents === null ||
      request?.custom_item_charge_cents === undefined
        ? "0.00"
        : (Number(request.custom_item_charge_cents || 0) / 100).toFixed(2),
    fulfillmentCharge: payAtFulfillment
      ? "0.00"
      : request?.fulfillment_charge_cents === null ||
          request?.fulfillment_charge_cents === undefined
        ? "0.00"
        : (Number(request.fulfillment_charge_cents || 0) / 100).toFixed(2),
  };
};

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

export default function AdminPartnerBulkOrderPanel({
  partner,
  onRequestsChanged,
}) {
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("active");
  const [draft, setDraft] = useState(draftFrom(null));
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [labelBusyPath, setLabelBusyPath] = useState("");
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
        const rows = await api.getAdminPartnerBulkOrderHistory(
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

  const payAtFulfillment = ["pickup", "delivery"].includes(
    selected?.fulfillment_method
  );

  const fulfillmentCents = useMemo(() => {
    if (payAtFulfillment) return 0;
    const value = Number(draft.fulfillmentCharge);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }, [draft.fulfillmentCharge, payAtFulfillment]);

  const customItemCents = useMemo(() => {
    const value = Number(draft.customItemCharge);
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }, [draft.customItemCharge]);

  const subtotal = selected ? itemSubtotal(selected) : 0;
  const productQuoteSubtotal =
    customItemCents === null ? subtotal : subtotal + customItemCents;
  const quoteTotal =
    fulfillmentCents === null
      ? productQuoteSubtotal
      : productQuoteSubtotal + fulfillmentCents;

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

    if (action === "quote" && customItemCents === null) {
      setError(
        "Enter a gift set/custom item charge of $0.00 or more before publishing the quote."
      );
      return;
    }

    if (action === "quote" && fulfillmentCents === null) {
      setError(
        "Enter a shipping/fulfillment charge of $0.00 or more before publishing the quote."
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
      await api.adminPartnerBulkOrderAction(selected.id, action, {
        partnerResponse,
        adminNotes,
        fulfillmentChargeCents:
          action === "quote" ? fulfillmentCents : null,
        customItemChargeCents:
          action === "quote" ? customItemCents : null,
      });
      await loadRequests();
      setNotice(notices[action] || "Bulk order request updated.");
    } catch (actionError) {
      setError(
        `${actionError.message} Review the request status and required fields before trying again.`
      );
    } finally {
      setBusyAction("");
    }
  };

  const openLabelExample = async (example) => {
    const path = String(example?.storage_path || "").trim();
    if (!path || labelBusyPath) return;

    const previewWindow = window.open("", "_blank");
    setLabelBusyPath(path);
    setError("");
    try {
      const url = await api.getPartnerLabelExampleSignedUrl(path);
      if (previewWindow) {
        previewWindow.location = url;
      } else {
        window.location.assign(url);
      }
    } catch (openError) {
      previewWindow?.close();
      setError(openError.message);
    } finally {
      setLabelBusyPath("");
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
    <div className="nf-abr">
      <style>{CSS}</style>

      <div className="nf-abr-head">
        <div>
          <h3>Foodservice & Bulk Requests</h3>
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

      <div className="nf-abr-note">
        Bulk container pricing is isolated from retail inventory and Square.
        Gift sets are unpriced until you enter a custom-item amount here.
        Market pickup is paid at the market table, and delivery fees stay
        outside the product quote because they are charged at drop-off.
      </div>

      {error && (
        <div className="nf-abr-msg error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="nf-abr-msg success" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      <div className="nf-abr-tools">
        <div className="nf-abr-filters" aria-label="Request filter">
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

        <span className="nf-abr-badge">
          {requests.length} total request{requests.length === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="nf-abr-empty">Loading bulk order requests…</div>
      ) : requests.length === 0 ? (
        <div className="nf-abr-empty">
          This partner has not submitted a bulk order request.
        </div>
      ) : (
        <div className="nf-abr-layout">
          <div className="nf-abr-list">
            {visibleRequests.length === 0 ? (
              <div className="nf-abr-empty">
                No requests match this filter.
              </div>
            ) : (
              visibleRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  className={`nf-abr-request ${
                    selectedId === request.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedId(request.id)}
                >
                  <div className="nf-abr-request-top">
                    <strong>{request.id}</strong>
                    <span className="nf-abr-badge">
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
            <div className="nf-abr-empty">
              Select a request to review it.
            </div>
          ) : (
            <div className="nf-abr-detail">
              <div className="nf-abr-card">
                <h4>{selected.id}</h4>

                <div className="nf-abr-grid">
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
                  <div className="nf-abr-copy">
                    <strong>Preferred days:</strong>{" "}
                    {selected.preferred_delivery_days.map(label).join(", ")}
                  </div>
                )}

                {selected.fulfillment_method === "pickup" &&
                  selected.pickup_market_name && (
                    <div className="nf-abr-copy">
                      <strong>Market pickup:</strong>{" "}
                      {selected.pickup_market_name} ·{" "}
                      {dateOnly(selected.pickup_market_day)}
                      {selected.pickup_market_where_at
                        ? ` · ${selected.pickup_market_where_at}`
                        : ""}
                      {selected.pickup_market_hours
                        ? ` · ${selected.pickup_market_hours}`
                        : ""}
                      <br />
                      <strong>Payment:</strong> Pay at the market table.
                    </div>
                  )}

                {selected.fulfillment_method === "delivery" && (
                  <div className="nf-abr-copy">
                    <strong>Delivery fee:</strong> Not included in the product
                    quote. Charge separately at drop-off.
                  </div>
                )}

                {selected.request_notes && (
                  <div className="nf-abr-copy">
                    <strong>Partner request notes:</strong>
                    <br />
                    {selected.request_notes}
                  </div>
                )}

                {selected.partner_reply && (
                  <div className="nf-abr-copy partner">
                    <strong>Partner reply:</strong>
                    <br />
                    {selected.partner_reply}
                  </div>
                )}
              </div>

              <div className="nf-abr-table-wrap">
                <table className="nf-abr-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Container</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                      <th>Item note</th>
                      <th className="nf-abr-money">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selected.items || []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>
                            {item.honey_type === "natural"
                              ? "Natural Honey"
                              : `${item.flavor_name || "Infused"} Infused Honey`}
                          </strong>
                        </td>
                        <td>{item.size_label || label(item.size_id)}</td>
                        <td>{item.quantity}</td>
                        <td>{money(item.unit_price_cents)}</td>
                        <td>{item.notes || "—"}</td>
                        <td className="nf-abr-money">
                          {money(item.line_total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {Array.isArray(selected.gift_sets) &&
                selected.gift_sets.length > 0 && (
                  <div className="nf-abr-card">
                    <h4>Small Gift Set Request</h4>
                    <p className="nf-abr-help">
                      A NectarFusions administrator will provide gift set pricing after review. Enter
                      the combined gift set/custom item amount in the quote
                      editor below.
                    </p>
                    {(selected.gift_sets || []).map((gift, index) => (
                      <div
                        className="nf-abr-copy"
                        key={`admin-gift-${selected.id}-${index}`}
                      >
                        <strong>{gift.type || "Small gift set"}</strong>
                        <br />
                        Quantity: {gift.quantity}
                        <br />
                        Flavors:{" "}
                        {(gift.flavor_names || []).join(", ") ||
                          "Not specified"}
                        {gift.lid_color ? (
                          <>
                            <br />
                            <strong>Requested lid / top color:</strong>{" "}
                            {gift.lid_color}
                          </>
                        ) : null}
                        {gift.custom_details ? (
                          <>
                            <br />
                            <strong>Custom details / notes:</strong>
                            <br />
                            {gift.custom_details}
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

              {selected.custom_labels_requested && (
                <div className="nf-abr-card">
                  <h4>Custom Label Request</h4>
                  <p className="nf-abr-help">
                    Label examples are stored privately. Open a temporary
                    Admin-only view link below.
                  </p>
                  {selected.custom_label_notes && (
                    <div className="nf-abr-copy">
                      <strong>Partner label details:</strong>
                      <br />
                      {selected.custom_label_notes}
                    </div>
                  )}
                  {Array.isArray(selected.label_examples) &&
                  selected.label_examples.length > 0 ? (
                    <div
                      className="nf-abr-actions"
                      style={{ justifyContent: "flex-start" }}
                    >
                      {selected.label_examples.map((example) => (
                        <button
                          key={example.storage_path}
                          type="button"
                          className="btn ghost"
                          disabled={Boolean(labelBusyPath)}
                          onClick={() => openLabelExample(example)}
                        >
                          {labelBusyPath === example.storage_path
                            ? "Opening…"
                            : `Open ${example.file_name || "label example"}`}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="nf-abr-copy">No example files uploaded.</div>
                  )}
                </div>
              )}

              <div className="nf-abr-editor">
                <h4>Admin Review and Response</h4>
                <p className="nf-abr-help">
                  Partner-visible responses appear in Request History.
                  Private Admin notes never appear in the Partner Portal.
                </p>

                <div className="nf-abr-fields">
                  <label className="nf-abr-field wide">
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

                  <label className="nf-abr-field wide">
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

                  <label className="nf-abr-field">
                    <span>Gift set / custom item charge</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={draft.customItemCharge}
                      onChange={(event) =>
                        updateDraft({
                          customItemCharge: event.target.value,
                        })
                      }
                    />
                    <small>
                      Enter $0.00 when no unpriced gift sets or custom items are
                      included.
                    </small>
                  </label>

                  <label className="nf-abr-field">
                    <span>
                      {selected.fulfillment_method === "shipping"
                        ? "Shipping charge"
                        : "Fulfillment charge"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={payAtFulfillment ? "0.00" : draft.fulfillmentCharge}
                      disabled={payAtFulfillment}
                      onChange={(event) =>
                        updateDraft({
                          fulfillmentCharge: event.target.value,
                        })
                      }
                    />
                    {selected.fulfillment_method === "delivery" && (
                      <small>
                        Delivery fee is excluded from the quote and charged at
                        drop-off.
                      </small>
                    )}
                    {selected.fulfillment_method === "pickup" && (
                      <small>
                        Market pickup has no quoted fulfillment charge. Payment
                        is collected at the market table.
                      </small>
                    )}
                  </label>
                </div>

                <div className="nf-abr-preview">
                  <span>
                    Bulk subtotal: <strong>{money(subtotal)}</strong>
                  </span>
                  <span>
                    Gift/custom:{" "}
                    <strong>
                      {customItemCents === null
                        ? "Invalid"
                        : money(customItemCents)}
                    </strong>
                  </span>
                  <span>
                    {selected.fulfillment_method === "shipping"
                      ? "Shipping"
                      : "Fulfillment"}
                    :{" "}
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

                <div className="nf-abr-actions">
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
                        Boolean(busyAction) ||
                        fulfillmentCents === null ||
                        customItemCents === null
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
