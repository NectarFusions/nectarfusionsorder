import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-flavor-request-panel{display:grid;gap:16px;padding-bottom:40px}
.nf-flavor-request-toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:16px;border:1px solid #D8E7F0;border-radius:17px;background:#F6FBFE}
.nf-flavor-request-toolbar label{display:grid;gap:6px;color:#5A472E;font-size:12px;font-weight:850}
.nf-flavor-request-toolbar input{min-height:43px;padding:9px 11px;border:1px solid #BFD5E2;border-radius:10px;background:#FFF}
.nf-flavor-request-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.nf-flavor-request-stat{padding:15px;border:1px solid #DDE8EE;border-radius:15px;background:#FFF}
.nf-flavor-request-stat strong{display:block;color:#147FBE;font-family:'Bebas Neue',Impact,sans-serif;font-size:32px;line-height:1;overflow-wrap:anywhere}
.nf-flavor-request-stat span{display:block;margin-top:5px;color:#665A50;font-size:12.5px;line-height:1.4}
.nf-flavor-request-ranking,.nf-flavor-request-log{display:grid;gap:9px}
.nf-flavor-request-card{padding:15px;border:1px solid #E1D7C8;border-radius:16px;background:#FFF}
.nf-flavor-request-card.popular{border:2px solid #E0A400;background:#FFF9DF}
.nf-flavor-request-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.nf-flavor-request-rank{color:#147FBE;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.nf-flavor-request-card h3{margin:3px 0 0;font-size:20px}
.nf-flavor-request-count{color:#A56800;font-weight:900;white-space:nowrap}
.nf-flavor-request-popular{display:inline-flex;margin-top:8px;padding:5px 9px;border-radius:999px;background:#F7C41C;color:#4A3313;font-size:11px;font-weight:900}
.nf-flavor-request-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}
.nf-flavor-request-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid #E6E0D7;border-radius:12px;background:#FFF}
.nf-flavor-request-row strong{color:#174F72}
.nf-flavor-request-row span{display:block;margin-top:3px;color:#786B61;font-size:12px}
.nf-season-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
.nf-season-month{padding:10px 8px;border:1px solid #E4DED3;border-radius:12px;background:#FFF;text-align:center}
.nf-season-month strong{display:block;color:#147FBE;font-size:19px}
.nf-season-month span{display:block;margin-top:2px;color:#786B61;font-size:11px}
@media (max-width:700px){
  .nf-flavor-request-summary{grid-template-columns:1fr}
  .nf-flavor-request-row{grid-template-columns:1fr}
  .nf-season-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
`;

async function requestAdmin({ method = "GET", body = null }) {
  const session = await api.session();
  const token = session?.access_token;
  if (!token) throw new Error("Admin sign-in is required.");

  const response = await fetch("/.netlify/functions/flavor-request-admin", {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Flavor requests could not be loaded.");
  return data;
}

const monthKey = (value) => String(value || "").slice(0, 7);
const monthIndex = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? -1 : date.getMonth();
};
const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function AdminFlavorRequestsPanel() {
  const [entries, setEntries] = useState([]);
  const [flags, setFlags] = useState([]);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestAdmin({});
      setEntries(Array.isArray(data.requests) ? data.requests : []);
      setFlags(Array.isArray(data.flags) ? data.flags : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const popularIds = useMemo(
    () => new Set(flags.filter((flag) => flag.popular).map((flag) => flag.flavorId)),
    [flags]
  );

  const periodEntries = useMemo(
    () => month ? entries.filter((entry) => monthKey(entry.requestedAt) === month) : entries,
    [entries, month]
  );

  const allTimeCounts = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const key = entry.flavorId || entry.flavorName;
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [entries]);

  const ranking = useMemo(() => {
    const map = new Map();

    periodEntries.forEach((entry) => {
      const key = entry.flavorId || entry.flavorName;
      const current = map.get(key) || {
        key,
        flavorId: entry.flavorId,
        flavorName: entry.flavorName,
        count: 0,
      };

      current.count += 1;
      map.set(key, current);
    });

    return [...map.values()].sort(
      (a, b) => b.count - a.count || a.flavorName.localeCompare(b.flavorName)
    );
  }, [periodEntries]);

  const seasonality = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0);

    entries.forEach((entry) => {
      const index = monthIndex(entry.requestedAt);
      if (index >= 0) totals[index] += 1;
    });

    return totals;
  }, [entries]);

  const deleteRequest = async (entry) => {
    if (!window.confirm(`Delete this ${entry.flavorName} request?`)) return;

    setBusy(entry.id);

    try {
      await requestAdmin({
        method: "POST",
        body: { action: "delete", id: entry.id },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const togglePopular = async (item) => {
    if (!item.flavorId) return;

    setBusy(`popular-${item.flavorId}`);

    try {
      await requestAdmin({
        method: "POST",
        body: {
          action: "popular",
          flavorId: item.flavorId,
          popular: !popularIds.has(item.flavorId),
        },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const top = ranking[0] || null;

  return (
    <section className="nf-flavor-request-panel">
      <style>{CSS}</style>

      <div>
        <div className="eyebrow">Flavor Demand Tracking</div>
        <p style={{ margin:"5px 0 0", color:"#6A5B50", fontSize:13, lineHeight:1.55 }}>
          Track what customers ask to bring back, compare demand by month,
          and spot seasonal patterns before planning future batches.
        </p>
      </div>

      <div className="nf-flavor-request-toolbar">
        <label>
          Month to analyze
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>

        <button
          type="button"
          className={`btn ${month === "" ? "on" : ""}`}
          style={{ minHeight:43, padding:"9px 13px" }}
          onClick={() => setMonth("")}
        >
          All time
        </button>

        <button
          type="button"
          className="btn ghost"
          style={{ minHeight:43, padding:"9px 13px", marginLeft:"auto" }}
          onClick={load}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="nf-flavor-request-summary">
        <div className="nf-flavor-request-stat">
          <strong>{periodEntries.length}</strong>
          <span>{month ? "requests in selected month" : "requests all time"}</span>
        </div>

        <div className="nf-flavor-request-stat">
          <strong>{ranking.length}</strong>
          <span>different flavors requested</span>
        </div>

        <div className="nf-flavor-request-stat">
          <strong>{top ? top.flavorName : "—"}</strong>
          <span>{top ? `${top.count} request${top.count === 1 ? "" : "s"} · top demand` : "No demand yet"}</span>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom:9 }}>
          Seasonal Pattern · All Years
        </div>
        <div className="nf-season-grid">
          {monthLabels.map((label, index) => (
            <div className="nf-season-month" key={label}>
              <strong>{seasonality[index]}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom:9 }}>
          Most Requested {month ? `· ${month}` : "· All Time"}
        </div>

        {loading ? (
          <div className="card" style={{ padding:18, textAlign:"center" }}>
            Loading flavor requests…
          </div>
        ) : ranking.length === 0 ? (
          <div className="card" style={{ padding:18, textAlign:"center" }}>
            No flavor requests were recorded for this period.
          </div>
        ) : (
          <div className="nf-flavor-request-ranking">
            {ranking.map((item, index) => {
              const popular = popularIds.has(item.flavorId);

              return (
                <article
                  className={`nf-flavor-request-card ${popular ? "popular" : ""}`}
                  key={item.key}
                >
                  <div className="nf-flavor-request-card-head">
                    <div>
                      <div className="nf-flavor-request-rank">#{index + 1} requested</div>
                      <h3>{item.flavorName}</h3>
                    </div>
                    <div className="nf-flavor-request-count">
                      {item.count} this period
                    </div>
                  </div>

                  <div style={{ marginTop:6, color:"#786B61", fontSize:12.5 }}>
                    {allTimeCounts.get(item.key) || item.count} request
                    {(allTimeCounts.get(item.key) || item.count) === 1 ? "" : "s"} all time
                  </div>

                  {popular && (
                    <span className="nf-flavor-request-popular">
                      Popular Request
                    </span>
                  )}

                  {item.flavorId && (
                    <div className="nf-flavor-request-actions">
                      <button
                        type="button"
                        className={`btn ${popular ? "on" : ""}`}
                        style={{ padding:"8px 11px" }}
                        disabled={busy === `popular-${item.flavorId}`}
                        onClick={() => togglePopular(item)}
                      >
                        {popular ? "Remove Popular Request" : "Mark Popular Request"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom:9 }}>
          Individual Requests
        </div>

        {!loading && periodEntries.length === 0 ? (
          <div className="card" style={{ padding:16, textAlign:"center" }}>
            No individual requests in this period.
          </div>
        ) : (
          <div className="nf-flavor-request-log">
            {periodEntries
              .slice()
              .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
              .map((entry) => (
                <div className="nf-flavor-request-row" key={entry.id}>
                  <div>
                    <strong>{entry.flavorName}</strong>
                    <span>
                      {new Date(entry.requestedAt).toLocaleString()}
                      {" · "}
                      {entry.source === "review" ? "Review page" : "Website"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn danger"
                    style={{ padding:"8px 11px" }}
                    disabled={busy === entry.id}
                    onClick={() => deleteRequest(entry)}
                  >
                    Delete
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}
