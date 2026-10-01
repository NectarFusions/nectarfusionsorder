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
    {members.filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.display_name} — {roleLabel(m.role)}</option>)}
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

  const [memberForm, setMemberForm] = useState({ displayName:"", email:"", role:"production_operator", defaultLocationId:"", notes:"" });
  const createMember = async (e) => {
    e.preventDefault(); setError(""); setMessage("");
    try {
      await nfos.createTeamMember(memberForm);
      setMemberForm({ displayName:"", email:"", role:"production_operator", defaultLocationId:"", notes:"" });
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
        {!workload.length ? <Empty>No active team profiles.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Team member</th><th>Role</th><th>Actions</th><th>Tasks</th><th>Production</th><th>Total</th></tr></thead><tbody>{workload.map((w) => <tr key={w.member_id}><td><strong>{w.display_name}</strong></td><td>{roleLabel(w.role)}</td><td>{w.assigned_actions}</td><td>{w.manual_tasks}</td><td>{w.production_orders}</td><td><strong>{w.total_open_work}</strong></td></tr>)}</tbody></table></div>}
      </div>

      <div className="nfos-card">
        <h2>Add team profile</h2><p className="nfos-muted">This creates an operational profile for assignments. It does not create a login yet.</p>
        <form className="nfos-form" onSubmit={createMember}>
          <div className="nfos-field full"><label>Name</label><input required value={memberForm.displayName} onChange={(e) => setMemberForm({ ...memberForm, displayName:e.target.value })} /></div>
          <div className="nfos-field full"><label>Email</label><input type="email" value={memberForm.email} onChange={(e) => setMemberForm({ ...memberForm, email:e.target.value })} /></div>
          <div className="nfos-field"><label>Role</label><select value={memberForm.role} onChange={(e) => setMemberForm({ ...memberForm, role:e.target.value })}>{ROLES.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="nfos-field"><label>Default location</label><select value={memberForm.defaultLocationId} onChange={(e) => setMemberForm({ ...memberForm, defaultLocationId:e.target.value })}><option value="">None</option>{locations.filter((l) => l.active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="nfos-field full"><label>Notes</label><textarea value={memberForm.notes} onChange={(e) => setMemberForm({ ...memberForm, notes:e.target.value })} /></div>
          <div className="nfos-field full"><button className="nfos-btn">Create team profile</button></div>
        </form>
      </div>
    </div>

    <div className="nfos-card">
      <h2>Live NFOS action assignments</h2><p className="nfos-muted">Assign the dynamic Today queue. When the underlying issue is resolved, the action disappears automatically.</p>
      {!actions.length ? <Empty>No live actions need assignment.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Action</th><th>Date</th><th>Priority</th><th>Assigned to</th><th></th></tr></thead><tbody>{actions.map((a) => <ActionAssignmentRow key={a.action_key} action={a} members={members} onChanged={load} />)}</tbody></table></div>}
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
      <h2>Team directory</h2><p className="nfos-muted">Login-linked means the profile is connected to an individual authenticated account. Profile-only members can be assigned work now but cannot sign in yet.</p>
      <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Login</th><th>Default location</th><th>Status</th><th>Access</th></tr></thead><tbody>{members.map((m) => <tr key={m.id}><td><strong>{m.display_name}</strong></td><td>{roleLabel(m.role)}</td><td>{m.email || "—"}</td><td><span className={`nfos-pill ${m.login_linked ? "ok" : ""}`}>{m.login_linked ? "Linked" : "Profile only"}</span></td><td>{m.default_location_name || "—"}</td><td>{m.active ? "Active" : "Inactive"}</td><td>{m.login_linked ? <span className="nfos-pill ok">Login ready</span> : <button className="nfos-btn ghost" type="button" disabled={!m.active || !m.email || inviteBusy===m.id} onClick={()=>inviteMember(m)}>{inviteBusy===m.id ? "Sending…" : m.email ? "Send invite" : "Add email first"}</button>}</td></tr>)}</tbody></table></div>
    </div>

    <div className="nfos-card">
      <h2>Activity feed</h2><p className="nfos-muted">Permanent operational attribution from NFOS audit fields.</p>
      {!activity.length ? <Empty>No attributed operational activity yet.</Empty> : <div className="nfos-table-wrap"><table className="nfos-table"><thead><tr><th>When</th><th>Who</th><th>Activity</th><th>Detail</th></tr></thead><tbody>{activity.slice(0,100).map((a) => <tr key={a.activity_key}><td>{fmtDateTime(a.activity_at)}</td><td><strong>{a.performed_by}</strong></td><td>{a.title}</td><td className="nfos-muted">{a.detail}</td></tr>)}</tbody></table></div>}
    </div>

    <div className="nfos-note">Individual employee invitations are enabled. Invited employees currently receive a secure read-only My Work Today portal; operational write permissions remain locked until the next role-hardening release.</div>
  </>;
}
