// nf-fulfillment-copy-text-v10. Pure formatter: copying never sends a message.
// The text for each manual stage matches the customer-facing wording of the V9
// email (minus HTML presentation). The mailed stage adds a MANUAL tracking line
// ONLY in the copied text; it never changes the automatic email.
const string = (value) => String(value ?? "").trim();
const firstName = (order) => string(order.name).split(/\s+/)[0] || "there";
const no = (order) => string(order.order_no) || "(order number unavailable)";
export const TRACKING_PLACEHOLDER = "[ENTER TRACKING NUMBER]";

export function trackingForText(value) {
  // Keep a pasted tracking value on ONE line, and out of future checkout emails.
  return string(value).replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ").slice(0, 120).trim();
}

export function copyTextForOrder(order, kind, tracking = "") {
  const number = no(order);
  const method = order.method;
  const header = "NECTARFUSIONS · NATURE'S HAPPINESS";
  const hello = `Hi ${firstName(order)},`;
  const thanks = "Thank you for supporting NectarFusions! 🐝";
  let title = "";
  let body = "";
  let contact = "";
  let trackingLine = "";

  switch (kind) {
    case "confirmed":
      // The actual checkout receipt also contains order items and payment details;
      // this is explicitly a quick text summary, NOT that complete receipt.
      title = "YOUR ORDER IS CONFIRMED";
      body = `Thank you! We've received your NectarFusions order #${number}. Your full order details are in your confirmation email.`;
      break;
    case "processing":
      title = "YOUR HONEY ORDER IS BEING PROCESSED";
      body = `Your honey order is being processed. This does not mean it has shipped or is out for delivery. You will receive another email when your order ${method === "ship" ? "has shipped" : method === "market" ? "is ready for pickup" : "has been packaged and is out for delivery"}.`;
      break;
    case "out_for_delivery":
      if (method !== "delivery") throw new Error("Out for delivery is only for local deliveries.");
      title = "Your honey is out for delivery!";
      body = `Your NectarFusions order #${number} is out for local delivery. Our team is on its way to you!`;
      contact = "If you have any questions, please call or text NectarFusions at (989) 941-6385.";
      break;
    case "delivered":
      if (method !== "delivery") throw new Error("Delivered is only for local deliveries.");
      title = "YOUR HONEY HAS BEEN DELIVERED";
      body = "Your NectarFusions honey has been delivered!";
      // Do NOT say a photo is attached; plain-text copy does not copy attachments.
      break;
    case "shipped":
      if (method !== "ship") throw new Error("Shipped is only for mailed orders.");
      title = "Your honey is on its way!";
      body = `Your NectarFusions order #${number} has shipped and is on its way to you!`;
      contact = "If you have any questions, please call or text NectarFusions at (989) 941-6385.";
      trackingLine = `Tracking number: ${trackingForText(tracking) || TRACKING_PLACEHOLDER}`;
      break;
    case "ready_for_pickup":
      if (method !== "market") throw new Error("Ready for pickup is only for market orders.");
      title = "YOUR HONEY IS READY FOR PICKUP";
      body = "Your honey is ready! Please collect it at your scheduled market pickup location.";
      break;
    default:
      throw new Error("Unknown notification stage.");
  }
  return [header, title, hello, body, trackingLine, contact, `Order #${number}`, thanks]
    .filter(Boolean).join("\n\n");
}
