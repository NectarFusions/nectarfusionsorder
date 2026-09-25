import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import PartnerEventsPanel from "./PartnerEventsPanel";
import PartnerOrderingPanel from "./PartnerOrderingPanel";
import PartnerPricingGuide from "./PartnerPricingGuide";
import PartnerCartDrawer from "./PartnerCartDrawer";

const PORTAL_CSS = `
.nf-partner-portal-page {
  min-height:100vh;
  padding-bottom:150px;
  background:
    radial-gradient(circle at 90% 8%,rgba(247,196,28,.14),transparent 26%),
    linear-gradient(180deg,#FFFDF8 0%,#F7F0E6 100%);
}
.nf-partner-portal-main {
  width:min(1080px,calc(100% - 32px));
  margin:0 auto;
  padding:42px 0 80px;
}
.nf-partner-portal-shell {
  overflow:hidden;
  border:1px solid #DDD0C0;
  border-radius:28px;
  background:#FFFFFF;
  box-shadow:0 22px 55px rgba(48,31,18,.13);
}
.nf-partner-portal-banner {
  padding:clamp(28px,5vw,52px);
  background:
    radial-gradient(circle at 92% 12%,rgba(247,196,28,.18),transparent 28%),
    radial-gradient(circle at 10% 88%,rgba(114,183,228,.18),transparent 32%),
    linear-gradient(145deg,#0F2F44 0%,#15506D 52%,#1E7BA0 100%);
  color:#FFFFFF;
}
.nf-partner-portal-banner h2 {
  max-width:720px;
  margin:10px 0 0;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(48px,7vw,76px);
  line-height:.92;
  letter-spacing:.015em;
}
.nf-partner-portal-banner h2 span { color:#F7C41C; }
.nf-partner-portal-banner p {
  max-width:680px;
  margin:18px 0 0;
  color:#F6ECDD;
  line-height:1.7;
}
.nf-partner-portal-body {
  padding:clamp(22px,4vw,42px);
}
.nf-partner-login-grid {
  display:grid;
  grid-template-columns:minmax(0,.8fr) minmax(320px,1.2fr);
  gap:32px;
  align-items:start;
}
.nf-partner-login-copy h3,
.nf-partner-dashboard-title {
  margin:8px 0 12px;
  font-family:'Bebas Neue',Impact,sans-serif;
  color:#23170F;
  font-size:42px;
  line-height:.95;
}
.nf-partner-login-copy p {
  color:#62554A;
  line-height:1.75;
}
.nf-partner-login-card {
  display:grid;
  gap:15px;
  padding:24px;
  border:1px solid #D9C8B4;
  border-radius:20px;
  background:#FFFCF7;
}
.nf-partner-login-field {
  display:grid;
  gap:7px;
}
.nf-partner-login-field label {
  color:#4A3313;
  font-size:14px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-partner-login-field input {
  width:100%;
  min-height:50px;
  padding:12px 14px;
  border:1.5px solid #CDB58D;
  border-radius:12px;
  background:#FFFFFF;
  color:#17120E;
  font:inherit;
  box-sizing:border-box;
}
.nf-partner-login-field input:focus {
  border-color:#167BB6;
  outline:3px solid rgba(36,160,237,.14);
}
.nf-partner-portal-error {
  padding:12px 14px;
  border:1px solid #E1A3A3;
  border-radius:12px;
  background:#FFF2F2;
  color:#8C2525;
  line-height:1.55;
}
.nf-partner-portal-status {
  display:grid;
  justify-items:center;
  gap:12px;
  padding:42px 24px;
  text-align:center;
}
.nf-partner-portal-spinner {
  width:38px;
  height:38px;
  border:4px solid #D9EAF4;
  border-top-color:#167BB6;
  border-radius:50%;
  animation:nfPartnerSpin .8s linear infinite;
}
@keyframes nfPartnerSpin {
  to { transform:rotate(360deg); }
}
.nf-partner-access-banner {
  display:flex;
  justify-content:space-between;
  gap:18px;
  align-items:center;
  padding:18px 20px;
  border:1px solid #A9D2B6;
  border-radius:16px;
  background:#F3FBF5;
}
.nf-partner-access-banner strong {
  display:block;
  color:#285A37;
  font-size:17px;
}
.nf-partner-access-banner span {
  display:block;
  margin-top:4px;
  color:#51715A;
  font-size:14px;
}
.nf-partner-resource-panel {
  margin-top:22px;
  padding:clamp(20px,3vw,30px);
  border:1px solid #C9DFEB;
  border-radius:22px;
  background:
    radial-gradient(circle at 96% 8%,rgba(36,160,237,.12),transparent 28%),
    linear-gradient(145deg,#FFFFFF,#F4FAFD);
}
.nf-partner-resource-header {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
}
.nf-partner-resource-header h2 {
  margin:6px 0 8px;
  color:#23170F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  line-height:1;
}
.nf-partner-resource-header p {
  max-width:680px;
  margin:0;
  color:#61717B;
  line-height:1.65;
}
.nf-partner-resource-count {
  flex:0 0 auto;
  padding:9px 13px;
  border:1px solid #9CCBE5;
  border-radius:999px;
  background:#E9F6FD;
  color:#175D85;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-partner-resource-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
  margin-top:18px;
}
.nf-partner-resource-card {
  display:flex;
  flex-direction:column;
  min-height:190px;
  padding:18px;
  border:1px solid #D8E4EA;
  border-radius:17px;
  background:#FFFFFF;
  box-shadow:0 9px 22px rgba(32,86,122,.07);
}
.nf-partner-resource-category {
  align-self:flex-start;
  padding:6px 9px;
  border-radius:999px;
  background:#FFF0B5;
  color:#6E5100;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-partner-resource-card h3 {
  margin:12px 0 7px;
  color:#281A12;
  font-size:17px;
}
.nf-partner-resource-card p {
  margin:0;
  color:#6A5D52;
  font-size:14px;
  line-height:1.58;
}
.nf-partner-resource-meta {
  display:flex;
  flex-wrap:wrap;
  gap:7px 13px;
  margin-top:12px;
  color:#71808A;
  font-size:14px;
}
.nf-partner-resource-card .btn {
  width:100%;
  margin-top:auto;
  padding:10px 13px;
}
.nf-partner-resource-empty {
  margin-top:18px;
  padding:20px;
  border:1px dashed #B9CEDA;
  border-radius:15px;
  background:#FFFFFF;
  color:#687A85;
  line-height:1.6;
  text-align:center;
}
.nf-partner-resource-error {
  margin-top:16px;
  padding:12px 14px;
  border:1px solid #E1A3A3;
  border-radius:12px;
  background:#FFF2F2;
  color:#8C2525;
  line-height:1.55;
}
@media (max-width:760px) {
  .nf-partner-resource-header {
    flex-direction:column;
  }
  .nf-partner-resource-grid {
    grid-template-columns:1fr;
  }
}
.nf-partner-dashboard-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:14px;
  margin-top:22px;
}
.nf-partner-dashboard-card {
  min-height:150px;
  padding:20px;
  border:1px solid #E1D6C9;
  border-radius:18px;
  background:linear-gradient(145deg,#FFFFFF,#FBF7F1);
}
.nf-partner-dashboard-card h3 {
  margin:0 0 8px;
  color:#24170F;
  font-size:16px;
}
.nf-partner-dashboard-card p {
  margin:0;
  color:#67594D;
  font-size:14px;
  line-height:1.65;
}
.nf-partner-account-details {
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:10px;
  margin-top:20px;
}
.nf-partner-account-detail {
  padding:14px;
  border-radius:14px;
  background:#F1F8FC;
}
.nf-partner-account-detail span {
  display:block;
  color:#587386;
  font-size:14px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-partner-account-detail strong {
  display:block;
  margin-top:5px;
  color:#173C52;
}
.nf-partner-program-summary {
  margin-top:22px;
  padding:18px 20px;
  border-left:5px solid #F7C41C;
  border-radius:14px;
  background:#FFF9E8;
  color:#604A1C;
  line-height:1.7;
}
.nf-partner-progress-panel {
  margin-top:22px;
  padding:clamp(20px,3vw,30px);
  border:1px solid #D9C8B4;
  border-radius:22px;
  background:linear-gradient(145deg,#FFFEFB,#F7F1E8);
}
.nf-partner-progress-header {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:18px;
}
.nf-partner-progress-title {
  margin:6px 0 8px;
  color:#23170F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  line-height:1;
}
.nf-partner-progress-intro {
  max-width:660px;
  margin:0;
  color:#67594D;
  line-height:1.65;
}
.nf-partner-level-badge {
  flex:0 0 auto;
  padding:10px 14px;
  border:1px solid #E8C856;
  border-radius:999px;
  background:#FFF4BE;
  color:#59430F;
  font-size:14px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-partner-progress-stats {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:10px;
  margin-top:22px;
}
.nf-partner-progress-stat {
  min-height:94px;
  padding:16px;
  border-radius:16px;
  background:#FFFFFF;
  box-shadow:0 8px 20px rgba(52,33,18,.07);
}
.nf-partner-progress-stat span {
  display:block;
  color:#6B7D87;
  font-size:14px;
  font-weight:900;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nf-partner-progress-stat strong {
  display:block;
  margin-top:7px;
  color:#173C52;
  font-size:23px;
  line-height:1.15;
}
.nf-partner-progress-stat small {
  display:block;
  margin-top:6px;
  color:#75685D;
  line-height:1.45;
}
.nf-partner-progress-track {
  height:14px;
  margin-top:14px;
  overflow:hidden;
  border-radius:999px;
  background:#E8E0D7;
}
.nf-partner-progress-fill {
  height:100%;
  border-radius:inherit;
  background:linear-gradient(90deg,#167BB6,#F7C41C);
  transition:width .35s ease;
}
.nf-partner-current-step {
  margin-top:18px;
  padding:18px 20px;
  border-left:5px solid #167BB6;
  border-radius:15px;
  background:#EEF8FD;
}
.nf-partner-current-step span {
  color:#55798D;
  font-size:14px;
  font-weight:900;
  letter-spacing:.07em;
  text-transform:uppercase;
}
.nf-partner-current-step h3 {
  margin:7px 0 6px;
  color:#173C52;
  font-size:19px;
}
.nf-partner-current-step p {
  margin:0;
  color:#4D6877;
  line-height:1.6;
}
.nf-partner-current-step-meta {
  display:flex;
  flex-wrap:wrap;
  gap:8px 16px;
  margin-top:10px;
  color:#5D7582;
  font-size:14px;
}
.nf-partner-progress-subheading {
  margin:28px 0 12px;
  color:#2B1C13;
  font-size:19px;
}
.nf-partner-milestone-list {
  display:grid;
  gap:10px;
}
.nf-partner-milestone {
  display:grid;
  grid-template-columns:42px minmax(0,1fr) auto;
  gap:13px;
  align-items:start;
  padding:16px;
  border:1px solid #E4D9CD;
  border-radius:16px;
  background:#FFFFFF;
}
.nf-partner-milestone-marker {
  display:grid;
  place-items:center;
  width:38px;
  height:38px;
  border-radius:50%;
  background:#ECE5DD;
  color:#67594D;
  font-size:14px;
  font-weight:900;
}
.nf-partner-milestone-marker[data-status="completed"] {
  background:#DDF3E3;
  color:#27613A;
}
.nf-partner-milestone-marker[data-status="in_progress"] {
  background:#DDF1FC;
  color:#146A9A;
}
.nf-partner-milestone-marker[data-status="waiting_on_partner"],
.nf-partner-milestone-marker[data-status="waiting_on_nectarfusions"] {
  background:#FFF0C4;
  color:#7A5700;
}
.nf-partner-milestone-marker[data-status="skipped"] {
  background:#EEE9F6;
  color:#65587A;
}
.nf-partner-milestone-copy h4 {
  margin:1px 0 5px;
  color:#271A12;
  font-size:15px;
}
.nf-partner-milestone-copy p {
  margin:0;
  color:#6A5D52;
  font-size:14px;
  line-height:1.55;
}
.nf-partner-milestone-copy p + p {
  margin-top:7px;
}
.nf-partner-visible-note {
  padding:9px 11px;
  border-radius:10px;
  background:#F7F2E8;
}
.nf-partner-milestone-side {
  display:grid;
  justify-items:end;
  gap:7px;
  min-width:130px;
}
.nf-partner-status-pill {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:6px 9px;
  border-radius:999px;
  background:#EFE9E1;
  color:#62564C;
  font-size:14px;
  font-weight:900;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.nf-partner-status-pill[data-status="completed"],
.nf-partner-status-pill[data-status="achieved"] {
  background:#DFF3E5;
  color:#285F3A;
}
.nf-partner-status-pill[data-status="in_progress"] {
  background:#DDF1FC;
  color:#146A9A;
}
.nf-partner-status-pill[data-status="waiting_on_partner"],
.nf-partner-status-pill[data-status="waiting_on_nectarfusions"] {
  background:#FFF0C4;
  color:#745400;
}
.nf-partner-milestone-side small {
  color:#817469;
  text-align:right;
  line-height:1.4;
}
.nf-partner-goals-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:12px;
}
.nf-partner-goal-card {
  padding:17px;
  border:1px solid #E1D6C9;
  border-radius:16px;
  background:#FFFFFF;
}
.nf-partner-goal-top {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:10px;
}
.nf-partner-goal-card h4 {
  margin:0;
  color:#271A12;
  font-size:16px;
}
.nf-partner-goal-card p {
  margin:8px 0 0;
  color:#6A5D52;
  font-size:14px;
  line-height:1.55;
}
.nf-partner-goal-values {
  display:flex;
  justify-content:space-between;
  gap:14px;
  margin-top:14px;
  color:#5C5148;
  font-size:14px;
}
.nf-partner-goal-values strong {
  color:#173C52;
}
.nf-partner-goal-track {
  height:9px;
  margin-top:8px;
  overflow:hidden;
  border-radius:999px;
  background:#E8E0D7;
}
.nf-partner-goal-fill {
  height:100%;
  border-radius:inherit;
  background:linear-gradient(90deg,#167BB6,#F7C41C);
}
.nf-partner-empty-goals {
  padding:18px;
  border:1px dashed #CDBFAF;
  border-radius:15px;
  background:#FFFFFF;
  color:#706258;
  line-height:1.6;
}
@media (max-width:760px) {
  .nf-partner-progress-header {
    flex-direction:column;
  }
  .nf-partner-progress-stats,
  .nf-partner-goals-grid {
    grid-template-columns:1fr;
  }
  .nf-partner-milestone {
    grid-template-columns:38px minmax(0,1fr);
  }
  .nf-partner-milestone-side {
    grid-column:2;
    justify-items:start;
    min-width:0;
  }
  .nf-partner-milestone-side small {
    text-align:left;
  }
}
.nf-partner-portal-actions {
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:20px;
}
@media (max-width:760px) {
  .nf-partner-login-grid,
  .nf-partner-dashboard-grid,
  .nf-partner-account-details {
    grid-template-columns:1fr;
  }
  .nf-partner-access-banner {
    align-items:flex-start;
    flex-direction:column;
  }
  .nf-partner-portal-main {
    width:min(100% - 20px,1080px);
    padding-top:20px;
  }
  .nf-partner-portal-shell {
    border-radius:22px;
  }
}

.nf-partner-workspace-head {
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:20px;
}
.nf-partner-workspace-head .nf-partner-dashboard-title {
  margin-bottom:8px;
}
.nf-partner-workspace-status {
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  align-items:center;
  color:#61717B;
  font-size:14px;
}
.nf-partner-workspace-status strong {
  padding:5px 9px;
  border-radius:999px;
  background:#EAF6ED;
  color:#285A37;
  font-size:14px;
}
.nf-partner-workspace-nav {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-top:22px;
  padding:6px;
  border:1px solid #D8E4EA;
  border-radius:14px;
  background:#F7FBFD;
}
.nf-partner-workspace-nav button {
  min-height:42px;
  padding:9px 16px;
  border:0;
  border-radius:10px;
  background:transparent;
  color:#496575;
  font:inherit;
  font-size:14px;
  font-weight:850;
  cursor:pointer;
}
.nf-partner-workspace-nav button[aria-current="page"] {
  background:#173C52;
  color:#FFFFFF;
}
.nf-partner-home {
  margin-top:22px;
}
.nf-partner-home-intro {
  max-width:700px;
}
.nf-partner-home-intro h3,
.nf-partner-workspace-section-head h3 {
  margin:7px 0 8px;
  color:#23170F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:36px;
  line-height:1;
}
.nf-partner-home-intro p,
.nf-partner-workspace-section-head p {
  margin:0;
  color:#64727A;
  font-size:14px;
  line-height:1.65;
}
.nf-partner-next-card {
  display:flex;
  justify-content:space-between;
  gap:20px;
  align-items:flex-start;
  margin-top:18px;
  padding:20px;
  border:1px solid #BBD9E8;
  border-radius:17px;
  background:#F1F9FD;
}
.nf-partner-next-card span {
  display:block;
  color:#587386;
  font-size:14px;
  font-weight:900;
  text-transform:uppercase;
}
.nf-partner-next-card h3 {
  margin:7px 0 5px;
  color:#173C52;
  font-size:18px;
}
.nf-partner-next-card p {
  margin:0;
  color:#5B7180;
  font-size:14px;
  line-height:1.6;
}
.nf-partner-next-card > strong {
  flex:0 0 auto;
  color:#173C52;
  font-size:14px;
}
.nf-partner-action-grid {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:12px;
  margin-top:14px;
}
.nf-partner-action-card {
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  min-height:190px;
  padding:20px;
  border:1px solid #DDE5EA;
  border-radius:17px;
  background:#FFFFFF;
  color:#2C2119;
  text-align:left;
  font:inherit;
  cursor:pointer;
  box-shadow:0 8px 22px rgba(32,86,122,.06);
}
.nf-partner-action-card:hover {
  border-color:#8FC4E4;
  transform:translateY(-1px);
}
.nf-partner-action-icon {
  width:38px;
  height:38px;
  display:grid;
  place-items:center;
  border-radius:11px;
  background:#EAF7FF;
  color:#167BB6;
  font-size:18px;
  font-weight:900;
}
.nf-partner-action-card strong {
  margin-top:14px;
  color:#23170F;
  font-size:17px;
}
.nf-partner-action-card small {
  margin-top:7px;
  color:#667780;
  font-size:14px;
  line-height:1.55;
}
.nf-partner-action-card em {
  margin-top:auto;
  padding-top:16px;
  color:#167BB6;
  font-size:14px;
  font-style:normal;
  font-weight:900;
}
.nf-partner-help-line {
  margin-top:18px;
  padding:14px 16px;
  border-radius:12px;
  background:#FFF9E8;
  color:#604A1C;
  font-size:14px;
}
.nf-partner-workspace-section {
  margin-top:22px;
}
.nf-partner-workspace-section-head {
  display:flex;
  justify-content:space-between;
  gap:20px;
  align-items:flex-start;
  margin-bottom:14px;
}
.nf-partner-workspace-section > .nf-partner-resource-empty {
  margin-top:0;
}
.nf-partner-resource-grid-simple {
  margin-top:0;
}
@media (max-width:760px) {
  .nf-partner-workspace-head,
  .nf-partner-workspace-section-head,
  .nf-partner-next-card {
    flex-direction:column;
  }
  .nf-partner-workspace-nav {
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .nf-partner-action-grid {
    grid-template-columns:1fr;
  }
  .nf-partner-action-card {
    min-height:165px;
  }
}
`;

const PARTNER_TYPE_CSS = `
.nf-partner-type-setup{display:grid;gap:20px;padding:clamp(22px,4vw,38px);border:1px solid #D8E4EA;border-radius:22px;background:linear-gradient(145deg,#FFFFFF,#F7FBFD)}
.nf-partner-type-setup h3{margin:6px 0 8px;color:#23170F;font-family:'Bebas Neue',Impact,sans-serif;font-size:40px;line-height:1}
.nf-partner-type-setup>p{margin:0;max-width:760px;color:#62554A;line-height:1.7}
.nf-partner-type-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.nf-partner-type-option{display:grid;gap:7px;min-height:150px;padding:18px;border:1.5px solid #D7C7B5;border-radius:16px;background:#fff;color:#2C2119;text-align:left;font:inherit;cursor:pointer}
.nf-partner-type-option strong{color:#173C52;font-size:18px}
.nf-partner-type-option span{color:#67594D;font-size:14px;line-height:1.55}
.nf-partner-type-option[data-selected="true"]{border-color:#173C52;background:#F0F7FB;box-shadow:0 0 0 2px rgba(23,60,82,.08)}
.nf-partner-type-help{padding:14px 16px;border:1px solid #E0D5C8;border-radius:14px;background:#FFFCF7}
.nf-partner-type-help summary{cursor:pointer;color:#173C52;font-weight:900}
.nf-partner-type-help div{display:grid;gap:10px;margin-top:12px;color:#65584D;font-size:14px;line-height:1.6}
.nf-partner-type-actions{display:flex;gap:10px;flex-wrap:wrap}
@media(max-width:760px){.nf-partner-type-options{grid-template-columns:1fr}}
`;

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const partnerTypeLabel = (value) =>
  value === "retail"
    ? "Retail Partner"
    : value === "wholesale"
      ? "Wholesale Partner"
      : value === "both"
        ? "Retail + Wholesale"
        : "Type Not Selected";

const formatPartnerDate = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const isResolvedMilestone = (status) =>
  status === "completed" || status === "skipped";

const goalProgressPercent = (goal) => {
  const target = Number(goal?.target_value);
  const current = Number(goal?.current_value);

  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(current) || current <= 0) return 0;

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
};

const formatGoalValue = (value, unitLabel) => {
  if (value === null || value === undefined || value === "") return "Not set";

  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);

  const unit = String(unitLabel || "").trim();
  const lowerUnit = unit.toLowerCase();

  if (
    unit === "$" ||
    lowerUnit === "usd" ||
    lowerUnit.includes("dollar")
  ) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(number);
  }

  const formatted = number.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

  return unit ? `${formatted} ${unit}` : formatted;
};

const PARTNER_RESOURCE_CATEGORIES = {
  line_sheet: "Line Sheet",
  w9: "W-9",
  insurance: "Insurance",
  shelf_card: "Shelf Card",
  product_care: "Product Care",
  terms: "Terms",
  process: "Process",
  event_material: "Event Material",
  other: "Other",
};

const partnerResourceCategory = (value) =>
  PARTNER_RESOURCE_CATEGORIES[value] || cleanStatus(value || "other");

const accessErrorMessage = (error) => {
  const message = String(error?.message || error || "");

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "The email or password was not recognized.";
  }

  return message || "Partner access could not be verified.";
};

export default function PartnerPortalPage({ Header, styles, onBack }) {
  const [access, setAccess] = useState({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resourceBusyId, setResourceBusyId] = useState("");
  const [resourceError, setResourceError] = useState("");
  const [portalSection, setPortalSection] = useState("home");
  const [partnerTypeDraft, setPartnerTypeDraft] = useState("");

  const canSubmit = useMemo(
    () => email.trim() && password && !busy,
    [email, password, busy]
  );

  const loadAccess = useCallback(async (currentSession) => {
    if (!currentSession?.user) {
      setAccess({ kind: "signed_out" });
      return;
    }

    setAccess({ kind: "loading" });

    try {
      const context = await api.getPartnerPortalContext();
      setAccess(context);
      setError("");
    } catch (accessError) {
      setAccess({ kind: "error" });
      setError(accessErrorMessage(accessError));
    }
  }, []);

  useEffect(() => {
    let active = true;

    api.session()
      .then((currentSession) => {
        if (active) loadAccess(currentSession);
      })
      .catch((sessionError) => {
        if (!active) return;
        setAccess({ kind: "error" });
        setError(accessErrorMessage(sessionError));
      });

    const { data } = api.onAuth((currentSession) => {
      if (active) loadAccess(currentSession);
    });

    return () => {
      active = false;
      data?.subscription?.unsubscribe();
    };
  }, [loadAccess]);

  const submit = async (event) => {
    event.preventDefault();

    if (!canSubmit) return;

    setBusy(true);
    setError("");

    try {
      const result = await api.signIn(email.trim(), password);
      setPassword("");
      await loadAccess(result?.session);
    } catch (signInError) {
      setError(accessErrorMessage(signInError));
      setAccess({ kind: "signed_out" });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    setError("");

    try {
      await api.signOut();
      setPassword("");
      setAccess({ kind: "signed_out" });
    } catch (signOutError) {
      setError(accessErrorMessage(signOutError));
    } finally {
      setBusy(false);
    }
  };

  const downloadResource = async (resource) => {
    if (resourceBusyId) return;

    setResourceBusyId(resource.id);
    setResourceError("");

    try {
      const signedUrl =
        await api.getPartnerResourceDownloadUrl(resource);

      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      setResourceError(
        downloadError?.message ||
          "The resource could not be downloaded."
      );
    } finally {
      setResourceBusyId("");
    }
  };

  const refreshPartnerContext = useCallback(async () => {
    const context = await api.getPartnerPortalContext();
    setAccess(context);
    return context;
  }, []);

  const savePartnerType = async () => {
    if (!partnerTypeDraft || busy) return;

    setBusy(true);
    setError("");

    try {
      await api.selectMyPartnerType(partnerTypeDraft);
      await refreshPartnerContext();
      setPortalSection("home");
    } catch (saveError) {
      setError(accessErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const account = access.account;
  const mapping = access.mapping;
  const partnerName =
    account?.public_name ||
    account?.business_name ||
    "NectarFusions Partner";

  const milestones = Array.isArray(access.milestones)
    ? access.milestones
    : [];

  const goals = Array.isArray(access.goals)
    ? access.goals
    : [];

  const resources = Array.isArray(access.resources)
    ? access.resources
    : [];

  const events = Array.isArray(access.events)
    ? access.events
    : [];

  const resolvedMilestoneCount = milestones.filter((milestone) =>
    isResolvedMilestone(milestone.status)
  ).length;

  const progressPercent = milestones.length
    ? Math.round((resolvedMilestoneCount / milestones.length) * 100)
    : 0;

  const currentMilestone =
    milestones.find(
      (milestone) => !isResolvedMilestone(milestone.status)
    ) || null;

  const partnerLevel = cleanStatus(account?.partner_level || "starter");

  return (
    <div className="nf nf-partner-portal-page">
      <style>{styles}</style>
      <style>{PORTAL_CSS}</style>
      <style>{PARTNER_TYPE_CSS}</style>

      <Header
        eyebrow="Secure Partner Access"
        title="PARTNER PORTAL"
        right={
          <button
            type="button"
            className="btn ghost nf-back-to-shop"
            onClick={onBack}
          >
            Back to partnership
          </button>
        }
      />

      <main className="nf-partner-portal-main">
        <section className="nf-partner-portal-shell">
          <div className="nf-partner-portal-banner">
            <div
              className="nf-modern-kicker"
              style={{ color: "#9ED8F4" }}
            >
              NectarFusions Partner Portal
            </div>
            <h2>
              Your Partner Tools, <span>One Secure Place</span>
            </h2>
          </div>

          <div className="nf-partner-portal-body">
            {access.kind === "loading" && (
              <div
                className="nf-partner-portal-status"
                role="status"
                aria-live="polite"
              >
                <div
                  className="nf-partner-portal-spinner"
                  aria-hidden="true"
                />
                <strong>Checking secure partner access…</strong>
              </div>
            )}

            {access.kind === "signed_out" && (
              <div className="nf-partner-login-grid">
                <div className="nf-partner-login-copy">
                  <div className="nf-modern-kicker">
                    Current partners
                  </div>
                  <h3>Sign In to Your Account</h3>
                  <p>
                    Use the email and password connected to your approved NectarFusions partner account.
                  </p>
                  <p>
                    Need help accessing your account? Contact{" "}
                    <strong>info@nectar-fusions.com</strong>.
                  </p>
                </div>

                <form
                  className="nf-partner-login-card"
                  onSubmit={submit}
                >
                  <div className="nf-partner-login-field">
                    <label htmlFor="partner-login-email">
                      Partner email
                    </label>
                    <input
                      id="partner-login-email"
                      type="email"
                      autoComplete="username"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        if (error) setError("");
                      }}
                    />
                  </div>

                  <div className="nf-partner-login-field">
                    <label htmlFor="partner-login-password">
                      Password
                    </label>
                    <input
                      id="partner-login-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        if (error) setError("");
                      }}
                    />
                  </div>

                  {error && (
                    <div
                      className="nf-partner-portal-error"
                      role="alert"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn solid"
                    disabled={!canSubmit}
                  >
                    {busy ? "Signing in…" : "Sign In"}
                  </button>
                </form>
              </div>
            )}

            {access.kind === "partner" && !account?.partner_type && (
              <section className="nf-partner-type-setup">
                <div>
                  <div className="nf-modern-kicker">One-time setup</div>
                  <h3>Choose Your Partner Type</h3>
                  <p>
                    Choose the option that best matches how your business will
                    work with NectarFusions. You only choose this once. If your
                    business changes later, NectarFusions can update it for you.
                  </p>
                </div>

                <div className="nf-partner-type-options">
                  <button
                    type="button"
                    className="nf-partner-type-option"
                    data-selected={partnerTypeDraft === "retail"}
                    onClick={() => setPartnerTypeDraft("retail")}
                  >
                    <strong>Retail Partner</strong>
                    <span>
                      I sell packaged NectarFusions jars directly to customers
                      from a store, boutique, farm market, café shelf, gift shop,
                      or similar retail business.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="nf-partner-type-option"
                    data-selected={partnerTypeDraft === "wholesale"}
                    onClick={() => setPartnerTypeDraft("wholesale")}
                  >
                    <strong>Wholesale Partner</strong>
                    <span>
                      I buy larger-format honey for foodservice, production,
                      hospitality, beverage programs, baking, or other business use.
                    </span>
                  </button>

                  <button
                    type="button"
                    className="nf-partner-type-option"
                    data-selected={partnerTypeDraft === "both"}
                    onClick={() => setPartnerTypeDraft("both")}
                  >
                    <strong>Both</strong>
                    <span>
                      My business both resells packaged NectarFusions jars and
                      uses or purchases larger wholesale formats.
                    </span>
                  </button>
                </div>

                <details className="nf-partner-type-help">
                  <summary>Not sure which type fits my business?</summary>
                  <div>
                    <p>
                      <strong>Choose Retail</strong> if customers will purchase
                      NectarFusions jars from your business.
                    </p>
                    <p>
                      <strong>Choose Wholesale</strong> if your business uses
                      NectarFusions honey behind the scenes or buys larger
                      containers for service, production, or recipes.
                    </p>
                    <p>
                      <strong>Choose Both</strong> if you do both. Gifts and
                      custom requests are available with every partner type.
                    </p>
                  </div>
                </details>

                {error && (
                  <div className="nf-partner-portal-error" role="alert">
                    {error}
                  </div>
                )}

                <div className="nf-partner-type-actions">
                  <button
                    type="button"
                    className="btn solid"
                    disabled={!partnerTypeDraft || busy}
                    onClick={savePartnerType}
                  >
                    {busy ? "Saving…" : "Save & Enter Partner Portal"}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={signOut}
                    disabled={busy}
                  >
                    Sign Out
                  </button>
                </div>
              </section>
            )}

            {access.kind === "partner" && account?.partner_type && (
              <>
                <div className="nf-partner-workspace-head">
                  <div>
                    <div className="nf-modern-kicker">Partner Dashboard</div>
                    <h2 className="nf-partner-dashboard-title">
                      Welcome, {partnerName}
                    </h2>
                    <div className="nf-partner-workspace-status">
                      <span>{account?.business_name}</span>
                      <strong>{partnerTypeLabel(account?.partner_type)}</strong>
                      {account?.relationship_status && (
                        <strong>{cleanStatus(account.relationship_status)}</strong>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn ghost"
                    onClick={signOut}
                    disabled={busy}
                  >
                    {busy ? "Signing out…" : "Sign Out"}
                  </button>
                </div>

                <nav className="nf-partner-workspace-nav" aria-label="Partner portal sections">
                  <button
                    type="button"
                    aria-current={portalSection === "home" ? "page" : undefined}
                    onClick={() => setPortalSection("home")}
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    aria-current={portalSection === "orders" ? "page" : undefined}
                    onClick={() => setPortalSection("orders")}
                  >
                    Orders
                  </button>
                  <button
                    type="button"
                    aria-current={portalSection === "pricing" ? "page" : undefined}
                    onClick={() => setPortalSection("pricing")}
                  >
                    Pricing Guide
                  </button>
                  <button
                    type="button"
                    aria-current={portalSection === "resources" ? "page" : undefined}
                    onClick={() => setPortalSection("resources")}
                  >
                    Resources
                  </button>
                  {(account?.event_submission_enabled || events.length > 0) && (
                    <button
                      type="button"
                      aria-current={portalSection === "events" ? "page" : undefined}
                      onClick={() => setPortalSection("events")}
                    >
                      Events
                    </button>
                  )}
                </nav>

                {portalSection === "home" && (
                  <section className="nf-partner-home">
                    <div className="nf-partner-home-intro">
                      <div className="nf-modern-kicker">Start here</div>
                      <h3>What Do You Need Today?</h3>
                      <p>
                        Choose an area below. Your portal keeps ordering, files, and partner activity in one place without showing everything at once.
                      </p>
                    </div>

                    <div className="nf-partner-next-card">
                      <div>
                        <span>Your next step</span>
                        <h3>
                          {currentMilestone
                            ? currentMilestone.title
                            : "You’re all caught up"}
                        </h3>
                        <p>
                          {currentMilestone?.next_action ||
                            "There is nothing you need to complete right now."}
                        </p>
                      </div>

                      {currentMilestone?.due_at && (
                        <strong>
                          Due {formatPartnerDate(currentMilestone.due_at)}
                        </strong>
                      )}
                    </div>

                    <div className="nf-partner-action-grid">
                      <button
                        type="button"
                        className="nf-partner-action-card"
                        onClick={() => setPortalSection("orders")}
                      >
                        <span className="nf-partner-action-icon">↻</span>
                        <strong>Orders</strong>
                        <small>
                          Reorder retail products or submit eligible wholesale and bulk requests.
                        </small>
                        <em>Open Orders →</em>
                      </button>

                      <button
                        type="button"
                        className="nf-partner-action-card"
                        onClick={() => setPortalSection("pricing")}
                      >
                        <span className="nf-partner-action-icon">$</span>
                        <strong>Pricing Guide</strong>
                        <small>
                          Reference the current pricing available for your partner type.
                        </small>
                        <em>View Pricing →</em>
                      </button>

                      <button
                        type="button"
                        className="nf-partner-action-card"
                        onClick={() => setPortalSection("resources")}
                      >
                        <span className="nf-partner-action-icon">↓</span>
                        <strong>Resources</strong>
                        <small>
                          Download current partner files and approved materials.
                        </small>
                        <em>View Resources →</em>
                      </button>

                      {(account?.event_submission_enabled || events.length > 0) && (
                        <button
                          type="button"
                          className="nf-partner-action-card"
                          onClick={() => setPortalSection("events")}
                        >
                          <span className="nf-partner-action-icon">◇</span>
                          <strong>Events</strong>
                          <small>
                            Create, review, or manage partner event submissions.
                          </small>
                          <em>Manage Events →</em>
                        </button>
                      )}
                    </div>

                    <div className="nf-partner-help-line">
                      Need help? <strong>info@nectar-fusions.com</strong>
                    </div>
                  </section>
                )}

                {portalSection === "orders" && (
                  <section className="nf-partner-workspace-section">
                    <div className="nf-partner-workspace-section-head">
                      <div>
                        <div className="nf-modern-kicker">Partner ordering</div>
                        <h3>Orders</h3>
                        <p>Place a new request or review previous partner orders.</p>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setPortalSection("home")}
                      >
                        Back to Home
                      </button>
                    </div>
                    <PartnerOrderingPanel account={account} />
                    <PartnerCartDrawer account={account} />
                  </section>
                )}

                {portalSection === "pricing" && (
                  <section className="nf-partner-workspace-section">
                    <div className="nf-partner-workspace-section-head">
                      <div>
                        <div className="nf-modern-kicker">Current partner pricing</div>
                        <h3>Pricing Guide</h3>
                        <p>
                          Pricing shown here is matched to your saved partner type.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setPortalSection("home")}
                      >
                        Back to Home
                      </button>
                    </div>

                    <PartnerPricingGuide account={account} />
                  </section>
                )}

                {portalSection === "resources" && (
                  <section className="nf-partner-workspace-section">
                    <div className="nf-partner-workspace-section-head">
                      <div>
                        <div className="nf-modern-kicker">Approved downloads</div>
                        <h3>Resources</h3>
                        <p>Download the current files and materials available to your account.</p>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setPortalSection("home")}
                      >
                        Back to Home
                      </button>
                    </div>

                    {resourceError && (
                      <div className="nf-partner-resource-error" role="alert">
                        {resourceError}
                      </div>
                    )}

                    {resources.length === 0 ? (
                      <div className="nf-partner-resource-empty">
                        No partner resources are available right now.
                      </div>
                    ) : (
                      <div className="nf-partner-resource-grid nf-partner-resource-grid-simple">
                        {resources.map((resource) => (
                          <article
                            key={resource.id}
                            className="nf-partner-resource-card"
                          >
                            <span className="nf-partner-resource-category">
                              {partnerResourceCategory(resource.category)}
                            </span>

                            <h3>{resource.title}</h3>

                            {resource.description && (
                              <p>{resource.description}</p>
                            )}

                            <button
                              type="button"
                              className="btn solid"
                              disabled={resourceBusyId === resource.id}
                              onClick={() => downloadResource(resource)}
                            >
                              {resourceBusyId === resource.id
                                ? "Preparing Download…"
                                : "Download"}
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {portalSection === "events" &&
                  (account?.event_submission_enabled || events.length > 0) && (
                    <section className="nf-partner-workspace-section">
                      <div className="nf-partner-workspace-section-head">
                        <div>
                          <div className="nf-modern-kicker">Partner activity</div>
                          <h3>Events</h3>
                          <p>Create or review event submissions connected to your account.</p>
                        </div>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setPortalSection("home")}
                        >
                          Back to Home
                        </button>
                      </div>

                      <PartnerEventsPanel
                        account={account}
                        events={events}
                        onRefresh={refreshPartnerContext}
                      />
                    </section>
                  )}
              </>
            )}

            {access.kind === "admin" && (
              <div className="nf-partner-portal-status">
                <div className="nf-modern-kicker">
                  Administrator recognized
                </div>
                <h2 className="nf-partner-dashboard-title">
                  This Is a Partner Login
                </h2>
                <p>
                  Your authenticated account is an Admin account rather than
                  a partner account. Partner isolation is working correctly.
                </p>
                <div className="nf-partner-portal-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={onBack}
                  >
                    Back to partnership
                  </button>
                  <button
                    type="button"
                    className="btn solid"
                    onClick={signOut}
                    disabled={busy}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {access.kind === "unauthorized" && (
              <div className="nf-partner-portal-status">
                <div className="nf-modern-kicker">
                  Access not connected
                </div>
                <h2 className="nf-partner-dashboard-title">
                  Partner Access Is Not Enabled
                </h2>
                <p>
                  This Supabase login is valid, but it is not connected to an
                  active approved NectarFusions partner account.
                </p>

                {error && (
                  <div
                    className="nf-partner-portal-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  className="btn solid"
                  onClick={signOut}
                  disabled={busy}
                >
                  Sign Out
                </button>
              </div>
            )}

            {access.kind === "error" && (
              <div className="nf-partner-portal-status">
                <div className="nf-modern-kicker">
                  Access check interrupted
                </div>
                <h2 className="nf-partner-dashboard-title">
                  We Could Not Verify This Account
                </h2>

                <div
                  className="nf-partner-portal-error"
                  role="alert"
                >
                  {error}
                </div>

                <button
                  type="button"
                  className="btn ghost"
                  onClick={signOut}
                  disabled={busy}
                >
                  Clear Session
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
