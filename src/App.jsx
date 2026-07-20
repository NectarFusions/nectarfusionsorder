import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import * as api from "./lib/api";
import PartnerPage from "./pages/PartnerPage";
import MarketConfirmationPage from "./pages/MarketConfirmationPage";

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

const CONTACT = { email: "info@nectar-fusions.com", phone: "(989) 941-6385" };
/* Replace public/nf-hero-product.png whenever you want to update the homepage hero image. */
const HERO_IMAGE = "/nf-hero-product.png";

const c = {
  gold: "#F7C41C", amber: "#E69B00", black: "#111111", white: "#F5EFE7",
  brown: "#7B5821", darkBrown: "#4A3313", cocoa: "#1B1005", tan: "#9A8D79",
  orange: "#FF7A1A", red: "#FF3B30", sky: "#24A0ED",
};

const money = (n) => `$${Number(n).toFixed(2)}`;

const FLAVOR_IMAGE_FALLBACKS = {
  "blueberry": "/flavors/blueberry.png",
  "cinnamon": "/flavors/cinnamon.png",
  "cranberry": "/flavors/cranberry.png",
  "wild cranberry": "/flavors/cranberry.png",
  "dragon fruit": "/flavors/dragon-fruit.png",
  "dragonfruit": "/flavors/dragon-fruit.png",
  "elderberry": "/flavors/elderberry.png",
  "jalapeño lime": "/flavors/jalapeno-lime.png",
  "jalapeno lime": "/flavors/jalapeno-lime.png",
  "lime jalapeño": "/flavors/jalapeno-lime.png",
  "lime jalapeno": "/flavors/jalapeno-lime.png",
  "lemon": "/flavors/lemon.png",
  "madagascar vanilla": "/flavors/madagascar-vanilla.png",
  "natural raw": "/flavors/natural-raw.png",
  "raw": "/flavors/natural-raw.png",
  "passion fruit": "/flavors/passion-fruit.png",
  "passionfruit": "/flavors/passion-fruit.png",
  "peach": "/flavors/peach.png",
  "peaches": "/flavors/peach.png",
  "pomegranate": "/flavors/pomegranate.png",
  "raspberry": "/flavors/raspberry.png",
  "smokey chipotle": "/flavors/smokey-chipotle.png",
  "smoky chipotle": "/flavors/smokey-chipotle.png",
  "smoked chipotle": "/flavors/smokey-chipotle.png",
  "strawberry": "/flavors/strawberry.png",
  "thai hot pepper": "/flavors/thai-hot-pepper.png",
  "hot thai pepper": "/flavors/thai-hot-pepper.png",
};

const flavorImage = (flavor) =>
  flavor.image_url ||
  FLAVOR_IMAGE_FALLBACKS[String(flavor.name || "").trim().toLowerCase()] ||
  null;

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
  <img
    src="/logo.png"
    alt="NectarFusions"
    width={size}
    height={size}
    loading="eager"
    decoding="sync"
    draggable="false"
    style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block" }}
  />
);


const SocialLinks = ({ compact = false }) => {
  const iconSize = compact ? 18 : 21;
  const buttonSize = compact ? 38 : 44;

  const links = [
    {
      name: "Facebook",
      href: "https://www.facebook.com/NectarFusions/",
      icon: (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13.5 22v-8h2.8l.42-3.2H13.5V8.75c0-.93.26-1.56 1.6-1.56h1.72V4.33c-.3-.04-1.32-.13-2.5-.13-2.47 0-4.16 1.51-4.16 4.28v2.32H7.36V14h2.8v8h3.34Z" />
        </svg>
      ),
    },
    {
      name: "Instagram",
      href: "https://www.instagram.com/nectarfusions_honey/",
      icon: (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.25" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.4" cy="6.7" r="1.15" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 9 }}>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Follow NectarFusions on ${link.name}`}
          title={link.name}
          style={{
            width: buttonSize,
            height: buttonSize,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: c.darkBrown,
            background: "#FFF9ED",
            border: "1px solid #DDBB73",
            boxShadow: "0 5px 14px rgba(74,51,19,.10)",
            textDecoration: "none",
          }}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
};

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

const ClubBenefitIcon = ({ kind }) => {
  const paths = {
    delivery: (
      <>
        <path d="M5 8h10v9H5z" />
        <path d="M15 11h3l3 3v3h-6z" />
        <circle cx="9" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
      </>
    ),
    bonus: (
      <>
        <rect x="5" y="8" width="14" height="11" rx="2" />
        <path d="M12 8v11M5 12h14M9 8c-2.5 0-3.5-3 0-3 2 0 3 3 3 3M15 8c2.5 0 3.5-3 0-3-2 0-3 3-3 3" />
      </>
    ),
    locked: (
      <>
        <rect x="6" y="10" width="12" height="10" rx="2" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3M12 14v3" />
      </>
    ),
    first: (
      <>
        <path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z" />
      </>
    ),
    skip: (
      <>
        <path d="M5 12a7 7 0 1 0 2-5" />
        <path d="M5 4v5h5M10 9l7 7" />
      </>
    ),
  };

  return (
    <span className="nf-club-benefit-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round">
        {paths[kind]}
      </svg>
    </span>
  );
};

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
  .nf-hero-nav { max-width:305px; }
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


/* MODERN ORDERING HOMEPAGE - PHASE 1 */
.nf { background:#FFFFFF; color:#17120E; }
.nf-wrap { max-width:1180px; }
.nf-modern-nav {
  position:sticky; top:0; z-index:110;
  background:rgba(31,20,12,.97);
  border-bottom:1px solid rgba(255,255,255,.08);
  box-shadow:0 8px 26px rgba(20,12,7,.16);
}
.nf-modern-nav-inner {
  min-height:76px; display:flex; align-items:center;
  justify-content:space-between; gap:24px;
}
.nf-modern-brand {
  display:flex; align-items:center; gap:11px; color:#F6D784;
  font-family:Georgia,"Times New Roman",serif; font-size:28px; white-space:nowrap;
}
.nf-modern-brand-button {
  border:0;
  background:transparent;
  padding:0;
  cursor:pointer;
  text-align:left;
}
.nf-modern-brand-button:hover {
  opacity:.92;
}
.nf-page-heading {
  padding:34px 0 26px;
  background:#FFFFFF;
  border-bottom:1px solid #EEE7DF;
}
.nf-page-title {
  margin:8px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:48px;
  line-height:.95;
  letter-spacing:.02em;
  color:#17120E;
}
.nf-page-title span {
  color:#D88D00;
}

.nf-modern-links {
  display:flex; align-items:center; justify-content:flex-end;
  gap:6px; flex-wrap:wrap;
}
.nf-modern-links .btn.ghost {
  color:#FFF8E8 !important; font-size:13px !important;
  padding:9px 12px !important; border-radius:10px;
}
.nf-modern-links .btn.ghost:hover { background:rgba(255,255,255,.08); }
.nf-brand-copy { display:grid; gap:2px; }
.nf-brand-wordmark { color:#F8E1A7; line-height:1; }
.nf-brand-wordmark > span { color:#72B7E4; }
.nf-nav-tagline {
  color:#FFF8E8; font-family:'Montserrat',sans-serif;
  font-size:9px; font-weight:700; letter-spacing:.08em;
  text-transform:uppercase; line-height:1.2;
}
.nf-nav-actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
.nf-menu-button,.nf-cart-button,.nf-admin-gear {
  position:relative; width:42px; height:42px; border-radius:12px;
  border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.07);
  color:#FFF8E8; display:grid; place-items:center; cursor:pointer;
}
.nf-menu-button { gap:4px; align-content:center; }
.nf-menu-button span { display:block; width:19px; height:2px; border-radius:2px; background:currentColor; }
.nf-admin-gear { opacity:.62; font-size:17px; }
.nf-cart-badge {
  position:absolute; right:-5px; top:-6px; min-width:20px; height:20px;
  padding:0 5px; border-radius:999px; display:grid; place-items:center;
  background:#F2AA00; color:#17120E; border:2px solid #1F140C;
  font-size:10px; font-weight:900;
}
.nf-modern-links {
  position:absolute; top:calc(100% + 8px); right:20px;
  width:min(290px,calc(100vw - 30px)); display:none;
  padding:10px; border-radius:16px; background:#24170F;
  border:1px solid rgba(255,255,255,.12); box-shadow:0 18px 38px rgba(0,0,0,.28);
}
.nf-modern-links.open { display:grid; gap:3px; }
.nf-modern-links .btn.ghost {
  width:100%; text-align:left; font-size:14px !important;
  padding:12px 13px !important;
}
.nf-modern-trust-icon svg {
  width:20px; height:20px; fill:none; stroke:currentColor;
  stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;
}
.nf-type-choice { position:relative; }
.nf-type-choice::after {
  content:attr(data-tip); position:absolute; left:8px; right:8px; top:calc(100% + 8px);
  z-index:20; padding:9px 10px; border-radius:10px; background:#24170F; color:#FFF8E8;
  font-size:11px; line-height:1.4; font-weight:650; opacity:0; pointer-events:none;
  transform:translateY(-3px); transition:.15s ease;
}
.nf-type-choice:hover::after,.nf-type-choice:focus-visible::after {
  opacity:1; transform:translateY(0);
}
.nf-bundle-grid.size-only { grid-template-columns:minmax(0,1fr); padding-top:118px; }
.nf-bundle-grid.size-only .nf-size-stack { grid-template-columns:repeat(3,minmax(0,1fr)); }
.nf-nonbundle-note {
  padding:18px; border-radius:16px; background:#F4F8FB; color:#49667B;
  font-size:13px; font-weight:700; line-height:1.55; text-align:center;
}
.nf-cart-tray {
  position:fixed; left:0; right:0; bottom:0; z-index:120;
  background:#24A0ED; border-top:1px solid rgba(255,255,255,.48);
  box-shadow:0 -10px 30px rgba(18,89,132,.28);
}
.nf-cart-tray-inner { width:min(1180px,100%); margin:0 auto; padding:10px 20px 13px; }
.nf-cart-tray-toggle {
  width:100%; border:0; background:transparent; color:#FFF;
  display:flex; justify-content:space-between; align-items:center;
  padding:2px 0 9px; font:inherit; font-size:12px; font-weight:800; cursor:pointer;
}
.nf-cart-tray-label { display:flex; align-items:center; gap:8px; text-transform:uppercase; letter-spacing:.08em; }
.nf-cart-tray-count {
  min-width:21px; height:21px; padding:0 5px; border-radius:999px;
  display:grid; place-items:center; background:#FFF4CE; color:#23465D; font-size:10px;
}
.nf-cart-items {
  max-height:230px; overflow:auto; margin-bottom:10px;
  border-radius:14px; background:rgba(255,255,255,.12);
}
.nf-cart-item {
  display:grid; grid-template-columns:9px minmax(0,1fr) 32px 24px 32px;
  align-items:center; gap:8px; padding:9px 10px; color:#FFF;
  border-bottom:1px solid rgba(255,255,255,.16);
}
.nf-cart-item:last-child { border-bottom:0; }
.nf-cart-item-dot { width:9px; height:9px; border-radius:50%; }
.nf-cart-item-name { display:grid; min-width:0; font-size:12.5px; }
.nf-cart-item-name strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.nf-cart-item-name small { color:rgba(255,255,255,.82); margin-top:2px; }
.nf-cart-item button {
  width:32px; height:32px; border-radius:50%; border:1px solid rgba(255,255,255,.58);
  background:rgba(255,255,255,.12); color:#FFF; font-size:18px; cursor:pointer;
}
.nf-cart-item-qty { text-align:center; font-weight:850; }
.nf-cart-savings { padding:9px 11px; color:#FFF4CE; text-align:right; font-size:12px; font-weight:800; }
.nf-cart-summary { display:flex; align-items:center; gap:16px; }
.nf-cart-totals { flex:1; color:#FFF; font-size:12.5px; line-height:1.4; }
.nf-cart-totals span {
  display:block; margin-top:3px; font-size:10px; text-transform:uppercase; letter-spacing:.1em;
}
.nf-cart-totals strong {
  display:block; font-family:'Bebas Neue',sans-serif; font-size:34px; line-height:1;
}
.nf-cart-summary > .btn { padding:13px 20px; flex-shrink:0; }
.nf-about {
  padding-top:44px; padding-bottom:60px;
  display:grid; grid-template-columns:minmax(280px,.8fr) minmax(0,1.2fr);
  align-items:center; gap:42px;
}
.nf-about-image {
  min-height:410px; display:grid; place-items:center; align-content:center; gap:18px;
  border-radius:24px; background:linear-gradient(145deg,#FFF8E8,#F2ECE4);
  border:1px solid #E8DFD4; color:#8A796C; font-size:12px; font-weight:700;
}
.nf-about-copy h2 {
  margin:10px 0 18px; font-family:'Bebas Neue',Impact,sans-serif;
  font-size:48px; line-height:.95;
}
.nf-about-copy p { color:#5D5148; font-size:15px; line-height:1.75; }

.nf-modern-hero { background:#FFFFFF; padding:54px 0 34px; }
.nf-modern-hero-grid {
  display:grid; grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);
  align-items:center; gap:36px;
}
.nf-modern-kicker {
  color:#C98500; font-size:12px; font-weight:800;
  letter-spacing:.16em; text-transform:uppercase;
}
.nf-modern-title {
  margin:12px 0 0; font-family:'Bebas Neue',Impact,sans-serif;
  font-size:74px; line-height:.9; letter-spacing:.01em; color:#17120E;
}
.nf-modern-title span { color:#D88D00; }
.nf-modern-subtitle {
  margin:18px 0 0; max-width:520px; font-size:18px;
  line-height:1.55; color:#51463D;
}
.nf-modern-primary {
  margin-top:24px; border:none; border-radius:14px;
  background:linear-gradient(135deg,#FFD447,#F2AA00);
  color:#17120E; font-weight:800; font-size:15px;
  padding:15px 24px; box-shadow:0 10px 24px rgba(226,153,0,.24);
  cursor:pointer;
}
.nf-modern-trust {
  display:grid; grid-template-columns:repeat(3,minmax(0,1fr));
  gap:14px; margin-top:28px; max-width:580px;
}
.nf-modern-trust-item {
  display:flex; align-items:flex-start; gap:9px; padding-right:12px;
  border-right:1px solid #E9E3DC;
}
.nf-modern-trust-item:last-child { border-right:none; }
.nf-modern-trust-icon {
  width:30px; height:30px; border-radius:50%; display:grid;
  place-items:center; background:#FFF4CE; color:#B97300;
  flex:0 0 30px; font-weight:800;
}
.nf-modern-trust-title {
  font-size:11px; font-weight:800; text-transform:uppercase; line-height:1.25;
}
.nf-modern-trust-copy { margin-top:2px; font-size:11px; color:#6F6258; }
.nf-modern-hero-image {
  width:100%; max-height:540px; object-fit:contain;
  filter:drop-shadow(0 24px 28px rgba(88,49,14,.16));
}
.nf-showcase { padding:18px 0 42px; }
.nf-promo-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
.nf-promo-card {
  min-height:240px;
  display:grid;
  grid-template-columns:47% 53%;
  align-items:stretch;
  overflow:hidden;
  border:1px solid #E7E1DA;
  border-radius:24px;
  background:#FFFFFF;
  box-shadow:0 18px 42px rgba(49,35,24,.14);
}
.nf-promo-card img {
  width:100%;
  height:100%;
  min-height:240px;
  object-fit:contain;
  object-position:center bottom;
  align-self:stretch;
  padding:14px 10px 8px;
  background:
    radial-gradient(circle at 50% 54%,rgba(247,196,28,.18),transparent 44%),
    linear-gradient(145deg,#FBF7F1,#F2ECE4);
  border-right:1px solid #EAE2D8;
  filter:none;
}
.nf-promo-copy {
  display:flex;
  flex-direction:column;
  justify-content:center;
  padding:30px 28px;
}
.nf-promo-title {
  font-family:'Bebas Neue',Impact,sans-serif; font-size:35px;
  line-height:.96; margin:0;
}
.nf-promo-text {
  margin:10px 0 0; color:#5D5148; font-size:14px; line-height:1.5;
}
.nf-promo-action {
  margin-top:17px;
  border:1px solid #4F91C6;
  border-radius:12px;
  background:linear-gradient(145deg,#6FA9D3,#4F91C6);
  color:#FFFFFF;
  padding:11px 16px;
  font-weight:800;
  cursor:pointer;
  box-shadow:0 9px 20px rgba(79,145,198,.24);
}
.nf-promo-action:hover {
  background:linear-gradient(145deg,#7BB4DC,#5598CD);
  border-color:#4584B7;
  transform:translateY(-1px);
}
.nf-section-row {
  display:flex; justify-content:space-between; align-items:end;
  gap:16px; margin:34px 0 14px;
}
.nf-section-title {
  margin:0; font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px; letter-spacing:.02em;
}
.nf-section-note { color:#8C7C70; font-size:13px; }
.nf-top-grid {
  display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px;
}
.nf-top-card,.nf-flavor-preview {
  border:1px solid #ECE6DF; background:#FFF; border-radius:18px;
  box-shadow:0 8px 22px rgba(46,33,23,.08); overflow:hidden;
}
.nf-top-card {
  position:relative; padding:14px 14px 16px; cursor:pointer; text-align:left;
}
.nf-top-card:hover,.nf-flavor-preview:hover {
  transform:translateY(-2px);
  box-shadow:0 12px 28px rgba(46,33,23,.12);
}
.nf-top-badge {
  position:absolute; top:12px; left:12px; z-index:2;
  border-radius:999px; background:#FFD24A; padding:5px 8px;
  font-size:9px; font-weight:800; text-transform:uppercase; letter-spacing:.06em;
}
.nf-top-card img {
  width:100%; aspect-ratio:1/1; object-fit:contain;
  filter:drop-shadow(0 13px 13px rgba(59,37,17,.16));
}
.nf-top-name { font-size:16px; font-weight:800; }
.nf-top-price { margin-top:4px; color:#6F6258; font-size:13px; }
.nf-top-add {
  position:absolute; right:13px; bottom:13px; width:34px; height:34px;
  border-radius:50%; border:none; background:#F2AA00; color:#FFF;
  font-size:24px; line-height:1; cursor:pointer;
}
.nf-all-flavors {
  display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:14px;
}
.nf-flavor-preview { padding:12px; cursor:pointer; text-align:center; }
.nf-flavor-preview-art {
  height:116px; display:grid; place-items:center; border-radius:14px;
  background:linear-gradient(145deg,#FFF9E9,#FFF);
}
.nf-flavor-preview-dot {
  width:72px; height:72px; border-radius:50%; display:grid; place-items:center;
  color:#FFF; font-family:'Bebas Neue',Impact,sans-serif; font-size:17px;
  letter-spacing:.03em; box-shadow:0 10px 18px rgba(0,0,0,.12);
  border:5px solid #1E140D; padding:5px;
}
.nf-flavor-preview-name { margin-top:10px; font-size:13px; font-weight:750; }
.nf-pick-grid {
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:14px;
}
.nf-pick-card {
  position:relative;
  min-width:0;
  border:1px solid #ECE6DF;
  background:#FFF;
  border-radius:18px;
  box-shadow:0 8px 22px rgba(46,33,23,.08);
  overflow:hidden;
  transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
}
.nf-pick-card:hover {
  transform:translateY(-2px);
  box-shadow:0 12px 28px rgba(46,33,23,.12);
}
.nf-pick-card.selected {
  border-color:#E2A000;
  box-shadow:0 0 0 3px rgba(247,196,28,.22),0 12px 28px rgba(46,33,23,.11);
}
.nf-pick-image-wrap {
  position:relative;
  height:164px;
  display:grid;
  place-items:center;
  background:linear-gradient(145deg,#FFF,#FFF9EC);
  overflow:hidden;
}
.nf-pick-image {
  width:100%;
  height:100%;
  object-fit:contain;
  padding:8px;
  filter:drop-shadow(0 12px 12px rgba(33,22,12,.14));
}
.nf-pick-placeholder {
  width:92px;
  height:92px;
  border-radius:50%;
  display:grid;
  place-items:center;
  border:7px solid #1D140D;
  color:#FFF;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:20px;
  text-align:center;
  padding:9px;
}
.nf-pick-body {
  display:flex;
  flex-direction:column;
  min-height:142px;
  padding:15px 14px 14px;
}
.nf-pick-name {
  min-height:38px;
  font-size:13px;
  line-height:1.35;
  font-weight:800;
}
.nf-pick-controls {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:7px;
  margin-top:auto;
}
.nf-pick-add,.nf-pick-qty-btn {
  border:none;
  background:#F2AA00;
  color:#17120E;
  font-weight:900;
  cursor:pointer;
  box-shadow:0 5px 12px rgba(226,153,0,.2);
}
.nf-pick-add {
  width:100%;
  margin-top:auto;
  padding:11px 9px;
  border-radius:11px;
}
.nf-pick-qty-btn {
  width:32px;
  height:32px;
  border-radius:50%;
  font-size:18px;
}
.nf-pick-qty {
  flex:1;
  text-align:center;
  font-weight:850;
}
.nf-pick-stock {
  min-height:22px;
  margin-top:8px;
  margin-bottom:12px;
  font-size:12.5px;
  line-height:1.45;
  font-weight:600;
  color:#74685F;
}
.nf-pick-overlay {
  position:absolute;
  inset:0;
  display:grid;
  place-items:center;
  padding:12px;
  background:rgba(24,16,10,.82);
  color:#FFF;
  font-size:11px;
  font-weight:850;
  letter-spacing:.12em;
  text-transform:uppercase;
  text-align:center;
  z-index:3;
}
.nf-admin-flavor-image {
  width:74px;
  height:74px;
  border-radius:14px;
  object-fit:contain;
  background:#FFF;
  border:1px solid #E5DACB;
  box-shadow:0 5px 12px rgba(50,34,20,.07);
}
@media (max-width:900px) {
  .nf-pick-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width:640px) {
  .nf-pick-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .nf-pick-image-wrap { height:145px; }
}

.nf-order-shell { margin-top:0 !important; padding-top:14px !important; }
.nf-order-panel {
  border-radius:24px; border:1px solid #ECE6DF; background:#FFFFFF;
  box-shadow:0 12px 34px rgba(46,33,23,.09);
}
.nf-club-card { display:none !important; }
.nf-bundle-builder {
  position:relative;
  margin-top:26px;
  padding:26px;
  overflow:hidden;
  border:1px solid #E9E2D9;
  border-radius:24px;
  background:#FFF;
  box-shadow:0 12px 30px rgba(45,31,20,.08);
}
.nf-bundle-headline {
  position:absolute;
  top:20px;
  left:24px;
  right:24px;
  z-index:0;
  display:flex;
  flex-wrap:wrap;
  align-items:baseline;
  gap:12px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(52px,7vw,102px);
  line-height:.84;
  letter-spacing:.01em;
  pointer-events:none;
}
.nf-bundle-headline-main { color:#082C5C; }
.nf-bundle-headline-price { color:#5A9BCB; }
.nf-bundle-grid {
  position:relative;
  z-index:2;
  display:grid;
  grid-template-columns:minmax(190px,.72fr) minmax(300px,1.28fr);
  align-items:end;
  gap:28px;
  padding-top:118px;
}
.nf-size-stack {
  display:grid;
  gap:10px;
  align-self:center;
}
.nf-size-stack .btn {
  min-height:72px;
  padding:13px 18px;
  text-align:left;
  border-radius:16px;
  background:#FFF;
  box-shadow:0 8px 20px rgba(45,31,20,.08);
}
.nf-size-stack .btn.on {
  background:linear-gradient(145deg,#FFD75A,#F2AA00);
}
.nf-bundle-visual {
  position:relative;
  min-height:350px;
  display:grid;
  grid-template-columns:minmax(200px,1fr) minmax(150px,.55fr);
  align-items:end;
  gap:8px;
}
.nf-bundle-jar-stage {
  position:relative;
  width:min(100%,360px);
  justify-self:center;
  aspect-ratio:.86 / 1;
}
.nf-bundle-jar-stage img {
  position:absolute;
  inset:0;
  width:100%;
  height:100%;
  object-fit:contain;
  z-index:2;
  pointer-events:none;
}
.nf-bundle-honey-fill {
  position:absolute;
  left:19.5%;
  right:19.5%;
  bottom:13%;
  max-height:57%;
  min-height:0;
  border-radius:8px 8px 22px 22px;
  background:linear-gradient(180deg,#FFCB36 0%,#E69700 100%);
  opacity:.84;
  mix-blend-mode:multiply;
  transition:height 1.35s cubic-bezier(.22,1,.36,1);
  z-index:3;
  pointer-events:none;
}
@keyframes nfBundleDemoFill {
  0% { transform:scaleY(0); }
  42% { transform:scaleY(1); }
  58% { transform:scaleY(1); }
  100% { transform:scaleY(0); }
}
.nf-bundle-honey-fill.nf-bundle-demo {
  height:57% !important;
  transform-origin:center bottom;
  animation:nfBundleDemoFill 3.2s cubic-bezier(.22,1,.36,1) both;
  transition:none !important;
  will-change:transform;
}

.nf-bundle-honey-fill::before {
  content:"";
  position:absolute;
  top:-5px;
  left:0;
  right:0;
  height:12px;
  border-radius:50%;
  background:#FFD85C;
  opacity:.92;
}
.nf-bundle-copy {
  align-self:center;
  padding:16px 0 24px;
  color:#082C5C;
}
.nf-bundle-copy strong {
  display:block;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:34px;
  line-height:.96;
  letter-spacing:.02em;
}
.nf-bundle-copy p {
  margin:12px 0 0;
  font-size:15px;
  line-height:1.55;
  font-weight:700;
}
.nf-bundle-progress {
  margin-top:15px;
  font-size:13px;
  line-height:1.45;
  color:#5C7088;
}
.nf-bundle-progress b { color:#082C5C; }
@media (max-width:780px) {
  .nf-bundle-builder { padding:20px 16px; }
  .nf-bundle-headline {
    position:relative;
    top:auto;
    left:auto;
    right:auto;
    font-size:56px;
    margin-bottom:18px;
  }
  .nf-bundle-grid {
    grid-template-columns:1fr;
    padding-top:0;
    gap:18px;
  }
  .nf-size-stack {
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
  .nf-size-stack .btn {
    min-height:66px;
    padding:11px 10px;
  }
  .nf-bundle-visual {
    min-height:300px;
    grid-template-columns:minmax(180px,1fr) minmax(130px,.6fr);
  }
}
@media (max-width:520px) {
  .nf-bundle-headline { font-size:45px; }
  .nf-size-stack { grid-template-columns:1fr; }
  .nf-bundle-visual {
    min-height:430px;
    grid-template-columns:1fr;
  }
  .nf-bundle-copy {
    text-align:center;
    padding-top:0;
  }
  .nf-bundle-jar-stage { width:min(100%,290px); }
}


@media (max-width:900px) {
  .nf-modern-hero-grid { grid-template-columns:1fr; }
  .nf-modern-hero-image { max-height:420px; }
  .nf-top-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .nf-all-flavors { grid-template-columns:repeat(3,minmax(0,1fr)); }
}
@media (max-width:640px) {
  .nf-cart-tray {
    contain:layout paint;
  }
  .nf-cart-tray:not(.open) .nf-cart-tray-inner {
    min-height:64px;
  }
}

@media (max-width:640px) {
  .nf-modern-nav-inner { min-height:66px; gap:10px; }
  .nf-modern-brand { font-size:19px; gap:8px; }
  .nf-nav-tagline { font-size:7px; letter-spacing:.045em; }
  .nf-menu-button,.nf-cart-button,.nf-admin-gear { width:38px; height:38px; border-radius:11px; }
  .nf-nav-actions { gap:5px; }
  .nf-modern-links { right:8px; width:calc(100vw - 16px); }

  .nf-modern-brand { font-size:21px; }
  .nf-page-heading { padding:25px 0 20px; }
  .nf-page-title { font-size:38px; }

  .nf-modern-brand img { width:43px !important; height:43px !important; }
  .nf-modern-links { max-width:58%; gap:0; }
  .nf-modern-links .btn.ghost { font-size:10px !important; padding:6px 7px !important; }
  .nf-modern-hero { padding:34px 0 22px; }
  .nf-modern-hero-grid { gap:18px; }
  .nf-modern-title { font-size:50px; }
  .nf-modern-subtitle { font-size:15px; }
  .nf-modern-trust { gap:8px; }
  .nf-modern-trust-item {
    display:flex; align-items:center; gap:7px; border-right:none; padding-right:0;
  }
  .nf-modern-trust-icon { width:28px; height:28px; flex-basis:28px; }
  .nf-modern-trust-icon svg { width:18px; height:18px; }
  .nf-modern-trust-copy { display:none; }
  .nf-modern-trust-title { font-size:9px; }
  .nf-bundle-grid.size-only { padding-top:0; }
  .nf-bundle-grid.size-only .nf-size-stack { grid-template-columns:1fr; }
  .nf-cart-tray-inner { padding:9px 12px 11px; }
  .nf-cart-summary { gap:10px; }
  .nf-cart-summary > .btn { padding:12px 13px; font-size:12.5px; max-width:47%; }
  .nf-cart-totals strong { font-size:30px; }
  .nf-about { grid-template-columns:1fr; padding-top:26px; gap:24px; }
  .nf-about-image { min-height:280px; }
  .nf-about-copy h2 { font-size:39px; }

  .nf-modern-hero-image { max-height:310px; }
  .nf-promo-grid { grid-template-columns:1fr; }
  .nf-promo-card {
    min-height:210px;
    grid-template-columns:45% 55%;
  }
  .nf-promo-card img {
    min-height:210px;
    height:100%;
    padding:10px 6px 6px;
  }
  .nf-promo-copy {
    padding:22px 18px;
  }
  .nf-promo-title { font-size:29px; }
  .nf-top-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .nf-all-flavors { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .nf-section-title { font-size:32px; }
}


/* STOREFRONT PHASE 1 REFINEMENT */
.nf-modern-nav-inner { position:relative; }
.nf-modern-links {
  top:calc(100% + 12px);
  right:74px;
  width:min(340px,calc(100vw - 30px));
  padding:12px;
  border-radius:20px;
  background:linear-gradient(155deg,#2B1B12 0%,#1E130D 100%);
  border:1px solid rgba(247,196,28,.24);
  box-shadow:0 22px 54px rgba(0,0,0,.34);
}
.nf-modern-links.open { gap:6px; }
.nf-modern-links .btn.ghost {
  min-height:52px;
  display:flex;
  align-items:center;
  justify-content:flex-start;
  padding:14px 17px !important;
  border:1px solid transparent !important;
  border-radius:13px;
  color:#FFF8E8 !important;
  font-size:17px !important;
  font-weight:750;
  letter-spacing:.01em;
}
.nf-modern-links .btn.ghost:hover {
  background:rgba(247,196,28,.12) !important;
  border-color:rgba(247,196,28,.24) !important;
  transform:translateX(3px);
}
.nf-top-card {
  text-align:center;
  color:#FFFFFF;
  background:linear-gradient(145deg,#249FE8,#147FBE);
  border-color:#147FBE;
  transition:transform .18s ease,box-shadow .18s ease,background .18s ease,border-color .18s ease,color .18s ease;
}
.nf-top-card .nf-top-name,
.nf-top-card .nf-top-price {
  color:#FFFFFF;
}
.nf-top-card:hover,
.nf-top-card.selected {
  color:#17120E;
  background:#FFD447;
  border-color:#E1A100;
  transform:translateY(-6px);
  box-shadow:0 17px 34px rgba(189,126,0,.22);
}
.nf-top-card:hover .nf-top-name,
.nf-top-card:hover .nf-top-price,
.nf-top-card.selected .nf-top-name,
.nf-top-card.selected .nf-top-price {
  color:#17120E;
}
.nf-top-card.selected {
  border-color:#D99600;
  box-shadow:0 0 0 3px rgba(247,196,28,.26),0 15px 32px rgba(189,126,0,.20);
}
.nf-top-name {
  font-size:18px;
  line-height:1.25;
  font-weight:850;
  text-align:center;
}
.nf-top-price {
  margin-top:6px;
  color:#51463D;
  font-size:14px;
  font-weight:700;
  text-align:center;
}
.nf-top-badge,.nf-top-add { display:none !important; }
.nf-order-panel { overflow:visible; }
.nf-type-choice { z-index:8; overflow:visible; }
.nf-type-choice:hover,.nf-type-choice:focus-visible { z-index:30; }
.nf-type-choice::after {
  left:50%;
  right:auto;
  width:min(290px,calc(100vw - 54px));
  top:calc(100% + 10px);
  transform:translate(-50%,-3px);
  padding:13px 15px;
  border-radius:13px;
  background:#4F91C6;
  border:1px solid #3F7EAF;
  color:#FFFFFF;
  box-shadow:0 13px 28px rgba(46,112,163,.28);
  font-size:13px;
  line-height:1.5;
  text-align:center;
}
.nf-type-choice:hover::after,.nf-type-choice:focus-visible::after {
  transform:translate(-50%,0);
}
.nf-bundle-builder { overflow:visible; }
.nf-nonbundle-note {
  padding:24px 22px;
  border:2px solid #7CB4DC;
  border-radius:18px;
  background:linear-gradient(145deg,#EAF6FF,#F6FBFF);
  color:#153E5A;
  font-size:17px;
  font-weight:850;
  line-height:1.55;
  box-shadow:0 9px 22px rgba(79,145,198,.14);
}
.nf-cart-tray-toggle > span:last-child {
  padding:6px 10px;
  border:1px solid rgba(255,255,255,.48);
  border-radius:999px;
  background:rgba(255,255,255,.12);
}
@media (max-width:640px) {
  .nf-modern-links {
    top:calc(100% + 8px);
    right:8px;
    width:calc(100vw - 16px);
  }
  .nf-modern-links .btn.ghost {
    min-height:54px;
    font-size:17px !important;
    padding:15px 17px !important;
  }
  .nf-top-name { font-size:16px; }
  .nf-top-price { font-size:13px; }
  .nf-nonbundle-note { font-size:15px; padding:20px 17px; }
  .nf-type-choice::after {
    width:min(250px,calc(100vw - 44px));
    font-size:12.5px;
  }
}


/* GUIDED CART ACTION */
.nf-order-anchor {
  scroll-margin-top:110px;
}
.nf-guided-order-button {
  background:#FFF4CE !important;
  color:#23465D !important;
  border-color:#FFFFFF !important;
  box-shadow:0 7px 18px rgba(17,81,119,.22) !important;
  opacity:1 !important;
}
.nf-guided-order-button:hover {
  background:#FFFFFF !important;
  transform:translateY(-1px);
}
.nf-guided-order-button:disabled {
  background:#D9EAF5 !important;
  color:#66869A !important;
  border-color:rgba(255,255,255,.35) !important;
  box-shadow:none !important;
}


/* NAVIGATION + FULFILLMENT REFINEMENT */
.nf-modern-links {
  top:calc(100% + 10px) !important;
  right:18px !important;
  width:min(320px,calc(100vw - 36px)) !important;
  padding:10px !important;
  grid-template-columns:1fr !important;
  align-items:stretch !important;
}
.nf-modern-links.open {
  display:grid !important;
}
.nf-modern-links .btn.ghost {
  width:100% !important;
  min-height:50px !important;
  justify-content:flex-start !important;
  text-align:left !important;
  padding:13px 15px !important;
  font-size:17px !important;
  border-radius:12px !important;
}
.nf-fulfillment-section {
  margin-top:34px;
  padding:30px;
  border:2px solid #7CB4DC;
  border-radius:24px;
  background:
    radial-gradient(circle at 90% 10%,rgba(114,183,228,.18),transparent 28%),
    linear-gradient(145deg,#F7FBFF 0%,#EAF5FC 100%);
  box-shadow:0 14px 34px rgba(62,116,154,.14);
}
.nf-fulfillment-title {
  margin:8px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:.95;
  letter-spacing:.02em;
  color:#123F5C;
}
.nf-fulfillment-intro {
  margin:10px 0 18px;
  max-width:640px;
  color:#4F6A7C;
  font-size:15px;
  line-height:1.55;
  font-weight:600;
}
.nf-fulfillment-section .btn {
  background:#FFFFFF;
  border-color:#A7CBE4;
}
.nf-fulfillment-section .btn.on {
  background:linear-gradient(145deg,#7BB4DC,#4F91C6);
  color:#FFFFFF;
  border-color:#3F7EAF;
  box-shadow:0 8px 20px rgba(79,145,198,.24);
}
.nf-fulfillment-section .eyebrow {
  color:#3F6E8F;
}
@media (max-width:640px) {
  .nf-modern-links {
    right:8px !important;
    width:calc(100vw - 16px) !important;
  }
  .nf-fulfillment-section {
    margin-top:28px;
    padding:22px 17px;
    border-radius:20px;
  }
  .nf-fulfillment-title {
    font-size:35px;
  }
  .nf-fulfillment-intro {
    font-size:14px;
  }
}


/* ABOUT + GUIDANCE + ICON + BUNDLE POLISH */
.nf-modern-trust-icon {
  width:38px;
  height:38px;
  flex:0 0 38px;
  border-radius:0;
  background:transparent;
  color:#D58A00;
}
.nf-modern-trust-icon svg {
  width:35px;
  height:35px;
  fill:none;
  stroke:currentColor;
  stroke-width:1.8;
  stroke-linecap:round;
  stroke-linejoin:round;
  overflow:visible;
}
.nf-modern-trust-icon.nf-michigan-icon svg {
  fill:currentColor;
  stroke:currentColor;
  stroke-width:1.1;
}
.nf-bundle-promo-card img {
  object-fit:cover !important;
  object-position:center center !important;
  padding:0 !important;
  min-height:100% !important;
  transform:scale(1.06);
  background:#F4EEE7 !important;
}
.nf-continue-help {
  position:fixed;
  right:22px;
  bottom:124px;
  z-index:135;
  width:min(390px,calc(100vw - 30px));
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:14px;
  padding:16px 17px;
  border:1px solid #7CB4DC;
  border-radius:16px;
  background:#F1F9FF;
  color:#153E5A;
  box-shadow:0 16px 38px rgba(23,79,119,.24);
}
.nf-continue-help > div {
  display:grid;
  gap:4px;
}
.nf-continue-help strong {
  font-size:13px;
  text-transform:uppercase;
  letter-spacing:.08em;
}
.nf-continue-help span {
  font-size:13.5px;
  line-height:1.5;
  font-weight:650;
}
.nf-continue-help button {
  width:30px;
  height:30px;
  flex:0 0 30px;
  border:1px solid #A7CBE4;
  border-radius:50%;
  background:#FFFFFF;
  color:#315E7A;
  font-size:20px;
  line-height:1;
  cursor:pointer;
}
.nf-about {
  align-items:start;
  grid-template-columns:minmax(330px,.9fr) minmax(0,1.1fr);
  gap:52px;
  padding-top:52px;
}
.nf-about-image {
  position:sticky;
  top:104px;
  min-height:0;
  margin:0;
  display:block;
  overflow:hidden;
  border-radius:26px;
  background:#F2ECE4;
  box-shadow:0 18px 42px rgba(48,34,23,.15);
}
.nf-about-image img {
  display:block;
  width:100%;
  height:auto;
  aspect-ratio:2 / 3;
  object-fit:cover;
  object-position:center top;
}
.nf-about-image figcaption {
  padding:14px 18px;
  color:#6F6258;
  background:#FFF9F0;
  font-size:12px;
  font-weight:750;
  text-align:center;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-about-copy h2 {
  font-size:56px;
  color:#17120E;
}
.nf-about-copy p {
  margin:0 0 17px;
  font-size:15px;
  line-height:1.78;
}
.nf-about-closing {
  margin-top:24px !important;
  padding:20px 22px;
  border-left:5px solid #F2AA00;
  border-radius:0 15px 15px 0;
  background:#FFF8DF;
  color:#3F321F !important;
  font-weight:750;
}
@media (max-width:760px) {
  .nf-about {
    grid-template-columns:1fr;
    gap:28px;
    padding-top:28px;
  }
  .nf-about-image {
    position:relative;
    top:auto;
    width:min(100%,520px);
    margin:0 auto;
  }
  .nf-about-copy h2 {
    font-size:43px;
  }
  .nf-continue-help {
    right:10px;
    bottom:112px;
    width:calc(100vw - 20px);
  }
}
@media (max-width:640px) {
  .nf-modern-trust-icon {
    width:30px;
    height:30px;
    flex-basis:30px;
  }
  .nf-modern-trust-icon svg {
    width:28px;
    height:28px;
  }
  .nf-bundle-promo-card img {
    transform:scale(1.1);
  }
}


/* EXACT TRUST ICON IMAGE STYLING */
.nf-modern-trust-icon-image {
  width:42px;
  height:42px;
  flex:0 0 42px;
  display:grid;
  place-items:center;
}
.nf-modern-trust-icon-image img {
  display:block;
  width:34px;
  height:34px;
  object-fit:contain;
}
@media (max-width:640px) {
  .nf-modern-trust-icon-image {
    width:34px;
    height:34px;
    flex-basis:34px;
  }
  .nf-modern-trust-icon-image img {
    width:27px;
    height:27px;
  }
}


/* FINAL TRUST ICON ASSETS */
.nf-modern-trust-icon-image {
  width:44px; height:44px; flex:0 0 44px;
  display:grid; place-items:center;
}
.nf-modern-trust-icon-image img {
  display:block; width:40px; height:40px; object-fit:contain;
}
@media (max-width:640px) {
  .nf-modern-trust-icon-image { width:34px; height:34px; flex-basis:34px; }
  .nf-modern-trust-icon-image img { width:31px; height:31px; }
}


/* MARKET PICKUP ADMIN */
.nf-market-pickup-card { position:relative; overflow:hidden; }
.nf-market-pickup-banner {
  display:inline-flex; align-items:center; padding:7px 10px; border-radius:999px;
  background:#153E5A; color:#FFFFFF; font-size:10px; font-weight:900; letter-spacing:.13em;
}
.nf-market-location {
  display:grid; gap:3px; margin-top:9px; padding:12px 13px; border-radius:12px;
  background:#EDF7FE; border:1px solid #A7CBE4; color:#153E5A;
}
.nf-market-location strong { font-size:15px; }
.nf-market-location span { font-size:12.5px; font-weight:650; }
.nf-noshow-status {
  margin-top:11px; padding:9px 11px; border-radius:10px;
  background:#F5F7F8; color:#587080; font-size:12px; font-weight:750;
}
.nf-noshow-status.warning { background:#FFF8DF; color:#806018; }
.nf-noshow-status.final { background:#FFF0EF; color:#922E28; }


/* ADMIN-CONTROLLED TOP PICKS */
.nf-top-tagline {
  margin-top:5px;
  min-height:17px;
  color:#8B640C;
  font-size:11px;
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.07em;
}
.nf-top-image-placeholder {
  width:100%;
  aspect-ratio:1/1;
  display:grid;
  place-items:center;
  padding:18px;
  border-radius:14px;
  color:#FFFFFF;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:20px;
  text-align:center;
}
.nf-admin-top-picks-list {
  display:grid;
  gap:12px;
}
.nf-admin-top-pick-card {
  display:grid;
  grid-template-columns:76px 130px minmax(0,1fr);
  gap:14px;
  align-items:start;
  padding:14px;
}
.nf-admin-top-pick-order {
  display:grid;
  justify-items:center;
  gap:8px;
}
.nf-admin-top-pick-order .num {
  font-size:24px;
  color:#4A3313;
}
.nf-admin-top-pick-order > div {
  display:flex;
  gap:4px;
}
.nf-admin-top-pick-order .btn {
  width:30px;
  height:30px;
  padding:0;
}
.nf-admin-top-pick-preview {
  width:130px;
  height:130px;
  display:grid;
  place-items:center;
  overflow:hidden;
  border-radius:15px;
  border:1px solid #E6D8C3;
  background:linear-gradient(145deg,#FFF9E9,#FFFFFF);
  color:#9A8D79;
  font-size:11px;
  text-align:center;
}
.nf-admin-top-pick-preview img {
  width:100%;
  height:100%;
  object-fit:contain;
  padding:7px;
}
.nf-admin-top-pick-fields {
  display:grid;
  gap:10px;
}
.nf-admin-top-pick-fields label > span {
  display:block;
  margin-bottom:5px;
  color:#7B5821;
  font-size:10px;
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.nf-admin-top-pick-fields select {
  width:100%;
  min-height:44px;
  padding:10px 12px;
  border:1.5px solid #CDB58D;
  border-radius:12px;
  background:#FFFFFF;
  font:inherit;
}
.nf-admin-top-pick-upload input {
  padding:9px;
  font-size:12px;
}
.nf-admin-top-pick-upload small {
  display:block;
  margin-top:5px;
  color:#8C7C70;
  font-size:10.5px;
  line-height:1.4;
}
.nf-admin-top-pick-toggle {
  display:flex;
  align-items:center;
  gap:8px;
}
.nf-admin-top-pick-toggle input {
  width:18px;
  height:18px;
}
.nf-admin-top-pick-toggle > span {
  margin:0 !important;
  color:#4A3313 !important;
  font-size:12px !important;
  letter-spacing:0 !important;
  text-transform:none !important;
}
.nf-admin-top-pick-actions {
  display:flex;
  justify-content:flex-end;
  gap:7px;
}
.nf-admin-top-pick-actions .btn {
  padding:8px 10px;
  font-size:11px;
}
.nf-admin-top-pick-footer {
  position:sticky;
  bottom:0;
  display:flex;
  justify-content:space-between;
  gap:10px;
  margin-top:16px;
  padding:14px;
  border:1px solid #E6D8C3;
  border-radius:15px;
  background:rgba(255,255,255,.96);
  box-shadow:0 -8px 24px rgba(74,51,19,.08);
}
.nf-admin-top-pick-footer .btn {
  padding:12px 16px;
}
@media (max-width:700px) {
  .nf-admin-top-pick-card {
    grid-template-columns:56px minmax(0,1fr);
  }
  .nf-admin-top-pick-preview {
    width:100%;
    height:150px;
  }
  .nf-admin-top-pick-fields {
    grid-column:1 / -1;
  }
}


/* DRIZZLE PROMO + FINAL ORDER REVIEW */
.nf-drizzle-promo-card img {
  object-fit:cover !important;
  object-position:center center !important;
  padding:0 !important;
  min-height:100% !important;
  transform:scale(1.06);
  background:#F4EEE7 !important;
}
.nf-details-continue {
  width:100%;
  margin-top:18px;
  padding:15px 18px;
  font-size:15px;
}
.nf-final-review {
  position:fixed;
  inset:0;
  z-index:300;
  overflow-x:hidden;
  overflow-y:auto;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
  padding:28px 18px;
  background:#24A0ED;
}
.nf-final-review-shell {
  width:min(980px,100%);
  min-height:calc(100dvh - 56px);
  margin:0 auto;
  display:flex;
  flex-direction:column;
  padding:28px;
  border:1px solid rgba(255,255,255,.5);
  border-radius:26px;
  background:linear-gradient(160deg,#2FA8EF 0%,#168ED7 100%);
  box-shadow:0 24px 70px rgba(10,74,113,.34);
}
.nf-final-review-header {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:22px;
  color:#FFFFFF;
}
.nf-final-review-eyebrow {
  font-size:11px;
  font-weight:900;
  letter-spacing:.16em;
  text-transform:uppercase;
  color:#FFF4CE;
}
.nf-final-review-header h2 {
  margin:8px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:52px;
  line-height:.95;
  letter-spacing:.02em;
}
.nf-final-review-header p {
  max-width:650px;
  margin:10px 0 0;
  color:rgba(255,255,255,.88);
  font-size:14px;
  line-height:1.6;
}
.nf-final-review-close {
  width:44px;
  height:44px;
  flex:0 0 44px;
  border:1px solid rgba(255,255,255,.55);
  border-radius:50%;
  background:rgba(255,255,255,.12);
  color:#FFFFFF;
  font-size:28px;
  cursor:pointer;
}
.nf-final-review-grid {
  display:grid;
  grid-template-columns:1.25fr .75fr;
  gap:14px;
  margin-top:24px;
}
.nf-final-review-card {
  position:relative;
  padding:19px;
  border:1px solid rgba(255,255,255,.48);
  border-radius:18px;
  background:rgba(255,255,255,.96);
  box-shadow:0 10px 28px rgba(13,84,126,.14);
}
.nf-final-review-label {
  margin-bottom:13px;
  color:#2C698F;
  font-size:10px;
  font-weight:900;
  letter-spacing:.14em;
  text-transform:uppercase;
}
.nf-final-review-items {
  display:grid;
  gap:9px;
}
.nf-final-review-item {
  display:grid;
  grid-template-columns:11px minmax(0,1fr) auto;
  align-items:center;
  gap:10px;
  padding:10px 0;
  border-bottom:1px solid #DFEAF1;
}
.nf-final-review-item:last-child { border-bottom:0; }
.nf-final-review-dot {
  width:11px;
  height:11px;
  border-radius:50%;
}
.nf-final-review-item > div:nth-child(2) {
  display:grid;
  min-width:0;
}
.nf-final-review-item strong {
  color:#173C52;
  font-size:14px;
}
.nf-final-review-item span {
  margin-top:3px;
  color:#69808E;
  font-size:11.5px;
}
.nf-final-review-quantity {
  display:flex !important;
  align-items:center;
  gap:9px;
}
.nf-final-review-quantity button {
  width:31px;
  height:31px;
  border:1px solid #8FC4E4;
  border-radius:50%;
  background:#EAF7FF;
  color:#195E88;
  font-size:17px;
  cursor:pointer;
}
.nf-final-review-quantity b {
  min-width:18px;
  text-align:center;
  color:#173C52;
}
.nf-final-review-savings {
  margin-top:11px;
  padding:10px 12px;
  border-radius:10px;
  background:#FFF6D8;
  color:#7B5B0D;
  font-size:12px;
  font-weight:850;
  text-align:right;
}
.nf-final-review-detail {
  display:grid;
  gap:6px;
  color:#657A87;
  font-size:13px;
  line-height:1.5;
}
.nf-final-review-detail strong {
  color:#173C52;
  font-size:16px;
}
.nf-final-review-notes {
  margin-top:4px;
  padding-top:8px;
  border-top:1px solid #DFEAF1;
  font-style:italic;
}
.nf-final-review-edit {
  margin-top:15px;
  padding:0;
  border:0;
  background:transparent;
  color:#247BAA;
  font-weight:800;
  cursor:pointer;
}
.nf-final-review-price-row {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:7px 0;
  color:#5F7481;
  font-size:13px;
}
.nf-final-review-price-row strong { color:#173C52; }
.nf-final-review-grand-total {
  display:flex;
  align-items:end;
  justify-content:space-between;
  gap:14px;
  margin-top:11px;
  padding-top:14px;
  border-top:2px solid #B9D9EC;
  color:#173C52;
  font-weight:850;
}
.nf-final-review-grand-total strong {
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:.9;
  color:#0C6DA6;
}
.nf-final-review-actions {
  display:flex;
  justify-content:flex-end;
  gap:11px;
  margin-top:auto;
  padding-top:22px;
}
.nf-final-review-back,
.nf-final-review-place {
  min-height:50px;
  padding:13px 22px;
  border-radius:13px;
  font:inherit;
  font-weight:850;
  cursor:pointer;
}
.nf-final-review-back {
  border:1px solid rgba(255,255,255,.62);
  background:rgba(255,255,255,.14);
  color:#FFFFFF;
}
.nf-final-review-place {
  min-width:190px;
  border:1px solid #D29000;
  background:linear-gradient(145deg,#FFE073,#F7C41C);
  color:#1B1005;
  box-shadow:0 10px 24px rgba(80,57,0,.22);
}
.nf-final-review-place:disabled {
  opacity:.55;
  cursor:not-allowed;
}

/* FINAL REVIEW ACCESSIBLE TYPE SCALE
   Keep essential checkout copy at 16px or larger.
   Small uppercase labels remain 14px with increased spacing and weight. */
.nf-final-review-eyebrow,
.nf-final-review-label {
  font-size:14px;
  line-height:1.35;
}

.nf-final-review-header p {
  font-size:16px;
  line-height:1.65;
}

.nf-final-review-item strong {
  font-size:16px;
  line-height:1.45;
}

.nf-final-review-item span {
  font-size:15px;
  line-height:1.5;
}

.nf-final-review-savings {
  font-size:15px;
  line-height:1.5;
}

.nf-final-review-detail,
.nf-final-review-price-row {
  font-size:16px;
  line-height:1.6;
}

.nf-final-review-notes {
  font-size:16px;
  line-height:1.6;
}

.nf-final-review-edit {
  min-height:44px;
  font-size:16px;
  line-height:1.4;
}

.nf-final-review-back,
.nf-final-review-place {
  font-size:16px;
  line-height:1.35;
}

.nf-final-review .err,
.nf-final-review .nf-review-type-alert {
  font-size:16px;
  line-height:1.6;
}

@media (max-width:700px) {
  .nf-final-review-back,
  .nf-final-review-place {
    font-size:16px;
  }
}
@media (max-width:700px) {
  .nf-final-review {
    padding:0;
  }
  .nf-final-review-shell {
    min-height:100vh;
    padding:20px 14px 24px;
    border:0;
    border-radius:0;
  }
  .nf-final-review-header h2 {
    font-size:40px;
  }
  .nf-final-review-grid {
    grid-template-columns:1fr;
  }
  .nf-final-review-actions {
    position:sticky;
    bottom:0;
    margin:18px -14px -24px;
    padding:13px 14px calc(13px + env(safe-area-inset-bottom));
    background:#147FBE;
    box-shadow:0 -8px 24px rgba(8,74,113,.24);
  }
  .nf-final-review-back,
  .nf-final-review-place {
    flex:1;
    min-width:0;
    padding:12px 10px;
    font-size:13px;
  }
}


/* MOBILE HORIZONTAL PAGE LOCK */
html,
body,
#root {
  width:100%;
  max-width:100%;
  overflow-x:hidden;
  overscroll-behavior-x:none;
}

@supports (overflow:clip) {
  html,
  body,
  #root {
    overflow-x:clip;
  }
}

body {
  margin:0;
}

.nf {
  width:100%;
  max-width:100%;
  overflow-x:hidden;
  touch-action:pan-y;
}

@supports (overflow:clip) {
  .nf {
    overflow-x:clip;
  }
}

.nf img,
.nf svg,
.nf video,
.nf canvas {
  max-width:100%;
}

/* CLICK + LAYOUT STABILITY */
html {
  overflow-y:scroll;
}
.nf,
.nf-order-panel,
.nf-bundle-builder,
.nf-pick-card,
.nf-top-card,
.nf-cart-tray {
  overflow-anchor:none;
}
.nf button {
  touch-action:manipulation;
}
.nf-reveal-visible {
  will-change:auto !important;
}


/* HONEY CLUB + ORDER HELP REFINEMENT */
.nf-club-intro {
  padding:34px;
  border-radius:24px;
  background:linear-gradient(145deg,#FFFFFF,#F7FBFE);
  border:1px solid #DCEAF3;
  box-shadow:0 14px 34px rgba(32,86,122,.09);
}
.nf-club-page-title,
.nf-club-section-title {
  margin:9px 0 14px;
  font-family:'Bebas Neue',Impact,sans-serif;
  color:#17120E;
  line-height:.95;
  letter-spacing:.015em;
}
.nf-club-page-title { font-size:clamp(42px,6vw,66px); }
.nf-club-section-title { font-size:clamp(35px,5vw,49px); margin-top:30px; }
.nf-club-intro p {
  margin:0;
  max-width:790px;
  color:#5B5148;
  font-size:17px;
  line-height:1.75;
}
.nf-club-benefits {
  margin:22px 0 30px;
  padding:28px;
  border-radius:24px;
  color:#FFFFFF;
  background:linear-gradient(145deg,#249FE8,#147FBE);
  box-shadow:0 16px 36px rgba(20,127,190,.24);
}
.nf-club-benefits-heading {
  margin-bottom:18px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:31px;
  line-height:1;
}
.nf-club-benefit {
  display:grid;
  grid-template-columns:54px minmax(0,1fr);
  align-items:center;
  gap:15px;
  padding:15px 0;
  border-top:1px solid rgba(255,255,255,.22);
  animation:nfClubBenefitIn .65s cubic-bezier(.22,1,.36,1) both;
  animation-delay:var(--nf-benefit-delay,0ms);
}
.nf-club-benefit:first-of-type { border-top:0; }
.nf-club-benefit-icon {
  width:48px;
  height:48px;
  display:grid;
  place-items:center;
  border-radius:15px;
  color:#FFF4B8;
  background:rgba(255,255,255,.13);
  border:1px solid rgba(255,255,255,.3);
}
.nf-club-benefit-icon svg { width:29px; height:29px; }
.nf-club-benefit strong { display:block; font-size:17px; line-height:1.35; }
.nf-club-benefit p {
  margin:3px 0 0;
  color:rgba(255,255,255,.86);
  font-size:15px;
  line-height:1.55;
}
.nf-club-plan-contents {
  margin-top:4px;
  color:#147FBE;
  font-size:15px;
  line-height:1.45;
  font-weight:750;
}
.nf-club-preferences {
  margin-top:30px;
  padding:28px;
  border:1px solid #DCEAF3;
  border-radius:24px;
  background:linear-gradient(145deg,#F7FBFE,#FFFFFF);
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-club-choice-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.nf-club-choice {
  min-height:112px;
  padding:18px;
  border:1.5px solid #BCD8E9;
  border-radius:17px;
  background:#FFFFFF;
  color:#17120E;
  text-align:left;
  cursor:pointer;
}
.nf-club-choice.selected {
  border-color:#147FBE;
  background:#EAF6FD;
  box-shadow:0 0 0 3px rgba(36,160,237,.16);
}
.nf-club-choice strong {
  display:block;
  color:#147FBE;
  font-size:18px;
}
.nf-club-choice span {
  display:block;
  margin-top:6px;
  color:#5D5148;
  font-size:14px;
  line-height:1.5;
}
.nf-club-preference-label {
  margin:24px 0 10px;
  font-size:16px;
  font-weight:850;
}
.nf-club-preference-chips {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.nf-club-preference-chips button {
  min-height:42px;
  padding:9px 14px;
  border:1px solid #BCD8E9;
  border-radius:999px;
  background:#FFFFFF;
  color:#49667B;
  font:inherit;
  font-size:14px;
  font-weight:750;
  cursor:pointer;
}
.nf-club-preference-chips button.selected {
  background:#147FBE;
  border-color:#147FBE;
  color:#FFFFFF;
}
.nf-club-request-field {
  display:grid;
  gap:8px;
  margin-top:22px;
}
.nf-club-request-field > span {
  font-size:15px;
  font-weight:850;
}
.nf-club-preference-note {
  margin:9px 0 0;
  color:#74685F;
  font-size:13px;
  line-height:1.5;
}
.nf-admin-flavor-preferences {
  display:grid;
  gap:3px;
  margin-top:9px;
  padding:10px 11px;
  border-radius:11px;
  background:#EEF8FE;
  color:#315E7B;
  font-size:12px;
  line-height:1.45;
}
.nf-admin-flavor-preferences em {
  color:#5D5148;
  font-style:normal;
}
.nf-club-reveal,
.nf-help-reveal {
  animation:nfClubPageIn .75s cubic-bezier(.22,1,.36,1) both;
  animation-delay:var(--nf-club-delay,0ms);
}
@keyframes nfClubPageIn {
  from { opacity:0; transform:translate3d(0,20px,0); }
  to { opacity:1; transform:translate3d(0,0,0); }
}
@keyframes nfClubBenefitIn {
  from { opacity:0; transform:translate3d(-16px,0,0); }
  to { opacity:1; transform:translate3d(0,0,0); }
}
.nf-help-page {
  padding-top:34px;
  padding-bottom:70px;
}
.nf-help-hero {
  padding:32px;
  border-radius:24px;
  color:#FFFFFF;
  background:linear-gradient(145deg,#249FE8,#147FBE);
  box-shadow:0 16px 36px rgba(20,127,190,.22);
}
.nf-help-hero .display { color:#FFFFFF !important; font-size:42px !important; }
.nf-help-hero p {
  margin:10px 0 0 !important;
  color:rgba(255,255,255,.88) !important;
  font-size:16px !important;
  line-height:1.7 !important;
}
.nf-help-options {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  margin-top:18px;
}
.nf-help-option {
  min-height:118px;
  padding:19px;
  border:1px solid #DCEAF3;
  border-radius:18px;
  background:#FFFFFF;
  color:#17120E;
  text-align:left;
  cursor:pointer;
  box-shadow:0 9px 22px rgba(32,86,122,.07);
  animation:nfClubPageIn .65s cubic-bezier(.22,1,.36,1) both;
}
.nf-help-option.selected {
  border-color:#147FBE;
  background:#EAF6FD;
  box-shadow:0 0 0 3px rgba(36,160,237,.14);
}
.nf-help-option > div:first-child {
  color:#147FBE;
  font-size:17px !important;
  font-weight:850 !important;
}
.nf-help-option > div:last-child {
  margin-top:6px !important;
  color:#5D5148 !important;
  font-size:14px !important;
  line-height:1.55 !important;
}
.nf-help-form {
  margin-top:18px;
  padding:28px;
  border:1px solid #DCEAF3;
  border-radius:24px;
  background:#FFFFFF;
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-help-form h2 {
  margin:7px 0 18px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
}
@media (max-width:700px) {
  .nf-club-intro,
  .nf-club-benefits,
  .nf-club-preferences,
  .nf-help-hero,
  .nf-help-form {
    padding:22px 18px;
  }
  .nf-club-intro p { font-size:16px; }
  .nf-club-choice-grid,
  .nf-help-options { grid-template-columns:1fr; }
  .nf-club-benefit {
    grid-template-columns:46px minmax(0,1fr);
    gap:12px;
  }
  .nf-club-benefit-icon { width:43px; height:43px; }
}
@media (prefers-reduced-motion:reduce) {
  .nf-club-reveal,
  .nf-help-reveal,
  .nf-club-benefit,
  .nf-help-option {
    animation:none !important;
  }
}

/* ABOUT STORY, DOCK, AND PAGE BUTTON CONSISTENCY */
.nf-back-to-shop {
  padding:6px 12px !important;
  font-size:12px !important;
  color:#FFF8E8 !important;
  border:1px solid rgba(255,255,255,.18) !important;
  border-radius:10px !important;
  background:rgba(255,255,255,.07) !important;
  box-shadow:none !important;
}
.nf-back-to-shop:hover {
  background:rgba(255,255,255,.13) !important;
  border-color:rgba(247,196,28,.34) !important;
}
.nf-story-gallery {
  position:relative;
  min-height:590px;
  align-self:start;
}
.nf-story-photo {
  margin:0;
  overflow:hidden;
  border-radius:24px;
  background:#F7F1E8;
  border:1px solid #E5DACB;
  box-shadow:0 18px 38px rgba(45,31,20,.15);
}
.nf-story-photo img {
  width:100%;
  height:100%;
  display:block;
  object-fit:cover;
}
.nf-story-photo figcaption {
  padding:11px 14px;
  color:#6A5B50;
  background:#FFFFFF;
  font-size:12px;
  font-weight:750;
  line-height:1.4;
}
.nf-story-photo-primary {
  position:absolute;
  left:0;
  top:0;
  width:78%;
  height:430px;
}
.nf-story-photo-secondary {
  position:absolute;
  right:0;
  bottom:0;
  width:62%;
  height:315px;
  border:7px solid #FFFFFF;
}
.nf-story-copy h2 {
  font-size:54px;
}
.nf-story-opening {
  color:#147FBE !important;
  font-size:19px !important;
  line-height:1.6 !important;
  font-weight:850 !important;
}
.nf-story-closing {
  margin-top:18px !important;
  padding-top:18px;
  border-top:1px solid #E4D9CB;
  color:#17120E !important;
  font-weight:750;
}
.nf-difference-dock-inner {
  justify-items:center;
}
.nf-difference-tabs-grid {
  width:min(940px,100%);
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
  overflow:visible;
}
.nf-difference-tabs-grid button {
  width:100%;
  min-width:0;
  white-space:normal;
  text-align:center;
}
.nf-difference-socials {
  display:flex;
  justify-content:center;
  align-items:center;
  gap:9px;
  margin-top:2px;
  color:#FFFFFF;
}
.nf-difference-socials > span {
  margin-right:2px;
  font-size:12px;
  font-weight:850;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.nf-difference-socials a {
  width:38px;
  height:38px;
  padding:0;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#FFF4CE;
  color:#23465D;
  border:1px solid #FFF4CE;
}
.nf-difference-socials svg {
  width:19px;
  height:19px;
  stroke:currentColor;
  stroke-width:2;
}
@media (max-width:700px) {
  .nf-story-gallery {
    min-height:475px;
  }
  .nf-story-photo-primary {
    width:88%;
    height:345px;
  }
  .nf-story-photo-secondary {
    width:68%;
    height:245px;
  }
  .nf-story-copy h2 {
    font-size:45px;
  }
  .nf-difference-tabs-grid {
    grid-template-columns:repeat(5,minmax(98px,1fr));
    overflow-x:auto;
    justify-content:start;
    padding-bottom:3px;
  }
}

/* FINAL STABILITY: SINGLE BUNDLE DEMO, CLEAN HERO, TOP PICKS, AND REVIEW */
.nf-top-card,
.nf-top-card:hover {
  color:#17120E !important;
  background:linear-gradient(145deg,#FFE27A,#F7C41C) !important;
  border-color:#E1A100 !important;
}
.nf-top-card:hover {
  transform:translateY(-3px);
  box-shadow:0 14px 30px rgba(189,126,0,.18) !important;
}
.nf-top-card .nf-top-name,
.nf-top-card .nf-top-price,
.nf-top-card:hover .nf-top-name,
.nf-top-card:hover .nf-top-price {
  color:#17120E !important;
}
.nf-top-card.selected {
  color:#173C52 !important;
  background:linear-gradient(145deg,#A9D5ED,#82BBDD) !important;
  border-color:#6FAFD5 !important;
  box-shadow:0 0 0 3px rgba(79,145,198,.18),0 16px 32px rgba(79,145,198,.18) !important;
}
.nf-top-card.selected .nf-top-name,
.nf-top-card.selected .nf-top-price {
  color:#173C52 !important;
}
.nf-top-badge,
.nf-top-card:hover .nf-top-badge {
  background:#173C52 !important;
  color:#FFF4B8 !important;
  border-color:#173C52 !important;
}
.nf-top-card.selected .nf-top-badge {
  background:#FFF0A8 !important;
  color:#173C52 !important;
  border-color:#D5A600 !important;
}
.nf-layered-hero-title {
  min-height:auto !important;
  display:flex !important;
  flex-direction:column;
  align-items:flex-start;
  gap:0;
  overflow:visible;
}
.nf-layered-hero-title .nf-hero-topline {
  position:relative;
  z-index:3;
  display:block;
  margin:0;
  transform:none !important;
  color:#17120E;
  line-height:.88;
}
.nf-layered-hero-title .nf-hero-honey-word {
  position:relative !important;
  left:auto !important;
  top:auto !important;
  z-index:1;
  display:block;
  width:100%;
  margin:-2px 0 -5px;
  color:rgba(82,146,188,.48);
  font-size:clamp(118px,14vw,196px);
  line-height:.73;
  letter-spacing:-.035em;
  transform:scaleX(1.07);
  transform-origin:left center;
  white-space:nowrap;
}
.nf-layered-hero-title .nf-hero-bottomline {
  position:relative;
  z-index:3;
  display:block;
  margin:0 !important;
  color:#D88D00;
  line-height:.9;
}
.nf-review-type-buttons button:disabled {
  cursor:not-allowed;
  background:#F1F2F3 !important;
  border-color:#D8DADD !important;
  color:#8A8F93 !important;
  opacity:1;
}
@media (max-width:700px) {
  .nf-layered-hero-title .nf-hero-honey-word {
    margin:2px 0 0;
    font-size:clamp(88px,26vw,122px);
    transform:scaleX(1.03);
  }
  .nf-layered-hero-title .nf-hero-topline,
  .nf-layered-hero-title .nf-hero-bottomline {
    line-height:.94;
  }
}

/* TYPE CHOICE, HERO, TOP PICKS, AND SPUN AVAILABILITY REFINEMENT */
.nf-top-card {
  color:#17120E !important;
  background:linear-gradient(145deg,#FFE27A,#F7C41C) !important;
  border-color:#E1A100 !important;
}
.nf-top-card .nf-top-name,
.nf-top-card .nf-top-price {
  color:#17120E !important;
}
.nf-top-card:hover,
.nf-top-card.selected {
  color:#173C52 !important;
  background:linear-gradient(145deg,#A9D5ED,#82BBDD) !important;
  border-color:#6FAFD5 !important;
  box-shadow:0 17px 34px rgba(79,145,198,.20) !important;
}
.nf-top-card:hover .nf-top-name,
.nf-top-card:hover .nf-top-price,
.nf-top-card.selected .nf-top-name,
.nf-top-card.selected .nf-top-price {
  color:#173C52 !important;
}
.nf-top-badge {
  background:#173C52 !important;
  color:#FFF4B8 !important;
  border-color:#173C52 !important;
}
.nf-top-card:hover .nf-top-badge,
.nf-top-card.selected .nf-top-badge {
  background:#FFF0A8 !important;
  color:#173C52 !important;
  border-color:#D5A600 !important;
}
.nf-modern-kicker {
  position:relative;
  z-index:4;
}
.nf-layered-hero-title {
  margin-top:3px;
}
.nf-layered-hero-title .nf-hero-topline {
  color:#17120E;
  transform:translateY(-8px);
}
.nf-layered-hero-title .nf-hero-honey-word {
  top:50px;
  color:rgba(92,157,198,.42);
  font-size:clamp(132px,15.5vw,210px);
  letter-spacing:-.035em;
  transform:scaleX(1.08);
  transform-origin:left center;
}
.nf-layered-hero-title .nf-hero-bottomline {
  margin-top:94px;
}
.nf-modern-subtitle {
  display:grid;
  gap:3px;
}
.nf-modern-subtitle strong {
  color:#4F91C6;
  font-weight:850;
}
.nf-modern-hero-image {
  border-radius:28px 0 0 28px;
}
.nf-type-selector-section {
  padding:18px 0 4px;
  background:#FFFFFF;
}
.nf-type-section-heading {
  align-items:center;
  margin-top:10px;
}
.nf-type-info-link {
  border:0;
  background:transparent;
  color:#147FBE;
  font:inherit;
  font-size:13px;
  font-weight:800;
  text-decoration:underline;
  text-underline-offset:3px;
  cursor:pointer;
}
.nf-type-choice-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:14px;
}
.nf-type-choice-card {
  min-height:116px;
  display:flex;
  align-items:center;
  gap:15px;
  padding:19px;
  border:1.5px solid #BCD8E9;
  border-radius:20px;
  background:linear-gradient(145deg,#FFFFFF,#F7FBFE);
  color:#17120E;
  text-align:left;
  cursor:pointer;
  box-shadow:0 9px 22px rgba(32,86,122,.07);
}
.nf-type-choice-card.selected {
  border-color:#147FBE;
  background:#EAF6FD;
  box-shadow:0 0 0 3px rgba(36,160,237,.14),0 11px 24px rgba(32,86,122,.09);
}
.nf-type-choice-card.unavailable {
  background:#F2F3F4;
  border-color:#D8DADD;
  color:#777D82;
  cursor:not-allowed;
}
.nf-type-choice-icon {
  width:52px;
  height:52px;
  flex:0 0 52px;
  display:grid;
  place-items:center;
  border-radius:16px;
  background:#EAF6FD;
}
.nf-type-choice-card.unavailable .nf-type-choice-icon {
  filter:grayscale(1);
  opacity:.55;
}
.nf-type-choice-card strong {
  display:block;
  color:#174F72;
  font-size:19px;
}
.nf-type-choice-card small {
  display:block;
  margin-top:5px;
  color:#667783;
  font-size:14px;
  line-height:1.4;
}
.nf-type-question {
  color:#147FBE;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:34px;
}
.nf-type-notice {
  margin-top:12px;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
  padding:13px 15px;
  border:1px solid #72B7E4;
  border-radius:14px;
  background:#EEF8FE;
  color:#315E7B;
  font-size:14px;
  line-height:1.55;
}
.nf-type-notice button {
  border:0;
  background:transparent;
  color:#147FBE;
  font-size:20px;
  cursor:pointer;
}
.nf-review-type-alert,
.nf-review-type-help {
  margin:10px 0 12px;
  padding:12px 13px;
  border-radius:13px;
  font-size:13px;
  line-height:1.5;
}
.nf-review-type-alert {
  display:grid;
  gap:3px;
  border:1px solid #72B7E4;
  background:#EEF8FE;
  color:#315E7B;
}
.nf-review-type-help {
  border:1px solid #E0A400;
  background:#FFF8D8;
  color:#634C00;
}
.nf-review-item-copy {
  min-width:0;
}
.nf-review-type-buttons {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-top:8px;
}
.nf-review-type-buttons button {
  min-width:82px;
  padding:7px 9px;
  border:1px solid #BCD8E9;
  border-radius:999px;
  background:#FFFFFF;
  color:#315E7B;
  font:inherit;
  font-size:12px;
  font-weight:800;
  cursor:pointer;
}
.nf-review-type-buttons button.selected {
  background:#147FBE;
  border-color:#147FBE;
  color:#FFFFFF;
}
.nf-review-type-buttons button[aria-disabled="true"] {
  background:#F1F2F3;
  border-color:#D8DADD;
  color:#8A8F93;
}
.nf-review-type-buttons small {
  display:block;
  margin-top:1px;
  font-size:9px;
}
.nf-admin-spun-card {
  display:grid;
  gap:13px;
  margin:12px 0 18px;
  padding:18px;
  border:2px solid #72B7E4;
  border-radius:18px;
  background:#F7FBFE;
}
.nf-admin-spun-card h3 {
  margin:5px 0 7px;
  color:#174F72;
  font-size:20px;
}
.nf-admin-spun-card p {
  margin:0;
  color:#5D7180;
  font-size:13px;
  line-height:1.55;
}
.nf-admin-spun-toggle {
  display:flex;
  align-items:center;
  gap:9px;
  color:#174F72;
  font-size:14px;
  font-weight:800;
}
.nf-admin-spun-toggle input {
  width:20px;
  height:20px;
}
@media (max-width:700px) {
  .nf-layered-hero-title .nf-hero-topline {
    transform:translateY(-3px);
  }
  .nf-layered-hero-title .nf-hero-honey-word {
    top:52px;
    font-size:clamp(100px,30vw,142px);
    transform:scaleX(1.04);
  }
  .nf-layered-hero-title .nf-hero-bottomline {
    margin-top:78px;
  }
  .nf-type-choice-grid {
    grid-template-columns:1fr;
  }
  .nf-modern-hero-image {
    border-radius:22px 0 0 22px;
  }
  .nf-final-review-item {
    grid-template-columns:10px minmax(0,1fr);
  }
  .nf-final-review-quantity {
    grid-column:2;
    justify-self:start;
  }
}

/* VISUAL POLISH: TOP PICKS, CLUB, HERO, BUNDLES, CART, AND BUTTONS */
.nf-top-card {
  background:linear-gradient(145deg,#8FC7E8,#6FAFD5) !important;
  border-color:#6FAFD5 !important;
  border-radius:20px !important;
}
.nf-top-card img {
  border-radius:16px;
}
.nf-top-badge {
  background:#FFF0A8 !important;
  color:#23465D !important;
  border:1px solid rgba(35,70,93,.18);
}
.nf-top-card:hover .nf-top-badge,
.nf-top-card.selected .nf-top-badge {
  background:#147FBE !important;
  color:#FFFFFF !important;
  border-color:#147FBE !important;
}
.nf-club-benefits {
  color:#174F72;
  background:linear-gradient(145deg,#EFF8FD,#E3F2FA);
  border:1px solid #BCD8E9;
  box-shadow:0 12px 28px rgba(32,86,122,.10);
}
.nf-club-benefits-heading {
  color:#174F72;
}
.nf-club-benefit {
  border-top-color:rgba(20,127,190,.16);
}
.nf-club-benefit-icon {
  color:#147FBE;
  background:#FFFFFF;
  border-color:#BCD8E9;
}
.nf-club-benefit strong {
  color:#174F72;
}
.nf-club-benefit p {
  color:#5D7180;
}
.nf-club-intro-outlined {
  border:2px solid #72B7E4;
  box-shadow:0 10px 26px rgba(32,86,122,.08);
}
.nf-layered-hero-title {
  position:relative;
  min-height:248px;
  display:grid;
  align-content:center;
  overflow:visible;
}
.nf-layered-hero-title .nf-hero-topline,
.nf-layered-hero-title .nf-hero-bottomline {
  position:relative;
  z-index:2;
  display:block;
}
.nf-layered-hero-title .nf-hero-topline {
  font-size:.88em;
}
.nf-layered-hero-title .nf-hero-bottomline {
  margin-top:82px;
  color:#D88D00;
}
.nf-layered-hero-title .nf-hero-honey-word {
  position:absolute;
  left:-4px;
  top:38px;
  z-index:1;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(120px,14vw,190px);
  line-height:.72;
  letter-spacing:-.02em;
  color:rgba(114,183,228,.30);
  text-transform:uppercase;
  white-space:nowrap;
  pointer-events:none;
}
.nf-empty {
  background:#F2F3F4 !important;
  border-color:#D8DADD !important;
}
.nf-empty .display,
.nf-empty > div {
  color:#70757A !important;
}
.nf-bundle-headline {
  align-items:flex-start;
  gap:10px;
}
.nf-bundle-headline-main,
.nf-bundle-headline-price {
  display:block;
  font-size:clamp(72px,9vw,132px);
  line-height:.78;
  letter-spacing:-.02em;
}
.nf-bundle-headline-price {
  color:#72B7E4;
}
.nf-bundle-complete-message {
  display:grid;
  grid-template-columns:44px minmax(0,1fr);
  align-items:center;
  gap:11px;
  color:#72B7E4;
  font-size:16px;
  line-height:1.5;
  font-weight:750;
}
.nf-bundle-complete-message b {
  color:#5A9BCB;
  font-size:18px;
}
.nf-bundle-complete-icon {
  width:42px;
  height:42px;
  display:grid;
  place-items:center;
  color:#5A9BCB;
  animation:nfBundleCompletePop .45s cubic-bezier(.22,1,.36,1) both;
}
.nf-bundle-complete-icon svg {
  width:42px;
  height:42px;
  stroke:currentColor;
  stroke-width:3;
  stroke-linecap:round;
  stroke-linejoin:round;
}
@keyframes nfBundleCompletePop {
  from { opacity:0; transform:scale(.72); }
  to { opacity:1; transform:scale(1); }
}
.nf-pick-add {
  background:linear-gradient(145deg,#6FAFD5,#4F91C6) !important;
  color:#FFFFFF !important;
  box-shadow:0 6px 14px rgba(79,145,198,.24) !important;
}
.nf-pick-add:hover {
  background:linear-gradient(145deg,#7BB9DD,#5598CD) !important;
}
.nf-pick-qty-btn {
  background:#F2AA00 !important;
  color:#17120E !important;
}
.nf-text-us-fab {
  top:-84px !important;
  color:#174F72 !important;
  background:linear-gradient(145deg,#FFE45B,#FFC400) !important;
  border-color:#147FBE !important;
  box-shadow:0 10px 26px rgba(20,127,190,.28) !important;
}
.nf-text-us-fab span {
  color:#174F72;
  background:#FFE45B;
  border:1px solid #147FBE;
}
.nf-cart-tray.open .nf-cart-item-name {
  font-size:18px !important;
}
.nf-cart-tray.open .nf-cart-item-name strong {
  font-size:18px !important;
}
.nf-cart-tray.open .nf-cart-item-name small {
  font-size:15px !important;
  line-height:1.45;
}
@media (max-width:700px) {
  .nf-layered-hero-title {
    min-height:210px;
  }
  .nf-layered-hero-title .nf-hero-topline {
    font-size:.92em;
  }
  .nf-layered-hero-title .nf-hero-bottomline {
    margin-top:66px;
  }
  .nf-layered-hero-title .nf-hero-honey-word {
    top:42px;
    font-size:clamp(92px,27vw,128px);
  }
  .nf-bundle-headline-main,
  .nf-bundle-headline-price {
    font-size:56px;
  }
  .nf-bundle-complete-message {
    font-size:15px;
  }
  .nf-text-us-fab {
    top:-76px !important;
  }
  .nf-cart-tray.open .nf-cart-item-name,
  .nf-cart-tray.open .nf-cart-item-name strong {
    font-size:17px !important;
  }
  .nf-cart-tray.open .nf-cart-item-name small {
    font-size:14px !important;
  }
}
@media (prefers-reduced-motion:reduce) {
  .nf-bundle-complete-icon {
    animation:none !important;
  }
}

/* TOP PICKS, TEXT CONTACT, FAQ, AND CROSS-PAGE REVEALS */
.nf-universal-dock-links {
  grid-template-columns:repeat(7,minmax(0,1fr));
}
.nf-text-us-fab {
  position:absolute;
  right:clamp(12px,3vw,34px);
  top:-70px;
  width:58px;
  height:58px;
  min-height:58px !important;
  padding:0 !important;
  display:grid !important;
  place-items:center;
  border-radius:50% !important;
  color:#FFFFFF !important;
  background:linear-gradient(145deg,#249FE8,#0E6FA8) !important;
  border:2px solid #FFFFFF !important;
  box-shadow:0 10px 26px rgba(14,111,168,.34) !important;
  text-decoration:none;
}
.nf-text-us-fab svg {
  width:25px;
  height:25px;
  stroke:currentColor;
  stroke-width:1.9;
  stroke-linecap:round;
  stroke-linejoin:round;
}
.nf-text-us-fab span {
  position:absolute;
  bottom:-22px;
  padding:3px 7px;
  border-radius:999px;
  color:#FFFFFF;
  background:#0E6FA8;
  font-size:10px;
  font-weight:850;
  white-space:nowrap;
}
.nf-help-faq {
  margin-top:20px;
  padding:28px;
  border:1px solid #DCEAF3;
  border-radius:24px;
  background:linear-gradient(145deg,#FFFFFF,#F7FBFE);
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-help-faq h2 {
  margin:7px 0 18px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:.95;
}
.nf-help-faq-list {
  display:grid;
  gap:10px;
}
.nf-help-faq-item {
  overflow:hidden;
  border:1px solid #D6E7F1;
  border-radius:15px;
  background:#FFFFFF;
}
.nf-help-faq-item summary {
  position:relative;
  padding:17px 48px 17px 17px;
  color:#174F72;
  font-size:17px;
  line-height:1.45;
  font-weight:850;
  cursor:pointer;
  list-style:none;
}
.nf-help-faq-item summary::-webkit-details-marker {
  display:none;
}
.nf-help-faq-item summary::after {
  content:"+";
  position:absolute;
  right:17px;
  top:50%;
  transform:translateY(-50%);
  color:#147FBE;
  font-size:25px;
  font-weight:700;
}
.nf-help-faq-item[open] summary::after {
  content:"−";
}
.nf-help-faq-item p {
  margin:0;
  padding:0 17px 18px;
  color:#5D5148;
  font-size:16px;
  line-height:1.7;
}
.nf-animations-ready .nf-club-intro.nf-reveal,
.nf-animations-ready .nf-club-benefits.nf-reveal,
.nf-animations-ready .nf-club-section-title.nf-reveal,
.nf-animations-ready .nf-club-preferences.nf-reveal,
.nf-animations-ready .nf-difference-section.nf-reveal,
.nf-animations-ready .nf-story-gallery.nf-reveal,
.nf-animations-ready .nf-find-markets.nf-reveal,
.nf-animations-ready .nf-find-contact.nf-reveal,
.nf-animations-ready .nf-help-hero.nf-reveal,
.nf-animations-ready .nf-help-option.nf-reveal,
.nf-animations-ready .nf-help-form.nf-reveal,
.nf-animations-ready .nf-help-contact.nf-reveal,
.nf-animations-ready .nf-help-faq.nf-reveal,
.nf-animations-ready .pol > *.nf-reveal {
  transform:translate3d(0,20px,0);
}
.nf-animations-ready .nf-club-intro.nf-reveal-visible,
.nf-animations-ready .nf-club-benefits.nf-reveal-visible,
.nf-animations-ready .nf-club-section-title.nf-reveal-visible,
.nf-animations-ready .nf-club-preferences.nf-reveal-visible,
.nf-animations-ready .nf-difference-section.nf-reveal-visible,
.nf-animations-ready .nf-story-gallery.nf-reveal-visible,
.nf-animations-ready .nf-find-markets.nf-reveal-visible,
.nf-animations-ready .nf-find-contact.nf-reveal-visible,
.nf-animations-ready .nf-help-hero.nf-reveal-visible,
.nf-animations-ready .nf-help-option.nf-reveal-visible,
.nf-animations-ready .nf-help-form.nf-reveal-visible,
.nf-animations-ready .nf-help-contact.nf-reveal-visible,
.nf-animations-ready .nf-help-faq.nf-reveal-visible,
.nf-animations-ready .pol > *.nf-reveal-visible {
  transform:translate3d(0,0,0);
}
@media (max-width:900px) {
  .nf-universal-dock-links {
    grid-template-columns:repeat(7,minmax(118px,1fr));
    overflow-x:auto;
    justify-content:start;
    scrollbar-width:none;
  }
  .nf-universal-dock-links::-webkit-scrollbar {
    display:none;
  }
}
@media (max-width:700px) {
  .nf-text-us-fab {
    right:10px;
    top:-62px;
    width:52px;
    height:52px;
    min-height:52px !important;
  }
  .nf-help-faq {
    padding:22px 18px;
  }
  .nf-help-faq h2 {
    font-size:36px;
  }
  .nf-help-faq-item summary {
    font-size:16px;
  }
  .nf-help-faq-item p {
    font-size:15.5px;
  }
}

/* SMOOTH UNIVERSAL DOCK, HOME SEARCH, AND ORDER HELP READABILITY */
.nf-universal-dock {
  animation:none !important;
  transition:none !important;
  transform:none;
  opacity:1;
}
.nf-universal-dock.entering {
  opacity:0;
  transform:translate3d(0,22px,0);
}
.nf-universal-dock.settled {
  opacity:1;
  transform:translate3d(0,0,0);
}
.nf-universal-dock.home-dock.entering {
  transition:opacity .85s ease,transform .85s cubic-bezier(.22,1,.36,1) !important;
}
.nf-universal-dock.home-dock.settled {
  transition:none !important;
}
.nf-universal-dock button,
.nf-universal-dock a {
  transition:background .15s ease,border-color .15s ease,color .15s ease;
}
.nf-universal-dock button.selected {
  background:#0E6FA8;
  border-color:#D5F0FF;
  color:#FFFFFF;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);
}
.nf-home-dock-links {
  width:min(900px,100%);
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-site-search {
  width:min(760px,100%);
  display:grid;
  gap:6px;
}
.nf-site-search > label {
  color:#FFFFFF;
  font-size:11px;
  font-weight:850;
  letter-spacing:.08em;
  text-align:center;
  text-transform:uppercase;
}
.nf-site-search-row {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:8px;
}
.nf-site-search-row input {
  min-height:43px;
  padding:10px 14px;
  border:1px solid rgba(255,255,255,.52);
  border-radius:999px;
  background:#FFFFFF;
  color:#17120E;
  font-size:15px;
  box-shadow:none;
}
.nf-site-search-row button {
  min-width:92px;
  background:#0E6FA8;
  border-color:#D5F0FF;
}
.nf-site-search-help {
  padding:8px 12px;
  border-radius:12px;
  background:rgba(15,80,118,.72);
  color:#FFFFFF;
  font-size:13px;
  line-height:1.45;
  text-align:center;
}
.nf-help-page {
  padding-top:34px !important;
}
.nf-help-hero .display {
  font-size:48px !important;
}
.nf-help-hero p {
  font-size:18px !important;
  line-height:1.75 !important;
}
.nf-help-option > div:first-child {
  font-size:20px !important;
}
.nf-help-option > div:last-child {
  font-size:16px !important;
  line-height:1.65 !important;
}
.nf-help-form h2 {
  font-size:44px;
}
.nf-help-form,
.nf-help-form input,
.nf-help-form textarea,
.nf-help-form button {
  font-size:16px;
}
.nf-help-contact {
  margin-top:20px;
  padding:28px;
  border:1px solid #DCEAF3;
  border-radius:24px;
  background:#FFFFFF;
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-help-contact h2 {
  margin:7px 0 10px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:.95;
}
.nf-help-contact > p {
  margin:0 0 18px;
  color:#5D5148;
  font-size:16px;
  line-height:1.7;
}
.nf-help-contact-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.nf-help-contact-grid a {
  padding:18px;
  border-radius:16px;
  background:linear-gradient(145deg,#249FE8,#147FBE);
  color:#FFFFFF;
  text-decoration:none;
  box-shadow:0 10px 22px rgba(20,127,190,.18);
}
.nf-help-contact-grid span {
  display:block;
  color:rgba(255,255,255,.76);
  font-size:12px;
  font-weight:850;
  letter-spacing:.09em;
  text-transform:uppercase;
}
.nf-help-contact-grid strong {
  display:block;
  margin-top:5px;
  font-size:18px;
}
@media (max-width:700px) {
  .nf-home-dock-links {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .nf-site-search-row {
    grid-template-columns:1fr;
  }
  .nf-site-search-row button {
    width:100%;
  }
  .nf-help-hero .display {
    font-size:40px !important;
  }
  .nf-help-hero p {
    font-size:17px !important;
  }
  .nf-help-option > div:first-child {
    font-size:19px !important;
  }
  .nf-help-option > div:last-child {
    font-size:15.5px !important;
  }
  .nf-help-contact {
    padding:22px 18px;
  }
  .nf-help-contact-grid {
    grid-template-columns:1fr;
  }
}
@media (prefers-reduced-motion:reduce) {
  .nf-universal-dock.entering,
  .nf-universal-dock.settled {
    opacity:1 !important;
    transform:none !important;
    transition:none !important;
  }
}

/* UNIVERSAL BLUE NAVIGATION, THREE-IMAGE STORY, AND FIND PAGE */
.nf-universal-dock {
  position:fixed;
  left:0;
  right:0;
  bottom:0;
  z-index:115;
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));
  background:#24A0ED;
  border-top:1px solid rgba(255,255,255,.48);
  box-shadow:0 -10px 30px rgba(18,89,132,.28);
  animation:nfUniversalDockIn .7s cubic-bezier(.22,1,.36,1) both;
}
@keyframes nfUniversalDockIn {
  from { opacity:0; transform:translate3d(0,30px,0); }
  to { opacity:1; transform:translate3d(0,0,0); }
}
.nf-universal-dock-inner {
  width:min(1180px,100%);
  margin:0 auto;
  display:grid;
  justify-items:center;
  gap:8px;
}
.nf-universal-dock-links {
  width:min(980px,100%);
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-universal-dock button,
.nf-universal-dock a {
  min-height:39px;
  padding:8px 12px;
  border:1px solid rgba(255,255,255,.45);
  border-radius:999px;
  background:rgba(255,255,255,.12);
  color:#FFFFFF;
  font:inherit;
  font-size:12px;
  font-weight:800;
  text-align:center;
  text-decoration:none;
  cursor:pointer;
}
.nf-universal-dock button:hover,
.nf-universal-dock a:hover {
  background:rgba(255,255,255,.2);
}
.nf-universal-socials {
  display:flex;
  align-items:center;
  justify-content:center;
  gap:9px;
  color:#FFFFFF;
}
.nf-universal-socials > span {
  font-size:11px;
  font-weight:850;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.nf-universal-socials a {
  width:36px;
  height:36px;
  min-height:36px;
  padding:0;
  display:grid;
  place-items:center;
  border-radius:50%;
  background:#FFF4CE;
  color:#23465D;
  border-color:#FFF4CE;
}
.nf-universal-socials svg {
  width:18px;
  height:18px;
  stroke:currentColor;
  stroke-width:2;
}
.nf-story-gallery-three {
  min-height:700px;
}
.nf-story-photo-founders {
  position:absolute;
  left:0;
  top:0;
  width:82%;
  height:420px;
  z-index:1;
}
.nf-story-gallery-three .nf-story-photo-primary {
  left:auto;
  right:0;
  top:365px;
  width:63%;
  height:275px;
  z-index:3;
  border:7px solid #FFFFFF;
}
.nf-story-gallery-three .nf-story-photo-secondary {
  left:0;
  right:auto;
  bottom:0;
  width:54%;
  height:245px;
  z-index:2;
  border:7px solid #FFFFFF;
}
.nf-find-markets,
.nf-find-contact {
  margin-top:24px;
  padding:28px;
  border:1px solid #DCEAF3;
  border-radius:24px;
  background:#FFFFFF;
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-find-markets h2,
.nf-find-contact h2 {
  margin:7px 0 18px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:40px;
  line-height:.95;
}
.nf-find-market-list {
  display:grid;
  gap:10px;
}
.nf-find-market-card {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:18px;
  padding:16px 17px;
  border:1px solid #DCEAF3;
  border-radius:16px;
  background:#F7FBFE;
}
.nf-find-market-card strong {
  display:block;
  color:#147FBE;
  font-size:17px;
}
.nf-find-market-card span {
  display:block;
  margin-top:4px;
  color:#5D5148;
  font-size:14px;
  line-height:1.5;
}
.nf-find-market-card time {
  flex:0 0 auto;
  color:#17120E;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:23px;
}
.nf-find-empty {
  padding:18px;
  border-radius:15px;
  background:#F7FBFE;
  color:#5D5148;
  font-size:15px;
  line-height:1.6;
}
.nf-find-contact-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.nf-find-contact-grid a {
  padding:18px;
  border-radius:16px;
  background:linear-gradient(145deg,#249FE8,#147FBE);
  color:#FFFFFF;
  text-decoration:none;
  box-shadow:0 10px 22px rgba(20,127,190,.18);
}
.nf-find-contact-grid span {
  display:block;
  color:rgba(255,255,255,.76);
  font-size:11px;
  font-weight:850;
  letter-spacing:.09em;
  text-transform:uppercase;
}
.nf-find-contact-grid strong {
  display:block;
  margin-top:5px;
  font-size:17px;
}
.nf-find-reveal {
  animation:nfUniversalDockIn .75s cubic-bezier(.22,1,.36,1) both;
}
@media (max-width:700px) {
  .nf-universal-dock {
    padding-left:8px;
    padding-right:8px;
  }
  .nf-universal-dock-links {
    grid-template-columns:repeat(4,minmax(112px,1fr));
    overflow-x:auto;
    justify-content:start;
    scrollbar-width:none;
    padding-bottom:2px;
  }
  .nf-universal-dock-links::-webkit-scrollbar { display:none; }
  .nf-universal-dock button,
  .nf-universal-dock a {
    font-size:11px;
    padding:8px 9px;
  }
  .nf-story-gallery-three {
    min-height:560px;
  }
  .nf-story-photo-founders {
    width:90%;
    height:330px;
  }
  .nf-story-gallery-three .nf-story-photo-primary {
    top:285px;
    width:68%;
    height:225px;
  }
  .nf-story-gallery-three .nf-story-photo-secondary {
    width:58%;
    height:195px;
  }
  .nf-find-markets,
  .nf-find-contact {
    padding:22px 18px;
  }
  .nf-find-market-card {
    align-items:flex-start;
  }
  .nf-find-contact-grid {
    grid-template-columns:1fr;
  }
}

/* BRAND, CART, AND DIFFERENCE PAGE REFINEMENT */
.nf-modern-brand > img {
  background:url("/logo.png") center/contain no-repeat;
}
.nf-brand-wordmark {
  color:#FFFFFF;
}
.nf-brand-wordmark > span {
  color:#FFD21F;
}
.nf-nav-tagline {
  color:#72B7E4;
}
.nf-cart-badge.empty {
  background:#D62828 !important;
  color:#FFFFFF !important;
  border-color:#FFFFFF !important;
  opacity:1 !important;
}

.nf-cart-delivery-warning {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:14px;
  margin:0 0 14px;
  padding:13px 14px;
  border:2px solid rgba(255,255,255,.72);
  border-radius:14px;
  background:#D62828;
  color:#FFFFFF;
  box-shadow:0 8px 22px rgba(74,0,0,.25);
}

.nf-cart-delivery-warning-copy {
  min-width:0;
  font-size:14px;
  line-height:1.5;
  font-weight:750;
}

.nf-cart-delivery-warning-copy strong {
  font-family:inherit !important;
  font-size:inherit !important;
  line-height:inherit !important;
  letter-spacing:0 !important;
  text-shadow:none !important;
}

.nf-cart-delivery-warning-note {
  margin-top:4px;
  font-size:12px;
  font-weight:650;
  color:rgba(255,255,255,.9);
}

.nf-cart-delivery-warning button {
  flex:0 0 auto;
  min-height:38px;
  padding:8px 12px;
  border:1px solid rgba(255,255,255,.75);
  border-radius:10px;
  background:#FFFFFF;
  color:#9D1717;
  font:inherit;
  font-size:12.5px;
  font-weight:900;
  cursor:pointer;
}

.nf-cart-tray.open {
  top:0;
  height:100dvh;
  display:flex;
  align-items:stretch;
  background:linear-gradient(180deg,#249FE8 0%,#147FBE 100%);
  overflow:hidden;
}
.nf-cart-tray.open .nf-cart-tray-inner {
  width:100%;
  max-width:none;
  height:100%;
  padding:calc(18px + env(safe-area-inset-top)) clamp(18px,4vw,54px)
    calc(20px + env(safe-area-inset-bottom));
  display:flex;
  flex-direction:column;
}
.nf-cart-tray.open .nf-cart-tray-toggle {
  flex:0 0 auto;
  min-height:54px;
  padding:0 0 14px;
  font-size:16px;
  border-bottom:1px solid rgba(255,255,255,.32);
}
.nf-cart-tray.open .nf-cart-items {
  flex:1;
  max-height:none;
  overflow-y:auto;
  margin:18px 0;
  padding:8px;
  background:rgba(255,255,255,.11);
}
.nf-cart-tray.open .nf-cart-item {
  grid-template-columns:12px minmax(0,1fr) 42px 34px 42px;
  gap:12px;
  padding:14px 13px;
}
.nf-cart-tray.open .nf-cart-item-name {
  font-size:16px;
  line-height:1.35;
}
.nf-cart-tray.open .nf-cart-item-name small {
  font-size:13px;
}
.nf-cart-tray.open .nf-cart-item button {
  width:42px;
  height:42px;
  font-size:23px;
}
.nf-cart-tray.open .nf-cart-item-qty {
  font-size:17px;
}
.nf-cart-tray.open .nf-cart-savings {
  font-size:14px;
  padding:12px 13px;
}
.nf-cart-tray.open .nf-cart-summary {
  flex:0 0 auto;
  padding-top:16px;
  border-top:1px solid rgba(255,255,255,.32);
}
.nf-cart-tray.open .nf-cart-totals {
  font-size:20px;
  line-height:1.55;
  font-weight:800;
}
.nf-cart-tray.open .nf-cart-totals span {
  margin-top:12px;
  font-size:16px;
  font-weight:950;
  letter-spacing:.12em;
}
.nf-cart-tray.open .nf-cart-totals strong {
  font-size:58px;
  font-weight:950;
  letter-spacing:.015em;
  text-shadow:0 2px 0 rgba(0,0,0,.12);
}
.nf-cart-tray .nf-guided-order-button {
  background:linear-gradient(145deg,#FFE545,#FFC400) !important;
  border-color:#E3A900 !important;
  color:#17120E !important;
  font-weight:900;
  box-shadow:0 8px 22px rgba(84,57,0,.24),inset 0 1px 0 rgba(255,255,255,.7) !important;
}
.nf-cart-tray .nf-guided-order-button:hover {
  background:linear-gradient(145deg,#FFF16B,#FFD21F) !important;
}
.nf-about-anchor {
  scroll-margin-top:94px;
}
.nf-difference-page {
  padding-bottom:170px;
}
.nf-difference-main {
  padding-top:44px;
  padding-bottom:80px;
}
.nf-difference-hero {
  display:grid;
  grid-template-columns:minmax(280px,.8fr) minmax(0,1.2fr);
  align-items:center;
  gap:46px;
}
.nf-difference-section {
  display:grid;
  grid-template-columns:86px minmax(0,1fr);
  gap:26px;
  max-width:900px;
  margin:28px auto 0;
  padding:34px;
  border:1px solid #E8E0D7;
  border-radius:24px;
  background:linear-gradient(145deg,#FFFFFF,#FBF7F1);
  box-shadow:0 12px 30px rgba(45,31,20,.08);
}
.nf-difference-number {
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:58px;
  line-height:.9;
  color:#72B7E4;
}
.nf-difference-section h3 {
  margin:7px 0 12px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  line-height:1;
  color:#17120E;
}
.nf-difference-section p {
  margin:0 0 10px;
  color:#5D5148;
  font-size:15px;
  line-height:1.75;
}
.nf-difference-final {
  border-color:#E2A000;
  background:linear-gradient(145deg,#FFFDF5,#FFF7D9);
}
.nf-difference-dock {
  position:fixed;
  left:0;
  right:0;
  bottom:0;
  z-index:120;
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));
  background:#24A0ED;
  border-top:1px solid rgba(255,255,255,.48);
  box-shadow:0 -10px 30px rgba(18,89,132,.28);
  animation:nfDifferenceDockIn .7s cubic-bezier(.22,1,.36,1) both;
}
@keyframes nfDifferenceDockIn {
  from { opacity:0; transform:translate3d(0,30px,0); }
  to { opacity:1; transform:translate3d(0,0,0); }
}
.nf-difference-dock-inner {
  width:min(1180px,100%);
  margin:0 auto;
  display:grid;
  gap:8px;
}
.nf-difference-tabs,
.nf-difference-actions {
  display:flex;
  align-items:center;
  gap:7px;
  overflow-x:auto;
  scrollbar-width:none;
}
.nf-difference-tabs::-webkit-scrollbar,
.nf-difference-actions::-webkit-scrollbar {
  display:none;
}
.nf-difference-dock button,
.nf-difference-dock a {
  flex:0 0 auto;
  min-height:38px;
  padding:8px 12px;
  border:1px solid rgba(255,255,255,.45);
  border-radius:999px;
  background:rgba(255,255,255,.12);
  color:#FFFFFF;
  font:inherit;
  font-size:12px;
  font-weight:800;
  text-decoration:none;
  cursor:pointer;
}
.nf-difference-actions {
  justify-content:flex-end;
}
.nf-difference-actions a {
  background:#FFF4CE;
  color:#23465D;
  border-color:#FFF4CE;
}
@media (max-width:700px) {
  .nf-cart-tray.open .nf-cart-tray-inner {
    padding-left:14px;
    padding-right:14px;
  }
  .nf-cart-tray.open .nf-cart-summary {
    display:grid;
    grid-template-columns:1fr;
    gap:12px;
  }
  .nf-cart-tray.open .nf-cart-summary > .btn {
    width:100%;
    max-width:none;
    min-height:54px;
    font-size:16px;
  }
  .nf-cart-tray.open .nf-cart-totals {
    font-size:16px;
  }
  .nf-cart-tray.open .nf-cart-totals strong {
    font-size:44px;
  }
  .nf-difference-main {
    padding-top:26px;
  }
  .nf-difference-hero {
    grid-template-columns:1fr;
    gap:25px;
  }
  .nf-difference-section {
    grid-template-columns:58px minmax(0,1fr);
    gap:14px;
    padding:24px 18px;
  }
  .nf-difference-number {
    font-size:42px;
  }
  .nf-difference-section h3 {
    font-size:31px;
  }
  .nf-difference-dock {
    padding-left:8px;
    padding-right:8px;
  }
  .nf-difference-actions {
    justify-content:flex-start;
  }
}

/* REFINED PROFESSIONAL SCROLL REVEALS */
.nf-animations-ready .nf-reveal {
  opacity:0;
  transform:translate3d(0,14px,0);
  transition:
    opacity .7s cubic-bezier(.22,1,.36,1) var(--nf-reveal-delay,0ms),
    transform .7s cubic-bezier(.22,1,.36,1) var(--nf-reveal-delay,0ms);
}
.nf-animations-ready .nf-reveal.nf-reveal-visible {
  opacity:1;
  transform:translate3d(0,0,0);
}

.nf-animations-ready .nf-modern-hero-grid.nf-reveal {
  opacity:0;
  transform:translate3d(0,8px,0);
  transition:
    opacity 2.8s ease .15s,
    transform 2.8s cubic-bezier(.22,1,.36,1) .15s;
}
.nf-animations-ready .nf-modern-hero-grid.nf-reveal.nf-reveal-visible {
  opacity:1;
  transform:translate3d(0,0,0);
}

.nf-animations-ready .nf-bundle-promo-card.nf-reveal {
  opacity:0;
  transform:translate3d(0,90px,0);
  transition:
    opacity 2.4s ease,
    transform 3s cubic-bezier(.16,1,.3,1);
}
.nf-animations-ready .nf-drizzle-promo-card.nf-reveal {
  opacity:0;
  transform:translate3d(0,90px,0);
  transition:
    opacity 2.4s ease,
    transform 3s cubic-bezier(.16,1,.3,1);
}
.nf-animations-ready .nf-bundle-promo-card.nf-reveal.nf-reveal-visible,
.nf-animations-ready .nf-drizzle-promo-card.nf-reveal.nf-reveal-visible {
  opacity:1;
  transform:translate3d(0,0,0);
}

.nf-animations-ready .nf-about-image.nf-reveal,
.nf-animations-ready .nf-top-card.nf-reveal,
.nf-animations-ready .nf-pick-card.nf-reveal {
  transform:translate3d(0,16px,0) scale(.99);
}
.nf-animations-ready .nf-about-image.nf-reveal.nf-reveal-visible,
.nf-animations-ready .nf-top-card.nf-reveal.nf-reveal-visible,
.nf-animations-ready .nf-pick-card.nf-reveal.nf-reveal-visible {
  transform:translate3d(0,0,0) scale(1);
}

@media (max-width:700px) {
  .nf-animations-ready .nf-bundle-promo-card.nf-reveal,
  .nf-animations-ready .nf-drizzle-promo-card.nf-reveal {
    transform:translate3d(0,52px,0);
  }
}

@media (prefers-reduced-motion:reduce) {
  .nf-animations-ready .nf-reveal,
  .nf-animations-ready .nf-reveal.nf-reveal-visible {
    opacity:1 !important;
    transform:none !important;
    transition:none !important;
  }
}

@media (prefers-reduced-motion:reduce) { .nf * { transition:none !important; } }
/* FINAL LIVE-PUBLISH VISUAL OVERRIDES */
.nf-top-card,
.nf-top-card:hover {
  background:#F7C41C !important;
  background-image:linear-gradient(145deg,#FFE27A,#F7C41C) !important;
  border-color:#D9A500 !important;
  color:#17120E !important;
}
.nf-top-card .nf-top-name,
.nf-top-card .nf-top-price,
.nf-top-card:hover .nf-top-name,
.nf-top-card:hover .nf-top-price {
  color:#17120E !important;
}
.nf-top-card:hover {
  transform:translateY(-4px) !important;
  box-shadow:0 15px 30px rgba(189,126,0,.18) !important;
}
.nf-top-card.selected,
.nf-top-card.selected:hover {
  background:#9CCBE6 !important;
  background-image:linear-gradient(145deg,#B7DCF0,#8FC2DF) !important;
  border-color:#6FAFD5 !important;
  color:#173C52 !important;
  box-shadow:0 0 0 3px rgba(79,145,198,.18),0 16px 32px rgba(79,145,198,.18) !important;
}
.nf-top-card.selected .nf-top-name,
.nf-top-card.selected .nf-top-price,
.nf-top-card.selected:hover .nf-top-name,
.nf-top-card.selected:hover .nf-top-price {
  color:#173C52 !important;
}
.nf-top-card .nf-top-badge,
.nf-top-card:hover .nf-top-badge {
  background:#173C52 !important;
  color:#FFF4B8 !important;
  border-color:#173C52 !important;
}
.nf-top-card.selected .nf-top-badge,
.nf-top-card.selected:hover .nf-top-badge {
  background:#FFF0A8 !important;
  color:#173C52 !important;
  border-color:#D5A600 !important;
}

.nf-layered-hero-title {
  display:grid !important;
  grid-template-rows:auto auto auto !important;
  row-gap:18px !important;
  min-height:auto !important;
  overflow:visible !important;
}
.nf-layered-hero-title .nf-hero-topline {
  position:relative !important;
  z-index:3 !important;
  margin:0 !important;
  transform:none !important;
  line-height:.86 !important;
}
.nf-layered-hero-title .nf-hero-honey-word {
  position:relative !important;
  left:auto !important;
  top:auto !important;
  z-index:1 !important;
  display:block !important;
  width:100% !important;
  margin:0 !important;
  color:rgba(82,146,188,.48) !important;
  font-size:clamp(126px,15.2vw,214px) !important;
  line-height:.72 !important;
  letter-spacing:-.035em !important;
  transform:scaleX(1.16) !important;
  transform-origin:left center !important;
  white-space:nowrap !important;
}
.nf-layered-hero-title .nf-hero-bottomline {
  position:relative !important;
  z-index:3 !important;
  margin:0 !important;
  line-height:.88 !important;
}

@media (max-width:700px) {
  .nf-layered-hero-title {
    row-gap:14px !important;
  }
  .nf-layered-hero-title .nf-hero-honey-word {
    font-size:clamp(92px,27vw,128px) !important;
    transform:scaleX(1.09) !important;
  }
  .nf-layered-hero-title .nf-hero-topline,
  .nf-layered-hero-title .nf-hero-bottomline {
    line-height:.94 !important;
  }
}

/* PARTNER PAGE ROUTING AND COMPACT SHARED UNIVERSAL DOCK */
.nf-universal-dock {
  padding:7px 10px calc(7px + env(safe-area-inset-bottom));
}
.nf-universal-dock-inner {
  gap:6px;
}
.nf-universal-dock .nf-site-search {
  order:2;
  width:min(720px,100%);
  gap:4px;
}
.nf-universal-dock .nf-site-search > label {
  font-size:10px;
}
.nf-universal-dock .nf-site-search-row input {
  min-height:38px;
  padding:8px 12px;
  font-size:14px;
}
.nf-universal-dock .nf-site-search-row button {
  min-height:38px;
  padding:7px 14px;
}
.nf-universal-dock .nf-universal-dock-links,
.nf-universal-dock .nf-home-dock-links {
  order:1;
  width:min(1080px,100%);
  display:flex;
  grid-template-columns:none;
  align-items:center;
  justify-content:center;
  gap:7px;
  overflow-x:auto;
  scrollbar-width:none;
  padding-bottom:1px;
}
.nf-universal-dock .nf-universal-dock-links::-webkit-scrollbar,
.nf-universal-dock .nf-home-dock-links::-webkit-scrollbar {
  display:none;
}
.nf-universal-dock .nf-universal-dock-links > button,
.nf-universal-dock .nf-universal-dock-links > a,
.nf-universal-dock .nf-home-dock-links > button,
.nf-universal-dock .nf-home-dock-links > a {
  flex:0 0 auto;
  width:auto;
  min-height:36px;
  padding:7px 11px;
  font-size:11.5px;
  white-space:nowrap;
}
.nf-universal-dock .nf-dock-social {
  width:36px !important;
  min-width:36px;
  height:36px;
  min-height:36px !important;
  padding:0 !important;
  display:grid;
  place-items:center;
  border-radius:50%;
}
.nf-universal-dock .nf-dock-social svg {
  width:18px;
  height:18px;
  stroke:currentColor;
  stroke-width:1.8;
}
@media (max-width:700px) {
  .nf-universal-dock {
    padding:5px 7px calc(5px + env(safe-area-inset-bottom));
  }
  .nf-universal-dock-inner { gap:4px; }
  .nf-universal-dock .nf-site-search > label { display:none; }
  .nf-universal-dock .nf-site-search-row input {
    min-height:36px;
    padding:7px 10px;
    font-size:13px;
  }
  .nf-universal-dock .nf-site-search-row button {
    min-height:36px;
    padding:6px 11px;
    font-size:11px;
  }
  .nf-universal-dock .nf-universal-dock-links,
  .nf-universal-dock .nf-home-dock-links {
    justify-content:flex-start;
  }
  .nf-universal-dock .nf-universal-dock-links > button,
  .nf-universal-dock .nf-universal-dock-links > a,
  .nf-universal-dock .nf-home-dock-links > button,
  .nf-universal-dock .nf-home-dock-links > a {
    min-height:33px;
    padding:6px 9px;
    font-size:10.5px;
  }
  .nf-universal-dock .nf-dock-social {
    width:33px !important;
    min-width:33px;
    height:33px;
    min-height:33px !important;
  }
}




/* 2026 MOBILE FOUNDATION, FIXED DOCK, AND EXPANDABLE SEARCH */
html,
body,
#root {
  min-height:100%;
  width:100%;
  max-width:100%;
}

html {
  -webkit-text-size-adjust:100%;
  text-size-adjust:100%;
}

body {
  position:relative;
  min-width:0;
}

.nf,
.nf * {
  box-sizing:border-box;
}

.nf {
  min-width:0;
  min-height:100dvh;
}

.nf input,
.nf select,
.nf textarea {
  max-width:100%;
  font-size:16px;
}

.nf-loading-brand {
  font-family:'Bebas Neue',Impact,sans-serif;
  color:#17120E;
  font-size:clamp(38px,8vw,58px);
  line-height:1;
  letter-spacing:.02em;
}

.nf-loading-tagline {
  margin-top:7px;
  color:#4F7790;
  font-size:16px;
  font-weight:750;
  letter-spacing:.025em;
}

.nf-universal-dock {
  bottom:-1px !important;
  width:100%;
  max-width:100vw;
  transform:translateZ(0);
}

.nf-universal-dock-inner {
  min-width:0;
}

.nf-universal-dock .nf-universal-dock-links.search-open {
  display:none;
}

.nf-universal-dock .nf-site-search.closed {
  order:2;
  width:auto;
}

.nf-site-search-toggle {
  min-width:46px;
  min-height:46px;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  border:1px solid rgba(255,255,255,.62);
  border-radius:999px;
  background:rgba(13,79,119,.28);
  color:#FFFFFF;
  font:inherit;
  font-size:16px !important;
  font-weight:800;
  cursor:pointer;
}

.nf-site-search-toggle svg {
  width:22px;
  height:22px;
  stroke:currentColor;
  stroke-width:2;
  stroke-linecap:round;
}

.nf-universal-dock .nf-site-search.open {
  order:1;
  width:min(760px,100%);
}

.nf-universal-dock .nf-site-search.open > label {
  display:block;
  color:#FFFFFF;
  font-size:16px;
  font-weight:800;
  text-align:center;
}

.nf-universal-dock .nf-site-search-row {
  grid-template-columns:minmax(0,1fr) auto auto;
  align-items:center;
}

.nf-universal-dock .nf-site-search-row input,
.nf-universal-dock .nf-site-search-submit {
  min-height:46px;
  font-size:16px !important;
}

.nf-site-search-close {
  width:40px;
  min-width:40px;
  height:40px;
  min-height:40px !important;
  padding:0 !important;
  display:grid;
  place-items:center;
  align-self:center;
  border:2px solid rgba(255,255,255,.95) !important;
  border-radius:50% !important;
  background:#C82727 !important;
  color:#FFFFFF !important;
  box-shadow:0 4px 12px rgba(82,12,12,.28);
  cursor:pointer;
}

.nf-site-search-close svg {
  width:21px;
  height:21px;
  stroke:currentColor;
  stroke-width:2.6;
  stroke-linecap:round;
}

.nf-universal-dock button,
.nf-universal-dock a {
  font-size:16px !important;
}

@media (max-width:700px) {
  .nf-universal-dock {
    padding:9px 10px calc(15px + env(safe-area-inset-bottom)) !important;
  }

  .nf-universal-dock-inner {
    gap:9px !important;
    padding-bottom:2px;
  }

  .nf-universal-dock .nf-universal-dock-links,
  .nf-universal-dock .nf-home-dock-links {
    width:100%;
    display:grid;
    grid-template-columns:
      minmax(0,1fr)
      minmax(0,1fr)
      minmax(0,1fr)
      minmax(145px,1.45fr);
    grid-template-rows:repeat(2,auto);
    align-items:stretch;
    justify-content:stretch;
    gap:8px;
    overflow:visible !important;
    padding:0 !important;
  }

  .nf-universal-dock .nf-universal-dock-links > button,
  .nf-universal-dock .nf-universal-dock-links > a,
  .nf-universal-dock .nf-home-dock-links > button,
  .nf-universal-dock .nf-home-dock-links > a {
    width:100%;
    min-width:0;
    min-height:47px;
    padding:7px 4px;
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
    white-space:normal;
    overflow-wrap:anywhere;
    font-size:15px !important;
    line-height:1.15;
  }

  .nf-universal-dock .nf-dock-social {
    width:100% !important;
    min-width:0;
    height:44px;
    min-height:44px !important;
    border-radius:999px;
  }

  .nf-universal-dock .nf-near-me-button {
    grid-column:auto;
    min-height:47px;
    white-space:nowrap !important;
    overflow-wrap:normal !important;
    font-size:14px !important;
    letter-spacing:-.02em;
  }

  .nf-universal-dock .nf-site-search.closed {
    width:100%;
  }

  .nf-site-search-toggle {
    width:100%;
    min-height:46px;
  }

  .nf-universal-dock .nf-site-search-row {
    grid-template-columns:minmax(0,1fr) auto;
  }

  .nf-universal-dock .nf-site-search-submit {
    width:auto;
    min-width:82px;
  }

  .nf-site-search-close {
    grid-column:auto;
    justify-self:center;
    margin:4px 0 2px;
  }

  .nf-universal-dock .nf-site-search-help {
    font-size:15px;
    line-height:1.4;
  }
}


/* EXACT TWO-ROW MOBILE UNIVERSAL NAVIGATION */
.nf-universal-dock-links {
  display:grid;
  gap:8px;
}

.nf-dock-row {
  width:100%;
  display:flex;
  align-items:stretch;
  justify-content:center;
  gap:7px;
}

.nf-dock-row > button,
.nf-dock-row > a {
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
}

.nf-dock-row-primary > button {
  flex:1 1 0;
  min-width:0;
}

.nf-dock-row-secondary .nf-near-me-button {
  flex:1.8 1 0;
  min-width:0;
}

.nf-dock-row-secondary .nf-dock-contact {
  flex:.8 1 0;
  min-width:72px;
}

@media (max-width:700px) {
  .nf-universal-dock .nf-universal-dock-links,
  .nf-universal-dock .nf-home-dock-links {
    display:grid !important;
    grid-template-columns:1fr !important;
    grid-template-rows:repeat(2,auto) !important;
    gap:8px !important;
    overflow:visible !important;
    padding:0 !important;
  }

  .nf-dock-row {
    min-width:0;
    flex-wrap:nowrap;
    overflow:visible;
  }

  .nf-dock-row > button,
  .nf-dock-row > a {
    width:auto !important;
    min-height:46px !important;
    padding:8px 7px !important;
    border-radius:999px;
    font-size:15px !important;
    line-height:1.15;
    white-space:nowrap !important;
    overflow-wrap:normal !important;
  }

  .nf-dock-row-secondary .nf-near-me-button {
    flex:1.8 1 0;
    min-width:0;
    font-size:14px !important;
    letter-spacing:-.015em;
  }

  .nf-dock-row-secondary .nf-dock-contact {
    flex:.8 1 0;
    min-width:72px;
    font-size:14px !important;
  }

  .nf-universal-dock .nf-dock-row .nf-dock-social {
    flex:0 0 44px;
    width:44px !important;
    min-width:44px !important;
    height:46px !important;
    min-height:46px !important;
    padding:0 !important;
    border:0 !important;
    border-radius:0 !important;
    background:transparent !important;
    box-shadow:none !important;
  }

  .nf-universal-dock .nf-dock-row .nf-dock-social svg {
    width:25px;
    height:25px;
  }
}


/* SPACED, ROUNDED HAMBURGER NAVIGATION BUTTONS */
.nf-modern-links {
  padding:0 !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  box-shadow:none !important;
  gap:9px !important;
}

.nf-modern-links.open {
  display:grid !important;
  gap:9px !important;
}

.nf-modern-links .btn.ghost {
  width:100% !important;
  min-height:50px !important;
  padding:12px 15px !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  text-align:center !important;
  border:1px solid rgba(255,255,255,.3) !important;
  border-radius:13px !important;
  background:rgba(31,20,12,.78) !important;
  color:#FFFFFF !important;
  font-size:16px !important;
  font-weight:700 !important;
  line-height:1.2 !important;
  letter-spacing:.01em;
  box-shadow:0 8px 20px rgba(0,0,0,.16) !important;
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  transform:none !important;
}

.nf-modern-links .btn.ghost:hover,
.nf-modern-links .btn.ghost:focus-visible {
  background:rgba(31,20,12,.9) !important;
  border-color:rgba(247,196,28,.55) !important;
  box-shadow:0 10px 24px rgba(0,0,0,.28) !important;
  transform:translateY(-1px) !important;
}

@media (max-width:640px) {
  .nf-modern-links {
    right:8px !important;
    width:calc(100vw - 16px) !important;
    max-width:none !important;
  }

  .nf-modern-links .btn.ghost {
    min-height:50px !important;
    padding:13px 14px !important;
    font-size:16px !important;
  }
}


/* FINAL EXPANDED SEARCH LAYOUT FIX */
.nf-universal-dock .nf-universal-dock-links.search-open,
.nf-universal-dock .nf-home-dock-links.search-open {
  display:none !important;
}

.nf-universal-dock .nf-site-search.open {
  width:min(760px,100%) !important;
}

.nf-universal-dock .nf-site-search.open .nf-site-search-row {
  width:100%;
  display:grid !important;
  grid-template-columns:minmax(0,1fr) auto 42px !important;
  align-items:center;
  gap:9px;
}

.nf-universal-dock .nf-site-search-close {
  grid-column:auto !important;
  width:42px !important;
  min-width:42px !important;
  max-width:42px !important;
  height:42px !important;
  min-height:42px !important;
  max-height:42px !important;
  margin:0 !important;
  padding:0 !important;
  border:2px solid rgba(255,255,255,.95) !important;
  border-radius:50% !important;
  background:#C82727 !important;
  display:grid !important;
  place-items:center !important;
  justify-self:center !important;
  align-self:center !important;
  box-shadow:0 4px 12px rgba(82,12,12,.25) !important;
}

.nf-universal-dock .nf-site-search-close svg {
  width:20px !important;
  height:20px !important;
  stroke:#FFFFFF !important;
  stroke-width:2.7 !important;
  stroke-linecap:round;
}

@media (max-width:700px) {
  .nf-universal-dock .nf-universal-dock-links.search-open,
  .nf-universal-dock .nf-home-dock-links.search-open {
    display:none !important;
  }

  .nf-universal-dock .nf-site-search.open {
    width:100% !important;
  }

  .nf-universal-dock .nf-site-search.open .nf-site-search-row {
    grid-template-columns:minmax(0,1fr) auto 40px !important;
    gap:7px;
  }

  .nf-universal-dock .nf-site-search-row input {
    min-width:0;
    width:100% !important;
  }

  .nf-universal-dock .nf-site-search-submit {
    width:auto !important;
    min-width:78px !important;
    padding-left:12px !important;
    padding-right:12px !important;
  }

  .nf-universal-dock .nf-site-search-close {
    width:40px !important;
    min-width:40px !important;
    max-width:40px !important;
    height:40px !important;
    min-height:40px !important;
    max-height:40px !important;
  }
}


/* INLINE MAGNIFYING-GLASS CONTROL */
.nf-dock-search-icon {
  flex:0 0 44px;
  width:44px !important;
  min-width:44px !important;
  height:46px;
  min-height:46px !important;
  padding:0 !important;
  display:grid !important;
  place-items:center !important;
  border:0 !important;
  border-radius:0 !important;
  background:transparent !important;
  color:#FFFFFF !important;
  box-shadow:none !important;
  cursor:pointer;
}

.nf-dock-search-icon svg {
  width:27px;
  height:27px;
  stroke:currentColor;
  stroke-width:2.1;
  stroke-linecap:round;
}

.nf-dock-search-icon:hover,
.nf-dock-search-icon:focus-visible {
  transform:scale(1.08);
  background:transparent !important;
}

.nf-universal-dock .nf-site-search.open {
  width:min(760px,100%) !important;
  margin:0 auto;
}

.nf-universal-dock .nf-site-search.open .nf-site-search-row {
  width:100%;
  display:grid !important;
  grid-template-columns:minmax(0,1fr) auto 42px !important;
  align-items:center;
  gap:9px;
}

.nf-universal-dock .nf-site-search-close {
  width:42px !important;
  min-width:42px !important;
  max-width:42px !important;
  height:42px !important;
  min-height:42px !important;
  max-height:42px !important;
  margin:0 !important;
  padding:0 !important;
  display:grid !important;
  place-items:center !important;
  border:2px solid rgba(255,255,255,.95) !important;
  border-radius:50% !important;
  background:#C82727 !important;
  box-shadow:0 4px 12px rgba(82,12,12,.24) !important;
}

.nf-universal-dock .nf-site-search-close svg {
  width:19px !important;
  height:19px !important;
  stroke:#FFFFFF !important;
  stroke-width:2.8 !important;
  stroke-linecap:round;
}

@media (max-width:700px) {
  .nf-dock-row-secondary {
    gap:5px !important;
  }

  .nf-dock-row-secondary .nf-near-me-button {
    flex:1.6 1 0;
    min-width:0;
    font-size:13.5px !important;
  }

  .nf-dock-row-secondary .nf-dock-contact {
    flex:.78 1 0;
    min-width:68px;
  }

  .nf-universal-dock .nf-dock-row .nf-dock-social,
  .nf-universal-dock .nf-dock-row .nf-dock-search-icon {
    flex:0 0 36px;
    width:36px !important;
    min-width:36px !important;
    height:46px !important;
    min-height:46px !important;
  }

  .nf-universal-dock .nf-dock-row .nf-dock-social svg,
  .nf-universal-dock .nf-dock-row .nf-dock-search-icon svg {
    width:24px;
    height:24px;
  }

  .nf-universal-dock .nf-site-search.open .nf-site-search-row {
    grid-template-columns:minmax(0,1fr) auto 40px !important;
    gap:7px;
  }

  .nf-universal-dock .nf-site-search-submit {
    width:auto !important;
    min-width:76px !important;
    padding-left:11px !important;
    padding-right:11px !important;
  }

  .nf-universal-dock .nf-site-search-close {
    width:40px !important;
    min-width:40px !important;
    max-width:40px !important;
    height:40px !important;
    min-height:40px !important;
    max-height:40px !important;
  }
}

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
  const [typeNotice, setTypeNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(true);
  const [dockHasEntered, setDockHasEntered] = useState(false);
  const siteSearchRef = useRef(null);
  const [siteSearchHelp, setSiteSearchHelp] = useState("");
  const [siteSearchOpen, setSiteSearchOpen] = useState(false);
  const [searchedOrderNo, setSearchedOrderNo] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [continueAttemptKey, setContinueAttemptKey] = useState("");
  const [continueHelp, setContinueHelp] = useState("");
  const [deliveryWarningDismissedAt, setDeliveryWarningDismissedAt] = useState(null);
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
  const [flavorMode, setFlavorMode] = useState("surprise");
  const [flavorPreferences, setFlavorPreferences] = useState([]);
  const [flavorRequests, setFlavorRequests] = useState("");

  useEffect(() => {
    if (!reviewOpen && !typeInfo) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [reviewOpen, typeInfo]);

  const reload = useCallback(async () => {
    try { setCat(await api.getCatalog()); }
    catch (e) { setBoot(e.message); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => setDockHasEntered(true), 80);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setMenuOpen(false);
    setSiteSearchOpen(false);
    setSiteSearchHelp("");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [view]);

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
  const typeName = (id) =>
    id === "undecided" ? "Decide in review" : TYPES.find((t) => t.id === id)?.name ?? "Regular";

  const spunEnabled = cat?.spunAvailability?.enabled !== false;
  const spunUnavailableMessage =
    cat?.spunAvailability?.message ||
    "Spun honey is temporarily unavailable. Warm weather can soften or melt its whipped texture.";

  const flavorAvailableForType = (flavor, sizeId, type) => {
    if (!flavor) return false;
    if (type === "undecided") {
      return api.inStock(flavor, sizeId, "regular") ||
        (spunEnabled && api.inStock(flavor, sizeId, "spun"));
    }
    if (type === "spun" && !spunEnabled) return false;
    return api.inStock(flavor, sizeId, type);
  };

  const shelf = useMemo(() => {
    if (!cat) return [];

    const publicFlavors = cat.flavors.filter((f) => f.active !== false);
    const available = publicFlavors.filter((f) => flavorAvailableForType(f, pickSize, pickType));
    const unavailable = publicFlavors.filter((f) => !flavorAvailableForType(f, pickSize, pickType));

    const best = available.find((f) => f.name === cat.bestSeller);
    const orderedAvailable = best
      ? [best, ...available.filter((f) => f !== best)]
      : available;

    return [...orderedAvailable, ...unavailable];
  }, [cat, pickSize, pickType, spunEnabled]);

  const inventoryLimit = (flavorId, sizeId, type) => {
    const flavor = cat?.flavors?.find((f) => f.id === flavorId);
    if (!flavor) return null;
    if (type === "undecided") return null;
    if (type === "spun" && !spunEnabled) return 0;

    const raw = api.stockCount(flavor, sizeId, type);
    if (raw === "" || raw === null || raw === undefined) return null;

    const count = Number(raw);
    return Number.isFinite(count) ? Math.max(0, count) : null;
  };

  const addJar = (f) => {
    setCartOpen(false);
    setCart((cc) => {
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
  };

  const chooseCartItemType = (index, nextType) => {
    const item = cart[index];
    if (!item) return;

    if (nextType === "spun" && !spunEnabled) {
      setTypeNotice(spunUnavailableMessage);
      return;
    }

    const flavor = cat?.flavors?.find((f) => f.id === item.flavor_id);
    const limit = inventoryLimit(item.flavor_id, item.size_id, nextType);
    const available = flavorAvailableForType(flavor, item.size_id, nextType);

    if (!available || (limit !== null && limit < item.qty)) {
      setTypeNotice(
        `${item.flavor} is not currently available as ${typeName(nextType)} in ${sizeOf(item.size_id).label}. ` +
        "Choose the other texture or return to the flavor list."
      );
      return;
    }

    setTypeNotice("");
    setCart((current) =>
      current.map((cartItem, itemIndex) =>
        itemIndex === index ? { ...cartItem, type: nextType } : cartItem
      )
    );
  };

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

  useEffect(() => {
    if (view === "admin" || typeof window === "undefined") return undefined;
    if (!("IntersectionObserver" in window)) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const root = document.querySelector(".nf");
    if (!root) return undefined;

    const selectors = [
      ".nf-modern-hero-grid",
      ".nf-modern-trust-item",
      ".nf-promo-card",
      ".nf-section-row",
      ".nf-top-card",
      ".nf-bundle-builder",
      ".nf-pick-card",
      ".nf-fulfillment-section",
      "#order-details-section",
      ".nf-about-image",
      ".nf-about-copy",
      ".nf-page-heading",
      ".nf-find-card",
      ".nf-help-card",
      ".nf-club-intro",
      ".nf-club-benefits",
      ".nf-club-section-title",
      ".nf-club-preferences",
      ".nf-difference-section",
      ".nf-story-gallery",
      ".nf-find-markets",
      ".nf-find-contact",
      ".nf-help-hero",
      ".nf-help-option",
      ".nf-help-form",
      ".nf-help-contact",
      ".nf-help-faq",
      ".pol > *",
      ".nf-final-review",
    ];

    root.classList.add("nf-animations-ready");

    const revealOnce = (element) => {
      if (element.dataset.nfRevealComplete === "true") return;
      element.classList.add("nf-reveal-visible");
      element.dataset.nfRevealComplete = "true";
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealOnce(entry.target);
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -4% 0px",
      }
    );

    const elements = [...document.querySelectorAll(selectors.join(","))];
    const timers = [];

    elements.forEach((element, index) => {
      element.classList.add("nf-reveal");
      element.style.setProperty("--nf-reveal-delay", `${Math.min((index % 4) * 45, 135)}ms`);

      if (element.dataset.nfRevealComplete === "true") {
        element.classList.add("nf-reveal-visible");
        return;
      }

      const isHero = element.matches(".nf-modern-hero-grid");
      const isPromo = element.matches(".nf-bundle-promo-card, .nf-drizzle-promo-card");

      if (isHero) {
        const timer = window.setTimeout(() => {
          window.requestAnimationFrame(() => revealOnce(element));
        }, 120);
        timers.push(timer);
        return;
      }

      if (isPromo) {
        observer.observe(element);
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.92) {
        revealOnce(element);
      } else {
        observer.observe(element);
      }
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
    };
  }, [view, Boolean(cat), Boolean(receipt)]);

  useEffect(() => {
    if (view !== "shop" || !cat || typeof window === "undefined") return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const section = document.querySelector(".nf-bundle-builder");
    const fill = section?.querySelector(".nf-bundle-honey-fill");
    if (
      !section ||
      !fill ||
      section.dataset.bundleDemoPlayed === "true" ||
      document.documentElement.dataset.nfBundleDemoPlayed
    ) return undefined;

    document.documentElement.dataset.nfBundleDemoPlayed = "armed";

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((item) => item.isIntersecting);
        if (!entry) return;

        section.dataset.bundleDemoPlayed = "true";
        document.documentElement.dataset.nfBundleDemoPlayed = "played";
        observer.disconnect();

        fill.classList.remove("nf-bundle-demo");
        void fill.offsetWidth;
        fill.classList.add("nf-bundle-demo");

        const finish = () => {
          fill.classList.remove("nf-bundle-demo");
          fill.removeEventListener("animationend", finish);
        };

        fill.addEventListener("animationend", finish);
      },
      {
        threshold: 0.35,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    observer.observe(section);

    return () => {
      observer.disconnect();
      fill.classList.remove("nf-bundle-demo");
    };
  }, [view, Boolean(cat)]);

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
        <div className="nf-loading-brand">NectarFusions</div>
        <div className="nf-loading-tagline">Nature&rsquo;s Happiness | Honey Infused</div>
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
  const unresolvedTypeItems = cart.filter((item) => item.type === "undecided");
  const unavailableTypeItems = cart.filter((item) => {
    if (item.type === "undecided") return false;
    const flavor = cat.flavors.find((f) => f.id === item.flavor_id);
    const limit = inventoryLimit(item.flavor_id, item.size_id, item.type);
    return !flavorAvailableForType(flavor, item.size_id, item.type) ||
      (limit !== null && limit < item.qty);
  });
  const canSubmitOrder =
    canPlace && unresolvedTypeItems.length === 0 && unavailableTypeItems.length === 0;

  async function submit() {
    if (!canSubmitOrder) {
      setTypeNotice(
        unresolvedTypeItems.length
          ? "Choose Regular or Spun for every undecided jar before placing your order."
          : "One or more selected textures are no longer available. Please update those jars."
      );
      return;
    }

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
      // Save the order URL immediately. The order already exists once placeOrder returns,
      // so a temporary confirmation-response failure must never encourage a duplicate order.
      pushOrderUrl(r.token);

      // Supabase can occasionally return an empty response while the new order is becoming
      // available to the confirmation lookup. Retry that lookup before showing an error.
      const full = await api.getOrderWithRetry(r.token);
      setReceipt({ ...full, token: r.token, email: cust.email, address: cust.address });
      setCart([]); setSlot(null); setMethod(null); setZip(""); setCtaOff(false); setReviewOpen(false);
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

  async function replaceFlavor(orderItemId, newFlavorId) {
    setBusy(true); setErr(null);
    try {
      const updated = await api.replaceOrderFlavor(receipt.token, orderItemId, newFlavorId);
      setReceipt((current) => ({ ...current, ...updated, token: current.token }));
      reload();
      return updated;
    } catch (e) {
      setErr(e.message);
      throw e;
    } finally { setBusy(false); }
  }

  const cartCount = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  const scrollToOrderStep = (id) => {
    setCartOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const guideContinue = (key, sectionId, message) => {
    if (continueAttemptKey === key) {
      setContinueHelp(message);
    } else {
      setContinueAttemptKey(key);
      setContinueHelp("");
    }
    scrollToOrderStep(sectionId);
  };

  const continueOrder = () => {
    if (!method) {
      guideContinue(
        "method",
        "order-method-section",
        "Choose Market Pickup, Local Delivery, or Shipping to continue."
      );
      return;
    }

    if (!slot) {
      guideContinue(
        "slot",
        "order-method-section",
        method === "market"
          ? "Select an available market and pickup date to continue."
          : "Select an available delivery or shipping option to continue."
      );
      return;
    }

    if (belowMin) {
      setContinueAttemptKey("minimum");
      setContinueHelp("");
      setDeliveryWarningDismissedAt(null);
      setCartOpen(true);
      return;
    }

    if (missing.length) {
      guideContinue(
        "details",
        "order-details-section",
        "Complete the highlighted required contact fields to continue."
      );
      return;
    }

    setContinueAttemptKey("");
    setContinueHelp("");
    setCartOpen(false);
    setReviewOpen(true);
  };

  const runSiteSearch = () => {
    const query = String(siteSearchRef.current?.value || "").trim().toLowerCase();
    setSiteSearchHelp("");

    if (!query) {
      setSiteSearchHelp("Type what you are looking for, such as markets, delivery, ingredients, Honey Club, or order help.");
      return;
    }

    const orderNumber = query.replace(/^#/, "").trim();
    if (/^\d{3,12}$/.test(orderNumber)) {
      setSearchedOrderNo(orderNumber);
      setView("help");
      setMenuOpen(false);
      if (siteSearchRef.current) siteSearchRef.current.value = "";
      return;
    }

    const routes = [
      {
        terms: [
          "wholesale", "wholesaler", "partner", "partners", "partnership", "partnerships",
          "work together", "work with us", "retail partner", "stock our honey", "sell nectarfusions",
        ],
        view: "partner",
      },
      { terms: ["market", "markets", "near me", "store", "stores", "retail", "find us", "location"], view: "find" },
      { terms: ["about", "story", "difference", "quality", "ingredients", "raw", "unfiltered", "michigan"], view: "about" },
      { terms: ["help", "order help", "cancel", "skip", "special request", "contact support"], view: "help" },
      { terms: ["club", "membership", "subscription", "subscribe", "bonus jar"], view: "subscribe" },
      { terms: ["policy", "policies", "privacy", "terms", "refund"], view: "policy" },
      { terms: ["shop", "honey", "flavor", "flavors", "order", "4 oz", "7 oz", "1 lb"], view: "shop" },
    ];

    const match = routes.find((route) => route.terms.some((term) => query.includes(term)));
    if (match) {
      setView(match.view);
      setMenuOpen(false);
      if (siteSearchRef.current) siteSearchRef.current.value = "";
      return;
    }

    setSiteSearchHelp("We couldn’t find that. Try markets, delivery, ingredients, Honey Club, flavors, policies, or order help.");
  };

  const Header = ({ eyebrow, title, right, big }) => {
    const brand = (
      <button
        type="button"
        className="nf-modern-brand nf-modern-brand-button"
        onClick={() => { setView("shop"); setMenuOpen(false); }}
        aria-label="NectarFusions home"
      >
        <Logo size={50} />
        <span className="nf-brand-copy">
          <span className="nf-brand-wordmark">Nectar<span>Fusions</span></span>
          <span className="nf-nav-tagline">Nature&rsquo;s Happiness | Honey Infused</span>
        </span>
      </button>
    );

    return (
      <>
        <header className="nf-modern-nav">
          <div className="nf-wrap nf-modern-nav-inner">
            {brand}

            <div className="nf-nav-actions">
              <button
                type="button"
                className="nf-menu-button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
                aria-label="Open navigation menu"
              >
                <span />
                <span />
                <span />
              </button>

              <button
                type="button"
                className="nf-cart-button"
                onClick={() => {
                  if (view !== "shop") {
                    setView("shop");
                    window.requestAnimationFrame(() => setCartOpen(true));
                  } else {
                    setCartOpen((open) => !open);
                  }
                }}
                aria-label={`Open cart with ${cartCount} item${cartCount === 1 ? "" : "s"}`}
                title="Your cart"
              >
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6"
                    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="20" r="1.35" fill="currentColor" />
                  <circle cx="18" cy="20" r="1.35" fill="currentColor" />
                </svg>
                <span className={`nf-cart-badge ${cartCount === 0 ? "empty" : ""}`}>
                  {cartCount}
                </span>
              </button>

              <button
                className="nf-admin-gear"
                onClick={() => setView(isAdmin ? "admin" : "login")}
                aria-label="Admin"
                title="Admin"
              >
                ⚙
              </button>
            </div>

            <div className={`nf-modern-links ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)}>
              {right}
            </div>
          </div>
        </header>

        {!big && (eyebrow || title) && (
          <section className="nf-page-heading">
            <div className="nf-wrap">
              {eyebrow && <div className="nf-modern-kicker">{eyebrow}</div>}
              <h1 className="nf-page-title">
                {title || <>NECTAR<span>FUSIONS</span></>}
              </h1>
            </div>
          </section>
        )}

        {big && (
          <section className="nf-modern-hero">
            <div className="nf-wrap nf-modern-hero-grid">
              <div>
                <div className="nf-modern-kicker">Coleman, Michigan</div>
                <h1 className="nf-modern-title nf-layered-hero-title">
                  <span className="nf-hero-topline">Raw Michigan</span>
                  <span className="nf-hero-honey-word" aria-hidden="true">Honey</span>
                  <span className="nf-hero-bottomline">Infused. Shared.<br />Unforgettable.</span>
                </h1>
                <p className="nf-modern-subtitle">
                  <strong>Handcrafted in small batches with real and organic ingredients</strong>
                  <span>No artificial flavors or syrups.</span>
                </p>
                <button
                  className="nf-modern-primary"
                  onClick={() => document.getElementById("order-section")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Start Your Order
                </button>

                <div className="nf-modern-trust">
                  <div className="nf-modern-trust-item">
                    <div className="nf-modern-trust-icon-image" aria-hidden="true">
                      <img src="/trust-raw-unfiltered.png" alt="" />
                    </div>
                    <div>
                      <div className="nf-modern-trust-title">Raw &amp; Unfiltered</div>
                      <div className="nf-modern-trust-copy">Pollens &amp; Enzymes Intact.</div>
                    </div>
                  </div>

                  <div className="nf-modern-trust-item">
                    <div className="nf-modern-trust-icon-image" aria-hidden="true">
                      <img src="/trust-made-in-michigan.png" alt="" />
                    </div>
                    <div>
                      <div className="nf-modern-trust-title">Local &amp; Made in MI</div>
                      <div className="nf-modern-trust-copy">Coleman, Michigan</div>
                    </div>
                  </div>

                  <div className="nf-modern-trust-item">
                    <div className="nf-modern-trust-icon-image" aria-hidden="true">
                      <img src="/trust-real-ingredients.png" alt="" />
                    </div>
                    <div>
                      <div className="nf-modern-trust-title">Real Ingredients</div>
                      <div className="nf-modern-trust-copy">No artificial. Ever.</div>
                    </div>
                  </div>
                </div>
              </div>

              <img
                className="nf-modern-hero-image"
                src={HERO_IMAGE}
                alt="NectarFusions raw Michigan honey jars"
              />
            </div>
          </section>
        )}

        {view !== "admin" && view !== "login" && !receipt && !(view === "shop" && cartCount > 0) && (
          <nav
            className={`nf-universal-dock ${dockHasEntered ? "settled" : "entering"} ${view === "shop" ? "home-dock" : ""}`}
            aria-label="NectarFusions website navigation"
          >
            <div className="nf-universal-dock-inner">
              <div className={`nf-universal-dock-links ${siteSearchOpen ? "search-open" : ""}`}>
                <div className="nf-dock-row nf-dock-row-primary">
                  <button
                    type="button"
                    className={view === "subscribe" ? "selected" : ""}
                    onClick={() => setView("subscribe")}
                  >
                    Honey Club
                  </button>

                  <button
                    type="button"
                    className={view === "partner" ? "selected" : ""}
                    onClick={() => setView("partner")}
                  >
                    Partner
                  </button>

                  <button
                    type="button"
                    className={view === "help" ? "selected" : ""}
                    onClick={() => setView("help")}
                  >
                    Order Help
                  </button>
                </div>

                <div className="nf-dock-row nf-dock-row-secondary">
                  <button
                    type="button"
                    className={`nf-near-me-button ${view === "find" ? "selected" : ""}`}
                    onClick={() => setView("find")}
                  >
                    NectarFusions Near Me
                  </button>

                  <a className="nf-dock-contact" href={`mailto:${CONTACT.email}`}>
                    Contact
                  </a>

                  <button
                    type="button"
                    className="nf-dock-search-icon"
                    onClick={() => {
                      setSiteSearchOpen(true);
                      setSiteSearchHelp("");
                      window.requestAnimationFrame(() => siteSearchRef.current?.focus());
                    }}
                    aria-label="Search NectarFusions"
                    title="Search"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="10.5" cy="10.5" r="6.5" />
                      <path d="m15.5 15.5 4.5 4.5" />
                    </svg>
                  </button>

                  <a
                    className="nf-dock-social"
                    href="https://www.instagram.com/nectarfusions_honey/"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Follow NectarFusions on Instagram"
                    title="Instagram"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4.25" />
                      <circle cx="17.4" cy="6.7" r="1.15" fill="currentColor" stroke="none" />
                    </svg>
                  </a>

                  <a
                    className="nf-dock-social"
                    href="https://www.facebook.com/NectarFusions/"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Follow NectarFusions on Facebook"
                    title="Facebook"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M13.5 22v-8h2.8l.42-3.2H13.5V8.75c0-.93.26-1.56 1.6-1.56h1.72V4.33c-.3-.04-1.32-.13-2.5-.13-2.47 0-4.16 1.51-4.16 4.28v2.32H7.36V14h2.8v8h3.34Z" />
                    </svg>
                  </a>


                </div>
              </div>

              {siteSearchOpen && (
                <div className="nf-site-search open">
                  <div className="nf-site-search-row">
                    <input
                      id="nf-site-search-input"
                      ref={siteSearchRef}
                      type="search"
                      defaultValue=""
                      aria-label="Search NectarFusions"
                      placeholder="Search NectarFusions or enter an order number..."
                      onInput={() => {
                        if (siteSearchHelp) setSiteSearchHelp("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") runSiteSearch();

                        if (event.key === "Escape") {
                          setSiteSearchOpen(false);
                          setSiteSearchHelp("");

                          if (siteSearchRef.current) {
                            siteSearchRef.current.value = "";
                          }
                        }
                      }}
                    />

                    <button
                      type="button"
                      className="nf-site-search-submit"
                      onClick={runSiteSearch}
                    >
                      Search
                    </button>

                    <button
                      type="button"
                      className="nf-site-search-close"
                      onClick={() => {
                        setSiteSearchOpen(false);
                        setSiteSearchHelp("");

                        if (siteSearchRef.current) {
                          siteSearchRef.current.value = "";
                        }
                      }}
                      aria-label="Close search"
                      title="Close search"
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M7 7l10 10M17 7 7 17" />
                      </svg>
                    </button>
                  </div>

                  {siteSearchHelp && (
                    <div className="nf-site-search-help" role="status">
                      {siteSearchHelp}
                    </div>
                  )}
                </div>
              )}

              <a
                className="nf-text-us-fab"
                href={`sms:${CONTACT.phone.replace(/\D/g, "")}`}
                aria-label={`Text NectarFusions at ${CONTACT.phone}`}
                title="Text us"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 5.5h14v10H9l-4 3v-13Z" />
                  <path d="M8 9h8M8 12h5" />
                </svg>
                <span>Text us</span>
              </a>
            </div>
          </nav>
        )}

      </>
    );
  };

  const nav = (
    <>
      <button className="btn ghost" onClick={() => setView("partner")}>Partner</button>
      <button className="btn ghost" onClick={() => setView("about")}>About</button>
      <button className="btn ghost" onClick={() => setView("subscribe")}>Honey Club</button>
      <button className="btn ghost" onClick={() => setView("find")}>Find Us</button>
      <button className="btn ghost" onClick={() => setView("help")}>Order Help</button>
      <button className="btn ghost" onClick={() => setView("policy")}>Policies</button>
    </>
  );

  /* ================= PARTNER ================= */
  if (view === "partner") {
    return <PartnerPage
      Header={Header}
      styles={CSS}
      onBack={() => setView("shop")}
      submitInquiry={api.submitCustomerRequest}
    />;
  }

  /* ================= FIND NECTARFUSIONS ================= */
  if (view === "find") {
    return <FindNectarFusions Header={Header} onBack={() => setView("shop")} marketDates={cat.marketDates ?? []} />;
  }

  /* ================= ORDER HELP ================= */
  if (view === "help") {
    return <OrderHelp Header={Header} onBack={() => setView("shop")}
      initialOrderNo={searchedOrderNo}
      onOrderFound={async (orderNo, email) => {
        const token = await api.findOrder(orderNo, email);
        pushOrderUrl(token);
        const found = await api.getOrderWithRetry(token);
        setReceipt({ ...found, token });
        setErr(null);
        setView("shop");
      }} />;
  }

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
    const left = receipt.change_minutes_left ?? receipt.minutes_left ?? 0;
    const canChange = !cancelled && receipt.can_change !== false && left > 0;
    if (receipt.method === "market") {
      return (
        <MarketConfirmationPage
          receipt={receipt}
          cancelled={cancelled}
          canChange={canChange}
          minutesLeft={left}
          busy={busy}
          error={err}
          onReplace={replaceFlavor}
          onPay={pay}
          onStartAnother={() => {
            pushHome();
            setReceipt(null);
            setErr(null);
            setCust({ name: "", phone: "", email: "", address: "", notes: "" });
            setView("shop");
          }}
          onHome={() => {
            pushHome();
            setReceipt(null);
            setErr(null);
            setView("shop");
          }}
          onStory={() => {
            pushHome();
            setReceipt(null);
            setErr(null);
            setView("about");
          }}
          onJoinClub={() => {
            pushHome();
            setReceipt(null);
            setErr(null);
            setView("subscribe");
          }}
          contactEmail={CONTACT.email}
          contactPhone={CONTACT.phone}
          Logo={Logo}
          styles={CSS}
        />
      );
    }

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
                  onClick={() => { pushHome(); setReceipt(null); setView("subscribe"); }}>View Offers</button>
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
              onClick={() => {
                setSubDone(null);
                setPlan(null);
                setSubMethod(null);
                setSubZip("");
                setFlavorMode("surprise");
                setFlavorPreferences([]);
                setFlavorRequests("");
                setView("shop");
              }}>
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
          flavorMode,
          flavorPreferences,
          flavorRequests: flavorRequests.trim() || null,
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
          right={<button className="btn ghost nf-back-to-shop" onClick={() => setView("shop")}>Back to shop</button>} />
        <div className="nf-wrap" style={{ paddingTop: 24 }}>
          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

          <section className="nf-club-intro nf-club-intro-outlined nf-club-reveal">
            <div className="nf-modern-kicker">Built around your taste</div>
            <h2 className="nf-club-page-title">A Honey Club Made for Discovery</h2>
            <p>
              Tell us what you love, request specific flavors, or choose <strong>Surprise Me</strong> and let us
              build a box around your preferences. Every box is packed by hand in Coleman.
            </p>
          </section>

          <section className="nf-club-benefits nf-club-reveal" style={{ "--nf-club-delay": "90ms" }}>
            <div className="nf-club-benefits-heading">You pay shelf price. Here&rsquo;s what&rsquo;s free.</div>
            {[
              ["delivery", "Free local delivery", "No fee, no minimum — ever."],
              ["bonus", "A bonus jar every 3rd box", "Our pick. Free."],
              ["locked", "Your price is locked", "Whatever you join at, you keep."],
              ["first", "First pick", "Seasonal flavors go to members first."],
              ["skip", "Skip anytime", "One tap. No phone call."],
            ].map(([icon, title, description], index) => (
              <article key={title} className="nf-club-benefit"
                style={{ "--nf-benefit-delay": `${150 + index * 70}ms` }}>
                <ClubBenefitIcon kind={icon} />
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </section>

          <h2 className="nf-club-section-title nf-club-reveal" style={{ "--nf-club-delay": "170ms" }}>
            Choose Your Box
          </h2>
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
                <div className="nf-club-plan-contents">{pl.contents}</div>
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

              <section className="nf-club-preferences nf-club-reveal" style={{ "--nf-club-delay": "230ms" }}>
                <div className="nf-modern-kicker">Personalize every box</div>
                <h2 className="nf-club-section-title">How Should We Choose?</h2>

                <div className="nf-club-choice-grid">
                  <button type="button"
                    className={`nf-club-choice ${flavorMode === "surprise" ? "selected" : ""}`}
                    onClick={() => setFlavorMode("surprise")}>
                    <strong>Surprise Me</strong>
                    <span>We&rsquo;ll choose a thoughtful mix using your taste preferences.</span>
                  </button>
                  <button type="button"
                    className={`nf-club-choice ${flavorMode === "request" ? "selected" : ""}`}
                    onClick={() => setFlavorMode("request")}>
                    <strong>I Have Requests</strong>
                    <span>Tell us which flavors you&rsquo;d love to receive.</span>
                  </button>
                </div>

                <div className="nf-club-preference-label">What sounds good?</div>
                <div className="nf-club-preference-chips">
                  {[
                    "Sweet & Fruity",
                    "Warm & Cozy",
                    "Spicy & Bold",
                    "BBQ & Savory",
                    "Coffee & Cocoa",
                    "Classic Honey",
                  ].map((preference) => {
                    const selected = flavorPreferences.includes(preference);
                    return (
                      <button key={preference} type="button"
                        className={selected ? "selected" : ""}
                        onClick={() => setFlavorPreferences((current) =>
                          selected
                            ? current.filter((item) => item !== preference)
                            : [...current, preference]
                        )}>
                        {preference}
                      </button>
                    );
                  })}
                </div>

                <label className="nf-club-request-field">
                  <span>{flavorMode === "request" ? "Flavor requests" : "Anything we should know? (optional)"}</span>
                  <textarea rows={3}
                    value={flavorRequests}
                    placeholder={flavorMode === "request"
                      ? "Examples: Blueberry, Cinnamon, no spicy flavors..."
                      : "Allergies, favorites, flavors to avoid, or leave this blank for a full surprise."}
                    onChange={(event) => setFlavorRequests(event.target.value)}
                  />
                </label>
                <p className="nf-club-preference-note">
                  Requests guide each box and are subject to seasonal availability.
                </p>
              </section>

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

  /* ================= ABOUT ================= */
  if (view === "about") return (
    <About
      Header={Header}
      onBack={() => setView("shop")}
      onSearch={() => setView("find")}
      onContact={() => setView("help")}
    />
  );

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

      <section className="nf-type-selector-section">
        <div className="nf-wrap">
          <div className="nf-section-row nf-type-section-heading">
            <div>
              <div className="nf-modern-kicker">Choose your texture</div>
              <h2 className="nf-section-title">Regular or Spun?</h2>
            </div>
            <button
              type="button"
              className="nf-type-info-link"
              onClick={() => setTypeInfo(true)}
            >
              What&rsquo;s the difference?
            </button>
          </div>

          <div className="nf-type-choice-grid">
            {[
              ...TYPES,
              {
                id: "undecided",
                name: "Not Sure",
                tagline: "Decide in review",
              },
            ].map((t) => {
              const unavailable = t.id === "spun" && !spunEnabled;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`nf-type-choice-card ${pickType === t.id ? "selected" : ""} ${unavailable ? "unavailable" : ""}`}
                  aria-disabled={unavailable}
                  onClick={() => {
                    if (unavailable) {
                      setTypeNotice(spunUnavailableMessage);
                      return;
                    }

                    setPickType(t.id);
                    setTypeNotice(
                      t.id === "undecided"
                        ? "No worries. Add the flavors you want now, then choose Regular or Spun for each jar when you review your order."
                        : ""
                    );
                  }}
                >
                  <span className="nf-type-choice-icon">
                    {t.id === "regular" ? <PourIcon size={34} color="#147FBE" /> :
                      t.id === "spun" ? <SpunIcon size={35} color="#147FBE" /> :
                      <span className="nf-type-question">?</span>}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <small>{unavailable ? "Temporarily unavailable" : t.tagline}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {typeNotice && (
            <div className="nf-type-notice" role="status">
              <span>{typeNotice}</span>
              <button type="button" onClick={() => setTypeNotice("")} aria-label="Dismiss message">×</button>
            </div>
          )}
        </div>
      </section>

      <section className="nf-showcase">
        <div className="nf-wrap">
          <div className="nf-promo-grid">
            <article className="nf-promo-card nf-bundle-promo-card">
              <img src="/nf-bundles.png" alt="NectarFusions honey bundle" />
              <div className="nf-promo-copy">
                <h2 className="nf-promo-title">Honey Bundles</h2>
                <p className="nf-promo-text">More jars. More flavor. More to love.</p>
                <button className="nf-promo-action"
                  onClick={() => document.getElementById("order-section")?.scrollIntoView({ behavior: "smooth" })}>
                  Shop Bundles →
                </button>
              </div>
            </article>

            <article className="nf-promo-card nf-drizzle-promo-card">
              <img src="/nf-drizzle.png" alt="Honey drizzling from a NectarFusions jar" />
              <div className="nf-promo-copy">
                <h2 className="nf-promo-title">Drizzle on Something Good</h2>
                <p className="nf-promo-text">From toast to tea—honey makes it better.</p>
                <button className="nf-promo-action"
                  onClick={() => setView("subscribe")}>
                  Join the Honey Club →
                </button>
              </div>
            </article>
          </div>

          <div className="nf-section-row">
            <h2 className="nf-section-title">Top Picks</h2>
            <div className="nf-section-note">Customer favorites</div>
          </div>

          <div className="nf-top-grid">
            {(cat.topPicks?.length
              ? cat.topPicks
                  .filter((pick) => pick.active !== false && pick.flavor_id)
                  .map((pick) => {
                    const flavor = cat.flavors.find((item) => item.id === pick.flavor_id);
                    return flavor ? { ...pick, flavor } : null;
                  })
                  .filter(Boolean)
              : [
                  ["Blueberry", "/nf-top-blueberry.png", "Best Seller"],
                  ["Cinnamon", "/nf-top-cinnamon.png", "Warm & Cozy"],
                  ["Jalapeño Lime", "/nf-top-jalapeno-lime.png", "Bright & Bold"],
                  ["Hot Thai Pepper", "/nf-top-hot-thai.png", "Bring the Heat"],
                ].map(([name, image_url, tagline]) => {
                  const flavor = cat.flavors.find((item) => item.name.toLowerCase() === name.toLowerCase());
                  return flavor ? { flavor, image_url, tagline, active: true } : null;
                }).filter(Boolean)
            ).map((pick) => {
              const flavor = pick.flavor;
              const image = pick.image_url || flavorImage(flavor);
              const selected = cart.some((item) =>
                item.flavor_id === flavor.id &&
                item.size_id === pickSize &&
                item.type === pickType &&
                item.qty > 0
              );
              const available = flavorAvailableForType(flavor, pickSize, pickType);

              return (
                <button
                  key={flavor.id}
                  className={`nf-top-card ${selected ? "selected" : ""}`}
                  onClick={() => {
                    if (available) addJar(flavor);
                  }}
                >
                  {image ? (
                    <img src={image} alt={`${flavor.name} infused honey`} />
                  ) : (
                    <div className="nf-top-image-placeholder" style={{ background: flavor.hex }}>
                      {flavor.name}
                    </div>
                  )}
                  <div className="nf-top-name">{flavor.name}</div>
                  <div className="nf-top-tagline">{pick.tagline || "Customer favorite"}</div>
                  <div className="nf-top-price">
                    {available ? `From ${money(sizeOf("4oz").price)}` : "Currently sold out"}
                  </div>
                </button>
              );
            })}
          </div>

        </div>
      </section>

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

        <section className="nf-bundle-builder">
          <div className="nf-bundle-headline" aria-hidden="true">
            <span className="nf-bundle-headline-main">4 oz Bundle ·</span>
            <span className="nf-bundle-headline-price">{B.count} for {money(B.price)}</span>
          </div>

          <div className={`nf-bundle-grid ${pickSize !== B.size ? "size-only" : ""}`}>
            <div className="nf-size-stack">
              {cat.sizes.map((s) => (
                <button
                  key={s.id}
                  className={`btn ${pickSize === s.id ? "on" : ""}`}
                  onClick={() => setPickSize(s.id)}
                >
                  <div className="display" style={{ fontSize: 29 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: .72 }}>
                    {money(s.price)}
                  </div>
                </button>
              ))}
            </div>

            {pickSize === B.size ? (
              <div className="nf-bundle-visual">
                <div className="nf-bundle-jar-stage">
                  <div
                    className="nf-bundle-honey-fill"
                    style={{
                      height: `${Math.min(
                        100,
                        ((price.jars % B.count === 0 && price.jars > 0
                          ? B.count
                          : price.jars % B.count) / B.count) * 100
                      )}%`
                    }}
                  />
                  <img
                    src="/nf-empty-bundle-jar.png"
                    alt="Honey jar showing 4 ounce bundle progress"
                  />
                </div>

                <div className="nf-bundle-copy">
                  <strong>Mix any three 4 oz jars</strong>
                  <p>Regular and Spun both count.</p>
                  <div className="nf-bundle-progress">
                    {price.jars % B.count === 0 && price.jars > 0 ? (
                      <div className="nf-bundle-complete-message">
                        <span className="nf-bundle-complete-icon" aria-hidden="true">
                          <svg viewBox="0 0 64 64" fill="none">
                            <path d="M18 18h28l4 7v24c0 5-4 9-9 9H23c-5 0-9-4-9-9V25l4-7Z" />
                            <path d="M22 18v-6h20v6" />
                            <path d="M22 37l7 7 14-16" />
                          </svg>
                        </span>
                        <span>
                          <b>{price.bundles} bundle{price.bundles > 1 ? "s" : ""} complete.</b><br />
                          Add another jar to begin the next one.
                        </span>
                      </div>
                    ) : (
                      <><b>{price.jars % B.count}/{B.count} jars added.</b><br />Add {B.count - (price.jars % B.count)} more to complete the bundle.</>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="nf-nonbundle-note">
                Bundle pricing applies only to 4 oz jars. Choose your size and continue to flavors below.
              </div>
            )}
          </div>
        </section>

        <div className="nf-section-row" style={{ marginTop: 30 }}>
          <div>
            <h2 className="nf-section-title">Pick Your Flavors</h2>
            <div className="nf-section-note" style={{ marginTop: 4 }}>
              Adding {sizeOf(pickSize).label} · {typeName(pickType)}
            </div>
          </div>
          <div className="nf-section-note">{shelf.length} flavors</div>
        </div>

        {shelf.length === 0 ? (
          <div className="card" style={{ padding: 22, textAlign: "center", color: c.tan, fontSize: 14 }}>
            No flavors are available right now.
          </div>
        ) : (
          <div className="nf-pick-grid">
            {shelf.map((f) => {
              const cartIndex = cart.findIndex(
                (x) => x.flavor_id === f.id && x.size_id === pickSize && x.type === pickType
              );
              const inCart = cartIndex > -1 ? cart[cartIndex] : null;
              const limit = inventoryLimit(f.id, pickSize, pickType);
              const quantityInCart = inCart?.qty ?? 0;
              const stockAvailable = flavorAvailableForType(f, pickSize, pickType);
              const canAdd = stockAvailable && (limit === null || quantityInCart < limit);
              const image = flavorImage(f);
              const best = cat.bestSeller === f.name;

              return (
                <article key={f.id} className={`nf-pick-card ${inCart ? "selected" : ""}`}>
                  <div className="nf-pick-image-wrap">
                    {image ? (
                      <img className="nf-pick-image" src={image} alt={`${f.name} lid label`} />
                    ) : (
                      <div className="nf-pick-placeholder" style={{ background: f.hex || "#C98C16" }}>
                        {f.name}
                      </div>
                    )}

                    {best && stockAvailable && (
                      <span className="nf-top-badge">Best Seller</span>
                    )}

                    {(!stockAvailable || (limit !== null && quantityInCart >= limit)) && (
                      <div className="nf-pick-overlay">Sold Out</div>
                    )}
                  </div>

                  <div className="nf-pick-body">
                    <div className="nf-pick-name">{f.name}</div>
                    <div className="nf-pick-stock">
                      {limit === null
                        ? `${sizeOf(pickSize).label} · ${typeName(pickType)}`
                        : pickType === "undecided"
                          ? `${sizeOf(pickSize).label} · choose texture in review`
                          : `${Math.max(0, limit - quantityInCart)} available`}
                    </div>

                    {!inCart ? (
                      <button
                        className="nf-pick-add"
                        disabled={!canAdd}
                        onClick={() => canAdd && addJar(f)}
                      >
                        {canAdd ? "Add +" : "Unavailable"}
                      </button>
                    ) : (
                      <div className="nf-pick-controls">
                        <button
                          className="nf-pick-qty-btn"
                          aria-label={`Remove one ${f.name}`}
                          onClick={() => {
                            setCartOpen(false);
                            bump(cartIndex, -1);
                          }}
                        >
                          −
                        </button>
                        <div className="nf-pick-qty">{quantityInCart}</div>
                        <button
                          className="nf-pick-qty-btn"
                          aria-label={`Add another ${f.name}`}
                          disabled={!canAdd}
                          onClick={() => {
                            setCartOpen(false);
                            if (canAdd) bump(cartIndex, 1);
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {cart.length > 0 && (
          <>
            <section id="order-method-section" className="nf-fulfillment-section nf-order-anchor">
              <div className="nf-modern-kicker">Choose your order method</div>
              <h2 className="nf-fulfillment-title">Delivery &amp; Pickup Options</h2>
              <p className="nf-fulfillment-intro">
                Select how you would like to receive your NectarFusions order.
              </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className={`btn ${method === "market" ? "on" : ""}`} onClick={() => setMethod("market")}
                style={{ padding: "15px 13px", textAlign: "left" }}>
                <div className="display" style={{ fontSize: 22 }}>MARKET PICKUP</div>
                <div style={{ fontSize: 12, fontWeight: 600, opacity: .7, marginTop: 2 }}>Free · no minimum</div>
              </button>
              <button
                className={`btn ${method === "delivery" ? "on" : ""}`}
                onClick={() => {
                  setMethod("delivery");
                  setSlot(null);
                  setDeliveryWarningDismissedAt(null);
                }}
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

            </section>

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

            <div id="order-details-section" className="eyebrow nf-order-anchor" style={{ margin: "32px 0 10px" }}>Your details</div>
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

                <button
                  type="button"
                  className="btn solid nf-details-continue"
                  disabled={!canPlace}
                  onClick={() => {
                    setContinueAttemptKey("");
                    setContinueHelp("");
                    setCartOpen(false);
                    setReviewOpen(true);
                  }}
                >
                  Continue to review order
                </button>
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

        <footer style={{
          marginTop: 18,
          padding: "22px 16px",
          borderRadius: 16,
          background: "linear-gradient(145deg,#FFFDF6 0%,#FFF7DD 100%)",
          border: "1px solid #E8C96C",
          textAlign: "center",
          boxShadow: "0 7px 22px rgba(74,51,19,.07)",
        }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Follow NectarFusions</div>
          <SocialLinks />
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: c.brown, marginTop: 13 }}>
            <a href={`tel:${CONTACT.phone.replace(/\D/g, "")}`}
              style={{ color: c.darkBrown, fontWeight: 700, textDecoration: "none" }}>
              {CONTACT.phone}
            </a>
            <span aria-hidden="true"> · </span>
            <a href={`mailto:${CONTACT.email}`}
              style={{ color: c.darkBrown, fontWeight: 700, textDecoration: "none" }}>
              {CONTACT.email}
            </a>
          </div>
        </footer>
      </div>

      {continueHelp && (
        <div className="nf-continue-help" role="status" aria-live="polite">
          <div>
            <strong>Need a hand?</strong>
            <span>{continueHelp}</span>
          </div>
          <button
            type="button"
            onClick={() => setContinueHelp("")}
            aria-label="Dismiss help"
          >
            ×
          </button>
        </div>
      )}

      {reviewOpen && cart.length > 0 && (
        <div className="nf-final-review" role="dialog" aria-modal="true" aria-label="Review your order">
          <div className="nf-final-review-shell">
            <div className="nf-final-review-header">
              <div>
                <div className="nf-final-review-eyebrow">Your Order</div>
                <h2>Review everything one last time</h2>
                <p>Confirm your honey, fulfillment choice, and contact details before placing the order.</p>
              </div>
              <button
                type="button"
                className="nf-final-review-close"
                onClick={() => setReviewOpen(false)}
                aria-label="Close order review"
              >
                ×
              </button>
            </div>

            {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

            <div className="nf-final-review-grid">
              <section className="nf-final-review-card">
                <div className="nf-final-review-label">Honey selections</div>
                {(unresolvedTypeItems.length > 0 || unavailableTypeItems.length > 0) && (
                  <div className="nf-review-type-alert">
                    <strong>Choose a texture for each jar.</strong>
                    <span>
                      Regular and Spun availability can vary by flavor. If a button is disabled, that texture is
                      not currently available for the selected flavor and size.
                    </span>
                  </div>
                )}
                {typeNotice && (
                  <div className="nf-review-type-help" role="status">{typeNotice}</div>
                )}
                <div className="nf-final-review-items">
                  {cart.map((item, index) => (
                    <div className="nf-final-review-item" key={`${item.flavor_id}-${item.size_id}-${item.type}`}>
                      <span className="nf-final-review-dot" style={{ background: item.hex }} />
                      <div className="nf-review-item-copy">
                        <strong>{item.flavor}</strong>
                        <span>{sizeOf(item.size_id).label} · {typeName(item.type)}</span>
                        <div className="nf-review-type-buttons">
                          {TYPES.map((typeOption) => {
                            const flavor = cat.flavors.find((f) => f.id === item.flavor_id);
                            const limit = inventoryLimit(item.flavor_id, item.size_id, typeOption.id);
                            const available =
                              flavorAvailableForType(flavor, item.size_id, typeOption.id) &&
                              (limit === null || limit >= item.qty);

                            return (
                              <button
                                key={typeOption.id}
                                type="button"
                                className={item.type === typeOption.id ? "selected" : ""}
                                disabled={!available}
                                aria-disabled={!available}
                                onClick={() => chooseCartItemType(index, typeOption.id)}
                              >
                                {typeOption.name}
                                {!available && <small>Unavailable</small>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="nf-final-review-quantity">
                        <button type="button" onClick={() => bump(index, -1)} aria-label={`Remove one ${item.flavor}`}>−</button>
                        <b>{item.qty}</b>
                        <button type="button" onClick={() => bump(index, 1)} aria-label={`Add another ${item.flavor}`}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                {price.saved > 0 && (
                  <div className="nf-final-review-savings">Bundle savings −{money(price.saved)}</div>
                )}
              </section>

              <section className="nf-final-review-card">
                <div className="nf-final-review-label">Fulfillment</div>
                <div className="nf-final-review-detail">
                  <strong>
                    {method === "market" ? "Market Pickup" : method === "delivery" ? "Local Delivery" : "Shipping"}
                  </strong>
                  {slot?.kind === "market" && (
                    <span>{slot.m.venue?.name || "Selected market"} · {fmt(parseDay(slot.m.day))}</span>
                  )}
                  {slot?.kind === "delivery" && (
                    <span>{fmt(slot.date)}{zone?.window_label ? ` · ${zone.window_label}` : ""}</span>
                  )}
                  {slot?.kind === "ship" && <span>Ships to the address below</span>}
                </div>

                <button
                  type="button"
                  className="nf-final-review-edit"
                  onClick={() => {
                    setReviewOpen(false);
                    scrollToOrderStep("order-method-section");
                  }}
                >
                  Edit fulfillment
                </button>
              </section>

              <section className="nf-final-review-card">
                <div className="nf-final-review-label">Your details</div>
                <div className="nf-final-review-detail">
                  <strong>{cust.name}</strong>
                  <span>{cust.phone}</span>
                  <span>{cust.email}</span>
                  {method !== "market" && <span>{cust.address}</span>}
                  {cust.notes && <span className="nf-final-review-notes">Note: {cust.notes}</span>}
                </div>

                <button
                  type="button"
                  className="nf-final-review-edit"
                  onClick={() => {
                    setReviewOpen(false);
                    scrollToOrderStep("order-details-section");
                  }}
                >
                  Edit details
                </button>
              </section>

              <section className="nf-final-review-card nf-final-review-total-card">
                <div className="nf-final-review-label">Order total</div>
                <div className="nf-final-review-price-row">
                  <span>Merchandise</span>
                  <strong>{money(price.sub)}</strong>
                </div>
                {method === "delivery" && (
                  <div className="nf-final-review-price-row">
                    <span>Delivery</span>
                    <strong>{fee > 0 ? money(fee) : "Free"}</strong>
                  </div>
                )}
                {method === "ship" && (
                  <div className="nf-final-review-price-row">
                    <span>Shipping</span>
                    <strong>Free</strong>
                  </div>
                )}
                <div className="nf-final-review-grand-total">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
              </section>
            </div>

            <div className="nf-final-review-actions">
              <button type="button" className="nf-final-review-back" onClick={() => setReviewOpen(false)}>
                Back to edit
              </button>
              <button
                type="button"
                className="nf-final-review-place"
                disabled={busy || !canSubmitOrder}
                onClick={submit}
              >
                {busy ? "Placing order…" : "Place order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <aside className={`nf-cart-tray ${cartOpen ? "open" : ""}`} aria-label="Your order">
          <div className="nf-cart-tray-inner">
            <button
              type="button"
              className="nf-cart-tray-toggle"
              onClick={() => setCartOpen((open) => !open)}
              aria-expanded={cartOpen}
            >
              <span className="nf-cart-tray-label">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 4h2l2.1 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H6"
                    stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="10" cy="20" r="1.35" fill="currentColor" />
                  <circle cx="18" cy="20" r="1.35" fill="currentColor" />
                </svg>
                Your Order
                <span className="nf-cart-tray-count">{cartCount}</span>
              </span>
              <span>{cartOpen ? "Hide" : "Review order items"}</span>
            </button>

            {cartOpen && (
              <div className="nf-cart-items">
                {cart.map((item, index) => (
                  <div className="nf-cart-item" key={`${item.flavor_id}-${item.size_id}-${item.type}`}>
                    <span className="nf-cart-item-dot" style={{ background: item.hex }} />
                    <span className="nf-cart-item-name">
                      <strong>{item.flavor}</strong>
                      <small>{sizeOf(item.size_id).label} · {typeName(item.type)}</small>
                    </span>
                    <button type="button" onClick={() => bump(index, -1)} aria-label={`Remove one ${item.flavor}`}>−</button>
                    <span className="nf-cart-item-qty">{item.qty}</span>
                    <button type="button" onClick={() => bump(index, 1)} aria-label={`Add another ${item.flavor}`}>+</button>
                  </div>
                ))}
                {price.saved > 0 && (
                  <div className="nf-cart-savings">Bundle savings −{money(price.saved)}</div>
                )}
              </div>
            )}

            {method === "delivery" &&
              belowMin &&
              zone &&
              deliveryWarningDismissedAt !== price.sub && (
                <div className="nf-cart-delivery-warning" role="status" aria-live="polite">
                  <div className="nf-cart-delivery-warning-copy">
                    <div>
                      <strong>{money(price.sub)} merchandise subtotal</strong> — add{" "}
                      <strong>{money(Math.max(0, zone.minimum - price.sub))}</strong>{" "}
                      more to qualify for local delivery.
                    </div>
                    <div className="nf-cart-delivery-warning-note">
                      Delivery fees don&rsquo;t count toward the {money(zone.minimum)} minimum.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeliveryWarningDismissedAt(price.sub)}
                  >
                    Got it
                  </button>
                </div>
              )}

            <div className="nf-cart-summary">
              <div className="nf-cart-totals">
                <div>Merchandise subtotal: {money(price.sub)}</div>
                {method === "delivery" && <div>Delivery: {fee > 0 ? money(fee) : "Free"}</div>}
                {method === "ship" && <div>Shipping: Free</div>}
                <span>Order total</span>
                <strong>{money(total)}</strong>
              </div>

              <button
                className="btn solid nf-guided-order-button"
                disabled={busy}
                onClick={continueOrder}
              >
                {canPlace ? "Review order" : "Continue"}
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

/* ============================================================
   FIND NECTARFUSIONS
   ============================================================ */
function FindNectarFusions({ Header, onBack, marketDates = [] }) {
  const [zip, setZip] = useState("");
  const [searched, setSearched] = useState(false);
  const [locations, setLocations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const search = async () => {
    if (zip.length !== 5) return;
    setBusy(true);
    setErr(null);

    try {
      setLocations(await api.findRetailLocations(zip));
      setSearched(true);
    } catch (e) {
      setErr(e.message);
    }

    setBusy(false);
  };

  const directionsUrl = (location) => {
    const address = [
      location.address_line_1,
      location.address_line_2,
      location.city,
      location.state,
      location.zip,
    ].filter(Boolean).join(", ");

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  };

  return (
    <div className="nf"><style>{CSS}</style>
      <Header eyebrow="Shop local" title="FIND NECTARFUSIONS"
        right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>} />

      <div className="nf-wrap nf-help-page">
        <div className="nf-help-hero nf-help-reveal">
          <div className="display" style={{ fontSize: 31, color: c.darkBrown }}>
            FIND HONEY NEAR YOU
          </div>
          <p style={{ margin: "8px 0 16px", fontSize: 14.5, lineHeight: 1.65, color: c.brown }}>
            Enter your ZIP code to find shops carrying NectarFusions.
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={zip}
              maxLength={5}
              inputMode="numeric"
              placeholder="ZIP code"
              aria-label="ZIP code"
              onChange={(e) => {
                setZip(e.target.value.replace(/\D/g, ""));
                setSearched(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && zip.length === 5) search();
              }}
            />
            <button className="btn solid" disabled={zip.length !== 5 || busy}
              style={{ padding: "0 20px", flexShrink: 0 }}
              onClick={search}>
              {busy ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {err && <div className="err" style={{ marginTop: 14 }}>{err}</div>}

        {searched && locations.length === 0 && (
          <div className="card" style={{ padding: 24, marginTop: 16, textAlign: "center" }}>
            <div className="display" style={{ fontSize: 28, color: c.darkBrown }}>BUMMER!</div>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: c.brown, margin: "8px 0 0" }}>
              No stores near you yet! We&rsquo;re growing our retail family.
              You can still order directly from us online.
            </p>
            <button className="btn solid" style={{ padding: "11px 18px", marginTop: 14 }}
              onClick={onBack}>
              Shop online
            </button>
          </div>
        )}

        {locations.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {locations.length} location{locations.length === 1 ? "" : "s"} near {zip}
            </div>

            {locations.map((location) => (
              <div key={location.id} className="card"
                style={{ padding: 17, marginBottom: 10, borderColor: "#DDBB73" }}>
                <div className="display" style={{ fontSize: 27, color: c.darkBrown }}>
                  {location.name}
                </div>

                <div style={{ fontSize: 14, lineHeight: 1.65, color: c.brown, marginTop: 7 }}>
                  <div>{location.address_line_1}</div>
                  {location.address_line_2 && <div>{location.address_line_2}</div>}
                  <div>{location.city}, {location.state} {location.zip}</div>
                </div>

                {(location.phone || location.email) && (
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: c.tan, marginTop: 7 }}>
                    {location.phone && <div>{location.phone}</div>}
                    {location.email && <div>{location.email}</div>}
                  </div>
                )}

                {location.notes && (
                  <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}>
                    {location.notes}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
                  <a className="btn solid"
                    href={directionsUrl(location)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ padding: "10px 14px", fontSize: 12.5, textDecoration: "none" }}>
                    Directions
                  </a>

                  {location.website && (
                    <a className="btn"
                      href={location.website.startsWith("http") ? location.website : `https://${location.website}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ padding: "10px 14px", fontSize: 12.5, textDecoration: "none" }}>
                      Visit website
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <section className="nf-find-markets nf-find-reveal">
          <div className="nf-modern-kicker">See us in person</div>
          <h2>Upcoming Markets</h2>

          {marketDates.length === 0 ? (
            <div className="nf-find-empty">
              No upcoming markets are posted yet. Check back soon or contact us for the next date.
            </div>
          ) : (
            <div className="nf-find-market-list">
              {marketDates.map((market) => (
                <article key={market.id} className="nf-find-market-card">
                  <div>
                    <strong>{market.venue?.name}</strong>
                    <span>
                      {market.venue?.where_at}
                      {market.venue?.hours ? ` · ${market.venue.hours}` : ""}
                    </span>
                  </div>
                  <time>{fmt(parseDay(market.day))}</time>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="nf-find-contact nf-find-reveal">
          <div className="nf-modern-kicker">Questions or wholesale inquiries</div>
          <h2>Contact NectarFusions</h2>
          <div className="nf-find-contact-grid">
            <a href={`tel:${CONTACT.phone.replace(/\D/g, "")}`}>
              <span>Phone</span>
              <strong>{CONTACT.phone}</strong>
            </a>
            <a href={`mailto:${CONTACT.email}`}>
              <span>Email</span>
              <strong>{CONTACT.email}</strong>
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}

/* ============================================================
   ORDER HELP
   ============================================================ */
function OrderHelp({ Header, onBack, onOrderFound, initialOrderNo}) {
  const options = [
    {
      id: "skip_next_box",
      label: "Skip my next box",
      note: "Send us the request and we’ll confirm the skipped Honey Club box.",
      accountKind: "subscription",
    },
    {
      id: "continue_with_cancellation",
      label: "Continue with cancellation",
      note: "Tell us which Honey Club membership you want cancelled.",
      accountKind: "subscription",
    },
    {
      id: "special_request",
      label: "Special request",
      note: "Changes, gifting, delivery details, custom needs, or anything unusual.",
      accountKind: "general",
    },
    {
      id: "other",
      label: "Other",
      note: "Tell us what you need and we’ll point you in the right direction.",
      accountKind: "general",
    },
  ];

  const [requestKind, setRequestKind] = useState("");
  const [accountKind, setAccountKind] = useState("subscription");
  const [accountNumber, setAccountNumber] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    details: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);
  const [website, setWebsite] = useState("");
  const [formStartedAt] = useState(() => Date.now());
  const [lookup, setLookup] = useState({ orderNo: String(initialOrderNo || ""), email: "" });
  useEffect(() => {
    if (!initialOrderNo) return;
    setLookup((current) => ({ ...current, orderNo: String(initialOrderNo) }));
  }, [initialOrderNo]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const findMyOrder = async () => {
    if (lookupBusy) return;

    const orderNo = lookup.orderNo.replace(/^#/, "").trim();
    const email = lookup.email.trim();

    if (!orderNo && !email) {
      setLookupError("Enter your order number and the email address used at checkout.");
      return;
    }

    if (!orderNo) {
      setLookupError("Enter your order number.");
      return;
    }

    if (!/^\d{3,12}$/.test(orderNo)) {
      setLookupError("Enter the numbers from your order confirmation, such as 7856.");
      return;
    }

    if (!email) {
      setLookupError("Enter the email address used at checkout.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setLookupError("Enter a complete email address, such as name@example.com.");
      return;
    }

    setLookupBusy(true);
    setLookupError("");

    try {
      await onOrderFound(orderNo, email);
    } catch (e) {
      setLookupError(
        "We couldn’t find an order matching that number and email. Check both entries and try again."
      );
    } finally {
      setLookupBusy(false);
    }
  };

  const selectOption = (option) => {
    setRequestKind(option.id);
    setAccountKind(option.accountKind);
    setErr(null);
  };

  const chosen = options.find((option) => option.id === requestKind);
  const detailsRequired = ["special_request", "other"].includes(requestKind);
  const canSubmit =
    requestKind &&
    form.name.trim() &&
    form.email.trim() &&
    (!detailsRequired || form.details.trim()) &&
    !busy;

  const submit = async () => {
    if (!canSubmit) return;

    setBusy(true);
    setErr(null);

    try {
      await api.submitCustomerRequest({
        requestKind,
        accountKind,
        accountNumber: accountNumber.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        details: form.details.trim(),
        website,
        formStartedAt,
      });
      setDone(true);
    } catch (e) {
      setErr(e.message);
    }

    setBusy(false);
  };

  if (done) {
    return (
      <div className="nf"><style>{CSS}</style>
        <Header eyebrow="Customer care" title="REQUEST RECEIVED"
          right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>} />

        <div className="nf-wrap" style={{ paddingTop: 30 }}>
          <div className="card"
            style={{ padding: 24, textAlign: "center", borderColor: c.gold, background: "#FFFBF0" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <Logo size={64} />
            </div>
            <div className="display" style={{ fontSize: 34, color: c.darkBrown }}>
              WE’VE GOT IT
            </div>
            <p style={{ fontSize: 14.5, lineHeight: 1.7, color: c.brown, margin: "10px 0 0" }}>
              Your request was sent to NectarFusions. We’ll review it and contact you using the information provided.
            </p>
          </div>

          <button className="btn ghost"
            style={{ width: "100%", padding: 14, marginTop: 12 }}
            onClick={() => {
              setDone(false);
              setRequestKind("");
              setAccountKind("subscription");
              setAccountNumber("");
              setWebsite("");
              setForm({ name: "", email: "", phone: "", details: "" });
            }}>
            Submit another request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nf"><style>{CSS}</style>
      <Header eyebrow="Customer care" title="ORDER HELP"
        right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>} />

      <div className="nf-wrap" style={{ paddingTop: 26 }}>
        <section className="card" style={{ padding: 20, marginBottom: 16, background: "#F3FAFE", borderColor: "#9FD5F2" }}>
          <div className="nf-modern-kicker">Returning to an order?</div>
          <div className="display" style={{ fontSize: 31, color: "#174A68", marginTop: 7 }}>FIND MY ORDER</div>
          <p style={{ margin: "8px 0 14px", fontSize: 14, lineHeight: 1.65, color: "#526B7B" }}>
            Enter the order number and email address used at checkout to reopen your private blue confirmation page. Order details stay private until both match.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.75fr) minmax(0,1.25fr)", gap: 9 }}>
            <input aria-label="Order number" placeholder="Order number" value={lookup.orderNo}
              inputMode="numeric"
              onChange={(e) => {
                setLookup((x) => ({ ...x, orderNo: e.target.value }));
                if (lookupError) setLookupError("");
              }}
              onKeyDown={(e) => { if (e.key === "Enter") findMyOrder(); }} />
            <input aria-label="Order email" type="email" placeholder="Email used for the order" value={lookup.email}
              onChange={(e) => {
                setLookup((x) => ({ ...x, email: e.target.value }));
                if (lookupError) setLookupError("");
              }}
              onKeyDown={(e) => { if (e.key === "Enter") findMyOrder(); }} />
          </div>
          {lookupError && <div className="err" style={{ marginTop: 10 }}>{lookupError}</div>}
          <button className="btn solid" style={{ width: "100%", padding: 13, marginTop: 10 }}
            disabled={lookupBusy} onClick={findMyOrder}>
            {lookupBusy ? "Finding your order…" : "View My Confirmation"}
          </button>
        </section>
        <div className="card" style={{ padding: 20, background: "#FFFBF0", borderColor: c.gold }}>
          <div className="display" style={{ fontSize: 31, color: c.darkBrown }}>
            HOW CAN WE HELP?
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.65, color: c.brown }}>
            Choose the request that best matches what you need. This sends it directly to the NectarFusions Admin inbox.
          </p>
        </div>

        <div className="nf-help-options">
          {options.map((option) => (
            <button key={option.id}
              className={`nf-help-option ${requestKind === option.id ? "selected" : ""}`}
              onClick={() => selectOption(option)}>
              <div style={{ fontSize: 14.5, fontWeight: 750 }}>{option.label}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: c.brown, marginTop: 3 }}>
                {option.note}
              </div>
            </button>
          ))}
        </div>

        {chosen && (
          <div className="nf-help-form nf-help-reveal">
            <div className="nf-modern-kicker">Your information</div>
            <h2>Tell Us What You Need</h2>

            <div style={{ display: "grid", gap: 9 }}>
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
              >
                <label>
                  Website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
              </div>

              <Field
                value={form.name}
                placeholder="Name"
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
              <Field
                value={form.email}
                type="email"
                placeholder="Email"
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
              />
              <Field
                value={form.phone}
                type="tel"
                required={false}
                placeholder="Phone (optional)"
                onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
              />

              <div>
                <div className="eyebrow" style={{ marginBottom: 7 }}>This is about</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
                  {[
                    ["subscription", "Honey Club"],
                    ["order", "Order"],
                    ["general", "General"],
                  ].map(([id, label]) => (
                    <button key={id}
                      className={`btn ${accountKind === id ? "on" : ""}`}
                      style={{ padding: "10px 6px", fontSize: 11.5 }}
                      onClick={() => setAccountKind(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {accountKind !== "general" && (
                <Field
                  value={accountNumber}
                  required={false}
                  placeholder={accountKind === "subscription"
                    ? "Honey Club membership number (optional)"
                    : "Order number (optional)"}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              )}

              <Field
                value={form.details}
                rows={4}
                required={detailsRequired}
                placeholder={
                  requestKind === "skip_next_box"
                    ? "Anything we should know? (optional)"
                    : requestKind === "continue_with_cancellation"
                      ? "Anything we should know about the cancellation? (optional)"
                      : "Please tell us what you need"
                }
                onChange={(e) => setForm((current) => ({ ...current, details: e.target.value }))}
              />
            </div>

            {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}

            <button className="btn solid"
              style={{ width: "100%", padding: 14, marginTop: 12 }}
              disabled={!canSubmit}
              onClick={submit}>
              {busy ? "Sending…" : "Send request"}
            </button>

            <div style={{ fontSize: 11.5, lineHeight: 1.55, color: c.tan, textAlign: "center", marginTop: 9 }}>
              This form does not immediately change or cancel an order or subscription. NectarFusions will review the request.
            </div>
          </div>
        )}

        <section className="nf-help-faq nf-help-reveal">
          <div className="nf-modern-kicker">Quick answers</div>
          <h2>Frequently Asked Questions</h2>

          <div className="nf-help-faq-list">
            {[
              [
                "Can I change or cancel an order?",
                "Use the order link in your confirmation email during the cancellation window. After that, submit an Order Help request and we’ll review what is still possible.",
              ],
              [
                "How does market pickup work?",
                "Choose Market Pickup during checkout, select an available market date, and bring your order number when you arrive.",
              ],
              [
                "Can I request specific Honey Club flavors?",
                "Yes. Choose I Have Requests during signup, select your flavor preferences, and add favorites or flavors to avoid. Requests depend on seasonal availability.",
              ],
              [
                "Can I skip a Honey Club box?",
                "Yes. Choose Skip My Next Box above and send the request. We’ll confirm the change before the next box is prepared.",
              ],
              [
                "Do you ship outside Michigan?",
                "Current shipping and delivery availability is shown during checkout. Enter your order details to see the options available for your location.",
              ],
              [
                "Are NectarFusions honeys made with artificial flavors or syrups?",
                "No. Our infusions use real fruits, herbs, spices, peppers, coffee, and vanilla—never artificial flavors or syrups.",
              ],
            ].map(([question, answer]) => (
              <details key={question} className="nf-help-faq-item">
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="nf-help-contact nf-help-reveal">
          <div className="nf-modern-kicker">Contact NectarFusions directly</div>
          <h2>We&rsquo;re Here to Help</h2>
          <p>For quick questions, order concerns, market pickup help, or wholesale inquiries, contact us directly.</p>
          <div className="nf-help-contact-grid">
            <a href={`tel:${CONTACT.phone.replace(/\D/g, "")}`}>
              <span>Phone</span>
              <strong>{CONTACT.phone}</strong>
            </a>
            <a href={`mailto:${CONTACT.email}`} target="_blank" rel="noreferrer">
              <span>Email</span>
              <strong>{CONTACT.email}</strong>
            </a>
          </div>
        </section>
      </div>
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
  const [retailLocations, setRetailLocations] = useState([]);
  const [customerRequests, setCustomerRequests] = useState([]);
  const [requestView, setRequestView] = useState("open");
  const [adminTab, setAdminTab] = useState("orders");
  const [q, setQ] = useState("");
  const [orderView, setOrderView] = useState("active");
  const [subView, setSubView] = useState("active");
  const [openFlavor, setOpenFlavor] = useState(null);
  const [topPickDrafts, setTopPickDrafts] = useState([]);
  const [topPickUploading, setTopPickUploading] = useState(null);
  const [spunEnabledDraft, setSpunEnabledDraft] = useState(cat?.spunAvailability?.enabled !== false);
  const [spunMessageDraft, setSpunMessageDraft] = useState(
    cat?.spunAvailability?.message ||
    "Spun honey is temporarily unavailable. Warm weather can soften or melt its whipped texture."
  );
  const [newDay, setNewDay] = useState("");
  const [blockDay, setBlockDay] = useState("");
  const [err, setErr] = useState(null);

  const pull = useCallback(async () => {
    try {
      const [o, s, d, r, cr] = await Promise.all([
        api.listOrders(),
        api.listSubs(),
        api.listAllMarketDates(),
        api.listRetailLocations(),
        api.listCustomerRequests(),
      ]);
      setOrders(o);
      setSubs(s);
      setDates(d);
      setRetailLocations(r);
      setCustomerRequests(cr);
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { pull(); }, [pull]);

  useEffect(() => {
    setSpunEnabledDraft(cat?.spunAvailability?.enabled !== false);
    setSpunMessageDraft(
      cat?.spunAvailability?.message ||
      "Spun honey is temporarily unavailable. Warm weather can soften or melt its whipped texture."
    );
  }, [cat?.spunAvailability?.enabled, cat?.spunAvailability?.message]);

  useEffect(() => {
    const existing = Array.isArray(cat?.topPicks) ? cat.topPicks : [];
    const defaults = [
      { flavor_id: cat?.flavors?.find((f) => f.name === "Blueberry")?.id || null, tagline: "Best Seller", image_url: "/nf-top-blueberry.png", active: true },
      { flavor_id: cat?.flavors?.find((f) => f.name === "Cinnamon")?.id || null, tagline: "Warm & Cozy", image_url: "/nf-top-cinnamon.png", active: true },
      { flavor_id: cat?.flavors?.find((f) => f.name === "Jalapeño Lime")?.id || null, tagline: "Bright & Bold", image_url: "/nf-top-jalapeno-lime.png", active: true },
      { flavor_id: cat?.flavors?.find((f) => f.name === "Hot Thai Pepper")?.id || null, tagline: "Bring the Heat", image_url: "/nf-top-hot-thai.png", active: true },
    ];
    setTopPickDrafts((existing.length ? existing : defaults).map((pick) => ({ ...pick })));
  }, [cat?.topPicks, cat?.flavors]);

  const guard = async (fn) => {
    try {
      await fn();
      await pull();
      await reload();
      setErr(null);
    } catch (e) { setErr(e.message); }
  };

  const updateTopPick = (index, patch) => {
    setTopPickDrafts((current) =>
      current.map((pick, i) => i === index ? { ...pick, ...patch } : pick)
    );
  };

  const moveTopPick = (index, direction) => {
    setTopPickDrafts((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const addTopPickSlot = () => {
    setTopPickDrafts((current) => [
      ...current,
      { flavor_id: null, tagline: "", image_url: "", active: true },
    ].slice(0, 8));
  };

  const activeOrders = orders.filter((o) => !o.archived_at);
  const archivedOrders = orders.filter((o) => !!o.archived_at);
  const standardActiveOrders = activeOrders.filter((o) => o.method !== "market");
  const standardArchivedOrders = archivedOrders.filter((o) => o.method !== "market");
  const marketPickupOrders = activeOrders.filter((o) => o.method === "market");
  const orderPool = orderView === "archived" ? standardArchivedOrders : standardActiveOrders;
  const shownOrders = orderPool.filter((o) => !q ||
    o.order_no.includes(q.trim()) || o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const shownMarketPickups = marketPickupOrders.filter((o) => !q ||
    o.order_no.includes(q.trim()) ||
    o.name.toLowerCase().includes(q.trim().toLowerCase()) ||
    String(o.market_dates?.venues?.name || "").toLowerCase().includes(q.trim().toLowerCase()));
  const openCount = standardActiveOrders.filter((o) => o.status === "open").length;
  const marketOpenCount = marketPickupOrders.filter((o) => !["done", "cancelled"].includes(o.status)).length;

  const orderChanges = (order) =>
    [...(order.order_item_changes || [])].sort(
      (a, b) => new Date(b.changed_at || 0) - new Date(a.changed_at || 0)
    );

  const changedAt = (value) => {
    if (!value) return "";
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const activeSubs = subs.filter((s) => !s.archived_at);
  const archivedSubs = subs.filter((s) => !!s.archived_at);
  const shownSubs = subView === "archived" ? archivedSubs : activeSubs;
  const activeSubCount = activeSubs.filter((s) => s.status === "active").length;

  const openRequests = customerRequests.filter((request) => request.status !== "resolved");
  const resolvedRequests = customerRequests.filter((request) => request.status === "resolved");
  const shownRequests = requestView === "resolved" ? resolvedRequests : openRequests;
  const newRequestCount = customerRequests.filter((request) => request.status === "new").length;

  const today = api.today();
  const tabs = [
    ["inventory", "Flavors & Inventory"],
    ["subscriptions", `Honey Club (${activeSubs.length})`],
    ["marketPickups", `Market Pickups (${marketOpenCount})`],
    ["markets", "Market Schedule"],
    ["requests", `Order Help (${newRequestCount})`],
    ["orders", `Orders (${standardActiveOrders.length})`],
    ["retail", `Retailers (${retailLocations.filter((r) => r.active).length})`],
    ["topPicks", "Top Picks"],
  ].sort((a, b) =>
    a[1]
      .replace(/\s*\(\d+\)$/, "")
      .localeCompare(b[1].replace(/\s*\(\d+\)$/, ""))
  );

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
                Active · {standardActiveOrders.length}
              </button>
              <button className={`btn ${orderView === "archived" ? "on" : ""}`}
                style={{ padding: 10, fontSize: 13 }}
                onClick={() => { setOrderView("archived"); setQ(""); }}>
                Archived · {standardArchivedOrders.length}
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
                      {orderChanges(o).length > 0 && (
                        <span style={{
                          padding: "5px 8px",
                          border: "1px solid #D28A00",
                          borderRadius: 999,
                          background: "#FFF2B8",
                          color: "#6A4300",
                          fontSize: 12.5,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}>
                          CHANGED · {orderChanges(o).length}
                        </span>
                      )}
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

                    {orderChanges(o).length > 0 && (
                      <div style={{
                        marginTop: 10,
                        padding: "11px 12px",
                        border: "1px solid #E2B62F",
                        borderRadius: 10,
                        background: "#FFF9DE",
                      }}>
                        <div style={{
                          color: "#6A4300",
                          fontSize: 13,
                          fontWeight: 900,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                        }}>
                          Customer order changes
                        </div>

                        {orderChanges(o).map((change) => (
                          <div key={change.id} style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px solid #F0D77E",
                            color: "#4A3313",
                            fontSize: 14,
                            lineHeight: 1.55,
                          }}>
                            <div>
                              <strong>{change.old_flavor_name}</strong>
                              {" → "}
                              <strong>{change.new_flavor_name}</strong>
                            </div>
                            <div style={{ color: "#6F6258", fontSize: 13.5 }}>
                              {change.qty}× {change.size_label} {change.type === "spun" ? "Spun" : "Regular"}
                              {" · "}
                              Changed {changedAt(change.changed_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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

        {adminTab === "marketPickups" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Market Pickups · {marketOpenCount} awaiting pickup
            </div>
            <input placeholder="Order #, customer, or market" value={q} onChange={(e) => setQ(e.target.value)} />

            <div style={{ marginTop: 10, marginBottom: 32 }}>
              {shownMarketPickups.length === 0 && (
                <div className="card" style={{ padding: 20, textAlign: "center", color: c.tan, fontSize: 14 }}>
                  {q ? "Nothing matches." : "No active market pickup orders."}
                </div>
              )}

              {shownMarketPickups.map((o) => {
                const pickedUp = o.status === "done";
                const cancelled = o.status === "cancelled";
                const missed = Number(o.no_show_count || 0);
                const marketName = o.market_dates?.venues?.name || "Market pickup";
                const marketDay = o.market_dates?.day ? fmt(parseDay(o.market_dates.day)) : "Date unavailable";

                return (
                  <div key={o.id} className="card nf-market-pickup-card" style={{
                    padding: 16, marginBottom: 10, opacity: cancelled ? .52 : 1,
                    borderColor: missed >= 2 ? c.red : pickedUp ? "#7D9A68" : "#4F91C6",
                  }}>
                    <div className="nf-market-pickup-banner">MARKET PICKUP</div>

                    <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginTop: 10, flexWrap: "wrap" }}>
                      <span className="num" style={{ fontSize: 28, color: c.darkBrown }}>#{o.order_no}</span>
                      {orderChanges(o).length > 0 && (
                        <span style={{
                          padding: "5px 8px",
                          border: "1px solid #D28A00",
                          borderRadius: 999,
                          background: "#FFF2B8",
                          color: "#6A4300",
                          fontSize: 12.5,
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}>
                          CHANGED · {orderChanges(o).length}
                        </span>
                      )}
                      <span style={{ fontWeight: 750, fontSize: 15, flex: 1, minWidth: 160 }}>{o.name}</span>
                      <span className="num" style={{ fontSize: 20, color: c.brown }}>{money(o.total_cents / 100)}</span>
                    </div>

                    <div className="nf-market-location">
                      <strong>{marketName}</strong>
                      <span>{marketDay}{o.market_dates?.venues?.hours ? ` · ${o.market_dates.venues.hours}` : ""}</span>
                    </div>

                    <div style={{ fontSize: 12.5, color: c.tan, marginTop: 7 }}>{o.phone} · {o.email}</div>

                    <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.55 }}>
                      {o.order_items?.map((item) => (
                        <div key={item.id}>
                          {item.qty}× {item.size_label} <strong>{item.type === "spun" ? "Spun" : "Regular"}</strong> — {item.flavor_name}
                        </div>
                      ))}
                    </div>

                    {orderChanges(o).length > 0 && (
                      <div style={{
                        marginTop: 10,
                        padding: "12px 13px",
                        border: "1px solid #E2B62F",
                        borderRadius: 10,
                        background: "#FFF9DE",
                      }}>
                        <div style={{
                          color: "#6A4300",
                          fontSize: 13,
                          fontWeight: 900,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                        }}>
                          Customer order changes
                        </div>

                        {orderChanges(o).map((change) => (
                          <div key={change.id} style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px solid #F0D77E",
                            color: "#4A3313",
                            fontSize: 14,
                            lineHeight: 1.55,
                          }}>
                            <div>
                              <strong>{change.old_flavor_name}</strong>
                              {" → "}
                              <strong>{change.new_flavor_name}</strong>
                            </div>
                            <div style={{ color: "#6F6258", fontSize: 13.5 }}>
                              {change.qty}× {change.size_label} {change.type === "spun" ? "Spun" : "Regular"}
                              {" · "}
                              Changed {changedAt(change.changed_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={`nf-noshow-status ${missed >= 2 ? "final" : missed === 1 ? "warning" : ""}`}>
                      {missed === 0 && "No missed pickups"}
                      {missed === 1 && "First pickup missed · Order remains reserved"}
                      {missed >= 2 && "Second pickup missed · Inventory returned"}
                    </div>

                    {!cancelled && !pickedUp && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 11 }}>
                        <button className="btn on" style={{ padding: "10px 9px", fontSize: 12.5 }}
                          onClick={() => confirm(`Mark order #${o.order_no} as picked up?`) &&
                            guard(() => api.marketOrderAction(o.id, "picked_up"))}>
                          Mark picked up
                        </button>
                        <button className="btn" disabled={missed >= 2}
                          style={{ padding: "10px 9px", fontSize: 12.5, borderColor: missed ? c.red : undefined }}
                          onClick={() => {
                            const wording = missed === 0
                              ? `Mark the first missed pickup for order #${o.order_no}? The customer will receive an email.`
                              : `Mark the second missed pickup for order #${o.order_no}? The customer will receive the final email and the honey will return to inventory.`;
                            if (confirm(wording)) guard(() => api.marketOrderAction(o.id, "no_show"));
                          }}>
                          {missed === 0 ? "First no-show" : missed === 1 ? "Second no-show" : "No-show complete"}
                        </button>
                      </div>
                    )}

                    {pickedUp && (
                      <div style={{ marginTop: 11, padding: 10, borderRadius: 10, background: "#EEF6E9", color: "#49633A", fontWeight: 750, textAlign: "center", fontSize: 13 }}>
                        Picked up ✓
                      </div>
                    )}

                    <button className="btn ghost" style={{ width: "100%", padding: "9px 12px", marginTop: 7, fontSize: 12.5 }}
                      onClick={() => confirm(`Archive order #${o.order_no}?`) && guard(() => api.archiveOrder(o.id))}>
                      Archive order
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {adminTab === "topPicks" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Storefront Top Picks</div>
            <p style={{ fontSize: 13, color: c.brown, margin: "0 0 14px", lineHeight: 1.6 }}>
              Choose the flavors, promotional wording, images, and display order shown in the homepage Top Picks section.
            </p>

            <div className="nf-admin-top-picks-list">
              {topPickDrafts.map((pick, index) => {
                const flavor = cat.flavors.find((item) => item.id === pick.flavor_id);
                const preview = pick.image_url || (flavor ? flavorImage(flavor) : "");

                return (
                  <div key={`${pick.flavor_id || "empty"}-${index}`} className="card nf-admin-top-pick-card">
                    <div className="nf-admin-top-pick-order">
                      <span className="num">#{index + 1}</span>
                      <div>
                        <button className="btn ghost" disabled={index === 0}
                          onClick={() => moveTopPick(index, -1)} aria-label="Move Top Pick up">↑</button>
                        <button className="btn ghost" disabled={index === topPickDrafts.length - 1}
                          onClick={() => moveTopPick(index, 1)} aria-label="Move Top Pick down">↓</button>
                      </div>
                    </div>

                    <div className="nf-admin-top-pick-preview">
                      {preview ? (
                        <img src={preview} alt={flavor ? `${flavor.name} Top Pick` : "Top Pick preview"} />
                      ) : (
                        <span>No image</span>
                      )}
                    </div>

                    <div className="nf-admin-top-pick-fields">
                      <label>
                        <span>Flavor</span>
                        <select value={pick.flavor_id || ""}
                          onChange={(e) => updateTopPick(index, { flavor_id: e.target.value || null })}>
                          <option value="">Choose a flavor</option>
                          {cat.flavors.filter((f) => f.active !== false).map((f) => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </label>

                      <label>
                        <span>Promotional line</span>
                        <input value={pick.tagline || ""} maxLength={60}
                          placeholder="Customer favorite"
                          onChange={(e) => updateTopPick(index, { tagline: e.target.value })} />
                      </label>

                      <label className="nf-admin-top-pick-upload">
                        <span>Custom image</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp"
                          disabled={topPickUploading === index}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              setTopPickUploading(index);
                              const imageUrl = await api.uploadTopPickImage(file);
                              updateTopPick(index, { image_url: imageUrl });
                              setErr(null);
                            } catch (error) {
                              setErr(error.message);
                            } finally {
                              setTopPickUploading(null);
                              e.target.value = "";
                            }
                          }} />
                        <small>{topPickUploading === index ? "Uploading…" : "Leave empty to use the flavor’s normal image."}</small>
                      </label>

                      <label className="nf-admin-top-pick-toggle">
                        <input type="checkbox" checked={pick.active !== false}
                          onChange={(e) => updateTopPick(index, { active: e.target.checked })} />
                        <span>Show this Top Pick</span>
                      </label>

                      <div className="nf-admin-top-pick-actions">
                        {pick.image_url && (
                          <button className="btn ghost"
                            onClick={() => updateTopPick(index, { image_url: "" })}>
                            Use flavor image
                          </button>
                        )}
                        <button className="btn danger"
                          onClick={() => setTopPickDrafts((current) => current.filter((_, i) => i !== index))}>
                          Remove slot
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="nf-admin-top-pick-footer">
              <button className="btn" disabled={topPickDrafts.length >= 8} onClick={addTopPickSlot}>
                Add Top Pick
              </button>
              <button className="btn solid"
                onClick={() => guard(() => api.setTopPicks(topPickDrafts))}>
                Save Top Picks
              </button>
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
                      {(s.flavor_mode || s.flavor_preferences?.length || s.flavor_requests) && (
                        <div className="nf-admin-flavor-preferences">
                          <strong>{s.flavor_mode === "request" ? "Flavor requests" : "Surprise preference"}</strong>
                          {s.flavor_preferences?.length > 0 && (
                            <span>{s.flavor_preferences.join(" · ")}</span>
                          )}
                          {s.flavor_requests && <em>{s.flavor_requests}</em>}
                        </div>
                      )}
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

        {adminTab === "retail" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Retail locations</div>
            <p style={{ fontSize: 13, color: c.brown, margin: "0 0 12px", lineHeight: 1.55 }}>
              Active stores appear in customer ZIP searches. Search ZIPs can include nearby areas a store serves.
            </p>

            {retailLocations.map((location) => (
              <div key={location.id} className="card"
                style={{
                  padding: 12,
                  marginBottom: 9,
                  opacity: location.active ? 1 : .62,
                  borderColor: location.active ? c.amber : "#D8CCBA"
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, fontWeight: 700, color: c.darkBrown }}>
                    {location.name || "New retailer"}
                  </div>
                  <button className={`btn ${location.active ? "on" : ""}`}
                    style={{ padding: "7px 10px", fontSize: 11 }}
                    onClick={() => guard(() =>
                      api.updateRetailLocation(location.id, { active: !location.active })
                    )}>
                    {location.active ? "Active ✓" : "Hidden"}
                  </button>
                </div>

                <div style={{ display: "grid", gap: 7 }}>
                  <input defaultValue={location.name || ""} placeholder="Business name"
                    onBlur={(e) => e.target.value !== (location.name || "") &&
                      guard(() => api.updateRetailLocation(location.id, { name: e.target.value }))} />

                  <input defaultValue={location.address_line_1 || ""} placeholder="Street address"
                    onBlur={(e) => e.target.value !== (location.address_line_1 || "") &&
                      guard(() => api.updateRetailLocation(location.id, { address_line_1: e.target.value }))} />

                  <input defaultValue={location.address_line_2 || ""} placeholder="Suite, booth, or building (optional)"
                    onBlur={(e) => e.target.value !== (location.address_line_2 || "") &&
                      guard(() => api.updateRetailLocation(location.id, { address_line_2: e.target.value || null }))} />

                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr .65fr .8fr", gap: 7 }}>
                    <input defaultValue={location.city || ""} placeholder="City"
                      onBlur={(e) => e.target.value !== (location.city || "") &&
                        guard(() => api.updateRetailLocation(location.id, { city: e.target.value }))} />
                    <input defaultValue={location.state || "MI"} maxLength={2} placeholder="MI"
                      onBlur={(e) => guard(() =>
                        api.updateRetailLocation(location.id, { state: e.target.value.toUpperCase() || "MI" })
                      )} />
                    <input defaultValue={location.zip || ""} maxLength={5} inputMode="numeric" placeholder="ZIP"
                      onBlur={(e) => e.target.value !== (location.zip || "") &&
                        guard(() => api.updateRetailLocation(location.id, { zip: e.target.value.replace(/\D/g, "") }))} />
                  </div>

                  <input
                    defaultValue={(location.search_zips || []).join(", ")}
                    placeholder="Nearby search ZIPs — comma separated"
                    onBlur={(e) => {
                      const search_zips = e.target.value
                        .split(",")
                        .map((z) => z.trim().replace(/\D/g, ""))
                        .filter((z) => z.length === 5);

                      guard(() => api.updateRetailLocation(location.id, { search_zips }));
                    }}
                  />

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <input defaultValue={location.phone || ""} placeholder="Phone"
                      onBlur={(e) => e.target.value !== (location.phone || "") &&
                        guard(() => api.updateRetailLocation(location.id, { phone: e.target.value || null }))} />
                    <input defaultValue={location.email || ""} placeholder="Email"
                      onBlur={(e) => e.target.value !== (location.email || "") &&
                        guard(() => api.updateRetailLocation(location.id, { email: e.target.value || null }))} />
                  </div>

                  <input defaultValue={location.website || ""} placeholder="Website"
                    onBlur={(e) => e.target.value !== (location.website || "") &&
                      guard(() => api.updateRetailLocation(location.id, { website: e.target.value || null }))} />

                  <textarea defaultValue={location.notes || ""} rows={2}
                    placeholder="Customer-facing note (optional)"
                    onBlur={(e) => e.target.value !== (location.notes || "") &&
                      guard(() => api.updateRetailLocation(location.id, { notes: e.target.value || null }))} />
                </div>

                <button className="btn danger"
                  style={{ width: "100%", padding: 9, marginTop: 9, fontSize: 12 }}
                  onClick={() =>
                    confirm(`Permanently delete ${location.name || "this retailer"}?`) &&
                    guard(() => api.deleteRetailLocation(location.id))
                  }>
                  Delete retailer
                </button>
              </div>
            ))}

            <button className="btn solid"
              style={{ width: "100%", padding: 12, marginTop: 5, marginBottom: 40 }}
              onClick={() => guard(() => api.addRetailLocation({
                name: "New retailer",
                address_line_1: "",
                city: "",
                state: "MI",
                zip: "",
                search_zips: [],
                active: false,
                sort: retailLocations.length,
              }))}>
              + Add retailer
            </button>
          </>
        )}

        {adminTab === "requests" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 7 }}>
              Customer requests · {newRequestCount} new
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <button className={`btn ${requestView === "open" ? "on" : ""}`}
                style={{ padding: 10, fontSize: 13 }}
                onClick={() => setRequestView("open")}>
                Open · {openRequests.length}
              </button>
              <button className={`btn ${requestView === "resolved" ? "on" : ""}`}
                style={{ padding: 10, fontSize: 13 }}
                onClick={() => setRequestView("resolved")}>
                Resolved · {resolvedRequests.length}
              </button>
            </div>

            {shownRequests.length === 0 && (
              <div className="card"
                style={{ padding: 22, textAlign: "center", color: c.tan, fontSize: 14, marginBottom: 35 }}>
                {requestView === "resolved"
                  ? "No resolved customer requests."
                  : "No open customer requests."}
              </div>
            )}

            {shownRequests.map((request) => {
              const kindLabels = {
                skip_next_box: "Skip my next box",
                continue_with_cancellation: "Continue with cancellation",
                special_request: "Special request",
                other: "Other",
              };

              const statusLabels = {
                new: "New",
                in_progress: "In Progress",
                resolved: "Resolved",
              };

              return (
                <div key={request.id} className="card"
                  style={{
                    padding: 14,
                    marginBottom: 9,
                    borderColor:
                      request.status === "new"
                        ? c.amber
                        : request.status === "in_progress"
                          ? c.sky
                          : "#8FA97B",
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="display" style={{ fontSize: 24, color: c.darkBrown }}>
                        {kindLabels[request.request_kind] || request.request_kind}
                      </div>
                      <div style={{ fontSize: 12, color: c.tan, marginTop: 3 }}>
                        {new Date(request.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="tag"
                      style={{
                        background:
                          request.status === "new"
                            ? c.orange
                            : request.status === "in_progress"
                              ? c.sky
                              : "#6E8C58",
                      }}>
                      {statusLabels[request.status] || request.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 13.5, lineHeight: 1.6, marginTop: 10 }}>
                    <div><strong>{request.name}</strong></div>
                    <div>{request.email}</div>
                    {request.phone && <div>{request.phone}</div>}
                    <div style={{ marginTop: 6, color: c.brown }}>
                      {request.account_kind === "subscription"
                        ? "Honey Club"
                        : request.account_kind === "order"
                          ? "Order"
                          : "General"}
                      {request.order_or_subscription_no
                        ? ` · #${request.order_or_subscription_no.replace(/^#/, "")}`
                        : ""}
                    </div>
                  </div>

                  {request.details && (
                    <div style={{
                      marginTop: 10,
                      padding: 11,
                      borderRadius: 10,
                      background: "#FBF7F1",
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      minWidth: 0,
                      maxWidth: "100%",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}>
                      {request.details}
                    </div>
                  )}

                  <div className="eyebrow" style={{ marginTop: 12, marginBottom: 7 }}>
                    Status
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7 }}>
                    {[
                      ["new", "New"],
                      ["in_progress", "In Progress"],
                      ["resolved", "Resolved"],
                    ].map(([status, label]) => (
                      <button key={status}
                        className={`btn ${request.status === status ? "on" : ""}`}
                        style={{ padding: "9px 5px", fontSize: 11 }}
                        onClick={() => guard(() =>
                          api.updateCustomerRequest(request.id, { status })
                        )}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="eyebrow" style={{ marginTop: 12, marginBottom: 7 }}>
                    Admin notes
                  </div>
                  <textarea
                    defaultValue={request.admin_notes || ""}
                    rows={3}
                    placeholder="Private notes, follow-up details, or what was completed"
                    onBlur={(e) => {
                      if (e.target.value !== (request.admin_notes || "")) {
                        guard(() => api.updateCustomerRequest(request.id, {
                          admin_notes: e.target.value || null,
                        }));
                      }
                    }}
                  />

                  {request.status === "resolved" && (
                    <button className="btn danger"
                      style={{ width: "100%", padding: 9, marginTop: 9, fontSize: 12 }}
                      onClick={() =>
                        confirm("Permanently delete this resolved request?") &&
                        guard(() => api.deleteCustomerRequest(request.id))
                      }>
                      Delete resolved request
                    </button>
                  )}
                </div>
              );
            })}

            <div style={{ height: 30 }} />
          </>
        )}

        {adminTab === "inventory" && (
          <>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Flavors &amp; inventory</div>
            <p style={{ fontSize: 13, color: c.brown, margin: "0 0 10px", lineHeight: 1.55 }}>
              Open a flavor to set the exact jars on hand for every size and texture. Saving zero marks it out of stock.
            </p>
            <section className="nf-admin-spun-card">
              <div>
                <div className="eyebrow">Seasonal texture availability</div>
                <h3>Spun Honey Storefront Control</h3>
                <p>
                  Turn Spun off during hot weather or whenever it cannot be offered safely. Customers will see your
                  custom message and the Spun option will appear unavailable.
                </p>
              </div>

              <label className="nf-admin-spun-toggle">
                <input
                  type="checkbox"
                  checked={spunEnabledDraft}
                  onChange={(event) => setSpunEnabledDraft(event.target.checked)}
                />
                <span>{spunEnabledDraft ? "Spun is available" : "Spun is unavailable"}</span>
              </label>

              <textarea
                rows={3}
                value={spunMessageDraft}
                onChange={(event) => setSpunMessageDraft(event.target.value)}
                placeholder="Explain why Spun is temporarily unavailable."
              />

              <button
                type="button"
                className="btn solid"
                onClick={() => guard(() => api.setSpunAvailability(spunEnabledDraft, spunMessageDraft))}
              >
                Save Spun availability
              </button>
            </section>

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
                        guard(() => f.active === false ? api.restoreFlavor(f.id) : api.deleteFlavor(f.id))}>×</button>
                  </div>

                  {open && (
                    <div style={{ padding: "0 10px 12px" }}>
                      <div className="card" style={{ padding: 10, marginTop: 8, boxShadow: "none" }}>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>Storefront lid image</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {flavorImage(f) ? (
                            <img className="nf-admin-flavor-image" src={flavorImage(f)} alt={`${f.name} lid`} />
                          ) : (
                            <div className="nf-admin-flavor-image" style={{
                              display: "grid",
                              placeItems: "center",
                              color: c.tan,
                              fontSize: 11,
                              textAlign: "center",
                              padding: 6,
                            }}>
                              No image
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              style={{ fontSize: 12, padding: 9 }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                guard(() => api.uploadFlavorImage(f.id, file));
                                e.target.value = "";
                              }}
                            />
                            <div style={{ fontSize: 11, color: c.tan, marginTop: 5, lineHeight: 1.4 }}>
                              PNG, JPG, or WebP. A new upload replaces the storefront image for every size and texture.
                            </div>
                          </div>
                        </div>
                      </div>

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
function About({ Header, onBack, onSearch, onContact }) {
  const sections = [
    ["difference-story", "Our Story"],
    ["difference-quality", "Quality"],
    ["difference-raw", "Raw & Unfiltered"],
    ["difference-ingredients", "Real Ingredients"],
    ["difference-small-batch", "Small Batch"],
    ["difference-michigan", "Made in Michigan"],
    ["difference-safety", "Food Safety"],
    ["difference-flavor", "Flavor"],
  ];

  const goToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="nf nf-difference-page"><style>{CSS}</style>
      <Header eyebrow="The NectarFusions Difference" title="Nature’s Happiness | Honey Infused." right={
        <button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>
      } />

      <main className="nf-wrap nf-difference-main">
        <section id="difference-story" className="nf-difference-hero nf-about-anchor">
          <div className="nf-story-gallery nf-story-gallery-three" aria-label="The NectarFusions founders and first hive">
            <figure className="nf-story-photo nf-story-photo-founders">
              <img
                src="/nf-founders.png"
                alt="The NectarFusions founders wearing beekeeping suits and holding jars of honey"
              />
              <figcaption>Mother and daughter, building NectarFusions together.</figcaption>
            </figure>
            <figure className="nf-story-photo nf-story-photo-primary">
              <img
                src="/nf-story-squirrel-house.png"
                alt="The original handmade squirrel house that became the first honeybee hive"
              />
              <figcaption>The little house the bees chose first.</figcaption>
            </figure>
            <figure className="nf-story-photo nf-story-photo-secondary">
              <img
                src="/nf-story-wild-hive.jpg"
                alt="Wild honeybees building comb inside the original wooden hive"
              />
              <figcaption>Inside the wild colony that started everything.</figcaption>
            </figure>
          </div>

          <article className="nf-about-copy nf-story-copy">
            <div className="nf-modern-kicker">From hive to home</div>
            <h2>Our Story</h2>

            <p className="nf-story-opening">We didn&rsquo;t go looking for the bees. They found us first.</p>

            <p>
              Our first hive was supposed to be a squirrel house. It was a summer workshop project, built mostly
              for the pleasure of spending an afternoon together. The squirrels never claimed it. Over the years,
              nearly every other creature in Michigan did.
            </p>
            <p>Then a wild swarm moved in.</p>
            <p>
              That summer, our garden came alive. Zucchini and squash stretched past their rows. Pumpkins appeared
              faster than we could count them. The fruit trees bent under their own weight. Even a butternut squash
              and a zucchini found each other and made something no seed packet could have prepared us for.
            </p>
            <p>We stopped calling it luck and started keeping bees. Mother and daughter, one frame at a time.</p>
            <p>
              The first honey we pulled ruined us for the kind that comes in a plastic bear. But honey that good
              deserves better than a permanent spot at the back of the cupboard.
            </p>
            <p>That&rsquo;s how NectarFusions began.</p>
            <p>
              We started pairing Michigan honey with real ingredients to make flavors worth reaching for every day.
              Stirred into morning coffee. Drizzled over warm biscuits. Set next to a sharp cheese. Eaten straight
              off the spoon, if we&rsquo;re being honest.
            </p>
            <p>
              At the heart of every jar is carefully sourced Michigan honey, strained rather than filtered, so it
              keeps the character of the hive and the place it came from.
            </p>
            <p className="nf-story-closing">
              Made by our family, for yours. Bring it to the table, pass it around, and let an ordinary day taste
              like something worth remembering.
            </p>
          </article>
        </section>

        <section id="difference-quality" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">01</div>
          <div>
            <div className="nf-modern-kicker">Our standard</div>
            <h3>Our Commitment to Quality</h3>
            <p>
              At NectarFusions, we believe exceptional honey begins with exceptional ingredients and thoughtful
              craftsmanship. Every jar is carefully made with quality, transparency, and flavor at the heart of
              everything we do.
            </p>
          </div>
        </section>

        <section id="difference-raw" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">02</div>
          <div>
            <div className="nf-modern-kicker">Preserving what matters</div>
            <h3>Raw &amp; Unfiltered</h3>
            <p>
              We start with raw honey that is gently strained—not finely filtered—to remove natural wax and debris
              while preserving its natural character and fine local pollen.
            </p>
            <p>
              Our Smoked Applewood variety is gently warmed during its smoking process to develop its distinctive
              wood-smoked flavor.
            </p>
          </div>
        </section>

        <section id="difference-ingredients" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">03</div>
          <div>
            <div className="nf-modern-kicker">Nothing artificial</div>
            <h3>Real Ingredients</h3>
            <p>
              Every NectarFusions infusion is made with real fruits, herbs, spices, peppers, coffee, and
              vanilla—never artificial flavors, colors, preservatives, or syrups.
            </p>
          </div>
        </section>

        <section id="difference-small-batch" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">04</div>
          <div>
            <div className="nf-modern-kicker">Made with intention</div>
            <h3>Small-Batch Crafted</h3>
            <p>
              Each batch is carefully handcrafted in small quantities, allowing us to focus on consistency,
              quality, and exceptional flavor in every jar.
            </p>
          </div>
        </section>

        <section id="difference-michigan" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">05</div>
          <div>
            <div className="nf-modern-kicker">Rooted locally</div>
            <h3>Proudly Made in Michigan</h3>
            <p>
              NectarFusions is proudly handcrafted in Coleman, Michigan using locally sourced raw honey whenever
              possible. Supporting local beekeepers and our Michigan community is an important part of who we are.
            </p>
          </div>
        </section>

        <section id="difference-safety" className="nf-difference-section nf-about-anchor">
          <div className="nf-difference-number">06</div>
          <div>
            <div className="nf-modern-kicker">Crafted responsibly</div>
            <h3>Produced in a Licensed Food Establishment</h3>
            <p>
              Every jar is produced in a Michigan food establishment licensed by the Michigan Department of
              Agriculture &amp; Rural Development (MDARD) and crafted in accordance with Michigan food safety
              regulations.
            </p>
          </div>
        </section>

        <section id="difference-flavor" className="nf-difference-section nf-difference-final nf-about-anchor">
          <div className="nf-difference-number">07</div>
          <div>
            <div className="nf-modern-kicker">Made to be remembered</div>
            <h3>Flavor Without Compromise</h3>
            <p>
              Our goal has always been simple: create bold, unforgettable infused honey using real ingredients
              while preserving the integrity of the honey itself.
            </p>
            <p>
              Whether you&rsquo;re drizzling it over biscuits, pairing it with cheese, glazing meats, sweetening tea,
              or adding a kick to your favorite recipes, every jar is crafted to bring something truly unique to
              the table.
            </p>
            <button className="nf-modern-primary" onClick={onBack}>Shop the honey</button>
          </div>
        </section>
      </main>


    </div>
  );
}
function Policy({ Header, onBack, shipOver, minutes }) {
  return (
    <div className="nf"><style>{CSS}
</style>
      <Header title="POLICIES" right={<button className="btn ghost nf-back-to-shop" onClick={onBack}>Back to shop</button>} />
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
