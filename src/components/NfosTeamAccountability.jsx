import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const ROLES = [
  ["owner", "Owner"],
  ["operations_manager", "Operations Manager"],
  ["production_operator", "Production Operator"],
  ["inventory_operator", "Inventory Operator"],
  ["purchasing_operator", "Purchasing Operator"],
  ["viewer", "Viewer"],
];

const roleLabel = (value) => ROLES.find(([key]) => key === value)?.[1] || value || "—";
const assignableRoles = ROLES.filter(([key]) => key !== "owner");
const memberRoles = (member) => Array.isArray(member?.roles) && member.roles.length ? member.roles : [member?.role].filter(Boolean);
const roleLabels = (roles, fallback) => {
  const values = Array.isArray(roles) && roles.length ? roles : [fallback].filter(Boolean);
  return values.map(roleLabel).join(" + ") || "—";
};

function RoleChoices({ value = [], onChange, disabled = false }) {
  const selected = new Set(value);
  return <div className="nfos-inline-actions" style={{ flexWrap: "wrap", alignItems: "center" }}>
    {assignableRoles.map(([key, label]) => <label key={key} className="nfos-small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        type="checkbox"
        checked={selected.has(key)}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.checked
            ? [...value, key]
            : value.filter((role) => role !== key);
          onChange(next);
        }}
      />
      {label}
    </label>)}
  </div>;
}
const fmtDate = (value) => {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : raw;
};
const fmtDateTime = (value) => value ? new Date(value).toLocaleString() : "—";

function Empty({ children = "Nothing to show yet." }) {
  return <div className="nfos-empty">{children}</div>;
}

function StatusPill({ value }) {
  const text = String(value || "open").replaceAll("_", " ");
  const danger = ["critical", "overdue"].includes(value);
  const ok = ["done", "released", "ready"].includes(value);
  return <span className={`nfos-pill ${danger ? "low" : ok ? "ok" : ""}`}>{text}</span>;
}

function MemberSelect({ members, value, onChange, includeBlank = true }) {
  return <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
    {includeBlank && <option value="">Unassigned</option>}
    {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.display_name} — {roleLabels(m.roles, m.role)}</option>)}
  </select>;
}

function ActionAssignmentRow({ action, members, onChanged }) {
  const [memberId, setMemberId] = useState(action.assigned_member_id || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setMemberId(action.assigned_member_id || ""), [action.assigned_member_id]);

  const save = async () => {
    setBusy(true);
    try {
      if (memberId) await nfos.assignAction(action.action_key, memberId);
      else await nfos.unassignAction(action.action_key);
      await onChanged();
    } finally { setBusy(false); }
  };

  return <tr>
    <td><strong>{action.title}</strong><div className="nfos-muted nfos-small">{action.detail}</div></td>
    <td>{fmtDate(action.action_date)}</td>
    <td><StatusPill value={action.priority} /></td>
    <td><MemberSelect members={members} value={memberId} onChange={setMemberId} /></td>
    <td><button className="nfos-btn ghost" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></td>
  </tr>;
}

function ProductionAssignmentRow({ order, members, recipeName, onChanged }) {
  const [memberId, setMemberId] = useState(order.assigned_member_id || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setMemberId(order.assigned_member_id || ""), [order.assigned_member_id]);

  const save = async () => {
    if (!memberId) return;
    setBusy(true);
    try {
      await nfos.assignProductionOrder(order.id, memberId);
      await onChanged();
    } finally { setBusy(false); }
  };

  return <tr>
    <td><strong>{order.order_no}</strong><div className="nfos-muted nfos-small">{recipeName || "Production"} · {order.planned_quantity} {order.planned_unit} · {order.planned_texture}</div></td>
    <td>{fmtDate(order.due_date)}</td>
    <td><StatusPill value={order.status} /></td>
    <td><MemberSelect members={members} value={memberId} onChange={setMemberId} /></td>
    <td><button className="nfos-btn ghost" type="button" disabled={!memberId || busy} onClick={save}>{busy ? "Saving…" : "Assign"}</button></td>
  </tr>;
}

export default function NfosTeamAccountability() {
  const [members, setMembers] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [myWork, setMyWork] = useState([]);
  const [actions, setActions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviteBusy, setInviteBusy] = useState("");
  const [deleteBusy, setDeleteBusy] = useState("");
  const [roleEditId, setRoleEditId] = useState("");
  const [roleDraft, setRoleDraft] = useState([]);
  const [roleBusy, setRoleBusy] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [memberRows, workloadRows, mineRows, actionRows, taskRows, activityRows, orderRows, recipeRows, locationRows] = await Promise.all([
        nfos.listTeamMembers(), nfos.listTeamWorkload(), nfos.listMyWorkToday(), nfos.listAssignedActions(),
        nfos.listWorkItems(), nfos.listTeamActivity(), nfos.listOpenProductionOrdersForTeam(), nfos.listRecipes(), nfos.listLocations(),
      ]);
      setMembers(memberRows || []); setWorkload(workloadRows || []); setMyWork(mineRows || []); setActions(actionRows || []);
      setTasks(taskRows || []); setActivity(activityRows || []); setProductionOrders(orderRows || []); setRecipes(recipeRows || []); setLocations(locationRows || []);
    } catch (err) { setError(err?.message || "Could not load NFOS team operations."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [memberForm, setMemberForm] = useState({ displayName:"", email:"", roles:["production_operator"], defaultLocationId:"", notes:"" });
  const createMember = async (e) => {
    e.preventDefault(); setError(""); setMessage("");
    try {
      await nfos.createTeamMember(memberForm);
      setMemberForm({ displayName:"", email:"", roles:["production_operator"], defaultLocationId:"", notes:"" });
      setMessage("Team profile created. Use Send invite in the directory when you are ready to give this person an individual NFOS login.");
      await load();
    } catch (err) { setError(err?.message || "Could not create team member."); }
  };

  const inviteMember = async (member) => {
    setError(""); setMessage(""); setInviteBusy(member.id);
    try {
      const result = await nfos.inviteTeamMember(member.id);
      setMessage(result?.message || `Invitation sent to ${member.email}.`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not send the employee invitation.");
    } finally { setInviteBusy(""); }
  };

  const deleteMember = async (member) => {
    const confirmed = window.confirm(
      `Delete ${member.display_name} from NFOS?\n\nThis removes their NFOS login access and unassigns active work. Historical activity will be preserved.`
    );
    if (!confirmed) return;

    setError(""); setMessage(""); setDeleteBusy(member.id);
    try {
      const result = await nfos.deleteTeamMember(member.id);
      setMessage(result?.message || `${member.display_name} was deleted from NFOS.`);
      await load();
    } catch (err) {
      setError(err?.message || "Could not delete the team member.");
    } finally { setDeleteBusy(""); }
  };


  const startRoleEdit = (member) => {
    setError("");
    setMessage("");
    setRoleEditId(member.id);
    setRoleDraft(memberRoles(member).filter((role) => role !== "owner"));
  };

  const saveMemberRoles = async (member) => {
    if (!roleDraft.length) {
      setError("Select at least one role.");
      return;
    }

    setError(""); setMessage(""); setRoleBusy(member.id);
    try {
      const result = await nfos.setTeamMemberRoles(member.id, roleDraft);
      setMessage(`${member.display_name} roles updated to ${roleLabels(result?.roles || roleDraft)}.`);
      setRoleEditId("");
      setRoleDraft([]);
      await load();
    } catch (err) {
      setError(err?.message || "Could not update team roles.");
    } finally { setRoleBusy(""); }
  };

  const [taskForm, setTaskForm] = useState({ title:"", detail:"", category:"general", priority:"normal", dueDate:"", assignedMemberId:"", notes:"" });
  const createTask = async (e) => {
    e.preventDefault(); setError(""); setMessage("");
    try {
      await nfos.createWorkItem(taskForm);
      setTaskForm({ title:"", detail:"", category:"general", priority:"normal", dueDate:"", assignedMemberId:"", notes:"" });
      setMessage("Work item created.");
      await load();
    } catch (err) { setError(err?.message || "Could not create work item."); }
  };

  const recipeMap = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r.name])), [recipes]);
  const activeMembers = members.filter((m) => m.active);
  const unassignedActions = actions.filter((a) => !a.assigned_member_id).length;
  const openTasks = tasks.filter((t) => ["open", "in_progress"].includes(t.status)).length;

  const setTaskStatus = async (id, status) => {
    setError("");
    try { await nfos.setWorkItemStatus(id, status); await load(); }
    catch (err) { setError(err?.message || "Could not update task."); }
  };

  return <>
    {error && <div className="nfos-error">{error}</div>}
    {message && <div className="nfos-success">{message}</div>}

    <div className="nfos-grid four" style={{ marginBottom: 16 }}>
      <div className="nfos-stat"><div className="nfos-stat-label">Active team</div><div className="nfos-stat-value">{activeMembers.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">My work</div><div className="nfos-stat-value">{myWork.length}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Unassigned actions</div><div className="nfos-stat-value">{unassignedActions}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Manual tasks open</div><div className="nfos-stat-value">{openTasks}</div></div>
    </div>

    <div className="nfos-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div><h2>My Work Today</h2><p>Assigned NFOS actions, manual work items and production orders for the signed-in team member.</p></div>
        <button className="nfos-btn secondary" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
      </div>
      {!myWork.length ? <Empty>No work is assigned to your profile right now.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Work</th><th>Due</th><th>Priority</th><th>Status</th><th>Area</th></tr></thead><tbody>{myWork.map((w) => <tr key={w.work_key}><td><strong>{w.title}</strong><div className="nfos-muted nfos-small">{w.detail}</div></td><td>{fmtDate(w.due_date)}</td><td><StatusPill value={w.priority} /></td><td><StatusPill value={w.status} /></td><td>{w.route}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="nfos-grid two nfos-team-grid">
      <div className="nfos-card">
        <h2>Team workload</h2><p className="nfos-muted">Open work currently assigned across NFOS.</p>
        {!workload.length ? <Empty>No active team profiles.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Team member</th><th>Role</th><th>Actions</th><th>Tasks</th><th>Production</th><th>Total</th></tr></thead><tbody>{workload.map((w) => <tr key={w.member_id}><td><strong>{w.display_name}</strong></td><td>{roleLabels(w.roles, w.role)}</td><td>{w.assigned_actions}</td><td>{w.manual_tasks}</td><td>{w.production_orders}</td><td><strong>{w.total_open_work}</strong></td></tr>)}</tbody></table></div>}
      </div>

      <div className="nfos-card">
        <h2>Add team profile</h2><p className="nfos-muted">This creates an operational profile for assignments. It does not create a login yet.</p>
        <form className="nfos-form" onSubmit={createMember}>
          <div className="nfos-field full"><label>Name</label><input required value={memberForm.displayName} onChange={(e) => setMemberForm({ ...memberForm, displayName:e.target.value })} /></div>
          <div className="nfos-field full"><label>Email</label><input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email:e.target.value })} /></div>
          <div className="nfos-field full"><label>Roles</label><RoleChoices value={memberForm.roles} onChange={(roles) => setMemberForm({ ...memberForm, roles })} /><div className="nfos-muted nfos-small">Choose one or more. Permissions are combined across all selected roles.</div></div>
          <div className="nfos-field"><label>Default location</label><select value={memberForm.defaultLocationId} onChange={(e) => setMemberForm({ ...memberForm, defaultLocationId:e.target.value })}><option value="">None</option>{locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="nfos-field full"><label>Notes</label><textarea value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes:e.target.value })} /></div>
          <div className="nfos-field full"><button className="nfos-btn">Create team profile</button></div>
        </form>
      </div>
    </div>

    <div className="nfos-card">
      <h2>Live NFOS action assignments</h2><p className="nfos-muted">Assign the dynamic Today queue. When the underlying issue is resolved, the action disappears automatically.</p>
      {!actions.length ? <Empty>No live actions need assignment.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table nfos-team-mobile-table nfos-team-actions-table"><thead><tr><th>Action</th><th>Date</th><th>Priority</th><th>Assigned to</th><th>Save</th></tr></thead><tbody>{actions.map((a) => <ActionAssignmentRow key={a.action_key} action={a} members={members} onChanged={load} />)}</tbody></table></div>}
    </div>

    <div className="nfos-card">
      <h2>Production assignments</h2><p className="nfos-muted">Assign planned or in-progress production orders to a team profile.</p>
      {!productionOrders.length ? <Empty>No open production orders.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Order</th><th>Due</th><th>Status</th><th>Assigned to</th><th></th></tr></thead><tbody>{productionOrders.map((o) => <ProductionAssignmentRow key={o.id} order={o} members={members} recipeName={recipeMap[o.recipe_id]} onChanged={load} />)}</tbody></table></div>}
    </div>

    <div className="nfos-grid two nfos-team-grid">
      <div className="nfos-card">
        <h2>Create manual work item</h2>
        <form className="nfos-form" onSubmit={createTask}>
          <div className="nfos-field full"><label>Task</label><input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title:e.target.value })} /></div>
          <div className="nfos-field full"><label>Details</label><textarea value={taskForm.detail} onChange={(e) => setTaskForm({ ...taskForm, detail:e.target.value })} /></div>
          <div className="nfos-field"><label>Category</label><select value={taskForm.category} onChange={(e) => setTaskForm({ ...taskForm, category:e.target.value })}><option value="general">General</option><option value="production">Production</option><option value="inventory">Inventory</option><option value="purchasing">Purchasing</option><option value="quality">Quality</option></select></div>
          <div className="nfos-field"><label>Priority</label><select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority:e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div className="nfos-field"><label>Due date</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate:e.target.value })} /></div>
          <div className="nfos-field"><label>Assigned to</label><MemberSelect members={members} value={taskForm.assignedMemberId} onChange={(value) => setTaskForm({ ...taskForm, assignedMemberId:value })} /></div>
          <div className="nfos-field full"><button className="nfos-btn">Create work item</button></div>
        </form>
      </div>

      <div className="nfos-card">
        <h2>Open manual work</h2>
        {!openTasks ? <Empty>No manual tasks are open.</Empty> : <div className="nfos-task-stack">{tasks.filter((t) => ["open","in_progress"].includes(t.status)).map((t) => {
          const person = members.find((m) => m.id === t.assigned_member_id);
          return <div className="nfos-task-card" key={t.id}><div><strong>{t.title}</strong><div className="nfos-muted nfos-small">{t.detail || ""}</div><div className="nfos-muted nfos-small">{person?.display_name || "Unassigned"} · Due {fmtDate(t.due_date)}</div></div><div className="nfos-inline-actions"><StatusPill value={t.priority} />{t.status === "open" && <button className="nfos-btn ghost" type="button" onClick={() => setTaskStatus(t.id,"in_progress")}>Start</button>}<button className="nfos-btn secondary" type="button" onClick={() => setTaskStatus(t.id,"done")}>Done</button></div></div>;
        })}</div>}
      </div>
    </div>

    <div className="nfos-card">
      <h2>Team directory</h2><p className="nfos-muted">Each person can hold multiple NFOS roles. Their access is the combined permission set from every assigned role. Invite status reflects the employee's actual Supabase login state.</p>
      <div className="nfos-table-wrap"><table className="nfos-table nfos-team-mobile-table nfos-team-directory-table">
        <thead><tr><th>Name</th><th>Roles</th><th>Email</th><th>Login</th><th>Default location</th><th>Status</th><th>Access</th><th>Actions</th></tr></thead>
        <tbody>{members.map((m) => {
          const loginReady = m.auth_status === "login_ready";
          const inviteSent = m.auth_status === "invite_sent";
          const linkedUnconfirmed = m.auth_status === "linked_unconfirmed";
          const accountMissing = m.auth_status === "account_missing";
          const loginLabel = loginReady ? "Login ready" : inviteSent ? "Invite sent" : linkedUnconfirmed ? "Invite pending" : accountMissing ? "Account missing" : "Not invited";
          const loginClass = loginReady ? "ok" : accountMissing ? "low" : "";
          const canInvite = !accountMissing;

          return <tr key={m.id}>
            <td><strong>{m.display_name}</strong></td>
            <td><div className="nfos-inline-actions" style={{ flexWrap: "wrap" }}>{memberRoles(m).map((role) => <span className="nfos-pill" key={role}>{roleLabel(role)}</span>)}</div></td>
            <td>{m.email || "—"}</td>
            <td>
              <span className={`nfos-pill ${loginClass}`}>{loginLabel}</span>
              {inviteSent && m.invite_sent_at && <div className="nfos-muted nfos-small">Sent {fmtDateTime(m.invite_sent_at)}</div>}
            </td>
            <td>{m.default_location_name || "—"}</td>
            <td>{m.active ? "Active" : "Inactive"}</td>
            <td>
              {accountMissing ? <span className="nfos-pill low">Repair needed</span> :
                <div className="nfos-inline-actions" style={{ flexWrap: "wrap" }}>
                  {loginReady&&<span className="nfos-pill ok">Login ready</span>}
                  <button className="nfos-btn ghost" type="button"
                    disabled={!m.active || !m.email || !canInvite || inviteBusy===m.id}
                    onClick={()=>inviteMember(m)}>
                    {inviteBusy===m.id ? "Sending…" : loginReady ? "Send password setup" : inviteSent || linkedUnconfirmed ? "Resend invite" : m.email ? "Send invite" : "Add email first"}
                  </button>
                </div>}
            </td>
            <td>
              {memberRoles(m).includes("owner") ? <span className="nfos-muted nfos-small">Protected</span> :
                roleEditId===m.id ?
                  <div style={{ minWidth: 260 }}>
                    <RoleChoices value={roleDraft} onChange={setRoleDraft} disabled={roleBusy===m.id} />
                    <div className="nfos-inline-actions" style={{ marginTop: 8 }}>
                      <button className="nfos-btn secondary" type="button" disabled={!roleDraft.length || roleBusy===m.id} onClick={()=>saveMemberRoles(m)}>{roleBusy===m.id ? "Saving…" : "Save roles"}</button>
                      <button className="nfos-btn ghost" type="button" disabled={roleBusy===m.id} onClick={()=>{setRoleEditId("");setRoleDraft([]);}}>Cancel</button>
                    </div>
                  </div> :
                  <div className="nfos-inline-actions">
                    <button className="nfos-btn ghost" type="button" onClick={()=>startRoleEdit(m)}>Edit roles</button>
                    {m.can_delete && <button className="nfos-btn ghost" type="button"
                      disabled={deleteBusy===m.id}
                      onClick={()=>deleteMember(m)}>
                      {deleteBusy===m.id ? "Deleting…" : "Delete"}
                    </button>}
                  </div>}
            </td>
          </tr>;
        })}</tbody>
      </table></div>
    </div>

    <div className="nfos-card">
      <h2>Activity feed</h2><p className="nfos-muted">Permanent operational attribution from NFOS audit fields.</p>
      {!activity.length ? <Empty>No attributed operational activity yet.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table nfos-team-mobile-table nfos-team-activity-table"><thead><tr><th>When</th><th>Who</th><th>Activity</th><th>Detail</th></tr></thead><tbody>{activity.slice(0,100).map((a) => <tr key={a.activity_key}><td>{fmtDateTime(a.activity_at)}</td><td><strong>{a.performed_by}</strong></td><td>{a.title}</td><td className="nfos-muted">{a.detail}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="nfos-note">Employee setup emails open a protected first-login flow where each person creates their own password. Available NFOS areas and actions are controlled by the roles assigned to that team member.</div>
  </>;
}
