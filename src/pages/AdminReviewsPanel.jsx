import { useCallback, useEffect, useState } from "react";
import * as api from "../lib/api";
import { downloadReviewImage, optimizeReviewImage } from "../lib/reviewImage";

const ADMIN_REVIEW_CSS = `
.nf-admin-reviews-toolbar {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-bottom:14px;
}
.nf-admin-review-card {
  padding:16px;
  margin-bottom:10px;
  border:1px solid #E4D6C0;
  border-radius:16px;
  background:#FFFFFF;
}
.nf-admin-review-photo {
  width:min(280px,100%);
  max-height:260px;
  margin-top:11px;
  border-radius:13px;
  object-fit:cover;
}
.nf-admin-review-copy {
  margin-top:10px;
  color:#4A4038;
  font-size:14px;
  line-height:1.7;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}
.nf-admin-review-meta {
  margin-top:10px;
  color:#7B6E62;
  font-size:12.5px;
  line-height:1.55;
}
.nf-admin-review-actions {
  display:flex;
  gap:8px;
  flex-wrap:wrap;
  margin-top:13px;
}
.nf-admin-review-form {
  padding:18px;
  margin-bottom:18px;
  border:1px solid #9FD5F2;
  border-radius:18px;
  background:#F3FAFE;
}
.nf-admin-review-form h3 {
  margin:5px 0 13px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:30px;
}
.nf-admin-review-form-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:9px;
}
.nf-admin-review-form-grid .wide {
  grid-column:1/-1;
}
.nf-admin-review-form label {
  display:grid;
  gap:5px;
  color:#5A472E;
  font-size:12.5px;
  font-weight:800;
}
.nf-admin-bees {
  display:flex;
  gap:6px;
  margin:10px 0;
}
.nf-admin-bee {
  width:42px;
  height:42px;
  border:1px solid #D7C39A;
  border-radius:12px;
  background:#FFFFFF;
  font-size:23px;
  cursor:pointer;
}
.nf-admin-bee.selected {
  border-color:#D28A00;
  background:#FFF1AE;
}
@media (max-width:700px) {
  .nf-admin-review-form-grid { grid-template-columns:1fr; }
  .nf-admin-review-form-grid .wide { grid-column:auto; }
}
`;

async function adminRequest({ method = "GET", body = null }) {
  const session = await api.session();
  const token = session?.access_token;

  if (!token) throw new Error("Admin sign-in is required.");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let payload = body;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await fetch("/.netlify/functions/review-admin", {
    method,
    headers,
    body: method === "GET" ? undefined : payload,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "The review admin request failed.");
  }

  return data;
}

export default function AdminReviewsPanel() {
  const [reviews, setReviews] = useState([]);
  const [view, setView] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [manual, setManual] = useState({
    displayName: "",
    email: "",
    rating: 5,
    title: "",
    body: "",
    productText: "",
    publishNow: true,
  });
  const [manualImage, setManualImage] = useState(null);
  const [manualBusy, setManualBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminRequest({ method: "GET" });
      setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = reviews.filter((review) => review.status === "pending");
  const approved = reviews.filter((review) => review.status === "approved");
  const shown = view === "approved" ? approved : pending;

  const approve = async (review) => {
    setBusyId(review.id);
    try {
      await adminRequest({
        method: "POST",
        body: { action: "approve", id: review.id },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const downloadImage = async (review) => {
    try {
      await downloadReviewImage(review.imageUrl, review.displayName);
    } catch (err) {
      setError(err.message);
      window.open(review.imageUrl, "_blank", "noopener,noreferrer");
    }
  };

  const remove = async (review) => {
    if (!window.confirm(`Delete this review from ${review.displayName}?`)) return;

    setBusyId(review.id);
    try {
      await adminRequest({
        method: "POST",
        body: { action: "delete", id: review.id },
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const createManual = async (event) => {
    event.preventDefault();

    if (!manual.displayName.trim() || !manual.body.trim()) {
      setError("Add the reviewer's name and review text.");
      return;
    }

    setManualBusy(true);
    setError("");

    try {
      const optimizedImage = manualImage
        ? await optimizeReviewImage(manualImage)
        : null;

      const body = new FormData();
      body.append("action", "create");
      body.append("displayName", manual.displayName.trim());
      body.append("email", manual.email.trim());
      body.append("rating", String(manual.rating));
      body.append("title", manual.title.trim());
      body.append("body", manual.body.trim());
      body.append("productText", manual.productText.trim());
      body.append("publishNow", manual.publishNow ? "true" : "false");
      if (optimizedImage) body.append("image", optimizedImage);

      await adminRequest({ method: "POST", body });

      setManual({
        displayName: "",
        email: "",
        rating: 5,
        title: "",
        body: "",
        productText: "",
        publishNow: true,
      });
      setManualImage(null);
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setManualBusy(false);
    }
  };

  return (
    <section>
      <style>{ADMIN_REVIEW_CSS}</style>

      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Reviews · {pending.length} awaiting approval · {approved.length} published
      </div>

      <div className="nf-admin-reviews-toolbar">
        <button
          className={`btn ${view === "pending" ? "on" : ""}`}
          style={{ padding: "10px 13px" }}
          onClick={() => setView("pending")}
        >
          Pending ({pending.length})
        </button>
        <button
          className={`btn ${view === "approved" ? "on" : ""}`}
          style={{ padding: "10px 13px" }}
          onClick={() => setView("approved")}
        >
          Published ({approved.length})
        </button>
        <button
          className="btn solid"
          style={{ padding: "10px 13px", marginLeft: "auto" }}
          onClick={() => setFormOpen((open) => !open)}
        >
          {formOpen ? "Close Add Review" : "Add Review"}
        </button>
      </div>

      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

      {formOpen && (
        <form className="nf-admin-review-form" onSubmit={createManual}>
          <div className="eyebrow">Enter an existing customer review</div>
          <h3>ADD A REVIEW</h3>

          <div className="nf-admin-review-form-grid">
            <label>
              Reviewer name
              <input
                value={manual.displayName}
                onChange={(event) =>
                  setManual((current) => ({
                    ...current,
                    displayName: event.target.value,
                  }))
                }
              />
            </label>

            <label>
              Email (optional, private)
              <input
                type="email"
                value={manual.email}
                onChange={(event) =>
                  setManual((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>

            <label className="wide">
              What they tried (optional)
              <input
                value={manual.productText}
                placeholder="Blueberry, Honey Club box..."
                onChange={(event) =>
                  setManual((current) => ({
                    ...current,
                    productText: event.target.value,
                  }))
                }
              />
            </label>

            <label className="wide">
              Review title (optional)
              <input
                value={manual.title}
                onChange={(event) =>
                  setManual((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 800 }}>
            Bee rating
          </div>
          <div className="nf-admin-bees">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                className={`nf-admin-bee ${rating <= manual.rating ? "selected" : ""}`}
                onClick={() =>
                  setManual((current) => ({ ...current, rating }))
                }
                aria-label={`${rating} bee${rating === 1 ? "" : "s"}`}
              >
                🐝
              </button>
            ))}
          </div>

          <label>
            Review
            <textarea
              rows={7}
              value={manual.body}
              placeholder="Paste or type the full review"
              onChange={(event) =>
                setManual((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </label>

          <label style={{ marginTop: 11 }}>
            Photo (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setManualImage(event.target.files?.[0] || null)}
            />
          </label>
          <div style={{ marginTop: 6, color: "#7B6E62", fontSize: 12.5 }}>
            Photos are automatically resized and compressed before upload.
          </div>

          <label
            style={{
              display: "flex",
              gridTemplateColumns: "auto 1fr",
              alignItems: "center",
              gap: 9,
              marginTop: 12,
            }}
          >
            <input
              type="checkbox"
              checked={manual.publishNow}
              onChange={(event) =>
                setManual((current) => ({
                  ...current,
                  publishNow: event.target.checked,
                }))
              }
              style={{ width: 19, height: 19 }}
            />
            Publish this admin-entered review immediately
          </label>

          <button
            className="btn solid"
            type="submit"
            disabled={manualBusy}
            style={{ width: "100%", padding: 13, marginTop: 12 }}
          >
            {manualBusy ? "Saving…" : "Save Review"}
          </button>
        </form>
      )}

      {loading ? (
        <div className="card" style={{ padding: 20, textAlign: "center" }}>
          Loading reviews…
        </div>
      ) : shown.length === 0 ? (
        <div className="card" style={{ padding: 20, textAlign: "center", color: "#7B6E62" }}>
          {view === "pending"
            ? "No reviews are waiting for approval."
            : "No reviews have been published yet."}
        </div>
      ) : (
        shown.map((review) => (
          <article key={review.id} className="nf-admin-review-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{review.displayName}</strong>
                {review.title && (
                  <div style={{ marginTop: 4, fontWeight: 850 }}>{review.title}</div>
                )}
              </div>
              <div style={{ whiteSpace: "nowrap", fontSize: 18 }}>
                {"🐝".repeat(review.rating)}
              </div>
            </div>

            {review.productText && (
              <div style={{ marginTop: 7, color: "#17628E", fontSize: 12.5, fontWeight: 800 }}>
                Tried: {review.productText}
              </div>
            )}

            <div className="nf-admin-review-copy">{review.body}</div>

            {review.imageUrl && (
              <img
                className="nf-admin-review-photo"
                src={review.imageUrl}
                alt={`Review upload from ${review.displayName}`}
              />
            )}

            <div className="nf-admin-review-meta">
              {review.email && <>Private email: {review.email}<br /></>}
              Source: {review.source === "admin" ? "Added by admin" : "Website submission"}
              {" · "}
              Submitted {new Date(review.submittedAt).toLocaleString()}
              {review.approvedAt && (
                <> · Published {new Date(review.approvedAt).toLocaleString()}</>
              )}
            </div>

            <div className="nf-admin-review-actions">
              {review.status === "pending" && (
                <button
                  className="btn solid"
                  style={{ padding: "9px 14px" }}
                  disabled={busyId === review.id}
                  onClick={() => approve(review)}
                >
                  {busyId === review.id ? "Working…" : "Approve & Publish"}
                </button>
              )}

              {review.imageUrl && (
                <button
                  className="btn"
                  style={{ padding: "9px 14px" }}
                  disabled={busyId === review.id}
                  onClick={() => downloadImage(review)}
                >
                  Download Image
                </button>
              )}

              <button
                className="btn danger"
                style={{ padding: "9px 14px" }}
                disabled={busyId === review.id}
                onClick={() => remove(review)}
              >
                Delete
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
