import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import PartnerEventsPanel from "./PartnerEventsPanel";
import PartnerReplenishmentPanel from "./PartnerReplenishmentPanel";

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
    radial-gradient(circle at 92% 12%,rgba(247,196,28,.22),transparent 28%),
    linear-gradient(145deg,#21140D,#3A2518 58%,#173C52);
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
  font-size:11px;
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
  font-size:13px;
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
  font-size:11px;
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
  font-size:9.5px;
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
  font-size:13px;
  line-height:1.58;
}
.nf-partner-resource-meta {
  display:flex;
  flex-wrap:wrap;
  gap:7px 13px;
  margin-top:12px;
  color:#71808A;
  font-size:11px;
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
  font-size:13px;
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
  font-size:10px;
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
  font-size:12px;
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
  font-size:10px;
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
  font-size:10px;
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
  font-size:12px;
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
  font-size:13px;
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
  font-size:13px;
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
  font-size:10px;
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
  font-size:13px;
  line-height:1.55;
}
.nf-partner-goal-values {
  display:flex;
  justify-content:space-between;
  gap:14px;
  margin-top:14px;
  color:#5C5148;
  font-size:12px;
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
`;

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

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
              style={{ color: "#72B7E4" }}
            >
              Approved NectarFusions partners
            </div>
            <h2>
              Your Partner Tools, <span>One Secure Place</span>
            </h2>
            <p>
              Sign in using the email address connected to your approved
              NectarFusions partner account.
            </p>
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
                    Partner access is available only to approved accounts
                    connected by NectarFusions. Passwords are managed securely
                    through Supabase Auth and are never stored in the Partner
                    Portal tables.
                  </p>
                  <p>
                    Need account help? Contact{" "}
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

            {access.kind === "partner" && (
              <>
                <div className="nf-partner-access-banner">
                  <div>
                    <strong>
                      Secure partner access confirmed
                    </strong>
                    <span>
                      Signed in as {mapping?.email || "approved partner"}
                    </span>
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

                <h2 className="nf-partner-dashboard-title">
                  Welcome, {partnerName}
                </h2>

                <div className="nf-partner-account-details">
                  <div className="nf-partner-account-detail">
                    <span>Business</span>
                    <strong>{account?.business_name}</strong>
                  </div>
                  <div className="nf-partner-account-detail">
                    <span>Account status</span>
                    <strong>
                      {cleanStatus(account?.relationship_status)}
                    </strong>
                  </div>
                  <div className="nf-partner-account-detail">
                    <span>Your role</span>
                    <strong>
                      {cleanStatus(mapping?.partner_role)}
                    </strong>
                  </div>
                  <div className="nf-partner-account-detail">
                    <span>Partner level</span>
                    <strong>{partnerLevel}</strong>
                  </div>
                </div>

                <PartnerReplenishmentPanel />

                <section
                  className="nf-partner-progress-panel"
                  aria-labelledby="partner-progress-title"
                >
                  <div className="nf-partner-progress-header">
                    <div>
                      <div className="nf-modern-kicker">
                        Partnership journey
                      </div>
                      <h2
                        id="partner-progress-title"
                        className="nf-partner-progress-title"
                      >
                        Partnership Progress
                      </h2>
                      <p className="nf-partner-progress-intro">
                        Follow your completed steps, current responsibility,
                        upcoming actions, and measurable partnership goals.
                      </p>
                    </div>

                    <div className="nf-partner-level-badge">
                      {partnerLevel} Partner
                    </div>
                  </div>

                  <div className="nf-partner-progress-stats">
                    <div className="nf-partner-progress-stat">
                      <span>Overall progress</span>
                      <strong>{progressPercent}%</strong>
                      <small>
                        Based on visible milestones that are completed or
                        intentionally skipped.
                      </small>
                    </div>

                    <div className="nf-partner-progress-stat">
                      <span>Milestones resolved</span>
                      <strong>
                        {resolvedMilestoneCount} of {milestones.length}
                      </strong>
                      <small>
                        NectarFusions updates official milestone statuses.
                      </small>
                    </div>

                    <div className="nf-partner-progress-stat">
                      <span>Goals assigned</span>
                      <strong>{goals.length}</strong>
                      <small>
                        Goals may include launch, sales, reorder,
                        merchandising, event, or level targets.
                      </small>
                    </div>
                  </div>

                  <div
                    className="nf-partner-progress-track"
                    role="progressbar"
                    aria-label="Partnership progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={progressPercent}
                  >
                    <div
                      className="nf-partner-progress-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="nf-partner-current-step">
                    <span>Your next step</span>
                    <h3>
                      {currentMilestone
                        ? currentMilestone.title
                        : "All visible milestones are resolved"}
                    </h3>
                    <p>
                      {currentMilestone?.next_action ||
                        "NectarFusions will add the next action when the partnership advances."}
                    </p>

                    {currentMilestone && (
                      <div className="nf-partner-current-step-meta">
                        <strong>
                          Responsible:{" "}
                          {cleanStatus(
                            currentMilestone.responsible_party
                          )}
                        </strong>

                        {currentMilestone.due_at && (
                          <span>
                            Due:{" "}
                            {formatPartnerDate(
                              currentMilestone.due_at
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <h3 className="nf-partner-progress-subheading">
                    Milestones
                  </h3>

                  <div className="nf-partner-milestone-list">
                    {milestones.map((milestone, index) => (
                      <article
                        key={milestone.id || milestone.milestone_key}
                        className="nf-partner-milestone"
                      >
                        <div
                          className="nf-partner-milestone-marker"
                          data-status={milestone.status}
                          aria-hidden="true"
                        >
                          {milestone.status === "completed"
                            ? "✓"
                            : index + 1}
                        </div>

                        <div className="nf-partner-milestone-copy">
                          <h4>{milestone.title}</h4>

                          {milestone.description && (
                            <p>{milestone.description}</p>
                          )}

                          {!isResolvedMilestone(milestone.status) &&
                            milestone.next_action && (
                              <p>
                                <strong>Next:</strong>{" "}
                                {milestone.next_action}
                              </p>
                            )}

                          {milestone.partner_visible_notes && (
                            <p className="nf-partner-visible-note">
                              <strong>Partner note:</strong>{" "}
                              {milestone.partner_visible_notes}
                            </p>
                          )}
                        </div>

                        <div className="nf-partner-milestone-side">
                          <span
                            className="nf-partner-status-pill"
                            data-status={milestone.status}
                          >
                            {cleanStatus(milestone.status)}
                          </span>

                          <small>
                            {cleanStatus(
                              milestone.responsible_party
                            )}
                          </small>

                          {milestone.due_at && (
                            <small>
                              Due{" "}
                              {formatPartnerDate(milestone.due_at)}
                            </small>
                          )}

                          {milestone.completed_at && (
                            <small>
                              Completed{" "}
                              {formatPartnerDate(
                                milestone.completed_at
                              )}
                            </small>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>

                  <h3 className="nf-partner-progress-subheading">
                    Partnership Goals
                  </h3>

                  {goals.length === 0 ? (
                    <div className="nf-partner-empty-goals">
                      No goals have been assigned yet. NectarFusions can add
                      measurable targets and next actions without changing
                      your published wholesale pricing.
                    </div>
                  ) : (
                    <div className="nf-partner-goals-grid">
                      {goals.map((goal) => {
                        const goalPercent =
                          goalProgressPercent(goal);

                        return (
                          <article
                            key={goal.id}
                            className="nf-partner-goal-card"
                          >
                            <div className="nf-partner-goal-top">
                              <div>
                                <h4>{goal.title}</h4>
                                <p>
                                  {cleanStatus(goal.goal_type)}
                                </p>
                              </div>

                              <span
                                className="nf-partner-status-pill"
                                data-status={goal.status}
                              >
                                {cleanStatus(goal.status)}
                              </span>
                            </div>

                            {goal.description && (
                              <p>{goal.description}</p>
                            )}

                            <div className="nf-partner-goal-values">
                              <span>
                                Current:{" "}
                                <strong>
                                  {formatGoalValue(
                                    goal.current_value,
                                    goal.unit_label
                                  )}
                                </strong>
                              </span>
                              <span>
                                Target:{" "}
                                <strong>
                                  {formatGoalValue(
                                    goal.target_value,
                                    goal.unit_label
                                  )}
                                </strong>
                              </span>
                            </div>

                            <div
                              className="nf-partner-goal-track"
                              role="progressbar"
                              aria-label={`${goal.title} progress`}
                              aria-valuemin="0"
                              aria-valuemax="100"
                              aria-valuenow={goalPercent}
                            >
                              <div
                                className="nf-partner-goal-fill"
                                style={{ width: `${goalPercent}%` }}
                              />
                            </div>

                            {goal.next_action && (
                              <p>
                                <strong>Next:</strong>{" "}
                                {goal.next_action}
                              </p>
                            )}

                            {goal.partner_visible_notes && (
                              <p className="nf-partner-visible-note">
                                <strong>Partner note:</strong>{" "}
                                {goal.partner_visible_notes}
                              </p>
                            )}

                            {goal.due_on && (
                              <p>
                                <strong>Due:</strong>{" "}
                                {formatPartnerDate(goal.due_on)}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section
                  className="nf-partner-resource-panel"
                  aria-labelledby="partner-resource-title"
                >
                  <div className="nf-partner-resource-header">
                    <div>
                      <div className="nf-modern-kicker">
                        Approved downloads
                      </div>
                      <h2 id="partner-resource-title">
                        Partner Resources
                      </h2>
                      <p>
                        Access current files approved for your partner
                        type. Private download links expire shortly after
                        they are created.
                      </p>
                    </div>

                    <div className="nf-partner-resource-count">
                      {resources.length}{" "}
                      {resources.length === 1
                        ? "Resource"
                        : "Resources"}
                    </div>
                  </div>

                  {resourceError && (
                    <div
                      className="nf-partner-resource-error"
                      role="alert"
                    >
                      {resourceError}
                    </div>
                  )}

                  {resources.length === 0 ? (
                    <div className="nf-partner-resource-empty">
                      No approved resources are available for this
                      partner account yet.
                    </div>
                  ) : (
                    <div className="nf-partner-resource-grid">
                      {resources.map((resource) => (
                        <article
                          key={resource.id}
                          className="nf-partner-resource-card"
                        >
                          <span className="nf-partner-resource-category">
                            {partnerResourceCategory(
                              resource.category
                            )}
                          </span>

                          <h3>{resource.title}</h3>

                          {resource.description && (
                            <p>{resource.description}</p>
                          )}

                          <div className="nf-partner-resource-meta">
                            {resource.version_label && (
                              <span>
                                Version {resource.version_label}
                              </span>
                            )}

                            {resource.effective_at && (
                              <span>
                                Effective{" "}
                                {formatPartnerDate(
                                  resource.effective_at
                                )}
                              </span>
                            )}

                            {resource.expires_at && (
                              <span>
                                Available through{" "}
                                {formatPartnerDate(
                                  resource.expires_at
                                )}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            className="btn solid"
                            disabled={
                              resourceBusyId === resource.id
                            }
                            onClick={() =>
                              downloadResource(resource)
                            }
                          >
                            {resourceBusyId === resource.id
                              ? "Preparing Download…"
                              : "Download Resource"}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <PartnerEventsPanel
                  account={account}
                  events={events}
                  onRefresh={refreshPartnerContext}
                />

                <div className="nf-partner-dashboard-grid">
                  <article className="nf-partner-dashboard-card">
                    <h3>Replenishment Requests</h3>
                    <p>
                      Submit restock needs using the approved 7 oz and
                      1 lb wholesale product formats. The complete request
                      workflow is the next portal module.
                    </p>
                  </article>

                  <article className="nf-partner-dashboard-card">
                    <h3>Partner Resources</h3>
                    <p>
                      Approved private downloads are available in the
                      resource library above. Availability is based on
                      resource status and partner type.
                    </p>
                  </article>

                  <article className="nf-partner-dashboard-card">
                    <h3>Events and Visibility</h3>
                    <p>
                      Create drafts, upload private flyers, and submit events
                      for NectarFusions approval in the event section above.
                    </p>
                  </article>
                </div>

                <div className="nf-partner-program-summary">
                  <strong>Current retail wholesale structure:</strong>{" "}
                  7 oz jars are $7.25 wholesale with a $12.00 suggested retail,
                  and 1 lb jars are $12.00 wholesale with a $20.00 suggested
                  retail. Opening orders require at least 24 units, reorders
                  require at least 12 units, and the standard case pack is six
                  units per flavor and size unless a mixed case is approved in
                  writing. The 4 oz jar remains reserved for NectarFusions
                  direct farmers-market sales. Partner levels change benefits
                  and access—not the published unit price.
                </div>
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
