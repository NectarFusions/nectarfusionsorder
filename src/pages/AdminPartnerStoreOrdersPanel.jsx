import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";

const CSS = `
.nf-admin-store-orders{display:grid;gap:12px}
.nf-admin-store-orders-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.nf-admin-store-orders-head h3{margin:0;color:#173C52}
.nf-admin-store-orders-head p{margin:5px 0 0;color:#687B85;line-height:1.55}
.nf-admin-store-orders-list{display:grid;gap:12px}
.nf-admin-store-order{overflow:hidden;border:1px solid #D7E3E9;border-radius:15px;background:#fff}
.nf-admin-store-order-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px 15px;background:#F6FAFC}
.nf-admin-store-order-head h4{margin:0;color:#173C52}
.nf-admin-store-order-head p{margin:4px 0 0;color:#6C7F89;font-size:12px}
.nf-admin-store-order-status{padding:7px 10px;border-radius:999px;background:#FFF0C2;color:#684E00;font-size:12px;font-weight:900;text-transform:uppercase}
.nf-admin-store-order-status[data-paid="true"]{background:#EAF6ED;color:#285A37}
.nf-admin-store-order-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:13px 15px}
.nf-admin-store-order-meta div{padding:10px;border-radius:10px;background:#F8FBFC}
.nf-admin-store-order-meta span{display:block;color:#718590;font-size:11px;font-weight:850;text-transform:uppercase}
.nf-admin-store-order-meta strong{display:block;margin-top:4px;color:#173C52;font-size:13px}
.nf-admin-store-order-items{display:grid;gap:6px;padding:0 15px 14px}
.nf-admin-store-order-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;padding:9px 10px;border:1px solid #E2E9ED;border-radius:9px}
.nf-admin-store-order-item span{color:#687B85;font-size:12px}
.nf-admin-store-order-item strong{color:#173C52;font-size:12px}
.nf-admin-store-order-address{margin:0 15px 14px;padding:11px 12px;border-left:4px solid #F7C41C;border-radius:9px;background:#FFF9E8;color:#604A1C;font-size:13px;line-height:1.5}
.nf-admin-store-order-actions{display:flex;gap:8px;flex-wrap:wrap;padding:0 15px 15px}
.nf-admin-store-order-actions a,.nf-admin-store-order-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 12px;border:1px solid #BDD1DB;border-radius:9px;background:#fff;color:#173C52;font:inherit;font-size:12px;font-weight:900;text-decoration:none;cursor:pointer}
.nf-admin-store-orders-empty{padding:15px;border:1px dashed #C8D9E1;border-radius:12px;background:#F8FBFC;color:#687B85}
@media(max-width:760px){.nf-admin-store-order-meta{grid-template-columns:1fr 1fr}.nf-admin-store-order-item{grid-template-columns:1fr}}
`;

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const dateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const itemName = (item) => {
  if (item.category === "retail") {
    return `${item.flavor_name || ""} · ${item.size_label || item.size_id || ""}`;
  }
  if (item.category === "bulk") {
    const type = item.details?.honey_type === "natural" ? "Natural" : "Infused";
    return `${item.size_label || item.size_id || ""} · ${type}${
      item.flavor_name ? ` · ${item.flavor_name}` : ""
    }`;
  }
  if (item.category === "gift") {
    return `${item.size_label || "Gift"}${
      item.flavor_name ? ` · ${item.flavor_name}` : ""
    }`;
  }
  return item.size_label || item.product_key || "Partner item";
};

export default function AdminPartnerStoreOrdersPanel({ partner }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!partner?.id) {
      setOrders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      setOrders(await api.listAdminPartnerStoreOrders(partner.id));
    } catch (loadError) {
      setError(
        loadError?.message ||
          "Partner checkout orders could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [partner?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="nf-apm-section nf-admin-store-orders">
      <style>{CSS}</style>

      <div className="nf-admin-store-orders-head">
        <div>
          <h3>Partner Checkout Orders</h3>
          <p>
            Orders appear here as soon as the partner continues to checkout.
            No approval is required. Payment is completed directly through Square.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? <div className="nf-apm-error">{error}</div> : null}

      {!loading && !orders.length ? (
        <div className="nf-admin-store-orders-empty">
          No direct checkout orders for this partner yet.
        </div>
      ) : (
        <div className="nf-admin-store-orders-list">
          {orders.map((order) => (
            <article className="nf-admin-store-order" key={order.id}>
              <div className="nf-admin-store-order-head">
                <div>
                  <h4>{order.order_no}</h4>
                  <p>{dateTime(order.created_at)}</p>
                </div>
                <span
                  className="nf-admin-store-order-status"
                  data-paid={order.paid === true}
                >
                  {order.paid ? "Paid" : cleanStatus(order.status || "awaiting_payment")}
                </span>
              </div>

              <div className="nf-admin-store-order-meta">
                <div>
                  <span>Merchandise</span>
                  <strong>{money(order.subtotal_cents)}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>{money(order.delivery_fee_cents)}</strong>
                </div>
                <div>
                  <span>Processing fee</span>
                  <strong>{money(order.processing_fee_cents)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money(order.total_cents)}</strong>
                </div>
                <div>
                  <span>Fulfillment</span>
                  <strong>{cleanStatus(order.fulfillment_method)}</strong>
                </div>
                <div>
                  <span>Needed by</span>
                  <strong>{order.needed_by || "Not specified"}</strong>
                </div>
                <div>
                  <span>ZIP</span>
                  <strong>{order.zip || "Pickup"}</strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>{order.paid ? `Paid ${dateTime(order.paid_at)}` : "Awaiting payment"}</strong>
                </div>
              </div>

              {order.fulfillment_method === "delivery" ? (
                <div className="nf-admin-store-order-address">
                  <strong>Delivery:</strong>{" "}
                  {[
                    order.business_name,
                    order.address_line1,
                    order.address_line2,
                    [order.city, order.state, order.zip].filter(Boolean).join(", "),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {order.delivery_notes ? ` · ${order.delivery_notes}` : ""}
                </div>
              ) : null}

              <div className="nf-admin-store-order-items">
                {(order.items || []).map((item) => (
                  <div className="nf-admin-store-order-item" key={item.id}>
                    <div>
                      <strong>{itemName(item)}</strong>
                      <span>
                        {item.quantity} × {money(item.unit_price_cents)}
                      </span>
                    </div>
                    <span>{cleanStatus(item.category)}</span>
                    <strong>{money(item.line_total_cents)}</strong>
                  </div>
                ))}
              </div>

              {!order.paid && order.square_link_url ? (
                <div className="nf-admin-store-order-actions">
                  <a
                    href={order.square_link_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Square Payment Page
                  </a>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
