import { useEffect, useRef, useState } from "react";

const colors = {
  ink: "#17120C",
  brown: "#5B3D17",
  amber: "#E69B00",
  border: "#E2D5C1",
  green: "#176B3A",
  red: "#A62922",
};

const buttonStyle = {
  border: 0,
  borderRadius: 10,
  background: colors.green,
  color: "#fff",
  fontWeight: 900,
  padding: "12px 16px",
  cursor: "pointer",
};

const formatDay = (iso) => {
  if (!iso) return "";

  const [year, month, day] = iso.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day, 12));
};

const cadenceLabel = (cadence) =>
  cadence === "1mo" ? "Monthly" : "Every 2 months";

async function requestCardSetup(body) {
  const response = await fetch(
    "/.netlify/functions/subscription-card-setup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error ||
        "Secure recurring card setup could not be completed."
    );
  }

  return data;
}

function loadSquareScript(src) {
  if (window.Square) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(
      `script[data-nf-square-sdk="${src}"]`
    );

    if (existing) {
      existing.addEventListener("load", resolve, {
        once: true,
      });
      existing.addEventListener(
        "error",
        () => reject(new Error("Square secure card form could not load.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.nfSquareSdk = src;

    script.addEventListener("load", resolve, {
      once: true,
    });

    script.addEventListener(
      "error",
      () => reject(new Error("Square secure card form could not load.")),
      { once: true }
    );

    document.head.appendChild(script);
  });
}

export default function SubscriptionCardSetup({
  token,
  onComplete,
}) {
  const cardRef = useRef(null);
  const mountedCardRef = useRef(null);

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setLoading(true);
      setError("");

      try {
        const nextConfig = await requestCardSetup({
          action: "config",
          token,
        });

        if (cancelled) return;

        if (nextConfig.setupComplete) {
          setSuccess(
            nextConfig.recurringStartDate
              ? `Recurring Honey Club billing is scheduled for ${formatDay(
                  nextConfig.recurringStartDate
                )}.`
              : "Recurring Honey Club card setup is complete."
          );

          setLoading(false);
          return;
        }

        setConfig(nextConfig);

        if (nextConfig.hasSavedCard) {
          setLoading(false);
          return;
        }

        await loadSquareScript(nextConfig.squareJsUrl);

        if (cancelled) return;

        if (!window.Square) {
          throw new Error(
            "Square secure card form is unavailable."
          );
        }

        const payments = window.Square.payments(
          nextConfig.applicationId,
          nextConfig.locationId
        );

        const card = await payments.card();

        if (cancelled) {
          if (card.destroy) await card.destroy();
          return;
        }

        mountedCardRef.current = card;

        if (!cardRef.current) {
          throw new Error(
            "Secure card form could not be attached."
          );
        }

        await card.attach(cardRef.current);

        if (!cancelled) {
          setLoading(false);
        }
      } catch (startError) {
        if (!cancelled) {
          setError(startError.message);
          setLoading(false);
        }
      }
    }

    start();

    return () => {
      cancelled = true;

      const card = mountedCardRef.current;
      mountedCardRef.current = null;

      if (card?.destroy) {
        Promise.resolve(card.destroy()).catch(() => {});
      }
    };
  }, [token]);

  async function finishSetup() {
    if (!confirmed || !config) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      let sourceId = "";

      if (!config.hasSavedCard) {
        const card = mountedCardRef.current;

        if (!card) {
          throw new Error(
            "Secure card form is not ready yet."
          );
        }

        const tokenResult = await card.tokenize({
          intent: "STORE",
          customerInitiated: true,
          sellerKeyedIn: false,
          billingContact: config.billingContact,
        });

        if (
          tokenResult.status !== "OK" ||
          !tokenResult.token
        ) {
          throw new Error(
            tokenResult.errors?.[0]?.message ||
              "Square could not verify the card. Please check the card details and try again."
          );
        }

        sourceId = tokenResult.token;
      }

      const result = await requestCardSetup({
        action: "complete",
        token,
        authorizationConfirmed: confirmed,
        ...(sourceId ? { sourceId } : {}),
      });

      setSuccess(
        result.message ||
          `Secure card setup is complete. Recurring Honey Club billing begins ${formatDay(
            result.recurringStartDate
          )}.`
      );

      if (onComplete) {
        await onComplete(result);
      }
    } catch (setupError) {
      setError(setupError.message);
    } finally {
      setSaving(false);
    }
  }

  if (success && !config) {
    return (
      <div
        style={{
          marginTop: 18,
          padding: 16,
          borderRadius: 12,
          background: "#EAF7EF",
          color: colors.green,
          fontWeight: 800,
          lineHeight: 1.55,
        }}
      >
        {success}
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 20,
        padding: 18,
        border: `2px solid ${colors.amber}`,
        borderRadius: 14,
        background: "#FFFDF8",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          color: colors.amber,
          textTransform: "uppercase",
          letterSpacing: ".08em",
        }}
      >
        Secure Recurring Card Setup
      </div>

      <h2 style={{ margin: "5px 0 8px" }}>
        Finish your Honey Club billing
      </h2>

      {config && (
        <div
          style={{
            color: colors.brown,
            lineHeight: 1.55,
            marginBottom: 16,
          }}
        >
          Your first Honey Club box is already paid.
          <br />
          <strong>No charge will be made today.</strong>
          <br />
          {config.planName} · {cadenceLabel(config.cadence)}
          <br />
          Recurring billing begins{" "}
          <strong>
            {formatDay(config.recurringStartDate)}
          </strong>
          .
        </div>
      )}

      {loading && (
        <div style={{ lineHeight: 1.5 }}>
          Loading Square’s secure card form...
        </div>
      )}

      {config && !config.hasSavedCard && (
        <div
          ref={cardRef}
          style={{
            minHeight: 90,
            marginBottom: 14,
          }}
        />
      )}

      {config?.hasSavedCard && (
        <div
          style={{
            padding: 12,
            marginBottom: 14,
            borderRadius: 10,
            background: "#F7F4EF",
            lineHeight: 1.5,
          }}
        >
          Your secure card was already stored during an earlier
          setup attempt. Continue below to finish scheduling the
          recurring subscription. You will not be charged today.
        </div>
      )}

      {config && !loading && (
        <label
          style={{
            display: "block",
            padding: 13,
            borderRadius: 10,
            background: "#F7F4EF",
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) =>
              setConfirmed(event.target.checked)
            }
          />{" "}
          I authorize NectarFusions to securely store this payment
          method with Square and charge it for my recurring Honey
          Club membership beginning{" "}
          {formatDay(config.recurringStartDate)} according to my
          selected cadence.
        </label>
      )}

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#FDECEA",
            color: colors.red,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#EAF7EF",
            color: colors.green,
            fontWeight: 800,
            marginBottom: 14,
          }}
        >
          {success}
        </div>
      )}

      {config && !loading && !success && (
        <button
          type="button"
          onClick={finishSetup}
          disabled={saving || !confirmed}
          style={{
            ...buttonStyle,
            opacity: saving || !confirmed ? 0.55 : 1,
          }}
        >
          {saving
            ? "Securing Card..."
            : config.hasSavedCard
              ? "Finish Recurring Setup"
              : "Secure Card & Schedule Billing"}
        </button>
      )}

      <div
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "#655A4D",
          lineHeight: 1.5,
        }}
      >
        Card information is entered directly into Square’s secure
        payment form. NectarFusions does not receive or store your
        full card number or security code.
      </div>
    </div>
  );
}
