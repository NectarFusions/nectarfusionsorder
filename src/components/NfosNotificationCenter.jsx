import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const shortDate = (value) => {
  if (!value) return "—";
  const [y,m,d] = String(value).slice(0,10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y,m-1,d).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
};

const severityClass = (value) =>
  value === "critical" || value === "high" ? "low" : value === "normal" ? "" : "";

const routeTab = (route) => ({
  Production: "production",
  Purchasing: "purchasing",
  Inventory: "inventory",
  Quality: "production",
  General: "work",
}[route] || "work");

function Pill({ children, tone="" }) {
  return <span className={`nfos-pill ${tone}`}>{children}</span>;
}

export default function NfosNotificationCenter({ manager=false, onOpenRoute }) {
  const [notifications,setNotifications]=useState([]);
  const [managerSummary,setManagerSummary]=useState(null);
  const [prefs,setPrefs]=useState(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("active");

  const load=useCallback(async()=>{
    setBusy(true); setError("");
    try{
      await nfos.syncNotifications();
      const [mine,preferences,summary] = await Promise.all([
        nfos.getMyNotifications(),
        nfos.getNotificationPreferences(),
        manager ? nfos.getManagerNotificationSummary() : Promise.resolve(null),
      ]);
      setNotifications(mine || []);
      setPrefs(preferences || null);
      setManagerSummary(summary || null);
    }catch(err){
      setError(err?.message || "Could not load NFOS notifications.");
    }finally{
      setBusy(false);
    }
  },[manager]);

  useEffect(()=>{load();},[load]);

  const counts=useMemo(()=>({
    unread:notifications.filter((n)=>n.status==="unread").length,
    critical:notifications.filter((n)=>n.severity==="critical").length,
    high:notifications.filter((n)=>n.severity==="high").length,
    acknowledged:notifications.filter((n)=>n.status==="acknowledged").length,
  }),[notifications]);

  const visible=useMemo(()=>{
    if(filter==="unread") return notifications.filter((n)=>n.status==="unread");
    if(filter==="critical") return notifications.filter((n)=>n.severity==="critical");
    return notifications;
  },[notifications,filter]);

  const setStatus=async(id,status)=>{
    setBusy(true); setError("");
    try{
      await nfos.setNotificationStatus(id,status);
      await load();
    }catch(err){
      setError(err?.message || "Could not update the notification.");
    }finally{
      setBusy(false);
    }
  };

  const savePrefs=async(next)=>{
    setBusy(true); setError("");
    try{
      const saved=await nfos.setNotificationPreferences(
        Boolean(next.email_enabled),
        Boolean(next.critical_email_enabled)
      );
      setPrefs(saved);
      await nfos.syncNotifications();
    }catch(err){
      setError(err?.message || "Could not save notification preferences.");
    }finally{
      setBusy(false);
    }
  };

  const openArea=(route)=>{
    if(onOpenRoute) onOpenRoute(routeTab(route));
  };

  const teamRows = managerSummary?.notifications || [];

  return <>
    {error && <div className="nfos-error">{error}</div>}

    <div className="nfos-grid four" style={{marginBottom:16}}>
      <div className="nfos-stat"><div className="nfos-stat-label">Unread</div><div className="nfos-stat-value">{counts.unread}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Critical</div><div className="nfos-stat-value">{counts.critical}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">High</div><div className="nfos-stat-value">{counts.high}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Acknowledged</div><div className="nfos-stat-value">{counts.acknowledged}</div></div>
    </div>

    <div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div>
          <h2>My notifications</h2>
          <p>NFOS generates these from assigned work, deadlines, exceptions, releases, deliveries, and escalations.</p>
        </div>
        <div className="nfos-inline-actions">
          <select value={filter} onChange={(e)=>setFilter(e.target.value)}>
            <option value="active">All active</option>
            <option value="unread">Unread</option>
            <option value="critical">Critical</option>
          </select>
          <button className="nfos-btn secondary" disabled={busy} onClick={load}>{busy ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {!visible.length ? <div className="nfos-empty">No active notifications.</div> :
        <div className="nfos-notification-list">
          {visible.map((n)=><div className={`nfos-notification-row ${n.severity}`} key={n.id}>
            <div className="nfos-notification-main">
              <div className="nfos-action-title">
                <strong>{n.title}</strong>
                <Pill tone={severityClass(n.severity)}>{n.severity}</Pill>
                {n.escalation_level > 0 && <Pill tone="low">Escalated</Pill>}
                <Pill>{String(n.status).replaceAll("_"," ")}</Pill>
              </div>
              <div className="nfos-muted nfos-small">{n.detail || "No additional detail."}</div>
              <div className="nfos-notification-meta">
                {n.route && <span>{n.route}</span>}
                {n.due_date && <span>Due {shortDate(n.due_date)}</span>}
                <span>Seen {new Date(n.last_seen_at).toLocaleString()}</span>
              </div>
            </div>
            <div className="nfos-inline-actions">
              {n.status==="unread" && <button className="nfos-btn ghost" onClick={()=>setStatus(n.id,"read")}>Mark read</button>}
              {n.status!=="acknowledged" && <button className="nfos-btn ghost" onClick={()=>setStatus(n.id,"acknowledged")}>Acknowledge</button>}
              {n.route && <button className="nfos-btn ghost" onClick={()=>openArea(n.route)}>Open</button>}
            </div>
          </div>)}
        </div>}
    </div>

    <div className="nfos-card">
      <h3>Email delivery</h3>
      <p className="nfos-muted">NFOS uses NectarFusions' existing Resend setup. The scheduled delivery function checks for new alerts hourly after deployment.</p>
      <div className="nfos-form">
        <div className="nfos-field full">
          <label className="nfos-check">
            <input type="checkbox" checked={Boolean(prefs?.email_enabled)} disabled={busy}
              onChange={(e)=>savePrefs({...prefs,email_enabled:e.target.checked})}/>
            Email me all active NFOS alerts
          </label>
        </div>
        <div className="nfos-field full">
          <label className="nfos-check">
            <input type="checkbox" checked={Boolean(prefs?.critical_email_enabled)} disabled={busy || Boolean(prefs?.email_enabled)}
              onChange={(e)=>savePrefs({...prefs,critical_email_enabled:e.target.checked})}/>
            Email me critical alerts and escalations only
          </label>
        </div>
      </div>
      <div className="nfos-note">In-app alerts remain active regardless of email preference. Text/SMS delivery is not enabled yet.</div>
    </div>

    {manager && <div className="nfos-card">
      <div className="nfos-page-head" style={{marginBottom:12}}>
        <div>
          <h2>Team escalations</h2>
          <p>Owner and Operations Manager view of active team alerts and escalated work.</p>
        </div>
        <div className="nfos-inline-actions">
          <Pill tone={managerSummary?.critical ? "low" : ""}>{managerSummary?.critical || 0} critical</Pill>
          <Pill>{managerSummary?.people_with_active_alerts || 0} people</Pill>
        </div>
      </div>

      {!teamRows.length ? <div className="nfos-empty">No active team alerts.</div> :
        <div className="nfos-table-wrap"><table className="nfos-table">
          <thead><tr><th>Person</th><th>Alert</th><th>Severity</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>{teamRows.map((n)=><tr key={`${n.id}-${n.recipient_member_id}`}>
            <td><strong>{n.recipient_name}</strong><div className="nfos-muted nfos-small">{String(n.recipient_role || "").replaceAll("_"," ")}</div></td>
            <td><strong>{n.title}</strong><div className="nfos-muted nfos-small">{n.detail}</div></td>
            <td><Pill tone={severityClass(n.severity)}>{n.severity}</Pill></td>
            <td>{shortDate(n.due_date)}</td>
            <td>{String(n.status).replaceAll("_"," ")}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>}
  </>;
}

