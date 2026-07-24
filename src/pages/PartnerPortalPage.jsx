import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

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
  grid-template-columns:repeat(3,minmax(0,1fr));
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

  const account = access.account;
  const mapping = access.mapping;
  const partnerName =
    account?.public_name ||
    account?.business_name ||
    "NectarFusions Partner";

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
                </div>

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
                      Current line sheets, product guidance, merchandising
                      materials, and approved downloads will appear here.
                    </p>
                  </article>

                  <article className="nf-partner-dashboard-card">
                    <h3>Events and Visibility</h3>
                    <p>
                      Eligible partners will be able to submit events for
                      NectarFusions review before public publication.
                    </p>
                  </article>
                </div>

                <div className="nf-partner-program-summary">
                  <strong>Current retail wholesale structure:</strong>{" "}
                  7 oz and 1 lb jars only. Opening orders require at least
                  24 units, reorders require at least 12 units, and the
                  standard case pack is six units per flavor and size unless
                  a mixed case is approved in writing.
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
