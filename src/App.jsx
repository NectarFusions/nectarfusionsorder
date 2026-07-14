import { useState, useMemo, useEffect, useCallback } from "react";
import * as api from "./lib/api";

/* ============================================================
   NECTARFUSIONS — ORDER SYSTEM
   All prices, stock rules, delivery rules and the cancellation
   window are enforced in Postgres. This file only asks.
   ============================================================ */

const TYPES = [
  { id: "regular", name: "Regular", tagline: "Pourable",
    what: "Raw liquid honey, exactly as it comes from the hive. Golden, glossy, and it drizzles.",
    use: "Tea, coffee, drizzling over cheese or cornbread, cooking — anywhere you want it to run.",
    note: "Regular honey will eventually crystallize and turn cloudy. That's proof it's real. Set the sealed jar in warm water for ten minutes and it clears right up." },
  { id: "spun", name: "Spun", tagline: "Spreadable",
    what: "The same honey, crystallized on purpose. We control it so the crystals stay microscopic — the result is thick, silky and pale. Some people call it creamed or whipped honey.",
    use: "Toast, biscuits, bagels, warm rolls. Anything you'd butter. It won't drip off the knife.",
    note: "Spun honey never turns grainy, because it's already crystallized in the smoothest way possible. It stays spreadable straight from the pantry." },
];

const CADENCES = [
  { id: "2mo", label: "Every 2 months", note: "Recommended — honey lasts" },
  { id: "1mo", label: "Every month", note: "For heavy users" },
];

const CONTACT = { email: "info@nectar-fusions.com", phone: "(989) 555-0100" };

const c = {
  gold: "#F7C41C", amber: "#E69B00", black: "#111111", white: "#F5EFE7",
  brown: "#7B5821", darkBrown: "#4A3313", cocoa: "#1B1005", tan: "#9A8D79",
  orange: "#FF7A1A", red: "#FF3B30", sky: "#2FA8E8",
};

const money = (n) => `$${Number(n).toFixed(2)}`;
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const parseDay = (s) => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const fmt = (d) => `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function deliveryDays(zone, blocked, count = 6) {
  const out = [], now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; out.length < count && i < 60; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (!zone.days.includes(d.getDay())) continue;
    if (blocked.includes(iso(d))) continue;
    if (i === 0 && !(zone.same_day_ok && now.getHours() < zone.cutoff_hour)) continue;
    if (i === 1 && now.getHours() >= zone.cutoff_hour && !zone.same_day_ok) continue;
    out.push(d);
  }
  return out;
}

const Logo = ({ size = 72 }) => (
  <img src="/logo.png" alt="NectarFusions" width={size} height={size}
    style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block" }} />
);

/* --- deep link: /order/<token> lets a customer reopen their order later --- */
const TOKEN_RE = /^\/order\/([0-9a-f-]{36})\/?$/i;
const tokenFromUrl = () => (window.location.pathname.match(TOKEN_RE) || [])[1] || null;
const pushOrderUrl = (token) => window.history.pushState({}, "", `/order/${token}`);
const pushHome = () => window.history.pushState({}, "", "/");
export const orderUrl = (token) => `${window.location.origin}/order/${token}`;

const Field = ({ value, onChange, placeholder, type, required = true, rows }) => {
  const filled = String(value || "").trim().length > 0;
  const cls = required ? (filled ? "done" : "needs") : "";
  return (
    <div className="field">
      {rows
        ? <textarea className={cls} rows={rows} placeholder={placeholder} value={value} onChange={onChange} />
        : <input className={cls} inputMode={type} placeholder={placeholder} value={value} onChange={onChange} />}
      {required && !rows && (filled
        ? <span className="ok" aria-hidden="true">✓</span>
        : <span className="req" aria-hidden="true">Required</span>)}
    </div>
  );
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700&family=Yellowtail&display=swap');
.nf *, .nf *::before, .nf *::after { box-sizing: border-box; }
.nf { font-family:'Montserrat',system-ui,sans-serif; background:${c.white}; color:${c.black}; min-height:100vh; padding:0 0 132px; -webkit-font-smoothing:antialiased; }
.nf-wrap { max-width:720px; margin:0 auto; padding:0 18px; }
.head { background:#FFF; border-bottom:1px solid #E7DCC9; }
.display { font-family:'Bebas Neue',Impact,sans-serif; letter-spacing:.01em; line-height:.92; margin:0; }
.script { font-family:'Yellowtail',cursive; }
.eyebrow { font-weight:700; font-size:10.5px; letter-spacing:.14em; text-transform:uppercase; color:${c.brown}; }
.card { background:#FFF; border:1px solid #E2D6C4; border-radius:8px; }
.btn { font-family:'Montserrat',sans-serif; font-weight:600; cursor:pointer; border-radius:6px; border:2px solid #D3BF9B; background:#FFF; color:${c.black}; transition:border-color .15s, background .15s, box-shadow .15s; }
.btn:hover { border-color:${c.amber}; background:#FFFDF5; }
.btn:focus-visible { outline:none; border-color:${c.amber}; box-shadow:0 0 0 3px rgba(47,168,232,.35); }
.btn.on { background:${c.gold}; border-color:${c.amber}; box-shadow:0 2px 0 ${c.amber}; }
.btn.solid { background:${c.amber}; color:${c.black}; border-color:#C98700; box-shadow:0 2px 0 #C98700; }
.btn.solid:hover { background:${c.gold}; border-color:${c.amber}; }
.btn.solid:disabled { background:#E7DCC9; color:#8C8271; border-color:#D3BF9B; cursor:not-allowed; box-shadow:none; }
.btn.ghost { background:transparent; border-color:transparent; color:${c.brown}; box-shadow:none; }
.btn.ghost:hover { background:#F0E7D8; }
.btn.danger { background:#FFF; border-color:${c.red}; color:${c.red}; box-shadow:none; }
.btn.danger:hover { background:${c.red}; color:#fff; }
.btn:disabled { opacity:.55; cursor:not-allowed; }
.nf input, .nf textarea { font-family:'Montserrat',sans-serif; font-weight:500; width:100%; padding:14px; background:#FFF; border:2px solid #C4AE86; border-radius:6px; color:${c.black}; font-size:16px; box-shadow:inset 0 2px 4px rgba(74,51,19,.06); transition:border-color .15s, box-shadow .15s, background .15s; }
.nf input:hover, .nf textarea:hover { border-color:${c.brown}; }
.nf input:focus, .nf textarea:focus { outline:none; border-color:${c.amber}; background:#FFFDF5; box-shadow:0 0 0 4px rgba(230,155,0,.22); }
.nf input::placeholder, .nf textarea::placeholder { color:#9A8D79; font-weight:500; }
.nf input.needs, .nf textarea.needs { border-color:${c.amber}; background:#FFFBF0; box-shadow:inset 3px 0 0 ${c.gold}, inset 0 2px 4px rgba(74,51,19,.05); }
.nf input.done, .nf textarea.done { border-color:#8FA97B; background:#FCFDFA; }
.field { position:relative; }
.req { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${c.amber}; }
.ok { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; font-size:15px; font-weight:700; color:#6E8C58; }
.tag { font-weight:700; font-size:9px; letter-spacing:.1em; text-transform:uppercase; background:${c.orange}; color:#fff; padding:3px 6px; border-radius:3px; white-space:nowrap; }
.num { font-family:'Bebas Neue',sans-serif; letter-spacing:.06em; }
.pol h2 { font-family:'Bebas Neue',sans-serif; font-size:25px; margin:0 0 8px; color:${c.darkBrown}; }
.pol p { font-size:14.5px; line-height:1.65; margin:0 0 10px; }
.err { background:#FFF3F2; border:2px solid ${c.red}; color:#8A1F19; border-radius:6px; padding:12px 14px; font-size:13.5px; line-height:1.55; font-weight:500; }
@media (prefers-reduced-motion: reduce) { .nf * { transition:none !important; } }
`;

export default function App() {
  const [cat, setCat] = useState(null);
  const [boot, setBoot] = useState(null);
  const [view, setView] = useState("shop");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [cart, setCart] = useState([]);
  const [pickSize, setPickSize] = useState("4oz");
  const [pickType, setPickType] = useState("regular");
  const [typeInfo, setTypeInfo] = useState(false);
  const [method, setMethod] = useState(null);
  const [zip, setZip] = useState("");
  const [slot, setSlot] = useState(null);
  const [cust, setCust] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [receipt, setReceipt] = useState(null);
  const [ctaOff, setCtaOff] = useState(false);
  const [tick, setTick] = useState(0);

  const [plan, setPlan] = useState(null);
  const [cadence, setCadence] = useState("2mo");
  const [subMethod, setSubMethod] = useState(null);
  const [subZip, setSubZip] = useState("");
  const [subDone, setSubDone] = useState(null);

  const reload = useCallback(async () => {
    try { setCat(await api.getCatalog()); }
    catch (e) { setBoot(e.message); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  /* If someone lands on /order/<token> — from their email, a bookmark, or
     just hitting refresh — pull that order straight back up. */
  useEffect(() => {
    const open = async (t) => {
      if (!t) { setReceipt(null); return; }
      try {
        const o = await api.getOrder(t);
        setReceipt({ ...o, token: t });
      } catch {
        setReceipt(null);
        setErr("That order link isn't valid. Check the link in your email, or text us.");
      }
    };
    open(tokenFromUrl());
    const onPop = () => open(tokenFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    api.session().then(async (s) => {
      setUser(s?.user ?? null);
      if (s?.user) setIsAdmin(await api.amAdmin());
    });
    const { data } = api.onAuth(async (s) => {
      setUser(s?.user ?? null);
      setIsAdmin(s?.user ? await api.amAdmin() : false);
    });
    return () => data?.subscription?.unsubscribe();
  }, []);

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  /* refresh the receipt so the cancel countdown comes from the server */
  useEffect(() => {
    if (!receipt?.token) return;
    api.getOrder(receipt.token).then((o) => setReceipt((r) => ({ ...r, ...o }))).catch(() => {});
  }, [tick, receipt?.token]);

  const B = cat?.bundle ?? { size: "4oz", count: 3, price: 20 };
  const sizeOf = (id) =>
    cat?.sizes?.find((s) => s.id === id) ?? { id, label: id, price: 0 };
  const typeName = (id) => TYPES.find((t) => t.id === id)?.name ?? "Regular";

  const shelf = useMemo(() => {
    if (!cat) return [];
    const on = cat.flavors.filter((f) => api.inStock(f, pickSize, pickType));
    const best = on.find((f) => f.name === cat.bestSeller);
    return best ? [best, ...on.filter((f) => f !== best)] : on;
  }, [cat, pickSize, pickType]);

  const addJar = (f) => setCart((cc) => {
    const i = cc.findIndex((x) => x.flavor_id === f.id && x.size_id === pickSize && x.type === pickType);
    if (i > -1) { const n = [...cc]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n; }
    return [...cc, { flavor_id: f.id, flavor: f.name, hex: f.hex, size_id: pickSize, type: pickType, qty: 1 }];
  });
  const bump = (i, d) => setCart((cc) => cc.map((x, j) => j === i ? { ...x, qty: x.qty + d } : x).filter((x) => x.qty > 0));

  /* Preview only. place_order recomputes this server-side and its answer wins. */
  const price = useMemo(() => {
    if (!cat) return { sub: 0, saved: 0, bundles: 0, jars: 0 };
    const jars = cart.filter((x) => x.size_id === B.size).reduce((s, x) => s + x.qty, 0);
    const bundles = Math.floor(jars / B.count);
    const loose = jars - bundles * B.count;
    const sub = bundles * B.price + loose * sizeOf(B.size).price +
      cart.filter((x) => x.size_id !== B.size).reduce((s, x) => s + x.qty * sizeOf(x.size_id).price, 0);
    const full = cart.reduce((s, x) => s + x.qty * sizeOf(x.size_id).price, 0);
    return { sub, saved: full - sub, bundles, jars };
  }, [cart, cat, B.size, B.count, B.price]);

  const zone = cat?.zones?.find((z) => z.zips.includes(zip.trim()));
  const subZone = cat?.zones?.find((z) => z.zips.includes(subZip.trim()));
  const outOfArea = method === "delivery" && zip.trim().length === 5 && !zone;
  const shipOK = !!cat && price.sub >= cat.shipFreeOver;
  const toShip = cat ? Math.max(0, cat.shipFreeOver - price.sub) : 0;
  const fee = method === "delivery" && zone ? (price.sub >= zone.freeOver ? 0 : zone.fee) : 0;
  const belowMin = method === "delivery" && zone && price.sub < zone.minimum;
  const total = price.sub + fee;
  const slots = zone && cat ? deliveryDays(zone, cat.blockedDates ?? []) : [];

  useEffect(() => { if (method === "ship" && !shipOK) { setMethod(null); setSlot(null); } }, [shipOK, method]);
  useEffect(() => { setSlot(method === "ship" ? { kind: "ship" } : null); }, [method, zone?.id]);

  if (boot) {
    return <div className="nf"><style>{CSS}</style>
      <div className="nf-wrap" style={{ paddingTop: 80 }}>
        <div className="err">Couldn&rsquo;t reach the database.<br />{boot}</div>
      </div></div>;
  }
  if (!cat) {
    return <div className="nf"><style>{CSS}</style>
      <div className="nf-wrap" style={{ paddingTop: 100, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><Logo size={70} /></div>
        <div className="eyebrow">Loading the shelf…</div>
      </div></div>;
  }

  const missing = [];
  if (slot) {
    if (!cust.name.trim()) missing.push("your name");
    if (!cust.phone.trim()) missing.push("a phone number");
    if (!cust.email.trim()) missing.push("an email");
    if (method !== "market" && !cust.address.trim()) missing.push("an address");
  }
  const canPlace = cart.length && slot && !missing.length && !belowMin && !busy;

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const r = await api.placeOrder({
        items: cart.map(({ flavor_id, size_id, type, qty }) => ({ flavor_id, size_id, type, qty })),
        method, name: cust.name, phone: cust.phone, email: cust.email,
        address: cust.address || null, notes: cust.notes || null,
        zip: method === "delivery" ? zip : null,
        day: slot.kind === "delivery" ? iso(slot.date) : null,
        marketDateId: slot.kind === "market" ? slot.m.id : null,
      });
      const full = await api.getOrder(r.token);
      pushOrderUrl(r.token);   // survives a refresh, and it's what the email links to
      setReceipt({ ...full, token: r.token, email: cust.email, address: cust.address });
      setCart([]); setSlot(null); setMethod(null); setZip(""); setCtaOff(false);
      reload();  // stock may have moved
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function pay() {
    setBusy(true); setErr(null);
    try {
      const url = receipt.pay_url || await api.payLink(receipt.token);
      window.location.href = url;   // hand off to Square's hosted checkout
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  async function kill() {
    if (!confirm(`Cancel order #${receipt.order_no}?`)) return;
    setBusy(true); setErr(null);
    try {
      await api.cancelOrder(receipt.token);
      setReceipt({ ...receipt, status: "cancelled" });
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const Header = ({ eyebrow, title, right, big }) => (
    <div className="head">
      <div className="nf-wrap" style={{ paddingTop: 16, paddingBottom: big ? 22 : 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div className="eyebrow" style={{ color: c.tan }}>Coleman, Michigan</div>
          <div style={{ display: "flex", gap: 2 }}>{right}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: big ? 12 : 10, marginTop: 12 }}>
          <Logo size={big ? 88 : 46} />
          <div style={{ minWidth: 0 }}>
            {eyebrow && <div className="eyebrow" style={{ color: c.amber, marginBottom: 2 }}>{eyebrow}</div>}
            <h1 className="display" style={{ fontSize: big ? 44 : 30 }}>
              {title || <>NECTAR<span style={{ color: c.amber }}>FUSIONS</span></>}
            </h1>
            {big && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 3, flexWrap: "wrap" }}>
                <span className="script" style={{ color: c.amber, fontSize: 20 }}>nature&rsquo;s happiness</span>
                <span style={{ color: c.tan }}>|</span>
                <span className="eyebrow" style={{ color: c.brown }}>honey infused</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const nav = (
    <>
      <button className="btn ghost" onClick={() => setView("subscribe")} style={{ padding: "5px 9px", fontSize: 11 }}>Subscribe</button>
      <button className="btn ghost" onClick={() => setView("policy")} style={{ padding: "5px 9px", fontSize: 11 }}>Policy</button>
      <button className="btn ghost" onClick={() => setView(isAdmin ? "admin" : "login")}
        style={{ padding: "5px 9px", fontSize: 11, color: c.tan }}>Admin</button>
    </>
  );

  /* ================= LOGIN ================= */
  if (view === "login") return <Login onDone={() => setView("admin")} onBack={() => setView("shop")} Header={Header} />;

  /* ================= ADMIN ================= */
  if (view === "admin") {
    if (!isAdmin) return <Login onDone={() => setView("admin")} onBack={() => setView("shop")} Header={Header} />;
    return <Admin cat={cat} reload={reload} Header={Header}
      onExit={() => setView("shop")} onSignOut={async () => { await api.signOut(); setView("shop"); }} />;
  }

  /* ================= RECEIPT ================= */
  if (receipt) {
    const cancelled = receipt.status === "cancelled";
    const left = receipt.minutes_left ?? 0;
    // A paid order can't be self-cancelled — that's a refund, and refunds are a decision.
    const canKill = !cancelled && left > 0 && !receipt.paid;
    return (
      <div className="nf"><style>{CSS}</style>
        <div className="head">
          <div className="nf-wrap" style={{ paddingTop: 26, paddingBottom: 28, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center" }}><Logo size={68} /></div>
            <div className="eyebrow" style={{ color: cancelled ? c.tan : c.amber, marginTop: 10 }}>
              {cancelled ? "Cancelled" : "Order confirmed"}
            </div>
            <div className="num" style={{ fontSize: 74, marginTop: 2, color: cancelled ? c.tan : c.black,
              textDecoration: cancelled ? "line-through" : "none" }}>#{receipt.order_no}</div>
            {!cancelled && receipt.method === "market" && (
              <p style={{ color: c.brown, fontSize: 14.5, margin: "4px auto 0", maxWidth: 320, lineHeight: 1.55 }}>
                Show this number at the table and we&rsquo;ll have your jars ready.
              </p>
            )}
          </div>
        </div>

        <div className="nf-wrap" style={{ paddingTop: 24 }}>
          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

          {cancelled ? (
            <div className="card" style={{ padding: 20, textAlign: "center", fontSize: 15, lineHeight: 1.6 }}>
              Order #{receipt.order_no} is cancelled. Nothing is owed.
            </div>
          ) : (
            <>
              <div className="card" style={{ padding: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>
                  {receipt.method === "market" ? "Pickup" : receipt.method === "ship" ? "Shipping" : "Delivery"}
                </div>
                {receipt.items?.map((it, i) => (
                  <div key={i} style={{ fontSize: 14.5, padding: "3px 0" }}>
                    {it.qty}× {it.size} {typeName(it.type)} — {it.flavor}
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #E2D6C4", marginTop: 14, paddingTop: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600 }}>Total</span>
                  <span className="num" style={{ fontSize: 30, color: c.darkBrown }}>{money(receipt.total_cents / 100)}</span>
                </div>
              </div>

              {receipt.requires_prepay && !receipt.paid && (
                <div className="card" style={{ padding: 17, marginTop: 16, borderColor: c.amber, background: "#FFFBF0" }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Payment</div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
                    {receipt.method === "market"
                      ? <>This order needs to be paid before we pack it. Once it&rsquo;s paid, your jars are set aside and waiting at the table.</>
                      : <>Pay now and we&rsquo;ll start packing. Nothing leaves our hands until it&rsquo;s paid.</>}
                  </p>
                  <button className="btn solid" style={{ width: "100%", padding: 14, fontSize: 15 }}
                    disabled={busy} onClick={pay}>
                    {busy ? "Opening Square…" : `Pay ${money(receipt.total_cents / 100)} securely`}
                  </button>
                  <div style={{ fontSize: 11.5, color: c.brown, marginTop: 8, textAlign: "center" }}>
                    Card handled by Square. We never see your card number.
                  </div>
                </div>
              )}

              {receipt.paid && (
                <div className="card" style={{ padding: 15, marginTop: 16, borderColor: "#8FA97B",
                  background: "#FCFDFA", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#4F6B3C" }}>✓ Paid</div>
                  <div style={{ fontSize: 13, color: c.brown, marginTop: 3 }}>
                    Thank you. We&rsquo;re packing your jars.
                  </div>
                </div>
              )}

              {!receipt.requires_prepay && !receipt.paid && (
                <p style={{ color: c.brown, fontSize: 14, marginTop: 16, lineHeight: 1.6, textAlign: "center" }}>
                  Pay at the market table — cash, card, or tap.
                </p>
              )}

              <p style={{ color: c.tan, fontSize: 13, marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
                A confirmation is on its way to <strong style={{ color: c.brown }}>{receipt.email}</strong>.
              </p>

              <div className="card" style={{ padding: 17, marginTop: 20, background: "#FFFBF0", borderColor: c.gold }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                  <Logo size={30} />
                  <div className="display" style={{ fontSize: 23 }}>JOIN THE HONEY CLUB</div>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
                  {receipt.fee_cents > 0
                    ? <>You just paid <strong>{money(receipt.fee_cents / 100)}</strong> for delivery. Members never do — no fee, no minimum. Same shelf price on the honey, plus a bonus jar every third box.</>
                    : <>Same shelf price on the honey, free delivery with no minimum, and a bonus jar every third box.</>}
                </p>
                <button className="btn solid" style={{ width: "100%", padding: 13 }}
                  onClick={() => { pushHome(); setReceipt(null); setView("subscribe"); }}>See the boxes</button>
              </div>

              {canKill ? (
                <div style={{ marginTop: 22, textAlign: "center" }}>
                  <button className="btn danger" style={{ padding: "12px 24px" }} onClick={kill} disabled={busy}>
                    {busy ? "Cancelling…" : "Cancel this order"}
                  </button>
                  <div style={{ fontSize: 12.5, color: c.tan, marginTop: 8 }}>
                    You can cancel for another <strong style={{ color: c.brown }}>{left} min</strong>.
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: 14, marginTop: 22, textAlign: "center", background: "#FBF7F1",
                  fontSize: 13.5, color: c.brown, lineHeight: 1.55 }}>
                  The cancellation window has closed — your jars are being packed. Need a change? Call or text.
                </div>
              )}
            </>
          )}

          <div className="card" style={{ padding: 14, marginTop: 26, background: "#FBF7F1", fontSize: 12.5,
            color: c.brown, lineHeight: 1.6, textAlign: "center" }}>
            Keep this page — <strong style={{ color: c.darkBrown }}>bookmark it or find it in your email</strong> — and you
            can pull your order back up any time.
          </div>
          <button className="btn ghost" style={{ width: "100%", padding: 14, marginTop: 10 }}
            onClick={() => { pushHome(); setReceipt(null); setErr(null); setCust({ name:"", phone:"", email:"", address:"", notes:"" }); }}>
            Start another order
          </button>
        </div>
      </div>
    );
  }

  /* ================= SUBSCRIBE ================= */
  if (view === "subscribe") {
    if (subDone) {
      return (
        <div className="nf"><style>{CSS}</style>
          <div className="head">
            <div className="nf-wrap" style={{ paddingTop: 26, paddingBottom: 28, textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center" }}><Logo size={68} /></div>
              <div className="eyebrow" style={{ color: c.amber, marginTop: 10 }}>Welcome to the club</div>
              <div className="num" style={{ fontSize: 66, marginTop: 2 }}>#{subDone.subNo}</div>
            </div>
          </div>
          <div className="nf-wrap" style={{ paddingTop: 24 }}>
            <div className="card" style={{ padding: 18, textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{subDone.planName}</div>
              <div className="num" style={{ fontSize: 30, color: c.darkBrown, marginTop: 6 }}>{money(subDone.price)} per box</div>
            </div>
            <p style={{ fontSize: 14, color: c.brown, marginTop: 18, lineHeight: 1.6, textAlign: "center" }}>
              We&rsquo;ll email you a secure Square link to put a card on file. Nothing is charged until you do.
            </p>
            <button className="btn ghost" style={{ width: "100%", padding: 14, marginTop: 22 }}
              onClick={() => { setSubDone(null); setPlan(null); setSubMethod(null); setSubZip(""); setView("shop"); }}>
              Back to the shop
            </button>
          </div>
        </div>
      );
    }

    const p = cat.plans.find((x) => x.id === plan);
    const planShipOK = p && p.price >= cat.shipFreeOver;
    const subOK = p && subMethod && (subMethod !== "delivery" || subZone) &&
      cust.name.trim() && cust.phone.trim() && cust.email.trim() &&
      (subMethod === "market" || cust.address.trim()) && !busy;

    const join = async () => {
      setBusy(true); setErr(null);
      try {
        const r = await api.startSubscription({
          planId: p.id, cadence, method: subMethod,
          name: cust.name, phone: cust.phone, email: cust.email,
          address: cust.address || null, zip: subMethod === "delivery" ? subZip : null,
        });
        // Straight to Square to put a card on file. Nothing is charged
        // until they do, and the subscription stays "pending" until
        // Square's webhook tells us the card is real.
        const url = await api.subscribeLink(r.token);
        window.location.href = url;
      } catch (e) { setErr(e.message); }
      setBusy(false);
    };

    return (
      <div className="nf"><style>{CSS}</style>
        <Header eyebrow="The Honey Club" title="SUBSCRIBE"
          right={<button className="btn ghost" onClick={() => setView("shop")} style={{ padding: "6px 12px", fontSize: 12 }}>Back to shop</button>} />
        <div className="nf-wrap" style={{ paddingTop: 24 }}>
          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

          <p style={{ fontSize: 15.5, lineHeight: 1.65, margin: "0 0 6px" }}>
            <strong>{cat.flavors.length} flavors is a wonderful problem and an impossible decision.</strong> So we make it for you.
          </p>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: c.brown, margin: "0 0 22px" }}>
            Every box, we pick your jars — one you&rsquo;ll recognize, one you&rsquo;d never have tried. Packed by hand in Coleman.
          </p>

          <div className="card" style={{ padding: 16, marginBottom: 26, background: "#FFFBF0", borderColor: c.gold }}>
            <div className="eyebrow" style={{ marginBottom: 9 }}>You pay shelf price. Here&rsquo;s what&rsquo;s free.</div>
            {[
              ["Free local delivery", "No fee, no minimum — ever."],
              ["A bonus jar every 3rd box", "Our pick. Free."],
              ["Your price is locked", "Whatever you join at, you keep."],
              ["First pick", "Seasonal flavors go to members first."],
              ["Skip anytime", "One tap. No phone call."],
            ].map(([t, d]) => (
              <div key={t} style={{ display: "flex", gap: 9, marginBottom: 7 }}>
                <span style={{ color: c.amber, fontWeight: 700 }}>✦</span>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                  <strong>{t}</strong> — <span style={{ color: c.brown }}>{d}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="eyebrow" style={{ marginBottom: 10 }}>Choose your box</div>
          {cat.plans.map((pl) => (
            <button key={pl.id} className={`btn ${plan === pl.id ? "on" : ""}`}
              onClick={() => { setPlan(pl.id); if (subMethod === "ship" && pl.price < cat.shipFreeOver) setSubMethod(null); }}
              style={{ width: "100%", padding: "14px 15px", marginBottom: 8, textAlign: "left",
                display: "flex", alignItems: "center", gap: 12, borderColor: pl.is_bulk && plan !== pl.id ? c.sky : undefined }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span className="display" style={{ fontSize: 23 }}>{pl.name.toUpperCase()}</span>
                  {pl.is_bulk && <span className="tag" style={{ background: c.sky }}>Ships free</span>}
                </div>
                <div style={{ fontSize: 12.5, color: c.brown, marginTop: 2 }}>{pl.contents}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div className="num" style={{ fontSize: 26 }}>{money(pl.price)}</div>
                <div style={{ fontSize: 10.5, color: c.tan, fontWeight: 600 }}>per box</div>
              </div>
            </button>
          ))}

          {p && (
            <>
              <div className="eyebrow" style={{ margin: "26px 0 10px" }}>How often?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {CADENCES.map((cd) => (
                  <button key={cd.id} className={`btn ${cadence === cd.id ? "on" : ""}`} onClick={() => setCadence(cd.id)}
                    style={{ padding: 13, textAlign: "left" }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700 }}>{cd.label}</div>
                    <div style={{ fontSize: 11.5, opacity: .72, marginTop: 2 }}>{cd.note}</div>
                  </button>
                ))}
              </div>

              <div className="eyebrow" style={{ margin: "26px 0 10px" }}>How do you want it?</div>
              <div style={{ display: "grid", gap: 8 }}>
                <button className={`btn ${subMethod === "market" ? "on" : ""}`} onClick={() => setSubMethod("market")}
                  style={{ padding: 14, textAlign: "left" }}>
                  <div className="display" style={{ fontSize: 21 }}>MARKET PICKUP</div>
                  <div style={{ fontSize: 12, opacity: .72, marginTop: 2 }}>Grab it from our table. Free.</div>
                </button>
                <button className={`btn ${subMethod === "delivery" ? "on" : ""}`} onClick={() => setSubMethod("delivery")}
                  style={{ padding: 14, textAlign: "left" }}>
                  <div className="display" style={{ fontSize: 21 }}>LOCAL DELIVERY</div>
                  <div style={{ fontSize: 12, opacity: .72, marginTop: 2 }}>
                    <strong style={{ color: c.amber }}>Free for members</strong> — no minimum.
                  </div>
                </button>
                {planShipOK && (
                  <button className={`btn ${subMethod === "ship" ? "on" : ""}`} onClick={() => setSubMethod("ship")}
                    style={{ padding: 14, textAlign: "left", borderColor: subMethod === "ship" ? c.amber : c.sky }}>
                    <div className="display" style={{ fontSize: 21 }}>FREE SHIPPING</div>
                    <div style={{ fontSize: 12, opacity: .72, marginTop: 2 }}>Anywhere in Michigan</div>
                  </button>
                )}
              </div>

              {subMethod === "delivery" && (
                <div style={{ marginTop: 12 }}>
                  <input className={subZone ? "done" : "needs"} placeholder="Your ZIP code" value={subZip}
                    maxLength={5} inputMode="numeric" onChange={(e) => setSubZip(e.target.value.replace(/\D/g, ""))} />
                  {subZip.length === 5 && !subZone && (
                    <div className="err" style={{ marginTop: 8 }}>We don&rsquo;t deliver to {subZip}. Choose market pickup instead.</div>
                  )}
                  {subZone && (
                    <div className="card" style={{ padding: 13, marginTop: 8, fontSize: 13.5, lineHeight: 1.55 }}>
                      {subZone.name} — we run {subZone.day_label}, {subZone.window_label}.
                    </div>
                  )}
                </div>
              )}

              <div className="eyebrow" style={{ margin: "26px 0 10px" }}>Your details</div>
              <div style={{ display: "grid", gap: 10 }}>
                <Field placeholder="Name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
                <Field placeholder="Phone" type="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
                <Field placeholder="Email — for your card link" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
                {subMethod && subMethod !== "market" && (
                  <Field placeholder="Address" value={cust.address} onChange={(e) => setCust({ ...cust, address: e.target.value })} />
                )}
              </div>

              <button className="btn solid" style={{ width: "100%", padding: 16, marginTop: 18, fontSize: 15.5 }}
                disabled={!subOK} onClick={join}>
                {busy ? "Signing you up…" : subOK ? `Start ${p.name} — ${money(p.price)} per box` : "Fill in your details"}
              </button>
              <div style={{ fontSize: 12, color: c.brown, marginTop: 10, textAlign: "center", lineHeight: 1.55 }}>
                Nothing is charged until you add a card. Skip or cancel any time.
              </div>
            </>
          )}
          <div style={{ height: 40 }} />
        </div>
      </div>
    );
  }

  /* ================= POLICY ================= */
  if (view === "policy") return <Policy Header={Header} onBack={() => setView("shop")} shipOver={cat.shipFreeOver} minutes={cat.cancelMinutes} />;

  /* ================= SHOP ================= */
  return (
    <div className="nf"><style>{CSS}</style>
      <Header big right={nav} />

      {typeInfo && (
        <div role="dialog" aria-modal="true" onClick={() => setTypeInfo(false)}
          style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(27,16,5,.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 12 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#FFF", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="display" style={{ fontSize: 27 }}>SAME HONEY.<br />DIFFERENT TEXTURE.</div>
              <button className="btn ghost" aria-label="Close" onClick={() => setTypeInfo(false)}
                style={{ fontSize: 22, width: 36, height: 36, color: c.tan }}>×</button>
            </div>
            {TYPES.map((t) => (
              <div key={t.id} className="card" style={{ padding: 15, marginBottom: 10,
                borderColor: pickType === t.id ? c.amber : "#E2D6C4", background: pickType === t.id ? "#FFFBF0" : "#FFF" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="display" style={{ fontSize: 24 }}>{t.name.toUpperCase()}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: c.amber }}>{t.tagline}</span>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.6, margin: "7px 0 0" }}>{t.what}</p>
                <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: "9px 0 0", color: c.darkBrown }}>
                  <strong>Best for:</strong> {t.use}
                </p>
                <p style={{ fontSize: 12.5, lineHeight: 1.6, margin: "9px 0 0", color: c.brown }}>{t.note}</p>
                <button className={`btn ${pickType === t.id ? "on" : "solid"}`} style={{ width: "100%", padding: 11, marginTop: 12, fontSize: 13.5 }}
                  onClick={() => { setPickType(t.id); setTypeInfo(false); }}>
                  {pickType === t.id ? `${t.name} — selected ✓` : `Shop ${t.name}`}
                </button>
              </div>
            ))}
            <p style={{ fontSize: 13, lineHeight: 1.6, color: c.brown, textAlign: "center", margin: 0 }}>
              Still torn? Get one of each. Every flavor and size comes both ways.
            </p>
          </div>
        </div>
      )}

      <div className="nf-wrap" style={{ paddingTop: 22 }}>
        {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

        <button className="card" onClick={() => setView("subscribe")}
          style={{ width: "100%", padding: "13px 15px", marginBottom: 24, cursor: "pointer", textAlign: "left",
            display: "flex", alignItems: "center", gap: 11, borderColor: c.gold, background: "#FFFBF0" }}>
          <Logo size={32} />
          <span style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>Join the Honey Club</strong> — shelf price, free delivery, bonus jar every third box.
          </span>
          <span className="num" style={{ fontSize: 20, color: c.amber }}>→</span>
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <div className="eyebrow">Regular or spun?</div>
          <button onClick={() => setTypeInfo(true)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit",
              fontSize: 12.5, fontWeight: 700, color: c.amber, textDecoration: "underline" }}>
            What&rsquo;s the difference?
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TYPES.map((t) => (
            <button key={t.id} className={`btn ${pickType === t.id ? "on" : ""}`} onClick={() => setPickType(t.id)}
              style={{ padding: "13px 14px", textAlign: "left" }}>
              <div className="display" style={{ fontSize: 24 }}>{t.name.toUpperCase()}</div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: .72 }}>{t.tagline}</div>
            </button>
          ))}
        </div>

        <div className="eyebrow" style={{ margin: "24px 0 10px" }}>Choose a size</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {cat.sizes.map((s) => (
            <button key={s.id} className={`btn ${pickSize === s.id ? "on" : ""}`} onClick={() => setPickSize(s.id)}
              style={{ padding: "13px 10px", textAlign: "left" }}>
              <div className="display" style={{ fontSize: 26 }}>{s.label}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, opacity: .7 }}>{money(s.price)}</div>
            </button>
          ))}
        </div>

        {pickSize === B.size && (
          <div className="card" style={{ padding: 15, marginTop: 14 }}>
            <div className="eyebrow">Bundle · {B.count} for {money(B.price)}</div>
            <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
              {price.jars % B.count === 0 && price.bundles === 0 && "Mix any 3 four-ounce flavors — Regular and Spun both count."}
              {price.jars % B.count > 0 && (
                <><strong style={{ color: c.amber }}>{B.count - (price.jars % B.count)} more</strong> 4 oz to complete a bundle.</>
              )}
              {price.jars % B.count === 0 && price.bundles > 0 && (
                <span style={{ color: c.amber, fontWeight: 700 }}>{price.bundles} bundle{price.bundles > 1 ? "s" : ""} locked in.</span>
              )}
            </div>
          </div>
        )}

        <div className="eyebrow" style={{ margin: "26px 0 10px" }}>
          Pick your flavors · adding {sizeOf(pickSize).label} <span style={{ color: c.amber }}>{typeName(pickType)}</span>
        </div>
        {shelf.length === 0 ? (
          <div className="card" style={{ padding: 22, textAlign: "center", color: c.tan, fontSize: 14 }}>
            Nothing in {typeName(pickType)} {sizeOf(pickSize).label} right now. Try the other texture or size.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(158px,1fr))", gap: 7 }}>
            {shelf.map((f) => {
              const inCart = cart.find((x) => x.flavor_id === f.id && x.size_id === pickSize && x.type === pickType);
              const best = cat.bestSeller === f.name;
              return (
                <button key={f.id} className={`btn ${inCart ? "on" : ""}`} onClick={() => addJar(f)}
                  style={{ padding: "11px 12px", display: "flex", alignItems: "center", gap: 9, textAlign: "left",
                    borderColor: best && !inCart ? c.orange : undefined }}>
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: f.hex, flexShrink: 0, border: "1px solid rgba(0,0,0,.12)" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {f.name}{best && <span className="tag" style={{ marginLeft: 5 }}>Best seller</span>}
                  </span>
                  {inCart && <span className="num" style={{ fontSize: 17 }}>×{inCart.qty}</span>}
                </button>
              );
            })}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <div className="eyebrow" style={{ margin: "32px 0 10px" }}>Your order</div>
            <div className="card">
              {cart.map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px",
                  borderBottom: i < cart.length - 1 ? "1px solid #EFE6D8" : "none" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: x.hex, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14.5, minWidth: 0 }}>
                    {x.flavor}
                    <span style={{ display: "block", color: c.tan, fontSize: 12, fontWeight: 600, marginTop: 1 }}>
                      {sizeOf(x.size_id).label} · {typeName(x.type)}
                    </span>
                  </span>
                  <button className="btn" onClick={() => bump(i, -1)} style={{ width: 32, height: 32 }}>–</button>
                  <span className="num" style={{ width: 20, textAlign: "center", fontSize: 18 }}>{x.qty}</span>
                  <button className="btn" onClick={() => bump(i, 1)} style={{ width: 32, height: 32 }}>+</button>
                </div>
              ))}
            </div>
            {price.saved > 0 && (
              <div style={{ fontSize: 12.5, fontWeight: 700, color: c.amber, marginTop: 7, textAlign: "right" }}>
                Bundle savings −{money(price.saved)}
              </div>
            )}

            <div className="eyebrow" style={{ margin: "32px 0 10px" }}>How do you want it?</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className={`btn ${method === "market" ? "on" : ""}`} onClick={() => setMethod("market")}
                style={{ padding: "15px 13px", textAlign: "left" }}>
                <div className="display" style={{ fontSize: 22 }}>MARKET PICKUP</div>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: .7, marginTop: 2 }}>Free · no minimum</div>
              </button>
              <button className={`btn ${method === "delivery" ? "on" : ""}`} onClick={() => setMethod("delivery")}
                style={{ padding: "15px 13px", textAlign: "left" }}>
                <div className="display" style={{ fontSize: 22 }}>LOCAL DELIVERY</div>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: .7, marginTop: 2 }}>$3 – $5</div>
              </button>
            </div>

            {shipOK ? (
              <button className={`btn ${method === "ship" ? "on" : ""}`} onClick={() => setMethod("ship")}
                style={{ width: "100%", padding: "15px 13px", textAlign: "left", marginTop: 8,
                  borderColor: method === "ship" ? c.amber : c.sky }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div className="display" style={{ fontSize: 22 }}>FREE SHIPPING</div>
                  <span className="tag" style={{ background: c.sky }}>Unlocked</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: .75, marginTop: 2 }}>Anywhere in Michigan · 2–3 days</div>
              </button>
            ) : (
              <div className="card" style={{ padding: "12px 14px", marginTop: 8, background: "#FBF7F1",
                display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.sky, flexShrink: 0 }} />
                <div style={{ fontSize: 13, lineHeight: 1.5, color: c.darkBrown }}>
                  Add <strong style={{ color: c.amber }}>{money(toShip)}</strong> more and we&rsquo;ll ship it free, anywhere in Michigan.
                </div>
              </div>
            )}

            {method === "market" && (
              <div style={{ marginTop: 14 }}>
                {cat.marketDates.length === 0 ? (
                  <div className="card" style={{ padding: 20, textAlign: "center", fontSize: 14, color: c.brown }}>
                    No markets on the calendar right now. Try delivery.
                  </div>
                ) : cat.marketDates.map((m) => (
                  <button key={m.id} className={`btn ${slot?.kind === "market" && slot.m.id === m.id ? "on" : ""}`}
                    onClick={() => setSlot({ kind: "market", m })}
                    style={{ width: "100%", padding: "12px 14px", marginBottom: 7, textAlign: "left",
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 600 }}>{m.venue.name}</span>
                      <span style={{ display: "block", fontSize: 12.5, opacity: .72, marginTop: 2 }}>
                        {m.venue.where_at}{m.venue.hours && ` · ${m.venue.hours}`}
                      </span>
                    </span>
                    <span className="num" style={{ fontSize: 17, whiteSpace: "nowrap" }}>{fmt(parseDay(m.day))}</span>
                  </button>
                ))}
              </div>
            )}

            {method === "delivery" && (
              <div style={{ marginTop: 14 }}>
                <input className={zone ? "done" : "needs"} placeholder="Your ZIP code" value={zip}
                  maxLength={5} inputMode="numeric" onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
                {outOfArea && (
                  <div className="err" style={{ marginTop: 10 }}>
                    We don&rsquo;t deliver to {zip}. Catch us at a market
                    {shipOK ? " — or take the free shipping." : `, or add ${money(toShip)} more for free shipping.`}
                  </div>
                )}
                {zone && (
                  <>
                    <div className="card" style={{ padding: 14, marginTop: 10 }}>
                      <div className="eyebrow">{zone.name} · {zone.day_label}</div>
                      <div style={{ fontSize: 13.5, color: c.darkBrown, marginTop: 6, lineHeight: 1.6 }}>
                        {zone.window_label} · {zone.cutoff_label}<br />
                        {money(zone.fee)} delivery, free over {money(zone.freeOver)} · {money(zone.minimum)} minimum
                      </div>
                    </div>
                    {belowMin && (
                      <div className="err" style={{ marginTop: 10 }}>
                        Add <strong>{money(zone.minimum - price.sub)}</strong> more to reach the {money(zone.minimum)} minimum — or pick up free at a market.
                      </div>
                    )}
                    {!belowMin && price.sub < zone.freeOver && (
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: c.amber, marginTop: 10, textAlign: "center" }}>
                        {money(zone.freeOver - price.sub)} more and delivery is free
                      </div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      {slots.length === 0 && (
                        <div className="card" style={{ padding: 16, textAlign: "center", fontSize: 13.5, color: c.brown }}>
                          No delivery days open right now. Try market pickup.
                        </div>
                      )}
                      {slots.map((d, i) => (
                        <button key={i} className={`btn ${slot?.kind === "delivery" && slot.date.getTime() === d.getTime() ? "on" : ""}`}
                          onClick={() => setSlot({ kind: "delivery", date: d })}
                          style={{ width: "100%", padding: "12px 14px", marginBottom: 7, textAlign: "left",
                            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="num" style={{ fontSize: 19 }}>{fmt(d)}</span>
                          <span style={{ fontSize: 12.5, opacity: .7, fontWeight: 600 }}>{zone.window_label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {slot && (
              <>
                {!ctaOff && method !== "market" && (
                  <div className="card" style={{ padding: 15, marginTop: 22, background: "#FFFBF0", borderColor: c.gold,
                    display: "flex", alignItems: "flex-start", gap: 11 }}>
                    <Logo size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                        {fee > 0
                          ? <><strong>Members don&rsquo;t pay the {money(fee)} delivery fee.</strong> Same shelf price, plus a bonus jar every third box.</>
                          : <><strong>Members get a bonus jar every third box</strong> and free delivery with no minimum.</>}
                      </div>
                      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                        <button className="btn solid" style={{ padding: "9px 15px", fontSize: 13 }} onClick={() => setView("subscribe")}>Join instead</button>
                        <button className="btn ghost" style={{ padding: "9px 12px", fontSize: 13, color: c.tan }} onClick={() => setCtaOff(true)}>Not now</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="eyebrow" style={{ margin: "26px 0 10px" }}>Your details</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <Field placeholder="Name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} />
                  <Field placeholder="Phone — we'll text to confirm" type="tel" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} />
                  <Field placeholder="Email — for your confirmation" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} />
                  {method !== "market" && (
                    <Field placeholder={method === "ship" ? "Shipping address" : "Street address"} value={cust.address}
                      onChange={(e) => setCust({ ...cust, address: e.target.value })} />
                  )}
                  <Field required={false} rows={2}
                    placeholder={method === "delivery" ? "Optional — gate code, porch, shade…" : "Optional — anything we should know?"}
                    value={cust.notes} onChange={(e) => setCust({ ...cust, notes: e.target.value })} />
                </div>

                {missing.length > 0 && (
                  <div className="card" style={{ padding: "12px 14px", marginTop: 12, background: "#FFFBF0",
                    borderColor: c.amber, fontSize: 13.5, lineHeight: 1.55 }}>
                    Still needed: <strong style={{ color: c.darkBrown }}>{missing.join(", ")}</strong>.
                  </div>
                )}

                <div style={{ fontSize: 12.5, color: c.brown, marginTop: 12, lineHeight: 1.55 }}>
                  You&rsquo;ll get an order number and an email, and you can cancel free for {cat.cancelMinutes} minutes.
                </div>
              </>
            )}
          </>
        )}

        {cart.length === 0 && shelf.length > 0 && (
          <div style={{ textAlign: "center", padding: "44px 20px", color: c.tan }}>
            <div className="display" style={{ fontSize: 26, color: c.brown }}>NOTHING IN THE BOX YET</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Tap a flavor above to start.</div>
          </div>
        )}

        <div style={{ borderTop: "1px solid #E7DCC9", marginTop: 44, paddingTop: 18, textAlign: "center" }}>
          <button className="btn ghost" onClick={() => setView("policy")} style={{ padding: "8px 14px", fontSize: 12.5 }}>
            Shipping, delivery, bulk &amp; return policies
          </button>
        </div>
      </div>

      {cart.length > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: c.cocoa, padding: "13px 18px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: c.tan, fontWeight: 500 }}>
                {money(price.sub)} subtotal
                {fee > 0 && ` + ${money(fee)} delivery`}
                {method === "delivery" && zone && fee === 0 && !belowMin && " + free delivery"}
                {method === "ship" && " + free shipping"}
              </div>
              <div className="num" style={{ fontSize: 32, color: c.gold, lineHeight: 1.05 }}>{money(total)}</div>
            </div>
            <button className="btn solid" disabled={!canPlace} onClick={submit}
              style={{ padding: "14px 24px", fontSize: 15, flexShrink: 0 }}>
              {busy ? "Placing…" : !method ? "Choose a way" : !slot ? "Choose a time"
                : belowMin ? "Below minimum" : missing.length ? `Add ${missing[0]}` : "Place order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LOGIN
   ============================================================ */
function Login({ onDone, onBack, Header }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      await api.signIn(email, pw);
      if (!(await api.amAdmin())) { await api.signOut(); throw new Error("That account isn't an admin."); }
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="nf"><style>{CSS}</style>
      <Header title="STAFF" right={<button className="btn ghost" onClick={onBack} style={{ padding: "6px 12px", fontSize: 12 }}>Back</button>} />
      <div className="nf-wrap" style={{ paddingTop: 40, maxWidth: 380 }}>
        {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}
        <div style={{ display: "grid", gap: 10 }}>
          <Field placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <div className="field">
            <input className={pw ? "done" : "needs"} type="password" placeholder="Password"
              value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && email && pw) go(); }} />
          </div>
        </div>
        <button className="btn solid" style={{ width: "100%", padding: 14, marginTop: 12 }}
          disabled={!email || !pw || busy} onClick={go}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   ADMIN
   ============================================================ */
function Admin({ cat, reload, Header, onExit, onSignOut }) {
  const [orders, setOrders] = useState([]);
  const [subs, setSubs] = useState([]);
  const [dates, setDates] = useState([]);
  const [q, setQ] = useState("");
  const [openFlavor, setOpenFlavor] = useState(null);
  const [newDay, setNewDay] = useState("");
  const [blockDay, setBlockDay] = useState("");
  const [err, setErr] = useState(null);

  const pull = useCallback(async () => {
    try {
      const [o, s, d] = await Promise.all([api.listOrders(), api.listSubs(), api.listAllMarketDates()]);
      setOrders(o); setSubs(s); setDates(d);
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { pull(); }, [pull]);

  const guard = async (fn) => { try { await fn(); await pull(); await reload(); setErr(null); } catch (e) { setErr(e.message); } };

  const shown = orders.filter((o) => !q ||
    o.order_no.includes(q.trim()) || o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const openCount = orders.filter((o) => o.status === "open").length;
  const today = api.today();

  return (
    <div className="nf"><style>{CSS}</style>
      <Header eyebrow="Admin" title="THE BACK ROOM" right={
        <>
          <button className="btn ghost" onClick={onSignOut} style={{ padding: "6px 10px", fontSize: 11, color: c.tan }}>Sign out</button>
          <button className="btn solid" onClick={onExit} style={{ padding: "8px 16px", fontSize: 13 }}>Done</button>
        </>
      } />
      <div className="nf-wrap" style={{ paddingTop: 22 }}>
        {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

        {/* ORDERS */}
        <div className="eyebrow" style={{ marginBottom: 8 }}>Orders · {openCount} open</div>
        <input placeholder="Order # or name — type what they show you" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ marginTop: 10, marginBottom: 32 }}>
          {shown.length === 0 && (
            <div className="card" style={{ padding: 20, textAlign: "center", color: c.tan, fontSize: 14 }}>
              {orders.length === 0 ? "No orders yet." : "Nothing matches."}
            </div>
          )}
          {shown.map((o) => {
            const done = o.status === "done", cx = o.status === "cancelled", ns = o.status === "noshow";
            return (
              <div key={o.id} className="card" style={{ padding: 13, marginBottom: 8, opacity: cx ? .5 : 1,
                borderColor: cx ? "#E2D6C4" : ns ? c.red : done ? c.tan : c.amber, background: done ? "#FBF7F1" : "#FFF" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                  <span className="num" style={{ fontSize: 26, color: cx ? c.tan : c.darkBrown,
                    textDecoration: cx ? "line-through" : "none" }}>#{o.order_no}</span>
                  <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>{o.name}</span>
                  <span className="num" style={{ fontSize: 19, color: c.brown }}>{money(o.total_cents / 100)}</span>
                </div>
                {o.customers?.flagged && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.red, marginTop: 4 }}>
                    ⚠ FLAGGED — {o.customers.consecutive_noshows} no-shows in a row. Take payment before packing.
                  </div>
                )}
                <div style={{ fontSize: 12.5, color: c.brown, marginTop: 4 }}>
                  {o.method === "market" ? "Pickup" : o.method === "ship" ? "Shipping" : "Delivery"}
                  {o.delivery_day && ` · ${fmt(parseDay(o.delivery_day))}`}
                </div>
                <div style={{ fontSize: 12.5, color: c.tan }}>{o.phone} · {o.email}</div>
                {o.address && <div style={{ fontSize: 12.5, color: c.tan }}>{o.address}</div>}
                <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.55 }}>
                  {o.order_items?.map((it) => (
                    <div key={it.id}>{it.qty}× {it.size_label} <strong>{it.type === "spun" ? "Spun" : "Regular"}</strong> — {it.flavor_name}</div>
                  ))}
                </div>
                {o.notes && <div style={{ fontSize: 12.5, marginTop: 6, padding: "7px 9px", background: "#FBF7F1", borderRadius: 5 }}>{o.notes}</div>}
                {ns && <div style={{ fontSize: 11.5, color: c.red, fontWeight: 700, marginTop: 8 }}>NO-SHOW — jars back to stock</div>}
                {!cx && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className={`btn ${done ? "on" : ""}`} style={{ flex: 1, padding: 8, fontSize: 12.5 }}
                      onClick={() => guard(() => api.setOrderStatus(o.id, done ? "open" : "done"))}>
                      {done ? "Handed over ✓" : o.method === "market" ? "Mark picked up" : o.method === "ship" ? "Mark shipped" : "Mark delivered"}
                    </button>
                    {o.method === "market" && !done && !ns && (
                      <button className="btn" style={{ padding: "8px 12px", fontSize: 12.5 }}
                        onClick={() => guard(() => api.setOrderStatus(o.id, "noshow"))}>No-show</button>
                    )}
                    <button className="btn danger" style={{ padding: "8px 12px", fontSize: 12.5 }}
                      onClick={() => confirm(`Cancel #${o.order_no}?`) && guard(() => api.setOrderStatus(o.id, "cancelled"))}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* SUBSCRIBERS */}
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Honey Club · {subs.filter((s) => s.status === "active").length} active
        </div>
        {subs.length === 0 ? (
          <div className="card" style={{ padding: 18, textAlign: "center", color: c.tan, fontSize: 14, marginBottom: 32 }}>No members yet.</div>
        ) : (
          <div style={{ marginBottom: 32 }}>
            {subs.map((s) => {
              const p = cat.plans.find((p) => p.id === s.plan_id);
              const paused = s.status === "paused", cx = s.status === "cancelled", pending = s.status === "pending";
              return (
                <div key={s.id} className="card" style={{ padding: 13, marginBottom: 8, opacity: cx ? .5 : 1,
                  borderColor: cx ? "#E2D6C4" : pending ? c.orange : paused ? c.tan : c.sky }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                    <span className="num" style={{ fontSize: 22, color: c.darkBrown }}>#{s.sub_no}</span>
                    <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>{s.customers?.name}</span>
                    <span className="num" style={{ fontSize: 19, color: c.brown }}>{money(p.price)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: c.brown, marginTop: 4 }}>
                    {p.name} · {s.cadence === "2mo" ? "Every 2 months" : "Monthly"} · {s.method}
                    {s.boxes_sent > 0 && ` · ${s.boxes_sent} boxes sent`}
                  </div>
                  <div style={{ fontSize: 12.5, color: c.tan }}>{s.customers?.phone} · {s.customers?.email}</div>
                  {pending && (
                    <div style={{ fontSize: 11.5, color: c.orange, fontWeight: 700, marginTop: 6 }}>
                      NO CARD ON FILE YET — don&rsquo;t pack a box until Square confirms.
                    </div>
                  )}
                  {(s.boxes_sent + 1) % 3 === 0 && !cx && (
                    <div style={{ fontSize: 11.5, color: c.amber, fontWeight: 700, marginTop: 4 }}>★ BONUS JAR DUE THIS BOX</div>
                  )}
                  {!cx && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      <button className={`btn ${paused ? "on" : ""}`} style={{ flex: 1, padding: 8, fontSize: 12.5 }}
                        onClick={() => guard(() => api.setSubStatus(s.id, paused ? "active" : "paused"))}>
                        {paused ? "Paused — resume" : "Skip / pause"}
                      </button>
                      <button className="btn danger" style={{ padding: "8px 12px", fontSize: 12.5 }}
                        onClick={() => confirm(`Cancel #${s.sub_no}?`) && guard(() => api.setSubStatus(s.id, "cancelled"))}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* VENUES */}
        <div className="eyebrow" style={{ marginBottom: 6 }}>Market venues</div>
        <p style={{ fontSize: 13, color: c.brown, margin: "0 0 10px", lineHeight: 1.55 }}>
          Type a venue <strong>once</strong>. From then on you only add dates.
        </p>
        {cat.venues.map((v) => (
          <div key={v.id} className="card" style={{ padding: 11, marginBottom: 7, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <input defaultValue={v.name} placeholder="Market name"
                onBlur={(e) => e.target.value !== v.name && guard(() => api.updateVenue(v.id, { name: e.target.value }))} />
              <button className="btn" aria-label="Delete venue" style={{ width: 42, flexShrink: 0, color: c.red }}
                onClick={() => confirm(`Delete ${v.name} and its dates?`) && guard(() => api.deleteVenue(v.id))}>×</button>
            </div>
            <input defaultValue={v.where_at} placeholder="Where — park, street, booth #"
              onBlur={(e) => e.target.value !== v.where_at && guard(() => api.updateVenue(v.id, { where_at: e.target.value }))} />
            <input defaultValue={v.hours} placeholder="9 AM – 1 PM"
              onBlur={(e) => e.target.value !== v.hours && guard(() => api.updateVenue(v.id, { hours: e.target.value }))} />
          </div>
        ))}
        <button className="btn" style={{ width: "100%", padding: 12, marginBottom: 26 }}
          onClick={() => guard(() => api.addVenue({ name: "New market", where_at: "", hours: "" }))}>
          + Save a new venue
        </button>

        {/* MARKET DATES */}
        <div className="eyebrow" style={{ marginBottom: 6 }}>Market dates</div>
        {dates.map((m) => {
          const past = m.day < today;
          return (
            <div key={m.id} className="card" style={{ padding: "10px 12px", marginBottom: 6, display: "flex",
              alignItems: "center", gap: 10, opacity: past ? .45 : 1 }}>
              <span className="num" style={{ fontSize: 19, color: c.darkBrown, whiteSpace: "nowrap" }}>{fmt(parseDay(m.day))}</span>
              <span style={{ flex: 1, fontSize: 13.5, minWidth: 0 }}>{m.venues?.name}</span>
              {past && <span style={{ fontSize: 10.5, color: c.tan, fontWeight: 700 }}>PAST</span>}
              <button className="btn ghost" aria-label="Remove" style={{ width: 26, color: c.tan }}
                onClick={() => guard(() => api.deleteMarketDate(m.id))}>×</button>
            </div>
          );
        })}
        <div className="card" style={{ padding: 12, marginTop: 8, marginBottom: 26 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Add a date</div>
          <input type="date" min={today} value={newDay} onChange={(e) => setNewDay(e.target.value)} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {cat.venues.map((v) => (
              <button key={v.id} className="btn" disabled={!newDay} style={{ padding: "8px 12px", fontSize: 12.5 }}
                onClick={() => guard(async () => { await api.addMarketDate(v.id, newDay); setNewDay(""); })}>
                + {v.name}
              </button>
            ))}
          </div>
          {!newDay && <div style={{ fontSize: 12, color: c.tan, marginTop: 7 }}>Pick a date, then tap a venue.</div>}
        </div>

        {/* BLOCKED */}
        <div className="eyebrow" style={{ marginBottom: 6 }}>Blocked delivery days</div>
        {cat.blockedDates.slice().sort().map((d) => (
          <div key={d} className="card" style={{ padding: "9px 12px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="num" style={{ fontSize: 19, color: c.red }}>{fmt(parseDay(d))}</span>
            <span style={{ flex: 1 }} />
            <button className="btn ghost" aria-label="Unblock" style={{ width: 26, color: c.tan }}
              onClick={() => guard(() => api.unblockDay(d))}>×</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 7, marginBottom: 30 }}>
          <input type="date" min={today} value={blockDay} onChange={(e) => setBlockDay(e.target.value)} />
          <button className="btn" disabled={!blockDay} style={{ padding: "0 18px", flexShrink: 0 }}
            onClick={() => guard(async () => { await api.blockDay(blockDay); setBlockDay(""); })}>Block</button>
        </div>

        {/* FLAVORS + STOCK */}
        <div className="eyebrow" style={{ marginBottom: 6 }}>Flavors &amp; stock</div>
        <p style={{ fontSize: 13, color: c.brown, margin: "0 0 10px", lineHeight: 1.55 }}>
          Tap a flavor to open its six jars — three sizes × Regular and Spun. Switch off only what you&rsquo;ve actually run out of.
        </p>
        {cat.flavors.map((f) => {
          const open = openFlavor === f.id;
          const out = cat.sizes.flatMap((s) => TYPES.map((t) => !api.inStock(f, s.id, t.id))).filter(Boolean).length;
          return (
            <div key={f.id} className="card" style={{ marginBottom: 6,
              borderColor: cat.bestSeller === f.name ? c.orange : "#E2D6C4" }}>
              <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                <button aria-label="Best seller" style={{ background: "none", border: "none", cursor: "pointer",
                  fontSize: 17, width: 22, padding: 0, color: cat.bestSeller === f.name ? c.orange : "#DDD2C0" }}
                  onClick={() => guard(() => api.setBestSeller(cat.bestSeller === f.name ? "" : f.name))}>★</button>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: f.hex, flexShrink: 0, border: "1px solid #DDD2C0" }} />
                <button onClick={() => setOpenFlavor(open ? null : f.id)}
                  style={{ flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer",
                    textAlign: "left", padding: "6px 0", font: "inherit", fontSize: 14, fontWeight: 600 }}>
                  {f.name}
                  {out > 0 && <span style={{ color: c.red, fontWeight: 700, fontSize: 11.5, marginLeft: 6 }}>{out} out</span>}
                </button>
                <span style={{ color: c.tan, fontSize: 13 }}>{open ? "▾" : "▸"}</span>
                <button className="btn ghost" aria-label="Delete" style={{ width: 26, color: c.tan, padding: 2 }}
                  onClick={() => confirm(`Delete ${f.name}? Past orders keep their record.`) && guard(() => api.deleteFlavor(f.id))}>×</button>
              </div>

              {open && (
                <div style={{ padding: "0 10px 12px" }}>
                  {TYPES.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>
                      <span style={{ width: 62, fontSize: 11.5, fontWeight: 700, color: c.brown, flexShrink: 0 }}>
                        {t.name.toUpperCase()}
                      </span>
                      {cat.sizes.map((s) => {
                        const on = api.inStock(f, s.id, t.id);
                        return (
                          <button key={s.id} className={`btn ${on ? "on" : ""}`} style={{ flex: 1, padding: "7px 4px", fontSize: 12 }}
                            onClick={() => guard(() => api.setStock(f.id, s.id, t.id, !on))}>
                            {s.label} {on ? "✓" : "✕"}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className="btn" style={{ flex: 1, padding: 8, fontSize: 12 }}
                      onClick={() => guard(() => api.setFlavorStockAll(f.id, true))}>All in stock</button>
                    <button className="btn" style={{ flex: 1, padding: 8, fontSize: 12 }}
                      onClick={() => guard(() => api.setFlavorStockAll(f.id, false))}>All out</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button className="btn" style={{ width: "100%", padding: 12, marginTop: 6, marginBottom: 40 }}
          onClick={() => { const n = prompt("Flavor name?"); if (n) guard(() => api.addFlavor(n, "#F7C41C")); }}>
          + Add a flavor
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   POLICY
   ============================================================ */
function Policy({ Header, onBack, shipOver, minutes }) {
  return (
    <div className="nf"><style>{CSS}</style>
      <Header title="POLICIES" right={<button className="btn solid" onClick={onBack} style={{ padding: "8px 16px", fontSize: 13 }}>Back to shop</button>} />
      <div className="nf-wrap pol" style={{ paddingTop: 26 }}>
        <div className="card" style={{ padding: 18, marginBottom: 12, borderColor: c.amber }}>
          <h2>RETURNS &amp; REFUNDS</h2>
          <p><strong>All sales are final.</strong> Honey is a food product — once a jar leaves our hands we can&rsquo;t resell it, so we don&rsquo;t take returns or exchanges for a change of mind.</p>
          <p><strong>The one exception: if we got it wrong.</strong> Wrong flavor, wrong size, a jar missing, or glass that arrived broken — that&rsquo;s on us.</p>
          <p>Text or email a photo within <strong>7 days</strong>. We&rsquo;ll replace it or refund it, your choice. Keep the jar.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h2>MARKET PICKUP &amp; NO-SHOWS</h2>
          <p>Free, no minimum. Show your <strong>order number</strong> at the table and your jars are bagged and waiting. Pay when you arrive.</p>
          <p>Those jars come off the shelf and ride to the market with us — nobody else can buy them. So if you can&rsquo;t make it, just tell us. We&rsquo;ll hold them for the next one.</p>
          <p><strong>Miss two pickups in a row without a word</strong> and we&rsquo;ll return the honey to stock and flag your account. After that, market orders need to be prepaid before we pack them. One text clears it.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h2>CANCELLATIONS</h2>
          <p>Cancel free for <strong>{minutes} minutes</strong> after you order, from your confirmation screen. After that we&rsquo;ve started packing.</p>
          <p>Need a change later? Call or text. We&rsquo;d rather sort it out than argue about it.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h2>LOCAL DELIVERY</h2>
          <p>Your ZIP tells you which zone you&rsquo;re in, what it costs, and which days we run — right at checkout.</p>
          <p><strong>Contactless is standard.</strong> Name a safe, shaded spot in the order notes. In summer we keep your jars out of direct sun.</p>
          <p>Please allow a 30–60 minute window. Routes and traffic vary, and we&rsquo;d rather be honest than late.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12, borderColor: c.sky }}>
          <h2>BULK &amp; WHOLESALE</h2>
          <p><strong>Orders over {money(shipOver)} ship free</strong>, anywhere in Michigan. We don&rsquo;t sell paid shipping below that — mailing glass makes it a bad deal for you.</p>
          <p>Wedding favors, corporate gifts, a case for your café — email us and we&rsquo;ll quote you directly.</p>
          <p><strong>Custom labels on orders of 24 jars or more.</strong> Give us three weeks.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h2>THE HONEY CLUB</h2>
          <p><strong>Members pay shelf price.</strong> We don&rsquo;t mark the honey down — we make everything around it free: local delivery with no minimum, a bonus jar every third box, first pick of seasonal flavors.</p>
          <p><strong>Your price is locked</strong> at whatever you joined at. Billed through Square. Skip or cancel any time.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <h2>CRYSTALLIZED HONEY IS NOT A DEFECT</h2>
          <p>Cloudy or grainy honey has <strong>crystallized</strong> — proof it&rsquo;s real raw honey, not a syrup blend.</p>
          <p>Set the sealed jar in warm — not boiling — water for 10 to 15 minutes and stir. Never microwave it.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12, borderColor: c.red }}>
          <h2>A NOTE ON RAW HONEY</h2>
          <p><strong>Never feed honey to infants under one year old.</strong> Raw honey can carry spores an infant&rsquo;s system isn&rsquo;t developed enough to handle. That&rsquo;s true of all honey, everywhere.</p>
          <p>Some flavors are infused with peppers, citrus, or spices. If you have allergies, ask before you order.</p>
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 34, background: "#FBF7F1" }}>
          <h2>QUESTIONS?</h2>
          <p>We read every message ourselves.<br /><strong>{CONTACT.phone}</strong><br /><strong>{CONTACT.email}</strong></p>
        </div>
      </div>
    </div>
  );
}
