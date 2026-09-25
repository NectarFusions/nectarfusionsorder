import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { addPartnerStoreItems } from "../lib/partnerStoreCart";

const REPLENISHMENT_CSS = `
.nf-replenishment-panel {
  margin-top:22px;
  padding:clamp(20px,3vw,30px);
  border:1px solid #D8C9B8;
  border-radius:22px;
  background:
    radial-gradient(circle at 96% 5%,rgba(247,196,28,.14),transparent 28%),
    linear-gradient(145deg,#FFFFFF,#FBF7F1);
}
.nf-replenishment-header {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:18px;
}
.nf-replenishment-header h2 {
  margin:6px 0 8px;
  color:#23170F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  line-height:1;
}
.nf-replenishment-header p {
  max-width:690px;
  margin:0;
  color:#67594D;
  line-height:1.65;
}
.nf-replenishment-price-note {
  flex:0 0 auto;
  padding:9px 13px;
  border:1px solid #E5C953;
  border-radius:999px;
  background:#FFF4BE;
  color:#59430F;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-action-alert {
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:16px;
  margin-bottom:18px;
  padding:15px 17px;
  border:1px solid #D97777;
  border-left:6px solid #B42318;
  border-radius:14px;
  background:#FFF1F1;
  color:#7A1F1F;
  box-shadow:0 8px 20px rgba(180,35,24,.08);
}
.nf-replenishment-action-alert strong {
  display:block;
  font-size:15px;
}
.nf-replenishment-action-alert span {
  display:block;
  margin-top:4px;
  font-size:14px;
  line-height:1.55;
}
.nf-replenishment-action-alert .btn {
  flex:0 0 auto;
  border-color:#B42318;
  background:#B42318;
  color:#FFFFFF;
}
.nf-replenishment-action-alert .btn:hover {
  background:#8F1C14;
}
.nf-replenishment-tabs {
  display:flex;
  flex-wrap:wrap;
  gap:9px;
  margin-top:20px;
}
.nf-replenishment-tabs button {
  min-height:42px;
  padding:9px 14px;
  border:1px solid #CBB9A5;
  border-radius:999px;
  background:#FFFFFF;
  color:#5B493C;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-tabs button[aria-selected="true"] {
  border-color:#173C52;
  background:#173C52;
  color:#FFFFFF;
}
.nf-replenishment-tabs button[data-action-required="true"] {
  border-color:#B42318;
  background:#FFF1F1;
  color:#9A231A;
  box-shadow:0 0 0 2px rgba(180,35,24,.08);
}
.nf-replenishment-tabs button[aria-selected="true"][data-action-required="true"] {
  border-color:#B42318;
  background:#B42318;
  color:#FFFFFF;
}
.nf-replenishment-message {
  margin-top:16px;
  padding:13px 15px;
  border-radius:13px;
  line-height:1.55;
}
.nf-replenishment-message[data-kind="error"] {
  border:1px solid #E1A3A3;
  background:#FFF2F2;
  color:#8C2525;
}
.nf-replenishment-message[data-kind="success"] {
  border:1px solid #A9D2B6;
  background:#F3FBF5;
  color:#285A37;
}
.nf-replenishment-form {
  display:grid;
  gap:18px;
  margin-top:20px;
}
.nf-replenishment-meta-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
}
.nf-replenishment-field {
  display:grid;
  gap:6px;
}
.nf-replenishment-field.full {
  grid-column:1/-1;
}
.nf-replenishment-field label,
.nf-replenishment-days legend {
  color:#4A3313;
  font-size:14px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-replenishment-field input,
.nf-replenishment-field select,
.nf-replenishment-field textarea,
.nf-replenishment-line select,
.nf-replenishment-line input,
.nf-replenishment-reply textarea {
  width:100%;
  box-sizing:border-box;
  border:1.5px solid #CDB58D;
  border-radius:11px;
  background:#FFFFFF;
  color:#17120E;
  font:inherit;
}
.nf-replenishment-field input,
.nf-replenishment-field select,
.nf-replenishment-line select,
.nf-replenishment-line input {
  min-height:47px;
  padding:10px 12px;
}
.nf-replenishment-field textarea,
.nf-replenishment-reply textarea {
  min-height:96px;
  padding:11px 12px;
  resize:vertical;
}
.nf-replenishment-field input:focus,
.nf-replenishment-field select:focus,
.nf-replenishment-field textarea:focus,
.nf-replenishment-line select:focus,
.nf-replenishment-line input:focus,
.nf-replenishment-reply textarea:focus {
  border-color:#167BB6;
  outline:3px solid rgba(36,160,237,.14);
}
.nf-replenishment-days {
  grid-column:1/-1;
  margin:0;
  padding:14px;
  border:1px solid #E3D8CB;
  border-radius:14px;
  background:#FFFCF7;
}
.nf-replenishment-days legend {
  padding:0 5px;
}
.nf-replenishment-day-grid {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.nf-replenishment-day-grid label {
  display:flex;
  align-items:center;
  gap:7px;
  padding:8px 10px;
  border:1px solid #DDD0C0;
  border-radius:999px;
  background:#FFFFFF;
  color:#5E5147;
  font-size:14px;
  cursor:pointer;
}
.nf-replenishment-day-grid input {
  width:16px;
  height:16px;
  margin:0;
}
.nf-replenishment-items {
  display:grid;
  gap:10px;
}
.nf-replenishment-items-header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.nf-replenishment-items-header h3 {
  margin:0;
  color:#281A12;
  font-size:17px;
}
.nf-replenishment-items-header p {
  margin:3px 0 0;
  color:#75685E;
  font-size:14px;
}
.nf-replenishment-line {
  display:grid;
  grid-template-columns:minmax(240px,2.2fr) minmax(95px,.7fr) minmax(95px,.7fr) auto;
  gap:9px;
  align-items:end;
  padding:13px;
  border:1px solid #E0D5C8;
  border-radius:15px;
  background:#FFFFFF;
}
.nf-replenishment-line-field {
  display:grid;
  gap:5px;
}
.nf-replenishment-line-field label {
  color:#66564A;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-line-price {
  margin-top:5px;
  color:#3B6A4B;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-remove {
  min-height:47px;
  padding:9px 12px;
  border:1px solid #D8A5A5;
  border-radius:11px;
  background:#FFF6F6;
  color:#8C2525;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-line-notes {
  grid-column:1/-1;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:9px;
  align-items:center;
}
.nf-replenishment-line-notes input {
  min-height:42px;
}
.nf-replenishment-summary {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
}
.nf-replenishment-summary div {
  padding:15px;
  border-radius:14px;
  background:#F1F8FC;
}
.nf-replenishment-summary span {
  display:block;
  color:#587386;
  font-size:14px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-replenishment-summary strong {
  display:block;
  margin-top:6px;
  color:#173C52;
  font-size:19px;
}
.nf-replenishment-submit {
  min-height:52px;
}
.nf-replenishment-history {
  display:grid;
  gap:12px;
  margin-top:20px;
}
.nf-replenishment-empty {
  padding:20px;
  border:1px dashed #CBB9A5;
  border-radius:15px;
  background:#FFFFFF;
  color:#6A5D52;
  line-height:1.65;
  text-align:center;
}
.nf-replenishment-request {
  overflow:hidden;
  border:1px solid #DDD0C0;
  border-radius:17px;
  background:#FFFFFF;
}
.nf-replenishment-request-head {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:16px 17px;
  background:#F8F4EE;
}
.nf-replenishment-request-head h3 {
  margin:0;
  color:#281A12;
  font-size:16px;
}
.nf-replenishment-request-head p {
  margin:5px 0 0;
  color:#74675D;
  font-size:14px;
}
.nf-replenishment-status {
  align-self:flex-start;
  padding:7px 10px;
  border-radius:999px;
  background:#E8F4FB;
  color:#175D85;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-status[data-status="accepted"],
.nf-replenishment-status[data-status="paid"],
.nf-replenishment-status[data-status="fulfilled"] {
  background:#EAF6ED;
  color:#285A37;
}
.nf-replenishment-status[data-status="needs_information"],
.nf-replenishment-status[data-status="quoted"] {
  background:#FFF2BF;
  color:#6A4E00;
}
.nf-replenishment-status[data-status="cancelled"],
.nf-replenishment-status[data-status="declined"] {
  background:#F8E6E6;
  color:#842C2C;
}
.nf-replenishment-request-body {
  display:grid;
  gap:14px;
  padding:16px 17px 18px;
}
.nf-replenishment-request-meta {
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-replenishment-request-meta div {
  padding:11px;
  border-radius:11px;
  background:#F6FAFC;
}
.nf-replenishment-request-meta span {
  display:block;
  color:#6B7D87;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-replenishment-request-meta strong {
  display:block;
  margin-top:5px;
  color:#173C52;
  font-size:14px;
}
.nf-replenishment-request-items {
  display:grid;
  gap:7px;
}
.nf-replenishment-request-item {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto auto;
  gap:12px;
  align-items:center;
  padding:10px 12px;
  border:1px solid #ECE3D8;
  border-radius:11px;
}
.nf-replenishment-request-item strong {
  color:#35251A;
  font-size:14px;
}
.nf-replenishment-request-item span {
  color:#74675D;
  font-size:14px;
}
.nf-replenishment-response {
  padding:13px 14px;
  border-left:4px solid #F7C41C;
  border-radius:11px;
  background:#FFF9E8;
  color:#604A1C;
  white-space:pre-wrap;
  line-height:1.6;
}
.nf-replenishment-actions {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.nf-replenishment-actions .btn {
  min-height:43px;
}
.nf-replenishment-reply {
  display:grid;
  gap:8px;
}
@media (max-width:800px) {
  .nf-replenishment-action-alert {
    align-items:flex-start;
    flex-direction:column;
  }
  .nf-replenishment-action-alert .btn {
    width:100%;
  }
  .nf-replenishment-header {
    flex-direction:column;
  }
  .nf-replenishment-meta-grid,
  .nf-replenishment-summary,
  .nf-replenishment-request-meta {
    grid-template-columns:1fr;
  }
  .nf-replenishment-line {
    grid-template-columns:1fr 1fr;
  }
  .nf-replenishment-line > :first-child,
  .nf-replenishment-line-notes {
    grid-column:1/-1;
  }
}
@media (max-width:520px) {
  .nf-replenishment-line {
    grid-template-columns:1fr;
  }
  .nf-replenishment-line > *,
  .nf-replenishment-line-notes {
    grid-column:auto;
  }
  .nf-replenishment-line-notes {
    grid-template-columns:1fr;
  }
  .nf-replenishment-request-item {
    grid-template-columns:1fr;
    gap:4px;
  }
}

.nf-replenishment-order-options {
  grid-column:1/-1;
  border:1px solid #D9E3E9;
  border-radius:14px;
  background:#F9FCFD;
}
.nf-replenishment-order-options > summary,
.nf-replenishment-product-options > summary {
  padding:14px 16px;
  cursor:pointer;
  color:#173C52;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-order-options-body {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  padding:0 16px 16px;
}
.nf-replenishment-product-card {
  display:grid;
  gap:18px;
  padding:20px;
  border:1px solid #DCE5EA;
  border-radius:18px;
  background:#FFFFFF;
  box-shadow:0 8px 22px rgba(32,86,122,.05);
}
.nf-replenishment-product-head {
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:flex-start;
  padding-bottom:14px;
  border-bottom:1px solid #EDF1F3;
}
.nf-replenishment-product-head span {
  display:block;
  color:#6A7C86;
  font-size:14px;
  font-weight:850;
}
.nf-replenishment-product-head strong {
  display:block;
  margin-top:4px;
  color:#23333C;
  font-size:17px;
}
.nf-replenishment-remove-link {
  border:0;
  background:transparent;
  color:#9B3434;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-choice-block {
  display:grid;
  gap:9px;
}
.nf-replenishment-choice-label {
  color:#4A5B64;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-choice-buttons {
  display:flex;
  flex-wrap:wrap;
  gap:9px;
}
.nf-replenishment-choice-buttons button {
  min-width:110px;
  min-height:48px;
  padding:10px 18px;
  border:1.5px solid #B9CCD6;
  border-radius:12px;
  background:#FFFFFF;
  color:#294A5C;
  font:inherit;
  font-size:14px;
  font-weight:900;
  cursor:pointer;
  transition:border-color .15s ease,background .15s ease,box-shadow .15s ease;
}
.nf-replenishment-choice-buttons button:hover {
  border-color:#6EAED0;
}
.nf-replenishment-choice-buttons button[aria-pressed="true"] {
  border-color:#167BB6;
  background:#EAF7FF;
  color:#145F89;
  box-shadow:0 0 0 2px rgba(36,160,237,.1);
}
.nf-replenishment-choice-help {
  margin:0;
  color:#7A8990;
  font-size:14px;
}
.nf-replenishment-product-grid {
  display:grid;
  grid-template-columns:minmax(0,1.6fr) minmax(130px,.4fr);
  gap:12px;
}
.nf-replenishment-field-help {
  color:#71808A;
  font-size:14px;
}
.nf-replenishment-selected-product {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:16px;
  padding:14px 16px;
  border:1px solid #BFD9C7;
  border-radius:13px;
  background:#F3FAF5;
}
.nf-replenishment-selected-product span {
  display:block;
  color:#617B68;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-selected-product strong {
  display:block;
  margin-top:4px;
  color:#285A37;
  font-size:14px;
}
.nf-replenishment-selected-product > div:last-child {
  text-align:right;
}
.nf-replenishment-product-options {
  border:1px solid #E3E8EB;
  border-radius:13px;
  background:#FCFDFD;
}
.nf-replenishment-product-options-body {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  padding:0 14px 14px;
}
@media (max-width:800px) {
  .nf-replenishment-order-options-body,
  .nf-replenishment-product-grid,
  .nf-replenishment-product-options-body,
  .nf-replenishment-selected-product {
    grid-template-columns:1fr;
  }
  .nf-replenishment-selected-product > div:last-child {
    text-align:left;
  }
}
@media (max-width:520px) {
  .nf-replenishment-choice-buttons {
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .nf-replenishment-choice-buttons button {
    min-width:0;
    width:100%;
  }
}

.nf-replenishment-builder-layout {
  display:grid;
  grid-template-columns:minmax(0,1.18fr) minmax(300px,.82fr);
  gap:16px;
  align-items:start;
}
.nf-replenishment-builder-card {
  display:grid;
  gap:14px;
  padding:20px;
  border:1px solid #D8E4EA;
  border-radius:18px;
  background:#FFFFFF;
}
.nf-replenishment-builder-step {
  display:flex;
  gap:11px;
  align-items:flex-start;
  margin-top:4px;
}
.nf-replenishment-step-number {
  flex:0 0 auto;
  width:28px;
  height:28px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#173C52;
  color:#FFFFFF;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-builder-step strong {
  display:block;
  color:#263C48;
  font-size:16px;
}
.nf-replenishment-builder-step p {
  margin:3px 0 0;
  color:#70818A;
  font-size:14px;
  line-height:1.45;
}
.nf-replenishment-builder-placeholder {
  display:block;
  width:100%;
  padding:13px 14px;
  border:1px dashed #CDD9DF;
  border-radius:11px;
  color:#7A8990;
  font-size:14px;
  text-align:center;
}
.nf-replenishment-quantity-picker {
  display:grid;
  grid-template-columns:48px minmax(90px,130px) 48px;
  gap:8px;
  align-items:stretch;
}
.nf-replenishment-quantity-picker button,
.nf-replenishment-cart-controls button {
  border:1.5px solid #B9CCD6;
  border-radius:11px;
  background:#FFFFFF;
  color:#173C52;
  font:inherit;
  font-size:22px;
  font-weight:900;
  cursor:pointer;
}
.nf-replenishment-quantity-picker button:disabled,
.nf-replenishment-cart-controls button:disabled {
  opacity:.35;
  cursor:not-allowed;
}
.nf-replenishment-quantity-picker > div {
  display:grid;
  place-items:center;
  padding:7px 10px;
  border:1.5px solid #B9CCD6;
  border-radius:11px;
  background:#F8FCFE;
}
.nf-replenishment-quantity-picker strong {
  color:#173C52;
  font-size:20px;
  line-height:1;
}
.nf-replenishment-quantity-picker span {
  margin-top:3px;
  color:#71808A;
  font-size:14px;
}
.nf-replenishment-builder-selection {
  padding:14px 15px;
  border:1px solid #BFD9C7;
  border-radius:13px;
  background:#F3FAF5;
}
.nf-replenishment-builder-selection span,
.nf-replenishment-builder-selection small {
  display:block;
  color:#617B68;
  font-size:14px;
}
.nf-replenishment-builder-selection strong {
  display:block;
  margin:4px 0;
  color:#285A37;
  font-size:15px;
}
.nf-replenishment-add-to-order {
  width:100%;
  min-height:52px;
  margin-top:2px;
  font-size:15px;
}
.nf-replenishment-cart {
  position:sticky;
  top:16px;
  overflow:hidden;
  border:1px solid #C8DDE8;
  border-radius:18px;
  background:#F8FCFE;
}
.nf-replenishment-cart-head {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:16px;
  border-bottom:1px solid #D8E7EE;
  background:#EDF7FC;
}
.nf-replenishment-cart-head > div:last-child {
  text-align:right;
}
.nf-replenishment-cart-head span {
  display:block;
  color:#67808D;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-cart-head strong {
  display:block;
  margin-top:3px;
  color:#173C52;
  font-size:16px;
}
.nf-replenishment-cart-empty {
  display:grid;
  gap:5px;
  padding:28px 18px;
  color:#516B79;
  font-size:15px;
  font-weight:850;
  text-align:center;
}
.nf-replenishment-cart-empty span {
  color:#7A8D97;
  font-size:14px;
  font-weight:500;
  line-height:1.5;
}
.nf-replenishment-cart-items {
  display:grid;
  max-height:420px;
  overflow:auto;
  padding:10px;
  gap:8px;
}
.nf-replenishment-cart-item {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  padding:12px;
  border:1px solid #DCE7EC;
  border-radius:13px;
  background:#FFFFFF;
}
.nf-replenishment-cart-item-copy strong {
  display:block;
  color:#263C48;
  font-size:14px;
}
.nf-replenishment-cart-item-copy span,
.nf-replenishment-cart-item-copy small {
  display:block;
  margin-top:3px;
  color:#73848D;
  font-size:14px;
}
.nf-replenishment-cart-controls {
  display:grid;
  grid-template-columns:34px 38px 34px;
  gap:5px;
  align-items:center;
}
.nf-replenishment-cart-controls button {
  min-height:34px;
  font-size:17px;
}
.nf-replenishment-cart-controls strong {
  color:#173C52;
  font-size:14px;
  text-align:center;
}
.nf-replenishment-cart-item-bottom {
  grid-column:1/-1;
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  padding-top:8px;
  border-top:1px solid #EDF1F3;
}
.nf-replenishment-cart-item-bottom strong {
  color:#285A37;
  font-size:14px;
}
.nf-replenishment-cart-item-bottom button {
  border:0;
  background:transparent;
  color:#9B3434;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-cart-summary {
  display:grid;
  gap:9px;
  padding:14px 16px 16px;
  border-top:1px solid #D8E7EE;
  background:#FFFFFF;
}
.nf-replenishment-cart-summary > div:first-child {
  display:flex;
  justify-content:space-between;
  gap:12px;
  align-items:center;
}
.nf-replenishment-cart-summary span,
.nf-replenishment-cart-summary small {
  color:#687D88;
  font-size:14px;
}
.nf-replenishment-cart-summary strong {
  color:#173C52;
  font-size:18px;
}
.nf-replenishment-minimum {
  padding:9px 11px;
  border-radius:10px;
  background:#FFF3D1;
  color:#755900;
  font-size:14px;
  font-weight:850;
  text-align:center;
}
.nf-replenishment-minimum[data-met="true"] {
  background:#EAF6ED;
  color:#285A37;
}
@media (max-width:900px) {
  .nf-replenishment-builder-layout {
    grid-template-columns:1fr;
  }
  .nf-replenishment-cart {
    position:static;
  }
}

.nf-replenishment-selected-count {
  flex:0 0 auto;
  padding:8px 12px;
  border-radius:999px;
  background:#EAF7FF;
  color:#145F89;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-flavor-grid {
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-replenishment-flavor-grid button {
  display:flex;
  align-items:center;
  gap:8px;
  min-height:46px;
  padding:10px 12px;
  border:1.5px solid #D2DEE4;
  border-radius:12px;
  background:#FFFFFF;
  color:#334D5A;
  font:inherit;
  font-size:14px;
  font-weight:800;
  text-align:left;
  cursor:pointer;
}
.nf-replenishment-flavor-grid button:hover {
  border-color:#7DB6D4;
}
.nf-replenishment-flavor-grid button[aria-pressed="true"] {
  border-color:#167BB6;
  background:#EAF7FF;
  color:#145F89;
  box-shadow:0 0 0 2px rgba(36,160,237,.08);
}
.nf-replenishment-flavor-check {
  flex:0 0 auto;
  width:24px;
  height:24px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#F0F5F7;
  color:#55717F;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-flavor-grid button[aria-pressed="true"] .nf-replenishment-flavor-check {
  background:#167BB6;
  color:#FFFFFF;
}
.nf-replenishment-selection-empty {
  padding:24px;
  border:1px dashed #C8D7DF;
  border-radius:14px;
  background:#FAFCFD;
  color:#6D808A;
  font-size:14px;
  text-align:center;
}
.nf-replenishment-matrix {
  overflow:hidden;
  border:1px solid #D7E2E8;
  border-radius:16px;
  background:#FFFFFF;
}
.nf-replenishment-matrix-head,
.nf-replenishment-matrix-row {
  display:grid;
  grid-template-columns:minmax(150px,1.3fr) minmax(130px,1fr) minmax(150px,1.15fr) minmax(130px,.8fr) minmax(110px,.7fr);
  gap:10px;
  align-items:center;
}
.nf-replenishment-matrix-head {
  padding:11px 14px;
  background:#F1F7FA;
  color:#607683;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-matrix-row {
  padding:14px;
  border-top:1px solid #E8EEF1;
}
.nf-replenishment-matrix-row:first-of-type {
  border-top:0;
}
.nf-replenishment-matrix-flavor strong {
  display:block;
  color:#263D49;
  font-size:15px;
}
.nf-replenishment-matrix-flavor button {
  margin-top:5px;
  padding:0;
  border:0;
  background:transparent;
  color:#9B3434;
  font:inherit;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
}
.nf-replenishment-inline-choice {
  display:grid;
  gap:6px;
}
.nf-replenishment-mini-buttons {
  display:flex;
  flex-wrap:wrap;
  gap:6px;
}
.nf-replenishment-mini-buttons button {
  min-height:38px;
  padding:7px 10px;
  border:1.5px solid #C7D5DC;
  border-radius:9px;
  background:#FFFFFF;
  color:#345160;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-mini-buttons button[aria-pressed="true"] {
  border-color:#167BB6;
  background:#EAF7FF;
  color:#145F89;
}
.nf-replenishment-inline-placeholder {
  color:#84939A;
  font-size:14px;
}
.nf-replenishment-inline-quantity {
  display:grid;
  grid-template-columns:34px 42px 34px;
  gap:5px;
  align-items:center;
}
.nf-replenishment-inline-quantity button {
  min-height:36px;
  border:1.5px solid #C7D5DC;
  border-radius:9px;
  background:#FFFFFF;
  color:#173C52;
  font:inherit;
  font-size:18px;
  font-weight:900;
  cursor:pointer;
}
.nf-replenishment-inline-quantity button:disabled {
  opacity:.35;
  cursor:not-allowed;
}
.nf-replenishment-inline-quantity strong {
  color:#173C52;
  font-size:14px;
  text-align:center;
}
.nf-replenishment-matrix-quantity small,
.nf-replenishment-matrix-total small {
  display:block;
  margin-top:4px;
  color:#7A8B94;
  font-size:14px;
}
.nf-replenishment-matrix-total strong {
  display:block;
  color:#285A37;
  font-size:15px;
}
.nf-replenishment-mobile-label {
  display:none;
}
.nf-replenishment-order-bar {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr)) minmax(190px,1.2fr);
  gap:8px;
  padding:12px;
  border:1px solid #C6DCE7;
  border-radius:14px;
  background:#F3F9FC;
}
.nf-replenishment-order-bar > div {
  padding:10px 12px;
  border-radius:10px;
  background:#FFFFFF;
}
.nf-replenishment-order-bar span {
  display:block;
  color:#687F8A;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-order-bar strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:17px;
}
.nf-replenishment-order-minimum {
  display:grid;
  place-items:center;
  background:#FFF3D1 !important;
  color:#755900;
  font-size:14px;
  font-weight:900;
  text-align:center;
}
.nf-replenishment-order-minimum[data-met="true"] {
  background:#EAF6ED !important;
  color:#285A37;
}
@media (max-width:980px) {
  .nf-replenishment-flavor-grid {
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
  .nf-replenishment-matrix-head {
    display:none;
  }
  .nf-replenishment-matrix {
    display:grid;
    gap:10px;
    border:0;
    background:transparent;
  }
  .nf-replenishment-matrix-row {
    grid-template-columns:repeat(2,minmax(0,1fr));
    gap:14px;
    border:1px solid #D7E2E8;
    border-radius:14px;
    background:#FFFFFF;
  }
  .nf-replenishment-matrix-flavor {
    grid-column:1/-1;
  }
  .nf-replenishment-mobile-label {
    display:block;
    margin-bottom:5px;
    color:#6B7E88;
    font-size:14px;
    font-weight:900;
  }
  .nf-replenishment-order-bar {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
@media (max-width:620px) {
  .nf-replenishment-flavor-grid {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .nf-replenishment-matrix-row,
  .nf-replenishment-order-bar {
    grid-template-columns:1fr;
  }
}

.nf-replenishment-partner-delivery-note {
  padding:10px 12px;
  border-radius:10px;
  background:#FFFFFF;
  color:#5C7380;
  font-size:14px;
  line-height:1.5;
}

.nf-replenishment-top-grid {
  display:grid;
  grid-template-columns:minmax(180px,.45fr) minmax(0,1.55fr);
  gap:14px;
  align-items:end;
}
.nf-replenishment-section-label {
  display:block;
  margin-bottom:7px;
  color:#4A3313;
  font-size:14px;
  font-weight:900;
  text-transform:uppercase;
}
.nf-replenishment-fulfillment-options {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:9px;
}
.nf-replenishment-fulfillment-options button {
  display:grid;
  gap:4px;
  min-height:92px;
  padding:14px;
  border:1.5px solid #C8D6DD;
  border-radius:14px;
  background:#FFFFFF;
  color:#2C4654;
  text-align:left;
  font:inherit;
  cursor:pointer;
}
.nf-replenishment-fulfillment-options button[aria-pressed="true"] {
  border-color:#167BB6;
  background:#EAF7FF;
  box-shadow:0 0 0 2px rgba(36,160,237,.08);
}
.nf-replenishment-fulfillment-options strong {
  font-size:16px;
}
.nf-replenishment-fulfillment-options span {
  color:#167BB6;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-fulfillment-options small {
  color:#71828B;
  font-size:14px;
  line-height:1.45;
}
.nf-replenishment-delivery-card {
  display:grid;
  gap:12px;
  padding:16px;
  border:1px solid #C8DDE8;
  border-radius:15px;
  background:#F5FAFD;
}
.nf-replenishment-delivery-card > div:first-child span,
.nf-replenishment-zone-details span {
  display:block;
  color:#68808C;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-delivery-card > div:first-child strong,
.nf-replenishment-zone-details strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:14px;
}
.nf-replenishment-zone-details {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:8px;
}
.nf-replenishment-zone-details > div {
  padding:11px;
  border-radius:10px;
  background:#FFFFFF;
}
.nf-replenishment-partner-delivery-note {
  padding:10px 12px;
  border-radius:10px;
  background:#FFFFFF;
  color:#5C7380;
  font-size:14px;
  line-height:1.5;
}
.nf-replenishment-zone-warning {
  padding:11px 13px;
  border:1px solid #E4B7A7;
  border-radius:11px;
  background:#FFF5F0;
  color:#8A3E25;
  font-size:14px;
  line-height:1.5;
}
.nf-replenishment-minimum-explainer {
  padding:15px 17px;
  border-left:4px solid #F7C41C;
  border-radius:12px;
  background:#FFF9E8;
}
.nf-replenishment-minimum-explainer strong {
  color:#604A1C;
  font-size:15px;
}
.nf-replenishment-minimum-explainer p {
  margin:5px 0 0;
  color:#756235;
  font-size:14px;
  line-height:1.55;
}
.nf-replenishment-selected-count {
  flex:0 0 auto;
  padding:8px 12px;
  border-radius:999px;
  background:#EAF7FF;
  color:#145F89;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-flavor-grid {
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:8px;
}
.nf-replenishment-flavor-grid button {
  display:flex;
  align-items:center;
  gap:8px;
  min-height:46px;
  padding:10px 12px;
  border:1.5px solid #D2DEE4;
  border-radius:12px;
  background:#FFFFFF;
  color:#334D5A;
  font:inherit;
  font-size:14px;
  font-weight:800;
  text-align:left;
  cursor:pointer;
}
.nf-replenishment-flavor-grid button[aria-pressed="true"] {
  border-color:#167BB6;
  background:#EAF7FF;
  color:#145F89;
}
.nf-replenishment-flavor-check {
  flex:0 0 auto;
  width:24px;
  height:24px;
  display:grid;
  place-items:center;
  border-radius:999px;
  background:#F0F5F7;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-flavor-grid button[aria-pressed="true"] .nf-replenishment-flavor-check {
  background:#167BB6;
  color:#FFFFFF;
}
.nf-replenishment-selection-empty {
  padding:22px;
  border:1px dashed #C8D7DF;
  border-radius:14px;
  background:#FAFCFD;
  color:#6D808A;
  font-size:14px;
  text-align:center;
}
.nf-replenishment-flavor-orders {
  display:grid;
  gap:11px;
}
.nf-replenishment-flavor-order {
  overflow:hidden;
  border:1px solid #D8E3E8;
  border-radius:15px;
  background:#FFFFFF;
}
.nf-replenishment-flavor-order-head {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:13px 15px;
  background:#F3F8FA;
}
.nf-replenishment-flavor-order-head strong {
  display:block;
  color:#263F4C;
  font-size:16px;
}
.nf-replenishment-flavor-order-head span {
  display:block;
  margin-top:3px;
  color:#70838D;
  font-size:14px;
}
.nf-replenishment-flavor-order-head button {
  align-self:flex-start;
  border:0;
  background:transparent;
  color:#9B3434;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-replenishment-variant-list {
  display:grid;
}
.nf-replenishment-variant {
  display:grid;
  grid-template-columns:minmax(180px,1fr) minmax(150px,.6fr) minmax(110px,.4fr);
  gap:14px;
  align-items:center;
  padding:13px 15px;
  border-top:1px solid #E9EEF1;
}
.nf-replenishment-variant:first-child {
  border-top:0;
}
.nf-replenishment-variant[data-selected="true"] {
  background:#F7FCF8;
}
.nf-replenishment-variant-info strong {
  color:#263F4C;
  font-size:15px;
}
.nf-replenishment-variant-info span {
  display:inline-block;
  margin-left:8px;
  color:#587483;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-variant-info small {
  display:block;
  margin-top:4px;
  color:#7B8A92;
  font-size:14px;
}
.nf-replenishment-variant-quantity {
  display:grid;
  grid-template-columns:38px 60px 38px;
  gap:6px;
  align-items:center;
}
.nf-replenishment-variant-quantity button {
  min-height:38px;
  border:1.5px solid #C7D5DC;
  border-radius:9px;
  background:#FFFFFF;
  color:#173C52;
  font:inherit;
  font-size:18px;
  font-weight:900;
  cursor:pointer;
}
.nf-replenishment-variant-quantity button:disabled {
  opacity:.35;
  cursor:not-allowed;
}
.nf-replenishment-variant-quantity > div {
  text-align:center;
}
.nf-replenishment-variant-quantity strong {
  display:block;
  color:#173C52;
  font-size:16px;
}
.nf-replenishment-variant-quantity span {
  display:block;
  color:#7B8A92;
  font-size:14px;
}
.nf-replenishment-variant-total {
  text-align:right;
}
.nf-replenishment-variant-total span {
  display:block;
  color:#7A8B93;
  font-size:14px;
}
.nf-replenishment-variant-total strong {
  display:block;
  margin-top:4px;
  color:#285A37;
  font-size:15px;
}
.nf-replenishment-order-options {
  border:1px solid #D9E3E9;
  border-radius:14px;
  background:#FAFCFD;
}
.nf-replenishment-order-options > summary {
  padding:14px 16px;
  cursor:pointer;
  color:#173C52;
  font-size:14px;
  font-weight:900;
}
.nf-replenishment-order-options-body {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  padding:0 16px 16px;
}
.nf-replenishment-pricing-summary {
  display:grid;
  gap:0;
  overflow:hidden;
  border:1px solid #C8DDE8;
  border-radius:15px;
  background:#FFFFFF;
}
.nf-replenishment-pricing-summary > div:not(.nf-replenishment-order-stats):not(.nf-replenishment-zone-warning) {
  display:flex;
  justify-content:space-between;
  gap:14px;
  padding:11px 15px;
  border-bottom:1px solid #EDF1F3;
}
.nf-replenishment-pricing-summary span {
  color:#667C87;
  font-size:14px;
}
.nf-replenishment-pricing-summary strong {
  color:#173C52;
  font-size:14px;
}
.nf-replenishment-pricing-total {
  background:#F1F8FC;
}
.nf-replenishment-pricing-total span,
.nf-replenishment-pricing-total strong {
  font-size:17px;
  font-weight:900;
}
.nf-replenishment-order-stats {
  display:flex;
  flex-wrap:wrap;
  gap:8px 16px;
  align-items:center;
  padding:12px 15px;
}
.nf-replenishment-order-stats strong {
  margin-left:auto;
  padding:7px 10px;
  border-radius:999px;
  background:#FFF3D1;
  color:#755900;
}
.nf-replenishment-order-stats strong[data-met="true"] {
  background:#EAF6ED;
  color:#285A37;
}
@media (max-width:900px) {
  .nf-replenishment-top-grid,
  .nf-replenishment-zone-details,
  .nf-replenishment-order-options-body {
    grid-template-columns:1fr;
  }
  .nf-replenishment-flavor-grid {
    grid-template-columns:repeat(3,minmax(0,1fr));
  }
}
@media (max-width:650px) {
  .nf-replenishment-fulfillment-options,
  .nf-replenishment-flavor-grid {
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .nf-replenishment-variant {
    grid-template-columns:1fr;
  }
  .nf-replenishment-variant-total {
    text-align:left;
  }
  .nf-replenishment-order-stats strong {
    width:100%;
    margin-left:0;
    text-align:center;
  }
}

.nf-replenishment-address-editor {
  display:grid;
  gap:12px;
}
.nf-replenishment-address-editor-head span {
  display:block;
  color:#68808C;
  font-size:14px;
  font-weight:900;
  text-transform:uppercase;
}
.nf-replenishment-address-editor-head strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:14px;
  font-weight:700;
  line-height:1.5;
}
.nf-replenishment-address-grid {
  display:grid;
  grid-template-columns:1fr 110px 130px;
  gap:10px;
}
.nf-replenishment-address-grid .full {
  grid-column:1/-1;
}
.nf-replenishment-address-grid label > span {
  display:block;
  margin-bottom:6px;
  color:#4B626E;
  font-size:14px;
  font-weight:850;
}
.nf-replenishment-address-grid label > span small {
  color:#80919A;
  font-size:14px;
  font-weight:600;
}
.nf-replenishment-address-actions {
  display:flex;
  flex-wrap:wrap;
  gap:10px 14px;
  align-items:center;
}
.nf-replenishment-address-actions span {
  color:#647A86;
  font-size:14px;
  line-height:1.45;
}
.nf-replenishment-address-success {
  padding:10px 12px;
  border-radius:10px;
  background:#EAF6ED;
  color:#285A37;
  font-size:14px;
  font-weight:800;
}
@media (max-width:700px) {
  .nf-replenishment-address-grid {
    grid-template-columns:1fr;
  }
  .nf-replenishment-address-grid .full {
    grid-column:auto;
  }
}

.nf-replenishment-profile-editor {
  display:grid;
  gap:12px;
}
.nf-replenishment-profile-head span {
  display:block;
  color:#68808C;
  font-size:14px;
  font-weight:900;
  text-transform:uppercase;
}
.nf-replenishment-profile-head strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:14px;
  line-height:1.5;
}
.nf-replenishment-profile-grid {
  display:grid;
  grid-template-columns:1fr 110px 130px;
  gap:10px;
}
.nf-replenishment-profile-grid .full {
  grid-column:1/-1;
}
.nf-replenishment-profile-grid label > span {
  display:block;
  margin-bottom:6px;
  color:#4B626E;
  font-size:14px;
  font-weight:850;
}
.nf-replenishment-profile-grid label > span small {
  color:#80919A;
  font-size:14px;
  font-weight:600;
}
.nf-replenishment-profile-actions {
  display:flex;
  flex-wrap:wrap;
  gap:10px 14px;
  align-items:center;
}
.nf-replenishment-profile-actions span {
  color:#647A86;
  font-size:14px;
  line-height:1.45;
}
.nf-replenishment-profile-success {
  padding:10px 12px;
  border-radius:10px;
  background:#EAF6ED;
  color:#285A37;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-delete-history {
  color:#9B3434;
  border-color:#D9B4A8;
}
@media (max-width:700px) {
  .nf-replenishment-profile-grid {
    grid-template-columns:1fr;
  }
  .nf-replenishment-profile-grid .full {
    grid-column:auto;
  }
}

.nf-replenishment-profile-summary {
  display:grid;
  gap:12px;
  padding:15px;
  border:1px solid #C8DDE8;
  border-radius:14px;
  background:#FFFFFF;
}
.nf-replenishment-profile-summary-head {
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:flex-start;
}
.nf-replenishment-profile-summary-head span,
.nf-replenishment-profile-summary-grid span {
  display:block;
  color:#68808C;
  font-size:14px;
  font-weight:800;
}
.nf-replenishment-profile-summary-head strong {
  display:block;
  margin-top:4px;
  color:#173C52;
  font-size:17px;
}
.nf-replenishment-profile-summary-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.nf-replenishment-profile-summary-grid > div {
  padding:10px 12px;
  border-radius:10px;
  background:#F5F9FB;
}
.nf-replenishment-profile-summary-grid .full {
  grid-column:1/-1;
}
.nf-replenishment-profile-summary-grid strong {
  display:block;
  margin-top:4px;
  color:#344E5B;
  font-size:14px;
  line-height:1.5;
}
.nf-replenishment-profile-head {
  display:flex;
  justify-content:space-between;
  gap:14px;
  align-items:flex-start;
}
@media (max-width:700px) {
  .nf-replenishment-profile-summary-head {
    flex-direction:column;
  }
  .nf-replenishment-profile-summary-grid {
    grid-template-columns:1fr;
  }
  .nf-replenishment-profile-summary-grid .full {
    grid-column:auto;
  }
}
`;

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
];

const emptyLine = () => ({
  flavorId: "",
  sizeId: "",
  texture: "",
  selectionKey: "",
  quantity: 6,
  onHandCount: "",
  notes: "",
});

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const shortDate = (value) => {
  if (!value) return "Not specified";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not specified";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

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

const todayIso = () => {
  const now = new Date();
  const local = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  return [
    local.getFullYear(),
    String(local.getMonth() + 1).padStart(2, "0"),
    String(local.getDate()).padStart(2, "0"),
  ].join("-");
};

const actionMessage = (error) =>
  String(error?.message || error || "The request could not be updated.");

export default function PartnerReplenishmentPanel({ account }) {
  const [tab, setTab] = useState("new");
  const [catalog, setCatalog] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [replyById, setReplyById] = useState({});
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [savedDeliveryProfile, setSavedDeliveryProfile] = useState(() => ({
    business_name: account?.business_name || "",
    phone: account?.phone || "",
    delivery_notes: account?.delivery_notes || "",
    address_line1: account?.address_line1 || "",
    address_line2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "",
    zip: account?.zip || "",
  }));
  const [deliveryProfileDraft, setDeliveryProfileDraft] = useState(() => ({
    businessName: account?.business_name || "",
    phone: account?.phone || "",
    deliveryNotes: account?.delivery_notes || "",
    addressLine1: account?.address_line1 || "",
    addressLine2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "",
    zip: account?.zip || "",
  }));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileError, setProfileError] = useState("");
  const [editingDeliveryProfile, setEditingDeliveryProfile] =
    useState(() => {
      const savedZip = String(account?.zip || "")
        .replace(/\D/g, "")
        .slice(0, 5);

      return !(
        account?.business_name &&
        account?.phone &&
        account?.address_line1 &&
        account?.city &&
        account?.state &&
        savedZip.length === 5
      );
    });

  const [savedDeliveryAddress, setSavedDeliveryAddress] = useState(() => ({
    address_line1: account?.address_line1 || "",
    address_line2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "",
    zip: account?.zip || "",
  }));
  const [deliveryAddressDraft, setDeliveryAddressDraft] = useState(() => ({
    addressLine1: account?.address_line1 || "",
    addressLine2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "",
    zip: account?.zip || "",
  }));
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressNotice, setAddressNotice] = useState("");
  const [addressError, setAddressError] = useState("");
  const [selectedFlavorIds, setSelectedFlavorIds] = useState([]);
  const [form, setForm] = useState({
    neededBy: "",
    fulfillmentMethod: "",
    preferredDeliveryDays: [],
    currentInventoryNotes: "",
    requestNotes: "",
    items: [],
  });

  const actionRequiredRequests = useMemo(
    () =>
      requests.filter((request) =>
        ["needs_information", "quoted"].includes(
          request.status
        )
      ),
    [requests]
  );

  const primaryActionRequest =
    actionRequiredRequests[0] || null;

  const actionRequiredCopy =
    actionRequiredRequests.length > 1
      ? `${actionRequiredRequests.length} replenishment requests need your attention.`
      : primaryActionRequest?.status === "quoted"
        ? "A replenishment quote is ready for your review."
        : "NectarFusions needs additional information for a replenishment request.";

  const catalogByKey = useMemo(
    () =>
      new Map(
        catalog.map((row) => [
          `${row.flavor_id}|${row.size_id}|${row.texture}`,
          row,
        ])
      ),
    [catalog]
  );

  const replenishmentFlavorOptions = useMemo(() => {
    const unique = new Map();

    catalog.forEach((row) => {
      if (!unique.has(row.flavor_id)) {
        unique.set(row.flavor_id, {
          id: row.flavor_id,
          name: row.flavor_name,
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }, [catalog]);

  const sizeOptionsForFlavor = (line) => {
    const unique = new Map();

    catalog
      .filter((row) => row.flavor_id === line.flavorId)
      .forEach((row) => {
        if (!unique.has(row.size_id)) {
          unique.set(row.size_id, {
            id: row.size_id,
            label: row.size_label,
          });
        }
      });

    return Array.from(unique.values());
  };

  const textureOptionsForFlavor = (line) =>
    Array.from(
      new Set(
        catalog
          .filter(
            (row) =>
              row.flavor_id === line.flavorId &&
              row.size_id === line.sizeId
          )
          .map((row) => row.texture)
      )
    );

  const sizeOptions = useMemo(() => {
    const unique = new Map();

    catalog.forEach((row) => {
      if (!unique.has(row.size_id)) {
        unique.set(row.size_id, {
          id: row.size_id,
          label: row.size_label,
        });
      }
    });

    return Array.from(unique.values());
  }, [catalog]);

  const texturesForLine = (line) =>
    Array.from(
      new Set(
        catalog
          .filter((row) => row.size_id === line.sizeId)
          .map((row) => row.texture)
      )
    );

  const flavorsForLine = (line) =>
    catalog
      .filter(
        (row) =>
          row.size_id === line.sizeId &&
          row.texture === line.texture
      )
      .sort((a, b) =>
        String(a.flavor_name).localeCompare(String(b.flavor_name))
      );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [nextCatalog, nextRequests, nextZones] = await Promise.all([
        api.getPartnerReplenishmentCatalog(),
        api.listPartnerReplenishmentRequests(),
        api.getPartnerDeliveryZones(),
      ]);

      setCatalog(nextCatalog);
      setRequests(nextRequests);
      setDeliveryZones(nextZones);
    } catch (loadError) {
      setError(actionMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const toggleDay = (day) => {
    setForm((current) => {
      const selected = current.preferredDeliveryDays.includes(day);
      return {
        ...current,
        preferredDeliveryDays: selected
          ? current.preferredDeliveryDays.filter((item) => item !== day)
          : [...current.preferredDeliveryDays, day],
      };
    });
  };

  const updateLine = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line
      ),
    }));
    if (error) setError("");
    if (success) setSuccess("");
  };

  const updateProductChoice = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        let next = { ...line };

        if (key === "sizeId") {
          next = {
            ...next,
            sizeId: value,
            texture: "",
            flavorId: "",
            selectionKey: "",
          };
        } else if (key === "texture") {
          next = {
            ...next,
            texture: value,
            flavorId: "",
            selectionKey: "",
          };
        } else if (key === "flavorId") {
          next = {
            ...next,
            flavorId: value,
          };

          next.selectionKey =
            next.sizeId && next.texture && value
              ? `${value}|${next.sizeId}|${next.texture}`
              : "";
        }

        return next;
      }),
    }));

    if (error) setError("");
    if (success) setSuccess("");
  };






  const toggleReplenishmentFlavor = (flavor) => {
    setForm((current) => {
      const existing = current.items.findIndex(
        (line) => line.flavorId === flavor.id
      );

      if (existing >= 0) {
        return {
          ...current,
          items: current.items.filter(
            (_, index) => index !== existing
          ),
        };
      }

      return {
        ...current,
        items: [
          ...current.items,
          {
            ...emptyLine(),
            flavorId: flavor.id,
          },
        ],
      };
    });

    if (error) setError("");
    if (success) setSuccess("");
  };

  const updateFlavorConfiguration = (index, key, value) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        if (key === "sizeId") {
          return {
            ...line,
            sizeId: value,
            texture: "",
            selectionKey: "",
          };
        }

        if (key === "texture") {
          return {
            ...line,
            texture: value,
            selectionKey:
              line.flavorId && line.sizeId && value
                ? `${line.flavorId}|${line.sizeId}|${value}`
                : "",
          };
        }

        return {
          ...line,
          [key]: value,
        };
      }),
    }));

    if (error) setError("");
    if (success) setSuccess("");
  };

  const adjustFlavorQuantity = (index, amount) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => {
        if (lineIndex !== index) return line;

        return {
          ...line,
          quantity: Math.max(
            6,
            Math.min(
              996,
              Number(line.quantity || 6) + amount
            )
          ),
        };
      }),
    }));

    if (error) setError("");
    if (success) setSuccess("");
  };

  const retailFlavorOptions = useMemo(() => {
    const unique = new Map();

    catalog.forEach((row) => {
      if (!unique.has(row.flavor_id)) {
        unique.set(row.flavor_id, {
          id: row.flavor_id,
          name: row.flavor_name,
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }, [catalog]);

  const retailVariantsForFlavor = (flavorId) =>
    catalog
      .filter((row) => row.flavor_id === flavorId)
      .sort((a, b) => {
        const sizeCompare = String(a.size_label).localeCompare(
          String(b.size_label),
          undefined,
          { numeric: true }
        );

        if (sizeCompare !== 0) return sizeCompare;

        return String(a.texture).localeCompare(String(b.texture));
      });

  const retailVariantKey = (row) =>
    `${row.flavor_id}|${row.size_id}|${row.texture}`;

  const retailVariantLine = (row) =>
    form.items.find(
      (line) => line.selectionKey === retailVariantKey(row)
    ) || null;

  const toggleRetailFlavor = (flavorId) => {
    setSelectedFlavorIds((current) => {
      const selected = current.includes(flavorId);

      if (selected) {
        setForm((formState) => ({
          ...formState,
          items: formState.items.filter(
            (line) => line.flavorId !== flavorId
          ),
        }));

        return current.filter((id) => id !== flavorId);
      }

      return [...current, flavorId];
    });

    if (error) setError("");
    if (success) setSuccess("");
  };

  const adjustRetailVariant = (row, amount) => {
    const selectionKey = retailVariantKey(row);

    setForm((current) => {
      const existingIndex = current.items.findIndex(
        (line) => line.selectionKey === selectionKey
      );

      const existingQuantity =
        existingIndex >= 0
          ? Number(current.items[existingIndex].quantity || 0)
          : 0;

      const nextQuantity = Math.max(
        0,
        Math.min(996, existingQuantity + amount)
      );

      if (nextQuantity === 0) {
        return {
          ...current,
          items: current.items.filter(
            (line) => line.selectionKey !== selectionKey
          ),
        };
      }

      if (existingIndex >= 0) {
        return {
          ...current,
          items: current.items.map((line, index) =>
            index === existingIndex
              ? { ...line, quantity: nextQuantity }
              : line
          ),
        };
      }

      return {
        ...current,
        items: [
          ...current.items,
          {
            ...emptyLine(),
            flavorId: row.flavor_id,
            sizeId: row.size_id,
            texture: row.texture,
            selectionKey,
            quantity: nextQuantity,
          },
        ],
      };
    });

    if (error) setError("");
    if (success) setSuccess("");
  };

  const selectedLines = useMemo(
    () =>
      form.items
        .map((line) => ({
          line,
          catalogRow: catalogByKey.get(line.selectionKey),
        }))
        .filter(({ catalogRow }) => Boolean(catalogRow)),
    [catalogByKey, form.items]
  );

  const totalQuantity = selectedLines.reduce(
    (sum, { line }) => sum + Number(line.quantity || 0),
    0
  );

  const subtotalCents = selectedLines.reduce(
    (sum, { line, catalogRow }) =>
      sum +
      Number(line.quantity || 0) *
        Number(catalogRow.unit_price_cents || 0),
    0
  );

  
  const partnerZip = String(savedDeliveryProfile?.zip || "")
    .replace(/\D/g, "")
    .slice(0, 5);

  const partnerDeliveryAddress = [
    savedDeliveryProfile?.business_name,
    savedDeliveryProfile?.address_line1,
    savedDeliveryProfile?.address_line2,
    savedDeliveryProfile?.city,
    savedDeliveryProfile?.state,
    partnerZip,
  ]
    .filter(Boolean)
    .join(", ");

  const hasSavedDeliveryProfile = Boolean(
    savedDeliveryProfile?.business_name &&
      savedDeliveryProfile?.phone &&
      savedDeliveryProfile?.address_line1 &&
      savedDeliveryProfile?.city &&
      savedDeliveryProfile?.state &&
      partnerZip.length === 5
  );

  const deliveryZone =
    form.fulfillmentMethod === "delivery"
      ? deliveryZones.find(
          (zone) =>
            Array.isArray(zone?.zips) &&
            zone.zips.includes(partnerZip)
        ) || null
      : null;

  const deliveryOutOfArea =
    form.fulfillmentMethod === "delivery" &&
    partnerZip.length === 5 &&
    !deliveryZone;

  const deliveryBelowMinimum =
    form.fulfillmentMethod === "delivery" &&
    deliveryZone &&
    subtotalCents < Number(deliveryZone.minimum_cents || 0);

  const deliveryFeeCents =
    form.fulfillmentMethod === "delivery" &&
    deliveryZone &&
    !deliveryBelowMinimum
      ? Number(deliveryZone.fee_cents || 0)
      : 0;

  const checkoutBaseCents =
    subtotalCents + deliveryFeeCents;

  const squareCheckoutFeeCents =
    Math.round(checkoutBaseCents * 0.04);

  const estimatedTotalCents =
    checkoutBaseCents + squareCheckoutFeeCents;

const duplicateSelections = useMemo(() => {
    const keys = form.items
      .map((line) => line.selectionKey)
      .filter(Boolean);
    return new Set(keys).size !== keys.length;
  }, [form.items]);

  const validLines =
    form.items.length > 0 &&
    selectedLines.length === form.items.length &&
    selectedLines.every(({ line }) => {
      const quantity = Number(line.quantity);
      const onHand =
        line.onHandCount === "" ? null : Number(line.onHandCount);

      return (
        Number.isInteger(quantity) &&
        quantity >= 6 &&
        quantity <= 996 &&
        quantity % 6 === 0 &&
        (onHand === null ||
          (Number.isInteger(onHand) && onHand >= 0 && onHand <= 9999))
      );
    });

  const canSubmit =
    !loading &&
    !busy &&
    catalog.length > 0 &&
    validLines &&
    !duplicateSelections &&
    totalQuantity >= 12 &&
    ["pickup", "delivery"].includes(form.fulfillmentMethod) &&
    (
      form.fulfillmentMethod !== "delivery" ||
      (
        partnerZip.length === 5 &&
        deliveryZone &&
        !deliveryBelowMinimum
      )
    );

  const updateDeliveryAddressDraft = (key, value) => {
    setDeliveryAddressDraft((current) => ({
      ...current,
      [key]: value,
    }));
    setAddressNotice("");
    setAddressError("");
  };

  const saveDeliveryAddress = async () => {
    const nextAddress = {
      addressLine1: String(
        deliveryAddressDraft.addressLine1 || ""
      ).trim(),
      addressLine2: String(
        deliveryAddressDraft.addressLine2 || ""
      ).trim(),
      city: String(deliveryAddressDraft.city || "").trim(),
      state: String(deliveryAddressDraft.state || "")
        .trim()
        .toUpperCase(),
      zip: String(deliveryAddressDraft.zip || "")
        .replace(/\D/g, "")
        .slice(0, 5),
    };

    if (!nextAddress.addressLine1) {
      setAddressError("Enter a delivery street address.");
      return;
    }

    if (!nextAddress.city) {
      setAddressError("Enter a delivery city.");
      return;
    }

    if (!/^[A-Z]{2}$/.test(nextAddress.state)) {
      setAddressError("Enter a 2-letter state abbreviation.");
      return;
    }

    if (!/^\d{5}$/.test(nextAddress.zip)) {
      setAddressError("Enter a valid 5-digit ZIP code.");
      return;
    }

    setAddressSaving(true);
    setAddressError("");
    setAddressNotice("");

    try {
      const saved =
        await api.updateMyPartnerDeliveryAddress(nextAddress);

      const normalized = {
        address_line1: saved.address_line1 || nextAddress.addressLine1,
        address_line2: saved.address_line2 || "",
        city: saved.city || nextAddress.city,
        state: saved.state || nextAddress.state,
        zip: saved.zip || nextAddress.zip,
      };

      setSavedDeliveryAddress(normalized);
      setDeliveryAddressDraft({
        addressLine1: normalized.address_line1,
        addressLine2: normalized.address_line2,
        city: normalized.city,
        state: normalized.state,
        zip: normalized.zip,
      });
      setAddressNotice(
        "Delivery address saved to your partner profile."
      );
    } catch (saveError) {
      setAddressError(
        saveError?.message ||
          "The delivery address could not be saved."
      );
    } finally {
      setAddressSaving(false);
    }
  };


  const updateDeliveryProfileDraft = (key, value) => {
    setDeliveryProfileDraft((current) => ({
      ...current,
      [key]: value,
    }));
    setProfileNotice("");
    setProfileError("");
  };

  const saveDeliveryProfile = async () => {
    const nextProfile = {
      businessName: String(deliveryProfileDraft.businessName || "").trim(),
      phone: String(deliveryProfileDraft.phone || "").trim(),
      deliveryNotes: String(deliveryProfileDraft.deliveryNotes || "").trim(),
      addressLine1: String(deliveryProfileDraft.addressLine1 || "").trim(),
      addressLine2: String(deliveryProfileDraft.addressLine2 || "").trim(),
      city: String(deliveryProfileDraft.city || "").trim(),
      state: String(deliveryProfileDraft.state || "").trim().toUpperCase(),
      zip: String(deliveryProfileDraft.zip || "")
        .replace(/\D/g, "")
        .slice(0, 5),
    };

    if (!nextProfile.businessName) {
      setProfileError("Enter the business or delivery location name.");
      return;
    }

    if (!nextProfile.phone) {
      setProfileError("Enter a delivery phone number.");
      return;
    }

    if (!nextProfile.addressLine1) {
      setProfileError("Enter a delivery street address.");
      return;
    }

    if (!nextProfile.city) {
      setProfileError("Enter a delivery city.");
      return;
    }

    if (!/^[A-Z]{2}$/.test(nextProfile.state)) {
      setProfileError("Enter a 2-letter state abbreviation.");
      return;
    }

    if (!/^\d{5}$/.test(nextProfile.zip)) {
      setProfileError("Enter a valid 5-digit ZIP code.");
      return;
    }

    setProfileSaving(true);
    setProfileError("");
    setProfileNotice("");

    try {
      const saved =
        await api.updateMyPartnerDeliveryProfile(nextProfile);

      const normalized = {
        business_name: saved.business_name || nextProfile.businessName,
        phone: saved.phone || nextProfile.phone,
        delivery_notes: saved.delivery_notes || nextProfile.deliveryNotes,
        address_line1: saved.address_line1 || nextProfile.addressLine1,
        address_line2: saved.address_line2 || "",
        city: saved.city || nextProfile.city,
        state: saved.state || nextProfile.state,
        zip: saved.zip || nextProfile.zip,
      };

      setSavedDeliveryProfile(normalized);
      setDeliveryProfileDraft({
        businessName: normalized.business_name,
        phone: normalized.phone,
        deliveryNotes: normalized.delivery_notes,
        addressLine1: normalized.address_line1,
        addressLine2: normalized.address_line2,
        city: normalized.city,
        state: normalized.state,
        zip: normalized.zip,
      });

      setProfileNotice(
        "Delivery profile saved. Your ZIP-based delivery fee has been updated."
      );
      setEditingDeliveryProfile(false);
    } catch (saveError) {
      setProfileError(
        saveError?.message ||
          "The delivery profile could not be saved."
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const addSelectedToCart = async (event) => {
    event.preventDefault();

    if (
      duplicateSelections ||
      selectedLines.length === 0 ||
      !selectedLines.every(
        ({ line }) =>
          Number.isInteger(Number(line.quantity)) &&
          Number(line.quantity) >= 6 &&
          Number(line.quantity) <= 996 &&
          Number(line.quantity) % 6 === 0
      )
    ) {
      setError(
        duplicateSelections
          ? "Combine duplicate flavor, size, and texture selections."
          : "Choose valid six-jar increments before adding to your cart."
      );
      return;
    }

    setError("");
    setSuccess("");

    try {
      addPartnerStoreItems(
        selectedLines.map(({ line, catalogRow }) => ({
          id: `retail:${catalogRow.flavor_id}|${catalogRow.size_id}|${catalogRow.texture}`,
          category: "retail",
          flavorId: catalogRow.flavor_id,
          flavorName: catalogRow.flavor_name,
          sizeId: catalogRow.size_id,
          sizeLabel:
            catalogRow.size_label ||
            ({ "4oz": "4 oz", "7oz": "7 oz", "1lb": "1 lb" }[
              catalogRow.size_id
            ] || catalogRow.size_id),
          texture: catalogRow.texture,
          quantity: Number(line.quantity),
          unitPriceCents: Number(
            catalogRow.unit_price_cents || 0
          ),
          notes: line.notes.trim() || null,
        }))
      );

      setSuccess(
        `${totalQuantity} retail jar${totalQuantity === 1 ? "" : "s"} added to the cart in the top banner.`
      );
    } catch (cartError) {
      setError(
        cartError?.message ||
          "The retail items could not be added to your cart."
      );
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    if (!["pickup", "delivery"].includes(form.fulfillmentMethod)) {
      setError("Choose Pickup or Local Delivery.");
      return;
    }

    if (form.fulfillmentMethod === "delivery") {
      if (partnerZip.length !== 5) {
        setError(
          "Your partner account needs a valid 5-digit ZIP code before delivery can be selected."
        );
        return;
      }

      if (!deliveryZone) {
        setError(
          "That ZIP is outside the current local delivery area. Choose free Coleman pickup or contact NectarFusions."
        );
        return;
      }

      if (deliveryBelowMinimum) {
        setError(
          `This delivery zone requires at least ${money(
            Number(deliveryZone.minimum_cents || 0)
          )} in products before the delivery fee.`
        );
        return;
      }
    }

    if (!canSubmit) {
      setError(
        duplicateSelections
          ? "Combine duplicate flavor, size, and texture selections."
          : "Finish the size and texture for every selected flavor, then choose quantities in multiples of six totaling at least twelve jars."
      );
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const submission =
        await api.submitPartnerReplenishment({
          neededBy: form.neededBy || null,
          fulfillmentMethod: form.fulfillmentMethod,
          preferredDeliveryDays:
            form.preferredDeliveryDays,
          currentInventoryNotes:
            form.currentInventoryNotes.trim() || null,
          requestNotes:
            form.requestNotes.trim() || null,
          items: selectedLines.map(
            ({ line, catalogRow }) => ({
              flavor_id: catalogRow.flavor_id,
              size_id: catalogRow.size_id,
              texture: catalogRow.texture,
              quantity: Number(line.quantity),
              on_hand_count:
                line.onHandCount === ""
                  ? null
                  : Number(line.onHandCount),
              notes: line.notes.trim() || null,
            })
          ),
        });

      setSuccess(
        submission.emailWarning
          ? `Request ${submission.requestId} was saved. The immediate owner email could not be confirmed, so NectarFusions will verify the request in Admin.`
          : `Request ${submission.requestId} was submitted and NectarFusions was notified.`
      );
      setForm({
        neededBy: "",
        fulfillmentMethod: "",
        preferredDeliveryDays: [],
        currentInventoryNotes: "",
        requestNotes: "",
        items: [],
      });
      setSelectedFlavorIds([]);
      await load();
      setTab("history");
    } catch (submitError) {
      const message = actionMessage(submitError);
      const submissionUnknown =
        submitError?.code ===
          "REPLENISHMENT_SUBMISSION_UNKNOWN" ||
        /failed to fetch|networkerror|load failed/i.test(
          message
        );

      if (!submissionUnknown) {
        setError(
          `${message} Review the form and try again. If the problem continues, contact NectarFusions at info@nectar-fusions.com.`
        );
      } else {
        setError(
          "We could not confirm whether your request was submitted because the connection was interrupted. We are checking Request History before you try again."
        );

        try {
          const previousIds = new Set(
            requests.map((request) => request.id)
          );
          const nextRequests =
            await api.listPartnerReplenishmentRequests();
          const recoveredRequest = nextRequests.find(
            (request) => !previousIds.has(request.id)
          );

          setRequests(nextRequests);
          setTab("history");

          if (recoveredRequest) {
            setError("");
            setSuccess(
              `Request ${recoveredRequest.id} appears in Request History. It was received, so do not submit it again.`
            );
          } else {
            setError(
              "No new request appeared in Request History. Return to New Request and try once more. If it still does not submit, contact NectarFusions at info@nectar-fusions.com."
            );
          }
        } catch {
          setError(
            "We could not confirm the submission or refresh Request History. Do not submit again yet. Contact NectarFusions at info@nectar-fusions.com so the request can be checked safely."
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteHistoryRequest = async (request) => {
    if (actionBusyId) return;

    if (
      !window.confirm(
        "Delete this request from your history? It will disappear from your Partner Portal, but NectarFusions will retain the internal business record."
      )
    ) {
      return;
    }

    setActionBusyId(request.id);
    setError("");
    setSuccess("");

    try {
      await api.hideMyPartnerReplenishmentRequest(request.id);
      setRequests((current) =>
        current.filter((item) => item.id !== request.id)
      );
      setSuccess("Request deleted from your history.");
    } catch (deleteError) {
      setError(
        deleteError?.message ||
          "The request could not be deleted from your history."
      );
    } finally {
      setActionBusyId("");
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
      !window.confirm(
        "Cancel this replenishment request? This cannot be undone."
      )
    ) {
      return;
    }

    setActionBusyId(request.id);
    setError("");
    setSuccess("");

    try {
      await api.partnerReplenishmentAction(
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
          ? "Your information was sent for review."
          : "The request was cancelled."
      );
      await load();
    } catch (actionError) {
      setError(actionMessage(actionError));
    } finally {
      setActionBusyId("");
    }
  };

  return (
    <section
      className="nf-replenishment-panel"
      aria-labelledby="partner-replenishment-title"
    >
      <style>{REPLENISHMENT_CSS}</style>

      {primaryActionRequest && (
        <div
          className="nf-replenishment-action-alert"
          role="alert"
          aria-live="polite"
        >
          <div>
            <strong>Action required</strong>
            <span>{actionRequiredCopy}</span>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => setTab("history")}
          >
            Review Request
          </button>
        </div>
      )}

      <div className="nf-replenishment-header">
        <div>
          <div className="nf-modern-kicker">Retail replenishment</div>
          <h2 id="partner-replenishment-title">
            Build Your Reorder
          </h2>
          <p>
            Select the flavors you need, then choose quantities for any available size and texture combination. Everything stays in one place.
          </p>
        </div>

        <div className="nf-replenishment-price-note">
          12 jar minimum
        </div>
      </div>

      <div className="nf-replenishment-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "new"}
          onClick={() => setTab("new")}
        >
          New Request
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          data-action-required={
            actionRequiredRequests.length > 0
              ? "true"
              : "false"
          }
          onClick={() => setTab("history")}
        >
          Request History ({requests.length})
          {actionRequiredRequests.length > 0
            ? ` · Action Needed (${actionRequiredRequests.length})`
            : ""}
        </button>
      </div>

      {error && (
        <div
          className="nf-replenishment-message"
          data-kind="error"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          className="nf-replenishment-message"
          data-kind="success"
          role="status"
        >
          {success}
        </div>
      )}

      {loading ? (
        <div className="nf-replenishment-empty" role="status">
          Loading secure replenishment tools…
        </div>
      ) : tab === "new" ? (
        <form className="nf-replenishment-form" onSubmit={submit}>
          <div className="nf-replenishment-top-grid">
            <div className="nf-replenishment-field">
              <label htmlFor="replenishment-needed-by">
                Needed by
              </label>
              <input
                id="replenishment-needed-by"
                type="date"
                min={todayIso()}
                value={form.neededBy}
                onChange={(event) =>
                  updateForm("neededBy", event.target.value)
                }
              />
            </div>

            <div className="nf-replenishment-fulfillment">
              <span className="nf-replenishment-section-label">
                Fulfillment
              </span>

              <div className="nf-replenishment-fulfillment-options">
                <button
                  type="button"
                  aria-pressed={form.fulfillmentMethod === "pickup"}
                  onClick={() =>
                    updateForm("fulfillmentMethod", "pickup")
                  }
                >
                  <strong>Pickup</strong>
                  <span>FREE</span>
                  <small>
                    122 E Railway St, Coleman, MI 48618
                  </small>
                </button>

                <button
                  type="button"
                  aria-pressed={form.fulfillmentMethod === "delivery"}
                  onClick={() =>
                    updateForm("fulfillmentMethod", "delivery")
                  }
                >
                  <strong>Local Delivery</strong>
                  <span>Fee based on ZIP</span>
                  <small>
                    {partnerZip
                      ? `Partner ZIP ${partnerZip}`
                      : "Partner ZIP required"}
                  </small>
                </button>
              </div>
            </div>
          </div>

          {form.fulfillmentMethod === "delivery" && (
            <div className="nf-replenishment-delivery-card">
              {hasSavedDeliveryProfile && !editingDeliveryProfile ? (
                <div className="nf-replenishment-profile-summary">
                  <div className="nf-replenishment-profile-summary-head">
                    <div>
                      <span>Delivery address</span>
                      <strong>{savedDeliveryProfile.business_name}</strong>
                    </div>

                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setEditingDeliveryProfile(true)}
                    >
                      Change Delivery Address
                    </button>
                  </div>

                  <div className="nf-replenishment-profile-summary-grid">
                    <div>
                      <span>Address</span>
                      <strong>{partnerDeliveryAddress}</strong>
                    </div>

                    <div>
                      <span>Phone</span>
                      <strong>{savedDeliveryProfile.phone}</strong>
                    </div>

                    {savedDeliveryProfile.delivery_notes && (
                      <div className="full">
                        <span>Delivery notes</span>
                        <strong>{savedDeliveryProfile.delivery_notes}</strong>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="nf-replenishment-profile-editor">
                  <div className="nf-replenishment-profile-head">
                    <div>
                      <span>Delivery profile</span>
                      <strong>
                        Save these details for future partner deliveries.
                      </strong>
                    </div>

                    {hasSavedDeliveryProfile && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setDeliveryProfileDraft({
                            businessName: savedDeliveryProfile.business_name || "",
                            phone: savedDeliveryProfile.phone || "",
                            deliveryNotes: savedDeliveryProfile.delivery_notes || "",
                            addressLine1: savedDeliveryProfile.address_line1 || "",
                            addressLine2: savedDeliveryProfile.address_line2 || "",
                            city: savedDeliveryProfile.city || "",
                            state: savedDeliveryProfile.state || "",
                            zip: savedDeliveryProfile.zip || "",
                          });
                          setProfileError("");
                          setProfileNotice("");
                          setEditingDeliveryProfile(false);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="nf-replenishment-profile-grid">
                    <label className="nf-replenishment-field full">
                      <span>Business / location name</span>
                      <input
                        type="text"
                        value={deliveryProfileDraft.businessName}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "businessName",
                            event.target.value
                          )
                        }
                        autoComplete="organization"
                      />
                    </label>

                    <label className="nf-replenishment-field full">
                      <span>Phone number</span>
                      <input
                        type="tel"
                        value={deliveryProfileDraft.phone}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "phone",
                            event.target.value
                          )
                        }
                        autoComplete="tel"
                      />
                    </label>

                    <label className="nf-replenishment-field full">
                      <span>Street address</span>
                      <input
                        type="text"
                        value={deliveryProfileDraft.addressLine1}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "addressLine1",
                            event.target.value
                          )
                        }
                        autoComplete="street-address"
                      />
                    </label>

                    <label className="nf-replenishment-field full">
                      <span>Address line 2 <small>Optional</small></span>
                      <input
                        type="text"
                        value={deliveryProfileDraft.addressLine2}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "addressLine2",
                            event.target.value
                          )
                        }
                        autoComplete="address-line2"
                      />
                    </label>

                    <label className="nf-replenishment-field">
                      <span>City</span>
                      <input
                        type="text"
                        value={deliveryProfileDraft.city}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "city",
                            event.target.value
                          )
                        }
                        autoComplete="address-level2"
                      />
                    </label>

                    <label className="nf-replenishment-field">
                      <span>State</span>
                      <input
                        type="text"
                        maxLength={2}
                        value={deliveryProfileDraft.state}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "state",
                            event.target.value
                              .replace(/[^a-z]/gi, "")
                              .toUpperCase()
                              .slice(0, 2)
                          )
                        }
                        autoComplete="address-level1"
                      />
                    </label>

                    <label className="nf-replenishment-field">
                      <span>ZIP code</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
                        value={deliveryProfileDraft.zip}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "zip",
                            event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 5)
                          )
                        }
                        autoComplete="postal-code"
                      />
                    </label>

                    <label className="nf-replenishment-field full">
                      <span>Delivery notes <small>Optional</small></span>
                      <textarea
                        maxLength={2000}
                        value={deliveryProfileDraft.deliveryNotes}
                        onChange={(event) =>
                          updateDeliveryProfileDraft(
                            "deliveryNotes",
                            event.target.value
                          )
                        }
                        placeholder="Examples: receiving entrance, call on arrival, loading dock instructions, delivery hours."
                      />
                    </label>
                  </div>

                  <div className="nf-replenishment-profile-actions">
                    <button
                      type="button"
                      className="btn solid"
                      disabled={profileSaving}
                      onClick={saveDeliveryProfile}
                    >
                      {profileSaving ? "Saving…" : "Save Delivery Profile"}
                    </button>
                  </div>

                  {profileNotice && (
                    <div
                      className="nf-replenishment-profile-success"
                      role="status"
                    >
                      {profileNotice}
                    </div>
                  )}

                  {profileError && (
                    <div
                      className="nf-replenishment-zone-warning"
                      role="alert"
                    >
                      {profileError}
                    </div>
                  )}
                </div>
              )}

              {partnerZip.length !== 5 ? (
                <div className="nf-replenishment-zone-warning">
                  Enter and save the delivery profile above so we can calculate the delivery fee for the ZIP code.
                </div>
              ) : deliveryOutOfArea ? (
                <div className="nf-replenishment-zone-warning">
                  We do not currently deliver to {partnerZip}. Choose free Coleman pickup or contact NectarFusions.
                </div>
              ) : deliveryZone ? (
                <div className="nf-replenishment-zone-details">
                  <div>
                    <span>Delivery zone</span>
                    <strong>{deliveryZone.name}</strong>
                  </div>
                  <div>
                    <span>Your ZIP delivery fee</span>
                    <strong>{money(deliveryZone.fee_cents)}</strong>
                  </div>
                  <div>
                    <span>Delivery schedule</span>
                    <strong>
                      {deliveryZone.day_label || "Local route"}
                      {deliveryZone.window_label
                        ? ` · ${deliveryZone.window_label}`
                        : ""}
                    </strong>
                  </div>
                </div>
              ) : null}

              {deliveryZone && !deliveryOutOfArea && (
                <div className="nf-replenishment-partner-delivery-note">
                  Retail and wholesale partner delivery does not qualify for free delivery. The delivery charge is based on the saved ZIP code.
                </div>
              )}
            </div>
          )}

          <div className="nf-replenishment-minimum-explainer">
            <strong>Why is there a 12 jar minimum?</strong>
            <p>
              Replenishment is packed in six jar increments. A 12 jar minimum keeps packing and fulfillment efficient while still letting you mix any available flavors, sizes, and textures in the same order.
            </p>
          </div>

          <div className="nf-replenishment-items">
            <div className="nf-replenishment-items-header">
              <div>
                <h3>Select Flavors</h3>
                <p>
                  Select as many as you need. Each flavor shows every available size and texture below.
                </p>
              </div>
              <div className="nf-replenishment-selected-count">
                {selectedFlavorIds.length} selected
              </div>
            </div>

            <div className="nf-replenishment-flavor-grid">
              {retailFlavorOptions.map((flavor) => {
                const selected =
                  selectedFlavorIds.includes(flavor.id);

                return (
                  <button
                    key={flavor.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      toggleRetailFlavor(flavor.id)
                    }
                  >
                    <span className="nf-replenishment-flavor-check">
                      {selected ? "✓" : "+"}
                    </span>
                    <span>{flavor.name}</span>
                  </button>
                );
              })}
            </div>

            {selectedFlavorIds.length === 0 ? (
              <div className="nf-replenishment-selection-empty">
                Select one or more flavors above to start your reorder.
              </div>
            ) : (
              <div className="nf-replenishment-flavor-orders">
                {selectedFlavorIds.map((flavorId) => {
                  const flavor =
                    retailFlavorOptions.find(
                      (item) => item.id === flavorId
                    );
                  const variants =
                    retailVariantsForFlavor(flavorId);

                  return (
                    <section
                      className="nf-replenishment-flavor-order"
                      key={flavorId}
                    >
                      <div className="nf-replenishment-flavor-order-head">
                        <div>
                          <strong>
                            {flavor?.name || "Selected flavor"}
                          </strong>
                          <span>
                            Set a quantity for every size or texture you want.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            toggleRetailFlavor(flavorId)
                          }
                        >
                          Remove flavor
                        </button>
                      </div>

                      <div className="nf-replenishment-variant-list">
                        {variants.map((row) => {
                          const line =
                            retailVariantLine(row);
                          const quantity =
                            Number(line?.quantity || 0);

                          return (
                            <article
                              className="nf-replenishment-variant"
                              key={retailVariantKey(row)}
                              data-selected={
                                quantity > 0
                                  ? "true"
                                  : "false"
                              }
                            >
                              <div className="nf-replenishment-variant-info">
                                <strong>
                                  {row.size_label}
                                </strong>
                                <span>
                                  {cleanStatus(row.texture)}
                                </span>
                                <small>
                                  {money(row.unit_price_cents)} each
                                </small>
                              </div>

                              <div className="nf-replenishment-variant-quantity">
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustRetailVariant(row, -6)
                                  }
                                  disabled={quantity === 0}
                                >
                                  −
                                </button>
                                <div>
                                  <strong>{quantity}</strong>
                                  <span>jars</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustRetailVariant(row, 6)
                                  }
                                >
                                  +
                                </button>
                              </div>

                              <div className="nf-replenishment-variant-total">
                                <span>Line total</span>
                                <strong>
                                  {quantity > 0
                                    ? money(
                                        Number(
                                          row.unit_price_cents
                                        ) * quantity
                                      )
                                    : "—"}
                                </strong>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>

          <details className="nf-replenishment-order-options">
            <summary>Optional request details</summary>
            <div className="nf-replenishment-order-options-body">
              {form.fulfillmentMethod === "delivery" && (
                <fieldset className="nf-replenishment-days">
                  <legend>Preferred delivery days</legend>
                  <div className="nf-replenishment-day-grid">
                    {DAYS.map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={form.preferredDeliveryDays.includes(
                            value
                          )}
                          onChange={() => toggleDay(value)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              <div className="nf-replenishment-field full">
                <label htmlFor="replenishment-inventory">
                  Current inventory notes
                </label>
                <textarea
                  id="replenishment-inventory"
                  maxLength={5000}
                  value={form.currentInventoryNotes}
                  onChange={(event) =>
                    updateForm(
                      "currentInventoryNotes",
                      event.target.value
                    )
                  }
                  placeholder="Optional: fastest sellers, low stock concerns, or current inventory."
                />
              </div>

              <div className="nf-replenishment-field full">
                <label htmlFor="replenishment-notes">
                  Request notes
                </label>
                <textarea
                  id="replenishment-notes"
                  maxLength={5000}
                  value={form.requestNotes}
                  onChange={(event) =>
                    updateForm(
                      "requestNotes",
                      event.target.value
                    )
                  }
                  placeholder="Optional order notes."
                />
              </div>
            </div>
          </details>

          <div className="nf-replenishment-pricing-summary">
            <div>
              <span>Products</span>
              <strong>{money(subtotalCents)}</strong>
            </div>

            <div>
              <span>
                {form.fulfillmentMethod === "delivery"
                  ? "Local delivery"
                  : form.fulfillmentMethod === "pickup"
                    ? "Coleman pickup"
                    : "Fulfillment"}
              </span>
              <strong>
                {form.fulfillmentMethod === "delivery"
                  ? deliveryZone && !deliveryBelowMinimum
                    ? money(deliveryFeeCents)
                    : "—"
                  : form.fulfillmentMethod === "pickup"
                    ? "FREE"
                    : "Select"}
              </strong>
            </div>

            <div>
              <span>Processing fee (4%)</span>
              <strong>
                {subtotalCents > 0
                  ? money(squareCheckoutFeeCents)
                  : money(0)}
              </strong>
            </div>

            <div className="nf-replenishment-pricing-total">
              <span>Estimated total</span>
              <strong>{money(estimatedTotalCents)}</strong>
            </div>

            <div className="nf-replenishment-order-stats">
              <span>
                {selectedLines.length} product{" "}
                {selectedLines.length === 1 ? "line" : "lines"}
              </span>
              <span>{totalQuantity} jars</span>
              <strong
                data-met={totalQuantity >= 12 ? "true" : "false"}
              >
                {totalQuantity >= 12
                  ? "✓ 12 jar minimum reached"
                  : `${Math.max(
                      0,
                      12 - totalQuantity
                    )} more jars needed`}
              </strong>
            </div>

            {deliveryBelowMinimum && deliveryZone && (
              <div className="nf-replenishment-zone-warning">
                Add{" "}
                {money(
                  Math.max(
                    0,
                    Number(
                      deliveryZone.minimum_cents || 0
                    ) - subtotalCents
                  )
                )}{" "}
                more in products to qualify for delivery.
              </div>
            )}
          </div>

          <div className="nf-replenishment-dual-actions">
            <button
              type="button"
              className="btn ghost nf-replenishment-submit"
              onClick={addSelectedToCart}
            >
              {busy ? "Working…" : "Add to Cart"}
            </button>

            <button
            type="submit"
            className="btn solid nf-replenishment-submit"
            disabled={!canSubmit}
          >
            {busy
              ? "Submitting Request…"
              : "Submit Order Request"}
          </button>
          </div>
        </form>
      ) : requests.length === 0 ? (
        <div className="nf-replenishment-empty">
          No replenishment requests have been submitted yet.
        </div>
      ) : (
        <div className="nf-replenishment-history">
          {requests.map((request) => {
            const mayCancel = [
              "submitted",
              "under_review",
              "needs_information",
              "quoted",
            ].includes(request.status);
            const mayDeleteFromHistory = [
              "fulfilled",
              "cancelled",
              "declined",
            ].includes(request.status);
            const items = Array.isArray(request.items)
              ? request.items
              : [];

            return (
              <article
                className="nf-replenishment-request"
                key={request.id}
              >
                <div className="nf-replenishment-request-head">
                  <div>
                    <h3>
                      Request submitted{" "}
                      {dateTime(request.submitted_at)}
                    </h3>
                    <p>Request ID: {request.id}</p>
                  </div>
                  <span
                    className="nf-replenishment-status"
                    data-status={request.status}
                  >
                    {cleanStatus(request.status)}
                  </span>
                </div>

                <div className="nf-replenishment-request-body">
                  <div className="nf-replenishment-request-meta">
                    <div>
                      <span>Needed by</span>
                      <strong>{shortDate(request.needed_by)}</strong>
                    </div>
                    <div>
                      <span>Fulfillment</span>
                      <strong>
                        {cleanStatus(
                          request.fulfillment_method || "flexible"
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Requested subtotal</span>
                      <strong>
                        {money(
                          request.requested_subtotal_cents
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Confirmed total</span>
                      <strong>
                        {request.confirmed_total_cents === null ||
                        request.confirmed_total_cents === undefined
                          ? "Pending quote"
                          : money(
                              request.confirmed_total_cents
                            )}
                      </strong>
                    </div>
                  </div>

                  <div className="nf-replenishment-request-items">
                    {items.map((item) => (
                      <div
                        className="nf-replenishment-request-item"
                        key={item.id}
                      >
                        <strong>{item.flavor_name}</strong>
                        <span>
                          {item.size_id} ·{" "}
                          {cleanStatus(item.texture)}
                        </span>
                        <span>
                          {item.quantity} jars ·{" "}
                          {money(item.line_total_cents)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {request.partner_response && (
                    <div className="nf-replenishment-response">
                      <strong>NectarFusions response</strong>
                      <br />
                      {request.partner_response}
                    </div>
                  )}

                  {request.status === "needs_information" && (
                    <div className="nf-replenishment-reply">
                      <label
                        htmlFor={`replenishment-reply-${request.id}`}
                      >
                        Requested information
                      </label>
                      <textarea
                        id={`replenishment-reply-${request.id}`}
                        maxLength={5000}
                        value={replyById[request.id] || ""}
                        onChange={(event) =>
                          setReplyById((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn solid"
                        disabled={actionBusyId === request.id}
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

                  <div className="nf-replenishment-actions">
                    {request.status === "quoted" && (
                      <button
                        type="button"
                        className="btn solid"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          runAction(request, "accept")
                        }
                      >
                        Accept Quote
                      </button>
                    )}

                    {mayCancel && (
                      <button
                        type="button"
                        className="btn ghost"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          runAction(request, "cancel")
                        }
                      >
                        Cancel Request
                      </button>
                    )}

                    {mayDeleteFromHistory && (
                      <button
                        type="button"
                        className="btn ghost nf-replenishment-delete-history"
                        disabled={actionBusyId === request.id}
                        onClick={() =>
                          deleteHistoryRequest(request)
                        }
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
