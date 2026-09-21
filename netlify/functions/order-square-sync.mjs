import { createClient } from "@supabase/supabase-js";
import { square, db, ok, bad } from "./_square.mjs";

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const asUser = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY
  );

  const { data, error } =
    await asUser.auth.getUser(token);

  if (error || !data?.user) return null;

  const { data: admin } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return admin ? data.user : null;
}

const unique = (values) =>
  [...new Set(values.filter(Boolean))];

export default async (req) => {
  if (req.method !== "POST") {
    return bad("POST only", 405);
  }

  const admin = await requireAdmin(req);

  if (!admin) {
    return bad("Admin access is required.", 403);
  }

  let orderId;

  try {
    ({ orderId } = await req.json());
  } catch {
    return bad("Bad JSON");
  }

  if (!orderId) {
    return bad("Order ID is required.");
  }

  const supa = db();

  const { data: row, error: rowError } =
    await supa
      .from("orders")
      .select(
        "id,order_no,status,paid,paid_at,square_order_id,square_payment_id"
      )
      .eq("id", orderId)
      .single();

  if (rowError || !row) {
    return bad("Order not found.", 404);
  }

  if (row.paid) {
    return ok({
      synced: true,
      state: "completed",
      squarePaymentId: row.square_payment_id || null,
      message: `Order #${row.order_no} is already marked paid.`,
    });
  }

  if (row.status === "cancelled") {
    return bad(
      "Cancelled orders cannot be moved back to Active by a Square status check.",
      409
    );
  }

  if (!row.square_order_id) {
    return ok({
      synced: false,
      state: "not_linked",
      message:
        "This order does not have a Square checkout ID yet, so there is nothing to check in Square.",
    });
  }

  const detail = await square(
    `/v2/orders/${encodeURIComponent(row.square_order_id)}`,
    { method: "GET" }
  );

  const squareOrder = detail.order || null;

  if (!squareOrder) {
    return ok({
      synced: false,
      state: "not_found",
      message:
        "Square could not find this checkout yet.",
    });
  }

  const paymentIds = unique([
    row.square_payment_id,
    ...(squareOrder.tenders || []).map(
      (tender) => tender.payment_id || tender.id
    ),
  ]);

  if (!paymentIds.length) {
    return ok({
      synced: false,
      state: "no_payment",
      message:
        "Square found the checkout, but no payment is attached to it yet.",
    });
  }

  const checkedStatuses = [];
  let completedPayment = null;

  for (const paymentId of paymentIds) {
    try {
      const paymentDetail = await square(
        `/v2/payments/${encodeURIComponent(paymentId)}`,
        { method: "GET" }
      );

      const payment = paymentDetail.payment || null;
      if (!payment) continue;

      const status = String(payment.status || "").toUpperCase();
      checkedStatuses.push(status || "UNKNOWN");

      if (
        status === "COMPLETED" &&
        payment.order_id === row.square_order_id
      ) {
        completedPayment = payment;
        break;
      }
    } catch (error) {
      console.error(
        "Square payment refresh failed:",
        paymentId,
        error.message
      );
    }
  }

  if (!completedPayment) {
    const statusText = unique(checkedStatuses).join(", ");

    return ok({
      synced: false,
      state: "not_completed",
      squareStatus: statusText || null,
      message: statusText
        ? `Square currently reports ${statusText}. The order will stay Payment Pending until Square reports COMPLETED.`
        : "Square found the checkout, but a completed payment could not be confirmed yet.",
    });
  }

  const { error: updateError } = await supa
    .from("orders")
    .update({
      paid: true,
      paid_at: new Date().toISOString(),
      square_payment_id: completedPayment.id,
    })
    .eq("id", row.id);

  if (updateError) {
    return bad(updateError.message, 500);
  }

  return ok({
    synced: true,
    state: "completed",
    squareStatus: "COMPLETED",
    squarePaymentId: completedPayment.id,
    message:
      `Square confirmed order #${row.order_no} is paid. It has been moved to Active.`,
  });
};
