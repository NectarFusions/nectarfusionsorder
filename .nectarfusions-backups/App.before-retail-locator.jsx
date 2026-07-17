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
  orange: "#FF7A1A", red: "#FF3B30", sky: "#24A0ED",
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

const PourIcon = ({ size = 30, color = "#A86708" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M32 8S18 25 18 36a14 14 0 0 0 28 0C46 25 32 8 32 8Z" fill={color} opacity=".18" />
    <path d="M32 12S22 26 22 35.5a10 10 0 0 0 20 0C42 26 32 12 32 12Z" fill={color} />
    <path d="M17 52h30" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

const SpunIcon = ({ size = 31, color = "#A86708" }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <path d="M17 37c2.8 4.8 8 7.5 14 7.5 8.8 0 16-5.4 16-12.2 0-5.1-4.2-9.4-10-11.2"
      stroke={color} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M23 27.5c2-3.5 6.1-5.7 10.8-5.7 6.8 0 12.2 4.3 12.2 9.7 0 2.8-1.5 5.4-4 7.3"
      stroke={color} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M14 47c4.4 4.5 10.6 7 17.5 7 10.8 0 19.8-5.7 22.5-14"
      stroke={color} strokeWidth="3.4" strokeLinecap="round" />
  </svg>
);

const HoneyJarProgress = ({ filled = 0, total = 3, size = 72 }) => {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, filled / safeTotal));
  const honeyHeight = 42 * ratio;
  const honeyY = 72 - honeyHeight;

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 4, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 84 84" fill="none" aria-hidden="true">
        <defs>
          <clipPath id="bundle-jar-clip">
            <path d="M25 24h34l4 8v34c0 6-5 11-11 11H32c-6 0-11-5-11-11V32l4-8Z" />
          </clipPath>
          <linearGradient id="bundle-honey-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFD95A" />
            <stop offset="100%" stopColor="#E69B00" />
          </linearGradient>
        </defs>

        <rect x="27" y="13" width="30" height="9" rx="3" fill="#FFF7DF" stroke="#FFFFFF" strokeWidth="3" />
        <path d="M25 24h34l4 8v34c0 6-5 11-11 11H32c-6 0-11-5-11-11V32l4-8Z"
          fill="rgba(255,255,255,.18)" stroke="#FFFFFF" strokeWidth="3" />

        <g clipPath="url(#bundle-jar-clip)">
          <rect x="18" y={honeyY} width="48" height={honeyHeight} fill="url(#bundle-honey-fill)" />
          {ratio > 0 && (
            <path d={`M18 ${honeyY + 2} C28 ${honeyY - 2}, 38 ${honeyY + 6}, 48 ${honeyY + 1} C56 ${honeyY - 2}, 62 ${honeyY + 3}, 66 ${honeyY + 1}`}
              stroke="#FFE88A" strokeWidth="3" fill="none" opacity=".9" />
          )}
        </g>

        <path d="M29 40h26" stroke="rgba(255,255,255,.6)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div style={{ color: "#FFFFFF", fontSize: 12, fontWeight: 800, letterSpacing: ".08em" }}>
        {filled}/{safeTotal} JARS
      </div>
    </div>
  );
};

const LockedBundleIcon = ({ size = 62 }) => (
  <svg width={size} height={size} viewBox="0 0 84 84" fill="none" aria-hidden="true">
    <rect x="25" y="17" width="34" height="9" rx="3"
      stroke="#FFFFFF" strokeWidth="3" />
    <path
      d="M23 29h38l4 8v30c0 5.5-4.5 10-10 10H29c-5.5 0-10-4.5-10-10V37l4-8Z"
      stroke="#FFFFFF"
      strokeWidth="3"
      fill="rgba(255,255,255,.08)"
    />
    <path
      d="M30 49l9 9 16-20"
      stroke="#FFF4B8"
      strokeWidth="6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
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

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;500;600;700&family=Yellowtail&display=swap');
.nf *, .nf *::before, .nf *::after { box-sizing:border-box; }
.nf {
  font-family:'Montserrat',system-ui,sans-serif;
  background:
    radial-gradient(circle at 12% 2%, rgba(247,196,28,.09), transparent 27%),
    linear-gradient(180deg,#FBF6EE 0%,#F7F0E6 100%);
  color:${c.black};
  min-height:100vh;
  padding:0 0 146px;
  -webkit-font-smoothing:antialiased;
}
.nf-wrap { max-width:720px; margin:0 auto; padding:0 20px; }
.head {
  position:relative;
  overflow:hidden;
  background:${c.cocoa};
  border-bottom:1px solid rgba(247,196,28,.36);
  box-shadow:0 10px 32px rgba(27,16,5,.18);
}
.head::after {
  content:"";
  position:absolute;
  width:220px;
  height:220px;
  right:-90px;
  top:-120px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(247,196,28,.18),transparent 68%);
  pointer-events:none;
}
.display { font-family:'Bebas Neue',Impact,sans-serif; letter-spacing:.015em; line-height:.94; margin:0; }
.script { font-family:'Yellowtail',cursive; }
.eyebrow { font-weight:700; font-size:10.5px; letter-spacing:.15em; text-transform:uppercase; color:${c.brown}; }
.card {
  background:rgba(255,255,255,.94);
  border:1px solid #E6D8C3;
  border-radius:15px;
  box-shadow:0 7px 22px rgba(74,51,19,.07);
}
.btn {
  font-family:'Montserrat',sans-serif;
  font-weight:650;
  cursor:pointer;
  border-radius:12px;
  border:1.5px solid #D6C09A;
  background:#FFF;
  color:${c.black};
  box-shadow:0 3px 10px rgba(74,51,19,.06);
  transition:transform .15s ease,border-color .15s,background .15s,box-shadow .15s;
}
.btn:hover { transform:translateY(-1px); border-color:${c.amber}; background:#FFFDF7; box-shadow:0 7px 18px rgba(74,51,19,.10); }
.btn:active { transform:translateY(0); }
.btn:focus-visible { outline:none; border-color:${c.amber}; box-shadow:0 0 0 4px rgba(247,196,28,.22); }
.btn.on {
  background:linear-gradient(145deg,#FFD95A 0%,${c.gold} 60%,#F0AE00 100%);
  border-color:#D99600;
  box-shadow:0 5px 14px rgba(230,155,0,.22),inset 0 1px 0 rgba(255,255,255,.55);
}
.btn.solid {
  background:linear-gradient(145deg,#FFD95A 0%,${c.gold} 55%,#E69B00 100%);
  color:${c.cocoa};
  border-color:#D28A00;
  box-shadow:0 5px 14px rgba(230,155,0,.24),inset 0 1px 0 rgba(255,255,255,.55);
}
.btn.solid:hover { background:linear-gradient(145deg,#FFE27A 0%,#F9C72A 55%,#EAA100 100%); border-color:#C98700; }
.btn.solid:disabled { background:#E7DCC9; color:#8C8271; border-color:#D3BF9B; cursor:not-allowed; box-shadow:none; transform:none; }
.btn.ghost { background:transparent; border-color:transparent; color:${c.brown}; box-shadow:none; }
.head .btn.ghost { color:#F4E7D2 !important; }
.head .btn.ghost:hover { background:rgba(255,255,255,.10); border-color:rgba(247,196,28,.28); }
.btn.danger { background:#FFF; border-color:${c.red}; color:${c.red}; box-shadow:none; }
.btn.danger:hover { background:${c.red}; color:#fff; }
.btn:disabled { opacity:.58; cursor:not-allowed; transform:none; }
.nf input,.nf textarea {
  font-family:'Montserrat',sans-serif;
  font-weight:500;
  width:100%;
  padding:14px 15px;
  background:#FFF;
  border:1.5px solid #CDB58D;
  border-radius:12px;
  color:${c.black};
  font-size:16px;
  box-shadow:inset 0 2px 4px rgba(74,51,19,.05);
  transition:border-color .15s,box-shadow .15s,background .15s;
}
.nf input:hover,.nf textarea:hover { border-color:${c.brown}; }
.nf input:focus,.nf textarea:focus { outline:none; border-color:${c.amber}; background:#FFFDF6; box-shadow:0 0 0 4px rgba(230,155,0,.18); }
.nf input::placeholder,.nf textarea::placeholder { color:#9A8D79; font-weight:500; }
.nf input.needs,.nf textarea.needs { border-color:${c.amber}; background:#FFFBF0; box-shadow:inset 3px 0 0 ${c.gold}; }
.nf input.done,.nf textarea.done { border-color:#8FA97B; background:#FCFDFA; }
.field { position:relative; }
.req { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${c.amber}; }
.ok { position:absolute; right:12px; top:50%; transform:translateY(-50%); pointer-events:none; font-size:15px; font-weight:700; color:#6E8C58; }
.tag { font-weight:700; font-size:9px; letter-spacing:.1em; text-transform:uppercase; background:${c.orange}; color:#fff; padding:4px 7px; border-radius:999px; white-space:nowrap; }
.num { font-family:'Bebas Neue',sans-serif; letter-spacing:.06em; }
.pol h2 { font-family:'Bebas Neue',sans-serif; font-size:25px; margin:0 0 8px; color:${c.darkBrown}; }
.pol p { font-size:14.5px; line-height:1.65; margin:0 0 10px; }
.err { background:#FFF3F2; border:1.5px solid ${c.red}; color:#8A1F19; border-radius:12px; padding:13px 15px; font-size:13.5px; line-height:1.55; font-weight:500; box-shadow:0 4px 12px rgba(255,59,48,.08); }
.nf-brand-lockup { display:flex; align-items:center; gap:14px; min-width:0; }
.nf-brand-mark {
  width:74px;
  height:74px;
  flex:0 0 74px;
  border-radius:18px;
  padding:7px;
  background:#FFF9ED;
  border:1px solid rgba(247,196,28,.58);
  box-shadow:0 8px 22px rgba(0,0,0,.22);
}
.nf-brand-mark.small { width:48px; height:48px; flex-basis:48px; border-radius:13px; padding:5px; }
.nf-brand-title { color:#FFF; text-shadow:0 2px 10px rgba(0,0,0,.22); }
.nf-brand-tagline { display:flex; align-items:baseline; gap:7px; margin-top:5px; flex-wrap:wrap; }
.nf-brand-location { color:#CDBFA9 !important; }
.nf-club-card { background:linear-gradient(145deg,#FFFDF6 0%,#FFF7DD 100%) !important; border-color:#E8B522 !important; box-shadow:0 8px 24px rgba(230,155,0,.12); }
.nf-empty { margin-top:18px; padding:46px 20px !important; border:1px dashed #D7C39F; border-radius:16px; background:rgba(255,255,255,.45); }

.nf-hero-head {
  min-height:565px;
  background-image:url("/nectarfusions-honey-hero.webp");
  background-size:cover;
  background-position:center 14%;
  border-bottom:none;
  box-shadow:0 18px 42px rgba(27,16,5,.24);
}
.nf-hero-head::after { display:none; }
.nf-hero-overlay {
  position:absolute;
  inset:0;
  background:
    linear-gradient(90deg,rgba(18,12,8,.92) 0%,rgba(18,12,8,.78) 36%,rgba(18,12,8,.34) 70%,rgba(18,12,8,.18) 100%),
    linear-gradient(180deg,rgba(0,0,0,.18) 0%,rgba(0,0,0,.12) 40%,rgba(0,0,0,.46) 76%,rgba(0,0,0,.72) 100%);
}
.nf-hero-inner {
  position:relative;
  z-index:2;
  padding-top:22px;
  padding-bottom:118px;
}
.nf-hero-top {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:18px;
}
.nf-hero-brand {
  display:flex;
  align-items:center;
  gap:12px;
}
.nf-hero-brand > img {
  filter:drop-shadow(0 4px 10px rgba(0,0,0,.32));
}
.nf-hero-wordmark {
  font-family:Georgia,"Times New Roman",serif;
  color:#F4D58A;
  font-size:31px;
  letter-spacing:.01em;
  text-shadow:0 2px 10px rgba(0,0,0,.42);
}
.nf-hero-wordmark span { color:#FFF3D6; }
.nf-hero-nav {
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:2px;
}
.nf-hero-copy {
  max-width:520px;
  margin-top:72px;
}
.nf-hero-title {
  margin:0;
  max-width:520px;
  font-family:Georgia,"Times New Roman",serif;
  font-size:58px;
  font-weight:500;
  line-height:1.02;
  letter-spacing:-.025em;
  color:#FFFFFF;
  text-shadow:0 3px 18px rgba(0,0,0,.42);
}
.nf-hero-title span { color:#F7C41C; }
.nf-hero-subtitle {
  margin:18px 0 0;
  color:#F6ECDD;
  font-size:18px;
  font-weight:600;
  letter-spacing:.01em;
  text-shadow:0 2px 10px rgba(0,0,0,.35);
}
.nf-hero-cta {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:16px;
  margin-top:24px;
  padding:15px 24px;
  border-radius:999px;
  font-size:16px;
}
.nf-order-shell {
  position:relative;
  z-index:3;
  margin-top:-76px;
  padding-top:0 !important;
  padding-bottom:30px;
}
.nf-order-panel {
  background:linear-gradient(180deg,#FFF9F0 0%,#FBF4E9 100%);
  border:1px solid rgba(213,184,139,.72);
  border-radius:28px 28px 18px 18px;
  box-shadow:0 18px 42px rgba(74,51,19,.16);
  padding:22px 20px 26px;
}

@media (max-width:560px) {
  .nf-wrap { padding-left:15px; padding-right:15px; }
  .nf-brand-mark { width:66px; height:66px; flex-basis:66px; }
  .nf-brand-title { font-size:39px !important; }
  .nf-brand-tagline { gap:5px; }
  .head .nf-wrap { padding-top:14px !important; padding-bottom:18px !important; }
  .nf-hero-head { min-height:520px; background-position:60% 18%; }
  .nf-hero-inner { padding:16px 15px 104px !important; }
  .nf-hero-top { align-items:flex-start; }
  .nf-hero-brand { gap:8px; }
  .nf-hero-brand > img { width:48px !important; height:48px !important; }
  .nf-hero-wordmark { font-size:22px; }
  .nf-hero-nav { max-width:190px; }
  .nf-hero-nav .btn { padding:5px 7px !important; font-size:10px !important; }
  .nf-hero-copy { margin-top:62px; max-width:310px; }
  .nf-hero-title { font-size:42px; line-height:1.04; }
  .nf-hero-subtitle { font-size:15px; margin-top:15px; }
  .nf-hero-cta { margin-top:20px; padding:13px 20px; font-size:14.5px; }
  .nf-order-shell { margin-top:-58px; padding-left:10px; padding-right:10px; }
  .nf-order-panel { border-radius:24px 24px 16px 16px; padding:18px 12px 22px; }
}

/* Keep the hero/header in the normal document flow so it scrolls away with the page. */
.nf-hero-head {
  position: relative !important;
  top: auto !important;
  inset: auto !important;
  transform: none !important;
  background-attachment: scroll !important;
}
.nf-hero-top,
.nf-hero-inner {
  position: relative !important;
}


/* Keep only the top navigation visible while the hero image and headline scroll away. */
.nf-hero-head .nf-hero-top {
  position: fixed !important;
  top: 10px !important;
  left: 50% !important;
  right: auto !important;
  width: min(680px, calc(100% - 24px));
  transform: translateX(-50%) !important;
  z-index: 100 !important;
  padding: 9px 12px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 16px;
  background: rgba(27,16,5,.84);
  box-shadow: 0 8px 24px rgba(0,0,0,.22);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

@media (max-width:560px) {
  .nf-hero-head .nf-hero-top {
    top: 7px !important;
    width: calc(100% - 14px);
    padding: 7px 8px;
    border-radius: 14px;
  }
}

@media (prefers-reduced-motion:reduce) { .nf * { transition:none !important; } }
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

    const available = cat.flavors.filter((f) => api.inStock(f, pickSize, pickType));
    const unavailable = cat.flavors.filter((f) => !api.inStock(f, pickSize, pickType));

    const best = available.find((f) => f.name === cat.bestSeller);
    const orderedAvailable = best
      ? [best, ...available.filter((f) => f !== best)]
      : available;

    return [...orderedAvailable, ...unavailable];
  }, [cat, pickSize, pickType]);

  const inventoryLimit = (flavorId, sizeId, type) => {
    const flavor = cat?.flavors?.find((f) => f.id === flavorId);
    if (!flavor) return null;

    const raw = api.stockCount(flavor, sizeId, type);
    if (raw === "" || raw === null || raw === undefined) return null;

    const count = Number(raw);
    return Number.isFinite(count) ? Math.max(0, count) : null;
  };

  const addJar = (f) => setCart((cc) => {
    const i = cc.findIndex((x) => x.flavor_id === f.id && x.size_id === pickSize && x.type === pickType);
    const limit = inventoryLimit(f.id, pickSize, pickType);
    const current = i > -1 ? cc[i].qty : 0;

    if (limit !== null && current >= limit) return cc;

    if (i > -1) {
      const n = [...cc];
      n[i] = { ...n[i], qty: n[i].qty + 1 };
      return n;
    }

    return [...cc, {
      flavor_id: f.id,
      flavor: f.name,
      hex: f.hex,
      size_id: pickSize,
      type: pickType,
      qty: 1
    }];
  });

  const bump = (i, d) => setCart((cc) => {
    const item = cc[i];
    if (!item) return cc;

    const limit = inventoryLimit(item.flavor_id, item.size_id, item.type);
    const nextQty = item.qty + d;

    if (d > 0 && limit !== null && nextQty > limit) return cc;

    return cc
      .map((x, j) => j === i ? { ...x, qty: nextQty } : x)
      .filter((x) => x.qty > 0);
  });

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

  const Header = ({ eyebrow, title, right, big }) => {
    if (big) {
      return (
        <header className="head nf-hero-head">
          <div className="nf-hero-overlay" />
          <div className="nf-wrap nf-hero-inner">
            <div className="nf-hero-top">
              <div className="nf-hero-brand">
                <Logo size={58} />
                <div className="nf-hero-wordmark">
                  Nectar<span>Fusions</span>
                </div>
              </div>
              <div className="nf-hero-nav">{right}</div>
            </div>

            <div className="nf-hero-copy">
              <div className="eyebrow" style={{ color: "#F4DFC0", marginBottom: 10 }}>
                Coleman, Michigan · Raw infused honey
              </div>
              <h1 className="nf-hero-title">
                Raw Michigan<br />
                Honey,<br />
                <span>Naturally Infused</span>
              </h1>
              <p className="nf-hero-subtitle">Made with organic fruit, herbs, and spice.</p>
              <button
                className="btn solid nf-hero-cta"
                onClick={() => setView("subscribe")}
              >
                Join the Honey Club <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </header>
      );
    }

    return (
      <div className="head">
        <div className="nf-wrap" style={{ paddingTop: 17, paddingBottom: 17, position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="eyebrow nf-brand-location">Coleman, Michigan · Raw infused honey</div>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "flex-end" }}>{right}</div>
          </div>
          <div className="nf-brand-lockup" style={{ marginTop: 13 }}>
            <div className="nf-brand-mark small">
              <Logo size={38} />
            </div>
            <div style={{ minWidth: 0 }}>
              {eyebrow && <div className="eyebrow" style={{ color: c.gold, marginBottom: 3 }}>{eyebrow}</div>}
              <h1 className="display nf-brand-title" style={{ fontSize: 31 }}>
                {title || <>NECTAR<span style={{ color: c.gold }}>FUSIONS</span></>}
              </h1>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const nav = (
    <>
      <button className="btn ghost" onClick={() => setView("shop")} style={{ padding: "6px 9px", fontSize: 11 }}>Shop</button>
      <button className="btn ghost" onClick={() => setView("subscribe")} style={{ padding: "6px 9px", fontSize: 11 }}>Honey Club</button>
      <button className="btn ghost" onClick={() => setView("policy")} style={{ padding: "6px 9px", fontSize: 11 }}>Policies</button>
      <button className="btn ghost" onClick={() => setView(isAdmin ? "admin" : "login")}
        style={{ padding: "6px 9px", fontSize: 11, opacity: .76 }}>Admin</button>
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

      <div className="nf-wrap nf-order-shell" id="order-section">
        <div className="nf-order-panel">
          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

        <button className="card nf-club-card" onClick={() => setView("subscribe")}
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
              fontSize: 12.5, fontWeight: 700, color: c.sky, textDecoration: "underline", textUnderlineOffset: 3 }}>
            What&rsquo;s the difference?
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TYPES.map((t) => (
            <button key={t.id} className={`btn ${pickType === t.id ? "on" : ""}`} onClick={() => setPickType(t.id)}
              style={{ padding: "13px 14px", textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div className="display" style={{ fontSize: 24 }}>{t.name.toUpperCase()}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, opacity: .72 }}>{t.tagline}</div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  {t.id === "regular" ? <PourIcon /> : <SpunIcon />}
                </div>
              </div>
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
          <div className="card" style={{
            padding: "14px 16px",
            marginTop: 14,
            background: "linear-gradient(145deg, #24A0ED 0%, #167DBB 100%)",
            borderColor: "#1475AE",
            boxShadow: "0 8px 20px rgba(36,160,237,.18)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 14
            }}>
              <HoneyJarProgress
                filled={price.jars % B.count === 0 && price.jars > 0 ? B.count : price.jars % B.count}
                total={B.count}
                size={68}
              />

              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div className="display" style={{
                  color: "#FFFFFF",
                  fontSize: 27,
                  fontWeight: 800,
                  letterSpacing: ".025em",
                  lineHeight: 1
                }}>
                  Bundle · {B.count} for {money(B.price)}
                </div>

                <div style={{
                  fontSize: 14.5,
                  fontWeight: 700,
                  lineHeight: 1.5,
                  color: "#FFFFFF",
                  marginTop: 6
                }}>
                  <div>Mix any three 4 oz jars</div>

                  {price.jars % B.count === 0 && price.bundles === 0 && (
                    <div style={{ marginTop: 1 }}>Regular and Spun both count.</div>
                  )}

                  {price.jars % B.count > 0 && (
                    <div style={{ marginTop: 1 }}>
                      <strong>{B.count - (price.jars % B.count)} more</strong> 4 oz to complete the next bundle.
                    </div>
                  )}

                  {price.jars % B.count === 0 && price.bundles > 0 && (
                    <div style={{ marginTop: 1, color: "#FFF4B8" }}>
                      Add another 4 oz jar to start the next bundle.
                    </div>
                  )}
                </div>
              </div>

              {price.bundles > 0 && (
                <div style={{
                  flexShrink: 0,
                  width: 94,
                  textAlign: "center",
                  paddingLeft: 12,
                  borderLeft: "1px solid rgba(255,255,255,.28)"
                }}>
                  <LockedBundleIcon size={60} />
                  <div style={{
                    color: "#FFF4B8",
                    fontSize: 13,
                    fontWeight: 800,
                    lineHeight: 1.3,
                    marginTop: 2
                  }}>
                    {price.bundles} bundle{price.bundles > 1 ? "s" : ""} locked in.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="eyebrow" style={{ margin: "26px 0 10px" }}>
          Pick your flavors · adding {sizeOf(pickSize).label} <span style={{ color: c.amber }}>{typeName(pickType)}</span>
        </div>
        {shelf.length === 0 ? (
          <div className="card" style={{ padding: 22, textAlign: "center", color: c.tan, fontSize: 14 }}>
            No flavors are available right now.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(158px,1fr))", gap: 7 }}>
            {shelf.map((f) => {
              const inCart = cart.find((x) => x.flavor_id === f.id && x.size_id === pickSize && x.type === pickType);
              const limit = inventoryLimit(f.id, pickSize, pickType);
              const quantityInCart = inCart?.qty ?? 0;
              const available = api.inStock(f, pickSize, pickType) &&
                (limit === null || quantityInCart < limit);
              const best = cat.bestSeller === f.name;

              return (
                <button
                  key={f.id}
                  className={`btn ${inCart ? "on" : ""}`}
                  disabled={!available}
                  onClick={() => available && addJar(f)}
                  aria-label={available ? `Add ${f.name}` : `${f.name} is out of stock`}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    minHeight: 52,
                    padding: "11px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    textAlign: "left",
                    borderColor: available && best && !inCart ? c.orange : undefined,
                    opacity: available ? 1 : .78,
                    cursor: available ? "pointer" : "not-allowed",
                  }}
                >
                  <span style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: f.hex,
                    flexShrink: 0,
                    border: "1px solid rgba(0,0,0,.12)"
                  }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {f.name}
                    {best && available && <span className="tag" style={{ marginLeft: 5 }}>Best seller</span>}
                  </span>
                  {inCart && available && <span className="num" style={{ fontSize: 17 }}>×{inCart.qty}</span>}

                  {!available && (
                    <span style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px 10px",
                      background: "rgba(27,16,5,.82)",
                      color: "#FFFFFF",
                      fontSize: 11.5,
                      fontWeight: 800,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      pointerEvents: "none",
                    }}>
                      Out of stock
                    </span>
                  )}
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
                        <strong>{money(price.sub)} merchandise subtotal</strong> — add <strong>{money(zone.minimum - price.sub)}</strong> more to qualify for local delivery.
                        <div style={{ marginTop: 3, fontSize: 12 }}>
                          Delivery fees don&rsquo;t count toward the {money(zone.minimum)} minimum.
                        </div>
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
          <div className="nf-empty" style={{ textAlign: "center", color: c.tan }}>
            <div className="display" style={{ fontSize: 28, color: c.darkBrown }}>YOUR HONEY BOX IS WAITING</div>
            <div style={{ fontSize: 14, marginTop: 7 }}>Choose your first flavor to begin.</div>
          </div>
        )}

        </div>

        <div style={{ borderTop: "1px solid #E7DCC9", marginTop: 26, paddingTop: 18, textAlign: "center" }}>
          <button className="btn ghost" onClick={() => setView("policy")} style={{ padding: "8px 14px", fontSize: 12.5 }}>
            Shipping, delivery, bulk &amp; return policies
          </button>
        </div>
      </div>

      {cart.length > 0 && (
        <div style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: c.sky,
          padding: "14px 18px",
          borderTop: "1px solid rgba(255,255,255,.48)",
          boxShadow: "0 -8px 24px rgba(18,89,132,.22)"
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: "#FFFFFF", fontWeight: 700, lineHeight: 1.45 }}>
                <div>Merchandise subtotal: {money(price.sub)}</div>
                {method === "delivery" && (
                  <div>Delivery: {fee > 0 ? money(fee) : "Free"}</div>
                )}
                {method === "ship" && <div>Shipping: Free</div>}
              </div>
              <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.88)", marginTop: 5, textTransform: "uppercase",
                letterSpacing: ".1em", fontWeight: 700 }}>
                Order total
              </div>
              <div className="num" style={{ fontSize: 39, color: "#FFFFFF", lineHeight: 1.02,
                textShadow: "0 2px 8px rgba(0,0,0,.14)" }}>{money(total)}</div>
            </div>
            <button className="btn solid" disabled={!canPlace} onClick={submit}
              style={{
                padding: "14px 22px",
                fontSize: 15.5,
                flexShrink: 0,
                background: canPlace ? "#FFF4CE" : "#D9EAF5",
                color: canPlace ? c.darkBrown : "#66869A",
                borderColor: canPlace ? "#FFFFFF" : "rgba(255,255,255,.35)",
                boxShadow: canPlace ? "0 5px 14px rgba(17,81,119,.20)" : "none"
              }}>
              {busy ? "Placing…" : !method ? "Choose a way" : !slot ? "Choose a time"
                : belowMin ? `Add ${money(zone.minimum - price.sub)} more` : missing.length ? `Add ${missing[0]}` : "Place order"}
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
  const [adminTab, setAdminTab] = useState("orders");
  const [q, setQ] = useState("");
  const [orderView, setOrderView] = useState("active");
  const [subView, setSubView] = useState("active");
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

  const guard = async (fn) => {
    try {
      await fn();
      await pull();
      await reload();
      setErr(null);
    } catch (e) { setErr(e.message); }
  };

  const activeOrders = orders.filter((o) => !o.archived_at);
  const archivedOrders = orders.filter((o) => !!o.archived_at);
  const orderPool = orderView === "archived" ? archivedOrders : activeOrders;
  const shownOrders = orderPool.filter((o) => !q ||
    o.order_no.includes(q.trim()) || o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const openCount = activeOrders.filter((o) => o.status === "open").length;

  const activeSubs = subs.filter((s) => !s.archived_at);
  const archivedSubs = subs.filter((s) => !!s.archived_at);
  const shownSubs = subView === "archived" ? archivedSubs : activeSubs;
  const activeSubCount = activeSubs.filter((s) => s.status === "active").length;

  const today = api.today();
  const tabs = [
    ["orders", `Orders (${activeOrders.length})`],
    ["subscriptions", `Honey Club (${activeSubs.length})`],
    ["markets", "Markets"],
    ["inventory", "Flavors & Inventory"],
  ];

  return (
    <div className="nf"><style>{CSS}</style>
      <Header eyebrow="Admin" title="THE BACK ROOM" right={
        <>
          <button className="btn ghost" onClick={onSignOut}
            style={{ padding: "6px 10px", fontSize: 11, color: c.tan }}>Sign out</button>
          <button className="btn solid" onClick={onExit}
            style={{ padding: "8px 16px", fontSize: 13 }}>Done</button>
        </>
      } />

      <div className="nf-wrap" style={{ paddingTop: 22 }}>
        {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginBottom: 22 }}>
          {tabs.map(([id, label]) => (
            <button key={id} className={`btn ${adminTab === id ? "on" : ""}`}
              style={{ padding: "11px 9px", fontSize: 12.5 }}
              onClick={() => { setAdminTab(id); setQ(""); }}>
              {label}
            </button>
          ))}
        </div>

        {adminTab === "orders" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Orders · {openCount} open</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <button className={`btn ${orderView === "active" ? "on" : ""}`}
                style={{ padding: 10, fontSize: 13 }}
                onClick={() => { setOrderView("active"); setQ(""); }}>
                Active · {activeOrders.length}
              </button>
              <button className={`btn ${orderView === "archived" ? "on" : ""}`}
                style={{ padding: 10, fontSize: 13 }}
                onClick={() => { setOrderView("archived"); setQ(""); }}>
                Archived · {archivedOrders.length}
              </button>
            </div>

            <input placeholder="Order # or name" value={q} onChange={(e) => setQ(e.target.value)} />

            <div style={{ marginTop: 10, marginBottom: 32 }}>
              {shownOrders.length === 0 && (
                <div className="card" style={{ padding: 20, textAlign: "center", color: c.tan, fontSize: 14 }}>
                  {q ? "Nothing matches." : orderView === "archived" ? "No archived orders." : "No active orders."}
                </div>
              )}
              {shownOrders.map((o) => {
                const done = o.status === "done", cx = o.status === "cancelled", ns = o.status === "noshow";
                return (
                  <div key={o.id} className="card" style={{ padding: 13, marginBottom: 8, opacity: cx ? .5 : 1,
                    borderColor: cx ? "#E2D6C4" : ns ? c.red : done ? c.tan : c.amber,
                    background: done ? "#FBF7F1" : "#FFF" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                      <span className="num" style={{ fontSize: 26, color: cx ? c.tan : c.darkBrown,
                        textDecoration: cx ? "line-through" : "none" }}>#{o.order_no}</span>
                      <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>{o.name}</span>
                      <span className="num" style={{ fontSize: 19, color: c.brown }}>{money(o.total_cents / 100)}</span>
                    </div>
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

                    {orderView === "active" ? (
                      <div style={{ marginTop: 10 }}>
                        {!cx && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className={`btn ${done ? "on" : ""}`} style={{ flex: 1, padding: 8, fontSize: 12.5 }}
                              onClick={() => guard(() => api.setOrderStatus(o.id, done ? "open" : "done"))}>
                              {done ? "Handed over ✓" : o.method === "market" ? "Mark picked up" : o.method === "ship" ? "Mark shipped" : "Mark delivered"}
                            </button>
                            {o.method === "market" && !done && !ns && (
                              <button className="btn" style={{ padding: "8px 12px", fontSize: 12.5 }}
                                onClick={() => guard(() => api.setOrderStatus(o.id, "noshow"))}>No-show</button>
                            )}
                          </div>
                        )}
                        <button className="btn ghost" style={{ width: "100%", padding: "9px 12px", marginTop: 7, fontSize: 12.5 }}
                          onClick={() => confirm(`Archive order #${o.order_no}?`) && guard(() => api.archiveOrder(o.id))}>
                          Archive order
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: o.paid ? "1fr" : "1fr 1fr", gap: 7, marginTop: 10 }}>
                        <button className="btn" style={{ padding: "9px 12px", fontSize: 12.5 }}
                          onClick={() => guard(() => api.restoreOrder(o.id))}>Restore</button>
                        {!o.paid && (
                          <button className="btn danger" style={{ padding: "9px 12px", fontSize: 12.5 }}
                            onClick={() => confirm(`Permanently delete order #${o.order_no}?`) &&
                              guard(() => api.deleteArchivedOrder(o.id))}>
                            Delete permanently
                          </button>
                        )}
                        {o.paid && <div style={{ fontSize: 11.5, color: c.brown, textAlign: "center" }}>
                          Paid orders remain archived for your records.
                        </div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {adminTab === "subscriptions" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Honey Club · {activeSubCount} active</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <button className={`btn ${subView === "active" ? "on" : ""}`} style={{ padding: 10, fontSize: 13 }}
                onClick={() => setSubView("active")}>Active · {activeSubs.length}</button>
              <button className={`btn ${subView === "archived" ? "on" : ""}`} style={{ padding: 10, fontSize: 13 }}
                onClick={() => setSubView("archived")}>Archived · {archivedSubs.length}</button>
            </div>

            {shownSubs.length === 0 ? (
              <div className="card" style={{ padding: 18, textAlign: "center", color: c.tan, fontSize: 14 }}>
                {subView === "archived" ? "No archived subscriptions." : "No active subscriptions."}
              </div>
            ) : (
              <div style={{ marginBottom: 32 }}>
                {shownSubs.map((s) => {
                  const p = cat.plans.find((p) => p.id === s.plan_id);
                  const cx = s.status === "cancelled";
                  const pending = s.status === "pending";
                  const late = s.status === "past_due";
                  const skipScheduled = !!s.paused_until && s.paused_until >= api.today();
                  const canDelete = !s.square_subscription_id && (pending || cx);

                  return (
                    <div key={s.id} className="card" style={{ padding: 13, marginBottom: 8, opacity: cx ? .62 : 1,
                      borderColor: cx ? "#E2D6C4" : late ? c.red : pending ? c.orange : skipScheduled ? c.tan : c.sky }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                        <span className="num" style={{ fontSize: 22, color: c.darkBrown }}>#{s.sub_no}</span>
                        <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>{s.customers?.name}</span>
                        <span className="num" style={{ fontSize: 19, color: c.brown }}>{p ? money(p.price) : "—"}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: c.brown, marginTop: 4 }}>
                        {p?.name || s.plan_id} · {s.cadence === "2mo" ? "Every 2 months" : "Monthly"} · {s.method}
                        {s.boxes_sent > 0 && ` · ${s.boxes_sent} boxes sent`}
                      </div>
                      <div style={{ fontSize: 12.5, color: c.tan }}>{s.customers?.phone} · {s.customers?.email}</div>
                      {pending && <div style={{ fontSize: 11.5, color: c.orange, fontWeight: 700, marginTop: 6 }}>
                        NO CARD ON FILE YET — don&rsquo;t pack a box until Square confirms.
                      </div>}
                      {skipScheduled && <div style={{ fontSize: 11.5, color: c.brown, fontWeight: 700, marginTop: 6 }}>
                        NEXT BOX SKIPPED — resumes after {s.paused_until}.
                      </div>}

                      {subView === "active" ? (
                        <div style={{ marginTop: 10 }}>
                          {!cx && (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className={`btn ${skipScheduled ? "on" : ""}`} style={{ flex: 1, padding: 8, fontSize: 12.5 }}
                                disabled={pending || late || skipScheduled}
                                onClick={() => confirm(`Skip the next box for #${s.sub_no}?`) &&
                                  guard(() => api.subAction(s.id, "skip"))}>
                                {skipScheduled ? "Next box skipped ✓" : "Skip next box"}
                              </button>
                              <button className="btn danger" style={{ padding: "8px 12px", fontSize: 12.5 }}
                                onClick={() => confirm(`Cancel #${s.sub_no}?`) &&
                                  guard(() => api.subAction(s.id, "cancel"))}>Cancel</button>
                            </div>
                          )}
                          <button className="btn ghost" style={{ width: "100%", padding: "9px 12px", marginTop: 7, fontSize: 12.5 }}
                            onClick={() => confirm(`Archive subscription #${s.sub_no}?`) &&
                              guard(() => api.archiveSubscription(s.id))}>
                            Archive subscription
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: canDelete ? "1fr 1fr" : "1fr", gap: 7, marginTop: 10 }}>
                          <button className="btn" style={{ padding: "9px 12px", fontSize: 12.5 }}
                            onClick={() => guard(() => api.restoreSubscription(s.id))}>Restore</button>
                          {canDelete && (
                            <button className="btn danger" style={{ padding: "9px 12px", fontSize: 12.5 }}
                              onClick={() => confirm(`Permanently delete subscription #${s.sub_no}?`) &&
                                guard(() => api.deleteArchivedSubscription(s.id))}>
                              Delete permanently
                            </button>
                          )}
                          {!canDelete && <div style={{ fontSize: 11.5, color: c.brown, textAlign: "center" }}>
                            Square-connected or active subscriptions remain archived for safety.
                          </div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {adminTab === "markets" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Market venues</div>
            <p style={{ fontSize: 13, color: c.brown, margin: "0 0 10px", lineHeight: 1.55 }}>
              Type a venue once. From then on you only add dates.
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
          </>
        )}

        {adminTab === "inventory" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Flavors &amp; inventory</div>
            <p style={{ fontSize: 13, color: c.brown, margin: "0 0 10px", lineHeight: 1.55 }}>
              Open a flavor to set the exact jars on hand for every size and texture. Saving zero marks it out of stock.
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
                    <span style={{ width: 18, height: 18, borderRadius: "50%", background: f.hex,
                      flexShrink: 0, border: "1px solid #DDD2C0" }} />
                    <button onClick={() => setOpenFlavor(open ? null : f.id)}
                      style={{ flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer",
                        textAlign: "left", padding: "6px 0", font: "inherit", fontSize: 14, fontWeight: 600 }}>
                      {f.name}
                      {out > 0 && <span style={{ color: c.red, fontWeight: 700, fontSize: 11.5, marginLeft: 6 }}>{out} out</span>}
                    </button>
                    <span style={{ color: c.tan, fontSize: 13 }}>{open ? "▾" : "▸"}</span>
                    <button className="btn ghost" aria-label="Delete" style={{ width: 26, color: c.tan, padding: 2 }}
                      onClick={() => confirm(`Delete ${f.name}? Past orders keep their record.`) &&
                        guard(() => api.deleteFlavor(f.id))}>×</button>
                  </div>

                  {open && (
                    <div style={{ padding: "0 10px 12px" }}>
                      {TYPES.map((t) => (
                        <div key={t.id} style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: c.brown, marginBottom: 6 }}>
                            {t.name.toUpperCase()}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                            {cat.sizes.map((s) => {
                              const on = api.inStock(f, s.id, t.id);
                              const count = api.stockCount(f, s.id, t.id);
                              return (
                                <div key={s.id} className="card" style={{ padding: 8, boxShadow: "none",
                                  background: on ? "#FFFBF0" : "#FBF7F1",
                                  borderColor: on ? c.amber : "#D9CDBB" }}>
                                  <div style={{ fontSize: 11.5, fontWeight: 700, color: c.darkBrown, marginBottom: 5 }}>{s.label}</div>
                                  <input type="number" min="0" step="1" defaultValue={count} placeholder="0"
                                    aria-label={`${f.name} ${s.label} ${t.name} quantity`}
                                    style={{ padding: "8px 7px", fontSize: 14, textAlign: "center" }}
                                    onBlur={(e) => guard(() => api.setStockCount(f.id, s.id, t.id, e.target.value))} />
                                  <button className={`btn ${on ? "on" : ""}`}
                                    style={{ width: "100%", padding: "6px 3px", marginTop: 6, fontSize: 11 }}
                                    onClick={() => guard(() => api.setStock(f.id, s.id, t.id, !on))}>
                                    {on ? "Available ✓" : "Out ✕"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                        <button className="btn" style={{ flex: 1, padding: 8, fontSize: 12 }}
                          onClick={() => guard(() => api.setFlavorStockAll(f.id, true))}>All available</button>
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
          </>
        )}
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
          <p><strong>Custom labels on orders:</strong> please contact <a href="mailto:info@nectar-fusions.com" style={{ color: c.sky, fontWeight: 700 }}>info@nectar-fusions.com</a>.</p>
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
