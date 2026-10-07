import { useState } from "react";
import * as api from "../lib/api";

export default function AdminUspsConnection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const testConnection = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const session = await api.session();
      if (!session?.access_token) throw new Error("Please sign in to the Admin Back Room again.");
      const response = await fetch("/.netlify/functions/usps-connection", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && !data.status) throw new Error(data.error || "USPS connection test failed.");
      setResult(data);
    } catch (err) {
      setError(err?.message || "Could not check USPS connection.");
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 17, marginBottom: 14, background: "#FFF", border: "1px solid #E2D6C4" }}>
      <div className="eyebrow">Direct carrier integration · USPS</div>
      <h3 style={{ margin: "6px 0", fontSize: 20 }}>USPS Developer Connection</h3>
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: "6px 0 12px", color: "#66523A" }}>
        Securely test your USPS developer app. The Consumer Key and Secret are stored in Netlify, not on this page.
        This test never creates labels or purchases postage.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn solid" onClick={testConnection} disabled={busy} style={{ padding: "10px 14px", fontSize: 12 }}>
          {busy ? "Checking USPS…" : "Test USPS Connection"}
        </button>
        <a href="https://cop.usps.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>USPS My Apps ↗</a>
        <a href="https://developers.usps.com/getting-started" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>USPS API setup ↗</a>
      </div>
      {error && <p role="alert" style={{ color: "#AD2416", marginBottom: 0, fontSize: 13 }}>{error}</p>}
      {result && (
        <div role="status" style={{ marginTop: 14, border: "1px solid #E2D6C4", borderRadius: 9, padding: 12, fontSize: 13, lineHeight: 1.6 }}>
          <strong>{result.status === "authenticated" ? "USPS authentication successful" : result.status === "setup_required" ? "Netlify credentials needed" : "Connection not established"}</strong>
          <div>{result.message}</div>
          <div style={{ color: "#74644D" }}>Environment: {result.environment === "production" ? "USPS Production" : "USPS Testing (TEM)"}</div>
          {result.missing?.length > 0 && <div>Missing Netlify variables: {result.missing.join(", ")}</div>}
          {result.status === "authenticated" && <div>Authorized OAuth scopes reported: {result.scopes?.length ? result.scopes.join(", ") : "Not provided by USPS"}</div>}
          {result.note && <div style={{ color: "#74644D", marginTop: 6 }}>{result.note}</div>}
        </div>
      )}
      <p style={{ fontSize: 12, lineHeight: 1.5, margin: "12px 0 0", color: "#74644D" }}>
        Live label purchasing remains disabled until USPS approves Labels and Payments access and the account is enrolled in USPS Ship with an EPS payment account.
      </p>
    </div>
  );
}
