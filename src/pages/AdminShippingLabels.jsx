import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import AdminUspsConnection from "./AdminUspsConnection";
import AdminUspsRates from "./AdminUspsRates";
import AdminOrderDeliveryButton from "./AdminOrderDeliveryButton";

const formatDate = (value) => value
  ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  : "";
const pendingPayment = (order) => Boolean(order.requires_prepay && !order.paid && order.status === "open");

export default function AdminShippingLabels({ orders = [] }) {
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingOrder, setEditingOrder] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [service, setService] = useState("");
  const [tracking, setTracking] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await api.listShippingLabels();
      setLabels(rows || []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load shipping labels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const byOrder = useMemo(() => {
    const result = new Map();
    labels.forEach((label) => {
      const existing = result.get(label.order_id) || [];
      existing.push(label);
      result.set(label.order_id, existing);
    });
    return result;
  }, [labels]);

  const shippingOrders = useMemo(() => orders
    .filter((order) => order.method === "ship" && order.status !== "cancelled")
    .sort((a, b) => new Date(b.placed_at || 0) - new Date(a.placed_at || 0)), [orders]);

  const visibleOrders = useMemo(() => shippingOrders.filter((order) => {
    const matches = [order.order_no, order.name, order.city, order.zip, order.email]
      .some((value) => String(value || "").toLowerCase().includes(search.trim().toLowerCase()));
    if (!matches) return false;
    const hasLabel = (byOrder.get(order.id) || []).length > 0;
    if (filter === "needs-label") return !hasLabel && !pendingPayment(order);
    if (filter === "labeled") return hasLabel;
    return true;
  }), [shippingOrders, byOrder, search, filter]);

  const beginUpload = (id) => {
    setEditingOrder((current) => current === id ? "" : id);
    setCarrier("USPS");
    setService("");
    setTracking("");
    setFile(null);
    setError("");
    setMessage("");
  };

  const save = async (event, order) => {
    event.preventDefault();
    if (busy) return;
    if (pendingPayment(order)) { setError("Wait for confirmed payment before attaching postage."); return; }
    if (!file) { setError("Choose the postage-paid PDF downloaded from USPS or UPS."); return; }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.saveShippingLabel({ orderId: order.id, carrier, service, trackingNumber: tracking, file });
      setEditingOrder("");
      setFile(null);
      setTracking("");
      setService("");
      setMessage(`Label saved for order #${order.order_no}. You can view and print it below.`);
      await refresh();
    } catch (err) {
      setError(err.message || "The label could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const viewLabel = async (label) => {
    setBusy(true);
    setError("");
    try {
      const url = await api.getShippingLabelPreviewUrl(label.label_path);
      setPreview({ label, url });
    } catch (err) {
      setError(err.message || "The label could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  const deleteLabel = async (label) => {
    if (busy || !window.confirm("Remove this label from NectarFusions? This does not void postage with the carrier.")) return;
    setBusy(true);
    setError("");
    try {
      await api.removeShippingLabel(label);
      if (preview?.label?.id === label.id) setPreview(null);
      setMessage("Label removed from the Back Room. Purchased postage was not refunded or voided.");
      await refresh();
    } catch (err) {
      setError(err.message || "The label could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ paddingBottom: 44 }}>
      <div className="card" style={{ padding: 19, marginBottom: 14, border: "2px solid #E2B62F", background: "#FFFDF6" }}>
        <div className="eyebrow">Admin Back Room · Shipping</div>
        <h2 style={{ margin: "5px 0 9px", fontSize: 28 }}>Shipping Labels</h2>
        <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.6 }}>
          Keep every postage-paid USPS or UPS label with its order. Open the PDF here or print it again whenever you need it.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9, alignItems: "center" }}>
          <a className="btn" href="https://cnsb.usps.com/" target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontSize: 12 }}>Create USPS label ↗</a>
          <a className="btn" href="https://www.ups.com/ship" target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontSize: 12 }}>Create UPS label ↗</a>
          <button className="btn ghost" type="button" disabled={loading || busy} onClick={refresh} style={{ fontSize: 12 }}>Refresh labels</button>
        </div>
        <p style={{ color: "#74644D", fontSize: 12, lineHeight: 1.5, margin: "12px 0 0" }}>
          These links go directly to the carriers, with no third-party label service. Purchase postage there, download the official PDF, then attach it to the correct order. A homemade address label without paid postage is not a valid shipping label.
        </p>
      </div>

      <AdminUspsConnection />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 13 }}>
        {[["all", `All (${shippingOrders.length})`], ["needs-label", `Needs label (${shippingOrders.filter(o => !pendingPayment(o) && !(byOrder.get(o.id) || []).length).length})`], ["labeled", `Saved (${shippingOrders.filter(o => (byOrder.get(o.id) || []).length).length})`]].map(([id, title]) => (
          <button key={id} type="button" className={`btn ${filter === id ? "on" : ""}`} style={{ padding: "10px 5px", fontSize: 12 }} onClick={() => setFilter(id)}>{title}</button>
        ))}
      </div>
      <input aria-label="Search shipping orders" placeholder="Search order, customer, city, or ZIP" value={search} onChange={(event) => setSearch(event.target.value)} style={{ marginBottom: 14 }} />

      {error && <div role="alert" className="err" style={{ marginBottom: 12 }}>{error}</div>}
      {message && <div role="status" className="card" style={{ padding: 10, marginBottom: 12, borderColor: "#4F8B56", color: "#256332" }}>{message}</div>}
      {loading && <div className="card" style={{ padding: 20 }}>Loading shipping labels…</div>}
      {!loading && visibleOrders.length === 0 && <div className="card" style={{ padding: 24, textAlign: "center" }}>No matching shipping orders.</div>}

      {visibleOrders.map((order) => {
        const stored = byOrder.get(order.id) || [];
        const paymentHold = pendingPayment(order);
        return (
          <article key={order.id} className="card" style={{ padding: 15, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div style={{ minWidth: 0, flex: "1 1 190px" }}>
                <div className="eyebrow">#{order.order_no} · {order.status === "done" ? "Shipped" : paymentHold ? "Payment pending" : "Ready to prepare"}</div>
                <strong style={{ display: "block", fontSize: 18, marginTop: 5 }}>{order.name}</strong>
                <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                  {[order.address, [order.city, order.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                </div>
                <div style={{ fontSize: 12, marginTop: 4, color: "#7B5821" }}>{formatDate(order.placed_at)} · {stored.length} saved label{stored.length === 1 ? "" : "s"}</div>
              </div>
              <button type="button" className="btn" disabled={busy || paymentHold} style={{ fontSize: 12 }} onClick={() => beginUpload(order.id)}>{editingOrder === order.id ? "Cancel" : "Attach PDF label"}</button>
            </div>

            <AdminUspsRates order={order} disabled={paymentHold} />
            <AdminOrderDeliveryButton order={order} />

            {stored.map((label) => (
              <div key={label.id} style={{ marginTop: 11, padding: 10, background: "#FFF9E9", border: "1px solid #E2D6C4", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <strong>{label.carrier}{label.service ? ` · ${label.service}` : ""}</strong>
                    <div>Tracking: {label.tracking_number || "Not entered"}</div>
                    <div style={{ fontSize: 11, color: "#74644D" }}>Saved {formatDate(label.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button type="button" className="btn solid" disabled={busy} onClick={() => viewLabel(label)} style={{ fontSize: 12, padding: "8px 10px" }}>View / Print</button>
                    <button type="button" className="btn ghost" disabled={busy} onClick={() => deleteLabel(label)} style={{ fontSize: 12, padding: "8px 10px" }}>Remove</button>
                  </div>
                </div>
              </div>
            ))}

            {editingOrder === order.id && !paymentHold && (
              <form onSubmit={(event) => save(event, order)} style={{ borderTop: "1px solid #E2D6C4", marginTop: 14, paddingTop: 13 }}>
                <strong style={{ fontSize: 14 }}>Attach a real carrier-issued shipping label</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 10 }}>
                  <label style={{ fontSize: 12 }}>Carrier
                    <select value={carrier} onChange={(event) => setCarrier(event.target.value)} style={{ width: "100%", marginTop: 5 }}>
                      <option value="USPS">USPS</option><option value="UPS">UPS</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12 }}>Shipping service (optional)
                    <input value={service} onChange={(event) => setService(event.target.value)} maxLength={100} placeholder="e.g. Ground Advantage" style={{ width: "100%", marginTop: 5 }} />
                  </label>
                  <label style={{ fontSize: 12 }}>Tracking number (optional)
                    <input value={tracking} onChange={(event) => setTracking(event.target.value)} maxLength={100} placeholder="From the carrier label" style={{ width: "100%", marginTop: 5 }} />
                  </label>
                </div>
                <label style={{ display: "block", marginTop: 12, fontSize: 12 }}>Carrier label PDF (max 10 MB)
                  <input type="file" accept=".pdf,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} style={{ display: "block", marginTop: 5, width: "100%" }} />
                </label>
                <p style={{ fontSize: 12, color: "#74644D", margin: "8px 0" }}>For a 4 × 6 label, download the carrier's 4 × 6 PDF. The print size comes from that PDF.</p>
                <button className="btn solid" type="submit" disabled={busy || !file} style={{ padding: "10px 16px" }}>{busy ? "Saving…" : "Save shipping label"}</button>
              </form>
            )}
          </article>
        );
      })}

      {preview && (
        <div role="dialog" aria-label="Shipping label preview" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(20,16,8,.75)", padding: 14, overflow: "auto" }}>
          <div style={{ maxWidth: 800, margin: "24px auto", background: "#fff", padding: 14, borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <strong>{preview.label.carrier} · Shipping label</strong>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <a className="btn solid" href={preview.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>Open to Print ↗</a>
                <button type="button" className="btn ghost" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
            <iframe title="Official shipping label PDF" src={preview.url} style={{ border: "1px solid #ddd", display: "block", width: "100%", height: "min(75vh,790px)" }} />
            <p style={{ fontSize: 12, margin: "10px 0 0", color: "#74644D" }}>Choose Open to Print, then use your browser's PDF print control. Set the printer paper size to match the carrier label.</p>
          </div>
        </div>
      )}
    </section>
  );
}
