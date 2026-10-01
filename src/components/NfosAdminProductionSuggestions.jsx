import { useCallback, useEffect, useState } from "react";
import * as nfos from "../lib/nfosApi";

const show = (value) => value == null || value === "" ? "—" : String(value);

const differences = (request) => {
  const current = request?.current_snapshot || {};
  const proposed = request?.proposed_changes || {};
  const defs = [
    ["planned_quantity", "Planned quantity"],
    ["due_date", "Due date"],
    ["priority", "Priority"],
    ["notes", "Notes"],
  ];

  return defs
    .filter(([key]) => String(current?.[key] ?? "") !== String(proposed?.[key] ?? ""))
    .map(([key, label]) => ({
      key,
      label,
      before: show(current?.[key]),
      after: show(proposed?.[key]),
    }));
};

export default function NfosAdminProductionSuggestions({ onChanged }) {
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await nfos.getAdminSuggestionWorkspace();
      setRequests(data?.requests || []);
    } catch (err) {
      setError(err?.message || "Could not load suggested edits.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const review = async (request, action) => {
    let note = "";
    if (action === "approve") {
      const ok = window.confirm(
        `Approve ${request.request_no} for ${request.order_no}?\n\nThe approved planning fields will be applied to the production order.`
      );
      if (!ok) return;
    } else {
      const response = window.prompt("Optional rejection note for the team member:", "");
      if (response === null) return;
      note = response;
    }

    setBusyId(request.id);
    setError("");
    setMessage("");
    try {
      const result = await nfos.adminReviewProductionEditSuggestion(request.id, action, note);
      setMessage(`${result.request_no} ${action === "approve" ? "approved and applied" : "rejected"}.`);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err?.message || "Could not review the suggested edit.");
    } finally {
      setBusyId("");
    }
  };

  const pending = requests.filter((row) => row.status === "pending");
  const reviewed = requests.filter((row) => row.status !== "pending").slice(0, 10);

  return <div className="nfos-card nfos-suggestion-review-card">
    <div className="nfos-split-head">
      <div>
        <h2>Suggested edits</h2>
        <p className="nfos-muted">Team suggestions do not change production until you approve them. NFOS blocks approval if the order has started or changed since the suggestion was submitted.</p>
      </div>
      <button className="nfos-btn secondary" type="button" onClick={load}>Refresh</button>
    </div>

    {error && <div className="nfos-error">{error}</div>}
    {message && <div className="nfos-success">{message}</div>}

    {pending.length ? <div className="nfos-table-wrap" style={{ marginTop: 12 }}>
      <table className="nfos-table">
        <thead><tr><th>Request</th><th>From</th><th>Order</th><th>Suggested changes</th><th>Reason</th><th>Review</th></tr></thead>
        <tbody>{pending.map((request) => {
          const changes = differences(request);
          return <tr key={request.id}>
            <td className="nfos-mono">{request.request_no}</td>
            <td>{request.requested_by_name}</td>
            <td><strong>{request.order_no || "Deleted order"}</strong><div className="nfos-muted nfos-small">{request.flavor_name || request.recipe_name || ""}</div></td>
            <td>{changes.map((change) => <div className="nfos-suggestion-change" key={change.key}><strong>{change.label}:</strong> {change.before} → {change.after}</div>)}</td>
            <td>{request.reason || "—"}</td>
            <td><div className="nfos-inline-actions">
              <button className="nfos-btn" type="button" disabled={busyId === request.id} onClick={() => review(request, "approve")}>Approve</button>
              <button className="nfos-btn ghost" type="button" disabled={busyId === request.id} onClick={() => review(request, "reject")}>Reject</button>
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <div className="nfos-empty" style={{ marginTop: 12 }}>No suggested edits are waiting for approval.</div>}

    {reviewed.length > 0 && <details className="nfos-suggestion-history">
      <summary>Recently reviewed suggestions</summary>
      <div className="nfos-table-wrap" style={{ marginTop: 10 }}>
        <table className="nfos-table">
          <thead><tr><th>Request</th><th>From</th><th>Order</th><th>Status</th><th>Admin note</th></tr></thead>
          <tbody>{reviewed.map((request) => <tr key={request.id}>
            <td className="nfos-mono">{request.request_no}</td>
            <td>{request.requested_by_name}</td>
            <td>{request.order_no || "—"}</td>
            <td><span className={`nfos-pill ${request.status === "approved" ? "ok" : "off"}`}>{request.status}</span></td>
            <td>{request.review_notes || "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>}
  </div>;
}
