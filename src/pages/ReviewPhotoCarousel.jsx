import { useEffect, useMemo, useRef, useState } from "react";

const CAROUSEL_CSS = `
.nf-review-carousel {
  position:relative;
  overflow:hidden;
  border:1px solid #D8E7F0;
  border-radius:24px;
  background:linear-gradient(145deg,#F8FCFE,#FFF9E8);
  box-shadow:0 15px 34px rgba(32,86,122,.09);
}
.nf-review-carousel-viewport { overflow:hidden; border-radius:inherit; }
.nf-review-carousel-track {
  display:flex;
  transition:transform .62s cubic-bezier(.22,1,.36,1);
  will-change:transform;
}
.nf-review-carousel-slide {
  min-width:100%;
  padding:14px;
  display:grid;
  gap:10px;
}
.nf-review-carousel-image-button {
  width:100%;
  padding:0;
  border:0;
  border-radius:19px;
  overflow:hidden;
  background:#FFFFFF;
  cursor:pointer;
  box-shadow:0 10px 24px rgba(28,64,84,.10);
}
.nf-review-carousel-image {
  display:block;
  width:100%;
  height:clamp(260px,48vw,520px);
  object-fit:cover;
  transition:transform .28s cubic-bezier(.22,1,.36,1),filter .28s ease;
}
.nf-review-carousel-image-button:hover .nf-review-carousel-image,
.nf-review-carousel-image-button:focus-visible .nf-review-carousel-image {
  transform:scale(1.065);
  filter:saturate(1.04);
}
.nf-review-carousel-caption {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:0 4px 2px;
  color:#5D5148;
  font-size:13px;
  line-height:1.45;
}
.nf-review-carousel-caption strong { color:#174F72; font-size:14px; }
.nf-review-carousel-caption span:last-child { color:#9B6A00; font-weight:850; }
.nf-review-carousel-arrow {
  position:absolute;
  top:50%;
  z-index:3;
  width:44px;
  height:44px;
  display:grid;
  place-items:center;
  transform:translateY(-50%);
  border:2px solid rgba(255,255,255,.92);
  border-radius:50%;
  background:rgba(23,74,104,.78);
  color:#FFFFFF;
  font-size:26px;
  cursor:pointer;
  box-shadow:0 8px 20px rgba(0,0,0,.18);
}
.nf-review-carousel-arrow.prev { left:24px; }
.nf-review-carousel-arrow.next { right:24px; }
.nf-review-carousel-dots {
  display:flex;
  justify-content:center;
  gap:7px;
  padding:0 0 15px;
}
.nf-review-carousel-dot {
  width:9px;
  height:9px;
  padding:0;
  border:0;
  border-radius:50%;
  background:#C4D1D8;
  cursor:pointer;
}
.nf-review-carousel-dot.active {
  width:24px;
  border-radius:999px;
  background:#F2AA00;
}
.nf-review-carousel.compact .nf-review-carousel-image {
  height:clamp(220px,34vw,380px);
}
.nf-review-lightbox {
  position:fixed;
  inset:0;
  z-index:500;
  display:grid;
  place-items:center;
  padding:20px;
  background:rgba(14,15,16,.84);
}
.nf-review-lightbox-inner {
  position:relative;
  width:min(1000px,96vw);
  max-height:92vh;
  display:grid;
  place-items:center;
}
.nf-review-lightbox img {
  max-width:100%;
  max-height:86vh;
  border-radius:20px;
  object-fit:contain;
  box-shadow:0 24px 60px rgba(0,0,0,.34);
}
.nf-review-lightbox-close {
  position:absolute;
  right:-10px;
  top:-10px;
  width:46px;
  height:46px;
  border:2px solid #FFFFFF;
  border-radius:50%;
  background:#C82727;
  color:#FFFFFF;
  font-size:27px;
  cursor:pointer;
}
@media (max-width:640px) {
  .nf-review-carousel-slide { padding:10px; }
  .nf-review-carousel-image { height:300px; }
  .nf-review-carousel.compact .nf-review-carousel-image { height:250px; }
  .nf-review-carousel-arrow { width:40px; height:40px; font-size:22px; }
  .nf-review-carousel-arrow.prev { left:16px; }
  .nf-review-carousel-arrow.next { right:16px; }
  .nf-review-carousel-caption {
    align-items:flex-start;
    flex-direction:column;
    gap:3px;
  }
}
@media (prefers-reduced-motion:reduce) {
  .nf-review-carousel-track,
  .nf-review-carousel-image { transition:none !important; }
}
`;

export default function ReviewPhotoCarousel({
  reviews = [],
  onSelect = null,
  compact = false,
}) {
  const images = useMemo(
    () => reviews.filter((review) => review?.imageUrl),
    [reviews]
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const resumeTimer = useRef(null);

  useEffect(() => {
    if (index < images.length) return;
    setIndex(0);
  }, [images.length, index]);

  useEffect(() => {
    if (images.length < 2 || paused || expanded) return undefined;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, 4200);

    return () => window.clearInterval(timer);
  }, [images.length, paused, expanded]);

  useEffect(() => {
    if (!expanded) return undefined;

    const close = (event) => {
      if (event.key !== "Escape") return;
      setExpanded(null);
      setPaused(false);
    };

    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    []
  );

  if (!images.length) return null;

  const hold = () => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    setPaused(true);
  };

  const resume = (delay = 650) => {
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), delay);
  };

  const move = (direction) => {
    hold();
    setIndex((current) => {
      const next = current + direction;
      if (next < 0) return images.length - 1;
      if (next >= images.length) return 0;
      return next;
    });
    resume(1500);
  };

  const choose = (review) => {
    hold();
    if (onSelect) {
      onSelect(review);
      resume(1200);
      return;
    }
    setExpanded(review);
  };

  return (
    <>
      <style>{CAROUSEL_CSS}</style>
      <section
        className={`nf-review-carousel ${compact ? "compact" : ""}`}
        onMouseEnter={hold}
        onMouseLeave={() => resume()}
        onFocusCapture={hold}
        onBlurCapture={() => resume()}
        onTouchStart={hold}
        onTouchEnd={() => resume(1200)}
        aria-label="Customer review photo carousel"
      >
        <div className="nf-review-carousel-viewport">
          <div
            className="nf-review-carousel-track"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {images.map((review) => (
              <article className="nf-review-carousel-slide" key={review.id}>
                <button
                  type="button"
                  className="nf-review-carousel-image-button"
                  onClick={() => choose(review)}
                  aria-label={
                    onSelect
                      ? `Open reviews from ${review.displayName}`
                      : `Expand photo from ${review.displayName}'s review`
                  }
                >
                  <img
                    className="nf-review-carousel-image"
                    src={review.imageUrl}
                    alt={`Photo shared with ${review.displayName}'s NectarFusions review`}
                    loading="lazy"
                  />
                </button>
                <div className="nf-review-carousel-caption">
                  <strong>
                    {review.flavorName || review.productText || "NectarFusions"}
                    {" · "}
                    {review.displayName}
                  </strong>
                  <span>{onSelect ? "Tap to read the buzz →" : "Tap to expand"}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              className="nf-review-carousel-arrow prev"
              onClick={() => move(-1)}
              aria-label="Previous review photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="nf-review-carousel-arrow next"
              onClick={() => move(1)}
              aria-label="Next review photo"
            >
              ›
            </button>
            <div className="nf-review-carousel-dots" aria-label="Review photo position">
              {images.map((review, dotIndex) => (
                <button
                  type="button"
                  key={review.id}
                  className={`nf-review-carousel-dot ${
                    dotIndex === index ? "active" : ""
                  }`}
                  onClick={() => {
                    hold();
                    setIndex(dotIndex);
                    resume(1500);
                  }}
                  aria-label={`Show review photo ${dotIndex + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {expanded && !onSelect && (
        <div
          className="nf-review-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded customer review photo"
          onClick={() => {
            setExpanded(null);
            resume();
          }}
        >
          <div
            className="nf-review-lightbox-inner"
            onClick={(event) => event.stopPropagation()}
          >
            <img
              src={expanded.imageUrl}
              alt={`Expanded photo from ${expanded.displayName}'s NectarFusions review`}
            />
            <button
              type="button"
              className="nf-review-lightbox-close"
              onClick={() => {
                setExpanded(null);
                resume();
              }}
              aria-label="Close expanded photo"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
