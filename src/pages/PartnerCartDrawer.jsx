import { useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import {
  clearPartnerStoreCart,
  getPartnerStoreCart,
  getPartnerStoreFulfillment,
  removePartnerStoreItem,
  setPartnerStoreFulfillment,
} from "../lib/partnerStoreCart";

const PICKUP_ADDRESS = "122 E Railway St, Coleman, MI 48618";

const DAYS = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
];

const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(cents || 0) / 100);

const groupLabel = {
  retail: "Retailer Replenishment",
  bulk: "Wholesale & Bulk",
  gift: "Gift Sets",
  gift_addon: "Gift Add-ons",
  custom_label: "Custom Labels",
};

const displayName = (item) => {
  if (item.category === "retail") {
    return `${item.flavorName} · ${item.sizeLabel} · ${
      item.texture === "spun" ? "Spun" : "Regular"
    }`;
  }

  if (item.category === "bulk") {
    return item.honeyType === "natural"
      ? `${item.sizeLabel} · Natural Raw Honey`
      : `${item.sizeLabel} · ${item.flavorName} Infused`;
  }

  if (item.category === "gift") {
    return `${item.containerLabel} · ${item.flavorName}`;
  }

  return item.name || "Custom Labels";
};

const CSS = `
.nf-partner-cart-backdrop{
  position:fixed;inset:0;z-index:9998;background:rgba(9,24,33,.48);
  backdrop-filter:blur(3px)
}
.nf-partner-cart-drawer{
  position:fixed;top:0;right:0;z-index:9999;width:min(520px,100%);
  height:100dvh;display:flex;flex-direction:column;background:#fff;
  box-shadow:-18px 0 48px rgba(16,46,64,.2)
}
.nf-partner-cart-head{
  display:flex;justify-content:space-between;gap:16px;align-items:center;
  padding:18px 19px;border-bottom:1px solid #D9E6EC;background:#102E40;color:#fff
}
.nf-partner-cart-head h2{margin:0;font-size:23px}
.nf-partner-cart-head p{margin:3px 0 0;color:#CDE1EB;font-size:13px}
.nf-partner-cart-close{
  width:42px;height:42px;border:1px solid rgba(255,255,255,.3);border-radius:999px;
  background:transparent;color:#fff;font:inherit;font-size:21px;cursor:pointer
}
.nf-partner-cart-body{flex:1;overflow:auto;padding:16px;display:grid;gap:15px}
.nf-partner-cart-empty{
  padding:18px;border:1px dashed #BFD3DD;border-radius:13px;background:#F8FBFC;
  color:#607985;font-size:14px;line-height:1.55
}
.nf-partner-cart-group{display:grid;gap:7px}
.nf-partner-cart-group h3{margin:0;color:#173C52;font-size:15px}
.nf-partner-cart-line{
  display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:9px;align-items:center;
  padding:10px;border:1px solid #DCE7EC;border-radius:10px;background:#fff
}
.nf-partner-cart-line strong{color:#173C52;font-size:13px}
.nf-partner-cart-line span{display:block;margin-top:2px;color:#69808B;font-size:12px}
.nf-partner-cart-remove{
  border:0;background:transparent;color:#8B3030;font:inherit;font-size:12px;font-weight:900;cursor:pointer
}
.nf-partner-cart-checkout{
  display:grid;gap:12px;padding:14px;border:1px solid #CDDEE6;border-radius:14px;background:#F8FBFC
}
.nf-partner-cart-checkout h3{margin:0;color:#173C52;font-size:18px}
.nf-partner-cart-fulfill{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.nf-partner-cart-fulfill button{
  min-height:46px;border:1px solid #BFD3DD;border-radius:9px;background:#fff;
  color:#173C52;font:inherit;font-size:13px;font-weight:900;cursor:pointer
}
.nf-partner-cart-fulfill button.active{background:#173C52;color:#fff}
.nf-partner-cart-note{
  padding:10px 11px;border-left:4px solid #F7C41C;border-radius:9px;background:#FFF9E8;
  color:#604A1C;font-size:13px;line-height:1.5
}
.nf-partner-cart-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nf-partner-cart-field{display:grid;gap:4px}
.nf-partner-cart-field.full{grid-column:1/-1}
.nf-partner-cart-field label{color:#526E7B;font-size:12px;font-weight:850}
.nf-partner-cart-field input,.nf-partner-cart-field textarea{
  width:100%;min-height:42px;padding:9px;border:1px solid #BDD1DB;border-radius:8px;
  background:#fff;color:#173C52;font:inherit;font-size:14px
}
.nf-partner-cart-field textarea{min-height:74px;resize:vertical}
.nf-partner-cart-days{display:flex;flex-wrap:wrap;gap:5px}
.nf-partner-cart-days label{
  display:flex;gap:5px;align-items:center;padding:6px 8px;border:1px solid #D2E1E8;
  border-radius:999px;background:#fff;font-size:12px
}
.nf-partner-cart-days input{width:15px;height:15px;min-height:0;padding:0}
.nf-partner-cart-total{display:grid;gap:5px;padding:11px;border-radius:10px;background:#EDF7FB}
.nf-partner-cart-total div{display:flex;justify-content:space-between;gap:10px;color:#577381;font-size:13px}
.nf-partner-cart-total .grand{
  padding-top:6px;border-top:1px solid #C8DDE7;color:#173C52;font-size:17px;font-weight:900
}
.nf-partner-cart-error,.nf-partner-cart-success{
  padding:10px 11px;border-radius:9px;font-size:13px;line-height:1.45
}
.nf-partner-cart-error{border:1px solid #E1AAAA;background:#FFF3F3;color:#812B2B}
.nf-partner-cart-success{border:1px solid #A8D1B4;background:#F2FAF4;color:#285A37}
.nf-partner-cart-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.nf-partner-cart-actions button{
  min-height:47px;border:0;border-radius:10px;font:inherit;font-size:13px;font-weight:950;cursor:pointer
}
.nf-partner-cart-actions .review{background:#E7F2F7;color:#173C52}
.nf-partner-cart-actions .pay{background:#F7C41C;color:#102E40}
.nf-partner-cart-actions button:disabled{opacity:.48;cursor:not-allowed}
@media(max-width:560px){
  .nf-partner-cart-drawer{width:100%}
  .nf-partner-cart-grid,.nf-partner-cart-actions{grid-template-columns:1fr}
  .nf-partner-cart-field.full{grid-column:auto}
  .nf-partner-cart-line{grid-template-columns:1fr}
}
`;

export default function PartnerCartDrawer({ account }) {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState(() => getPartnerStoreCart());
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [checkout, setCheckout] = useState({
    fulfillmentMethod: getPartnerStoreFulfillment(),
    neededBy: "",
    preferredDeliveryDays: [],
    currentInventoryNotes: "",
    requestNotes: "",
  });
  const [profile, setProfile] = useState({
    businessName: account?.business_name || "",
    phone: account?.phone || "",
    addressLine1: account?.address_line1 || "",
    addressLine2: account?.address_line2 || "",
    city: account?.city || "",
    state: account?.state || "MI",
    zip: account?.zip || "",
    deliveryNotes: account?.delivery_notes || "",
  });

  useEffect(() => {
    setProfile({
      businessName: account?.business_name || "",
      phone: account?.phone || "",
      addressLine1: account?.address_line1 || "",
      addressLine2: account?.address_line2 || "",
      city: account?.city || "",
      state: account?.state || "MI",
      zip: account?.zip || "",
      deliveryNotes: account?.delivery_notes || "",
    });
  }, [account]);

  useEffect(() => {
    const sync = () => {
      setCart(getPartnerStoreCart());
      setQuote(null);
    };
    const show = () => {
      sync();
      setOpen(true);
      setError("");
      setSuccess("");
    };

    const syncFulfillment = (event) => {
      const fulfillmentMethod =
        event?.detail?.fulfillmentMethod ||
        getPartnerStoreFulfillment();

      setCheckout((current) => ({
        ...current,
        fulfillmentMethod,
        preferredDeliveryDays:
          fulfillmentMethod === "delivery"
            ? current.preferredDeliveryDays
            : [],
      }));
      setQuote(null);
    };

    window.addEventListener("nf-partner-cart-changed", sync);
    window.addEventListener("nf-open-partner-cart", show);
    window.addEventListener("nf-partner-fulfillment-changed", syncFulfillment);

    return () => {
      window.removeEventListener("nf-partner-cart-changed", sync);
      window.removeEventListener("nf-open-partner-cart", show);
      window.removeEventListener("nf-partner-fulfillment-changed", syncFulfillment);
    };
  }, []);

  const retailJars = cart
    .filter((item) => item.category === "retail")
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const subtotal = cart.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPriceCents || 0),
    0
  );

  const groups = useMemo(
    () =>
      Object.keys(groupLabel)
        .map((category) => ({
          category,
          items: cart.filter((item) => item.category === category),
        }))
        .filter((group) => group.items.length),
    [cart]
  );

  const payload = () => ({
    items: cart,
    fulfillmentMethod: checkout.fulfillmentMethod,
    neededBy: checkout.neededBy || null,
    preferredDeliveryDays: checkout.preferredDeliveryDays,
    currentInventoryNotes:
      checkout.currentInventoryNotes.trim() || null,
    requestNotes: checkout.requestNotes.trim() || null,
    deliveryProfile: profile,
  });

  const review = async () => {
    if (!cart.length) return;
    setBusy("review");
    setError("");
    setSuccess("");

    try {
      setQuote(await api.quotePartnerStoreOrder(payload()));
    } catch (reviewError) {
      setQuote(null);
      setError(
        reviewError?.message || "The final total could not be calculated."
      );
    } finally {
      setBusy("");
    }
  };

  const submit = async () => {
    if (!cart.length) return;

    setBusy("checkout");
    setError("");
    setSuccess("");

    try {
      const result = await api.checkoutPartnerStoreOrder(payload());

      clearPartnerStoreCart();
      setCart([]);
      setQuote(null);

      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl);
        return;
      }

      setSuccess(
        result.error ||
          `Order ${result.orderNo} was saved. NectarFusions will send the Square payment link.`
      );
    } catch (checkoutError) {
      setError(
        checkoutError?.message || "The partner order could not be submitted."
      );
    } finally {
      setBusy("");
    }
  };

  const remove = (id) => {
    setCart(removePartnerStoreItem(id));
    setQuote(null);
  };

  if (!open) return null;

  return (
    <>
      <style>{CSS}</style>
      <div
        className="nf-partner-cart-backdrop"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        className="nf-partner-cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Partner cart"
      >
        <div className="nf-partner-cart-head">
          <div>
            <h2>Partner Checkout</h2>
            <p>Everything from your store order checks out together.</p>
          </div>
          <button
            type="button"
            className="nf-partner-cart-close"
            onClick={() => setOpen(false)}
            aria-label="Close partner cart"
          >
            ×
          </button>
        </div>

        <div className="nf-partner-cart-body">
          {!cart.length ? (
            <div className="nf-partner-cart-empty">
              Your partner cart is empty. Close this cart and add products
              from Retailer Replenishment, Wholesale & Bulk, or Gift Sets.
            </div>
          ) : (
            groups.map((group) => (
              <section className="nf-partner-cart-group" key={group.category}>
                <h3>{groupLabel[group.category]}</h3>
                {group.items.map((item) => (
                  <div className="nf-partner-cart-line" key={item.id}>
                    <div>
                      <strong>{displayName(item)}</strong>
                      <span>
                        {item.quantity} × {money(item.unitPriceCents)}
                      </span>
                    </div>
                    <strong>
                      {money(item.quantity * item.unitPriceCents)}
                    </strong>
                    <button
                      type="button"
                      className="nf-partner-cart-remove"
                      onClick={() => remove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </section>
            ))
          )}

          <section className="nf-partner-cart-checkout">
            <h3>Checkout & Fulfillment</h3>

            {retailJars > 0 && retailJars < 12 ? (
              <div className="nf-partner-cart-error">
                Retailer Replenishment has {retailJars} jars. Add at least{" "}
                {12 - retailJars} more retail jars before checkout.
              </div>
            ) : null}

            <div className="nf-partner-cart-fulfill">
              <button
                type="button"
                className={
                  checkout.fulfillmentMethod === "pickup" ? "active" : ""
                }
                onClick={() => {
                  setPartnerStoreFulfillment("pickup");
                  setCheckout((current) => ({
                    ...current,
                    fulfillmentMethod: "pickup",
                    preferredDeliveryDays: [],
                  }));
                  setQuote(null);
                }}
              >
                Coleman Pickup
              </button>

              <button
                type="button"
                className={
                  checkout.fulfillmentMethod === "delivery" ? "active" : ""
                }
                onClick={() => {
                  setPartnerStoreFulfillment("delivery");
                  setCheckout((current) => ({
                    ...current,
                    fulfillmentMethod: "delivery",
                  }));
                  setQuote(null);
                }}
              >
                Local Delivery
              </button>
            </div>

            {checkout.fulfillmentMethod === "pickup" ? (
              <div className="nf-partner-cart-note">
                <strong>Coleman Pickup:</strong> {PICKUP_ADDRESS}. NectarFusions
                will confirm pickup timing.
              </div>
            ) : (
              <div className="nf-partner-cart-grid">
                {[
                  ["businessName", "Business / location name"],
                  ["phone", "Phone"],
                  ["addressLine1", "Street address"],
                  ["addressLine2", "Address line 2"],
                  ["city", "City"],
                  ["state", "State"],
                  ["zip", "ZIP"],
                ].map(([key, label]) => (
                  <div
                    className={`nf-partner-cart-field ${
                      ["addressLine1", "addressLine2"].includes(key)
                        ? "full"
                        : ""
                    }`}
                    key={key}
                  >
                    <label>{label}</label>
                    <input
                      value={profile[key]}
                      maxLength={key === "state" ? 2 : key === "zip" ? 5 : 250}
                      onChange={(event) => {
                        let value = event.target.value;
                        if (key === "state") value = value.toUpperCase();
                        if (key === "zip") {
                          value = value.replace(/\D/g, "").slice(0, 5);
                        }
                        setProfile((current) => ({
                          ...current,
                          [key]: value,
                        }));
                        setQuote(null);
                      }}
                    />
                  </div>
                ))}

                <div className="nf-partner-cart-field full">
                  <label>Delivery notes</label>
                  <textarea
                    value={profile.deliveryNotes}
                    onChange={(event) => {
                      setProfile((current) => ({
                        ...current,
                        deliveryNotes: event.target.value,
                      }));
                      setQuote(null);
                    }}
                  />
                </div>

                <div className="nf-partner-cart-field full">
                  <label>Preferred delivery days</label>
                  <div className="nf-partner-cart-days">
                    {DAYS.map(([value, label]) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={checkout.preferredDeliveryDays.includes(
                            value
                          )}
                          onChange={() => {
                            setCheckout((current) => ({
                              ...current,
                              preferredDeliveryDays:
                                current.preferredDeliveryDays.includes(value)
                                  ? current.preferredDeliveryDays.filter(
                                      (item) => item !== value
                                    )
                                  : [...current.preferredDeliveryDays, value],
                            }));
                            setQuote(null);
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="nf-partner-cart-grid">
              <div className="nf-partner-cart-field">
                <label>Needed by</label>
                <input
                  type="date"
                  value={checkout.neededBy}
                  onChange={(event) => {
                    setCheckout((current) => ({
                      ...current,
                      neededBy: event.target.value,
                    }));
                    setQuote(null);
                  }}
                />
              </div>

              {retailJars > 0 ? (
                <div className="nf-partner-cart-field full">
                  <label>Current inventory notes</label>
                  <textarea
                    value={checkout.currentInventoryNotes}
                    onChange={(event) => {
                      setCheckout((current) => ({
                        ...current,
                        currentInventoryNotes: event.target.value,
                      }));
                      setQuote(null);
                    }}
                  />
                </div>
              ) : null}

              <div className="nf-partner-cart-field full">
                <label>Order / request notes</label>
                <textarea
                  value={checkout.requestNotes}
                  onChange={(event) => {
                    setCheckout((current) => ({
                      ...current,
                      requestNotes: event.target.value,
                    }));
                    setQuote(null);
                  }}
                />
              </div>
            </div>

            <div className="nf-partner-cart-total">
              <div>
                <span>Merchandise</span>
                <strong>{money(quote?.subtotalCents ?? subtotal)}</strong>
              </div>
              <div>
                <span>Local delivery (ZIP-based)</span>
                <strong>
                  {quote ? money(quote.deliveryFeeCents) : "Calculated by ZIP"}
                </strong>
              </div>
              <div>
                <span>Processing fee (4%)</span>
                <strong>
                  {quote
                    ? money(quote.processingFeeCents)
                    : "Calculated securely"}
                </strong>
              </div>
              <div className="grand">
                <span>Final total</span>
                <strong>
                  {quote ? money(quote.totalCents) : "Review total"}
                </strong>
              </div>
            </div>

            {error ? (
              <div className="nf-partner-cart-error">{error}</div>
            ) : null}
            {success ? (
              <div className="nf-partner-cart-success">{success}</div>
            ) : null}

            <div className="nf-partner-cart-actions">
              <button
                type="button"
                className="review"
                disabled={Boolean(busy) || !cart.length}
                onClick={review}
              >
                {busy === "review" ? "Calculating…" : "Review Final Total"}
              </button>
              <button
                type="button"
                className="pay"
                disabled={
                  Boolean(busy) ||
                  !cart.length ||
                  (retailJars > 0 && retailJars < 12)
                }
                onClick={submit}
              >
                {busy === "checkout"
                  ? "Saving Order…"
                  : "Submit Order & Continue to Square"}
              </button>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
