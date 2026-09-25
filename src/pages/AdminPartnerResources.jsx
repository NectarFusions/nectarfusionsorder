import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";

const RESOURCE_CATEGORIES = [
  ["line_sheet", "Line Sheet"],
  ["w9", "W-9"],
  ["insurance", "Insurance"],
  ["shelf_card", "Shelf Card"],
  ["product_care", "Product Care"],
  ["terms", "Terms"],
  ["process", "Process"],
  ["event_material", "Event Material"],
  ["other", "Other"],
];

const PARTNER_TYPES = [
  ["retail", "Retail"],
  ["wholesale", "Wholesale"],
];

const RESOURCE_STATUSES = [
  ["draft", "Draft"],
  ["active", "Active"],
  ["archived", "Archived"],
];

const RESOURCE_CSS = `
.nf-admin-resources {
  display:grid;
  gap:18px;
}
.nf-admin-resources-intro {
  padding:18px 20px;
  border:1px solid #B8D9EA;
  border-left:5px solid #167BB6;
  border-radius:16px;
  background:#F1F9FD;
  color:#4D6877;
  line-height:1.65;
}
.nf-admin-resources-intro strong {
  color:#173C52;
}
.nf-resource-message {
  padding:12px 14px;
  border-radius:12px;
  line-height:1.55;
}
.nf-resource-message.error {
  border:1px solid #E0A0A0;
  background:#FFF1F1;
  color:#8A2929;
}
.nf-resource-message.success {
  border:1px solid #A8D1B3;
  background:#F1FAF3;
  color:#315E3D;
}
.nf-resource-section {
  padding:18px;
  border:1px solid #E0D5C8;
  border-radius:18px;
  background:#FFFFFF;
}
.nf-resource-section-heading {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:14px;
  margin-bottom:15px;
}
.nf-resource-section-heading h3 {
  margin:0;
  color:#2B1C13;
  font-size:21px;
}
.nf-resource-section-heading p {
  margin:6px 0 0;
  color:#71645A;
  font-size:12.5px;
  line-height:1.55;
}
.nf-resource-upload-card {
  padding:18px;
  border:2px solid #A8D4EC;
  border-radius:17px;
  background:linear-gradient(145deg,#F5FBFE,#FFFFFF);
}
.nf-resource-form-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:11px;
}
.nf-resource-field {
  display:grid;
  gap:6px;
}
.nf-resource-field.wide {
  grid-column:1 / -1;
}
.nf-resource-field > span,
.nf-resource-visibility > span {
  color:#654B1B;
  font-size:9.5px;
  font-weight:900;
  letter-spacing:.07em;
  text-transform:uppercase;
}
.nf-resource-field input,
.nf-resource-field select,
.nf-resource-field textarea {
  width:100%;
  box-sizing:border-box;
}
.nf-resource-field textarea {
  resize:vertical;
}
.nf-resource-file-guidance {
  margin:7px 0 0;
  color:#74675D;
  font-size:11.5px;
  line-height:1.5;
}
.nf-resource-visibility {
  display:grid;
  gap:8px;
  margin-top:2px;
}
.nf-resource-type-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:7px;
}
.nf-resource-type-toggle {
  display:flex;
  align-items:center;
  gap:8px;
  min-height:42px;
  padding:9px 11px;
  border:1px solid #D9CDBC;
  border-radius:11px;
  background:#FFFDF9;
  color:#51453C;
  font-size:12px;
  font-weight:750;
}
.nf-resource-type-toggle input {
  width:18px;
  height:18px;
  accent-color:#167BB6;
}
.nf-resource-all-note {
  margin:0;
  color:#786B61;
  font-size:11px;
  line-height:1.45;
}
.nf-resource-actions {
  display:flex;
  justify-content:flex-end;
  flex-wrap:wrap;
  gap:8px;
  margin-top:14px;
}
.nf-resource-actions .btn {
  padding:9px 13px;
}
.nf-resource-list {
  display:grid;
  gap:13px;
}
.nf-resource-card {
  padding:17px;
  border:1px solid #E2D8CD;
  border-radius:16px;
  background:linear-gradient(145deg,#FFFFFF,#FCF9F5);
}
.nf-resource-card-heading {
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:12px;
}
.nf-resource-card-heading h4 {
  margin:0;
  color:#2A1C13;
  font-size:17px;
}
.nf-resource-status {
  display:inline-flex;
  align-items:center;
  padding:6px 9px;
  border-radius:999px;
  background:#EEE8E0;
  color:#62564C;
  font-size:9.5px;
  font-weight:900;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.nf-resource-status[data-status="active"] {
  background:#DFF3E5;
  color:#285F3A;
}
.nf-resource-status[data-status="draft"] {
  background:#FFF0C4;
  color:#725300;
}
.nf-resource-status[data-status="archived"] {
  background:#ECE8F2;
  color:#615773;
}
.nf-resource-file-path {
  margin:6px 0 0;
  color:#817469;
  font-size:10.5px;
  overflow-wrap:anywhere;
}
.nf-resource-empty {
  padding:24px 18px;
  border:1px dashed #CDBEAD;
  border-radius:15px;
  background:#FFFCF8;
  color:#706359;
  text-align:center;
  line-height:1.6;
}
@media (max-width:680px) {
  .nf-resource-section-heading {
    flex-direction:column;
  }
  .nf-resource-form-grid,
  .nf-resource-type-grid {
    grid-template-columns:1fr;
  }
  .nf-resource-field.wide {
    grid-column:auto;
  }
  .nf-resource-card-heading {
    flex-direction:column;
  }
}
`;

const emptyUpload = () => ({
  title: "",
  description: "",
  category: "line_sheet",
  version_label: "",
  expires_on: "",
  sort: "0",
  visible_to_partner_types: [],
});

const categoryLabel = (value) =>
  RESOURCE_CATEGORIES.find(([id]) => id === value)?.[1] || "Other";

const dateValue = (value) =>
  value ? String(value).slice(0, 10) : "";

const expirationValue = (value) => {
  if (!value) return null;

  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const optionalText = (value) => {
  const cleaned = String(value || "").trim();
  return cleaned || null;
};

const togglePartnerType = (current, type) =>
  current.includes(type)
    ? current.filter((value) => value !== type)
    : [...current, type];

export default function AdminPartnerResources() {
  const [resources, setResources] = useState([]);
  const [upload, setUpload] = useState(emptyUpload);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sortedResources = useMemo(
    () =>
      [...resources].sort(
        (a, b) =>
          Number(a.sort || 0) - Number(b.sort || 0) ||
          String(a.title || "").localeCompare(
            String(b.title || ""),
            undefined,
            { sensitivity: "base" }
          )
      ),
    [resources]
  );

  const loadResources = useCallback(async () => {
    setLoading(true);

    try {
      const rows = await api.listAdminPartnerResources();
      setResources(rows);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadResources();
  }, [loadResources]);

  const updateDraft = (id, patch) => {
    setResources((current) =>
      current.map((resource) =>
        resource.id === id ? { ...resource, ...patch } : resource
      )
    );
    setNotice("");
  };

  const createResource = async () => {
    if (busyKey) return;

    if (!selectedFile) {
      setError("Choose a PDF or image to upload.");
      return;
    }

    if (!upload.title.trim()) {
      setError("Enter a resource title.");
      return;
    }

    setBusyKey("upload");
    setError("");
    setNotice("");

    try {
      const created = await api.createAdminPartnerResource(
        selectedFile,
        {
          title: upload.title.trim(),
          description: optionalText(upload.description),
          category: upload.category,
          version_label: optionalText(upload.version_label),
          expires_at: expirationValue(upload.expires_on),
          sort: Number.parseInt(upload.sort, 10) || 0,
          visible_to_partner_types:
            upload.visible_to_partner_types,
        }
      );

      setResources((current) => [...current, created]);
      setUpload(emptyUpload());
      setSelectedFile(null);
      setFileInputKey((current) => current + 1);
      setShowUpload(false);
      setNotice(
        `${created.title} was uploaded as a draft. Activate it after review.`
      );
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setBusyKey("");
    }
  };

  const saveResource = async (resource) => {
    const key = `save:${resource.id}`;

    if (busyKey) return;

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      const updated = await api.updateAdminPartnerResource(
        resource.id,
        {
          title: String(resource.title || "").trim(),
          description: optionalText(resource.description),
          category: resource.category,
          status: resource.status,
          version_label: optionalText(resource.version_label),
          expires_at: expirationValue(
            dateValue(resource.expires_at)
          ),
          sort: Number.parseInt(resource.sort, 10) || 0,
          visible_to_partner_types:
            resource.visible_to_partner_types || [],
        }
      );

      setResources((current) =>
        current.map((row) =>
          row.id === updated.id ? updated : row
        )
      );

      setNotice(`${updated.title} was saved.`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const archiveResource = async (resource) => {
    if (busyKey) return;

    const confirmed = window.confirm(
      `Archive "${resource.title}"? Partners will no longer see it.`
    );

    if (!confirmed) return;

    const key = `archive:${resource.id}`;

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      const updated = await api.updateAdminPartnerResource(
        resource.id,
        { status: "archived" }
      );

      setResources((current) =>
        current.map((row) =>
          row.id === updated.id ? updated : row
        )
      );

      setNotice(`${updated.title} was archived.`);
    } catch (archiveError) {
      setError(archiveError.message);
    } finally {
      setBusyKey("");
    }
  };

  const testDownload = async (resource) => {
    const key = `download:${resource.id}`;

    if (busyKey) return;

    setBusyKey(key);
    setError("");
    setNotice("");

    try {
      const signedUrl =
        await api.getPartnerResourceDownloadUrl(resource);

      const anchor = document.createElement("a");
      anchor.href = signedUrl;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setNotice(`Download started for ${resource.title}.`);
    } catch (downloadError) {
      setError(downloadError.message);
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="nf-admin-resources">
      <style>{RESOURCE_CSS}</style>

      <div className="eyebrow">Partner Resources</div>

      <div className="nf-admin-resources-intro">
        <strong>Files remain private.</strong>{" "}
        New uploads begin as drafts and are not visible in the Partner
        Portal until their status is changed to Active. Leaving all
        partner-type boxes unchecked makes a resource available to every
        approved partner type once activated.
      </div>

      {error && (
        <div className="nf-resource-message error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div
          className="nf-resource-message success"
          role="status"
          aria-live="polite"
        >
          {notice}
        </div>
      )}

      <section className="nf-resource-section">
        <div className="nf-resource-section-heading">
          <div>
            <h3>Upload a Resource</h3>
            <p>
              Accepted files are PDF, PNG, JPG, and WebP, up to 25 MB.
              Uploading creates a private draft.
            </p>
          </div>

          <button
            type="button"
            className="btn solid"
            onClick={() => {
              setShowUpload((current) => !current);
              setError("");
              setNotice("");
            }}
          >
            {showUpload ? "Close Upload" : "+ Upload Resource"}
          </button>
        </div>

        {showUpload && (
          <div className="nf-resource-upload-card">
            <div className="nf-resource-form-grid">
              <label className="nf-resource-field wide">
                <span>File</span>
                <input
                  key={fileInputKey}
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] || null)
                  }
                />
                <p className="nf-resource-file-guidance">
                  {selectedFile
                    ? `${selectedFile.name} · ${Math.max(
                        0.01,
                        selectedFile.size / 1024 / 1024
                      ).toFixed(2)} MB`
                    : "No file selected."}
                </p>
              </label>

              <label className="nf-resource-field wide">
                <span>Resource title</span>
                <input
                  value={upload.title}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Example: Current Wholesale Line Sheet"
                />
              </label>

              <label className="nf-resource-field wide">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={upload.description}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Explain when and how partners should use this file"
                />
              </label>

              <label className="nf-resource-field">
                <span>Category</span>
                <select
                  value={upload.category}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  {RESOURCE_CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="nf-resource-field">
                <span>Version label</span>
                <input
                  value={upload.version_label}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      version_label: event.target.value,
                    }))
                  }
                  placeholder="Example: July 2026"
                />
              </label>

              <label className="nf-resource-field">
                <span>Expiration date</span>
                <input
                  type="date"
                  value={upload.expires_on}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      expires_on: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="nf-resource-field">
                <span>Display order</span>
                <input
                  type="number"
                  step="1"
                  value={upload.sort}
                  onChange={(event) =>
                    setUpload((current) => ({
                      ...current,
                      sort: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="nf-resource-visibility wide">
                <span>Visible to partner types</span>

                <div className="nf-resource-type-grid">
                  {PARTNER_TYPES.map(([value, label]) => (
                    <label
                      key={value}
                      className="nf-resource-type-toggle"
                    >
                      <input
                        type="checkbox"
                        checked={
                          upload.visible_to_partner_types.includes(
                            value
                          )
                        }
                        onChange={() =>
                          setUpload((current) => ({
                            ...current,
                            visible_to_partner_types:
                              togglePartnerType(
                                current.visible_to_partner_types,
                                value
                              ),
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <p className="nf-resource-all-note">
                  No boxes selected means all partner types.
                </p>
              </div>
            </div>

            <div className="nf-resource-actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setUpload(emptyUpload());
                  setSelectedFile(null);
                  setFileInputKey((current) => current + 1);
                  setShowUpload(false);
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn solid"
                disabled={busyKey === "upload"}
                onClick={createResource}
              >
                {busyKey === "upload"
                  ? "Uploading…"
                  : "Upload Private Draft"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="nf-resource-section">
        <div className="nf-resource-section-heading">
          <div>
            <h3>Resource Library · {resources.length}</h3>
            <p>
              Review metadata, partner-type access, expiration, order,
              and publication status.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="nf-resource-empty">
            Loading the private resource library…
          </div>
        ) : sortedResources.length === 0 ? (
          <div className="nf-resource-empty">
            No Partner Portal resources have been uploaded yet.
          </div>
        ) : (
          <div className="nf-resource-list">
            {sortedResources.map((resource) => {
              const saveKey = `save:${resource.id}`;
              const archiveKey = `archive:${resource.id}`;
              const downloadKey = `download:${resource.id}`;

              return (
                <article
                  key={resource.id}
                  className="nf-resource-card"
                >
                  <div className="nf-resource-card-heading">
                    <div>
                      <h4>
                        {resource.title || "Untitled resource"}
                      </h4>
                      <p className="nf-resource-file-path">
                        {resource.storage_path}
                      </p>
                    </div>

                    <span
                      className="nf-resource-status"
                      data-status={resource.status}
                    >
                      {RESOURCE_STATUSES.find(
                        ([value]) => value === resource.status
                      )?.[1] || resource.status}
                    </span>
                  </div>

                  <div className="nf-resource-form-grid">
                    <label className="nf-resource-field wide">
                      <span>Resource title</span>
                      <input
                        value={resource.title || ""}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            title: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="nf-resource-field wide">
                      <span>Description</span>
                      <textarea
                        rows={3}
                        value={resource.description || ""}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="nf-resource-field">
                      <span>Category</span>
                      <select
                        value={resource.category}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            category: event.target.value,
                          })
                        }
                      >
                        {RESOURCE_CATEGORIES.map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="nf-resource-field">
                      <span>Status</span>
                      <select
                        value={resource.status}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            status: event.target.value,
                          })
                        }
                      >
                        {RESOURCE_STATUSES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="nf-resource-field">
                      <span>Version label</span>
                      <input
                        value={resource.version_label || ""}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            version_label: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="nf-resource-field">
                      <span>Expiration date</span>
                      <input
                        type="date"
                        value={dateValue(resource.expires_at)}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            expires_at: event.target.value,
                          })
                        }
                      />
                    </label>

                    <label className="nf-resource-field">
                      <span>Display order</span>
                      <input
                        type="number"
                        step="1"
                        value={resource.sort ?? 0}
                        onChange={(event) =>
                          updateDraft(resource.id, {
                            sort: event.target.value,
                          })
                        }
                      />
                    </label>

                    <div className="nf-resource-field">
                      <span>Category preview</span>
                      <div
                        style={{
                          minHeight: 48,
                          display: "flex",
                          alignItems: "center",
                          padding: "10px 12px",
                          border: "1px solid #D9CDBC",
                          borderRadius: 12,
                          background: "#FFFDF9",
                          color: "#51453C",
                          fontWeight: 750,
                        }}
                      >
                        {categoryLabel(resource.category)}
                      </div>
                    </div>

                    <div className="nf-resource-visibility wide">
                      <span>Visible to partner types</span>

                      <div className="nf-resource-type-grid">
                        {PARTNER_TYPES.map(([value, label]) => (
                          <label
                            key={value}
                            className="nf-resource-type-toggle"
                          >
                            <input
                              type="checkbox"
                              checked={(
                                resource.visible_to_partner_types ||
                                []
                              ).includes(value)}
                              onChange={() =>
                                updateDraft(resource.id, {
                                  visible_to_partner_types:
                                    togglePartnerType(
                                      resource.visible_to_partner_types ||
                                        [],
                                      value
                                    ),
                                })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>

                      <p className="nf-resource-all-note">
                        No boxes selected means all partner types.
                      </p>
                    </div>
                  </div>

                  <div className="nf-resource-actions">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busyKey === downloadKey}
                      onClick={() => testDownload(resource)}
                    >
                      {busyKey === downloadKey
                        ? "Preparing…"
                        : "Test Download"}
                    </button>

                    {resource.status !== "archived" && (
                      <button
                        type="button"
                        className="btn danger"
                        disabled={busyKey === archiveKey}
                        onClick={() =>
                          archiveResource(resource)
                        }
                      >
                        {busyKey === archiveKey
                          ? "Archiving…"
                          : "Archive"}
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn solid"
                      disabled={busyKey === saveKey}
                      onClick={() => saveResource(resource)}
                    >
                      {busyKey === saveKey
                        ? "Saving…"
                        : "Save Resource"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
