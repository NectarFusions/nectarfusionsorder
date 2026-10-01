import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";

const qty = (value) => {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const shortDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const longDate = (value) => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

const routeTab = (route) => ({
  Purchasing: "purchasing",
  Production: "production",
  Inventory: "inventory",
}[route] || "overview");

function Empty({ children }) {
  return <div className="nfos-empty">{children}</div>;
}

function PriorityPill({ value, status }) {
  const danger = value === "critical" || value === "high" || status === "overdue" || status === "due_today";
  return <span className={`nfos-pill ${danger ? "low" : status === "released" ? "ok" : ""}`}>{String(status || value || "normal").replaceAll("_", " ")}</span>;
}

function ActionList({ actions, setTab }) {
  if (!actions.length) return <Empty>No operational actions are waiting right now.</Empty>;
  return <div className="nfos-action-list">
    {actions.map((action) => <div className={`nfos-action-row ${action.priority || "normal"}`} key={action.action_key}>
      <div className="nfos-action-date"><strong>{shortDate(action.action_date)}</strong><span>{action.route}</span></div>
      <div className="nfos-action-copy">
        <div className="nfos-action-title"><strong>{action.title}</strong><PriorityPill value={action.priority} status={action.action_status} /></div>
        <div className="nfos-muted nfos-small">{action.detail}</div>
      </div>
      <button className="nfos-btn ghost" type="button" onClick={() => setTab(routeTab(action.route))}>Open</button>
    </div>)}
  </div>;
}

function CalendarAgenda({ events, setTab, limit = null }) {
  const rows = limit ? events.slice(0, limit) : events;
  const grouped = useMemo(() => rows.reduce((acc, event) => {
    const key = event.event_date || "Unscheduled";
    (acc[key] ||= []).push(event);
    return acc;
  }, {}), [rows]);

  const dates = Object.keys(grouped).sort();
  if (!dates.length) return <Empty>No scheduled operational events yet.</Empty>;

  return <div className="nfos-calendar-agenda">
    {dates.map((date) => <div className="nfos-calendar-day" key={date}>
      <div className="nfos-calendar-date"><strong>{longDate(date)}</strong></div>
      <div className="nfos-calendar-events">
        {grouped[date].map((event) => <div className="nfos-calendar-event" key={event.event_key}>
          <div className="nfos-calendar-event-copy">
            <div className="nfos-action-title"><strong>{event.title}</strong><PriorityPill value={event.priority} status={event.status} /></div>
            <div className="nfos-muted nfos-small">{event.detail}</div>
          </div>
          <button className="nfos-btn ghost" type="button" onClick={() => setTab(routeTab(event.route))}>Open</button>
        </div>)}
      </div>
    </div>)}
  </div>;
}

export function NfosTodayDashboard({ inventory = [], lowStock = [], setTab, onRefresh }) {
  const [summary, setSummary] = useState(null);
  const [actions, setActions] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      await nfos.syncNotifications().catch(() => null);
      const [summaryRow, actionRows, calendarRows] = await Promise.all([
        nfos.getTodaySummary(),
        nfos.listActionQueue(),
        nfos.listOperationsCalendar(),
      ]);
      setSummary(summaryRow || null);
      setActions(actionRows || []);
      setCalendar(calendarRows || []);
    } catch (err) {
      setError(err?.message || "Could not load the NFOS action dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const byType = { finished_good: 0, packaging: 0 };
    inventory.forEach((row) => {
      if (row.item_type in byType) byType[row.item_type] += Number(row.company_on_hand || 0);
    });
    return byType;
  }, [inventory]);

  const upcoming = useMemo(() => {
    const business = summary?.business_date;
    if (!business) return calendar.slice(0, 10);
    const start = new Date(`${business}T12:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + 14);
    return calendar.filter((event) => {
      if (!event.event_date) return false;
      const date = new Date(`${event.event_date}T12:00:00`);
      return date >= start && date <= end;
    });
  }, [calendar, summary]);

  const refreshAll = async () => {
    await Promise.all([load(), onRefresh?.()]);
  };

  return <>
    {error && <div className="nfos-error">{error}</div>}
    <div className="nfos-grid four" style={{ marginBottom: 16 }}>
      <div className="nfos-stat"><div className="nfos-stat-label">Actions now</div><div className="nfos-stat-value">{summary?.total_actions ?? (loading ? "…" : actions.length)}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Critical / high</div><div className="nfos-stat-value">{Number(summary?.critical_actions || 0) + Number(summary?.high_actions || 0)}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Due / overdue</div><div className="nfos-stat-value">{Number(summary?.due_today_actions || 0) + Number(summary?.overdue_actions || 0)}</div></div>
      <div className="nfos-stat"><div className="nfos-stat-label">Next 7 days</div><div className="nfos-stat-value">{summary?.next_7_days ?? 0}</div></div>
    </div>

    <div className="nfos-card">
      <div className="nfos-page-head" style={{ marginBottom: 12 }}>
        <div><h2>Today’s action queue</h2><p>NFOS prioritizes purchasing, production, releases, supplier setup, deliveries and inventory exceptions automatically.</p></div>
        <div className="nfos-inline-actions"><span className="nfos-pill ok">Michigan date {summary?.business_date || "—"}</span><button className="nfos-btn secondary" disabled={loading} onClick={refreshAll}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      </div>
      <ActionList actions={actions} setTab={setTab} />
    </div>

    <div className="nfos-grid two nfos-ops-dashboard-grid">
      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}><div><h3>Upcoming 14 days</h3><p>Production due dates, purchase deadlines, incoming POs and batch release dates.</p></div><button className="nfos-btn ghost" onClick={() => setTab("calendar")}>Full calendar</button></div>
        <CalendarAgenda events={upcoming} setTab={setTab} limit={10} />
      </div>
      <div className="nfos-card">
        <h3>Operating snapshot</h3>
        <div className="nfos-mini-stats">
          <div><span>Finished jars</span><strong>{qty(totals.finished_good)}</strong></div>
          <div><span>Active ingredients</span><strong>{inventory.filter((row) => row.item_type === "material" && row.active).length}</strong></div>
          <div><span>Packaging units</span><strong>{qty(totals.packaging)}</strong></div>
          <div><span>Below threshold</span><strong>{lowStock.length}</strong></div>
        </div>
        <div className="nfos-inline-actions" style={{ marginTop: 16 }}>
          <button className="nfos-btn" onClick={() => setTab("production")}>Production</button>
          <button className="nfos-btn secondary" onClick={() => setTab("purchasing")}>Purchasing</button>
          <button className="nfos-btn ghost" onClick={() => setTab("inventory")}>Inventory</button>
        </div>
      </div>
    </div>
  </>;
}

export function NfosOperationsCalendar({ setTab }) {
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [windowDays, setWindowDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [rows, today] = await Promise.all([nfos.listOperationsCalendar(), nfos.getTodaySummary()]);
      setEvents(rows || []);
      setSummary(today || null);
    } catch (err) {
      setError(err?.message || "Could not load the operations calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!summary?.business_date) return events;
    const start = new Date(`${summary.business_date}T12:00:00`);
    const end = new Date(start); end.setDate(end.getDate() + Number(windowDays));
    return events.filter((event) => {
      if (!event.event_date) return false;
      const date = new Date(`${event.event_date}T12:00:00`);
      return date >= start && date <= end;
    });
  }, [events, summary, windowDays]);

  return <div className="nfos-card">
    <div className="nfos-page-head" style={{ marginBottom: 12 }}>
      <div><h2>Operations calendar</h2><p>One schedule for production deadlines, supplier order-by dates, expected deliveries and batch release/cure dates.</p></div>
      <div className="nfos-inline-actions">
        <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}><option value={14}>14 days</option><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option></select>
        <button className="nfos-btn secondary" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>
    {error && <div className="nfos-error">{error}</div>}
    <div className="nfos-note" style={{ marginBottom: 14 }}>Business date: <strong>{summary?.business_date || "—"}</strong> • America/Detroit</div>
    <CalendarAgenda events={visible} setTab={setTab} />
  </div>;
}
