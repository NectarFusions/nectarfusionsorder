import { useEffect, useMemo, useState } from "react";
import { optimizeReviewImage } from "../lib/reviewImage";
import ReviewPhotoCarousel from "./ReviewPhotoCarousel";

export const HONEY_HIVE_URL =
  "https://www.facebook.com/groups/2081346676100136";

const REVIEW_CSS = `
.nf-reviews-page {
  padding-top:28px;
  padding-bottom:70px;
}
.nf-reviews-hero {
  position:relative;
  overflow:hidden;
  padding:34px;
  border:1px solid #D9B75D;
  border-radius:26px;
  background:
    radial-gradient(circle at 88% 16%,rgba(247,196,28,.34),transparent 27%),
    linear-gradient(145deg,#FFF9DF 0%,#FFFFFF 58%,#EEF8FE 100%);
  box-shadow:0 16px 38px rgba(55,77,88,.09);
}
.nf-reviews-hero::after {
  content:"";
  position:absolute;
  width:180px;
  height:180px;
  right:-74px;
  bottom:-96px;
  border:22px solid rgba(36,160,237,.08);
  border-radius:50%;
}
.nf-reviews-hero h2 {
  margin:8px 0 12px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:clamp(44px,8vw,70px);
  line-height:.92;
  color:#17120E;
}
.nf-reviews-hero p {
  max-width:630px;
  margin:0;
  color:#5D5148;
  font-size:16px;
  line-height:1.7;
}
.nf-review-summary {
  display:flex;
  align-items:center;
  gap:13px;
  flex-wrap:wrap;
  margin-top:20px;
  padding-top:18px;
  border-top:1px solid rgba(123,88,33,.16);
}
.nf-review-summary strong {
  color:#174A68;
  font-size:18px;
}
.nf-bee-row {
  display:flex;
  align-items:center;
  gap:5px;
}
.nf-bee-icon {
  display:block;
  flex:0 0 auto;
}
.nf-reviews-grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:15px;
  margin-top:22px;
}
.nf-review-card {
  min-width:0;
  padding:20px;
  border:1px solid #E6D8C3;
  border-radius:20px;
  background:#FFFFFF;
  box-shadow:0 10px 28px rgba(74,51,19,.07);
}
.nf-review-card-photo {
  width:100%;
  max-height:300px;
  margin-bottom:15px;
  border-radius:15px;
  object-fit:cover;
  background:#F6F2EA;
}
.nf-review-card h3 {
  margin:11px 0 7px;
  color:#17120E;
  font-size:19px;
  line-height:1.3;
}
.nf-review-card p {
  margin:0;
  color:#51473F;
  font-size:15px;
  line-height:1.72;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}
.nf-review-meta {
  margin-top:15px;
  padding-top:13px;
  border-top:1px solid #EFE6DB;
  color:#7B5821;
  font-size:13px;
  line-height:1.5;
}
.nf-review-product {
  display:inline-flex;
  margin-top:9px;
  padding:5px 9px;
  border-radius:999px;
  background:#EAF7FE;
  color:#17628E;
  font-size:12px;
  font-weight:800;
}
.nf-review-empty {
  grid-column:1/-1;
  padding:26px;
  border:1px dashed #D6C09A;
  border-radius:20px;
  background:#FFFDF8;
  color:#6B5D51;
  text-align:center;
  line-height:1.65;
}
.nf-review-form {
  scroll-margin-top:110px;
  margin-top:28px;
  padding:26px;
  border:2px solid #F0B900;
  border-radius:24px;
  background:linear-gradient(145deg,#FFFDF7,#FFF4C8);
  box-shadow:0 14px 32px rgba(181,116,0,.10);
}
.nf-review-form h2,
.nf-honey-hive h2 {
  margin:7px 0 10px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:42px;
  line-height:.95;
}
.nf-review-form > p,
.nf-honey-hive p {
  margin:0 0 17px;
  color:#5D5148;
  font-size:15px;
  line-height:1.7;
}
.nf-review-form-grid {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
}
.nf-review-form-grid .wide {
  grid-column:1/-1;
}
.nf-review-label {
  display:grid;
  gap:6px;
  color:#5A472E;
  font-size:13px;
  font-weight:800;
}
.nf-review-rating {
  margin:16px 0 18px;
  padding:16px;
  border:1px solid #E0C56F;
  border-radius:16px;
  background:rgba(255,255,255,.68);
}
.nf-review-rating-title {
  margin-bottom:9px;
  color:#4A3313;
  font-size:14px;
  font-weight:850;
}
.nf-review-rating-buttons {
  display:flex;
  gap:7px;
  flex-wrap:wrap;
}
.nf-review-rating-button {
  width:49px;
  height:49px;
  display:grid;
  place-items:center;
  padding:0;
  border:1px solid #D8C7A4;
  border-radius:14px;
  background:#FFFFFF;
  cursor:pointer;
  transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease;
}
.nf-review-rating-button:hover,
.nf-review-rating-button.selected {
  transform:translateY(-2px);
  border-color:#D89B00;
  box-shadow:0 7px 16px rgba(176,121,0,.15);
}
.nf-review-image-input {
  padding:11px !important;
  background:#FFFFFF !important;
}
.nf-review-image-preview {
  width:min(260px,100%);
  max-height:250px;
  margin-top:10px;
  border-radius:14px;
  object-fit:cover;
}
.nf-review-moderation-note {
  margin-top:12px;
  padding:12px 13px;
  border-radius:12px;
  background:#EAF7FE;
  color:#205D7E;
  font-size:13px;
  line-height:1.55;
}
.nf-review-success {
  margin-top:28px;
  padding:28px;
  border:2px solid #4D9563;
  border-radius:22px;
  background:#F4FCF5;
  text-align:center;
}
.nf-review-success h2 {
  margin:7px 0 8px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:38px;
  color:#285E39;
}
.nf-honey-hive {
  margin-top:24px;
  padding:26px;
  border-radius:24px;
  background:linear-gradient(145deg,#EAF7FE,#FFFFFF);
  border:1px solid #9FD5F2;
  box-shadow:0 12px 30px rgba(32,86,122,.08);
}
.nf-honey-hive-actions {
  display:flex;
  gap:10px;
  flex-wrap:wrap;
}
.nf-honey-hive-link {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:48px;
  padding:11px 18px;
  border-radius:13px;
  background:#1877F2;
  color:#FFFFFF;
  font-weight:850;
  text-decoration:none;
}
@media (max-width:700px) {
  .nf-reviews-page { padding-top:18px; }
  .nf-reviews-hero,
  .nf-review-form,
  .nf-honey-hive { padding:21px 17px; }
  .nf-reviews-grid { grid-template-columns:1fr; }
  .nf-review-form-grid { grid-template-columns:1fr; }
  .nf-review-form-grid .wide { grid-column:auto; }
  .nf-review-rating-button {
    width:45px;
    height:45px;
  }
}
`;

const HOME_CARD_CSS = `
.nf-review-home-card {
  position:relative;
  overflow:hidden;
  margin:34px 0 8px;
  padding:27px;
  border:2px solid #E2B62F;
  border-radius:24px;
  background:
    radial-gradient(circle at 92% 12%,rgba(36,160,237,.15),transparent 28%),
    linear-gradient(145deg,#FFF6C8 0%,#FFFFFF 64%);
  box-shadow:0 13px 30px rgba(94,68,18,.09);
}
.nf-review-home-card h2 {
  margin:7px 0 9px;
  font-family:'Bebas Neue',Impact,sans-serif;
  font-size:40px;
  line-height:.95;
  color:#17120E;
}
.nf-review-home-card p {
  margin:0;
  max-width:620px;
  color:#5D5148;
  font-size:15px;
  line-height:1.65;
}
.nf-review-home-actions {
  display:flex;
  gap:9px;
  flex-wrap:wrap;
  margin-top:17px;
}
.nf-review-home-actions button,
.nf-review-home-actions a {
  min-height:45px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 15px;
  border-radius:12px;
  font:inherit;
  font-size:13px;
  font-weight:850;
  text-decoration:none;
  cursor:pointer;
}
.nf-review-home-actions .primary {
  border:1px solid #D28A00;
  background:#F7C41C;
  color:#1B1005;
}
.nf-review-home-actions .secondary {
  border:1px solid #6FAFD5;
  background:#EAF7FE;
  color:#174A68;
}
.nf-review-home-actions .facebook {
  border:1px solid #1877F2;
  background:#1877F2;
  color:#FFFFFF;
}
@media (max-width:640px) {
  .nf-review-home-card { padding:21px 17px; }
  .nf-review-home-actions { display:grid; }
  .nf-review-home-actions button,
  .nf-review-home-actions a { width:100%; }
}
`;

function BeeIcon({ active = true, size = 29 }) {
  const body = active ? "#F7C41C" : "#DDD5C9";
  const dark = active ? "#2D2418" : "#AAA197";
  const wing = active ? "#B9E1F5" : "#E8E3DC";

  return (
    <svg
      className="nf-bee-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="11" cy="11" rx="6" ry="4.7" fill={wing} stroke={dark} strokeWidth="1.3" />
      <ellipse cx="21" cy="11" rx="6" ry="4.7" fill={wing} stroke={dark} strokeWidth="1.3" />
      <ellipse cx="16" cy="18" rx="8" ry="9" fill={body} stroke={dark} strokeWidth="1.7" />
      <path d="M10 15h12M9.5 20h13M11.5 25h9" stroke={dark} strokeWidth="2.2" />
      <circle cx="13.2" cy="11.2" r="1" fill={dark} />
      <circle cx="18.8" cy="11.2" r="1" fill={dark} />
      <path d="M12 8 9.5 5.5M20 8l2.5-2.5" stroke={dark} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function BeeRating({ value, interactive = false, onChange, size = 29 }) {
  return (
    <div className={interactive ? "nf-review-rating-buttons" : "nf-bee-row"}>
      {[1, 2, 3, 4, 5].map((bee) =>
        interactive ? (
          <button
            key={bee}
            type="button"
            className={`nf-review-rating-button ${bee <= value ? "selected" : ""}`}
            onClick={() => onChange?.(bee)}
            aria-label={`${bee} bee${bee === 1 ? "" : "s"}`}
            aria-pressed={bee === value}
          >
            <BeeIcon active={bee <= value} size={31} />
          </button>
        ) : (
          <BeeIcon key={bee} active={bee <= value} size={size} />
        )
      )}
    </div>
  );
}

const publicReview = async () => {
  const response = await fetch("/.netlify/functions/reviews-public", {
    headers: { Accept: "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Reviews could not be loaded.");
  return Array.isArray(data.reviews) ? data.reviews : [];
};

export function ReviewHomeCard({ onRead, onLeave }) {
  const [photoReviews, setPhotoReviews] = useState([]);

  useEffect(() => {
    let active = true;
    publicReview()
      .then((rows) => {
        if (active) {
          setPhotoReviews(
            rows.filter((review) => review.imageUrl).slice(0, 12)
          );
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="nf-review-home-card">
      <style>{HOME_CARD_CSS}</style>
      <div className="nf-modern-kicker">Real people. Real honey.</div>
      <h2>THE HIVE IS BUZZING</h2>
      <p>
        See what people are saying about NectarFusions, leave your own bee rating,
        or swap recipes and honey ideas with the Honey Hive community.
      </p>

      {photoReviews.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              marginBottom: 10,
              color: "#A56800",
              fontSize: 12,
              fontWeight: 950,
              letterSpacing: ".09em",
              textTransform: "uppercase",
            }}
          >
            See what the hive is buzzing about · tap a photo
          </div>
          <ReviewPhotoCarousel
            reviews={photoReviews}
            compact
            onSelect={() => onRead?.()}
          />
        </div>
      )}

      <div className="nf-review-home-actions">
        <button type="button" className="primary" onClick={onRead}>
          See what people are saying
        </button>
        <button type="button" className="secondary" onClick={onLeave}>
          Leave a review
        </button>
        <a
          className="facebook"
          href={HONEY_HIVE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Join the Honey Hive
        </a>
      </div>
    </section>
  );
}

export default function ReviewsPage({ Header, onBack, styles, flavors = [], onShopFlavor }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rating, setRating] = useState(0);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    productText: "",
    flavorId: "",
    title: "",
    body: "",
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [website, setWebsite] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [requestState, setRequestState] = useState({});

  useEffect(() => {
    let active = true;
    publicReview()
      .then((rows) => {
        if (active) setReviews(rows);
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!image) {
      setImagePreview("");
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const average = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
      reviews.length;
  }, [reviews]);

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!form.displayName.trim() || !form.email.trim() || !form.body.trim() || !rating) {
      setSubmitError("Add your name, email, bee rating, and review before sending.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const optimizedImage = image ? await optimizeReviewImage(image) : null;

      const body = new FormData();
      body.append("displayName", form.displayName.trim());
      body.append("email", form.email.trim());
      body.append("productText", form.productText.trim());
      body.append("flavorId", form.flavorId || "");
      body.append("title", form.title.trim());
      body.append("body", form.body.trim());
      body.append("rating", String(rating));
      body.append("website", website);
      body.append("formStartedAt", String(formStartedAt));
      if (optimizedImage) body.append("image", optimizedImage);

      const response = await fetch("/.netlify/functions/review-submit", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your review could not be submitted.");

      setSubmitted(true);
      setRating(0);
      setForm({
        displayName: "",
        email: "",
        productText: "",
        flavorId: "",
        title: "",
        body: "",
      });
      setImage(null);
      setWebsite("");
      setFormStartedAt(Date.now());
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const requestFlavor = async (review) => {
    if (!review?.flavorId || requestState[review.flavorId] === "sending") return;
    setRequestState((current) => ({ ...current, [review.flavorId]: "sending" }));

    try {
      let requesterKey = "";
      try {
        requesterKey = localStorage.getItem("nfFlavorRequestKey") || "";
        if (!requesterKey) {
          requesterKey =
            globalThis.crypto?.randomUUID?.() ||
            `nf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          localStorage.setItem("nfFlavorRequestKey", requesterKey);
        }
      } catch {
        requesterKey =
          globalThis.crypto?.randomUUID?.() ||
          `nf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      const response = await fetch("/.netlify/functions/flavor-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flavorId: review.flavorId, reviewId: review.id, requesterKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That flavor request could not be saved.");
      setRequestState((current) => ({ ...current, [review.flavorId]: "sent" }));
    } catch (error) {
      setRequestState((current) => ({ ...current, [review.flavorId]: error.message }));
    }
  };

  return (
    <div className="nf">
      <style>{styles}</style>
      <style>{REVIEW_CSS}</style>

      <Header
        eyebrow="NectarFusions community"
        title="REVIEWS"
        right={
          <button className="btn ghost nf-back-to-shop" onClick={onBack}>
            Back to shop
          </button>
        }
      />

      <main className="nf-wrap nf-reviews-page">
        <section className="nf-reviews-hero">
          <div className="nf-modern-kicker">From our hive to yours</div>
          <h2>THE HIVE IS BUZZING</h2>
          <p>
            Honey is better when it gets shared. Read what people are drizzling,
            stirring, gifting, and coming back for, then add your own buzz below.
          </p>

          <div className="nf-review-summary">
            {reviews.length > 0 ? (
              <>
                <BeeRating value={Math.round(average)} size={28} />
                <strong>
                  {average.toFixed(1)} bees from {reviews.length} published review
                  {reviews.length === 1 ? "" : "s"}
                </strong>
              </>
            ) : (
              <strong>Fresh hive. Be one of the first to leave some buzz.</strong>
            )}
          </div>
        </section>

        {!loading && reviews.some((review) => review.imageUrl) && (
          <section
            style={{
              marginTop: 22,
              padding: 22,
              border: "2px solid #72B7E4",
              borderRadius: 24,
              background: "linear-gradient(145deg,#EAF7FE,#FFF9DF)",
            }}
          >
            <div className="nf-modern-kicker">Customer photos</div>
            <h2
              style={{
                margin: "6px 0 9px",
                fontFamily: "'Bebas Neue',Impact,sans-serif",
                fontSize: 40,
                lineHeight: .95,
              }}
            >
              REAL HONEY. REAL PEOPLE. REAL BUZZ.
            </h2>
            <p style={{ margin: "0 0 14px", color: "#5D5148", lineHeight: 1.6 }}>
              Approved customer photos move automatically, pause while you
              interact, and expand when you tap or click them.
            </p>
            <ReviewPhotoCarousel reviews={reviews} />
          </section>
        )}

        {loadError && (
          <div className="err" style={{ marginTop: 16 }}>
            {loadError}
          </div>
        )}

        <section className="nf-reviews-grid" aria-busy={loading}>
          {loading && (
            <div className="nf-review-empty">Gathering the latest buzz…</div>
          )}

          {!loading && !reviews.length && !loadError && (
            <div className="nf-review-empty">
              No published reviews yet. Reviews appear here only after NectarFusions
              has reviewed and approved them.
            </div>
          )}

          {!loading &&
            reviews.map((review) => (
              <article key={review.id} className="nf-review-card">
                {review.imageUrl && (
                  <img
                    className="nf-review-card-photo"
                    src={review.imageUrl}
                    alt={`Photo shared with ${review.displayName}'s NectarFusions review`}
                    loading="lazy"
                  />
                )}

                <BeeRating value={review.rating} size={25} />

                {review.title && <h3>{review.title}</h3>}
                <p>{review.body}</p>

                {(review.flavorName || review.productText) && (
                  <span className="nf-review-product">
                    {review.flavorName || review.productText}
                  </span>
                )}

                {review.flavorId && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 13 }}>
                    {review.flavorAvailable ? (
                      <button
                        type="button"
                        className="btn solid"
                        style={{ padding: "8px 12px", fontSize: 12.5 }}
                        onClick={() => onShopFlavor?.(review.flavorId)}
                      >
                        Shop {review.flavorName || "This Flavor"} →
                      </button>
                    ) : (
                      <>
                        <span style={{
                          display: "inline-flex",
                          padding: "6px 9px",
                          borderRadius: 999,
                          background: review.popularRequest ? "#F7C41C" : "#FFF0A8",
                          color: "#6A4300",
                          fontSize: 12,
                          fontWeight: 900,
                        }}>
                          {review.popularRequest
                            ? "Popular Request · Currently Out"
                            : "Popular Pick · Currently Out"}
                        </span>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: "8px 12px", fontSize: 12.5, borderColor: "#D28A00", background: "#FFF7D8", color: "#6A4300" }}
                          disabled={requestState[review.flavorId] === "sending"}
                          onClick={() => requestFlavor(review)}
                        >
                          {requestState[review.flavorId] === "sending"
                            ? "Requesting…"
                            : requestState[review.flavorId] === "sent"
                              ? "Requested ✓"
                              : `Request ${review.flavorName || "This Flavor"}`}
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="nf-review-meta">
                  <strong>{review.displayName}</strong>
                  {review.approvedAt && (
                    <> · {new Date(review.approvedAt).toLocaleDateString()}</>
                  )}
                </div>
              </article>
            ))}
        </section>

        {submitted ? (
          <section id="nf-leave-review" className="nf-review-success">
            <div className="nf-bee-row" style={{ justifyContent: "center" }}>
              <BeeIcon active size={37} />
              <BeeIcon active size={37} />
              <BeeIcon active size={37} />
            </div>
            <h2>YOUR REVIEW FLEW INTO THE HIVE</h2>
            <p>
              Thank you! NectarFusions reviews every submission before it appears
              publicly, so your review will not show on the page immediately.
            </p>
            <button
              type="button"
              className="btn solid"
              style={{ padding: "12px 18px", marginTop: 8 }}
              onClick={() => setSubmitted(false)}
            >
              Leave another review
            </button>
          </section>
        ) : (
          <form id="nf-leave-review" className="nf-review-form" onSubmit={submit}>
            <div className="nf-modern-kicker">Add your buzz</div>
            <h2>LEAVE A REVIEW</h2>
            <p>
              Tell us what you tried, how you used it, who you shared it with, or
              whatever made the jar memorable. Take all the space you need.
            </p>

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
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </label>
            </div>

            <div className="nf-review-form-grid">
              <label className="nf-review-label">
                Your name
                <input
                  value={form.displayName}
                  placeholder="Name shown with your review"
                  autoComplete="name"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="nf-review-label">
                Email
                <input
                  type="email"
                  value={form.email}
                  placeholder="Kept private"
                  autoComplete="email"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="nf-review-label wide">
                Flavor reviewed (optional)
                <select
                  value={form.flavorId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, flavorId: event.target.value }))
                  }
                >
                  <option value="">Choose a NectarFusions flavor</option>
                  {flavors
                    .slice()
                    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                    .map((flavor) => (
                      <option key={flavor.id} value={flavor.id}>
                        {flavor.name}{flavor.active === false ? " · currently unavailable" : ""}
                      </option>
                    ))}
                </select>
              </label>

              <label className="nf-review-label wide">
                Anything else they tried? (optional)
                <input
                  value={form.productText}
                  placeholder="Example: Honey Club box, gift set..."
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      productText: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="nf-review-label wide">
                Review title (optional)
                <input
                  value={form.title}
                  placeholder="Give your review a headline"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="nf-review-rating">
              <div className="nf-review-rating-title">
                How many bees would you give it?
              </div>
              <BeeRating
                value={rating}
                interactive
                onChange={setRating}
              />
              <div style={{ marginTop: 8, color: "#7B5821", fontSize: 13 }}>
                {rating
                  ? `${rating} bee${rating === 1 ? "" : "s"} selected`
                  : "Choose 1–5 bees"}
              </div>
            </div>

            <label className="nf-review-label">
              Your review
              <textarea
                rows={7}
                value={form.body}
                placeholder="Tell us the whole story..."
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </label>

            <label className="nf-review-label" style={{ marginTop: 13 }}>
              Add a photo (optional)
              <input
                className="nf-review-image-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => setImage(event.target.files?.[0] || null)}
              />
            </label>

            <div style={{ marginTop: 7, color: "#7B5821", fontSize: 12.5 }}>
              Photos are automatically resized and compressed for fast web loading before upload.
            </div>

            {imagePreview && (
              <img
                className="nf-review-image-preview"
                src={imagePreview}
                alt="Review upload preview"
              />
            )}

            {submitError && (
              <div className="err" style={{ marginTop: 13 }}>
                {submitError}
              </div>
            )}

            <div className="nf-review-moderation-note">
              <strong>Reviews are moderated.</strong> Every submission goes to
              NectarFusions for approval before it can appear publicly. Your email
              is for review follow-up only and is never shown with your review.
            </div>

            <button
              type="submit"
              className="btn solid"
              style={{ width: "100%", padding: 15, marginTop: 13, fontSize: 16 }}
              disabled={submitting}
            >
              {submitting ? "Sending your review…" : "Send My Review"}
            </button>
          </form>
        )}

        <section className="nf-honey-hive">
          <div className="nf-modern-kicker">Recipes, pairings & honey ideas</div>
          <h2>JOIN THE HONEY HIVE</h2>
          <p>
            Found a new way to use your NectarFusions honey? Share recipes,
            pairings, drinks, marinades, baking ideas, and inspiration with other
            honey lovers in our Facebook group.
          </p>
          <div className="nf-honey-hive-actions">
            <a
              className="nf-honey-hive-link"
              href={HONEY_HIVE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Visit the Honey Hive on Facebook
            </a>
          </div>
        </section>

        <button
          type="button"
          className="btn ghost"
          style={{ width: "100%", padding: 14, marginTop: 15 }}
          onClick={onBack}
        >
          Back to the shop
        </button>
      </main>
    </div>
  );
}
