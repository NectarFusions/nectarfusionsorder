// NF HIVE SPONSORSHIP V6
import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import PartnerCartDrawer from "./PartnerCartDrawer";
import { resolvePartnerReminderOrder, suggestedPartnerRestocks } from "../lib/partnerCommerceCore.mjs";
import {
  getPartnerStoreFulfillment,
  setPartnerStoreCart,
  setPartnerStoreFulfillment,
} from "../lib/partnerStoreCart";

const PROGRAM_LABELS = {
  retail: "Retail",
  foodservice: "Wholesale",
  business_gifting: "Business Gifting",
  hive_partners: "Hive Partners",
};

const STATUS_LABELS = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  queued: "Queued",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for Delivery",
  pickup_ready: "Pickup Ready",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  submitted: "Submitted",
};

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const dateLabel = (value) => {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const cleanStatus = (value) =>
  STATUS_LABELS[value] ||
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const uniqueBy = (items, key) => {
  const map = new Map();
  for (const item of items || []) {
    const value = item?.[key];
    if (value != null && !map.has(value)) map.set(value, item);
  }
  return [...map.values()];
};

const CSS = `
.nf-commerce{display:grid;gap:22px}
.nf-commerce-top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:20px;border:1px solid #d9e6ec;border-radius:18px;background:linear-gradient(135deg,#f9fcfd,#eef7fa)}
.nf-commerce-kicker{font-size:12px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:#377996}
.nf-commerce-top h2{margin:6px 0 4px;font-size:clamp(27px,4vw,42px);line-height:1;color:#102e40}
.nf-commerce-top p{margin:0;color:#607582;max-width:680px;line-height:1.55}
.nf-commerce-program-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}
.nf-commerce-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #cfe0e7;border-radius:999px;padding:7px 10px;background:white;font-size:12px;font-weight:850;color:#183c4f}
.nf-commerce-chip[data-status="pending"]{background:#fff9e7;border-color:#eadb9e}
.nf-commerce-chip[data-status="declined"],.nf-commerce-chip[data-status="suspended"]{background:#fff0ef;border-color:#ecc7c4}
.nf-commerce-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.nf-commerce-btn{appearance:none;border:1px solid #1f6788;border-radius:10px;padding:11px 14px;background:white;color:#174b63;font:inherit;font-size:13px;font-weight:900;cursor:pointer}
.nf-commerce-btn.primary{background:#102e40;border-color:#102e40;color:white}
.nf-commerce-btn:disabled{opacity:.45;cursor:not-allowed}
.nf-commerce-nav{display:flex;gap:7px;overflow:auto;padding:5px;border:1px solid #dce8ed;border-radius:14px;background:#f7fafb}
.nf-commerce-nav button{flex:0 0 auto;border:0;border-radius:10px;padding:11px 14px;background:transparent;color:#5b6f79;font:inherit;font-size:13px;font-weight:850;cursor:pointer}
.nf-commerce-nav button[aria-current="page"]{background:#102e40;color:white}
.nf-commerce-panel{border:1px solid #dce8ed;border-radius:18px;background:white;padding:20px}
.nf-commerce-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:18px}
.nf-commerce-panel-head h3{margin:4px 0 5px;font-size:27px;color:#102e40}
.nf-commerce-panel-head p{margin:0;color:#6b7d87;line-height:1.5;max-width:720px}
.nf-commerce-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.nf-commerce-card{border:1px solid #dce8ed;border-radius:15px;padding:16px;background:#fff;display:grid;gap:10px;align-content:start}
.nf-commerce-card.soft{background:#f8fbfc}
.nf-commerce-card h4{margin:0;color:#102e40;font-size:19px}
.nf-commerce-card p{margin:0;color:#667b86;font-size:13px;line-height:1.5}
.nf-commerce-card .meta{display:flex;gap:6px;flex-wrap:wrap}
.nf-commerce-card .meta span{padding:5px 8px;border-radius:999px;background:#edf5f8;color:#315b6e;font-size:11px;font-weight:850}
.nf-commerce-stat{display:grid;gap:3px}.nf-commerce-stat span{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:#718590;font-weight:850}.nf-commerce-stat strong{font-size:21px;color:#102e40}
.nf-commerce-dashboard-grid{display:grid;grid-template-columns:1.3fr .7fr;gap:14px}
.nf-commerce-order-summary{border:1px solid #dce8ed;border-radius:15px;padding:16px;display:grid;gap:12px;background:#f8fbfc}
.nf-commerce-order-summary-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.nf-commerce-order-summary h4{margin:0;color:#102e40;font-size:18px}
.nf-commerce-order-summary small{color:#6b7d87}
.nf-commerce-status{display:inline-flex;padding:6px 9px;border-radius:999px;background:#eaf4ee;color:#2c6241;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
.nf-commerce-status[data-status="awaiting_payment"]{background:#fff5dd;color:#765c1a}.nf-commerce-status[data-status="cancelled"]{background:#f9e7e5;color:#8a3d36}
.nf-commerce-program-tabs{display:flex;gap:7px;overflow:auto;margin-bottom:16px}.nf-commerce-program-tabs button{border:1px solid #d5e3e9;border-radius:999px;background:white;padding:9px 12px;font:inherit;font-size:12px;font-weight:900;color:#456674;cursor:pointer}.nf-commerce-program-tabs button[aria-selected="true"]{background:#102e40;border-color:#102e40;color:white}
.nf-commerce-package-card{border:1px solid #d6e5eb;border-radius:17px;overflow:hidden;background:white;display:flex;flex-direction:column}
.nf-commerce-package-card .body{padding:17px;display:grid;gap:10px;flex:1}.nf-commerce-package-card h4{margin:0;color:#102e40;font-size:21px}.nf-commerce-package-card p{margin:0;color:#627984;line-height:1.5;font-size:13px}.nf-commerce-package-card .meta{display:flex;gap:6px;flex-wrap:wrap}.nf-commerce-package-card .meta span{padding:5px 8px;border-radius:999px;background:#edf5f8;color:#315b6e;font-size:11px;font-weight:850}.nf-commerce-package-card .foot{padding:13px 17px;border-top:1px solid #e2ebef;background:#f9fbfc}
.nf-commerce-builder{margin-top:18px;border:2px solid #b9d8e6;border-radius:18px;padding:18px;background:#fafdfe;display:grid;gap:17px}
.nf-commerce-builder-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.nf-commerce-builder-head h3{margin:3px 0 4px;color:#102e40;font-size:24px}.nf-commerce-builder-head p{margin:0;color:#647a85}
.nf-commerce-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.nf-commerce-field{display:grid;gap:6px}.nf-commerce-field.full{grid-column:1/-1}.nf-commerce-field label,.nf-commerce-choice-label{font-size:12px;font-weight:900;color:#244b5d}.nf-commerce-field input,.nf-commerce-field select,.nf-commerce-field textarea{width:100%;border:1px solid #cbdde5;border-radius:10px;padding:11px;background:white;font:inherit;color:#183b4c}.nf-commerce-field textarea{min-height:90px;resize:vertical}
.nf-commerce-choice-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.nf-commerce-choice{border:1px solid #cbdde5;border-radius:11px;background:white;padding:10px;font:inherit;font-size:12px;font-weight:850;color:#31586a;cursor:pointer}.nf-commerce-choice[aria-pressed="true"]{background:#102e40;color:white;border-color:#102e40}
.nf-commerce-builder-total{display:flex;justify-content:space-between;gap:14px;align-items:center;border-top:1px solid #d8e7ed;padding-top:15px}.nf-commerce-builder-total span{font-size:12px;color:#6b7d87}.nf-commerce-builder-total strong{font-size:24px;color:#102e40}
.nf-commerce-orders{display:grid;gap:10px}.nf-commerce-order{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:12px;align-items:center;border:1px solid #dce8ed;border-radius:13px;padding:14px}.nf-commerce-order > div{min-width:0}.nf-commerce-order span{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#7b8e97;font-weight:800;margin-bottom:3px}.nf-commerce-order strong{display:block;color:#173c4f;font-size:13px;overflow:hidden;text-overflow:ellipsis}.nf-commerce-empty{padding:24px;border:1px dashed #cbdde5;border-radius:14px;text-align:center;color:#6c808a;background:#fbfdfd}
.nf-commerce-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.nf-commerce-message{border-radius:11px;padding:11px 13px;font-size:13px;line-height:1.45}.nf-commerce-message.error{background:#fff0ef;color:#8b3e36;border:1px solid #e9c6c2}.nf-commerce-message.success{background:#edf8f1;color:#2f6845;border:1px solid #c9e4d2}
.nf-commerce-account-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.nf-commerce-program-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 0;border-bottom:1px solid #e6eef1}.nf-commerce-program-row:last-child{border-bottom:0}.nf-commerce-program-row strong{color:#173c4f}.nf-commerce-program-row span{font-size:12px;font-weight:900;text-transform:uppercase}
.nf-commerce-note{border-left:4px solid #9ed8f4;padding:10px 12px;background:#f4fafc;color:#546e7b;font-size:13px;line-height:1.5}
@media(max-width:880px){.nf-commerce-grid,.nf-commerce-dashboard-grid,.nf-commerce-account-grid{grid-template-columns:1fr}.nf-commerce-order{grid-template-columns:1fr 1fr}.nf-commerce-order .order-actions{grid-column:1/-1}.nf-commerce-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nf-commerce-top{flex-direction:column}.nf-commerce-actions{justify-content:flex-start}}
@media(max-width:560px){.nf-commerce-panel{padding:15px}.nf-commerce-field-grid{grid-template-columns:1fr}.nf-commerce-field.full{grid-column:auto}.nf-commerce-order{grid-template-columns:1fr}.nf-commerce-builder-total{align-items:flex-start;flex-direction:column}.nf-commerce-choice-grid{grid-template-columns:1fr 1fr}}

/* PARTNER PORTAL REORDER-FIRST V1 — focused, responsive partner experience */
.nf-commerce{gap:18px;color:#292b28}
.nf-commerce-top{background:#fbfaf7;border-color:#e7e2da;border-radius:16px;padding:clamp(16px,3vw,26px)}
.nf-commerce-kicker{color:#81703f;font-weight:800;letter-spacing:.1em}
.nf-commerce-top h2,.nf-commerce-panel-head h3,.nf-commerce-card h4,.nf-commerce-order-summary h4,.nf-commerce-package-card h4,.nf-commerce-stat strong{color:#272a27}
.nf-commerce-top p,.nf-commerce-panel-head p,.nf-commerce-card p,.nf-commerce-order-summary p{color:#62655f}
.nf-commerce-btn{color:#34352e;border-color:#d4cec0;border-radius:9px;font-weight:750}
.nf-commerce-btn.primary{background:#2e352d;border-color:#2e352d;color:white}
.nf-commerce-nav{background:#fbfaf7;border-color:#e7e2da;flex-wrap:wrap;overflow:visible;padding:6px;gap:4px}
.nf-commerce-nav button{color:#565951;border-radius:9px;font-weight:750;flex:1 1 auto;white-space:nowrap}
.nf-commerce-nav button[aria-current="page"]{background:#2e352d;color:white}
.nf-commerce-panel,.nf-commerce-order-summary,.nf-commerce-card,.nf-commerce-order,.nf-commerce-package-card{border-color:#e7e2da}
.nf-commerce-order-summary{background:#fffdf8}
.nf-commerce-card.soft{background:#faf9f5}
.nf-commerce-package-card .foot{background:#fbfaf8;border-top-color:#ebe6dd}
.nf-commerce-package-card .meta span,.nf-commerce-card .meta span{color:#655a3d;background:#f7f1e3}
.nf-commerce-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin-top:18px}
.nf-commerce-quick-card{appearance:none;text-align:left;border:1px solid #e5dfd3;border-radius:14px;padding:17px;background:white;font:inherit;display:flex;flex-direction:column;align-items:flex-start;gap:10px;cursor:pointer;min-width:0;transition:border-color .16s,transform .16s}
.nf-commerce-quick-card:hover,.nf-commerce-quick-card:focus-visible{border-color:#bea65e;transform:translateY(-2px)}
.nf-commerce-quick-card span{font-size:11px;font-weight:900;color:#96824a}
.nf-commerce-quick-card strong{font-size:16px;color:#252925}
.nf-commerce-quick-card small{font-size:12px;line-height:1.55;color:#62655f}
.nf-commerce-quick-card em{margin-top:auto;font-size:12px;font-style:normal;font-weight:800;color:#675830}
.nf-commerce-restock>p{font-size:13px;line-height:1.6;margin:0;color:#606158}
.nf-commerce-restock-meta{display:flex;gap:8px 20px;flex-wrap:wrap;font-size:12px;color:#656960}
.nf-commerce-restock-meta strong{color:#30322c}
.nf-commerce-next{gap:8px}
.nf-commerce-next-divider{height:1px;background:#e4ded4;margin:4px 0}
.nf-commerce-text-btn{appearance:none;border:0;background:transparent;padding:3px 0;color:#675830;font:inherit;font-size:12px;font-weight:800;cursor:pointer;text-align:left}
.nf-commerce-account-action{margin-top:8px}
@media(max-width:900px){.nf-commerce-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:520px){.nf-commerce-quick-grid{grid-template-columns:1fr 1fr;gap:8px}.nf-commerce-quick-card{padding:13px;gap:7px}.nf-commerce-quick-card strong{font-size:14px}.nf-commerce-nav button{flex:1 1 40%;font-size:12px;padding:10px 7px}.nf-commerce-top h2{line-height:1.13}.nf-commerce-restock-meta{flex-direction:column;gap:4px}}


/* NF RETAIL PACKAGE CLARITY V2 */
.nf-commerce-choice[aria-pressed="true"]{background:#2e352d;border-color:#2e352d;color:#fff}
.nf-commerce-retail-progress{margin-top:11px;color:#675830;font-weight:750;font-size:13px;line-height:1.45}
.nf-commerce-retail-progress[data-complete="true"]{color:#286545}
.nf-commerce-package-starting{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 9px;margin:1px 0 3px;color:#655a3d;font-size:12px}
.nf-commerce-package-starting strong{font-size:18px;color:#2e352d}
.nf-commerce-package-starting small{font-size:11px;color:#77736a;width:100%}
.nf-commerce-price-pending{font-size:14px !important;color:#655a3d !important;line-height:1.4}
.nf-commerce-btn.primary:disabled{opacity:.55;cursor:not-allowed}
.nf-commerce-builder-total>div{display:grid;gap:5px;min-width:0}
@media(max-width:700px){.nf-commerce-builder-total{align-items:stretch;flex-direction:column}.nf-commerce-builder-total .nf-commerce-btn{width:100%}}


/* NF PARTNER BUYING FLOW V3 */
.nf-commerce-top{padding:13px 18px;align-items:center;background:#fff;border-color:#e7e2da;border-radius:14px}
.nf-commerce-top .nf-commerce-kicker{font-size:10px}
.nf-commerce-top h2{font-family:inherit;font-size:clamp(17px,2vw,21px);font-weight:750;line-height:1.3;margin:3px 0 0}
.nf-commerce-top p{display:none}
.nf-commerce-package-starting{min-height:26px}
.nf-commerce-price-awaiting{margin:5px 0 2px;color:#6d6c65;font-size:12px;line-height:1.4}
.nf-commerce-sponsor-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.nf-commerce-portal-top-actions{display:flex;justify-content:flex-end}
@media(max-width:600px){.nf-commerce-top{gap:10px;align-items:flex-start}.nf-commerce-top .nf-commerce-actions{width:100%}.nf-commerce-top .nf-commerce-actions button{flex:1 1 auto}}


/* NF MY ORDERS PAYMENT-AWARE V5 */
.nf-order-history-list { display:grid; gap:14px; }
.nf-order-history-card { border:1px solid #e4dfd6; border-radius:16px; padding:18px; background:#fff; display:grid; gap:13px; }
.nf-order-history-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.nf-order-history-eyebrow { color:#8b7443; font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.nf-order-history-header h4 { margin:3px 0 4px; font-size:19px; color:#282d28; overflow-wrap:anywhere; }
.nf-order-history-muted { color:#747c79; font-size:13px; }
.nf-order-history-amount { text-align:right; flex-shrink:0; }
.nf-order-history-amount strong { display:block; font-size:21px; color:#282d28; }
.nf-order-history-status { display:inline-block; margin-top:6px; padding:5px 10px; border:1px solid #dae5dd; border-radius:999px; background:#f3f8f4; color:#356249; font-size:12px; font-weight:800; }
.nf-order-history-status[data-payment="pending"] { background:#fff7e9; color:#87632b; border-color:#f0dfbc; }
.nf-order-history-status[data-payment="cancelled"] { background:#f5f5f5; color:#6b6b6b; border-color:#e4e4e4; }
.nf-order-history-meta { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.nf-order-history-meta div { display:grid; gap:3px; min-width:0; }
.nf-order-history-meta span { font-size:11px; color:#76817c; text-transform:uppercase; letter-spacing:.04em; font-weight:800; }
.nf-order-history-meta strong { font-size:13px; color:#293d3a; overflow-wrap:anywhere; }
.nf-order-history-alert { padding:12px 14px; border:1px solid #e8d8bc; border-radius:12px; background:#fffaf0; color:#594824; display:grid; gap:4px; font-size:13px; line-height:1.5; }
.nf-order-history-alert strong { font-size:14px; }
.nf-order-history-actions { display:flex; flex-wrap:wrap; gap:8px; }
.nf-order-history-actions a.nf-commerce-btn { display:inline-flex; align-items:center; justify-content:center; text-decoration:none; box-sizing:border-box; }
.nf-order-history-detail { border-top:1px solid #eee8df; padding-top:12px; }
.nf-order-history-detail summary { font-size:13px; font-weight:800; cursor:pointer; color:#365e68; }
.nf-order-history-detail p { font-size:13px; line-height:1.5; color:#6f7571; margin:10px 0 0; }
.nf-order-history-item { display:flex; align-items:start; justify-content:space-between; gap:12px; padding:9px 0; border-bottom:1px solid #f0ede8; font-size:13px; }
.nf-order-history-item:last-child { border-bottom:none; }
.nf-order-history-item span { color:#39494a; }
.nf-order-history-item strong { white-space:nowrap; color:#283c45; }
@media(max-width:620px) {
  .nf-order-history-card { padding:14px; }
  .nf-order-history-meta { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .nf-order-history-header h4 { font-size:16px; }
  .nf-order-history-amount strong { font-size:18px; }
  .nf-order-history-actions > * { flex:1 1 100%; }
}


/* NF PARTNER REMINDER DEEP LINK V7 */
.nf-partner-reminder-entry { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; padding:15px 18px; border:1px solid #d8e5db; border-radius:14px; background:#f4f8f2; }
.nf-partner-reminder-entry h3 { margin:0 0 4px; font-size:17px; color:#2c3831; }
.nf-partner-reminder-entry p { margin:0; max-width:700px; font-size:13px; line-height:1.55; color:#526458; }
.nf-partner-reminder-entry-actions { display:flex; flex-wrap:wrap; gap:8px; }
@media(max-width:620px){ .nf-partner-reminder-entry-actions { width:100%; } .nf-partner-reminder-entry-actions button { flex:1 1 auto; } }

/* NF PARTNER SCHEDULE V6 */
.nf-partner-schedule { display:grid; gap:18px; }
.nf-schedule-intro { margin:0; color:#6b7674; line-height:1.6; max-width:760px; }
.nf-schedule-alert { background:#fff9ef; border:1px solid #ead9ba; border-radius:13px; padding:15px 17px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; }
.nf-schedule-alert strong { display:block; margin-bottom:3px; color:#594c32; font-size:14px; }
.nf-schedule-alert p { margin:0; color:#725e3c; font-size:13px; line-height:1.5; }
.nf-schedule-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
.nf-schedule-block { border:1px solid #e6e0d6; border-radius:16px; padding:19px; background:#fff; min-width:0; display:grid; gap:15px; align-content:start; }
.nf-schedule-block-header { display:grid; gap:5px; }
.nf-schedule-block-header h4 { margin:0; color:#2b302b; font-size:19px; }
.nf-schedule-block-header p { margin:0; color:#738079; font-size:13px; line-height:1.5; }
.nf-schedule-item { display:grid; gap:8px; padding:14px; border:1px solid #e8e1d5; border-radius:12px; background:#fcfbf8; }
.nf-schedule-item-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.nf-schedule-item-header strong { color:#2b302b; font-size:15px; }
.nf-schedule-item-header span { color:#8b7443; font-size:11px; font-weight:850; }
.nf-schedule-chip { display:inline-flex; width:max-content; max-width:100%; padding:5px 9px; border:1px solid #d8e3dc; border-radius:999px; background:#f3f7f3; font-size:12px; font-weight:800; color:#355c4c; }
.nf-schedule-chip[data-due="past"] { border-color:#edd5ae; background:#fff7e9; color:#8e652c; }
.nf-schedule-meta { color:#69766f; font-size:12px; line-height:1.5; }
.nf-schedule-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.nf-schedule-actions .nf-commerce-btn { text-decoration:none; display:inline-flex; justify-content:center; align-items:center; min-height:41px; box-sizing:border-box; }
.nf-schedule-empty { background:#fafaf8; padding:20px; border:1px dashed #e0e3dd; border-radius:12px; color:#6e7974; line-height:1.55; font-size:13px; }
.nf-schedule-empty p { margin:0 0 12px; }
.nf-schedule-footer { color:#687771; font-size:12px; line-height:1.6; border-top:1px solid #ece7de; padding-top:14px; }
.nf-schedule-setup { display:flex; gap:9px; flex-wrap:wrap; }
@media(max-width:760px) { .nf-schedule-columns { grid-template-columns:1fr; } .nf-schedule-block { padding:15px; } .nf-schedule-actions > .nf-commerce-btn { flex:1 1 auto; } }

`;

const programName = (row) =>
  PROGRAM_LABELS[row?.program_key] || row?.program?.label || row?.program_key;

const packageBuilder = (pkg) => pkg?.configuration_schema?.builder || "";

// NF PARTNER BUYING FLOW V3: show a safe, package-specific price preview
// using currently loaded partner prices. Final totals still come from checkout.
function partnerPackagePreviewCents(pkg, retailCatalog, giftPricing) {
  if (!pkg) return null;
  const builder = packageBuilder(pkg);
  if (builder === "retail_shelf") return retailPackageStartingCents(pkg, retailCatalog);
  const defaultQty = Number(pkg.default_quantity || pkg.minimum_quantity || 0);
  if (builder === "signature_six") {
    const tiers = pkg.configuration_schema?.price_tiers;
    const matching = Array.isArray(tiers) && tiers.find((tier) =>
      defaultQty >= Number(tier?.min || 0) &&
      (tier.max == null || defaultQty <= Number(tier.max)) &&
      Number(tier.unit_price_cents) > 0
    );
    const unit = Number(matching?.unit_price_cents || pkg.base_price_cents || 0);
    return defaultQty > 0 && unit > 0 ? defaultQty * unit : null;
  }
  if (builder === "business_gifting") {
    // No hardcoded gift pricing fallback in the preview.
    const known = [giftPricing?.bear_price_cents, giftPricing?.hex_price_cents]
      .map(Number).filter((amount) => Number.isFinite(amount) && amount > 0);
    return defaultQty > 0 && known.length ? Math.min(...known) * defaultQty : null;
  }
  if (pkg.price_mode === "fixed" && Number(pkg.base_price_cents) > 0) {
    return Number(pkg.base_price_cents);
  }
  if (builder === "foodservice") {
    // Show an advance subtotal only when each required line has an explicit
    // configured price. Otherwise, don't invent a quote from fallback rates.
    const lines = (pkg.items || []).filter((item) => item.category === "bulk");
    if (!lines.length || lines.some((item) => !(Number(item.unit_price_cents) > 0))) return null;
    return lines.reduce((sum, item) => sum + Number(item.unit_price_cents) * Number(item.quantity || 1), 0);
  }
  return null;
}


// NF RETAIL PACKAGE CLARITY V2: calculate a true catalog-based "from" price.
// Price is a preview only; checkout still validates actual rules on the server.
function retailPackageStartingCents(pkg, catalog) {
  if (packageBuilder(pkg) !== "retail_shelf") return null;
  const schema = pkg?.configuration_schema || {};
  const count = Number(schema.flavor_selection_count || pkg.flavor_selection_count || 0);
  const perFlavor = Number(schema.quantity_per_flavor || 6);
  const fixed = Array.isArray(schema.fixed_flavors) ? schema.fixed_flavors : [];
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(perFlavor) || perFlavor < 1) return null;
  if (fixed.length && fixed.length !== count) return null;
  const groups = new Map();
  for (const row of catalog || []) {
    if (pkg.allowed_size_ids?.length && !pkg.allowed_size_ids.includes(row.size_id)) continue;
    if (pkg.allowed_textures?.length && !pkg.allowed_textures.includes(row.texture)) continue;
    if (pkg.allowed_flavor_names?.length && !pkg.allowed_flavor_names.includes(row.flavor_name)) continue;
    const price = Number(row.unit_price_cents);
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = JSON.stringify([row.size_id, row.texture]);
    if (!groups.has(key)) groups.set(key, new Map());
    const flavors = groups.get(key);
    const flavorKey = String(row.flavor_name || row.flavor_id || "");
    if (!flavorKey) continue;
    const current = flavors.get(flavorKey);
    if (current == null || price < current) flavors.set(flavorKey, price);
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (const flavors of groups.values()) {
    const prices = fixed.length
      ? fixed.map((name) => flavors.get(String(name)))
      : [...flavors.values()].sort((a, b) => a - b).slice(0, count);
    if (prices.length !== count || prices.some((price) => !Number.isFinite(price) || price <= 0)) continue;
    const total = prices.reduce((sum, price) => sum + price * perFlavor, 0);
    minimum = Math.min(minimum, total);
  }
  return Number.isFinite(minimum) ? minimum : null;
}


const FOODSERVICE_SIZE_LABELS = {
  half_gallon: "1/2 Gallon",
  one_gallon: "1 Gallon",
  five_gallon: "5 Gallon",
};
/* PARTNER PROGRAM HARDENING V13 */
const FOODSERVICE_PRICE_FALLBACK = {
  half_gallon: { natural: 5500, infused: 6500 },
  one_gallon: { natural: 10000, infused: 12000 },
  five_gallon: { natural: 45000, infused: 55000 },
};
const itemRule = (item, key, fallback = null) =>
  item?.rules && Object.prototype.hasOwnProperty.call(item.rules, key)
    ? item.rules[key]
    : fallback;


// NF MY ORDERS PAYMENT-AWARE V5
// Never open an arbitrary URL from stored order data. Square link may expire;
// do not create a new payment link or order in this client-side helper.
function existingSquarePaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const allowed = ["square.link", "square.site", "squareup.com"];
    if (url.protocol !== "https:" || url.username || url.password) return "";
    const host = url.hostname.toLowerCase();
    return allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))
      ? url.href
      : "";
  } catch {
    return "";
  }
}

export default function PartnerCommerceWorkspace({ account, onSignOut, signOutBusy, onManagePassword }) {
  /* PARTNER PASSWORD SETUP V11.1 */
  const [section, setSection] = useState("dashboard");
  // NF PARTNER REMINDER DEEP LINK V7
  // Read the reminder identifier only after the partner has signed in; it is
  // not a permission grant and never creates an order automatically.
  const [reminderOrderId, setReminderOrderId] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("reorder") || "";
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw) && raw.length <= 80 ? raw : "";
  });

  const [programs, setPrograms] = useState([]);
  const [packages, setPackages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [retailCatalog, setRetailCatalog] = useState([]);
  const [giftPricing, setGiftPricing] = useState({});
  const [giftFlavors, setGiftFlavors] = useState([]);
  const [foodservicePricing, setFoodservicePricing] = useState(FOODSERVICE_PRICE_FALLBACK);
  const [foodserviceFlavors, setFoodserviceFlavors] = useState([]);
  const [activeProgram, setActiveProgram] = useState("");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [retailConfig, setRetailConfig] = useState({ sizeId: "", texture: "regular", flavorIds: [] });
  const [giftConfig, setGiftConfig] = useState({
    containerType: "hex",
    flavorId: "",
    quantity: "12",
    lidColor: "",
    dipper: false,
    thankYouTag: false,
    beeCharm: false,
    customLabel: false,
    customLabelNotes: "",
    recurring: false,
    cadence: "monthly",
    customIntervalDays: "30",
  });
  const [foodserviceConfig, setFoodserviceConfig] = useState({
    lines: {},
    recurring: false,
    cadence: "monthly",
    customIntervalDays: "30",
  });
  const [hiveConfig, setHiveConfig] = useState({
    sponsorDisplayName: account?.business_name || "",
    recognitionName: "",
    notes: "",
    annualRenewal: false,
  });
  const [profile, setProfile] = useState({
    businessName: account?.business_name || "",
    phone: account?.phone || "",
    addressLine1: account?.address_line1 || "",
    addressLine2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "MI",
    zip: account?.zip || "",
    deliveryNotes: account?.delivery_notes || "",
    buildingDetails: account?.building_details || "",
    gateAccessCode: account?.gate_access_code || "",
    preferredContactMethod: account?.preferred_contact_method || "text",
    preferredFulfillment: account?.preferred_fulfillment || getPartnerStoreFulfillment(),
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const approvedPrograms = useMemo(
    () => programs.filter((row) => row.status === "approved"),
    [programs]
  );

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [programRows, packageRows, orderRows, recurringRows] = await Promise.all([
        api.listMyPartnerPrograms(),
        api.listPartnerPackages(),
        api.listPartnerStoreOrders(),
        api.listPartnerRecurringOrders(),
      ]);
      setPrograms(programRows);
      setPackages(packageRows);
      setOrders(orderRows);
      setRecurring(recurringRows);

      const approved = programRows.filter((row) => row.status === "approved");
      const approvedKeys = new Set(approved.map((row) => row.program_key));
      const preferredProgram =
        approved.find((row) => row.program_key === "retail")?.program_key ||
        approved.find((row) => row.program_key === "business_gifting")?.program_key ||
        approved.find((row) => row.program_key === "foodservice")?.program_key ||
        "";
      const nextProgram = approvedKeys.has(activeProgram) ? activeProgram : preferredProgram;
      if (nextProgram !== activeProgram) setActiveProgram(nextProgram);

      if (approved.some((row) => row.program_key === "retail")) {
        setRetailCatalog(await api.getPartnerRetailPackageCatalog());
      }
      if (approved.some((row) => row.program_key === "business_gifting")) {
        const [pricing, flavors] = await Promise.all([
          api.getPartnerGiftPricing(),
          api.listPartnerPackageFlavorOptions(),
        ]);
        setGiftPricing(pricing || {});
        setGiftFlavors(flavors || []);
      }
      if (approved.some((row) => row.program_key === "foodservice")) {
        const [pricing, flavors] = await Promise.all([
          api.getPartnerFoodservicePricing(),
          api.listPartnerPackageFlavorOptions(),
        ]);
        setFoodservicePricing({
          half_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.half_gallon,
            ...(pricing?.half_gallon || {}),
          },
          one_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.one_gallon,
            ...(pricing?.one_gallon || {}),
          },
          five_gallon: {
            ...FOODSERVICE_PRICE_FALLBACK.five_gallon,
            ...(pricing?.five_gallon || {}),
          },
        });
        setFoodserviceFlavors(flavors || []);
      }
    } catch (loadError) {
      setError(loadError?.message || "The partner commerce workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setProfile({
      businessName: account?.business_name || "",
      phone: account?.phone || "",
      addressLine1: account?.address_line1 || "",
      addressLine2: account?.address_line2 || "",
      city: account?.city || "",
      state: account?.state || "MI",
      zip: account?.zip || "",
      deliveryNotes: account?.delivery_notes || "",
      buildingDetails: account?.building_details || "",
      gateAccessCode: account?.gate_access_code || "",
      preferredContactMethod: account?.preferred_contact_method || "text",
      preferredFulfillment: account?.preferred_fulfillment || getPartnerStoreFulfillment(),
    });
  }, [account]);

  const packageRows = useMemo(
    () => packages.filter((pkg) => pkg.program_key === activeProgram),
    [packages, activeProgram]
  );

  const lastOrder = orders.find((order) => order.paid === true && order.status === "fulfilled") || null;

  // NF PARTNER SCHEDULE V6
  // Payment must be confirmed and fulfillment completed before suggesting
  // another order. Prevent duplicate suggestions when a replacement exists.
  const unpaidPartnerOrders = orders.filter((order) =>
    order.paid !== true && order.status !== "cancelled"
  );
  // NF PARTNER REMINDER DEEP LINK V7
  const suggestedRestocks = suggestedPartnerRestocks(orders);
  const reminderResult = resolvePartnerReminderOrder(orders, reminderOrderId);
  const dismissReminderLink = () => {
    setReminderOrderId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("reorder");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const michiganDayKey = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  })();
  const repeatPurchasePrograms = approvedPrograms.filter((program) =>
    ["foodservice", "business_gifting"].includes(program.program_key)
  );

  const lastFulfilled = orders.find((order) => order.status === "fulfilled") || null;
  const openOrder = orders.find((order) => !["fulfilled", "cancelled"].includes(order.status)) || null;
  const nextScheduledOrder = [...recurring]
    .filter((item) => item.next_order_on && !["paused", "cancelled"].includes(item.status))
    .sort((a, b) => String(a.next_order_on).localeCompare(String(b.next_order_on)))[0] || null;

  const selectPackage = (pkg) => {
    setSelectedPackage(pkg);
    setError("");
    setNotice("");

    if (packageBuilder(pkg) === "retail_shelf") {
      const schema = pkg.configuration_schema || {};
      const fixedNames = Array.isArray(schema.fixed_flavors) ? schema.fixed_flavors : [];
      const eligible = retailCatalog.filter((row) =>
        (!pkg.allowed_size_ids?.length || pkg.allowed_size_ids.includes(row.size_id)) &&
        (!pkg.allowed_textures?.length || pkg.allowed_textures.includes(row.texture)) &&
        (!pkg.allowed_flavor_names?.length || pkg.allowed_flavor_names.includes(row.flavor_name))
      );
      const first = eligible[0];
      const sizeId = first?.size_id || pkg.allowed_size_ids?.[0] || "";
      const texture = eligible.find((row) => row.size_id === sizeId && row.texture === "regular")?.texture ||
        eligible.find((row) => row.size_id === sizeId)?.texture || "regular";
      const availableFixedIds = fixedNames.map((name) => eligible.find(
        (row) => row.flavor_name === name && row.size_id === sizeId && row.texture === texture
      )?.flavor_id).filter(Boolean);
      setRetailConfig({
        sizeId,
        texture,
        flavorIds: fixedNames.length ? availableFixedIds : [],
      });
    }

    if (packageBuilder(pkg) === "business_gifting") {
      const allowed = giftFlavors.filter((flavor) =>
        !pkg.allowed_flavor_names?.length || pkg.allowed_flavor_names.includes(flavor.name)
      );
      setGiftConfig((current) => ({
        ...current,
        containerType: "hex",
        flavorId: allowed[0]?.id || "",
        quantity: String(pkg.default_quantity || pkg.minimum_quantity || 12),
        lidColor: "",
        dipper: false,
        thankYouTag: false,
        beeCharm: false,
        customLabel: false,
        customLabelNotes: "",
        recurring: false,
        cadence: "monthly",
        customIntervalDays: "30",
      }));
    }

    if (packageBuilder(pkg) === "signature_six") {
      setGiftConfig((current) => ({
        ...current,
        containerType: "hex",
        flavorId: "",
        quantity: String(pkg.default_quantity || pkg.minimum_quantity || 12),
        lidColor: "",
        dipper: false,
        thankYouTag: false,
        beeCharm: false,
        customLabel: false,
        customLabelNotes: "",
        recurring: false,
        cadence: "monthly",
        customIntervalDays: "30",
      }));
    }

    if (packageBuilder(pkg) === "foodservice") {
      const allowed = foodserviceFlavors.filter((flavor) =>
        !pkg.allowed_flavor_names?.length || pkg.allowed_flavor_names.includes(flavor.name)
      );
      const lines = {};
      (pkg.items || []).filter((item) => item.category === "bulk").forEach((item) => {
        const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
        const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : "infused";
        const fixedFlavor = item.flavor_id
          ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
          : item.flavor_name
            ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
            : null;
        lines[item.id] = {
          honeyType,
          flavorId: honeyType === "infused" ? (fixedFlavor?.id || allowed[0]?.id || "") : "",
        };
      });
      setFoodserviceConfig({ lines, recurring: false, cadence: "monthly", customIntervalDays: "30" });
    }

    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: account?.public_name || account?.business_name || "",
        recognitionName: "",
        notes: "",
        annualRenewal: pkg.recurring_allowed === true,
      });
    }

    requestAnimationFrame(() => {
      document.getElementById("nf-package-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const retailOptions = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "retail_shelf") return [];
    return retailCatalog.filter((row) =>
      (!selectedPackage.allowed_size_ids?.length || selectedPackage.allowed_size_ids.includes(row.size_id)) &&
      (!selectedPackage.allowed_textures?.length || selectedPackage.allowed_textures.includes(row.texture)) &&
      (!selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(row.flavor_name))
    );
  }, [selectedPackage, retailCatalog]);

  const retailEligibleOptions = retailOptions.filter((row) =>
    row.size_id === retailConfig.sizeId && row.texture === retailConfig.texture
  );
  const retailFlavors = uniqueBy(retailEligibleOptions, "flavor_id");
  const retailSizes = uniqueBy(retailOptions, "size_id");
  const retailTextures = uniqueBy(retailOptions.filter((row) => row.size_id === retailConfig.sizeId), "texture");

  const retailRequiredFlavors = Number(
    selectedPackage?.configuration_schema?.flavor_selection_count ||
    selectedPackage?.flavor_selection_count ||
    0
  );
  const retailQtyPerFlavor = Number(selectedPackage?.configuration_schema?.quantity_per_flavor || 6);
  const retailFixed = (selectedPackage?.configuration_schema?.fixed_flavors || []).length > 0;

  const retailSelectedRows = retailConfig.flavorIds.map((flavorId) =>
    retailEligibleOptions.find((item) => item.flavor_id === flavorId) || null
  );
  const retailComplete = retailRequiredFlavors > 0 &&
    retailSelectedRows.length === retailRequiredFlavors &&
    retailSelectedRows.every((row) => row && Number(row.unit_price_cents) > 0);
  const retailPrice = retailComplete
    ? retailSelectedRows.reduce((sum, row) => sum + Number(row.unit_price_cents) * retailQtyPerFlavor, 0)
    : null;
  const retailMissing = Math.max(0, retailRequiredFlavors - retailConfig.flavorIds.length);

  const toggleRetailFlavor = (flavorId) => {
    if (retailFixed) return;
    setRetailConfig((current) => {
      if (current.flavorIds.includes(flavorId)) {
        return { ...current, flavorIds: current.flavorIds.filter((id) => id !== flavorId) };
      }
      if (current.flavorIds.length >= retailRequiredFlavors) return current;
      return { ...current, flavorIds: [...current.flavorIds, flavorId] };
    });
  };

  const addRetailPackage = () => {
    if (!selectedPackage) return;
    if (retailConfig.flavorIds.length !== retailRequiredFlavors) {
      setError(`Choose exactly ${retailRequiredFlavors} flavors for ${selectedPackage.name}.`);
      return;
    }

    const rows = retailConfig.flavorIds.map((flavorId) =>
      retailOptions.find(
        (row) => row.flavor_id === flavorId && row.size_id === retailConfig.sizeId && row.texture === retailConfig.texture
      )
    );
    if (rows.some((row) => !row || !(Number(row.unit_price_cents) > 0))) {
      setError("One of the selected flavors or prices is unavailable for this jar size. Choose a different combination.");
      return;
    }

    const configuration = {
      builder: "retail_shelf",
      size_id: retailConfig.sizeId,
      texture: retailConfig.texture,
      flavor_ids: retailConfig.flavorIds,
      flavor_names: rows.map((row) => row.flavor_name),
      quantity_per_flavor: retailQtyPerFlavor,
    };

    setPartnerStoreCart(
      rows.map((row) => ({
        id: `package:${selectedPackage.id}:retail:${row.flavor_id}:${row.size_id}:${row.texture}`,
        category: "retail",
        flavorId: row.flavor_id,
        flavorName: row.flavor_name,
        sizeId: row.size_id,
        sizeLabel: row.size_label,
        texture: row.texture,
        quantity: retailQtyPerFlavor,
        unitPriceCents: row.unit_price_cents,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      }))
    );
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const giftUnitPrice =
    giftConfig.containerType === "hex"
      ? Number(giftPricing?.hex_price_cents || 300)
      : Number(giftPricing?.bear_price_cents || 250);
  const giftQty = Number(selectedPackage?.default_quantity || selectedPackage?.configuration_schema?.gift_quantity || 0);
  const giftAddonUnit = Number(giftPricing?.addon_unit_price_cents || 50);
  const selectedAddonCount = [giftConfig.dipper, giftConfig.thankYouTag, giftConfig.beeCharm].filter(Boolean).length;
  const giftPrice = giftQty * giftUnitPrice + giftQty * giftAddonUnit * selectedAddonCount + (giftConfig.customLabel ? Number(giftPricing?.custom_label_flat_cents || 3000) : 0);

  const addGiftPackage = () => {
    if (!selectedPackage || !giftConfig.flavorId) {
      setError("Choose a flavor for this business gifting package.");
      return;
    }
    const flavor = giftFlavors.find((item) => item.id === giftConfig.flavorId);
    if (!flavor) {
      setError("The selected flavor is no longer available.");
      return;
    }

    const configuration = {
      builder: "business_gifting",
      quantity: giftQty,
      container_type: giftConfig.containerType,
      flavor_id: flavor.id,
      flavor_name: flavor.name,
      custom_label: giftConfig.customLabel,
      addons: {
        dipper: giftConfig.dipper,
        thank_you_tag: giftConfig.thankYouTag,
        bee_charm: giftConfig.beeCharm,
      },
      recurring: giftConfig.recurring,
      cadence: giftConfig.recurring ? giftConfig.cadence : null,
      custom_interval_days:
        giftConfig.recurring && giftConfig.cadence === "custom"
          ? Number(giftConfig.customIntervalDays || 30)
          : null,
    };

    const items = [
      {
        id: `package:${selectedPackage.id}:gift:${giftConfig.containerType}:${flavor.id}`,
        category: "gift",
        containerType: giftConfig.containerType,
        containerLabel: giftConfig.containerType === "hex" ? "2 oz Glass Hexagon" : "2 oz Plastic Bear",
        flavorId: flavor.id,
        flavorName: flavor.name,
        lidColor: giftConfig.lidColor,
        quantity: giftQty,
        unitPriceCents: giftUnitPrice,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      },
    ];

    [
      ["dipper", giftConfig.dipper, "Wood honey dipper"],
      ["thank_you_tag", giftConfig.thankYouTag, "Thank You tag"],
      ["bee_charm", giftConfig.beeCharm, "Bee charm"],
    ].forEach(([addonType, enabled, name]) => {
      if (!enabled) return;
      items.push({
        id: `package:${selectedPackage.id}:gift_addon:${addonType}`,
        category: "gift_addon",
        addonType,
        name,
        containerType: giftConfig.containerType,
        quantity: giftQty,
        unitPriceCents: giftAddonUnit,
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      });
    });

    if (giftConfig.customLabel) {
      items.push({
        id: `package:${selectedPackage.id}:custom_label`,
        category: "custom_label",
        name: "Custom design + printing & labeling",
        notes: giftConfig.customLabelNotes || "Custom label requested from package checkout.",
        labelExamples: [],
        quantity: 1,
        unitPriceCents: Number(giftPricing?.custom_label_flat_cents || 3000),
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      });
    }

    setPartnerStoreCart(items);
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };


  const signatureSchema =
    selectedPackage && packageBuilder(selectedPackage) === "signature_six"
      ? selectedPackage.configuration_schema || {}
      : {};
  const signatureFlavorNames = [
    ...(Array.isArray(signatureSchema.signature_flavors)
      ? signatureSchema.signature_flavors
      : []),
    signatureSchema.seasonal_flavor,
  ].filter(Boolean);
  const signatureFlavorRows = signatureFlavorNames
    .map((name) => giftFlavors.find((flavor) => flavor.name === name))
    .filter(Boolean);
  const signatureBoxQty = Math.max(0, Number.parseInt(giftConfig.quantity, 10) || 0);
  const signaturePriceTiers = Array.isArray(signatureSchema.price_tiers)
    ? signatureSchema.price_tiers
    : [];
  const signatureTier = signaturePriceTiers.find((tier) => {
    const min = Number(tier?.min || 0);
    const max = tier?.max == null ? Number.POSITIVE_INFINITY : Number(tier.max);
    return signatureBoxQty >= min && signatureBoxQty <= max;
  });
  const signatureUnitPrice = Number(
    signatureTier?.unit_price_cents ||
      selectedPackage?.base_price_cents ||
      3200
  );
  const signatureHoneyUnit =
    Number(giftPricing?.hex_price_cents || 300) *
    Number(signatureSchema.jars_per_box || 6);
  const signaturePresentationUnit = Math.max(
    0,
    signatureUnitPrice - signatureHoneyUnit
  );
  const signaturePrice =
    signatureBoxQty * signatureUnitPrice +
    (giftConfig.customLabel
      ? Number(giftPricing?.custom_label_flat_cents || 3000)
      : 0);

  const addSignatureSixPackage = () => {
    if (!selectedPackage) return;

    const minimum = Number(
      signatureSchema.minimum_boxes || selectedPackage.minimum_quantity || 12
    );
    const customQuoteMin = Number(signatureSchema.custom_quote_min || 100);
    if (signatureBoxQty < minimum) {
      setError(`Signature Six business gifting starts at ${minimum} gift boxes.`);
      return;
    }
    if (signatureBoxQty >= customQuoteMin) {
      setError(
        `For ${customQuoteMin}+ Signature Six boxes, use the custom-request area so NectarFusions can coordinate volume pricing and presentation.`
      );
      return;
    }
    if (
      signatureFlavorRows.length !==
      Number(signatureSchema.jars_per_box || 6)
    ) {
      setError(
        "One of the Signature Six flavors is unavailable. NectarFusions needs to update the current seasonal collection."
      );
      return;
    }

    const configuration = {
      builder: "signature_six",
      box_quantity: signatureBoxQty,
      jars_per_box: Number(signatureSchema.jars_per_box || 6),
      flavor_names: signatureFlavorRows.map((flavor) => flavor.name),
      seasonal_flavor: signatureSchema.seasonal_flavor || null,
      custom_label: giftConfig.customLabel,
      recurring: giftConfig.recurring,
      cadence: giftConfig.recurring ? giftConfig.cadence : null,
      custom_interval_days:
        giftConfig.recurring && giftConfig.cadence === "custom"
          ? Number(giftConfig.customIntervalDays || 30)
          : null,
    };

    const items = signatureFlavorRows.map((flavor) => ({
      id: `package:${selectedPackage.id}:signature-six:${flavor.id}`,
      category: "gift",
      containerType: "hex",
      containerLabel: "2 oz Glass Hexagon",
      flavorId: flavor.id,
      flavorName: flavor.name,
      lidColor: "",
      quantity: signatureBoxQty,
      unitPriceCents: Number(giftPricing?.hex_price_cents || 300),
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    }));

    items.push({
      id: `package:${selectedPackage.id}:signature-presentation`,
      category: "gift_addon",
      addonType: "signature_presentation",
      name: "Signature Six presentation & curation",
      containerType: "hex",
      quantity: signatureBoxQty,
      unitPriceCents: signaturePresentationUnit,
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    });

    if (giftConfig.customLabel) {
      items.push({
        id: `package:${selectedPackage.id}:signature-insert`,
        category: "custom_label",
        name: "Signature Six branded insert setup",
        purpose: "signature_insert",
        notes:
          giftConfig.customLabelNotes ||
          "Branded Signature Six gift insert requested.",
        labelExamples: [],
        quantity: 1,
        unitPriceCents: Number(giftPricing?.custom_label_flat_cents || 3000),
        packageId: selectedPackage.id,
        packageKey: selectedPackage.package_key,
        packageName: selectedPackage.name,
        programKey: selectedPackage.program_key,
        packageConfiguration: configuration,
      });
    }

    setPartnerStoreCart(items);
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const foodserviceItems = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "foodservice") return [];
    return [...(selectedPackage.items || [])]
      .filter((item) => item.category === "bulk")
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  }, [selectedPackage]);

  const foodserviceAllowedFlavors = useMemo(() => {
    if (!selectedPackage) return [];
    return foodserviceFlavors.filter((flavor) =>
      !selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(flavor.name)
    );
  }, [selectedPackage, foodserviceFlavors]);

  const foodserviceUnitPrice = (item, honeyType) => {
    if (item?.unit_price_cents != null && Number.isFinite(Number(item.unit_price_cents))) {
      return Number(item.unit_price_cents);
    }
    return Number(foodservicePricing?.[item?.size_id]?.[honeyType] || 0);
  };

  const foodservicePrice = foodserviceItems.reduce((sum, item) => {
    const line = foodserviceConfig.lines[item.id] || {};
    const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
    const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
    return sum + foodserviceUnitPrice(item, honeyType) * Number(item.quantity || 1);
  }, 0);

  const updateFoodserviceLine = (itemId, patch) => {
    setFoodserviceConfig((current) => ({
      ...current,
      lines: {
        ...current.lines,
        [itemId]: { ...(current.lines[itemId] || {}), ...patch },
      },
    }));
  };

  const addFoodservicePackage = () => {
    if (!selectedPackage || !foodserviceItems.length) {
      setError("This Foodservice package does not have package contents yet. NectarFusions can finish it in Admin → Partner Commerce → Packages.");
      return;
    }

    const configured = foodserviceItems.map((item) => {
      const line = foodserviceConfig.lines[item.id] || {};
      const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
      const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
      const fixedFlavor = item.flavor_id
        ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
        : item.flavor_name
          ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
          : null;
      const flavor = honeyType === "infused"
        ? fixedFlavor || foodserviceAllowedFlavors.find((row) => row.id === line.flavorId)
        : null;
      return { item, honeyType, flavor };
    });

    if (configured.some((line) => line.honeyType === "infused" && !line.flavor)) {
      setError("Choose a flavor for every infused Foodservice line in this package.");
      return;
    }

    const uniqueRequired = selectedPackage.configuration_schema?.unique_flavors !== false && Number(selectedPackage.flavor_selection_count || 0) > 1;
    const selectedFlavorIds = configured.filter((line) => line.flavor).map((line) => line.flavor.id);
    if (uniqueRequired && new Set(selectedFlavorIds).size !== selectedFlavorIds.length) {
      setError("Choose different flavors for each Foodservice flavor selection in this package.");
      return;
    }

    const configuration = {
      builder: "foodservice",
      lines: configured.map(({ item, honeyType, flavor }) => ({
        package_item_id: item.id,
        product_key: item.product_key,
        size_id: item.size_id,
        quantity: Number(item.quantity || 1),
        honey_type: honeyType,
        flavor_id: flavor?.id || null,
        flavor_name: flavor?.name || null,
      })),
      recurring: foodserviceConfig.recurring === true,
      cadence: foodserviceConfig.recurring ? foodserviceConfig.cadence : null,
      custom_interval_days:
        foodserviceConfig.recurring && foodserviceConfig.cadence === "custom"
          ? Number(foodserviceConfig.customIntervalDays || 30)
          : null,
    };

    setPartnerStoreCart(configured.map(({ item, honeyType, flavor }) => ({
      id: `package:${selectedPackage.id}:foodservice:${item.id}`,
      category: "bulk",
      honeyType,
      flavorId: flavor?.id || null,
      flavorName: flavor?.name || null,
      sizeId: item.size_id,
      sizeLabel: itemRule(item, "label", FOODSERVICE_SIZE_LABELS[item.size_id] || item.size_id || "Foodservice"),
      quantity: Number(item.quantity || 1),
      unitPriceCents: foodserviceUnitPrice(item, honeyType),
      packageItemId: item.id,
      packageProductKey: item.product_key,
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    })));
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const hiveItems = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "hive_sponsorship") return [];
    return [...(selectedPackage.items || [])]
      .filter((item) => item.category === "sponsorship")
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
  }, [selectedPackage]);

  const hivePrice = useMemo(() => {
    if (!selectedPackage || packageBuilder(selectedPackage) !== "hive_sponsorship") return 0;
    if (selectedPackage.price_mode === "fixed" && selectedPackage.base_price_cents != null) {
      return Number(selectedPackage.base_price_cents || 0);
    }
    return hiveItems.reduce((sum, item) => sum + Number(item.unit_price_cents || 0) * Number(item.quantity || 1), 0);
  }, [selectedPackage, hiveItems]);

  const hiveBenefits = useMemo(() => {
    const values = [];
    const add = (value) => {
      if (Array.isArray(value)) value.forEach(add);
      else if (String(value || "").trim()) values.push(String(value).trim());
    };
    add(selectedPackage?.configuration_schema?.benefits);
    hiveItems.forEach((item) => add(itemRule(item, "benefits", [])));
    return [...new Set(values)];
  }, [selectedPackage, hiveItems]);

  const addHivePackage = () => {
    if (!selectedPackage) return;
    if (!hivePrice || hivePrice < 1) {
      setError("This Hive Partner package still needs an annual price in Admin before it can be purchased.");
      return;
    }

    const configuration = {
      builder: "hive_sponsorship",
      sponsor_display_name: hiveConfig.sponsorDisplayName.trim(),
      recognition_name: hiveConfig.recognitionName.trim() || null,
      notes: hiveConfig.notes.trim() || null,
      recurring: hiveConfig.annualRenewal === true,
      cadence: hiveConfig.annualRenewal === true ? "annual" : null,
    };

    setPartnerStoreCart([{
      id: `package:${selectedPackage.id}:sponsorship`,
      category: "sponsorship",
      name: selectedPackage.name,
      productKey: selectedPackage.package_key,
      quantity: 1,
      unitPriceCents: hivePrice,
      sponsorDisplayName: configuration.sponsor_display_name,
      recognitionName: configuration.recognition_name,
      notes: configuration.notes,
      packageId: selectedPackage.id,
      packageKey: selectedPackage.package_key,
      packageName: selectedPackage.name,
      programKey: selectedPackage.program_key,
      packageConfiguration: configuration,
    }]);
    setError("");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const modifyOrder = (order) => {
    const pkg = packages.find((row) => row.id === order.package_id);
    if (!pkg) {
      setError("That original package is no longer active. Choose a current package instead.");
      setSection("packages");
      return;
    }

    const requested = order.configuration_snapshot?.requested || {};
    setActiveProgram(pkg.program_key);
    setSection("packages");
    selectPackage(pkg);

    if (packageBuilder(pkg) === "retail_shelf") {
      setRetailConfig({
        sizeId: requested.size_id || order.items?.find((item) => item.category === "retail")?.size_id || "",
        texture: requested.texture || order.items?.find((item) => item.category === "retail")?.texture || "regular",
        flavorIds:
          requested.flavor_ids ||
          order.items?.filter((item) => item.category === "retail").map((item) => item.flavor_id).filter(Boolean) ||
          [],
      });
    }

    if (packageBuilder(pkg) === "business_gifting") {
      setGiftConfig((current) => ({
        ...current,
        containerType: requested.container_type || current.containerType,
        flavorId: requested.flavor_id || current.flavorId,
        customLabel: requested.custom_label === true,
        dipper: requested.addons?.dipper === true,
        thankYouTag: requested.addons?.thank_you_tag === true,
        beeCharm: requested.addons?.bee_charm === true,
        recurring: requested.recurring === true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      }));
    }
    if (packageBuilder(pkg) === "foodservice") {
      const lineMap = Object.fromEntries((requested.lines || []).map((line) => [line.package_item_id, { honeyType: line.honey_type || "infused", flavorId: line.flavor_id || "" }]));
      setFoodserviceConfig({
        lines: lineMap,
        recurring: requested.recurring === true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      });
    }
    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: requested.sponsor_display_name || account?.public_name || account?.business_name || "",
        recognitionName: requested.recognition_name || "",
        notes: requested.notes || "",
      });
    }
  };

  const reorder = (order) => {
    if (!order?.items?.length) return;
    const snapshot = order.configuration_snapshot || {};
    const requestedConfiguration =
      snapshot?.requested && typeof snapshot.requested === "object"
        ? snapshot.requested
        : snapshot;
    const packageMeta = {
      packageId: order.package_id || order.package_snapshot?.id || null,
      packageKey: order.package_snapshot?.package_key || null,
      packageName: order.package_snapshot?.name || "Previous order",
      programKey: order.program_key || order.package_snapshot?.program_key || null,
      packageConfiguration: requestedConfiguration,
      reorderOfOrderId: order.id,
    };

    const items = order.items.map((item) => {
      const common = {
        id: `reorder:${order.id}:${item.id}`,
        category: item.category,
        quantity: Number(item.quantity || 0),
        unitPriceCents: Number(item.unit_price_cents || 0),
        ...packageMeta,
      };
      if (item.category === "retail") return {
        ...common,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        sizeId: item.size_id,
        sizeLabel: item.size_label,
        texture: item.texture,
      };
      if (item.category === "bulk") return {
        ...common,
        honeyType: item.details?.honey_type,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        sizeId: item.size_id,
        sizeLabel: item.size_label,
        packageItemId: item.details?.package_item_id || null,
        packageProductKey: item.details?.package_product_key || null,
      };
      if (item.category === "gift") return {
        ...common,
        containerType: item.details?.container_type || item.product_key,
        containerLabel: item.details?.container_label || item.size_label,
        flavorId: item.flavor_id,
        flavorName: item.flavor_name,
        lidColor: item.details?.lid_color || "",
      };
      if (item.category === "gift_addon") return {
        ...common,
        addonType: item.product_key,
        name: item.size_label,
        containerType: item.details?.container_type || null,
      };
      if (item.category === "sponsorship") return {
        ...common,
        name: item.size_label || order.package_snapshot?.name || "Hive Partner sponsorship",
        productKey: item.product_key,
        sponsorDisplayName: item.details?.sponsor_display_name || "",
        recognitionName: item.details?.recognition_name || "",
        notes: item.details?.notes || "",
      };
      return {
        ...common,
        name: item.size_label || "Custom Labels",
        notes: item.details?.notes || "",
        labelExamples: item.details?.label_examples || [],
      };
    });

    setPartnerStoreCart(items);
    setPartnerStoreFulfillment(order.fulfillment_method || "pickup");
    window.dispatchEvent(new Event("nf-open-partner-cart"));
  };

  const manageRecurring = async (item, action) => {
    setBusy(`recurring:${item.id}:${action}`);
    setError("");
    setNotice("");
    try {
      await api.manageMyPartnerRecurringOrder(item.id, action);
      setNotice(
        action === "skip"
          ? (item.program_key === "hive_partners" ? "This renewal cycle was skipped." : "The next recurring order was skipped.")
          : action === "pause"
            ? "Recurring ordering paused."
            : "Recurring ordering resumed."
      );
      await refresh();
    } catch (recurringError) {
      setError(recurringError?.message || "The recurring order could not be updated.");
    } finally {
      setBusy("");
    }
  };

  const editRecurring = (item) => {
    const pkg = packages.find((row) => row.id === item.package_id);
    if (!pkg) {
      setError("That package is no longer active. NectarFusions can update this recurring order for you.");
      return;
    }

    const requested = item.configuration_snapshot?.requested || {};
    setActiveProgram(item.program_key);
    setSection("packages");
    selectPackage(pkg);

    if (packageBuilder(pkg) === "business_gifting") {
      setGiftConfig((current) => ({
        ...current,
        containerType: requested.container_type || current.containerType,
        flavorId: requested.flavor_id || current.flavorId,
        customLabel: requested.custom_label === true,
        dipper: requested.addons?.dipper === true,
        thankYouTag: requested.addons?.thank_you_tag === true,
        beeCharm: requested.addons?.bee_charm === true,
        recurring: true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      }));
    }
    if (packageBuilder(pkg) === "foodservice") {
      setFoodserviceConfig({
        lines: Object.fromEntries((requested.lines || []).map((line) => [line.package_item_id, { honeyType: line.honey_type || "infused", flavorId: line.flavor_id || "" }])),
        recurring: true,
        cadence: requested.cadence || "monthly",
        customIntervalDays: String(requested.custom_interval_days || 30),
      });
    }
    if (packageBuilder(pkg) === "hive_sponsorship") {
      setHiveConfig({
        sponsorDisplayName: requested.sponsor_display_name || account?.public_name || account?.business_name || "",
        recognitionName: requested.recognition_name || "",
        notes: requested.notes || "",
        annualRenewal: true,
      });
    }
  };

  const saveProfile = async () => {
    setBusy("profile");
    setError("");
    setNotice("");
    try {
      await api.updateMyPartnerFulfillmentProfile(profile);
      setPartnerStoreFulfillment(profile.preferredFulfillment);
      window.dispatchEvent(
        new CustomEvent("nf-partner-delivery-profile-changed", {
          detail: profile,
        })
      );
      setNotice("Delivery and pickup preferences saved.");
    } catch (saveError) {
      setError(saveError?.message || "The fulfillment profile could not be saved.");
    } finally {
      setBusy("");
    }
  };

  const renderRetailBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Configure package</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field">
          <label>Jar size</label>
          <select value={retailConfig.sizeId} onChange={(event) => setRetailConfig((current) => {
            const sizeId = event.target.value;
            const available = retailOptions.filter((row) => row.size_id === sizeId);
            const texture = available.some((row) => row.texture === current.texture)
              ? current.texture : available[0]?.texture || "regular";
            const fixedNames = selectedPackage?.configuration_schema?.fixed_flavors || [];
            const flavorIds = retailFixed
              ? fixedNames.map((name) => available.find((row) =>
                  row.texture === texture && row.flavor_name === name)?.flavor_id).filter(Boolean)
              : current.flavorIds.filter((id) => available.some((row) =>
                  row.texture === texture && row.flavor_id === id));
            return { ...current, sizeId, texture, flavorIds };
          })}>
            {retailSizes.map((row) => <option key={row.size_id} value={row.size_id}>{row.size_label}</option>)}
          </select>
        </div>
        <div className="nf-commerce-field">
          <label>Texture</label>
          <select value={retailConfig.texture} onChange={(event) => setRetailConfig((current) => ({
            ...current,
            texture: event.target.value,
            flavorIds: retailFixed
              ? (selectedPackage?.configuration_schema?.fixed_flavors || []).map((name) =>
                  retailOptions.find((row) => row.size_id === current.sizeId &&
                    row.texture === event.target.value && row.flavor_name === name)?.flavor_id
                ).filter(Boolean)
              : current.flavorIds.filter((id) => retailOptions.some((row) =>
                  row.size_id === current.sizeId && row.texture === event.target.value && row.flavor_id === id)),
          }))}>
            {retailTextures.length ? retailTextures.map((row) => <option key={row.texture} value={row.texture}>{row.texture === "spun" ? "Spun" : "Regular"}</option>) : <option value="regular">Regular</option>}
          </select>
        </div>
      </div>

      <div>
        <div className="nf-commerce-choice-label">
          {retailFixed ? "Included core flavors" : `Choose ${retailRequiredFlavors} flavors`} · {retailQtyPerFlavor} jars each
        </div>
        <div className="nf-commerce-choice-grid" style={{ marginTop: 8 }}>
          {retailFlavors.map((row) => (
            <button
              type="button"
              className="nf-commerce-choice"
              key={row.flavor_id}
              aria-pressed={retailConfig.flavorIds.includes(row.flavor_id)}
              disabled={retailFixed}
              onClick={() => toggleRetailFlavor(row.flavor_id)}
            >
              {row.flavor_name}
            </button>
          ))}
        </div>
        <div className="nf-commerce-retail-progress" data-complete={retailComplete} role="status" aria-live="polite">
          {retailComplete
            ? `${retailRequiredFlavors} of ${retailRequiredFlavors} flavors selected. Ready to review your order.`
            : retailFixed
              ? "One or more included flavors or prices are unavailable for this jar size. Please contact NectarFusions."
              : retailMissing > 0
              ? `${retailConfig.flavorIds.length} of ${retailRequiredFlavors} flavors selected. Choose ${retailMissing} more to continue.`
              : "A selected flavor is not available for this size or texture. Please adjust your selection."}
        </div>
      </div>

      <div className="nf-commerce-builder-total">
        <div>
          <span>{selectedPackage.default_quantity} jars · {retailComplete ? "current partner pricing" : "choose your flavors to calculate the total"}</span>
          {retailComplete
            ? <strong>{money(retailPrice)}</strong>
            : <strong className="nf-commerce-price-pending">Total available after selection</strong>}
        </div>
        <button className="nf-commerce-btn primary" type="button" disabled={!retailComplete} onClick={addRetailPackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderGiftBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Individual Business Gifting</div>
          <h3>{selectedPackage.name}</h3>
          <p>{giftQty} individual ready-to-gift NectarFusions honeys. These do not come in a multi-jar gift box. Choose Signature Six when you want the showcased six-honey gift box.</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field">
          <label>Container</label>
          <select value={giftConfig.containerType} onChange={(event) => setGiftConfig((current) => ({ ...current, containerType: event.target.value }))}>
            <option value="bear">2 oz Plastic Bear</option>
            <option value="hex">2 oz Glass Hexagon</option>
          </select>
        </div>
        <div className="nf-commerce-field">
          <label>Flavor</label>
          <select value={giftConfig.flavorId} onChange={(event) => setGiftConfig((current) => ({ ...current, flavorId: event.target.value }))}>
            {giftFlavors.filter((flavor) => !selectedPackage.allowed_flavor_names?.length || selectedPackage.allowed_flavor_names.includes(flavor.name)).map((flavor) => (
              <option key={flavor.id} value={flavor.id}>{flavor.name}</option>
            ))}
          </select>
        </div>
        {giftConfig.containerType === "bear" && (
          <div className="nf-commerce-field">
            <label>Lid color</label>
            <input value={giftConfig.lidColor} onChange={(event) => setGiftConfig((current) => ({ ...current, lidColor: event.target.value }))} placeholder="Optional color request" />
          </div>
        )}
        <div className="nf-commerce-field full">
          <label>Finishing options</label>
          <div className="nf-commerce-choice-grid">
            {[
              ["dipper", "Honey dipper"],
              ["thankYouTag", "Thank You tag"],
              ["beeCharm", "Bee charm"],
              ["customLabel", "Custom label"],
            ].map(([key, label]) => (
              <button type="button" className="nf-commerce-choice" key={key} aria-pressed={Boolean(giftConfig[key])} onClick={() => setGiftConfig((current) => ({ ...current, [key]: !current[key] }))}>{label}</button>
            ))}
          </div>
        </div>
        {giftConfig.customLabel && (
          <div className="nf-commerce-field full">
            <label>Custom label details</label>
            <textarea value={giftConfig.customLabelNotes} onChange={(event) => setGiftConfig((current) => ({ ...current, customLabelNotes: event.target.value }))} placeholder="Business name, event, date, wording, colors, or logo notes" />
          </div>
        )}
        <div className="nf-commerce-field full">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={giftConfig.recurring} onChange={(event) => setGiftConfig((current) => ({ ...current, recurring: event.target.checked }))} />
            Make this a recurring business order
          </label>
        </div>
        {giftConfig.recurring && (
          <div className="nf-commerce-field">
            <label>Cadence</label>
            <select value={giftConfig.cadence} onChange={(event) => setGiftConfig((current) => ({ ...current, cadence: event.target.value }))}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>
        )}
        {giftConfig.recurring && giftConfig.cadence === "custom" && (
          <div className="nf-commerce-field">
            <label>Custom interval (days)</label>
            <input type="number" min="1" max="365" value={giftConfig.customIntervalDays} onChange={(event) => setGiftConfig((current) => ({ ...current, customIntervalDays: event.target.value }))} />
          </div>
        )}
      </div>

      <div className="nf-commerce-builder-total">
        <div>
          <span>{giftQty} gifts · current partner gifting pricing</span>
          <strong>{money(giftPrice)}</strong>
        </div>
        <button className="nf-commerce-btn primary" type="button" onClick={addGiftPackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );


  const renderSignatureSixBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Premium Business Gifting</div>
          <h3>NectarFusions Signature Six</h3>
          <p>Michigan Honey Tasting Collection · six 2 oz glass hexagons in every showcased gift box.</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      <div className="nf-commerce-note">
        <strong>5 NectarFusions favorites + 1 seasonal discovery.</strong> The collection is curated for you so every recipient gets the same polished tasting experience. The seasonal flavor rotates to keep repeat and holiday gifting fresh.
      </div>

      <div className="nf-commerce-grid">
        {signatureFlavorNames.map((name, index) => (
          <article className="nf-commerce-card soft" key={name}>
            <div className="nf-commerce-kicker">
              {index === signatureFlavorNames.length - 1 ? "Seasonal Discovery" : "Signature Flavor"}
            </div>
            <h4>{name}</h4>
            <p>2 oz glass hexagon</p>
          </article>
        ))}
      </div>

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field">
          <label>How many people are you gifting?</label>
          <input
            type="number"
            min={signatureSchema.minimum_boxes || selectedPackage.minimum_quantity || 12}
            max={(signatureSchema.custom_quote_min || 100) - 1}
            step="1"
            value={giftConfig.quantity}
            onChange={(event) => setGiftConfig((current) => ({ ...current, quantity: event.target.value }))}
          />
          <span style={{ fontSize: 12, color: "#6b7d87" }}>
            One Signature Six box per recipient. {signatureSchema.custom_quote_min || 100}+ boxes are custom quoted.
          </span>
        </div>
        <div className="nf-commerce-field">
          <label>Current box price</label>
          <input readOnly value={money(signatureUnitPrice)} aria-label="Current Signature Six price per box" />
        </div>
        <div className="nf-commerce-field full">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={giftConfig.customLabel} onChange={(event) => setGiftConfig((current) => ({ ...current, customLabel: event.target.checked }))} />
            Add a branded gift insert / presentation card
          </label>
          <span style={{ fontSize: 12, color: "#6b7d87" }}>
            NectarFusions stays on the jars. Your business can be featured on the presentation piece so the gift feels personal without hiding the product brand.
          </span>
        </div>
        {giftConfig.customLabel && (
          <div className="nf-commerce-field full">
            <label>Branded insert details</label>
            <textarea value={giftConfig.customLabelNotes} onChange={(event) => setGiftConfig((current) => ({ ...current, customLabelNotes: event.target.value }))} placeholder="Business name, logo notes, congratulations / thank-you message, event, holiday, colors, or recipient wording" />
          </div>
        )}
        <div className="nf-commerce-field full">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={giftConfig.recurring} onChange={(event) => setGiftConfig((current) => ({ ...current, recurring: event.target.checked }))} />
            Make this a recurring business gifting order
          </label>
        </div>
        {giftConfig.recurring && (
          <div className="nf-commerce-field">
            <label>Cadence</label>
            <select value={giftConfig.cadence} onChange={(event) => setGiftConfig((current) => ({ ...current, cadence: event.target.value }))}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>
        )}
        {giftConfig.recurring && giftConfig.cadence === "custom" && (
          <div className="nf-commerce-field">
            <label>Custom interval (days)</label>
            <input type="number" min="1" max="365" value={giftConfig.customIntervalDays} onChange={(event) => setGiftConfig((current) => ({ ...current, customIntervalDays: event.target.value }))} />
          </div>
        )}
      </div>

      <div className="nf-commerce-builder-total">
        <div>
          <span>{signatureBoxQty} Signature Six gift boxes · {signatureBoxQty * Number(signatureSchema.jars_per_box || 6)} individual 2 oz jars</span>
          <strong>{money(signaturePrice)}</strong>
        </div>
        <button className="nf-commerce-btn primary" type="button" onClick={addSignatureSixPackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderFoodserviceBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Configure Foodservice</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      {!foodserviceItems.length ? (
        <div className="nf-commerce-note">This package is active but has no Foodservice package contents yet. Add bulk package items in Admin → Partner Commerce → Packages before customers use it.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {foodserviceItems.map((item, index) => {
            const line = foodserviceConfig.lines[item.id] || {};
            const honeyRule = String(itemRule(item, "honey_type", "choice") || "choice");
            const honeyType = ["natural", "infused"].includes(honeyRule) ? honeyRule : (line.honeyType || "infused");
            const fixedFlavor = item.flavor_id
              ? foodserviceFlavors.find((flavor) => flavor.id === item.flavor_id)
              : item.flavor_name
                ? foodserviceFlavors.find((flavor) => flavor.name === item.flavor_name)
                : null;
            const label = itemRule(item, "label", `Package item ${index + 1}`);
            return (
              <div className="nf-commerce-card soft" key={item.id}>
                <div>
                  <div className="nf-commerce-kicker">{label}</div>
                  <h4>{Number(item.quantity || 1)} × {FOODSERVICE_SIZE_LABELS[item.size_id] || item.size_id || "Foodservice format"}</h4>
                  <p>{itemRule(item, "description", "Choose the honey configuration for this preset package line.")}</p>
                </div>
                <div className="nf-commerce-field-grid">
                  <div className="nf-commerce-field">
                    <label>Honey</label>
                    {honeyRule === "choice" ? (
                      <select value={honeyType} onChange={(event) => updateFoodserviceLine(item.id, { honeyType: event.target.value, flavorId: event.target.value === "natural" ? "" : line.flavorId })}>
                        <option value="natural">Natural Raw Honey</option>
                        <option value="infused">Infused Honey</option>
                      </select>
                    ) : <input value={honeyType === "natural" ? "Natural Raw Honey" : "Infused Honey"} readOnly />}
                  </div>
                  {honeyType === "infused" && (
                    <div className="nf-commerce-field">
                      <label>Flavor</label>
                      {fixedFlavor ? <input value={fixedFlavor.name} readOnly /> : (
                        <select value={line.flavorId || ""} onChange={(event) => updateFoodserviceLine(item.id, { flavorId: event.target.value })}>
                          <option value="">Choose a flavor</option>
                          {foodserviceAllowedFlavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="meta"><span>{money(foodserviceUnitPrice(item, honeyType))} each</span><span>{money(foodserviceUnitPrice(item, honeyType) * Number(item.quantity || 1))} line total</span></div>
              </div>
            );
          })}
        </div>
      )}

      {selectedPackage.recurring_allowed && (
        <div className="nf-commerce-field-grid">
          <label className="nf-commerce-field full" style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8 }}>
            <input type="checkbox" style={{ width: 18 }} checked={foodserviceConfig.recurring} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, recurring: event.target.checked }))} />
            <span>Make this a recurring Foodservice order</span>
          </label>
          {foodserviceConfig.recurring && <div className="nf-commerce-field"><label>Cadence</label><select value={foodserviceConfig.cadence} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, cadence: event.target.value }))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="custom">Custom interval</option></select></div>}
          {foodserviceConfig.recurring && foodserviceConfig.cadence === "custom" && <div className="nf-commerce-field"><label>Custom interval (days)</label><input type="number" min="1" max="365" value={foodserviceConfig.customIntervalDays} onChange={(event) => setFoodserviceConfig((current) => ({ ...current, customIntervalDays: event.target.value }))} /></div>}
        </div>
      )}

      <div className="nf-commerce-builder-total">
        <div><span>Preset Foodservice package · current validated pricing</span><strong>{money(foodservicePrice)}</strong></div>
        <button className="nf-commerce-btn primary" type="button" disabled={!foodserviceItems.length} onClick={addFoodservicePackage}>Continue to Fulfillment & Payment</button>
      </div>
    </div>
  );

  const renderHiveBuilder = () => (
    <div className="nf-commerce-builder" id="nf-package-builder">
      <div className="nf-commerce-builder-head">
        <div>
          <div className="nf-commerce-kicker">Hive Partners</div>
          <h3>{selectedPackage.name}</h3>
          <p>{selectedPackage.description}</p>
        </div>
        <button className="nf-commerce-btn" type="button" onClick={() => setSelectedPackage(null)}>Close</button>
      </div>

      {hiveBenefits.length > 0 && (
        <div className="nf-commerce-card soft">
          <h4>Included with this partnership</h4>
          <div style={{ display: "grid", gap: 6 }}>
            {hiveBenefits.map((benefit) => <p key={benefit}>✓ {benefit}</p>)}
          </div>
        </div>
      )}

      <div className="nf-commerce-field-grid">
        <div className="nf-commerce-field"><label>Sponsor display name</label><input value={hiveConfig.sponsorDisplayName} onChange={(event) => setHiveConfig((current) => ({ ...current, sponsorDisplayName: event.target.value }))} placeholder="Business or organization name" /></div>
        <div className="nf-commerce-field"><label>Recognition name</label><input value={hiveConfig.recognitionName} onChange={(event) => setHiveConfig((current) => ({ ...current, recognitionName: event.target.value }))} placeholder="Optional public recognition name" /></div>
        <div className="nf-commerce-field full"><label>Notes</label><textarea value={hiveConfig.notes} onChange={(event) => setHiveConfig((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional sponsorship, recognition, delivery, or coordination notes" /></div>
        {selectedPackage.recurring_allowed && <label className="nf-commerce-field full" style={{ display: "flex", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 8 }}><input type="checkbox" style={{ width: 18 }} checked={hiveConfig.annualRenewal} onChange={(event) => setHiveConfig((current) => ({ ...current, annualRenewal: event.target.checked }))} /><span>Renew this Hive Partnership annually</span></label>}
      </div>

      <div className="nf-commerce-builder-total">
        <div><span>{selectedPackage.recurring_allowed ? "Annual Hive Partner package" : "Hive Partner package"}</span><strong>{hivePrice ? money(hivePrice) : "Price pending"}</strong></div>
        <button className="nf-commerce-btn primary" type="button" disabled={!hivePrice} onClick={addHivePackage}>Continue to Payment</button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="nf-commerce-empty">Loading your partner programs and packages…</div>;
  }

  return (
    <section className="nf-commerce">
      <style>{CSS}</style>
      <div className="nf-commerce-top">
        <div>
          <div className="nf-commerce-kicker">Business ordering</div>
          <h2>{account?.business_name || account?.public_name || "NectarFusions Partner"}</h2>
        </div>
        <div className="nf-commerce-actions">
          <button className="nf-commerce-btn" type="button" onClick={() => window.dispatchEvent(new Event("nf-open-partner-cart"))}>Open Cart</button>
          <button className="nf-commerce-btn" type="button" onClick={onSignOut} disabled={signOutBusy}>{signOutBusy ? "Signing out…" : "Sign Out"}</button>
        </div>
      </div>

      <nav className="nf-commerce-nav" aria-label="Partner commerce sections">
        {[
          ["dashboard", "Dashboard"],
          ["packages", "Place Order"],
          ["orders", "My Orders"],
          ["recurring", "Schedule"],
          ["account", "My Business"],
        ].map(([id, label]) => (
          <button key={id} type="button" aria-current={(section === id || (id === "account" && section === "delivery")) ? "page" : undefined} onClick={() => { if (id === "packages" && activeProgram === "hive_partners") { setSelectedPackage(null); setActiveProgram(approvedPrograms.find((row) => row.program_key !== "hive_partners")?.program_key || ""); } setSection(id); setError(""); setNotice(""); }}>{label}</button>
        ))}
      </nav>

      {/* NF PARTNER REMINDER DEEP LINK V7 */}
      {reminderOrderId && !loading && (
        <aside className="nf-partner-reminder-entry" aria-label="Your NectarFusions restock reminder">
          <div>
            <h3>{reminderResult.state === "ready" ? "Ready to restock?" : "Review your previous order"}</h3>
            <p>{reminderResult.state === "ready"
              ? `Your ${reminderResult.order.package_snapshot?.name || "previous honey order"} is ready for review. Check your selections and current pricing before placing a new order.`
              : reminderResult.state === "already_reordered"
                ? "A newer order is already linked to this purchase. Check its status before ordering again."
                : reminderResult.state === "unpaid"
                  ? "The previous order still needs payment confirmation. Review the existing order rather than making a duplicate."
                  : reminderResult.state === "in_progress"
                    ? "The previous order is still in progress. Review its fulfillment status before restocking."
                    : "This reminder cannot be reordered directly. Review your order history to see what is available."}</p>
          </div>
          <div className="nf-partner-reminder-entry-actions">
            <button className="nf-commerce-btn primary" type="button" onClick={() => {
              if (reminderResult.state === "ready") {
                reorder(reminderResult.order);
              } else {
                setSection("orders");
              }
              dismissReminderLink();
            }}>{reminderResult.state === "ready" ? "Review Reorder" : "View My Orders"}</button>
            <button className="nf-commerce-btn" type="button" onClick={dismissReminderLink} aria-label="Dismiss reminder">Dismiss</button>
          </div>
        </aside>
      )}

      {error && <div className="nf-commerce-message error" role="alert">{error}</div>}
      {notice && <div className="nf-commerce-message success" role="status">{notice}</div>}

      {section === "dashboard" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Your business, made simpler</div>
              <h3>Ready for your next order?</h3>
              <p>Restock a previous order, shop a new collection, or check what is coming up.</p>
            </div>
          </div>
          <div className="nf-commerce-dashboard-grid">
            <div className="nf-commerce-order-summary nf-commerce-restock">
              <div className="nf-commerce-order-summary-head">
                <div>
                  <small>{lastOrder ? "Quick reorder" : openOrder ? "Order in progress" : "Get started"}</small>
                  <h4>{lastOrder?.package_snapshot?.name || (openOrder ? "Review your open order" : "Place your first partner order")}</h4>
                </div>
                {lastOrder && <span className="nf-commerce-status" data-status={lastOrder.status}>{cleanStatus(lastOrder.status)}</span>}
              </div>
              <p>{lastOrder
                ? "Bring back your previous selection in one step. Review the cart and current prices before checkout."
                : openOrder ? "You already have an order in progress. Review its status in My Orders before placing it again." : "Choose a collection for your business. Your available programs and prices will be shown as you shop."}</p>
              {lastOrder && (
                <div className="nf-commerce-restock-meta">
                  <span>Last ordered: <strong>{dateLabel(lastOrder.created_at)}</strong></span>
                  <span>Previous total: <strong>{money(lastOrder.total_cents)}</strong></span>
                </div>
              )}
              <div className="nf-commerce-actions" style={{ justifyContent: "flex-start" }}>
                {lastOrder && lastOrder.items?.length ? (
                  <button className="nf-commerce-btn primary" type="button" onClick={() => reorder(lastOrder)}>Reorder these items</button>
                ) : null}
                <button className="nf-commerce-btn" type="button" onClick={() => setSection(!lastOrder && openOrder ? "orders" : "packages")}>{lastOrder ? "Shop other collections" : openOrder ? "View open order" : "Place an order"}</button>
              </div>
            </div>
            <div className="nf-commerce-card soft nf-commerce-next">
              <div className="nf-commerce-stat"><span>Order in progress</span><strong>{openOrder?.order_no || "No open orders"}</strong></div>
              <p>{openOrder ? cleanStatus(openOrder.status) : "When you place an order, you can track its progress here."}</p>
              {openOrder && <button className="nf-commerce-text-btn" type="button" onClick={() => setSection("orders")}>View order details →</button>}
              <div className="nf-commerce-next-divider" />
              <div className="nf-commerce-stat">
                <span>{nextScheduledOrder ? "Next scheduled order" : "Next suggested restock"}</span>
                <strong>{nextScheduledOrder?.next_order_on ? dateLabel(nextScheduledOrder.next_order_on) : lastFulfilled?.reorder_due_on ? dateLabel(lastFulfilled.reorder_due_on) : "Not scheduled"}</strong>
              </div>
              <p>{nextScheduledOrder ? "View your current recurring arrangements in Schedule." : lastFulfilled?.reorder_due_on ? "A suggested date from your order record, not an automatic charge." : "Replenishment information will appear as your order history grows."}</p>
              <button className="nf-commerce-text-btn" type="button" onClick={() => setSection("recurring")}>View schedule →</button>
            </div>
          </div>
          <div className="nf-commerce-quick-grid" aria-label="Quick partner actions">
            <button className="nf-commerce-quick-card" type="button" onClick={() => setSection("packages")}>
              <span aria-hidden="true">01</span><strong>Place Order</strong><small>Choose from your available honey and gift collections.</small><em>Shop collections →</em>
            </button>
            <button className="nf-commerce-quick-card" type="button" onClick={() => setSection("orders")}>
              <span aria-hidden="true">02</span><strong>My Orders</strong><small>Track fulfillment, view previous purchases and reorder.</small><em>View orders →</em>
            </button>
            <button className="nf-commerce-quick-card" type="button" onClick={() => setSection("recurring")}>
              <span aria-hidden="true">03</span><strong>Schedule</strong><small>Review eligible recurring orders and renewal dates.</small><em>View schedule →</em>
            </button>
            <button className="nf-commerce-quick-card" type="button" onClick={() => setSection("account")}>
              <span aria-hidden="true">04</span><strong>My Business</strong><small>Keep business details and delivery preferences up to date.</small><em>Manage account →</em>
            </button>
          </div>
        </div>
      )}

      {(section === "packages" || section === "sponsorship") && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">{section === "sponsorship" ? "Supporting our apiaries" : "Business ordering"}</div>
              <h3>{section === "sponsorship" ? "Hive Partnerships" : "Choose a Honey Collection"}</h3>
              <p>{section === "sponsorship"
                ? "Explore sponsorship opportunities separately from honey restocking and business gifting."
                : "Choose Retail, Wholesale or Business Gifting, then review quantities, flavors and your order total."}</p>
            </div>
          </div>

          {section === "sponsorship" && (
            <button className="nf-commerce-btn" type="button" onClick={() => { setSelectedPackage(null); setActiveProgram(approvedPrograms.find((row) => row.program_key !== "hive_partners")?.program_key || ""); setSection("packages"); }}>
              ← Back to Honey Ordering
            </button>
          )}
          {section === "packages" && approvedPrograms.some((row) => row.program_key !== "hive_partners") ? (
            <div className="nf-commerce-program-tabs" role="tablist">
              {approvedPrograms.filter((row) => row.program_key !== "hive_partners").map((row) => (
                <button key={row.program_key} type="button" role="tab" aria-selected={activeProgram === row.program_key} onClick={() => { setActiveProgram(row.program_key); setSelectedPackage(null); }}>{programName(row)}</button>
              ))}
            </div>
          ) : null}

          {!approvedPrograms.length ? (
            <div className="nf-commerce-empty">No ordering programs are available for this account yet. Contact NectarFusions to connect the right options for your business.</div>
          ) : packageRows.length ? (
            <div className="nf-commerce-grid">
              {packageRows.map((pkg) => (
                <article className="nf-commerce-package-card" key={pkg.id}>
                  <div className="body">
                    <div className="nf-commerce-kicker">{PROGRAM_LABELS[pkg.program_key] || pkg.program_key}</div>
                    <h4>{pkg.name}</h4>
                    <p>{pkg.description}</p>
                    {partnerPackagePreviewCents(pkg, retailCatalog, giftPricing) != null ? (
                      <div className="nf-commerce-package-starting">
                        Starting at <strong>{money(partnerPackagePreviewCents(pkg, retailCatalog, giftPricing))}</strong>
                        <small>Estimated package subtotal · final total confirmed at checkout</small>
                      </div>
                    ) : (
                      <div className="nf-commerce-price-awaiting">Price shown after choosing package options</div>
                    )}
                    <div className="meta">
                      {pkg.default_quantity ? <span>{pkg.default_quantity} {pkg.program_key === "retail" ? "jars" : packageBuilder(pkg) === "signature_six" ? "gift boxes" : pkg.program_key === "business_gifting" ? "individual gifts" : pkg.program_key === "foodservice" ? "package units" : pkg.program_key === "hive_partners" ? "annual partnership" : "units"}</span> : null}
                      {pkg.base_price_cents != null && pkg.price_mode === "fixed" ? <span>{money(pkg.base_price_cents)}</span> : null}
                      {pkg.flavor_selection_count ? <span>{pkg.flavor_selection_count} flavor{pkg.flavor_selection_count === 1 ? "" : "s"}</span> : null}
                      {pkg.program_key === "hive_partners" ? <span>Annual renewal</span> : pkg.default_reorder_interval_days ? <span>Suggested restock: {pkg.default_reorder_interval_days} days</span> : null}
                      {pkg.program_key === "hive_partners" ? <span>No physical fulfillment</span> : pkg.recurring_allowed ? <span>Recurring eligible</span> : null}
                    </div>
                  </div>
                  <div className="foot">
                    <button className="nf-commerce-btn primary" type="button" disabled={!packageBuilder(pkg)} onClick={() => selectPackage(pkg)}>
                      Customize & Continue
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="nf-commerce-empty">No collections are currently available in this category. Your other business programs remain accessible above.</div>
          )}

          {selectedPackage && packageBuilder(selectedPackage) === "retail_shelf" ? renderRetailBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "business_gifting" ? renderGiftBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "signature_six" ? renderSignatureSixBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "foodservice" ? renderFoodserviceBuilder() : null}
          {selectedPackage && packageBuilder(selectedPackage) === "hive_sponsorship" ? renderHiveBuilder() : null}
        </div>
      )}

      {section === "orders" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Track purchases and restock</div>
              <h3>My Orders</h3>
              <p>View payment and fulfillment status. Once an order is fulfilled, reorder its items with current pricing verified at checkout.</p>
            </div>
          </div>
          {orders.length ? (
            <div className="nf-order-history-list">
              {orders.map((order) => {
                const paid = order.paid === true;
                const cancelled = order.status === "cancelled";
                const paymentPending = !paid && !cancelled;
                const fulfilled = paid && order.status === "fulfilled";
                const existingPaymentLink = paymentPending
                  ? existingSquarePaymentUrl(order.square_link_url)
                  : "";
                const lines = Array.isArray(order.items) ? order.items : [];
                return (
                  <article className="nf-order-history-card" key={order.id}>
                    <div className="nf-order-history-header">
                      <div>
                        <span className="nf-order-history-eyebrow">Order {order.order_no}</span>
                        <h4>{order.package_snapshot?.name || "Partner order"}</h4>
                        <div className="nf-order-history-muted">Placed {dateLabel(order.created_at)}</div>
                      </div>
                      <div className="nf-order-history-amount">
                        <strong>{money(order.total_cents)}</strong>
                        <span className="nf-order-history-status" data-payment={cancelled ? "cancelled" : paid ? "paid" : "pending"}>
                          {cancelled ? "Cancelled" : paid ? "Payment confirmed" : "Awaiting payment"}
                        </span>
                      </div>
                    </div>
                    <div className="nf-order-history-meta">
                      <div><span>Fulfillment</span><strong>{order.fulfillment_method === "not_required" ? "Not required" : order.fulfillment_method === "delivery" ? "Local Delivery" : "Coleman Pickup"}</strong></div>
                      <div><span>Order progress</span><strong>{paymentPending ? "Waiting for payment" : cancelled ? "Cancelled" : cleanStatus(order.status)}</strong></div>
                      <div><span>Items</span><strong>{lines.reduce((total, item) => total + Number(item.quantity || 0), 0)} total</strong></div>
                    </div>
                    {paymentPending && (
                      <div className="nf-order-history-alert">
                        <strong>Payment has not been confirmed.</strong>
                        <span>This order already exists. Avoid placing it again. {existingPaymentLink ? "You can open the existing Square payment link below." : "Contact NectarFusions for help with the original payment link."} If you have already paid, please confirm with NectarFusions before making another payment.</span>
                      </div>
                    )}
                    <div className="nf-order-history-actions">
                      {paymentPending && existingPaymentLink && (
                        <a className="nf-commerce-btn primary" href={existingPaymentLink} target="_blank" rel="noopener noreferrer">Open existing Square payment link ↗</a>
                      )}
                      {fulfilled && lines.length > 0 && (
                        <button className="nf-commerce-btn primary" type="button" onClick={() => reorder(order)}>Reorder these items</button>
                      )}
                      {fulfilled && order.package_id && (
                        <button className="nf-commerce-btn" type="button" onClick={() => modifyOrder(order)}>Customize a new order</button>
                      )}
                      {paymentPending && (
                        <a className="nf-commerce-btn" href={`mailto:info@nectar-fusions.com?subject=${encodeURIComponent(`Partner payment question: ${order.order_no}`)}`}>Ask about payment</a>
                      )}
                    </div>
                    <details className="nf-order-history-detail">
                      <summary>View order details</summary>
                      {lines.length ? lines.map((item, index) => (
                        <div className="nf-order-history-item" key={item.id || index}>
                          <span>{Number(item.quantity || 0)} × {item.flavor_name || item.size_label || item.product_key || "Order item"}{item.size_label && item.flavor_name ? ` · ${item.size_label}` : ""}</span>
                          <strong>{money(item.line_total_cents ?? (Number(item.quantity || 0) * Number(item.unit_price_cents || 0)))}</strong>
                        </div>
                      )) : <p>Line items are not available for this order.</p>}
                      <p>Previous order totals are historical. New orders are quoted with current pricing and availability before checkout.</p>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : <div className="nf-commerce-empty">You haven't placed a partner order yet. Choose a collection in Place Order to get started.</div>}
        </div>
      )}

      {section === "recurring" && (
        <div className="nf-commerce-panel nf-partner-schedule">
          <div className="nf-commerce-panel-head">
            <div>
              <div className="nf-commerce-kicker">Plan ahead</div>
              <h3>Schedule & Restocking</h3>
              <p className="nf-schedule-intro">See when to restock, manage existing recurring arrangements, and review your next purchase. Suggested dates and reminder emails never authorize automatic payment.</p>
            </div>
          </div>

          {unpaidPartnerOrders.length > 0 && (
            <div className="nf-schedule-alert" role="status">
              <div>
                <strong>{unpaidPartnerOrders.length} order{unpaidPartnerOrders.length === 1 ? " is" : "s are"} awaiting payment</strong>
                <p>These orders already exist. Review them before placing another order for the same products.</p>
              </div>
              <button className="nf-commerce-btn" type="button" onClick={() => setSection("orders")}>Review My Orders</button>
            </div>
          )}

          <div className="nf-schedule-columns">
            <section className="nf-schedule-block" aria-labelledby="nf-restock-heading">
              <div className="nf-schedule-block-header">
                <div className="nf-commerce-kicker">Repeat purchases</div>
                <h4 id="nf-restock-heading">Suggested Restocks</h4>
                <p>Dates from fulfilled orders, not automatic orders or guaranteed reminders.</p>
              </div>
              {suggestedRestocks.length ? suggestedRestocks.map((order) => {
                const dueOn = String(order.reorder_due_on).slice(0, 10);
                const dueType = dueOn < michiganDayKey ? "past" : dueOn === michiganDayKey ? "today" : "future";
                return (
                  <article className="nf-schedule-item" key={order.id}>
                    <div className="nf-schedule-item-header">
                      <strong>{order.package_snapshot?.name || "Previously purchased honey"}</strong>
                      <span>{order.order_no}</span>
                    </div>
                    <span className="nf-schedule-chip" data-due={dueType}>
                      {dueType === "past" ? "Past suggested date" : dueType === "today" ? "Suggested today" : "Upcoming restock"}
                    </span>
                    <div className="nf-schedule-meta">Suggested date: <strong>{dateLabel(dueOn)}</strong> · {order.items.reduce((count, item) => count + Number(item.quantity || 0), 0)} items in the previous order</div>
                    <div className="nf-schedule-actions">
                      <button className="nf-commerce-btn primary" type="button" onClick={() => reorder(order)}>Review Reorder</button>
                      <button className="nf-commerce-btn" type="button" onClick={() => setSection("orders")}>Order History</button>
                    </div>
                  </article>
                );
              }) : (
                <div className="nf-schedule-empty">
                  <p>No restock dates are available yet. Once a paid order is fulfilled and has a suggested restock date, it can appear here.</p>
                  <button className="nf-commerce-btn" type="button" onClick={() => setSection(unpaidPartnerOrders.length ? "orders" : "packages")}>{unpaidPartnerOrders.length ? "Review existing orders" : "Browse honey collections"}</button>
                </div>
              )}
            </section>

            <section className="nf-schedule-block" aria-labelledby="nf-recurring-heading">
              <div className="nf-schedule-block-header">
                <div className="nf-commerce-kicker">Planned purchases</div>
                <h4 id="nf-recurring-heading">Recurring Arrangements</h4>
                <p>Manage reminder cycles linked to eligible paid orders. Sending a reminder may advance the next review date; it does not create a purchase or charge a card.</p>
              </div>
              {recurring.length ? recurring.map((item) => {
                const cancelled = item.status === "cancelled";
                const paused = item.status === "paused";
                const isHive = item.program_key === "hive_partners";
                return (
                  <article className="nf-schedule-item" key={item.id}>
                    <div className="nf-schedule-item-header">
                      <strong>{item.package?.name || item.program?.label || "Recurring partner arrangement"}</strong>
                      <span>{cleanStatus(item.status)}</span>
                    </div>
                    <div className="nf-schedule-meta">{isHive ? "Annual Hive Partnership" : `Every ${item.cadence_value} ${item.cadence_unit}${Number(item.cadence_value) === 1 ? "" : "s"}`}</div>
                    <div className="nf-schedule-meta">{isHive ? "Next renewal reminder" : "Next review cycle"}: <strong>{dateLabel(item.next_order_on)}</strong></div>
                    {!cancelled && (
                      <div className="nf-schedule-actions">
                        {item.status === "active" && Boolean(item.next_order_on) && (
                          <button className="nf-commerce-btn" type="button" disabled={Boolean(busy)} onClick={() => manageRecurring(item, "skip")}>Skip Next</button>
                        )}
                        <button className="nf-commerce-btn" type="button" disabled={Boolean(busy)} onClick={() => manageRecurring(item, paused ? "resume" : "pause")}>{paused ? "Resume Schedule" : "Pause Schedule"}</button>
                        <a className="nf-commerce-btn" href={`mailto:info@nectar-fusions.com?subject=${encodeURIComponent(`Partner schedule change: ${item.package?.name || item.program_key}`)}`}>Request Date Change</a>
                      </div>
                    )}
                  </article>
                );
              }) : (
                <div className="nf-schedule-empty">
                  <p>No recurring arrangements are saved yet. Eligible Wholesale and Business Gifting collections can offer recurring-order options at checkout. A schedule is created only after an eligible order is confirmed.</p>
                  {repeatPurchasePrograms.length ? (
                    <div className="nf-schedule-setup">
                      {repeatPurchasePrograms.map((program) => (
                        <button className="nf-commerce-btn" key={program.program_key} type="button" onClick={() => { setActiveProgram(program.program_key); setSelectedPackage(null); setSection("packages"); }}>
                          Explore {program.program_key === "foodservice" ? "Wholesale" : "Business Gifting"}
                        </button>
                      ))}
                    </div>
                  ) : <p className="nf-schedule-meta">Retail partners can always reorder fulfilled purchases from My Orders.</p>}
                </div>
              )}
            </section>
          </div>

          <div className="nf-schedule-footer">
            Restock dates are recommendations only. Email reminders depend on the active NectarFusions automation rules and are not guaranteed by the dates shown here. A recurring reminder cycle is not a recurring purchase or automatic charge. The reminder date can advance without a new order. To change your arrangement, use Request Date Change.
          </div>
        </div>
      )}

      {section === "delivery" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head">
            <div><div className="nf-commerce-kicker">My Business / Fulfillment</div><h3>Delivery & Pickup</h3><p>Save your business location and preferences for future orders. Delivery eligibility and fees are confirmed at checkout.</p></div>
            <button className="nf-commerce-btn" type="button" onClick={() => setSection("account")}>Back to My Business</button>
          </div>
          <div className="nf-commerce-field-grid">
            <div className="nf-commerce-field"><label>Preferred fulfillment</label><select value={profile.preferredFulfillment} onChange={(event) => setProfile((current) => ({ ...current, preferredFulfillment: event.target.value }))}><option value="pickup">Coleman Pickup</option><option value="delivery">Local Delivery</option></select></div>
            <div className="nf-commerce-field"><label>Preferred contact</label><select value={profile.preferredContactMethod} onChange={(event) => setProfile((current) => ({ ...current, preferredContactMethod: event.target.value }))}><option value="text">Text</option><option value="call">Call</option><option value="email">Email</option></select></div>
            <div className="nf-commerce-field"><label>Business / location name</label><input value={profile.businessName} onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>Phone</label><input value={profile.phone} onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Street address</label><input value={profile.addressLine1} onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Address line 2</label><input value={profile.addressLine2} onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>City</label><input value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>State</label><input maxLength={2} value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value.toUpperCase() }))} /></div>
            <div className="nf-commerce-field"><label>ZIP</label><input maxLength={5} value={profile.zip} onChange={(event) => setProfile((current) => ({ ...current, zip: event.target.value.replace(/\D/g, "").slice(0, 5) }))} /></div>
            <div className="nf-commerce-field"><label>Building information</label><input value={profile.buildingDetails} onChange={(event) => setProfile((current) => ({ ...current, buildingDetails: event.target.value }))} /></div>
            <div className="nf-commerce-field"><label>Gate / access code</label><input value={profile.gateAccessCode} onChange={(event) => setProfile((current) => ({ ...current, gateAccessCode: event.target.value }))} /></div>
            <div className="nf-commerce-field full"><label>Delivery notes</label><textarea value={profile.deliveryNotes} onChange={(event) => setProfile((current) => ({ ...current, deliveryNotes: event.target.value }))} /></div>
          </div>
          <div className="nf-commerce-form-actions"><button className="nf-commerce-btn primary" type="button" disabled={busy === "profile"} onClick={saveProfile}>{busy === "profile" ? "Saving…" : "Save Fulfillment Profile"}</button></div>
        </div>
      )}

      {section === "account" && (
        <div className="nf-commerce-panel">
          <div className="nf-commerce-panel-head"><div><div className="nf-commerce-kicker">One business account</div><h3>My Business</h3><p>Manage your company, buying programs, security and fulfillment preferences from one place.</p></div></div>
          <div className="nf-commerce-account-grid">
            <div className="nf-commerce-card soft">
              <h4>Business information</h4>
              <p><strong>{account?.business_name}</strong></p>
              <p>{account?.contact_name || "No contact name saved"}</p>
              <p>{account?.email}</p>
              <p>{account?.phone || "No phone saved"}</p>
              <p>Relationship: {cleanStatus(account?.relationship_status)}</p>
              <button className="nf-commerce-btn nf-commerce-account-action" type="button" onClick={() => setSection("delivery")}>Edit Delivery & Pickup Preferences</button>
            </div>
            <div className="nf-commerce-card soft">
              <h4>Programs</h4>
              {programs.length ? programs.map((row) => (
                <div className="nf-commerce-program-row" key={row.program_key}><strong>{programName(row)}</strong><span>{row.status}</span></div>
              )) : <p>No programs have been assigned yet.</p>}
            </div>
            {approvedPrograms.some((row) => row.program_key === "hive_partners") && (
              <div className="nf-commerce-card soft">
                <h4>Hive Partnerships</h4>
                <p>Manage or renew your apiary sponsorship separately from product purchases.</p>
                <button className="nf-commerce-btn" type="button" onClick={() => { setSelectedPackage(null); setActiveProgram("hive_partners"); setSection("sponsorship"); }}>
                  View Hive Partnerships →
                </button>
              </div>
            )}
            <div className="nf-commerce-card soft">
              <h4>Sign-in & security</h4>
              <p>Use your approved email and password to sign in. Secure email links remain available as a backup.</p>
              <button
                className="nf-commerce-btn"
                type="button"
                onClick={onManagePassword}
              >
                Create or Change Password
              </button>
            </div>
          </div>
          <div className="nf-commerce-note" style={{ marginTop: 14 }}>You can use multiple business programs with one account. Your available programs appear above; contact NectarFusions if you need another purchasing option.</div>
        </div>
      )}

      <PartnerCartDrawer account={account} />
    </section>
  );
}
