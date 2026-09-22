import { useState } from "react";
import * as api from "../lib/api";

const colors = {
  gold: "#F7C41C",
  amber: "#E69B00",
  dark: "#4A3313",
  brown: "#7B5821",
};

const eventTypes = [
  "Wedding",
  "Bridal / Baby Shower",
  "Corporate / Client Gifts",
  "Party / Celebration",
  "Fundraiser / Community Event",
  "Other",
];

const lidColors = [
  ["Red", "#E22D2D"],
  ["Orange", "#FF6A00"],
  ["Golden Yellow", "#FFC534"],
  ["Yellow", "#FFE01B"],
  ["Lime Green", "#69D21B"],
  ["Green", "#15864A"],
  ["Light Blue", "#9EDBF5"],
  ["Blue", "#283BB2"],
  ["Purple", "#6932A5"],
  ["Pink", "#F4A9CA"],
  ["Brown", "#7B4A2D"],
  ["Black", "#151515"],
  ["White", "#F7F7F7"],
  ["Cream", "#EBCF79"],
];

const specialEventReturnFromUrl = () => {
  try {
    return (
      new URLSearchParams(window.location.search).get("special-event") ===
      "submitted"
    );
  } catch {
    return false;
  }
};

const dollars = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const inputStyle = {
  width: "100%",
  minHeight: 46,
  padding: "10px 12px",
  border: "1.5px solid #CDB58D",
  borderRadius: 9,
  background: "#fff",
  font: "inherit",
};

const labelStyle = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 800,
  color: colors.dark,
};

function Modal({ title, children, onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        padding: 18,
        background: "rgba(44,31,18,.55)",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="card"
        style={{
          width: "min(560px,100%)",
          maxHeight: "88vh",
          overflowY: "auto",
          padding: 24,
          border: `2px solid ${colors.gold}`,
          boxShadow: "0 22px 60px rgba(40,25,10,.25)",
        }}
      >
        <div
          className="display"
          style={{ fontSize: 29, color: colors.dark }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  required = false,
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
        {required ? " *" : ""}
      </label>
      <input
        style={inputStyle}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
      />
    </div>
  );
}

export default function SpecialEventOrderPage({
  Header,
  onBack,
  styles,
  flavorOptions = [],
  deliveryZones = [],
}) {
  const [eventType, setEventType] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    needBy: "",
    budget: "",
    details: "",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryZip: "",
    deliveryDate: "",
  });

  const [bearQty, setBearQty] = useState(0);
  const [hexQty, setHexQty] = useState(0);
  const [lidColor, setLidColor] = useState("");
  const [dipperChoice, setDipperChoice] = useState("no");
  const [dipperQty, setDipperQty] = useState(0);
  const [selectedFlavors, setSelectedFlavors] = useState([]);
  const [fulfillmentMethod, setFulfillmentMethod] = useState("pickup");

  const [topCircle, setTopCircle] = useState(false);
  const [frontLabel, setFrontLabel] = useState(false);
  const [labelText, setLabelText] = useState("");
  const [labelColor, setLabelColor] = useState("");
  const [designFile, setDesignFile] = useState(null);

  const [showDesignerNotice, setShowDesignerNotice] =
    useState(false);
  const [showBudgetPrompt, setShowBudgetPrompt] =
    useState(false);
  const [deadlinePopup, setDeadlinePopup] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(() =>
    specialEventReturnFromUrl()
  );
  const [doneMode, setDoneMode] = useState(() =>
    specialEventReturnFromUrl() ? "checkout" : ""
  );

  const [website, setWebsite] = useState("");
  const [formStartedAt] = useState(() => Date.now());

  const customLabels = topCircle || frontLabel;
  const safeBearQty = Math.max(
    0,
    Number.parseInt(bearQty, 10) || 0
  );
  const safeHexQty = Math.max(
    0,
    Number.parseInt(hexQty, 10) || 0
  );
  const safeDipperQty =
    dipperChoice === "yes"
      ? Math.max(0, Number.parseInt(dipperQty, 10) || 0)
      : 0;

  const bearUnitCents = safeBearQty >= 50 ? 300 : 400;
  const hexUnitCents = safeHexQty >= 50 ? 325 : 475;

  const bearCents = safeBearQty * bearUnitCents;
  const hexCents = safeHexQty * hexUnitCents;
  const dipperCents = safeDipperQty * 100;
  const labelCents =
    (topCircle ? 1000 : 0) + (frontLabel ? 1500 : 0);

  const subtotalCents =
    bearCents + hexCents + dipperCents + labelCents;

  const deliveryZip = form.deliveryZip.trim();
  const deliveryZone =
    fulfillmentMethod === "delivery"
      ? deliveryZones.find(
          (zone) =>
            Array.isArray(zone?.zips) &&
            zone.zips.includes(deliveryZip)
        ) || null
      : null;

  const deliveryOutOfArea =
    fulfillmentMethod === "delivery" &&
    deliveryZip.length === 5 &&
    !deliveryZone;

  const deliveryBelowMinimum =
    fulfillmentMethod === "delivery" &&
    deliveryZone &&
    subtotalCents <
      Math.round(Number(deliveryZone.minimum || 0) * 100);

  const deliveryFeeCents =
    fulfillmentMethod === "delivery" &&
    deliveryZone &&
    !deliveryBelowMinimum
      ? subtotalCents >=
        Math.round(Number(deliveryZone.freeOver || 0) * 100)
        ? 0
        : Math.round(Number(deliveryZone.fee || 0) * 100)
      : 0;

  const preSquareCents = subtotalCents + deliveryFeeCents;
  const checkoutCents = Math.round(preSquareCents * 0.04);
  const totalCents = preSquareCents + checkoutCents;
  const budgetCents = Math.round(
    Math.max(0, Number(form.budget) || 0) * 100
  );
  const overBudget =
    budgetCents > 0 && totalCents > budgetCents;

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErr("");
  };

  const daysUntilNeedBy = () => {
    if (!form.needBy) return null;
    const target = new Date(`${form.needBy}T12:00:00`);
    if (Number.isNaN(target.getTime())) return null;

    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12
    );

    return Math.floor(
      (target.getTime() - today.getTime()) / 86400000
    );
  };

  const toggleCustom = (kind, checked) => {
    if (kind === "top") setTopCircle(checked);
    if (kind === "front") setFrontLabel(checked);

    if (checked) setShowDesignerNotice(true);
    setErr("");
  };

  const chooseDesignFile = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) {
      setDesignFile(null);
      return;
    }

    const allowed = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);

    if (!allowed.has(String(file.type || "").toLowerCase())) {
      setErr(
        "Design uploads must be JPG, PNG, WebP, or PDF files."
      );
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setErr("Design uploads must be 4 MB or smaller.");
      return;
    }

    setDesignFile(file);
    setErr("");
  };

  const validate = () => {
    if (!eventType) return "Choose your event type.";
    if (!form.name.trim()) return "Enter your name.";

    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      return "Enter a complete email address.";
    }

    if (!form.needBy) {
      return "Choose when you need the order.";
    }

    if (!budgetCents) {
      return "Enter your target budget.";
    }

    if (safeBearQty + safeHexQty < 1) {
      return "Add at least one 2 oz bear or glass hexagon.";
    }

    if (fulfillmentMethod === "delivery") {
      if (!form.deliveryAddress.trim()) {
        return "Enter the delivery street address.";
      }

      if (!form.deliveryCity.trim()) {
        return "Enter the delivery city.";
      }

      if (!/^\d{5}$/.test(deliveryZip)) {
        return "Enter a 5-digit delivery ZIP code.";
      }

      if (!deliveryZone) {
        return "That ZIP is outside the current local delivery area. Choose Coleman pickup or contact NectarFusions.";
      }

      if (deliveryBelowMinimum) {
        return `This delivery zone requires at least ${dollars(
          Math.round(Number(deliveryZone.minimum || 0) * 100)
        )} in products before the delivery fee.`;
      }

      if (!form.deliveryDate) {
        return "Choose your preferred delivery date.";
      }

      const preferredDelivery = new Date(
        `${form.deliveryDate}T12:00:00`
      );
      const needByDate = new Date(`${form.needBy}T12:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (
        Number.isNaN(preferredDelivery.getTime()) ||
        preferredDelivery < today
      ) {
        return "Choose a preferred delivery date that is today or later.";
      }

      if (preferredDelivery > needByDate) {
        return "The preferred delivery date cannot be after your need-by date.";
      }
    }

    if (safeBearQty > 0 && !lidColor) {
      return "Choose a lid color for the 2 oz bears.";
    }

    if (dipperChoice === "yes" && safeDipperQty < 1) {
      return "Enter how many honey dippers you want.";
    }

    const days = daysUntilNeedBy();

    if (days === null || days < 0) {
      return "Choose a need-by date that is today or later.";
    }

    if (customLabels && days < 7) {
      const message =
        "Custom label orders must be placed at least 7 days in advance so there is enough time for design, proofing, and printing.";
      setDeadlinePopup(message);
      return message;
    }

    if (customLabels && !labelText.trim()) {
      return "Enter what you want the custom label to say.";
    }

    if (customLabels && !labelColor.trim()) {
      return "Enter the color you want for the custom label.";
    }

    return "";
  };

  const requestPayload = (
    mode,
    overBudgetApproved = false
  ) => ({
    mode,
    eventType,
    name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    needBy: form.needBy,
    budget: Number(form.budget),
    details: form.details.trim(),
    fulfillmentMethod,
    deliveryAddress:
      fulfillmentMethod === "delivery"
        ? form.deliveryAddress.trim()
        : "",
    deliveryCity:
      fulfillmentMethod === "delivery"
        ? form.deliveryCity.trim()
        : "",
    deliveryZip:
      fulfillmentMethod === "delivery"
        ? deliveryZip
        : "",
    deliveryDate:
      fulfillmentMethod === "delivery"
        ? form.deliveryDate
        : "",
    flavors: selectedFlavors,
    bearQty: safeBearQty,
    hexQty: safeHexQty,
    lidColor,
    dipperQty: safeDipperQty,
    topCircle,
    frontLabel,
    labelText: customLabels ? labelText.trim() : "",
    labelColor: customLabels ? labelColor.trim() : "",
    overBudgetApproved,
    website,
    formStartedAt,
  });

  const submit = async (
    mode = "checkout",
    overBudgetApproved = false
  ) => {
    if (busy) return;

    const validationError = validate();

    if (validationError) {
      setErr(validationError);
      return;
    }

    if (
      mode === "checkout" &&
      overBudget &&
      !overBudgetApproved
    ) {
      setShowBudgetPrompt(true);
      return;
    }

    setBusy(true);
    setErr("");

    try {
      const result = await api.submitSpecialEventOrder(
        requestPayload(mode, overBudgetApproved),
        customLabels ? designFile : null
      );

      if (mode === "budget_request") {
        setShowBudgetPrompt(false);
        setDoneMode("budget");
        setDone(true);
        return;
      }

      if (!result.paymentUrl) {
        throw new Error(
          "Square checkout was not returned. Your request was saved and NectarFusions can follow up with you."
        );
      }

      window.location.assign(result.paymentUrl);
    } catch (error) {
      if (error.requiresBudgetApproval) {
        setShowBudgetPrompt(true);
      } else {
        setErr(
          error.message ||
            "Your special event request could not be submitted."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const backToShop = () => {
    if (specialEventReturnFromUrl()) {
      window.history.replaceState({}, "", "/");
    }
    onBack();
  };

  if (done) {
    return (
      <div className="nf">
        <style>{styles}</style>

        <Header
          eyebrow="Special events"
          title="REQUEST RECEIVED"
          right={
            <button
              className="btn ghost nf-back-to-shop"
              onClick={backToShop}
            >
              Back to shop
            </button>
          }
        />

        <div
          className="nf-wrap"
          style={{ paddingTop: 30, maxWidth: 760 }}
        >
          <div
            className="card"
            style={{
              padding: 28,
              textAlign: "center",
              borderColor: colors.gold,
              background: "#FFFBF0",
            }}
          >
            <div
              className="display"
              style={{
                fontSize: 34,
                color: colors.dark,
                marginTop: 4,
              }}
            >
              YOUR REQUEST HAS BEEN SUBMITTED
            </div>

            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.7,
                color: colors.brown,
                margin: "10px 0 0",
              }}
            >
              {doneMode === "budget"
                ? "We received your order details and budget request. A NectarFusions team member will review it and contact you to see what we can adjust for your budget and timeline."
                : "We received your special event order details. A NectarFusions team member will contact you about production, timing, and any custom design proof."}
            </p>
          </div>

          <button
            className="btn ghost"
            style={{
              width: "100%",
              padding: 14,
              marginTop: 12,
            }}
            onClick={backToShop}
          >
            Back to the shop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="nf">
      <style>{styles}</style>

      <Header
        eyebrow="Weddings · celebrations · events"
        title="SPECIAL EVENT HONEY"
        right={
          <button
            className="btn ghost nf-back-to-shop"
            onClick={backToShop}
          >
            Back to shop
          </button>
        }
      />

      <div
        className="nf-wrap"
        style={{ paddingTop: 26, maxWidth: 900 }}
      >
        <section
          className="card"
          style={{
            padding: 22,
            marginBottom: 16,
            border: `2px solid ${colors.gold}`,
            background:
              "linear-gradient(135deg,#FFFDF5 0%,#FFF4CC 100%)",
          }}
        >
          <div className="nf-modern-kicker">
            Build your special event order
          </div>

          <div
            className="display"
            style={{
              fontSize: 31,
              color: colors.dark,
              marginTop: 5,
            }}
          >
            START WITH YOUR BUDGET + DATE
          </div>

          <p
            style={{
              margin: "8px 0 16px",
              fontSize: 14.5,
              lineHeight: 1.65,
              color: colors.brown,
            }}
          >
            Build your favors, see the total change as you go,
            and check out securely through Square. If the order
            moves above your target budget, you can still approve
            it or ask us to help adjust it.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(220px,1fr))",
              gap: 10,
            }}
          >
            <TextInput
              label="Target budget"
              type="number"
              required
              placeholder="$ Budget"
              value={form.budget}
              onChange={(event) =>
                updateForm("budget", event.target.value)
              }
            />

            <TextInput
              label="Need this order by"
              type="date"
              required
              value={form.needBy}
              onChange={(event) =>
                updateForm("needBy", event.target.value)
              }
            />
          </div>

          {budgetCents > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 9,
                background: overBudget
                  ? "#FFF0F0"
                  : "#F0F8EE",
                color: overBudget ? "#8C2525" : "#31532B",
                fontSize: 13,
                fontWeight: 750,
              }}
            >
              Target budget: {dollars(budgetCents)} · Current
              total: {dollars(totalCents)}
              {overBudget ? " · Currently above budget" : ""}
            </div>
          )}
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div
            className="eyebrow"
            style={{ marginBottom: 8 }}
          >
            Type of event
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(150px,1fr))",
              gap: 8,
            }}
          >
            {eventTypes.map((type) => (
              <button
                key={type}
                type="button"
                className={`btn ${
                  eventType === type ? "on" : ""
                }`}
                style={{ padding: "11px 9px" }}
                onClick={() => {
                  setEventType(type);
                  setErr("");
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              marginTop: 16,
            }}
          >
            <TextInput
              label="Name"
              required
              value={form.name}
              onChange={(event) =>
                updateForm("name", event.target.value)
              }
            />
            <TextInput
              label="Email"
              type="email"
              required
              value={form.email}
              onChange={(event) =>
                updateForm("email", event.target.value)
              }
            />
            <TextInput
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(event) =>
                updateForm("phone", event.target.value)
              }
            />

          </div>
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div className="nf-modern-kicker">
            Fulfillment
          </div>

          <div
            className="display"
            style={{
              fontSize: 27,
              color: colors.dark,
              marginTop: 4,
            }}
          >
            PICKUP OR DELIVERY
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(180px,1fr))",
              gap: 8,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              className={`btn ${
                fulfillmentMethod === "pickup" ? "on" : ""
              }`}
              onClick={() => {
                setFulfillmentMethod("pickup");
                setErr("");
              }}
              style={{
                minHeight: 58,
                textAlign: "left",
                padding: "11px 13px",
              }}
            >
              <strong>Pickup</strong>
              <div
                style={{
                  fontSize: 12,
                  marginTop: 3,
                  opacity: 0.78,
                }}
              >
                Coleman · No fee
              </div>
            </button>

            <button
              type="button"
              className={`btn ${
                fulfillmentMethod === "delivery" ? "on" : ""
              }`}
              onClick={() => {
                setFulfillmentMethod("delivery");
                setErr("");
              }}
              style={{
                minHeight: 58,
                textAlign: "left",
                padding: "11px 13px",
              }}
            >
              <strong>Local Delivery</strong>
              <div
                style={{
                  fontSize: 12,
                  marginTop: 3,
                  opacity: 0.78,
                }}
              >
                Fee based on delivery ZIP
              </div>
            </button>
          </div>

          {fulfillmentMethod === "pickup" ? (
            <div
              className="card"
              style={{
                padding: 14,
                marginTop: 12,
                background: "#FFFBF0",
                borderColor: "#E2B62F",
                fontSize: 13.5,
                lineHeight: 1.6,
              }}
            >
              <strong>Free Coleman pickup</strong>
              <div style={{ marginTop: 3 }}>
                122 E Railway St, Coleman, MI 48618
              </div>
              <div style={{ marginTop: 5 }}>
                No pickup fee. NectarFusions will contact you to
                schedule your pickup date.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit,minmax(220px,1fr))",
                  gap: 10,
                }}
              >
                <TextInput
                  label="Delivery street address"
                  required
                  value={form.deliveryAddress}
                  onChange={(event) =>
                    updateForm(
                      "deliveryAddress",
                      event.target.value
                    )
                  }
                />

                <TextInput
                  label="City"
                  required
                  value={form.deliveryCity}
                  onChange={(event) =>
                    updateForm("deliveryCity", event.target.value)
                  }
                />

                <TextInput
                  label="ZIP code"
                  required
                  inputMode="numeric"
                  maxLength={5}
                  value={form.deliveryZip}
                  onChange={(event) =>
                    updateForm(
                      "deliveryZip",
                      event.target.value.replace(/\D/g, "")
                    )
                  }
                />

                <TextInput
                  label="Preferred delivery date"
                  type="date"
                  required
                  value={form.deliveryDate}
                  onChange={(event) =>
                    updateForm(
                      "deliveryDate",
                      event.target.value
                    )
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: colors.brown,
                }}
              >
                Choose your preferred delivery date. We’ll confirm
                the final delivery timing with you.
              </div>

              {deliveryOutOfArea && (
                <div className="err" style={{ marginTop: 10 }}>
                  We don’t currently deliver to {deliveryZip}.
                  Choose free Coleman pickup or contact us for help.
                </div>
              )}

              {deliveryZone && (
                <div
                  className="card"
                  style={{
                    padding: 14,
                    marginTop: 10,
                    background: "#FFFBF0",
                  }}
                >
                  <div className="eyebrow">
                    {deliveryZone.name || "Local Delivery"}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: colors.brown,
                    }}
                  >
                    {dollars(
                      Math.round(
                        Number(deliveryZone.fee || 0) * 100
                      )
                    )}{" "}
                    delivery · Free over{" "}
                    {dollars(
                      Math.round(
                        Number(deliveryZone.freeOver || 0) * 100
                      )
                    )}{" "}
                    ·{" "}
                    {dollars(
                      Math.round(
                        Number(deliveryZone.minimum || 0) * 100
                      )
                    )}{" "}
                    minimum
                  </div>

                  {deliveryBelowMinimum ? (
                    <div
                      className="err"
                      style={{ marginTop: 8 }}
                    >
                      Add{" "}
                      {dollars(
                        Math.max(
                          0,
                          Math.round(
                            Number(
                              deliveryZone.minimum || 0
                            ) * 100
                          ) - subtotalCents
                        )
                      )}{" "}
                      more in products to qualify for delivery.
                    </div>
                  ) : (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 13,
                        fontWeight: 750,
                        color: colors.dark,
                      }}
                    >
                      Delivery fee for this order:{" "}
                      {dollars(deliveryFeeCents)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div className="nf-modern-kicker">
            Choose your favors
          </div>

          <div
            className="display"
            style={{
              fontSize: 28,
              color: colors.dark,
              marginTop: 4,
            }}
          >
            2 OZ EVENT HONEY
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(280px,1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            <article
              style={{
                border: "1px solid #E2D6C4",
                borderRadius: 14,
                padding: 15,
                background: "#fff",
              }}
            >
              <img
                src="/images/partner-gift-bear-2oz.jpg"
                alt="2 oz plastic honey bear"
                style={{
                  width: "100%",
                  height: 210,
                  objectFit: "contain",
                  borderRadius: 10,
                  background: "#FFFDF9",
                }}
              />

              <div
                style={{
                  fontWeight: 900,
                  color: colors.dark,
                  marginTop: 12,
                }}
              >
                2 oz Plastic Bears
              </div>

              <div
                style={{
                  fontSize: 12.5,
                  color: colors.brown,
                  marginTop: 4,
                  lineHeight: 1.55,
                }}
              >
                $4.00 each · 50+ bears are $3.00 each
              </div>

              <label style={{ ...labelStyle, marginTop: 12 }}>
                Quantity
              </label>

              <input
                style={inputStyle}
                type="number"
                min="0"
                max="999"
                step="1"
                value={bearQty}
                onChange={(event) => {
                  setBearQty(event.target.value);
                  setErr("");
                }}
              />

              {safeBearQty > 0 && (
                <>
                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    Lid color *
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(92px,1fr))",
                      gap: 7,
                      marginTop: 8,
                    }}
                  >
                    {lidColors.map(([name, color]) => (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={lidColor === name}
                        onClick={() => {
                          setLidColor(name);
                          setErr("");
                        }}
                        style={{
                          minHeight: 58,
                          padding: "8px 6px",
                          border:
                            lidColor === name
                              ? `2px solid ${colors.amber}`
                              : "1px solid #D8CBBB",
                          borderRadius: 9,
                          background: "#fff",
                          font: "inherit",
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: colors.dark,
                          cursor: "pointer",
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: "block",
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            margin: "0 auto 5px",
                            background: color,
                            border:
                              name === "White"
                                ? "1px solid #CFCFCF"
                                : "1px solid rgba(0,0,0,.12)",
                          }}
                        />
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div
                style={{
                  marginTop: 12,
                  fontWeight: 900,
                  color: colors.dark,
                }}
              >
                {dollars(bearCents)}
              </div>
            </article>

            <article
              style={{
                border: "1px solid #E2D6C4",
                borderRadius: 14,
                padding: 15,
                background: "#fff",
              }}
            >
              <img
                src="/images/partner-gift-hexagonal.jpg"
                alt="2 oz glass hexagonal honey container"
                style={{
                  width: "100%",
                  height: 210,
                  objectFit: "contain",
                  borderRadius: 10,
                  background: "#FFFDF9",
                }}
              />

              <div
                style={{
                  fontWeight: 900,
                  color: colors.dark,
                  marginTop: 12,
                }}
              >
                2 oz Glass Hexagons
              </div>

              <div
                style={{
                  fontSize: 12.5,
                  color: colors.brown,
                  marginTop: 4,
                  lineHeight: 1.55,
                }}
              >
                $4.75 each · 50+ hexagons are $3.25 each
              </div>

              <div
                style={{
                  fontSize: 11.5,
                  color: colors.brown,
                  marginTop: 5,
                  lineHeight: 1.45,
                  fontStyle: "italic",
                  opacity: 0.82,
                }}
              >
                Honey dipper and bee shown in photo are sold separately.
              </div>

              <label style={{ ...labelStyle, marginTop: 12 }}>
                Quantity
              </label>

              <input
                style={inputStyle}
                type="number"
                min="0"
                max="999"
                step="1"
                value={hexQty}
                onChange={(event) => {
                  setHexQty(event.target.value);
                  setErr("");
                }}
              />

              <div
                style={{
                  marginTop: 12,
                  fontWeight: 900,
                  color: colors.dark,
                }}
              >
                {dollars(hexCents)}
              </div>
            </article>
          </div>
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div className="nf-modern-kicker">
            Optional finishing touch
          </div>

          <div
            className="display"
            style={{
              fontSize: 27,
              color: colors.dark,
              marginTop: 4,
            }}
          >
            SMALL WOOD HONEY DIPPERS
          </div>

          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: colors.brown,
            }}
          >
            $1.00 each
          </p>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className={`btn ${
                dipperChoice === "no" ? "on" : ""
              }`}
              onClick={() => {
                setDipperChoice("no");
                setDipperQty(0);
                setErr("");
              }}
            >
              No dippers
            </button>

            <button
              type="button"
              className={`btn ${
                dipperChoice === "yes" ? "on" : ""
              }`}
              onClick={() => {
                setDipperChoice("yes");
                if (!safeDipperQty) setDipperQty(1);
                setErr("");
              }}
            >
              Add dippers
            </button>
          </div>

          {dipperChoice === "yes" && (
            <div style={{ marginTop: 12, maxWidth: 240 }}>
              <label style={labelStyle}>
                Number of dippers
              </label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                max="999"
                step="1"
                value={dipperQty}
                onChange={(event) => {
                  setDipperQty(event.target.value);
                  setErr("");
                }}
              />
            </div>
          )}
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div className="nf-modern-kicker">
            Make it yours
          </div>

          <div
            className="display"
            style={{
              fontSize: 27,
              color: colors.dark,
              marginTop: 4,
            }}
          >
            CUSTOM DESIGN LABELS
          </div>

          <div
            style={{
              display: "grid",
              gap: 9,
              marginTop: 14,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                border: "1px solid #E2D6C4",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={topCircle}
                onChange={(event) =>
                  toggleCustom("top", event.target.checked)
                }
              />
              <span>
                <strong>Top circle design</strong> · +$10.00
                flat
              </span>
            </label>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 12,
                border: "1px solid #E2D6C4",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={frontLabel}
                onChange={(event) =>
                  toggleCustom("front", event.target.checked)
                }
              />
              <span>
                <strong>Front label design</strong> · +$15.00
                flat
              </span>
            </label>
          </div>

          {customLabels && (
            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 14,
                padding: 14,
                border: "1px solid #D8CBE6",
                borderRadius: 12,
                background: "#FCF9FF",
              }}
            >
              <div
                style={{
                  padding: "11px 12px",
                  borderLeft: "4px solid #8C6CB4",
                  borderRadius: 8,
                  background: "#F8F2FC",
                  color: "#5E437A",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                You’ll receive a visual proof and work with a
                designer who will reach out to you directly.
                Custom label orders require at least 7 days for
                design, proofing, and print time.
              </div>

              <TextInput
                label="What should the label say?"
                required
                value={labelText}
                onChange={(event) => {
                  setLabelText(event.target.value);
                  setErr("");
                }}
              />

              <TextInput
                label="What color(s) do you want for the label?"
                required
                value={labelColor}
                onChange={(event) => {
                  setLabelColor(event.target.value);
                  setErr("");
                }}
              />

              <div>
                <label style={labelStyle}>
                  Upload a design idea or inspiration
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={chooseDesignFile}
                />
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11.5,
                    color: colors.brown,
                  }}
                >
                  Optional · JPG, PNG, WebP, or PDF · up to 4 MB
                </div>

                {designFile && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "9px 10px",
                      border: "1px solid #E4D9EF",
                      borderRadius: 8,
                      background: "#fff",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {designFile.name}
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setDesignFile(null)}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section
          className="card"
          style={{ padding: 20, marginBottom: 16 }}
        >
          <div className="nf-modern-kicker">
            Flavor preferences
          </div>

          <div
            className="display"
            style={{
              fontSize: 27,
              color: colors.dark,
              marginTop: 4,
            }}
          >
            CHOOSE FROM OUR TOP 6
          </div>

          <p
            style={{
              margin: "7px 0 12px",
              fontSize: 13,
              lineHeight: 1.6,
              color: colors.brown,
            }}
          >
            Select any of the available flavors you would like us
            to consider for your event order.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(145px,1fr))",
              gap: 8,
              marginBottom: 18,
            }}
          >
            {flavorOptions.slice(0, 6).map((flavor) => {
              const selected = selectedFlavors.includes(
                flavor.name
              );

              return (
                <button
                  key={flavor.id || flavor.name}
                  type="button"
                  className={`btn ${selected ? "on" : ""}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setSelectedFlavors((current) =>
                      current.includes(flavor.name)
                        ? current.filter(
                            (name) => name !== flavor.name
                          )
                        : [...current, flavor.name]
                    );
                    setErr("");
                  }}
                  style={{
                    minHeight: 46,
                    padding: "10px 9px",
                  }}
                >
                  {selected ? "✓ " : ""}
                  {flavor.name}
                </button>
              );
            })}
          </div>

          <label style={labelStyle}>
            Packaging ideas or other details
          </label>

          <textarea
            rows={5}
            value={form.details}
            onChange={(event) =>
              updateForm("details", event.target.value)
            }
            placeholder="Tell us about event colors, presentation, quantity splits, packaging, or anything else."
            style={{
              ...inputStyle,
              minHeight: 120,
              resize: "vertical",
            }}
          />

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
                onChange={(event) =>
                  setWebsite(event.target.value)
                }
              />
            </label>
          </div>
        </section>

        <section
          className="card"
          style={{
            padding: 20,
            marginBottom: 16,
            border: "2px solid #E2B62F",
            background: "#FFFDF7",
          }}
        >
          <div
            className="display"
            style={{ fontSize: 27, color: colors.dark }}
          >
            ORDER TOTAL
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              marginTop: 14,
              fontSize: 13.5,
            }}
          >
            {safeBearQty > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>
                  {safeBearQty} × 2 oz Plastic Bear @{" "}
                  {dollars(bearUnitCents)}
                </span>
                <strong>{dollars(bearCents)}</strong>
              </div>
            )}

            {safeHexQty > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>
                  {safeHexQty} × 2 oz Glass Hexagon @{" "}
                  {dollars(hexUnitCents)}
                </span>
                <strong>{dollars(hexCents)}</strong>
              </div>
            )}

            {safeDipperQty > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>
                  {safeDipperQty} × Small Wood Honey Dipper
                </span>
                <strong>{dollars(dipperCents)}</strong>
              </div>
            )}

            {topCircle && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>Top circle custom design</span>
                <strong>$10.00</strong>
              </div>
            )}

            {frontLabel && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 14,
                }}
              >
                <span>Front label custom design</span>
                <strong>$15.00</strong>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                paddingTop: 10,
                borderTop: "1px solid #E4D6C5",
              }}
            >
              <span>Subtotal</span>
              <strong>{dollars(subtotalCents)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <span>
                {fulfillmentMethod === "delivery"
                  ? "Local delivery"
                  : "Coleman pickup"}
              </span>
              <strong>
                {fulfillmentMethod === "delivery"
                  ? dollars(deliveryFeeCents)
                  : "FREE"}
              </strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <span>Square checkout fee (4%)</span>
              <strong>{dollars(checkoutCents)}</strong>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 14,
                paddingTop: 11,
                borderTop: "2px solid #E2B62F",
                fontSize: 18,
                color: colors.dark,
              }}
            >
              <strong>Total</strong>
              <strong>{dollars(totalCents)}</strong>
            </div>
          </div>

          {budgetCents > 0 && overBudget && (
            <div
              style={{
                marginTop: 13,
                padding: "11px 12px",
                borderRadius: 9,
                background: "#FFF0F0",
                color: "#8C2525",
                fontSize: 13,
                fontWeight: 750,
                lineHeight: 1.5,
              }}
            >
              This order is {dollars(totalCents - budgetCents)}{" "}
              above your stated budget. We’ll ask you to approve
              that before opening Square checkout.
            </div>
          )}

          {err && (
            <div className="err" style={{ marginTop: 12 }}>
              {err}
            </div>
          )}

          <button
            type="button"
            className="btn solid"
            style={{
              width: "100%",
              padding: 14,
              marginTop: 14,
            }}
            disabled={busy || subtotalCents <= 0}
            onClick={() => submit("checkout", false)}
          >
            {busy
              ? "Preparing…"
              : "Checkout"}
          </button>

          <p
            style={{
              margin: "10px 0 0",
              textAlign: "center",
              color: colors.brown,
              fontSize: 11.5,
              lineHeight: 1.55,
            }}
          >
            Prices are recalculated and verified on the server
            before the Square checkout link is created.
          </p>
        </section>

        <div style={{ height: 34 }} />
      </div>

      {showDesignerNotice && (
        <Modal
          title="CUSTOM LABEL PROOF"
          onClose={() => setShowDesignerNotice(false)}
        >
          <p
            style={{
              lineHeight: 1.7,
              color: colors.brown,
            }}
          >
            You’ll receive a visual proof and work with a designer
            who will reach out to you directly before your custom
            label is finalized.
          </p>
          <p
            style={{
              lineHeight: 1.7,
              color: colors.brown,
            }}
          >
            Please allow at least one full week for design,
            proofing, and print time.
          </p>
          <button
            type="button"
            className="btn solid"
            style={{ width: "100%", padding: 12 }}
            onClick={() => setShowDesignerNotice(false)}
          >
            Got it
          </button>
        </Modal>
      )}

      {deadlinePopup && (
        <Modal
          title="MORE PRINT TIME IS NEEDED"
          onClose={() => setDeadlinePopup("")}
        >
          <p
            style={{
              lineHeight: 1.7,
              color: colors.brown,
            }}
          >
            {deadlinePopup}
          </p>
          <button
            type="button"
            className="btn solid"
            style={{ width: "100%", padding: 12 }}
            onClick={() => setDeadlinePopup("")}
          >
            Update my date
          </button>
        </Modal>
      )}

      {showBudgetPrompt && (
        <Modal
          title="THIS ORDER IS ABOVE YOUR BUDGET"
          onClose={() => {
            if (!busy) setShowBudgetPrompt(false);
          }}
        >
          <p
            style={{
              lineHeight: 1.7,
              color: colors.brown,
            }}
          >
            Your target budget is{" "}
            <strong>{dollars(budgetCents)}</strong> and your
            current total is{" "}
            <strong>{dollars(totalCents)}</strong>.
          </p>

          <p
            style={{
              lineHeight: 1.7,
              color: colors.brown,
            }}
          >
            You can approve the higher total and continue to
            Square, or send the full request to NectarFusions so
            we can see whether we can adjust the order to fit your
            budget and timeline.
          </p>

          <div
            style={{
              display: "grid",
              gap: 9,
              marginTop: 14,
            }}
          >
            <button
              type="button"
              className="btn solid"
              style={{ width: "100%", padding: 12 }}
              disabled={busy}
              onClick={() => {
                setShowBudgetPrompt(false);
                submit("checkout", true);
              }}
            >
              {busy
                ? "Preparing…"
                : `Approve ${dollars(totalCents)} + Continue to Square`}
            </button>

            <button
              type="button"
              className="btn"
              style={{ width: "100%", padding: 12 }}
              disabled={busy}
              onClick={() => submit("budget_request", false)}
            >
              No — Ask NectarFusions to Help Fit My Budget
            </button>

            <button
              type="button"
              className="btn ghost"
              style={{ width: "100%", padding: 10 }}
              disabled={busy}
              onClick={() => setShowBudgetPrompt(false)}
            >
              Go back and edit my order
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
