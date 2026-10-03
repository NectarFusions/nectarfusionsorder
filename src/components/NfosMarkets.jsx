import { useCallback, useEffect, useMemo, useState } from "react";
import * as nfos from "../lib/nfosApi";
import NfosMarketCloseoutApprovals from "./NfosMarketCloseoutApprovals";

const fmtDate = (value) => {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return year && month && day
    ? new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : String(value);
};
const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);
const qty = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pill = (value) => String(value || "").replaceAll("_", " ");

export default function NfosMarkets({ adminApprovals = false, notify }) {
  const [data, setData] = useState({ sessions: [], reconciliations: [] });
  const [selectedId, setSelectedId] = useState("");
  const [squareLocations, setSquareLocations] = useState([]);
  const [squareStatus, setSquareStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const flash = (type, text) => {
    if (type === "error") {
      setError(text);
      setMessage("");
    } else {
      setMessage(text);
      setError("");
    }
    notify?.(type, text);
  };

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const workspace = await nfos.marketGetWorkspace();
      setData(workspace || { sessions: [], reconciliations: [] });
      setSelectedId((current) => {
        if (current && workspace?.sessions?.some((session) => session.id === current)) return current;
        return workspace?.sessions?.[0]?.id || "";
      });
    } catch (err) {
      setError(err?.message || "Could not load market operations.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(
    () => (data.sessions || []).find((session) => session.id === selectedId) || null,
    [data.sessions, selectedId]
  );
  const reconciliation = useMemo(
    () => (data.reconciliations || []).find((row) => row.session_id === selectedId) || null,
    [data.reconciliations, selectedId]
  );

  const loadSquareLocations = async () => {
    setBusy(true);
    try {
      const result = await nfos.squareMarketRequest("locations");
      setSquareLocations(result.locations || []);
      flash("success", "Square locations loaded.");
    } catch (err) {
      flash("error", err?.message || "Could not load Square locations.");
    } finally {
      setBusy(false);
    }
  };

  const setSquareLocation = async (locationId) => {
    if (!selected) return;
    setBusy(true);
    try {
      await nfos.marketSetSquareLocation(selected.id, locationId || null);
      flash("success", "Square location saved for this market.");
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not save Square location.");
    } finally {
      setBusy(false);
    }
  };

  const syncSquare = async () => {
    if (!selected) return;
    setBusy(true);
    setSquareStatus(null);
    try {
      const result = await nfos.squareMarketRequest("sync", { sessionId: selected.id });
      setSquareStatus(result);
      flash(
        "success",
        `Square reconciled ${result.orders || 0} completed order${result.orders === 1 ? "" : "s"}: ${money(result.square_noncash_cents)} non-cash${Number(result.square_cash_cents || 0) > 0 ? ` + ${money(result.square_cash_cents)} cash in Square` : ""}.`
      );
      await load();
    } catch (err) {
      flash("error", err?.message || "Could not reconcile Square payments.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {adminApprovals && <NfosMarketCloseoutApprovals notify={notify} onChanged={load} />}
      {error && <div className="nfos-error">{error}</div>}
      {message && <div className="nfos-success">{message}</div>}

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div>
            <h2>Market Control Center</h2>
            <p>Market Managers start their own markets, record opening custody, scan sales and submit one reconciled closeout. Admin setup and per-market employee assignment are no longer part of the normal workflow.</p>
          </div>
          <button className="nfos-btn secondary" onClick={load} disabled={busy}>Refresh</button>
        </div>
        <div className="nfos-note">
          <strong>Normal field flow:</strong> Start Market → Opening Count → Scan Sales → Return Count → Cash + Square Reconciliation → Submit Closeout → Admin Approval.
        </div>
      </div>

      <div className="nfos-card">
        <div className="nfos-page-head" style={{ marginBottom: 12 }}>
          <div><h2>Market Sessions</h2><p>Use this page for oversight and exception recovery, not routine setup.</p></div>
          <button className="nfos-btn ghost" onClick={loadSquareLocations} disabled={busy}>Load Square Locations</button>
        </div>

        {!data.sessions?.length ? (
          <div className="nfos-empty">No market sessions yet.</div>
        ) : (
          <div className="nfos-table-wrap">
            <table className="nfos-table">
              <thead><tr><th>Date</th><th>Market</th><th>Started by</th><th>Status</th><th>Taken</th><th>Logged sold</th><th>Logged sales</th><th></th></tr></thead>
              <tbody>
                {(data.sessions || []).map((session) => (
                  <tr key={session.id}>
                    <td>{fmtDate(session.market_day)}</td>
                    <td><strong>{session.venue_name}</strong></td>
                    <td>{session.started_by_member_name || session.assigned_member_name || "—"}</td>
                    <td><span className={`nfos-pill ${session.closeout_status === "approved" || session.status === "reconciled" ? "ok" : session.closeout_status === "returned" ? "low" : ""}`}>{pill(session.closeout_status || session.status)}</span></td>
                    <td>{qty(session.opening_units ?? session.units_loaded)}</td>
                    <td>{qty(session.logged_units)}</td>
                    <td>{money(session.logged_gross_cents)}</td>
                    <td><button className="nfos-btn ghost" onClick={() => { setSelectedId(session.id); setSquareStatus(null); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="nfos-card">
          <div className="nfos-page-head">
            <div>
              <h2>{selected.venue_name}</h2>
              <p>{fmtDate(selected.market_day)} · {pill(selected.closeout_status || selected.status)} · started by {selected.started_by_member_name || selected.assigned_member_name || "—"}</p>
            </div>
            <div className="nfos-inline-actions">
              {selected.square_location_id && ["open", "closed", "reconciled"].includes(selected.status) && (
                <button className="nfos-btn secondary" onClick={syncSquare} disabled={busy}>Re-sync Square</button>
              )}
            </div>
          </div>

          <div className="nfos-grid four" style={{ marginTop: 14 }}>
            <div className="nfos-stat"><div className="nfos-stat-label">Opening custody</div><div className="nfos-stat-value">{qty(selected.opening_units ?? selected.units_loaded)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Logged jars sold</div><div className="nfos-stat-value">{qty(selected.logged_units)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Logged sales</div><div className="nfos-stat-value">{money(selected.logged_gross_cents)}</div></div>
            <div className="nfos-stat"><div className="nfos-stat-label">Posted after approval</div><div className="nfos-stat-value">{qty(selected.units_sold)}</div></div>
          </div>

          <div className="nfos-form" style={{ marginTop: 16 }}>
            <div className="nfos-field full">
              <label>Square location</label>
              <select
                value={selected.square_location_id || ""}
                onFocus={() => { if (!squareLocations.length) loadSquareLocations(); }}
                onChange={(event) => setSquareLocation(event.target.value)}
              >
                <option value="">Not linked / cash-only market</option>
                {squareLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
              <span className="nfos-muted nfos-small">This is normally selected by the Market Manager when starting the market. Admin can correct it here if needed.</span>
            </div>
          </div>

          {(reconciliation || squareStatus) && (
            <div className="nfos-grid four" style={{ marginTop: 14 }}>
              <div className="nfos-stat"><div className="nfos-stat-label">Square non-cash</div><div className="nfos-stat-value">{money(squareStatus?.square_noncash_cents ?? reconciliation?.square_gross_cents)}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Square cash</div><div className="nfos-stat-value">{money(squareStatus?.square_cash_cents ?? reconciliation?.square_cash_cents)}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Square order total</div><div className="nfos-stat-value">{money(squareStatus?.square_order_total_cents ?? reconciliation?.square_order_total_cents)}</div></div>
              <div className="nfos-stat"><div className="nfos-stat-label">Square orders</div><div className="nfos-stat-value">{squareStatus?.orders ?? reconciliation?.square_transaction_count ?? 0}</div></div>
            </div>
          )}

          <div className="nfos-note" style={{ marginTop: 14 }}>
            Square reconciliation is intentionally financial-only. It does not create a second inventory sale. Physical inventory is posted once, after the complete market closeout is approved.
          </div>
        </div>
      )}
    </>
  );
}
