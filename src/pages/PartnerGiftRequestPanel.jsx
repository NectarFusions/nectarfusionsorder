import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { replacePartnerStoreItems } from "../lib/partnerStoreCart";

const PICKUP_ADDRESS = "122 E Railway St, Coleman, MI 48618";

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
];

const PRODUCT_META = {
  bear: {
    type: "Small Plastic Bear",
    title: "2 oz Plastic Bear",
    image: "/images/partner-gift-bear-2oz.jpg",
    alt: "2 oz plastic honey bear container",
    priceKey: "bear_price_cents",
    retailPriceKey: "bear_suggested_retail_cents",
  },
  hex: {
    type: "Small Glass Hexagonal Container",
    title: "2 oz Glass Hexagon",
    image: "/images/partner-gift-hexagonal.jpg",
    alt: "2 oz glass hexagonal honey container",
    priceKey: "hex_price_cents",
    retailPriceKey: "hex_suggested_retail_cents",
  },
};

const DEFAULT_GIFT_PRICING = {
  bear_price_cents: 250,
  bear_suggested_retail_cents: 500,
  hex_price_cents: 300,
  hex_suggested_retail_cents: 600,
  addon_unit_price_cents: 50,
  addon_suggested_retail_cents: 100,
  addon_bundle_price_cents: 125,
  addon_bundle_suggested_retail_cents: 250,
  custom_label_flat_cents: 3000,
};

const TOP_GIFT_FLAVOR_ALIASES = [
  ["Chipotle"],
  ["Cinnamon"],
  ["Lemon"],
  ["Madagascar Vanilla", "Vanilla"],
  ["Original"],
];

const normalizeFlavorName = (value) =>
  String(value || "").trim().toLowerCase();

const topGiftFlavors = (flavors) => {
  const available = Array.isArray(flavors) ? flavors : [];

  return TOP_GIFT_FLAVOR_ALIASES.flatMap((aliases) => {
    const normalizedAliases = aliases.map(normalizeFlavorName);
    const match = available.find((flavor) =>
      normalizedAliases.includes(
        normalizeFlavorName(flavor?.name)
      )
    );
    return match ? [match] : [];
  });
};


const blankGift = (type) => ({
  enabled: false,
  type,
  flavorQuantities: {},
  lidColor: "",
  dipperQty: 0,
  thankYouTagQty: 0,
  beeCharmQty: 0,
  customDetails: "",
});

const initialForm = () => ({
  neededBy: "",
  fulfillmentMethod: "",
  preferredDeliveryDays: [],
  requestNotes: "",
  bear: blankGift(PRODUCT_META.bear.type),
  hex: blankGift(PRODUCT_META.hex.type),
  customLabelsRequested: false,
  customLabelNotes: "",
  labelExamples: [],
});

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const shortDate = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Not specified"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
};

const dateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
};

const todayIso = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

const unitPriceCents = (gift, pricing) => {
  if (gift?.type === PRODUCT_META.bear.type) {
    return Number(pricing?.bear_price_cents || 250);
  }
  if (gift?.type === PRODUCT_META.hex.type) {
    return Number(pricing?.hex_price_cents || 300);
  }
  return 0;
};

const safeQty = (value) =>
  Math.max(0, Math.min(999, Number.parseInt(value, 10) || 0));

const giftQuantity = (gift) =>
  Object.values(gift?.flavorQuantities || {}).reduce(
    (sum, value) => sum + safeQty(value),
    0
  );

const addOnPricing = (gift, pricing) => {
  const dipperQty = safeQty(gift?.dipperQty);
  const thankYouTagQty = safeQty(gift?.thankYouTagQty);
  const beeCharmQty = safeQty(gift?.beeCharmQty);
  const bundleQty = Math.min(
    dipperQty,
    thankYouTagQty,
    beeCharmQty
  );
  const individualQty =
    dipperQty +
    thankYouTagQty +
    beeCharmQty -
    bundleQty * 3;

  return {
    bundleQty,
    dipperRemainder: dipperQty - bundleQty,
    thankYouTagRemainder: thankYouTagQty - bundleQty,
    beeCharmRemainder: beeCharmQty - bundleQty,
    totalCents:
      bundleQty *
        Number(pricing?.addon_bundle_price_cents || 125) +
      individualQty *
        Number(pricing?.addon_unit_price_cents || 50),
  };
};

const lineTotalCents = (gift, pricing) => {
  if (!gift?.enabled) return 0;
  const qty = giftQuantity(gift);
  return (
    qty * unitPriceCents(gift, pricing) +
    addOnPricing(gift, pricing).totalCents
  );
};

const CSS = `
.nf-gift {
  max-width:1040px;
  margin:22px auto 0;
  padding:0 18px 32px;
  color:#173C52;
}
.nf-gift * { box-sizing:border-box; }
.nf-gift-shell {
  overflow:hidden;
  border:1px solid #CFE0E8;
  border-radius:24px;
  background:#FFFFFF;
  box-shadow:0 16px 40px rgba(16,46,64,.06);
}
.nf-gift-hero {
  display:flex;
  justify-content:space-between;
  gap:24px;
  align-items:flex-start;
  padding:26px clamp(20px,4vw,36px);
  background:
    radial-gradient(circle at 92% 8%,rgba(247,196,28,.20),transparent 31%),
    linear-gradient(135deg,#102E40,#174C68);
}
.nf-gift-kicker {
  margin-bottom:7px;
  color:#F7C41C;
  font-size:14px;
  font-weight:900;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.nf-gift-hero h2 {
  margin:0;
  color:#FFFFFF;
  font-size:clamp(30px,5vw,44px);
  line-height:1;
}
.nf-gift-hero p {
  max-width:720px;
  margin:10px 0 0;
  color:#D9EAF2;
  font-size:15px;
  line-height:1.65;
}
.nf-gift-price-note {
  flex:0 0 auto;
  padding:10px 14px;
  border:1px solid rgba(247,196,28,.55);
  border-radius:999px;
  background:rgba(247,196,28,.13);
  color:#FFF2B5;
  font-size:14px;
  font-weight:850;
}
.nf-gift-tabs {
  display:flex;
  gap:8px;
  padding:12px clamp(16px,3vw,28px);
  border-bottom:1px solid #DDE8ED;
  background:#F7FBFD;
}
.nf-gift-tabs button {
  min-height:42px;
  padding:9px 15px;
  border:1px solid #BFD5E0;
  border-radius:999px;
  background:#FFFFFF;
  color:#446372;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-gift-tabs button[aria-selected="true"] {
  border-color:#173C52;
  background:#173C52;
  color:#FFFFFF;
}
.nf-gift-message {
  margin:16px clamp(16px,3vw,28px) 0;
  padding:12px 14px;
  border-radius:12px;
  font-size:14px;
  line-height:1.55;
}
.nf-gift-message[data-kind="error"] {
  border:1px solid #E1AAAA;
  background:#FFF3F3;
  color:#812B2B;
}
.nf-gift-message[data-kind="success"] {
  border:1px solid #A7D1B4;
  background:#F1FAF4;
  color:#285A37;
}
.nf-gift-body {
  padding:clamp(22px,4vw,38px);
}
.nf-gift-layout {
  display:grid;
  grid-template-columns:1fr;
  gap:30px;
  align-items:start;
}
.nf-gift-main {
  display:grid;
  gap:28px;
}
.nf-gift-section {
  display:grid;
  gap:18px;
}
.nf-gift-section-head {
  display:flex;
  gap:12px;
  align-items:flex-start;
}
.nf-gift-step {
  flex:0 0 auto;
  display:grid;
  place-items:center;
  width:30px;
  height:30px;
  border-radius:999px;
  background:#173C52;
  color:#FFFFFF;
  font-size:14px;
  font-weight:900;
}
.nf-gift-section-head h3 {
  margin:1px 0 3px;
  color:#173C52;
  font-size:20px;
}
.nf-gift-section-head p {
  margin:0;
  color:#68808C;
  font-size:14px;
  line-height:1.5;
}
.nf-gift-products {
  display:grid;
  grid-template-columns:1fr;
  gap:18px;
}
.nf-gift-product {
  overflow:hidden;
  border:1.5px solid #CBDCE4;
  border-radius:18px;
  background:#FFFFFF;
  transition:border-color .15s ease, box-shadow .15s ease;
}
.nf-gift-product[data-active="true"] {
  border-color:#1B6F91;
  box-shadow:0 0 0 3px rgba(27,111,145,.08);
}
.nf-gift-product-top {
  display:grid;
  grid-template-columns:104px minmax(0,1fr) auto;
  gap:18px;
  align-items:center;
  padding:18px 20px;
  background:linear-gradient(180deg,#FBFDFE,#F6FAFC);
}
.nf-gift-product-top img {
  width:104px;
  height:104px;
  object-fit:contain;
  border-radius:14px;
  background:#FFFFFF;
  border:1px solid #E2EBEF;
}
.nf-gift-product-eyebrow {
  display:block;
  margin-bottom:5px;
  color:#6C8591;
  font-size:14px;
  font-weight:850;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-gift-product-title h4 {
  margin:0;
  color:#173C52;
  font-size:24px;
}
.nf-gift-product-pricing {
  display:flex;
  gap:10px;
  flex-wrap:wrap;
  align-items:center;
  margin-top:8px;
}
.nf-gift-product-pricing strong {
  color:#1B6F91;
  font-size:16px;
}
.nf-gift-product-pricing span {
  color:#68808C;
  font-size:14px;
}
.nf-gift-product-toggle {
  min-width:126px;
  min-height:48px;
  padding:10px 16px;
  border:0;
  border-radius:12px;
  background:#173C52;
  color:#FFFFFF;
  font:inherit;
  font-size:14px;
  font-weight:900;
  cursor:pointer;
}
.nf-gift-product[data-active="true"] .nf-gift-product-toggle {
  border:1px solid #B8CED9;
  background:#FFFFFF;
  color:#173C52;
}
.nf-gift-config {
  display:grid;
  gap:22px;
  padding:22px;
  border-top:1px solid #E0EBF0;
  background:#FFFFFF;
}
.nf-gift-config-row {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:16px;
}
.nf-gift-field {
  display:grid;
  gap:6px;
}
.nf-gift-field.full {
  grid-column:1/-1;
}
.nf-gift-field label,
.nf-gift-flavor-label {
  color:#4F6977;
  font-size:14px;
  font-weight:850;
}
.nf-gift-field input,
.nf-gift-field textarea,
.nf-gift-field select {
  width:100%;
  min-height:44px;
  padding:10px 11px;
  border:1.5px solid #BFD3DD;
  border-radius:10px;
  background:#FFFFFF;
  color:#173C52;
  font:inherit;
  font-size:14px;
}
.nf-gift-field textarea {
  min-height:90px;
  resize:vertical;
}
.nf-gift-qty {
  display:grid;
  grid-template-columns:40px minmax(60px,1fr) 40px;
  gap:6px;
}
.nf-gift-qty button {
  border:1px solid #BFD3DD;
  border-radius:9px;
  background:#F4F9FB;
  color:#173C52;
  font:inherit;
  font-size:20px;
  font-weight:900;
  cursor:pointer;
}
.nf-gift-price-live {
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  padding:10px 12px;
  border-radius:10px;
  background:#EDF7FB;
}
.nf-gift-price-live span {
  color:#5D7785;
  font-size:14px;
  font-weight:750;
}
.nf-gift-price-live strong {
  color:#173C52;
  font-size:18px;
}
.nf-gift-flavor-dropdown {
  position:relative;
}
.nf-gift-flavor-dropdown summary {
  display:flex;
  justify-content:space-between;
  gap:14px;
  align-items:center;
  min-height:48px;
  padding:11px 14px;
  border:1.5px solid #BFD3DD;
  border-radius:10px;
  background:#FFFFFF;
  color:#173C52;
  font-size:14px;
  cursor:pointer;
  list-style:none;
}
.nf-gift-flavor-dropdown summary::-webkit-details-marker {
  display:none;
}
.nf-gift-flavor-dropdown[open] summary {
  border-color:#1B6F91;
  box-shadow:0 0 0 3px rgba(27,111,145,.08);
}
.nf-gift-flavor-count {
  flex:0 0 auto;
  color:#67808D;
  font-size:14px;
  font-weight:800;
}
.nf-gift-flavor-menu {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:6px;
  margin-top:8px;
  padding:10px;
  border:1px solid #C9DCE5;
  border-radius:11px;
  background:#FFFFFF;
  box-shadow:0 12px 28px rgba(16,46,64,.08);
}
.nf-gift-flavor-option {
  display:flex;
  gap:8px;
  align-items:center;
  min-height:40px;
  padding:8px 9px;
  border-radius:8px;
  color:#4C6876;
  font-size:14px;
  cursor:pointer;
}
.nf-gift-flavor-option:hover {
  background:#F2F8FB;
}
.nf-gift-flavor-option input {
  width:16px;
  height:16px;
  margin:0;
  accent-color:#1B6F91;
}
.nf-gift-addons {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
}
.nf-gift-addon {
  display:grid;
  gap:6px;
  padding:12px;
  border:1px solid #D5E3EA;
  border-radius:12px;
  background:#FAFCFD;
}
.nf-gift-addon strong {
  color:#173C52;
  font-size:14px;
}
.nf-gift-addon span {
  color:#68808C;
  font-size:14px;
}
.nf-gift-addon input {
  width:100%;
  min-height:40px;
  padding:8px 9px;
  border:1px solid #BED3DD;
  border-radius:8px;
  font:inherit;
}
.nf-gift-card {
  padding:20px;
  border:1px solid #D3E2E9;
  border-radius:18px;
  background:#FAFCFD;
}
.nf-gift-label-toggle {
  display:flex;
  gap:10px;
  align-items:flex-start;
}
.nf-gift-label-toggle input {
  width:18px;
  height:18px;
  margin-top:2px;
}
.nf-gift-label-toggle strong {
  display:block;
  color:#173C52;
  font-size:15px;
}
.nf-gift-label-toggle span {
  display:block;
  margin-top:3px;
  color:#68808C;
  font-size:14px;
  line-height:1.45;
}
.nf-gift-upload {
  display:grid;
  gap:8px;
  margin-top:12px;
  padding:12px;
  border:1px dashed #AFC8D5;
  border-radius:12px;
  background:#FFFFFF;
}
.nf-gift-files {
  display:grid;
  gap:6px;
}
.nf-gift-file {
  display:flex;
  justify-content:space-between;
  gap:10px;
  align-items:center;
  padding:8px 10px;
  border-radius:9px;
  background:#F3F8FA;
}
.nf-gift-file span {
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:#516D7A;
  font-size:14px;
}
.nf-gift-file button {
  border:0;
  background:transparent;
  color:#8A3030;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-gift-details-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.nf-gift-fulfillment-note {
  grid-column:1/-1;
  padding:11px 12px;
  border-radius:10px;
  background:#EEF7FB;
  color:#4D6977;
  font-size:14px;
  line-height:1.55;
}
.nf-gift-days {
  grid-column:1/-1;
  margin:0;
  padding:12px;
  border:1px solid #D1E1E8;
  border-radius:12px;
}
.nf-gift-days legend {
  color:#4F6977;
  font-size:14px;
  font-weight:850;
}
.nf-gift-days-grid {
  display:flex;
  flex-wrap:wrap;
  gap:7px;
}
.nf-gift-days-grid label {
  display:flex;
  gap:6px;
  align-items:center;
  padding:7px 9px;
  border:1px solid #D1E1E8;
  border-radius:999px;
  background:#FFFFFF;
  color:#57717F;
  font-size:14px;
}
.nf-gift-summary {
  position:static;
  display:grid;
  gap:16px;
  width:100%;
  padding:22px;
  border:1px solid #C9DDE7;
  border-radius:20px;
  background:#F7FBFD;
  box-shadow:0 10px 28px rgba(16,46,64,.05);
}
.nf-gift-summary h3 {
  margin:0;
  color:#173C52;
  font-size:20px;
}
.nf-gift-summary-empty {
  padding:13px;
  border:1px dashed #C5D9E3;
  border-radius:11px;
  background:#FFFFFF;
  color:#718793;
  font-size:14px;
  line-height:1.5;
}
.nf-gift-summary-line {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:14px;
  align-items:start;
  padding:12px 0;
  border-bottom:1px solid #D9E6EC;
}
.nf-gift-summary-line strong {
  color:#173C52;
  font-size:14px;
}
.nf-gift-summary-line span {
  color:#5D7683;
  font-size:14px;
}
.nf-gift-summary-total {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:end;
  padding-top:3px;
}
.nf-gift-summary-total span {
  color:#5E7784;
  font-size:14px;
  font-weight:800;
}
.nf-gift-summary-total strong {
  color:#173C52;
  font-size:25px;
}
.nf-gift-summary-note {
  color:#6C818C;
  font-size:14px;
  line-height:1.5;
}
.nf-gift-submit {
  width:100%;
  min-height:52px;
  border:0;
  border-radius:13px;
  background:#F7C41C;
  color:#102E40;
  font:inherit;
  font-size:16px;
  font-weight:950;
  cursor:pointer;
}
.nf-gift-submit:disabled {
  opacity:.45;
  cursor:not-allowed;
}
.nf-gift-history {
  display:grid;
  gap:12px;
}
.nf-gift-history-empty {
  padding:22px;
  border:1px dashed #C4D8E2;
  border-radius:15px;
  background:#F9FCFD;
  color:#67808D;
  text-align:center;
  font-size:14px;
}
.nf-gift-request {
  overflow:hidden;
  border:1px solid #D2E1E8;
  border-radius:16px;
  background:#FFFFFF;
}
.nf-gift-request-head {
  display:flex;
  justify-content:space-between;
  gap:12px;
  padding:15px 16px;
  background:#F6FAFC;
}
.nf-gift-request-head h3 {
  margin:0;
  color:#173C52;
  font-size:16px;
}
.nf-gift-request-head p {
  margin:4px 0 0;
  color:#718692;
  font-size:14px;
}
.nf-gift-status {
  align-self:flex-start;
  padding:7px 9px;
  border-radius:999px;
  background:#E7F4FA;
  color:#175D85;
  font-size:14px;
  font-weight:900;
}
.nf-gift-request-body {
  display:grid;
  gap:12px;
  padding:15px 16px 17px;
}
.nf-gift-request-meta {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:8px;
}
.nf-gift-request-meta > div {
  padding:10px;
  border-radius:10px;
  background:#F7FAFC;
}
.nf-gift-request-meta span {
  display:block;
  color:#718692;
  font-size:14px;
  font-weight:800;
}
.nf-gift-request-meta strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:14px;
}
.nf-gift-history-line {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  padding:10px 12px;
  border:1px solid #E0E9ED;
  border-radius:10px;
}
.nf-gift-history-line strong {
  color:#173C52;
  font-size:14px;
}
.nf-gift-history-line span {
  color:#617985;
  font-size:14px;
  line-height:1.45;
}
.nf-gift-response {
  padding:12px 13px;
  border-left:4px solid #F7C41C;
  border-radius:10px;
  background:#FFF9E9;
  color:#604A1C;
  font-size:14px;
  line-height:1.55;
}
.nf-gift-reply {
  display:grid;
  gap:8px;
}
.nf-gift-reply textarea {
  width:100%;
  min-height:90px;
  padding:10px;
  border:1px solid #BDD1DC;
  border-radius:10px;
  font:inherit;
}
.nf-gift-actions {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
@media(max-width:950px) {
  .nf-gift-layout {
    grid-template-columns:1fr;
  }
  .nf-gift-summary {
    position:static;
  }
}
@media(max-width:720px) {
  .nf-gift {
    padding:0 10px;
  }
  .nf-gift-hero {
    flex-direction:column;
  }
  .nf-gift-product-top {
    grid-template-columns:88px minmax(0,1fr);
    gap:14px;
    padding:16px;
  }
  .nf-gift-product-top img {
    width:88px;
    height:88px;
  }
  .nf-gift-product-title h4 {
    font-size:20px;
  }
  .nf-gift-product-toggle {
    grid-column:1/-1;
    width:100%;
  }
  .nf-gift-config {
    padding:18px;
  }
  .nf-gift-addons,
  .nf-gift-details-grid,
  .nf-gift-config-row,
  .nf-gift-request-meta,
  .nf-gift-flavor-menu {
    grid-template-columns:1fr;
  }
  .nf-gift-field.full {
    grid-column:auto;
  }
}

.nf-gift-flavor-quantity-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.nf-gift-flavor-quantity {
  display:grid;
  grid-template-columns:minmax(0,1fr) 96px;
  gap:12px;
  align-items:center;
  min-height:58px;
  padding:10px 12px;
  border:1px solid #D2E1E8;
  border-radius:12px;
  background:#F9FCFD;
}
.nf-gift-flavor-quantity span {
  color:#173C52;
  font-size:14px;
  font-weight:850;
}
.nf-gift-flavor-quantity input {
  width:96px;
  min-height:42px;
  padding:8px 10px;
  border:1px solid #BFD3DD;
  border-radius:9px;
  background:#FFFFFF;
  color:#173C52;
  font:inherit;
  font-size:16px;
  text-align:center;
}
.nf-gift-flavor-total {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
  margin-top:10px;
  padding:11px 13px;
  border-radius:10px;
  background:#EDF7FB;
}
.nf-gift-flavor-total span {
  color:#5F7986;
  font-size:14px;
  font-weight:850;
}
.nf-gift-flavor-total strong {
  color:#173C52;
  font-size:19px;
}
@media(max-width:720px) {
  .nf-gift {
    margin-top:10px;
    padding:0 10px 24px;
  }

  .nf-gift-shell {
    border-radius:18px;
  }

  .nf-gift-hero {
    flex-direction:column;
    gap:14px;
    padding:20px 18px;
  }

  .nf-gift-hero h2 {
    font-size:32px;
  }

  .nf-gift-hero p {
    font-size:14px;
    line-height:1.55;
  }

  .nf-gift-price-note {
    align-self:flex-start;
  }

  .nf-gift-tabs {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:7px;
    padding:10px;
  }

  .nf-gift-tabs button {
    width:100%;
    min-height:44px;
    padding:8px 10px;
    font-size:14px;
  }

  .nf-gift-body {
    padding:18px 14px 22px;
  }

  .nf-gift-layout {
    gap:24px;
  }

  .nf-gift-main {
    gap:24px;
  }

  .nf-gift-section {
    gap:14px;
  }

  .nf-gift-section-head {
    gap:9px;
  }

  .nf-gift-step {
    width:28px;
    height:28px;
  }

  .nf-gift-section-head h3 {
    font-size:18px;
  }

  .nf-gift-product-top {
    grid-template-columns:74px minmax(0,1fr);
    gap:12px;
    padding:14px;
  }

  .nf-gift-product-top img {
    width:74px;
    height:74px;
    border-radius:11px;
  }

  .nf-gift-product-title h4 {
    font-size:19px;
  }

  .nf-gift-product-eyebrow {
    font-size:12px;
  }

  .nf-gift-product-pricing {
    gap:6px;
    margin-top:5px;
  }

  .nf-gift-product-pricing strong,
  .nf-gift-product-pricing span {
    font-size:13px;
  }

  .nf-gift-product-toggle {
    grid-column:1/-1;
    width:100%;
    min-height:46px;
  }

  .nf-gift-config {
    gap:18px;
    padding:16px 14px;
  }

  .nf-gift-config-row,
  .nf-gift-addons,
  .nf-gift-details-grid,
  .nf-gift-request-meta,
  .nf-gift-flavor-quantity-grid {
    grid-template-columns:1fr;
  }

  .nf-gift-field.full {
    grid-column:auto;
  }

  .nf-gift-flavor-quantity {
    grid-template-columns:minmax(0,1fr) 84px;
    min-height:54px;
    padding:9px 10px;
  }

  .nf-gift-flavor-quantity input {
    width:84px;
    min-height:42px;
    font-size:16px;
  }

  .nf-gift-addon {
    grid-template-columns:minmax(0,1fr) 84px;
    align-items:center;
  }

  .nf-gift-addon strong,
  .nf-gift-addon span {
    grid-column:1;
  }

  .nf-gift-addon input {
    grid-column:2;
    grid-row:1 / span 2;
    min-height:42px;
    font-size:16px;
    text-align:center;
  }

  .nf-gift-card {
    padding:16px 14px;
  }

  .nf-gift-summary {
    padding:18px 15px;
    border-radius:16px;
  }

  .nf-gift-summary-line {
    grid-template-columns:1fr;
    gap:5px;
  }

  .nf-gift-summary-line > strong {
    font-size:16px;
  }

  .nf-gift-summary-total {
    align-items:center;
  }

  .nf-gift-summary-total strong {
    font-size:24px;
  }

  .nf-gift-submit {
    position:sticky;
    bottom:10px;
    z-index:10;
    box-shadow:0 8px 24px rgba(16,46,64,.18);
  }

  .nf-gift-request-head {
    flex-direction:column;
  }

  .nf-gift-history-line {
    grid-template-columns:1fr;
  }
}

.nf-gift-dual-actions{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:9px;
}
.nf-gift-submit.secondary{
  border:1px solid #BFD3DD;
  background:#FFFFFF;
  color:#173C52;
}
@media(max-width:620px){
  .nf-gift-dual-actions{
    grid-template-columns:1fr;
  }
}
`;

export default function PartnerGiftRequestPanel() {
  const [tab, setTab] = useState("new");
  const [catalog, setCatalog] = useState({
    enabled: false,
    eligible: false,
    giftSetFlavors: [],
  });
  const [requests, setRequests] = useState([]);
  const [giftPricing, setGiftPricing] = useState(
    DEFAULT_GIFT_PRICING
  );
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadingLabels, setUploadingLabels] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [replyById, setReplyById] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextCatalog, nextPricing, nextRequests] =
        await Promise.all([
          api.getPartnerBulkOrderCatalog(),
          api.getPartnerGiftPricing(),
          api.listPartnerBulkOrderRequests(),
        ]);

      setCatalog(nextCatalog);
      setGiftPricing({
        ...DEFAULT_GIFT_PRICING,
        ...(nextPricing || {}),
      });
      setRequests(
        (nextRequests || []).filter(
          (request) =>
            Array.isArray(request.gift_sets) &&
            request.gift_sets.length > 0
        )
      );
      setError("");
    } catch (loadError) {
      setError(
        loadError?.message ||
          "Gift request information could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedGifts = useMemo(
    () =>
      ["bear", "hex"]
        .map((key) => ({ key, ...form[key] }))
        .filter((gift) => gift.enabled),
    [form]
  );

  const pricing = {
    ...DEFAULT_GIFT_PRICING,
    ...(giftPricing || {}),
  };

  const productsSubtotalCents = selectedGifts.reduce(
    (sum, gift) => sum + lineTotalCents(gift, pricing),
    0
  );

  const labelChargeCents = form.customLabelsRequested
    ? Number(pricing.custom_label_flat_cents || 3000)
    : 0;
  const requestSubtotalCents =
    productsSubtotalCents + labelChargeCents;

  const toggleProduct = (key) => {
    setForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        enabled: !current[key].enabled,
      },
    }));
    setError("");
    setSuccess("");
  };

  const updateGift = (key, field, value) => {
    setForm((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
    setError("");
    setSuccess("");
  };

  const adjustGiftQuantity = (key, delta) => {
    const current = safeQty(form[key].quantity);
    updateGift(key, "quantity", Math.max(1, current + delta));
  };

  const updateFlavorQuantity = (key, flavorId, value) => {
    const id = String(flavorId);
    const quantity = safeQty(value);

    setForm((current) => {
      const next = {
        ...(current[key].flavorQuantities || {}),
      };

      if (quantity > 0) {
        next[id] = quantity;
      } else {
        delete next[id];
      }

      return {
        ...current,
        [key]: {
          ...current[key],
          flavorQuantities: next,
        },
      };
    });

    setError("");
    setSuccess("");
  };

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    setSuccess("");
  };

  const toggleDay = (day) => {
    setForm((current) => ({
      ...current,
      preferredDeliveryDays:
        current.preferredDeliveryDays.includes(day)
          ? current.preferredDeliveryDays.filter(
              (item) => item !== day
            )
          : [...current.preferredDeliveryDays, day],
    }));
  };

  const changeFulfillment = (value) => {
    setForm((current) => ({
      ...current,
      fulfillmentMethod: value,
      preferredDeliveryDays:
        value === "delivery"
          ? current.preferredDeliveryDays
          : [],
    }));
    setError("");
    setSuccess("");
  };

  const changeCustomLabels = async (checked) => {
    if (!checked && form.labelExamples.length > 0) {
      setUploadingLabels(true);
      await Promise.allSettled(
        form.labelExamples.map((example) =>
          api.deletePartnerLabelExample(example.storage_path)
        )
      );
      setUploadingLabels(false);
    }

    setForm((current) => ({
      ...current,
      customLabelsRequested: checked,
      customLabelNotes: checked
        ? current.customLabelNotes
        : "",
      labelExamples: checked
        ? current.labelExamples
        : [],
    }));
    setError("");
    setSuccess("");
  };

  const uploadLabelExamples = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    if (form.labelExamples.length + files.length > 5) {
      setError("Upload no more than five label examples.");
      return;
    }

    setUploadingLabels(true);
    setError("");
    try {
      const uploaded = await api.uploadPartnerLabelExamples(files);
      setForm((current) => ({
        ...current,
        labelExamples: [
          ...current.labelExamples,
          ...uploaded,
        ],
      }));
    } catch (uploadError) {
      setError(
        uploadError?.message ||
          "The label example could not be uploaded."
      );
    } finally {
      setUploadingLabels(false);
    }
  };

  const removeLabelExample = async (example) => {
    setUploadingLabels(true);
    setError("");
    try {
      await api.deletePartnerLabelExample(example.storage_path);
      setForm((current) => ({
        ...current,
        labelExamples: current.labelExamples.filter(
          (item) =>
            item.storage_path !== example.storage_path
        ),
      }));
    } catch (deleteError) {
      setError(
        deleteError?.message ||
          "The label example could not be removed."
      );
    } finally {
      setUploadingLabels(false);
    }
  };

  const validate = () => {
    if (selectedGifts.length === 0) {
      return "Choose at least one gift container.";
    }

    for (const gift of selectedGifts) {
      if (giftQuantity(gift) < 1) {
        return `Enter at least one flavor quantity for ${
          gift.type === PRODUCT_META.bear.type
            ? "the 2 oz Plastic Bear"
            : "the 2 oz Glass Hexagon"
        }.`;
      }

if (gift.flavorIds.length < 1) {
        return `Choose at least one flavor for ${
          gift.type === PRODUCT_META.bear.type
            ? "the 2 oz Plastic Bear"
            : "the 2 oz Glass Hexagon"
        }.`;
      }
    }

    if (
      !["pickup", "delivery", "shipping"].includes(
        form.fulfillmentMethod
      )
    ) {
      return "Choose Coleman Pickup, Local Delivery, or Shipping.";
    }

    return "";
  };

  const addGiftItemsToCart = async (event) => {
    event.preventDefault();

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSuccess("");

    try {
      const cartItems = [];

      for (const gift of selectedGifts) {
        const isBear =
          gift.type === PRODUCT_META.bear.type;
        const containerType =
          isBear ? "bear" : "hex";
        const containerLabel =
          isBear
            ? PRODUCT_META.bear.title
            : PRODUCT_META.hex.title;
        const unitPrice =
          unitPriceCents(gift, pricing);

        for (const flavor of topGiftFlavors(
          catalog.giftSetFlavors
        )) {
          const id = String(flavor.id);
          const quantity = safeQty(
            gift.flavorQuantities?.[id]
          );

          if (quantity < 1) continue;

          cartItems.push({
            id: `gift:${containerType}:${id}`,
            category: "gift",
            containerType,
            containerLabel,
            flavorId: flavor.id,
            flavorName: flavor.name,
            quantity,
            unitPriceCents: unitPrice,
            lidColor:
              isBear ? gift.lidColor : "",
            customDetails:
              gift.customDetails,
          });
        }

        const addonPricing = addOnPricing(gift, pricing);

        if (addonPricing.bundleQty > 0) {
          cartItems.push({
            id: `gift_addon:${containerType}:all_three`,
            category: "gift_addon",
            addonType: "all_three",
            containerType,
            name: "Gift add-on set: dipper + Thank You tag + bee charm",
            quantity: addonPricing.bundleQty,
            unitPriceCents: Number(
              pricing.addon_bundle_price_cents || 125
            ),
          });
        }

        const remainingAddOns = [
          [
            "dipper",
            "Wood honey dipper",
            addonPricing.dipperRemainder,
          ],
          [
            "thank_you_tag",
            "Thank You tag",
            addonPricing.thankYouTagRemainder,
          ],
          [
            "bee_charm",
            "Bee charm",
            addonPricing.beeCharmRemainder,
          ],
        ];

        for (const [
          addonType,
          name,
          quantity,
        ] of remainingAddOns) {
          if (quantity < 1) continue;

          cartItems.push({
            id: `gift_addon:${containerType}:${addonType}`,
            category: "gift_addon",
            addonType,
            containerType,
            name,
            quantity,
            unitPriceCents: Number(
              pricing.addon_unit_price_cents || 50
            ),
          });
        }
      }

      if (form.customLabelsRequested) {
        cartItems.push({
          id: "custom_label",
          category: "custom_label",
          name:
            "Custom design + printing & labeling",
          quantity: 1,
          unitPriceCents: Number(pricing.custom_label_flat_cents || 3000),
          notes:
            form.customLabelNotes.trim() || null,
          labelExamples:
            form.labelExamples,
        });
      }

      replacePartnerStoreItems(
        [
          "gift:",
          "gift_addon:",
          "custom_label",
        ],
        cartItems
      );

      setSuccess(
        "Gift items were added to the cart in the top banner."
      );
    } catch (cartError) {
      setError(
        cartError?.message ||
          "The gift items could not be added to your cart."
      );
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const submission = await api.submitPartnerBulkOrder({
        neededBy: form.neededBy || null,
        fulfillmentMethod: form.fulfillmentMethod,
        pickupMarketDateId: null,
        preferredDeliveryDays:
          form.fulfillmentMethod === "delivery"
            ? form.preferredDeliveryDays
            : [],
        requestNotes: form.requestNotes.trim() || null,
        items: [],
        giftSets: selectedGifts.map((gift) => {
          const flavorEntries = topGiftFlavors(
            catalog.giftSetFlavors
          )
            .map((flavor) => {
              const id = String(flavor.id);
              return [
                id,
                safeQty(
                  gift.flavorQuantities?.[id]
                ),
              ];
            })
            .filter(([, quantity]) => quantity > 0);

          return {
            type: gift.type,
            quantity: giftQuantity(gift),
            flavor_ids: flavorEntries.map(([id]) => id),
            flavor_quantities: Object.fromEntries(
              flavorEntries
            ),
            lid_color:
              gift.type === PRODUCT_META.bear.type
                ? gift.lidColor.trim() || null
                : null,
            dipper_quantity: safeQty(gift.dipperQty),
            thank_you_tag_quantity: safeQty(
              gift.thankYouTagQty
            ),
            bee_charm_quantity: safeQty(gift.beeCharmQty),
            custom_details:
              gift.customDetails.trim() || null,
          };
        }),
        customLabelsRequested: form.customLabelsRequested,
        customLabelNotes: form.customLabelsRequested
          ? form.customLabelNotes.trim() || null
          : null,
        labelExamples: form.customLabelsRequested
          ? form.labelExamples
          : [],
      });

      setSuccess(
        submission.emailWarning
          ? `Gift request ${submission.requestId} was saved. NectarFusions will verify the notification in Admin.`
          : `Gift request ${submission.requestId} was submitted successfully.`
      );
      setForm(initialForm());
      await load();
      setTab("history");
    } catch (submitError) {
      setError(
        submitError?.message ||
          "The gift request could not be submitted."
      );
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (request, action) => {
    if (actionBusyId) return;
    const reply = replyById[request.id]?.trim() || null;

    if (action === "provide_information" && !reply) {
      setError("Enter the information NectarFusions requested.");
      return;
    }

    if (
      action === "accept" &&
      !window.confirm(
        "Accept this quote and confirm the displayed total?"
      )
    ) {
      return;
    }

    if (
      action === "cancel" &&
      !window.confirm("Cancel this gift request?")
    ) {
      return;
    }

    setActionBusyId(request.id);
    setError("");
    setSuccess("");

    try {
      await api.partnerBulkOrderAction(
        request.id,
        action,
        reply
      );
      setReplyById((current) => ({
        ...current,
        [request.id]: "",
      }));
      setSuccess(
        action === "accept"
          ? "The quote was accepted."
          : action === "provide_information"
            ? "Your information was sent."
            : "The request was cancelled."
      );
      await load();
    } catch (actionError) {
      setError(
        actionError?.message ||
          "The request could not be updated."
      );
    } finally {
      setActionBusyId("");
    }
  };

  if (
    !loading &&
    (!catalog.enabled || !catalog.eligible)
  ) {
    return null;
  }

  const renderProductCard = (key) => {
    const meta = PRODUCT_META[key];
    const gift = form[key];
    const liveTotal = lineTotalCents(gift, pricing);

    return (
      <article
        className="nf-gift-product"
        data-active={gift.enabled}
        key={key}
      >
        <div className="nf-gift-product-top">
          <img src={meta.image} alt={meta.alt} />

          <div className="nf-gift-product-title">
            <span className="nf-gift-product-eyebrow">
              Gift container
            </span>
            <h4>{meta.title}</h4>
            <div className="nf-gift-product-pricing">
              <strong>
                {money(pricing[meta.priceKey])} partner price
              </strong>
              <span>
                Suggested retail {money(pricing[meta.retailPriceKey])}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="nf-gift-product-toggle"
            onClick={() => toggleProduct(key)}
          >
            {gift.enabled ? "Remove" : "Add to request"}
          </button>
        </div>

        {gift.enabled && (
          <div className="nf-gift-config">
                        {key === "bear" && (
              <div className="nf-gift-config-row">
                <div className="nf-gift-field full">
                  <label>Preferred lid / top color</label>
                  <input
                    type="text"
                    maxLength={120}
                    value={gift.lidColor}
                    onChange={(event) =>
                      updateGift(
                        key,
                        "lidColor",
                        event.target.value
                      )
                    }
                    placeholder="Yellow, black, white..."
                  />
                </div>
              </div>
            )}

            <div className="nf-gift-field full">
              <label>Flavor quantities</label>
              <div className="nf-gift-flavor-quantity-grid">
                {topGiftFlavors(
                  catalog.giftSetFlavors
                ).map((flavor) => {
                  const id = String(flavor.id);
                  return (
                    <label
                      className="nf-gift-flavor-quantity"
                      key={`${key}-${id}`}
                    >
                      <span>{flavor.name}</span>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        step="1"
                        inputMode="numeric"
                        value={
                          gift.flavorQuantities?.[id] || 0
                        }
                        onChange={(event) =>
                          updateFlavorQuantity(
                            key,
                            id,
                            event.target.value
                          )
                        }
                      />
                    </label>
                  );
                })}
              </div>

              <div className="nf-gift-flavor-total">
                <span>Total containers</span>
                <strong>{giftQuantity(gift)}</strong>
              </div>
            </div>
<div>
              <div className="nf-gift-flavor-label">
                Optional add-ons · all three together{" "}
                {money(pricing.addon_bundle_price_cents)} per set
              </div>
              <div className="nf-gift-addons">
                <label className="nf-gift-addon">
                  <strong>Wood honey dipper</strong>
                  <span>{money(pricing.addon_unit_price_cents)} each</span>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={gift.dipperQty}
                    onChange={(event) =>
                      updateGift(
                        key,
                        "dipperQty",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="nf-gift-addon">
                  <strong>Thank You tag</strong>
                  <span>{money(pricing.addon_unit_price_cents)} each</span>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={gift.thankYouTagQty}
                    onChange={(event) =>
                      updateGift(
                        key,
                        "thankYouTagQty",
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="nf-gift-addon">
                  <strong>Bee charm</strong>
                  <span>{money(pricing.addon_unit_price_cents)} each</span>
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={gift.beeCharmQty}
                    onChange={(event) =>
                      updateGift(
                        key,
                        "beeCharmQty",
                        event.target.value
                      )
                    }
                  />
                </label>
              </div>
            </div>

            <div className="nf-gift-field full">
              <label>Custom details for this product</label>
              <textarea
                maxLength={1000}
                value={gift.customDetails}
                onChange={(event) =>
                  updateGift(
                    key,
                    "customDetails",
                    event.target.value
                  )
                }
                placeholder="Ribbon, packaging, event details, quantity split, presentation requests..."
              />
            </div>

            <div className="nf-gift-price-live">
              <span>
                {money(unitPriceCents(gift, pricing))} each
                {" · partner pricing"}
              </span>
              <strong>{money(liveTotal)}</strong>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <section className="nf-gift">
      <style>{CSS}</style>

      <div className="nf-gift-shell">
        <div className="nf-gift-hero">
          <div>
            <div className="nf-gift-kicker">
              Partner gifting
            </div>
            <h2>Gift Sets & Custom Requests</h2>
            <p>
              Build event favors and custom gifting in one place.
              Select a product and configure everything inside that
              product card.
            </p>
          </div>

          <div className="nf-gift-price-note">
            Established gift pricing
          </div>
        </div>

        <div
          className="nf-gift-tabs"
          role="tablist"
          aria-label="Gift request navigation"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "new"}
            onClick={() => setTab("new")}
          >
            New Gift Request
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
          >
            Request History ({requests.length})
          </button>
        </div>

        {error && (
          <div
            className="nf-gift-message"
            data-kind="error"
            role="alert"
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="nf-gift-message"
            data-kind="success"
            role="status"
          >
            {success}
          </div>
        )}

        <div className="nf-gift-body">
          {loading ? (
            <div className="nf-gift-history-empty">
              Loading gift requests…
            </div>
          ) : tab === "new" ? (
            <form onSubmit={submit}>
              <div className="nf-gift-layout">
                <div className="nf-gift-main">
                  <section className="nf-gift-section">
                    <div className="nf-gift-section-head">
                      <span className="nf-gift-step">1</span>
                      <div>
                        <h3>Choose what you need</h3>
                        <p>
                          Each product stays in its own card.
                          Configure only the products you need.
                        </p>
                      </div>
                    </div>

                    <div className="nf-gift-products">
                      {renderProductCard("bear")}
                      {renderProductCard("hex")}
                    </div>
                  </section>

                  <section className="nf-gift-section">
                    <div className="nf-gift-section-head">
                      <span className="nf-gift-step">2</span>
                      <div>
                        <h3>Custom labels</h3>
                        <p>
                          Optional design, printing and labeling for
                          your gift order.
                        </p>
                      </div>
                    </div>

                    <div className="nf-gift-card">
                      <label className="nf-gift-label-toggle">
                        <input
                          type="checkbox"
                          checked={
                            form.customLabelsRequested
                          }
                          onChange={(event) =>
                            changeCustomLabels(
                              event.target.checked
                            )
                          }
                        />
                        <span>
                          <strong>
                            Custom design + printing & labeling
                            · {money(pricing.custom_label_flat_cents)} flat
                          </strong>
                          <span>
                            Upload examples and tell us what you
                            want the label to include.
                          </span>
                        </span>
                      </label>

                      {form.customLabelsRequested && (
                        <div className="nf-gift-upload">
                          <div className="nf-gift-field">
                            <label>Label details</label>
                            <textarea
                              maxLength={3000}
                              value={
                                form.customLabelNotes
                              }
                              onChange={(event) =>
                                updateForm(
                                  "customLabelNotes",
                                  event.target.value
                                )
                              }
                              placeholder="Names, date, event, wording, colors, logo notes..."
                            />
                          </div>

                          <div className="nf-gift-field">
                            <label>
                              Upload examples
                              {" "}
                              <span>
                                JPG, PNG, WebP or PDF · max 5
                              </span>
                            </label>
                            <input
                              type="file"
                              multiple
                              accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                              disabled={uploadingLabels}
                              onChange={uploadLabelExamples}
                            />
                          </div>

                          {form.labelExamples.length > 0 && (
                            <div className="nf-gift-files">
                              {form.labelExamples.map(
                                (example) => (
                                  <div
                                    className="nf-gift-file"
                                    key={
                                      example.storage_path
                                    }
                                  >
                                    <span>
                                      {example.file_name}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={
                                        uploadingLabels
                                      }
                                      onClick={() =>
                                        removeLabelExample(
                                          example
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="nf-gift-section">
                    <div className="nf-gift-section-head">
                      <span className="nf-gift-step">3</span>
                      <div>
                        <h3>Fulfillment & request details</h3>
                        <p>
                          Tell us when you need it and how you
                          would like to receive it.
                        </p>
                      </div>
                    </div>

                    <div className="nf-gift-card">
                      <div className="nf-gift-details-grid">
                        <div className="nf-gift-field">
                          <label>Needed by</label>
                          <input
                            type="date"
                            min={todayIso()}
                            value={form.neededBy}
                            onChange={(event) =>
                              updateForm(
                                "neededBy",
                                event.target.value
                              )
                            }
                          />
                        </div>

                        <div className="nf-gift-field">
                          <label>Fulfillment</label>
                          <select
                            value={
                              form.fulfillmentMethod
                            }
                            onChange={(event) =>
                              changeFulfillment(
                                event.target.value
                              )
                            }
                          >
                            <option value="">
                              Choose fulfillment
                            </option>
                            <option value="pickup">
                              Coleman Pickup
                            </option>
                            <option value="delivery">
                              Local Delivery
                            </option>
                            <option value="shipping">
                              Shipping
                            </option>
                          </select>
                        </div>

                        {form.fulfillmentMethod ===
                          "pickup" && (
                          <div className="nf-gift-fulfillment-note">
                            <strong>
                              Coleman Pickup
                            </strong>
                            <br />
                            {PICKUP_ADDRESS}
                            <br />
                            NectarFusions will confirm pickup
                            timing after review.
                          </div>
                        )}

                        {form.fulfillmentMethod ===
                          "delivery" && (
                          <>
                            <div className="nf-gift-fulfillment-note">
                              Local delivery charges are based on
                              the delivery ZIP and are confirmed
                              with the final quote.
                            </div>

                            <fieldset className="nf-gift-days">
                              <legend>
                                Preferred delivery days
                              </legend>
                              <div className="nf-gift-days-grid">
                                {DAYS.map(
                                  ([value, label]) => (
                                    <label key={value}>
                                      <input
                                        type="checkbox"
                                        checked={form.preferredDeliveryDays.includes(
                                          value
                                        )}
                                        onChange={() =>
                                          toggleDay(value)
                                        }
                                      />
                                      <span>{label}</span>
                                    </label>
                                  )
                                )}
                              </div>
                            </fieldset>
                          </>
                        )}

                        {form.fulfillmentMethod ===
                          "shipping" && (
                          <div className="nf-gift-fulfillment-note">
                            Shipping is quoted separately and
                            confirmed before the final quote is
                            accepted.
                          </div>
                        )}

                        <div className="nf-gift-field full">
                          <label>Request notes</label>
                          <textarea
                            maxLength={5000}
                            value={form.requestNotes}
                            onChange={(event) =>
                              updateForm(
                                "requestNotes",
                                event.target.value
                              )
                            }
                            placeholder="Event details, timing, packaging, recipient information, or anything else we should know."
                          />
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <aside className="nf-gift-summary">
                  <h3>Review your request</h3>

                  {selectedGifts.length === 0 ? (
                    <div className="nf-gift-summary-empty">
                      Select a Bear or Hexagon to begin building
                      your request.
                    </div>
                  ) : (
                    selectedGifts.map((gift) => {
                      const title =
                        gift.type ===
                        PRODUCT_META.bear.type
                          ? PRODUCT_META.bear.title
                          : PRODUCT_META.hex.title;

                      return (
                        <div
                          className="nf-gift-summary-line"
                          key={gift.key}
                        >
                          <div>
                            <strong>
                              {giftQuantity(gift)} ×{" "}
                              {title}
                            </strong>
                            <span>
                              {Object.keys(
                                gift.flavorQuantities || {}
                              ).length} flavor
                              {Object.keys(
                                gift.flavorQuantities || {}
                              ).length === 1
                                ? ""
                                : "s"}{" "}
                              requested
                            </span>
                          </div>
                          <strong>
                            {money(
                              lineTotalCents(gift)
                            )}
                          </strong>
                        </div>
                      );
                    })
                  )}

                  {form.customLabelsRequested && (
                    <div className="nf-gift-summary-line">
                      <div>
                        <strong>
                          Custom labels
                        </strong>
                        <span>
                          Design + printing & labeling
                        </span>
                      </div>
                      <strong>{money(3000)}</strong>
                    </div>
                  )}

                  <div className="nf-gift-summary-total">
                    <span>Request subtotal</span>
                    <strong>
                      {money(requestSubtotalCents)}
                    </strong>
                  </div>

                  <div className="nf-gift-summary-note">
                    Delivery or shipping charges and card
                    processing fees, when applicable, are added
                    to the final quote.
                  </div>

                  <div className="nf-gift-dual-actions">
            <button
              type="button"
              className="nf-gift-submit secondary"
              onClick={addGiftItemsToCart}
            >
              {busy ? "Working…" : "Add to Cart"}
            </button>

            <button
                    type="submit"
                    className="nf-gift-submit"
                    disabled={
                      busy ||
                      uploadingLabels ||
                      selectedGifts.length === 0
                    }
                  >
                    {busy
                      ? "Submitting…"
                      : "Submit Gift Request"}
                  </button>
          </div>
                </aside>
              </div>
            </form>
          ) : requests.length === 0 ? (
            <div className="nf-gift-history-empty">
              No gift requests have been submitted yet.
            </div>
          ) : (
            <div className="nf-gift-history">
              {requests.map((request) => {
                const giftSets = Array.isArray(
                  request.gift_sets
                )
                  ? request.gift_sets
                  : [];

                const mayCancel = [
                  "submitted",
                  "under_review",
                  "needs_information",
                  "quoted",
                ].includes(request.status);

                return (
                  <article
                    className="nf-gift-request"
                    key={request.id}
                  >
                    <div className="nf-gift-request-head">
                      <div>
                        <h3>
                          Gift request submitted{" "}
                          {dateTime(
                            request.submitted_at
                          )}
                        </h3>
                        <p>
                          Request ID: {request.id}
                        </p>
                      </div>

                      <span className="nf-gift-status">
                        {cleanStatus(request.status)}
                      </span>
                    </div>

                    <div className="nf-gift-request-body">
                      <div className="nf-gift-request-meta">
                        <div>
                          <span>Needed by</span>
                          <strong>
                            {shortDate(
                              request.needed_by
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Fulfillment</span>
                          <strong>
                            {cleanStatus(
                              request.fulfillment_method
                            )}
                          </strong>
                        </div>
                        <div>
                          <span>Request subtotal</span>
                          <strong>
                            {money(
                              request.requested_subtotal_cents
                            )}
                          </strong>
                        </div>
                      </div>

                      {giftSets.map(
                        (gift, index) => (
                          <div
                            className="nf-gift-history-line"
                            key={`${request.id}-${index}`}
                          >
                            <div>
                              <strong>
                                {gift.type ===
                                PRODUCT_META.bear.type
                                  ? PRODUCT_META.bear.title
                                  : PRODUCT_META.hex.title}
                              </strong>
                              <span>
                                {Array.isArray(
                                  gift.flavor_breakdown
                                ) &&
                                gift.flavor_breakdown.length > 0
                                  ? gift.flavor_breakdown
                                      .map(
                                        (item) =>
                                          `${item.flavor_name}: ${item.quantity}`
                                      )
                                      .join(" · ")
                                  : (
                                      gift.flavor_names || []
                                    ).join(", ") ||
                                    "Flavors not listed"}
                                {gift.lid_color
                                  ? ` · Lid: ${gift.lid_color}`
                                  : ""}
                              </span>
                            </div>

                            <strong>
                              {gift.quantity} ×{" "}
                              {gift.line_total_cents !=
                              null
                                ? money(
                                    gift.line_total_cents
                                  )
                                : "Saved"}
                            </strong>
                          </div>
                        )
                      )}

                      {request.custom_labels_requested && (
                        <div className="nf-gift-response">
                          <strong>
                            Custom labels requested
                          </strong>
                          {request.custom_label_notes
                            ? ` · ${request.custom_label_notes}`
                            : ""}
                        </div>
                      )}

                      {request.partner_response && (
                        <div className="nf-gift-response">
                          <strong>
                            NectarFusions response
                          </strong>
                          <br />
                          {request.partner_response}
                        </div>
                      )}

                      {request.status ===
                        "needs_information" && (
                        <div className="nf-gift-reply">
                          <textarea
                            maxLength={5000}
                            value={
                              replyById[request.id] ||
                              ""
                            }
                            onChange={(event) =>
                              setReplyById(
                                (current) => ({
                                  ...current,
                                  [request.id]:
                                    event.target.value,
                                })
                              )
                            }
                            placeholder="Enter the requested information..."
                          />
                          <button
                            type="button"
                            className="btn solid"
                            disabled={
                              actionBusyId ===
                              request.id
                            }
                            onClick={() =>
                              runAction(
                                request,
                                "provide_information"
                              )
                            }
                          >
                            Send Information
                          </button>
                        </div>
                      )}

                      <div className="nf-gift-actions">
                        {request.status === "quoted" && (
                          <button
                            type="button"
                            className="btn solid"
                            disabled={
                              actionBusyId ===
                              request.id
                            }
                            onClick={() =>
                              runAction(
                                request,
                                "accept"
                              )
                            }
                          >
                            Accept Quote
                          </button>
                        )}

                        {mayCancel && (
                          <button
                            type="button"
                            className="btn ghost"
                            disabled={
                              actionBusyId ===
                              request.id
                            }
                            onClick={() =>
                              runAction(
                                request,
                                "cancel"
                              )
                            }
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

