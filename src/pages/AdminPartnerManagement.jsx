import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const ADMIN_PARTNER_CSS = `
.nf-apm {
  display:grid;
  gap:18px;
}
.nf-apm-intro {
  padding:18px 20px;
  border:1px solid #C9DFEB;
  border-left:5px solid #167BB6;
  border-radius:16px;
  background:#F2FAFE;
  color:#496879;
  line-height:1.65;
}
.nf-apm-intro strong {
  color:#173C52;
}
.nf-apm-layout {
  display:grid;
  grid-template-columns:minmax(230px,.68fr) minmax(0,1.32fr);
  gap:18px;
  align-items:start;
}
.nf-apm-sidebar {
  position:sticky;
  top:18px;
  display:grid;
  gap:10px;
  padding:15px;
  border:1px solid #E0D5C8;
  border-radius:18px;
  background:#FFFCF7;
}
.nf-apm-sidebar h3 {
  margin:0;
  color:#2B1C13;
  font-size:17px;
}
.nf-apm-partner-list {
  display:grid;
  gap:7px;
  max-height:620px;
  overflow:auto;
  padding-right:2px;
}
.nf-apm-partner-button {
  width:100%;
  display:grid;
  gap:3px;
  padding:12px;
  border:1px solid #DED3C7;
  border-radius:13px;
  background:#FFFFFF;
  color:#2B1C13;
  text-align:left;
  cursor:pointer;
}
.nf-apm-partner-button:hover {
  border-color:#7EB9DC;
  background:#F3FAFE;
}
.nf-apm-partner-button.selected {
  border-color:#167BB6;
  background:#EAF6FD;
  box-shadow:0 0 0 2px rgba(36,160,237,.10);
}
.nf-apm-partner-button strong {
  font-size:14px;
}
.nf-apm-partner-button span {
  color:#6A5D52;
  font-size:11px;
  line-height:1.4;
}
.nf-apm-main {
  min-width:0;
  display:grid;
  gap:16px;
}
.nf-apm-account-header {
  padding:20px;
  border:1px solid #DCCEBF;
  border-radius:19px;
  background:
    radial-gradient(circle at 95% 8%,rgba(247,196,28,.20),transparent 30%),
    linear-gradient(145deg,#FFFFFF,#FBF6EE);
}
.nf-apm-account-header h2 {
  margin:7px 0 6px;
  color:#25180F;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:40px;
  line-height:.95;
}
.nf-apm-account-header p {
  margin:0;
  color:#6A5D52;
  line-height:1.6;
}
.nf-apm-account-meta {
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  gap:9px;
  margin-top:16px;
}
.nf-apm-account-meta div {
  padding:12px;
  border-radius:12px;
  background:#F1F8FC;
}
.nf-apm-account-meta span {
  display:block;
  color:#607C8D;
  font-size:9px;
  font-weight:900;
  letter-spacing:.07em;
  text-transform:uppercase;
}
.nf-apm-account-meta strong {
  display:block;
  margin-top:5px;
  color:#173C52;
  font-size:13px;
  overflow-wrap:anywhere;
}
.nf-apm-section {
  padding:18px;
  border:1px solid #E0D5C8;
  border-radius:18px;
  background:#FFFFFF;
}
.nf-apm-section-heading {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:14px;
  margin-bottom:14px;
}
.nf-apm-section-heading h3 {
  margin:0;
  color:#2B1C13;
  font-size:20px;
}
.nf-apm-section-heading p {
  margin:5px 0 0;
  color:#71645A;
  font-size:12px;
  line-height:1.55;
}
.nf-apm-level-row {
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  align-items:end;
}
.nf-apm-field {
  display:grid;
  gap:6px;
}
.nf-apm-field > span {
  color:#654B1B;
  font-size:9.5px;
  font-weight:900;
  letter-spacing:.07em;
  text-transform:uppercase;
}
.nf-apm-field input,
.nf-apm-field select,
.nf-apm-field textarea,
.nf-apm-sidebar input {
  width:100%;
  box-sizing:border-box;
}
.nf-apm-field textarea {
  resize:vertical;
}
.nf-apm-message {
  padding:11px 13px;
  border-radius:12px;
  line-height:1.55;
}
.nf-apm-message.error {
  border:1px solid #E0A0A0;
  background:#FFF1F1;
  color:#8A2929;
}
.nf-apm-message.success {
  border:1px solid #A8D1B3;
  background:#F1FAF3;
  color:#315E3D;
}
.nf-apm-loading,
.nf-apm-empty {
  padding:26px 18px;
  border:1px dashed #CEBFAE;
  border-radius:15px;
  background:#FFFCF8;
  color:#706359;
  text-align:center;
  line-height:1.6;
}
.nf-apm-milestone-list,
.nf-apm-goal-list {
  display:grid;
  gap:12px;
}
.nf-apm-edit-card {
  padding:16px;
  border:1px solid #E2D8CD;
  border-radius:16px;
  background:linear-gradient(145deg,#FFFFFF,#FCF9F5);
}
.nf-apm-edit-card h4 {
  margin:0;
  color:#2A1C13;
  font-size:16px;
}
.nf-apm-edit-card-description {
  margin:7px 0 0;
  color:#74675D;
  font-size:12px;
  line-height:1.55;
}
.nf-apm-card-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
  margin-top:13px;
}
.nf-apm-card-grid .wide {
  grid-column:1 / -1;
}
.nf-apm-toggle {
  display:flex;
  align-items:center;
  gap:8px;
  min-height:46px;
  padding:10px 12px;
  border:1px solid #D9CDBC;
  border-radius:12px;
  background:#FFFDF9;
  color:#4F443B;
  font-size:12px;
  font-weight:750;
}
.nf-apm-toggle input {
  width:18px;
  height:18px;
  accent-color:#167BB6;
}
.nf-apm-card-actions {
  display:flex;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}
.nf-apm-card-actions .btn {
  padding:9px 13px;
}
.nf-apm-goal-create {
  margin-bottom:14px;
  padding:16px;
  border:2px solid #A9D5ED;
  border-radius:16px;
  background:#F3FAFE;
}
.nf-apm-goal-create h4 {
  margin:0 0 12px;
  color:#173C52;
  font-size:17px;
}
.nf-apm-progress-preview {
  margin-top:9px;
}
.nf-apm-progress-preview-row {
  display:flex;
  justify-content:space-between;
  gap:12px;
  margin-bottom:6px;
  color:#62727C;
  font-size:11px;
}
.nf-apm-progress-preview-track {
  height:8px;
  overflow:hidden;
  border-radius:999px;
  background:#E5DED6;
}
.nf-apm-progress-preview-fill {
  height:100%;
  border-radius:inherit;
  background:linear-gradient(90deg,#167BB6,#F7C41C);
}
@media (max-width:820px) {
  .nf-apm-layout {
    grid-template-columns:1fr;
  }
  .nf-apm-sidebar {
    position:static;
  }
  .nf-apm-partner-list {
    max-height:300px;
  }
}
@media (max-width:620px) {
  .nf-apm-account-meta,
  .nf-apm-card-grid,
  .nf-apm-level-row {
    grid-template-columns:1fr;
  }
  .nf-apm-card-grid .wide {
    grid-column:auto;
  }
  .nf-apm-section-heading {
    flex-direction:column;
  }
}
`;

const PARTNER_LEVELS = [
  ["starter", "Starter"],
  ["growth", "Growth"],
  ["strategic", "Strategic"],
];

const MILESTONE_STATUSES = [
  ["not_started", "Not Started"],
  ["in_progress", "In Progress"],
  ["waiting_on_partner", "Waiting on Partner"],
  ["waiting_on_nectarfusions", "Waiting on NectarFusions"],
  ["completed", "Completed"],
  ["skipped", "Skipped"],
];

const RESPONSIBLE_PARTIES = [
  ["partner", "Partner"],
  ["nectarfusions", "NectarFusions"],
  ["shared", "Shared"],
];

const GOAL_TYPES = [
  ["launch", "Launch"],
  ["sales", "Sales"],
  ["reorder", "Reorder"],
  ["merchandising", "Merchandising"],
  ["event", "Event"],
  ["engagement", "Engagement"],
  ["level_qualification", "Level Qualification"],
  ["other", "Other"],
];

const GOAL_STATUSES = [
  ["not_started", "Not Started"],
  ["in_progress", "In Progress"],
  ["achieved", "Achieved"],
  ["paused", "Paused"],
  ["cancelled", "Cancelled"],
];

const cleanStatus = (value) =>
  String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const dateInputValue = (value) =>
  value ? String(value).slice(0, 10) : "";

const optionalText = (value) => {
  const cleaned = String(value || "").trim();
  return cleaned || null;
};

const optionalNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const milestoneDueValue = (value) => {
  if (!value) return null;

  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const emptyGoal = () => ({
  title: "",
  description: "",
  goal_type: "other",
  status: "not_started",
  target_value: "",
  current_value: "",
  unit_label: "",
  start_on: "",
  due_on: "",
  next_action: "",
  partner_visible_notes: "",
  visible_to_partner: true,
});

const goalPercent = (goal) => {
  const current = Number(goal?.current_value);
  const target = Number(goal?.target_value);

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
};

export default function AdminPartnerManagement() {
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState({
    milestones: [],
    goals: [],
  });
  const [levelDraft, setLevelDraft] = useState("starter");
  const [newGoal, setNewGoal] = useState(emptyGoal);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId) || null,
    [accounts, selectedId]
  );

  const filteredAccounts = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return accounts;

    return accounts.filter((account) =>
      [
        account.business_name,
        account.public_name,
        account.contact_name,
        account.email,
        account.partner_level,
        account.relationship_status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [accounts, query]);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);

    try {
      const rows = await api.listAdminPartnerAccounts();

      setAccounts(rows);
      setSelectedId((current) =>
        current && rows.some((account) => account.id === current)
          ? current
          : rows[0]?.id || ""
      );
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (!selectedAccount) {
      setLevelDraft("starter");
      return;
    }

    setLevelDraft(selectedAccount.partner_level || "starter");
  }, [selectedAccount]);

  useEffect(() => {
    if (!selectedId) {
      setProgress({ milestones: [], goals: [] });
      return undefined;
    }

    let active = true;

    setLoadingProgress(true);
    setError("");
    setNotice("");
    setShowNewGoal(false);
    setNewGoal(emptyGoal());

    api.getAdminPartnerProgress(selectedId)
      .then((result) => {
        if (!active) return;
        setProgress(result);
      })
      .catch((loadError) => {
        if (!active) return;
        setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoadingProgress(false);
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  const updateMilestoneDraft = (id, patch) => {
    setProgress((current) => ({
      ...current,
      milestones: current.milestones.map((milestone) =>
        milestone.id === id ? { ...milestone, ...patch } : milestone
      ),
    }));
  };

  const updateGoalDraft = (id, patch) => {
    setProgress((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === id ? { ...goal, ...patch } : goal
      ),
    }));
  };

  const saveLevel = async () => {
    if (!selectedAccount || busyKey) return;

    setBusyKey("level");
    setError("");
    setNotice("");

    try {
      const updated = await api.updateAdminPartnerLevel(
        selectedAccount.id,
        levelDraft
      );

      setAccounts((current) =>
        current.map((account) =>
          account.id === updated.id ? { ...account, ...updated } : account
        )
      );

      setNotice("Partner level saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const saveMilestone = async (milestone) => {
    const key = `milestone:${milestone.id}`;

    if (busyKey) return;

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      const updated = await api.updateAdminPartnerMilestone(
        milestone.id,
        {
          status: milestone.status,
          responsible_party: milestone.responsible_party,
          next_action: optionalText(milestone.next_action),
          due_at: milestoneDueValue(dateInputValue(milestone.due_at)),
          partner_visible_notes: optionalText(
            milestone.partner_visible_notes
          ),
          visible_to_partner: milestone.visible_to_partner !== false,
        }
      );

      setProgress((current) => ({
        ...current,
        milestones: current.milestones.map((row) =>
          row.id === updated.id ? updated : row
        ),
      }));

      setNotice(`${updated.title} saved.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const goalPayload = (goal) => ({
    title: String(goal.title || "").trim(),
    description: optionalText(goal.description),
    goal_type: goal.goal_type || "other",
    status: goal.status || "not_started",
    target_value: optionalNumber(goal.target_value),
    current_value: optionalNumber(goal.current_value),
    unit_label: optionalText(goal.unit_label),
    start_on: goal.start_on || null,
    due_on: goal.due_on || null,
    next_action: optionalText(goal.next_action),
    partner_visible_notes: optionalText(goal.partner_visible_notes),
    visible_to_partner: goal.visible_to_partner !== false,
  });

  const createGoal = async () => {
    if (!selectedAccount || busyKey) return;

    if (!String(newGoal.title || "").trim()) {
      setError("Enter a goal title before saving.");
      return;
    }

    setBusyKey("new-goal");
    setError("");
    setNotice("");

    try {
      const created = await api.createAdminPartnerGoal(
        selectedAccount.id,
        goalPayload(newGoal)
      );

      setProgress((current) => ({
        ...current,
        goals: [...current.goals, created],
      }));

      setNewGoal(emptyGoal());
      setShowNewGoal(false);
      setNotice(`${created.title} was added.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const saveGoal = async (goal) => {
    const key = `goal:${goal.id}`;

    if (busyKey) return;

    if (!String(goal.title || "").trim()) {
      setError("Every goal requires a title.");
      return;
    }

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      const updated = await api.updateAdminPartnerGoal(
        goal.id,
        goalPayload(goal)
      );

      setProgress((current) => ({
        ...current,
        goals: current.goals.map((row) =>
          row.id === updated.id ? updated : row
        ),
      }));

      setNotice(`${updated.title} saved.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const deleteGoal = async (goal) => {
    if (busyKey) return;

    const confirmed = window.confirm(
      `Permanently delete the goal "${goal.title}"?`
    );

    if (!confirmed) return;

    const key = `delete-goal:${goal.id}`;

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      await api.deleteAdminPartnerGoal(goal.id);

      setProgress((current) => ({
        ...current,
        goals: current.goals.filter((row) => row.id !== goal.id),
      }));

      setNotice(`${goal.title} was deleted.`);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="nf-apm">
      <style>{ADMIN_PARTNER_CSS}</style>

      <div className="eyebrow">Partner Program Management</div>

      <div className="nf-apm-intro">
        <strong>Partner Portal accounts and Retail Locator entries remain separate.</strong>{" "}
        Manage official partner levels, milestones, next actions, visible notes,
        and goals here. Use the Retail Locator tab for customer-facing store
        addresses and ZIP-search visibility.
      </div>

      {error && (
        <div className="nf-apm-message error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div
          className="nf-apm-message success"
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      )}

      <div className="nf-apm-layout">
        <aside className="nf-apm-sidebar">
          <h3>Partner Accounts</h3>

          <input
            type="search"
            placeholder="Search partner accounts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {loadingAccounts ? (
            <div className="nf-apm-loading">Loading partner accounts…</div>
          ) : filteredAccounts.length === 0 ? (
            <div className="nf-apm-empty">
              {query
                ? "No partner accounts match this search."
                : "No Partner Portal accounts exist yet."}
            </div>
          ) : (
            <div className="nf-apm-partner-list">
              {filteredAccounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className={`nf-apm-partner-button ${
                    selectedId === account.id ? "selected" : ""
                  }`}
                  onClick={() => setSelectedId(account.id)}
                >
                  <strong>
                    {account.public_name ||
                      account.business_name ||
                      "Unnamed partner"}
                  </strong>
                  <span>
                    {cleanStatus(account.partner_level || "starter")} ·{" "}
                    {cleanStatus(account.relationship_status)}
                  </span>
                  <span>{account.email || "No email listed"}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="nf-apm-main">
          {!selectedAccount ? (
            <div className="nf-apm-empty">
              Select a Partner Portal account to manage its progress.
            </div>
          ) : (
            <>
              <div className="nf-apm-account-header">
                <div className="nf-modern-kicker">Selected partner</div>
                <h2>
                  {selectedAccount.public_name ||
                    selectedAccount.business_name}
                </h2>
                <p>
                  Update what this partner sees in the secure dashboard. Private
                  Admin-only note tables remain separate from these
                  partner-visible fields.
                </p>

                <div className="nf-apm-account-meta">
                  <div>
                    <span>Business</span>
                    <strong>{selectedAccount.business_name}</strong>
                  </div>
                  <div>
                    <span>Contact</span>
                    <strong>
                      {selectedAccount.contact_name ||
                        selectedAccount.email ||
                        "Not provided"}
                    </strong>
                  </div>
                  <div>
                    <span>Relationship</span>
                    <strong>
                      {cleanStatus(selectedAccount.relationship_status)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="nf-apm-section">
                <div className="nf-apm-section-heading">
                  <div>
                    <h3>Partner Level</h3>
                    <p>
                      Levels change earned benefits and access. They do not
                      change published wholesale unit pricing.
                    </p>
                  </div>
                </div>

                <div className="nf-apm-level-row">
                  <label className="nf-apm-field">
                    <span>Current partner level</span>
                    <select
                      value={levelDraft}
                      onChange={(event) => {
                        setLevelDraft(event.target.value);
                        setNotice("");
                      }}
                    >
                      {PARTNER_LEVELS.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="btn solid"
                    disabled={
                      busyKey === "level" ||
                      levelDraft === selectedAccount.partner_level
                    }
                    onClick={saveLevel}
                  >
                    {busyKey === "level" ? "Saving…" : "Save Level"}
                  </button>
                </div>
              </div>

              {loadingProgress ? (
                <div className="nf-apm-loading">
                  Loading milestones and goals…
                </div>
              ) : (
                <>
                  <div className="nf-apm-section">
                    <div className="nf-apm-section-heading">
                      <div>
                        <h3>
                          Partnership Milestones ·{" "}
                          {progress.milestones.length}
                        </h3>
                        <p>
                          Update official progress, responsibility, next steps,
                          due dates, and partner-visible notes.
                        </p>
                      </div>
                    </div>

                    <div className="nf-apm-milestone-list">
                      {progress.milestones.map((milestone) => {
                        const key = `milestone:${milestone.id}`;

                        return (
                          <article
                            key={milestone.id}
                            className="nf-apm-edit-card"
                          >
                            <h4>{milestone.title}</h4>

                            {milestone.description && (
                              <p className="nf-apm-edit-card-description">
                                {milestone.description}
                              </p>
                            )}

                            <div className="nf-apm-card-grid">
                              <label className="nf-apm-field">
                                <span>Status</span>
                                <select
                                  value={milestone.status}
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      status: event.target.value,
                                    })
                                  }
                                >
                                  {MILESTONE_STATUSES.map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    )
                                  )}
                                </select>
                              </label>

                              <label className="nf-apm-field">
                                <span>Responsible party</span>
                                <select
                                  value={milestone.responsible_party}
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      responsible_party:
                                        event.target.value,
                                    })
                                  }
                                >
                                  {RESPONSIBLE_PARTIES.map(
                                    ([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    )
                                  )}
                                </select>
                              </label>

                              <label className="nf-apm-field">
                                <span>Due date</span>
                                <input
                                  type="date"
                                  value={dateInputValue(
                                    milestone.due_at
                                  )}
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      due_at: event.target.value,
                                    })
                                  }
                                />
                              </label>

                              <label className="nf-apm-toggle">
                                <input
                                  type="checkbox"
                                  checked={
                                    milestone.visible_to_partner !== false
                                  }
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      visible_to_partner:
                                        event.target.checked,
                                    })
                                  }
                                />
                                Visible in Partner Portal
                              </label>

                              <label className="nf-apm-field wide">
                                <span>Next action</span>
                                <textarea
                                  rows={2}
                                  value={milestone.next_action || ""}
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      next_action: event.target.value,
                                    })
                                  }
                                  placeholder="Clear next action for this milestone"
                                />
                              </label>

                              <label className="nf-apm-field wide">
                                <span>Partner-visible note</span>
                                <textarea
                                  rows={2}
                                  value={
                                    milestone.partner_visible_notes || ""
                                  }
                                  onChange={(event) =>
                                    updateMilestoneDraft(milestone.id, {
                                      partner_visible_notes:
                                        event.target.value,
                                    })
                                  }
                                  placeholder="This note will be visible to the partner"
                                />
                              </label>
                            </div>

                            <div className="nf-apm-card-actions">
                              <button
                                type="button"
                                className="btn solid"
                                disabled={busyKey === key}
                                onClick={() =>
                                  saveMilestone(milestone)
                                }
                              >
                                {busyKey === key
                                  ? "Saving…"
                                  : "Save Milestone"}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="nf-apm-section">
                    <div className="nf-apm-section-heading">
                      <div>
                        <h3>
                          Partnership Goals · {progress.goals.length}
                        </h3>
                        <p>
                          Add measurable launch, sales, reorder,
                          merchandising, event, engagement, or level goals.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="btn solid"
                        onClick={() => {
                          setShowNewGoal((current) => !current);
                          setError("");
                          setNotice("");
                        }}
                      >
                        {showNewGoal ? "Close New Goal" : "+ Add Goal"}
                      </button>
                    </div>

                    {showNewGoal && (
                      <div className="nf-apm-goal-create">
                        <h4>Create a New Goal</h4>

                        <div className="nf-apm-card-grid">
                          <label className="nf-apm-field wide">
                            <span>Goal title</span>
                            <input
                              value={newGoal.title}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  title: event.target.value,
                                }))
                              }
                              placeholder="Example: Complete first reorder"
                            />
                          </label>

                          <label className="nf-apm-field wide">
                            <span>Description</span>
                            <textarea
                              rows={2}
                              value={newGoal.description}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  description: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field">
                            <span>Goal type</span>
                            <select
                              value={newGoal.goal_type}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  goal_type: event.target.value,
                                }))
                              }
                            >
                              {GOAL_TYPES.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="nf-apm-field">
                            <span>Status</span>
                            <select
                              value={newGoal.status}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  status: event.target.value,
                                }))
                              }
                            >
                              {GOAL_STATUSES.map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="nf-apm-field">
                            <span>Current value</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={newGoal.current_value}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  current_value: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field">
                            <span>Target value</span>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={newGoal.target_value}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  target_value: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field">
                            <span>Unit label</span>
                            <input
                              value={newGoal.unit_label}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  unit_label: event.target.value,
                                }))
                              }
                              placeholder="units, orders, $, events"
                            />
                          </label>

                          <label className="nf-apm-toggle">
                            <input
                              type="checkbox"
                              checked={newGoal.visible_to_partner}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  visible_to_partner:
                                    event.target.checked,
                                }))
                              }
                            />
                            Visible in Partner Portal
                          </label>

                          <label className="nf-apm-field">
                            <span>Start date</span>
                            <input
                              type="date"
                              value={newGoal.start_on}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  start_on: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field">
                            <span>Due date</span>
                            <input
                              type="date"
                              value={newGoal.due_on}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  due_on: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field wide">
                            <span>Next action</span>
                            <textarea
                              rows={2}
                              value={newGoal.next_action}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  next_action: event.target.value,
                                }))
                              }
                            />
                          </label>

                          <label className="nf-apm-field wide">
                            <span>Partner-visible note</span>
                            <textarea
                              rows={2}
                              value={newGoal.partner_visible_notes}
                              onChange={(event) =>
                                setNewGoal((current) => ({
                                  ...current,
                                  partner_visible_notes:
                                    event.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>

                        <div className="nf-apm-card-actions">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setNewGoal(emptyGoal());
                              setShowNewGoal(false);
                            }}
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            className="btn solid"
                            disabled={busyKey === "new-goal"}
                            onClick={createGoal}
                          >
                            {busyKey === "new-goal"
                              ? "Creating…"
                              : "Create Goal"}
                          </button>
                        </div>
                      </div>
                    )}

                    {progress.goals.length === 0 ? (
                      <div className="nf-apm-empty">
                        No goals are assigned to this partner yet.
                      </div>
                    ) : (
                      <div className="nf-apm-goal-list">
                        {progress.goals.map((goal) => {
                          const saveKey = `goal:${goal.id}`;
                          const deleteKey = `delete-goal:${goal.id}`;
                          const percent = goalPercent(goal);

                          return (
                            <article
                              key={goal.id}
                              className="nf-apm-edit-card"
                            >
                              <h4>{goal.title || "Untitled goal"}</h4>

                              <div className="nf-apm-card-grid">
                                <label className="nf-apm-field wide">
                                  <span>Goal title</span>
                                  <input
                                    value={goal.title || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        title: event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field wide">
                                  <span>Description</span>
                                  <textarea
                                    rows={2}
                                    value={goal.description || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        description:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field">
                                  <span>Goal type</span>
                                  <select
                                    value={goal.goal_type}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        goal_type: event.target.value,
                                      })
                                    }
                                  >
                                    {GOAL_TYPES.map(([value, label]) => (
                                      <option key={value} value={value}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label className="nf-apm-field">
                                  <span>Status</span>
                                  <select
                                    value={goal.status}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        status: event.target.value,
                                      })
                                    }
                                  >
                                    {GOAL_STATUSES.map(
                                      ([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>

                                <label className="nf-apm-field">
                                  <span>Current value</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={goal.current_value ?? ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        current_value:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field">
                                  <span>Target value</span>
                                  <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={goal.target_value ?? ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        target_value:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field">
                                  <span>Unit label</span>
                                  <input
                                    value={goal.unit_label || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        unit_label:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-toggle">
                                  <input
                                    type="checkbox"
                                    checked={
                                      goal.visible_to_partner !== false
                                    }
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        visible_to_partner:
                                          event.target.checked,
                                      })
                                    }
                                  />
                                  Visible in Partner Portal
                                </label>

                                <label className="nf-apm-field">
                                  <span>Start date</span>
                                  <input
                                    type="date"
                                    value={goal.start_on || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        start_on: event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field">
                                  <span>Due date</span>
                                  <input
                                    type="date"
                                    value={goal.due_on || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        due_on: event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field wide">
                                  <span>Next action</span>
                                  <textarea
                                    rows={2}
                                    value={goal.next_action || ""}
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        next_action:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>

                                <label className="nf-apm-field wide">
                                  <span>Partner-visible note</span>
                                  <textarea
                                    rows={2}
                                    value={
                                      goal.partner_visible_notes || ""
                                    }
                                    onChange={(event) =>
                                      updateGoalDraft(goal.id, {
                                        partner_visible_notes:
                                          event.target.value,
                                      })
                                    }
                                  />
                                </label>
                              </div>

                              <div className="nf-apm-progress-preview">
                                <div className="nf-apm-progress-preview-row">
                                  <span>Partner progress preview</span>
                                  <strong>{percent}%</strong>
                                </div>
                                <div className="nf-apm-progress-preview-track">
                                  <div
                                    className="nf-apm-progress-preview-fill"
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                              </div>

                              <div className="nf-apm-card-actions">
                                <button
                                  type="button"
                                  className="btn danger"
                                  disabled={busyKey === deleteKey}
                                  onClick={() => deleteGoal(goal)}
                                >
                                  {busyKey === deleteKey
                                    ? "Deleting…"
                                    : "Delete Goal"}
                                </button>

                                <button
                                  type="button"
                                  className="btn solid"
                                  disabled={busyKey === saveKey}
                                  onClick={() => saveGoal(goal)}
                                >
                                  {busyKey === saveKey
                                    ? "Saving…"
                                    : "Save Goal"}
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
