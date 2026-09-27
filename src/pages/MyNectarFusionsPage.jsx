import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents || 0) / 100);

const dateLabel = (value) => {
  if (!value) return "Not scheduled";
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
};

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const CSS = `
.nf-my{max-width:980px;margin:0 auto;padding:30px 20px 90px;color:#173C52}
.nf-my-hero{padding:28px;border:1px solid #D8E7ED;border-radius:24px;background:linear-gradient(145deg,#F6FBFD,#FFFFFF);box-shadow:0 16px 38px rgba(26,79,106,.09)}
.nf-my-kicker{font-size:11px;font-weight:850;letter-spacing:.15em;text-transform:uppercase;color:#2780A9}
.nf-my-hero h1{margin:8px 0 7px;font-size:clamp(34px,5vw,52px);line-height:1;color:#102E40}
.nf-my-hero p{max-width:720px;margin:0;color:#6A7F89;font-size:14px;line-height:1.65}
.nf-my-head-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.nf-my-btn{min-height:42px;padding:10px 14px;border:1px solid #B8D0DA;border-radius:10px;background:#FFF;color:#15384A;font:inherit;font-weight:850;cursor:pointer}
.nf-my-btn.primary{border-color:#15384A;background:#15384A;color:#FFF}.nf-my-btn.gold{border-color:#D69A00;background:#F7C41C;color:#102E40}.nf-my-btn.danger{color:#8A2D2D;border-color:#D9B0B0}
.nf-my-nav{display:flex;gap:6px;overflow:auto;margin:18px 0;padding:6px;border:1px solid #D9E6EC;border-radius:14px;background:#F6FAFB}
.nf-my-nav button{white-space:nowrap;min-height:40px;padding:9px 13px;border:0;border-radius:9px;background:transparent;color:#56707C;font:inherit;font-size:13px;font-weight:850;cursor:pointer}
.nf-my-nav button.active{background:#14384B;color:#FFF}
.nf-my-panel{padding:20px;border:1px solid #DCE8ED;border-radius:18px;background:#FFF;box-shadow:0 9px 26px rgba(29,75,99,.06)}
.nf-my-panel + .nf-my-panel{margin-top:14px}.nf-my-panel h2{margin:0 0 5px;font-size:24px;color:#102E40}.nf-my-panel>p{margin:0 0 16px;color:#74858D;font-size:13px;line-height:1.6}
.nf-my-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.nf-my-stat{padding:15px;border:1px solid #E0E9ED;border-radius:14px;background:#FAFCFD}.nf-my-stat span{display:block;color:#82949D;font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.nf-my-stat strong{display:block;margin-top:6px;color:#14384B;font-size:24px}
.nf-my-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.nf-my-card{padding:16px;border:1px solid #DCE8ED;border-radius:15px;background:#FCFEFF}.nf-my-card h3{margin:0;color:#12364A;font-size:18px}.nf-my-card p{margin:6px 0 0;color:#71848D;font-size:13px;line-height:1.5}.nf-my-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.nf-my-pill{padding:5px 8px;border-radius:999px;background:#EDF5F8;color:#315B6E;font-size:11px;font-weight:850}.nf-my-pill.gold{background:#FFF3C5;color:#745810}
.nf-my-items{display:grid;gap:5px;margin-top:11px}.nf-my-item{display:flex;justify-content:space-between;gap:12px;padding-top:6px;border-top:1px solid #E9EFF2;color:#526E7B;font-size:12px}.nf-my-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
.nf-my-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.nf-my-field{display:grid;gap:5px}.nf-my-field.full{grid-column:1/-1}.nf-my-field label{color:#516D79;font-size:12px;font-weight:850}.nf-my-field input,.nf-my-field select,.nf-my-field textarea{width:100%;min-height:43px;padding:10px;border:1px solid #BDD2DC;border-radius:9px;background:#FFF;color:#173C52;font:inherit}.nf-my-field textarea{min-height:86px;resize:vertical}.nf-my-note{padding:12px;border-left:4px solid #F7C41C;border-radius:10px;background:#FFF9E8;color:#654F20;font-size:13px;line-height:1.55}
.nf-my-empty{padding:24px;border:1px dashed #C5D8E0;border-radius:14px;background:#F9FCFD;color:#6B818C;text-align:center;line-height:1.6}.nf-my-error,.nf-my-success{margin-bottom:14px;padding:11px 13px;border-radius:10px;font-size:13px;line-height:1.5}.nf-my-error{border:1px solid #E2AAAA;background:#FFF3F3;color:#842E2E}.nf-my-success{border:1px solid #ADD4B8;background:#F2FAF4;color:#2A5E39}
.nf-my-login{max-width:620px;margin:50px auto;padding:26px;border:1px solid #D7E5EB;border-radius:22px;background:#FFF;box-shadow:0 18px 44px rgba(30,79,103,.1)}.nf-my-login h2{margin:0;color:#102E40;font-size:30px}.nf-my-login p{color:#697E88;line-height:1.65}.nf-my-login-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.nf-my-login input{min-height:46px;padding:11px;border:1px solid #BCD1DB;border-radius:10px;font:inherit}
.nf-my-flavors{display:flex;gap:7px;flex-wrap:wrap}.nf-my-flavor{padding:9px 12px;border:1px solid #C8DCE5;border-radius:999px;background:#FFF;color:#315D70;font:inherit;font-size:12px;font-weight:800;cursor:pointer}.nf-my-flavor.active{background:#14384B;border-color:#14384B;color:#FFF}
@media(max-width:760px){.nf-my{padding:18px 14px 80px}.nf-my-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.nf-my-grid,.nf-my-form{grid-template-columns:1fr}.nf-my-field.full{grid-column:auto}.nf-my-login-row{grid-template-columns:1fr}.nf-my-hero{padding:21px}.nf-my-panel{padding:16px}}
`;

const tabs = [
  ["dashboard", "Dashboard"],
  ["orders", "Orders"],
  ["reorder", "Reorder"],
  ["club", "Honey Club"],
  ["favorites", "Favorites"],
  ["delivery", "Delivery & Pickup"],
  ["account", "Account"],
];

export default function MyNectarFusionsPage({ Header, catalog, onBack, onReorder, onShopFlavor, onJoinClub, onOpenOrder }) {
  const [active, setActive] = useState("dashboard");
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [profile, setProfile] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const session = await api.session();
      if (!session?.user) {
        setContext(null);
        setLoading(false);
        return;
      }
      const next = await api.getMyNectarFusionsContext();
      setContext(next);
      setProfile({
        name: next.account?.name || "",
        phone: next.account?.phone || "",
        preferredFulfillment: next.account?.preferred_fulfillment || "flexible",
        addressLine1: next.account?.address_line1 || "",
        addressLine2: next.account?.address_line2 || "",
        city: next.account?.city || "",
        state: next.account?.state || "MI",
        zip: next.account?.zip || "",
        buildingDetails: next.account?.building_details || "",
        gateCode: next.account?.gate_code || "",
        deliveryNotes: next.account?.delivery_notes || "",
        preferredContactMethod: next.account?.preferred_contact_method || "email",
      });
    } catch (e) {
      setError(e.message || "My NectarFusions could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const { data } = api.onAuth(() => load());
    return () => data?.subscription?.unsubscribe();
  }, []);

  const orders = context?.orders || [];
  const subscriptions = context?.subscriptions || [];
  const favorites = context?.favorites || [];
  const favoriteIds = useMemo(() => new Set(favorites.map((row) => String(row.flavor_id))), [favorites]);
  const activeSubscriptions = subscriptions.filter((sub) => !["cancelled", "canceled", "ended"].includes(String(sub.status || "").toLowerCase()));
  const repeatPurchase = context?.repeatPurchase || {};
  const reorderRetentionDays = Number(repeatPurchase.reorderRetentionDays || 60);
  const reorderCutoffMs = Date.now() - reorderRetentionDays * 24 * 60 * 60 * 1000;
  const reorderEligible = (order) => {
    if (String(order?.status || "").toLowerCase() !== "done") return false;
    const completedAt = new Date(
      order?.fulfilled_at || order?.picked_up_at || order?.updated_at || order?.placed_at || 0
    ).getTime();
    return Number.isFinite(completedAt) && completedAt >= reorderCutoffMs;
  };
  const reorderOrders = orders.filter(reorderEligible);
  const reorderSuggestion = repeatPurchase.reorderSuggestion
    ? reorderOrders.find((order) => String(order.id) === String(repeatPurchase.reorderSuggestion.orderId)) || null
    : null;
  const lastOrder = orders[0] || null;
  const lastReorderOrder = reorderOrders[0] || null;
  const currentFlavors = (catalog?.flavors || []).filter((flavor) => flavor.active !== false);
  const planFor = (id) => (catalog?.plans || []).find((plan) => String(plan.id) === String(id));

  const requestLink = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter the email address you use with NectarFusions.");
      return;
    }
    setBusy("link"); setError(""); setNotice("");
    try {
      await api.requestMyNectarFusionsLink(email.trim());
      setLinkSent(true);
    } catch (e) {
      setError(e.message || "We could not send the sign-in link.");
    } finally { setBusy(""); }
  };

  const saveProfile = async () => {
    setBusy("profile"); setError(""); setNotice("");
    try {
      const account = await api.updateMyNectarFusionsProfile(profile);
      setContext((current) => ({ ...current, account }));
      setNotice("Your NectarFusions account details were saved.");
    } catch (e) {
      setError(e.message || "Your account details could not be saved.");
    } finally { setBusy(""); }
  };

  const toggleFavorite = async (flavorId) => {
    const enabled = !favoriteIds.has(String(flavorId));
    setBusy(`favorite:${flavorId}`); setError(""); setNotice("");
    try {
      const next = await api.setMyNectarFusionsFavorite(flavorId, enabled);
      setContext((current) => ({ ...current, favorites: next }));
    } catch (e) {
      setError(e.message || "Your favorites could not be updated.");
    } finally { setBusy(""); }
  };

  if (loading) {
    return <div className="nf"><style>{CSS}</style><Header eyebrow="My NectarFusions" title="MY NECTARFUSIONS" right={<button className="btn ghost" onClick={() => onBack?.(context?.account || null)}>Back to shop</button>} /><div className="nf-my"><div className="nf-my-empty">Loading your NectarFusions account…</div></div></div>;
  }

  if (!context) {
    return (
      <div className="nf"><style>{CSS}</style>
        <Header eyebrow="My NectarFusions" title="MY NECTARFUSIONS" right={<button className="btn ghost" onClick={() => onBack?.(context?.account || null)}>Back to shop</button>} />
        <div className="nf-my-login">
          <div className="nf-my-kicker">Secure customer account</div>
          <h2>Your honey, all in one place.</h2>
          <p>Use the email address you use with NectarFusions. We’ll send a secure sign-in link and connect matching order and Honey Club history after your email is verified.</p>
          {error && <div className="nf-my-error">{error}</div>}
          {linkSent ? (
            <div className="nf-my-success">Check your email for your secure My NectarFusions sign-in link. You can close this page and return from the email.</div>
          ) : (
            <div className="nf-my-login-row">
              <input type="email" value={email} placeholder="you@example.com" onChange={(event) => { setEmail(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") requestLink(); }} />
              <button className="nf-my-btn gold" type="button" disabled={busy === "link"} onClick={requestLink}>{busy === "link" ? "Sending…" : "Email My Sign-In Link"}</button>
            </div>
          )}
          <div className="nf-my-note" style={{ marginTop: 14 }}>Guest checkout still works normally. Creating My NectarFusions does not change existing order confirmation links or Honey Club billing.</div>
        </div>
      </div>
    );
  }

  const orderCard = (order, reorderMode = false) => (
    <article className="nf-my-card" key={order.id}>
      <h3>Order #{order.order_no}</h3>
      <div className="nf-my-meta">
        <span className="nf-my-pill">{dateLabel(order.placed_at)}</span>
        <span className="nf-my-pill">{cleanStatus(order.method)}</span>
        <span className={`nf-my-pill ${order.paid ? "" : "gold"}`}>{order.paid ? "Paid" : order.requires_prepay ? "Payment pending" : cleanStatus(order.status)}</span>
      </div>
      <div className="nf-my-items">
        {(order.items || []).map((item) => <div className="nf-my-item" key={item.id}><span>{item.qty}× {item.size_label} {cleanStatus(item.type)} · {item.flavor_name}</span><strong>{money(Number(item.unit_cents || 0) * Number(item.qty || 0))}</strong></div>)}
      </div>
      <p><strong>Total:</strong> {money(order.total_cents)}</p>
      <div className="nf-my-actions">
        {reorderMode ? <button className="nf-my-btn gold" type="button" onClick={() => onReorder?.(order, context.account)}>Buy Again</button> : <button className="nf-my-btn" type="button" onClick={() => onOpenOrder?.(order.token)}>View Confirmation</button>}
        {!reorderMode && reorderEligible(order) && <button className="nf-my-btn" type="button" onClick={() => onReorder?.(order, context.account)}>Buy Again</button>}
      </div>
    </article>
  );

  return (
    <div className="nf"><style>{CSS}</style>
      <Header eyebrow="My NectarFusions" title="MY NECTARFUSIONS" right={<button className="btn ghost" onClick={() => onBack?.(context?.account || null)}>Back to shop</button>} />
      <main className="nf-my">
        <section className="nf-my-hero">
          <div className="nf-my-kicker">My NectarFusions</div>
          <h1>Welcome{context.account?.name ? `, ${context.account.name.split(" ")[0]}` : ""}.</h1>
          <p>Your orders, Honey Club memberships, favorites, delivery information, and account details are connected to one verified NectarFusions login.</p>
          <div className="nf-my-head-actions"><button className="nf-my-btn" onClick={() => load()}>Refresh</button><button className="nf-my-btn danger" onClick={async () => { await api.signOut(); setContext(null); }}>Sign Out</button></div>
        </section>

        <nav className="nf-my-nav">{tabs.map(([id, label]) => <button key={id} className={active === id ? "active" : ""} onClick={() => { setActive(id); setError(""); setNotice(""); }}>{label}</button>)}</nav>
        {error && <div className="nf-my-error">{error}</div>}
        {notice && <div className="nf-my-success">{notice}</div>}

        {active === "dashboard" && <>
          <section className="nf-my-panel"><h2>Your NectarFusions Dashboard</h2><p>A quick view of what is connected to this account.</p>
            <div className="nf-my-stats">
              <div className="nf-my-stat"><span>Orders</span><strong>{orders.length}</strong></div>
              <div className="nf-my-stat"><span>Honey Club</span><strong>{activeSubscriptions.length}</strong></div>
              <div className="nf-my-stat"><span>Favorites</span><strong>{favorites.length}</strong></div>
              <div className="nf-my-stat"><span>Customer records</span><strong>{context.linkedCustomerCount || 0}</strong></div>
            </div>
          </section>
          {(reorderSuggestion || repeatPurchase.honeyClubEligible) && <section className="nf-my-panel"><h2>Recommended for you</h2><p>Helpful next steps based on your NectarFusions order history.</p>
            <div className="nf-my-grid">
              {reorderSuggestion && <div className="nf-my-card"><h3>Ready for a refill?</h3><p>Order #{reorderSuggestion.order_no} reached its suggested reorder window on {dateLabel(reorderSuggestion.reorder_due_on)}.</p><div className="nf-my-actions"><button className="nf-my-btn gold" onClick={() => onReorder?.(reorderSuggestion, context.account)}>Buy Again</button><button className="nf-my-btn" onClick={() => setActive("reorder")}>See Reorders</button></div></div>}
              {repeatPurchase.honeyClubEligible && <div className="nf-my-card"><h3>Make NectarFusions automatic</h3><p>You have {repeatPurchase.completedOrderCount} fulfilled orders connected to this account. Honey Club can turn repeat buying into a recurring delivery.</p><div className="nf-my-actions"><button className="nf-my-btn gold" onClick={() => onJoinClub?.(context?.account || null)}>Explore Honey Club</button></div></div>}
            </div>
          </section>}
          <section className="nf-my-panel"><h2>Continue where you left off</h2><p>Fast paths back into your NectarFusions relationship.</p>
            <div className="nf-my-grid">
              <div className="nf-my-card"><h3>{lastOrder ? `Last order #${lastOrder.order_no}` : "No orders yet"}</h3><p>{lastOrder ? `${dateLabel(lastOrder.placed_at)} · ${money(lastOrder.total_cents)}` : "When you place an order with this email, it will appear here."}</p>{lastOrder && <div className="nf-my-actions">{lastReorderOrder && <button className="nf-my-btn gold" onClick={() => onReorder?.(lastReorderOrder, context.account)}>Buy Again</button>}<button className="nf-my-btn" onClick={() => setActive("orders")}>Order History</button></div>}</div>
              <div className="nf-my-card"><h3>{activeSubscriptions.length ? "Honey Club connected" : "Join Honey Club"}</h3><p>{activeSubscriptions.length ? `${activeSubscriptions.length} current membership${activeSubscriptions.length === 1 ? "" : "s"}.` : "Recurring NectarFusions honey with member benefits."}</p><div className="nf-my-actions"><button className="nf-my-btn" onClick={() => activeSubscriptions.length ? setActive("club") : onJoinClub?.(context?.account || null)}>{activeSubscriptions.length ? "Manage Honey Club" : "View Honey Club"}</button></div></div>
            </div>
          </section>
        </>}

        {active === "orders" && <section className="nf-my-panel"><h2>Orders</h2><p>Your NectarFusions orders connected to this verified email.</p>{orders.length ? <div className="nf-my-grid">{orders.map((order) => orderCard(order, false))}</div> : <div className="nf-my-empty">No matching orders are connected yet.</div>}</section>}

        {active === "reorder" && <section className="nf-my-panel"><h2>Reorder</h2><p>Buy a fulfilled order again using today’s availability and pricing. Reorder options stay here for {reorderRetentionDays} days after fulfillment.</p>{reorderOrders.length ? <div className="nf-my-grid">{reorderOrders.map((order) => orderCard(order, true))}</div> : <div className="nf-my-empty">No fulfilled orders from the last {reorderRetentionDays} days are available to reorder.</div>}</section>}

        {active === "club" && <section className="nf-my-panel"><h2>Honey Club</h2><p>Membership status, delivery timing, preferences, and billing setup.</p>{subscriptions.length ? <div className="nf-my-grid">{subscriptions.map((sub) => { const plan = planFor(sub.plan_id); return <article className="nf-my-card" key={sub.id}><h3>{plan?.name || sub.plan_id}</h3><div className="nf-my-meta"><span className="nf-my-pill">#{sub.sub_no}</span><span className="nf-my-pill">{cleanStatus(sub.status)}</span><span className="nf-my-pill">{sub.cadence === "1mo" ? "Every month" : "Every 2 months"}</span></div><p>{plan?.contents || "Honey Club membership"}</p><div className="nf-my-items"><div className="nf-my-item"><span>Next delivery</span><strong>{dateLabel(sub.next_delivery_date)}</strong></div><div className="nf-my-item"><span>Boxes recorded</span><strong>{sub.boxes_sent || 0}</strong></div><div className="nf-my-item"><span>Payment</span><strong>{sub.billing_mode === "card_setup_required" ? "Card setup required" : sub.billing_mode === "market_manual" ? "Market / manual" : "Card billing"}</strong></div><div className="nf-my-item"><span>Flavor preference</span><strong>{cleanStatus(sub.flavor_mode)}</strong></div></div><div className="nf-my-actions"><button className="nf-my-btn" onClick={() => window.location.assign(`/club/${sub.token}`)}>Manage Membership</button></div></article>; })}</div> : <div className="nf-my-empty">No Honey Club membership is linked to this account yet.<div className="nf-my-actions" style={{ justifyContent: "center" }}><button className="nf-my-btn gold" onClick={() => onJoinClub?.(context?.account || null)}>Explore Honey Club</button></div></div>}</section>}

        {active === "favorites" && <section className="nf-my-panel"><h2>Favorites</h2><p>Save the NectarFusions flavors you want to find quickly next time.</p><div className="nf-my-flavors">{currentFlavors.map((flavor) => <button key={flavor.id} className={`nf-my-flavor ${favoriteIds.has(String(flavor.id)) ? "active" : ""}`} disabled={busy === `favorite:${flavor.id}`} onClick={() => toggleFavorite(flavor.id)}>{favoriteIds.has(String(flavor.id)) ? "★" : "☆"} {flavor.name}</button>)}</div>{favorites.length > 0 && <div className="nf-my-actions" style={{ marginTop: 18 }}>{favorites.map((favorite) => { const flavor = currentFlavors.find((row) => String(row.id) === String(favorite.flavor_id)); return flavor ? <button key={favorite.flavor_id} className="nf-my-btn" onClick={() => onShopFlavor?.(flavor.id, context?.account || null)}>Shop {flavor.name}</button> : null; })}</div>}</section>}

        {active === "delivery" && profile && <section className="nf-my-panel"><h2>Delivery & Pickup</h2><p>Save defaults for future NectarFusions orders. Existing Honey Club memberships keep their own fulfillment settings until you update that membership.</p><div className="nf-my-form"><div className="nf-my-field full"><label>Preferred fulfillment</label><select value={profile.preferredFulfillment} onChange={(e) => setProfile((x) => ({ ...x, preferredFulfillment: e.target.value }))}><option value="flexible">Flexible</option><option value="market">Market pickup</option><option value="delivery">Local delivery</option><option value="ship">Shipping</option></select></div><div className="nf-my-field full"><label>Street address</label><input value={profile.addressLine1} onChange={(e) => setProfile((x) => ({ ...x, addressLine1: e.target.value }))} /></div><div className="nf-my-field full"><label>Address line 2</label><input value={profile.addressLine2} onChange={(e) => setProfile((x) => ({ ...x, addressLine2: e.target.value }))} /></div><div className="nf-my-field"><label>City</label><input value={profile.city} onChange={(e) => setProfile((x) => ({ ...x, city: e.target.value }))} /></div><div className="nf-my-field"><label>State</label><input maxLength={2} value={profile.state} onChange={(e) => setProfile((x) => ({ ...x, state: e.target.value.toUpperCase() }))} /></div><div className="nf-my-field"><label>ZIP</label><input inputMode="numeric" maxLength={5} value={profile.zip} onChange={(e) => setProfile((x) => ({ ...x, zip: e.target.value.replace(/\D/g, "").slice(0, 5) }))} /></div><div className="nf-my-field"><label>Preferred contact</label><select value={profile.preferredContactMethod} onChange={(e) => setProfile((x) => ({ ...x, preferredContactMethod: e.target.value }))}><option value="email">Email</option><option value="text">Text</option><option value="call">Call</option></select></div><div className="nf-my-field full"><label>Building details</label><input value={profile.buildingDetails} onChange={(e) => setProfile((x) => ({ ...x, buildingDetails: e.target.value }))} placeholder="Apartment, suite, business entrance, etc." /></div><div className="nf-my-field full"><label>Gate code</label><input value={profile.gateCode} onChange={(e) => setProfile((x) => ({ ...x, gateCode: e.target.value }))} /></div><div className="nf-my-field full"><label>Delivery notes</label><textarea value={profile.deliveryNotes} onChange={(e) => setProfile((x) => ({ ...x, deliveryNotes: e.target.value }))} /></div></div><div className="nf-my-actions"><button className="nf-my-btn gold" disabled={busy === "profile"} onClick={saveProfile}>{busy === "profile" ? "Saving…" : "Save Delivery Preferences"}</button></div></section>}

        {active === "account" && profile && <section className="nf-my-panel"><h2>Account</h2><p>Your verified NectarFusions identity and contact information.</p><div className="nf-my-form"><div className="nf-my-field full"><label>Email</label><input value={context.account.email || ""} disabled /></div><div className="nf-my-field"><label>Name</label><input value={profile.name} onChange={(e) => setProfile((x) => ({ ...x, name: e.target.value }))} /></div><div className="nf-my-field"><label>Phone</label><input value={profile.phone} onChange={(e) => setProfile((x) => ({ ...x, phone: e.target.value }))} /></div></div><div className="nf-my-note" style={{ marginTop: 14 }}>This account currently connects {context.linkedCustomerCount || 0} historical NectarFusions customer record{context.linkedCustomerCount === 1 ? "" : "s"}. New orders using this verified email are connected automatically when you return.</div><div className="nf-my-actions"><button className="nf-my-btn gold" disabled={busy === "profile"} onClick={saveProfile}>{busy === "profile" ? "Saving…" : "Save Account"}</button><button className="nf-my-btn danger" onClick={async () => { await api.signOut(); setContext(null); }}>Sign Out</button></div></section>}
      </main>
    </div>
  );
}
