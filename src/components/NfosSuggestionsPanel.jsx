import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const fmtDate = (value) => value ? new Date(value).toLocaleDateString() : "—";
const show = (value) => value == null || value === "" ? "—" : String(value);

const changeRows = (current = {}, proposed = {}) => {
  const rows = [];
  const defs = [
    ["planned_quantity", "Planned quantity"],
    ["due_date", "Due date"],
    ["priority", "Priority"],
    ["notes", "Notes"],
  ];
  defs.forEach(([key, label]) => {
    const before = current?.[key] ?? "";
    const after = proposed?.[key] ?? "";
    if (String(before ?? "") !== String(after ?? "")) {
      rows.push({ key, label, before: show(before), after: show(after) });
    }
  });
  return rows;
};

export default function NfosSuggestionsPanel({ notify }) {
  const [data, setData] = useState({ orders: [], requests: [] });
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState({
    plannedQuantity: "",
    dueDate: "",
    priority: "normal",
    notes: "",
    reason: "",
  });
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (data.orders || []).find((row) => row.id === selectedId) || null,
    [data.orders, selectedId]
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await nfos.getEmployeeSuggestionWorkspace();
      setData(result || { orders: [], requests: [] });
      setSelectedId((current) => {
        const rows = result?.orders || [];
        return rows.some((row) => row.id === current) ? current : rows[0]?.id || "";
      });
    } catch (err) {
      notify("error", err?.message || "Could not load suggested edits.");
    } finally {
      setBusy(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      plannedQuantity: selected.planned_quantity == null ? "" : String(selected.planned_quantity),
      dueDate: selected.due_date || "",
      priority: selected.priority || "normal",
      notes: selected.notes || "",
      reason: "",
    });
  }, [selected?.id, selected?.updated_at]);

  const changed = useMemo(() => {
    if (!selected) return false;
    return (
      Number(form.plannedQuantity || 0) !== Number(selected.planned_quantity || 0) ||
      String(form.dueDate || "") !== String(selected.due_date || "") ||
      String(form.priority || "") !== String(selected.priority || "") ||
      String(form.notes || "") !== String(selected.notes || "")
    );
  }, [selected, form.plannedQuantity, form.dueDate, form.priority, form.notes]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    if (!changed) {
      notify("error", "Change at least one planning field before submitting a suggestion.");
      return;
    }

    setBusy(true);
    try {
      const result = await nfos.employeeSubmitProductionEditSuggestion({
        productionOrderId: selected.id,
        plannedQuantity: form.plannedQuantity,
        dueDate: form.dueDate,
        priority: form.priority,
        notes: form.notes,
        reason: form.reason,
      });
      notify("success", `${result.request_no} sent to admin for approval.`);
      await load();
    } catch (err) {
      notify("error", err?.message || "Could not submit suggested edit.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <div className="nfos-card">
      <div className="nfos-page-head">
        <div>
          <h2>Suggest production edits</h2>
          <p>Every NFOS team role can propose changes. Suggestions never change the production queue until an admin approves them.</p>
        </div>
        <button className="nfos-btn secondary" type="button" onClick={load} disabled={busy}>Refresh</button>
      </div>

      {(data.orders || []).length ? (
        <form className="nfos-form" onSubmit={submit}>
          <div className="nfos-field full">
            <label>Production order</label>
            <select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {(data.orders || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.order_no} — {row.flavor_name || row.recipe_name} — {row.assigned_member_name ? `Assigned to ${row.assigned_member_name}` : "Unassigned"}
                </option>
              ))}
            </select>
          </div>

          {selected && <div className="nfos-note full">
            <strong>{selected.order_no}</strong> · {selected.recipe_name} · {selected.planned_texture === "spun" ? "Spun" : "Regular"}
            {selected.assigned_member_name ? ` · Assigned to ${selected.assigned_member_name}` : ""}
            <br />
            Only planning information can be suggested here. Starting production remains restricted to the assigned production operator.
          </div>}

          <div className="nfos-field">
            <label>Suggested planned quantity</label>
            <input required type="number" min="0.0001" step="any" value={form.plannedQuantity} onChange={(event) => setForm({ ...form, plannedQuantity: event.target.value })} />
          </div>
          <div className="nfos-field">
            <label>Unit</label>
            <input disabled value={selected?.planned_unit || "—"} />
          </div>
          <div className="nfos-field">
            <label>Suggested due date</label>
            <input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
          </div>
          <div className="nfos-field">
            <label>Suggested priority</label>
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="nfos-field full">
            <label>Suggested notes</label>
            <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </div>
          <div className="nfos-field full">
            <label>Why should this be changed?</label>
            <textarea required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain what you noticed and why you recommend the change." />
          </div>
          <div className="nfos-field full">
            <button className="nfos-btn" disabled={busy || !changed}>{busy ? "Sending…" : "Send suggestion for approval"}</button>
          </div>
        </form>
      ) : (
        <div className="nfos-empty">There are no unstarted production orders available for suggested edits.</div>
      )}
    </div>

    <div className="nfos-card">
      <h2>My suggestions</h2>
      {(data.requests || []).length ? (
        <div className="nfos-table-wrap">
          <table className="nfos-table">
            <thead><tr><th>Request</th><th>Order</th><th>Suggested changes</th><th>Reason</th><th>Status</th><th>Submitted</th></tr></thead>
            <tbody>{data.requests.map((row) => {
              const changes = changeRows(row.current_snapshot, row.proposed_changes);
              return <tr key={row.id}>
                <td className="nfos-mono">{row.request_no}</td>
                <td><strong>{row.order_no || "Production order"}</strong><div className="nfos-muted nfos-small">{row.flavor_name || row.recipe_name || ""}</div></td>
                <td>{changes.length ? changes.map((change) => <div key={change.key} className="nfos-suggestion-change"><strong>{change.label}:</strong> {change.before} → {change.after}</div>) : "—"}</td>
                <td>{row.reason || "—"}{row.review_notes && <div className="nfos-muted nfos-small">Admin: {row.review_notes}</div>}</td>
                <td><span className={`nfos-pill ${row.status === "approved" ? "ok" : row.status === "rejected" ? "off" : "low"}`}>{row.status}</span></td>
                <td>{fmtDate(row.created_at)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      ) : <div className="nfos-empty">You have not submitted any edit suggestions yet.</div>}
    </div>
  </>;
}
