const button = {
  position: "fixed",
  zIndex: 9999,
  bottom: 18,
  right: 18,
  padding: "11px 14px",
  borderRadius: 999,
  border: "1px solid #D6A72A",
  background: "#111",
  color: "#fff",
  fontSize: 13,
  fontWeight: 800,
  textDecoration: "none",
  boxShadow: "0 8px 24px rgba(0,0,0,.22)",
};

export default function SubscriptionFulfillmentLauncher() {
  const path = window.location.pathname;
  const clubMatch = path.match(
    /^\/club\/([0-9a-f-]{36})\/?$/i
  );

  // Customer-only launcher. Admin controls must never be rendered on the
  // public storefront, even when an admin happens to be signed in.
  if (path.includes("/fulfillment") || !clubMatch) return null;

  return (
    <a
      href={`/club/${clubMatch[1]}/fulfillment`}
      style={button}
    >
      Delivery / Pickup Settings
    </a>
  );
}
