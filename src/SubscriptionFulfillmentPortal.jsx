import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

const colors = {
  ink: "#17120C",
  brown: "#5B3D17",
  gold: "#F7C41C",
  amber: "#E69B00",
  cream: "#F8F2E8",
  white: "#FFFFFF",
  border: "#E2D5C1",
  green: "#176B3A",
  red: "#A62922",
  blue: "#1C5D91",
};

const pageStyle = {
  minHeight: "100vh",
  background: colors.cream,
  color: colors.ink,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  padding: "28px 16px 64px",
};

const shellStyle = {
  width: "min(980px, 100%)",
  margin: "0 auto",
};

const cardStyle = {
  background: colors.white,
  border: `1px solid ${colors.border}`,
  borderRadius: 18,
  padding: 20,
  boxShadow: "0 8px 28px rgba(74,51,19,.07)",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 15,
  background: "#fff",
};

const labelStyle = {
  display: "grid",
  gap: 6,
  fontWeight: 700,
  fontSize: 13,
  color: colors.brown,
};

const primaryButton = {
  border: 0,
  borderRadius: 10,
  background: colors.ink,
  color: "#fff",
  fontWeight: 900,
  padding: "12px 16px",
  cursor: "pointer",
};

const secondaryButton = {
  ...primaryButton,
  background: "#fff",
  color: colors.ink,
  border: `1px solid ${colors.border}`,
};

const formatDay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(y, m - 1, d, 12));
};

const cadenceLabel = (cadence) =>
  cadence === "1mo" ? "Monthly" : "Every 2 months";

const billingLabel = (mode) => {
  if (mode === "market_manual") return "Pay at market";
  if (mode === "card_setup_required") return "Card setup required";
  return "Recurring card billing";
};

async function callFunction(body, { admin = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (admin) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error("Please sign in as an Admin first.");
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(
    "/.netlify/functions/subscription-fulfillment",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The update could not be completed.");
  }
  return data;
}

function Header({ admin }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <a
        href={admin ? "/" : "javascript:history.back()"}
        onClick={
          admin
            ? undefined
            : (event) => {
                event.preventDefault();
                window.history.back();
              }
        }
        style={{
          color: colors.brown,
          textDecoration: "none",
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        ← Back
      </a>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
        }}
      >
        <img
          src="/logo.png"
          alt="NectarFusions"
          style={{ width: 58, height: 58, objectFit: "contain" }}
        />
        <div>
          <div
            style={{
              textTransform: "uppercase",
              letterSpacing: ".14em",
              fontSize: 11,
              fontWeight: 900,
              color: colors.amber,
            }}
          >
            NectarFusions Honey Club
          </div>
          <h1 style={{ margin: "3px 0 0", fontSize: 28 }}>
            {admin
              ? "Fulfillment Admin"
              : "Delivery & Pickup Settings"}
          </h1>
        </div>
      </div>
    </div>
  );
}

function MarketChoice({ markets, value, onChange, setMethod }) {
  if (!markets.length) {
    return (
      <div
        style={{
          border: `1px solid ${colors.amber}`,
          background: "#FFF8DD",
          borderRadius: 12,
          padding: 14,
        }}
      >
        <strong>No markets are available at this time.</strong>
        <div style={{ marginTop: 6, lineHeight: 1.5 }}>
          Choose Home Delivery instead and we’ll bring your Honey Club box
          to the saved address.
        </div>
        <button
          type="button"
          style={{ ...secondaryButton, marginTop: 10 }}
          onClick={() => setMethod("delivery")}
        >
          Use Home Delivery
        </button>
      </div>
    );
  }

  return (
    <label style={labelStyle}>
      Select your pickup market
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        required
      >
        <option value="">Choose a market</option>
        {markets.map((market) => (
          <option key={market.id} value={market.id}>
            {formatDay(market.day)} · {market.name}
            {market.hours ? ` · ${market.hours}` : ""}
            {market.whereAt ? ` · ${market.whereAt}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function FulfillmentForm({
  initial,
  markets,
  admin = false,
  onSaved,
}) {
  const [form, setForm] = useState(() => ({
    method:
      initial.method === "market" ? "market" : "delivery",
    address: initial.address || "",
    deliveryZip: initial.deliveryZip || "",
    deliveryLocationType:
      initial.deliveryLocationType || "",
    buildingDetails: initial.buildingDetails || "",
    gateCode: initial.gateCode || "",
    deliveryNotes: initial.deliveryNotes || "",
    temporaryDeliveryNotes:
      initial.temporaryDeliveryNotes || "",
    preferredContactMethod:
      initial.preferredContactMethod || "",
    preferredDeliveryTiming:
      initial.preferredDeliveryTiming || "",
    marketDateId: initial.marketDateId || "",
    isGift: Boolean(initial.isGift),
    recipientName: initial.recipientName || "",
    giftMessage: initial.giftMessage || "",
    termsAccepted: false,
    adminConfirmedAuthorization: false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [needsCardSetup, setNeedsCardSetup] =
    useState(Boolean(initial.needsCardSetup));
  const [setupUrl, setSetupUrl] = useState(
    initial.customerSettingsUrl || ""
  );

  const change = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const switchingToDelivery =
    admin &&
    initial.method !== "delivery" &&
    form.method === "delivery";

  const savedDeliverySetupComplete = Boolean(
    initial.termsAcceptedAt &&
      initial.address &&
      initial.deliveryZip &&
      initial.deliveryLocationType &&
      initial.preferredContactMethod
  );

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        action: "update",
        ...form,
        ...(admin
          ? { subscriptionId: initial.id }
          : {
              token: window.location.pathname
                .split("/")
                .filter(Boolean)[1],
            }),
      };

      const data = await callFunction(payload, { admin });
      setSuccess(data.message || "Saved.");
      setNeedsCardSetup(Boolean(data.needsCardSetup));
      setSetupUrl(data.setupUrl || initial.customerSettingsUrl || "");

      if (onSaved) await onSaved(data);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function continueToSquare() {
    setSaving(true);
    setError("");

    try {
      const token = window.location.pathname
        .split("/")
        .filter(Boolean)[1];

      const response = await fetch(
        "/.netlify/functions/subscribe-link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(
          data.error || "Secure Square setup could not be opened."
        );
      }

      window.location.href = data.url;
    } catch (squareError) {
      setError(squareError.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 18 }}>
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 900,
            color: colors.amber,
            textTransform: "uppercase",
            letterSpacing: ".08em",
          }}
        >
          {initial.planName} · {cadenceLabel(initial.cadence)}
        </div>
        <h2 style={{ margin: "4px 0 5px" }}>
          {admin ? initial.memberName : `Hi ${initial.memberName || "there"}!`}
        </h2>
        <div style={{ color: "#655A4D", lineHeight: 1.5 }}>
          Current billing: <strong>{billingLabel(initial.billingMode)}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <strong>How should this Honey Club box be fulfilled?</strong>
        <label
          style={{
            border:
              form.method === "delivery"
                ? `2px solid ${colors.amber}`
                : `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name="method"
            checked={form.method === "delivery"}
            onChange={() => change("method", "delivery")}
          />{" "}
          <strong>Home Delivery</strong>
          <div
            style={{
              marginLeft: 22,
              marginTop: 4,
              color: "#655A4D",
              fontSize: 13,
            }}
          >
            Honey Club delivery is included with the membership. The saved
            card is billed for the recurring Honey Club plan.
          </div>
        </label>

        <label
          style={{
            border:
              form.method === "market"
                ? `2px solid ${colors.amber}`
                : `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: 13,
            cursor: "pointer",
          }}
        >
          <input
            type="radio"
            name="method"
            checked={form.method === "market"}
            onChange={() => change("method", "market")}
          />{" "}
          <strong>Market Pickup</strong>
          <div
            style={{
              marginLeft: 22,
              marginTop: 4,
              color: "#655A4D",
              fontSize: 13,
            }}
          >
            Future recurring card billing is paused while Market Pickup is
            active. Pay at the selected market unless that box was already
            billed before the switch.
          </div>
        </label>
      </div>

      {form.method === "market" ? (
        <MarketChoice
          markets={markets}
          value={form.marketDateId}
          onChange={(value) => change("marketDateId", value)}
          setMethod={(value) => change("method", value)}
        />
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <label style={labelStyle}>
            Delivery address *
            <input
              value={form.address}
              onChange={(e) => change("address", e.target.value)}
              style={inputStyle}
              placeholder="Street address"
              required
            />
          </label>

          <label style={labelStyle}>
            ZIP code *
            <input
              value={form.deliveryZip}
              onChange={(e) =>
                change(
                  "deliveryZip",
                  e.target.value.replace(/\D/g, "").slice(0, 5)
                )
              }
              style={inputStyle}
              inputMode="numeric"
              placeholder="48618"
              required
            />
          </label>

          <label style={labelStyle}>
            What type of location is this? *
            <select
              value={form.deliveryLocationType}
              onChange={(e) =>
                change("deliveryLocationType", e.target.value)
              }
              style={inputStyle}
              required
            >
              <option value="">Choose one</option>
              <option value="house">House</option>
              <option value="apartment_condo">
                Apartment / Condo
              </option>
              <option value="business">Business</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label style={labelStyle}>
            Building, apartment, suite, or unit
            <input
              value={form.buildingDetails}
              onChange={(e) =>
                change("buildingDetails", e.target.value)
              }
              style={inputStyle}
              placeholder="Apt 4B, Suite 200, Building C..."
            />
          </label>

          <label style={labelStyle}>
            Gate or entry code
            <input
              value={form.gateCode}
              onChange={(e) => change("gateCode", e.target.value)}
              style={inputStyle}
              placeholder="Optional"
            />
          </label>

          <label style={labelStyle}>
            Drop-off notes or special requests
            <textarea
              value={form.deliveryNotes}
              onChange={(e) =>
                change("deliveryNotes", e.target.value)
              }
              style={{ ...inputStyle, minHeight: 90 }}
              placeholder="Where should we leave your order?"
            />
          </label>

          <label style={labelStyle}>
            Temporary or seasonal delivery notes
            <textarea
              value={form.temporaryDeliveryNotes}
              onChange={(e) =>
                change("temporaryDeliveryNotes", e.target.value)
              }
              style={{ ...inputStyle, minHeight: 80 }}
              placeholder="Example: Leave at the side door when snowy"
            />
          </label>

          <label style={labelStyle}>
            Preferred contact method for delivery problems *
            <select
              value={form.preferredContactMethod}
              onChange={(e) =>
                change("preferredContactMethod", e.target.value)
              }
              style={inputStyle}
              required
            >
              <option value="">Choose one</option>
              <option value="text">Text</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
            </select>
          </label>

          <label style={labelStyle}>
            Preferred delivery day(s) or window
            <input
              value={form.preferredDeliveryTiming}
              onChange={(e) =>
                change("preferredDeliveryTiming", e.target.value)
              }
              style={inputStyle}
              placeholder="Preference only, based on route availability"
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 800,
            }}
          >
            <input
              type="checkbox"
              checked={form.isGift}
              onChange={(e) =>
                change("isGift", e.target.checked)
              }
            />
            This delivery is going to someone else as a gift
          </label>

          {form.isGift && (
            <>
              <label style={labelStyle}>
                Recipient name *
                <input
                  value={form.recipientName}
                  onChange={(e) =>
                    change("recipientName", e.target.value)
                  }
                  style={inputStyle}
                  required
                />
              </label>

              <label style={labelStyle}>
                Gift message
                <textarea
                  value={form.giftMessage}
                  onChange={(e) =>
                    change("giftMessage", e.target.value)
                  }
                  style={{ ...inputStyle, minHeight: 75 }}
                />
              </label>
            </>
          )}
        </div>
      )}

      {switchingToDelivery && (
        <label
          style={{
            padding: 13,
            borderRadius: 10,
            background: "#FFF8DD",
            border: `1px solid ${colors.amber}`,
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={form.adminConfirmedAuthorization}
            onChange={(e) =>
              change(
                "adminConfirmedAuthorization",
                e.target.checked
              )
            }
          />{" "}
          I confirm the customer authorized changing this membership to Home
          Delivery and recurring Honey Club card billing.
        </label>
      )}

      <label
        style={{
          padding: 13,
          borderRadius: 10,
          background: "#F7F4EF",
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={form.termsAccepted}
          onChange={(e) =>
            change("termsAccepted", e.target.checked)
          }
          required
        />{" "}
        {form.method === "market"
          ? "I acknowledge that the Honey Club membership continues until changed or cancelled, future Market Pickup boxes are not automatically charged to the card, and payment is due at pickup unless that box was already billed before the switch."
          : "I acknowledge the recurring Honey Club membership and authorize the saved Square payment method to be billed according to the selected membership cadence."}
      </label>

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            background: "#FDECEA",
            color: colors.red,
            fontWeight: 700,
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
            fontWeight: 700,
          }}
        >
          {success}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="submit"
          disabled={saving}
          style={{
            ...primaryButton,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Fulfillment Settings"}
        </button>

        {!admin &&
          needsCardSetup &&
          (success || savedDeliverySetupComplete) && (
          <button
            type="button"
            onClick={continueToSquare}
            disabled={saving}
            style={{
              ...primaryButton,
              background: colors.green,
            }}
          >
            Continue to Secure Card Setup
          </button>
        )}

        {admin && needsCardSetup && setupUrl && (
          <button
            type="button"
            style={secondaryButton}
            onClick={async () => {
              await navigator.clipboard.writeText(setupUrl);
              setSuccess(
                "Customer secure setup link copied to clipboard."
              );
            }}
          >
            Copy Customer Setup Link
          </button>
        )}
      </div>
    </form>
  );
}

function CustomerPortal({ token }) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  const load = useCallback(async () => {
    try {
      const data = await callFunction({
        action: "load",
        token,
      });
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error.message,
        data: null,
      });
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) {
    return <div style={cardStyle}>Loading Honey Club settings...</div>;
  }

  if (state.error) {
    return (
      <div style={{ ...cardStyle, color: colors.red }}>
        {state.error}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <FulfillmentForm
        key={`${state.data.subscription.subNo}-${state.data.subscription.fulfillmentUpdatedAt || ""}`}
        initial={state.data.subscription}
        markets={state.data.markets || []}
        onSaved={load}
      />
    </div>
  );
}

function AdminPortal() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: null,
  });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await callFunction(
        { action: "admin-list" },
        { admin: true }
      );
      setState({ loading: false, error: "", data });
    } catch (error) {
      setState({
        loading: false,
        error: error.message,
        data: null,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = state.data?.subscriptions || [];
    if (!query) return all;

    return all.filter((sub) =>
      [
        sub.memberName,
        sub.email,
        sub.phone,
        sub.subNo,
        sub.planName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, state.data]);

  async function markPickup(sub) {
    if (
      !window.confirm(
        `Mark the next ${sub.memberName} Honey Club market box as picked up and paid? Only continue if this box was actually paid at the market and has not already been recorded through Square.`
      )
    ) {
      return;
    }

    setNotice("");

    try {
      const data = await callFunction(
        {
          action: "admin-mark-pickup",
          subscriptionId: sub.id,
          referenceId: crypto.randomUUID(),
        },
        { admin: true }
      );

      setNotice(data.message || "Market pickup recorded.");
      await load();
    } catch (error) {
      setNotice(error.message);
    }
  }

  if (state.loading) {
    return <div style={cardStyle}>Loading Honey Club members...</div>;
  }

  if (state.error) {
    return (
      <div style={{ ...cardStyle, color: colors.red }}>
        {state.error}
      </div>
    );
  }

  if (editing) {
    return (
      <div style={cardStyle}>
        <button
          type="button"
          style={{ ...secondaryButton, marginBottom: 18 }}
          onClick={() => setEditing(null)}
        >
          ← All Honey Club Members
        </button>

        <FulfillmentForm
          initial={editing}
          markets={state.data.markets || []}
          admin
          onSaved={async () => {
            await load();
            setEditing(null);
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
          placeholder="Search member, email, phone, subscription..."
        />
      </div>

      {notice && (
        <div
          style={{
            ...cardStyle,
            color: notice.includes("BONUS")
              ? colors.amber
              : colors.green,
            fontWeight: 900,
          }}
        >
          {notice}
        </div>
      )}

      {filtered.map((sub) => (
        <div key={sub.id} style={cardStyle}>
          <div
            style={{
              display: "flex",
              gap: 14,
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>{sub.memberName}</h2>
              <div
                style={{
                  color: "#655A4D",
                  marginTop: 4,
                  lineHeight: 1.55,
                }}
              >
                #{sub.subNo} · {sub.planName} ·{" "}
                {cadenceLabel(sub.cadence)}
                <br />
                {sub.email} · {sub.phone}
              </div>
            </div>

            <div
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                background:
                  sub.billingMode === "market_manual"
                    ? "#FFF3C4"
                    : sub.billingMode === "card_setup_required"
                      ? "#FDECEA"
                      : "#EAF7EF",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              {sub.method === "market"
                ? "Market Pickup"
                : "Home Delivery"}{" "}
              · {billingLabel(sub.billingMode)}
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "grid",
              gap: 7,
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {sub.method === "market" ? (
              <div>
                <strong>Pickup:</strong>{" "}
                {sub.selectedMarket
                  ? `${formatDay(sub.selectedMarket.day)} · ${sub.selectedMarket.name} · ${sub.selectedMarket.hours || ""} · ${sub.selectedMarket.whereAt || ""}`
                  : "No market selected"}
              </div>
            ) : (
              <>
                <div>
                  <strong>Address:</strong>{" "}
                  {sub.address || "Not provided"}{" "}
                  {sub.deliveryZip || ""}
                </div>
                <div>
                  <strong>Location:</strong>{" "}
                  {sub.deliveryLocationType || "Not provided"}
                  {sub.buildingDetails
                    ? ` · ${sub.buildingDetails}`
                    : ""}
                </div>
                <div>
                  <strong>Gate / entry:</strong>{" "}
                  {sub.gateCode || "None"}
                </div>
                <div>
                  <strong>Drop-off notes:</strong>{" "}
                  {sub.deliveryNotes || "None"}
                </div>
                <div>
                  <strong>Temporary notes:</strong>{" "}
                  {sub.temporaryDeliveryNotes || "None"}
                </div>
                <div>
                  <strong>Delivery problem contact:</strong>{" "}
                  {sub.preferredContactMethod || "Not provided"}
                </div>
                <div>
                  <strong>Preferred timing:</strong>{" "}
                  {sub.preferredDeliveryTiming || "No preference"}
                </div>
                {sub.isGift && (
                  <div>
                    <strong>Gift:</strong> {sub.recipientName}
                    {sub.giftMessage
                      ? ` · “${sub.giftMessage}”`
                      : ""}
                  </div>
                )}
              </>
            )}

            <div>
              <strong>Boxes counted:</strong> {sub.boxesSent}
              {sub.boxesSent > 0 &&
              sub.boxesSent % (sub.bonusEvery || 3) === 0
                ? ` · ${sub.bonusEvery || 3}th-box bonus milestone`
                : ""}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 16,
            }}
          >
            <button
              type="button"
              style={primaryButton}
              onClick={() => setEditing(sub)}
            >
              Edit Fulfillment
            </button>

            {sub.method === "market" &&
              sub.billingMode === "market_manual" && (
                <button
                  type="button"
                  style={secondaryButton}
                  onClick={() => markPickup(sub)}
                >
                  Mark Market Box Picked Up / Paid
                </button>
              )}

            {sub.needsCardSetup && (
              <button
                type="button"
                style={secondaryButton}
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    sub.customerSettingsUrl
                  );
                  setNotice(
                    `Secure setup link copied for ${sub.memberName}.`
                  );
                }}
              >
                Copy Secure Card Setup Link
              </button>
            )}
          </div>
        </div>
      ))}

      {!filtered.length && (
        <div style={cardStyle}>No Honey Club members match that search.</div>
      )}
    </div>
  );
}

export default function SubscriptionFulfillmentPortal() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const admin = path === "/admin/honey-club";
  const match = path.match(
    /^\/club\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/fulfillment$/i
  );
  const token = match?.[1] || null;

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <Header admin={admin} />

        {admin ? (
          <AdminPortal />
        ) : token ? (
          <CustomerPortal token={token} />
        ) : (
          <div style={cardStyle}>
            This Honey Club fulfillment link is invalid.
          </div>
        )}
      </div>
    </div>
  );
}
