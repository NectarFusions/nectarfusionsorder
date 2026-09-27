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

  const { data, error } = await asUser.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: admin } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return admin ? data.user : null;
}

const unique = (values) => [...new Set(values.filter(Boolean))];

async function ensureRecurringFromPaidOrder(supa, row, paidAt) {
  const requested = row.configuration_snapshot?.requested || {};

  if (
    requested.recurring !== true ||
    !row.package_id ||
    !row.partner_id
  ) {
    return;
  }

  const { data: pkg, error: pkgError } = await supa
    .from("partner_packages")
    .select("id,program_key,recurring_allowed")
    .eq("id", row.package_id)
    .maybeSingle();

  if (pkgError) throw pkgError;
  if (pkg?.recurring_allowed !== true) return;

  let cadenceValue = 1;
  let cadenceUnit = "month";

  if (requested.cadence === "quarterly") cadenceValue = 3;
  if (requested.cadence === "annual") {
    cadenceValue = 1;
    cadenceUnit = "year";
  }
  if (requested.cadence === "custom") {
    cadenceValue = Math.min(
      365,
      Math.max(
        1,
        Number.parseInt(requested.custom_interval_days, 10) || 30
      )
    );
    cadenceUnit = "day";
  }

  const { data: existingRecurring, error: existingError } =
    await supa
      .from("partner_recurring_orders")
      .select("id")
      .eq("created_from_order_id", row.id)
      .maybeSingle();

  if (existingError) throw existingError;
  if (existingRecurring) return;

  const { error: recurringError } = await supa
    .from("partner_recurring_orders")
    .insert({
      partner_id: row.partner_id,
      program_key: pkg.program_key,
      package_id: pkg.id,
      status: "active",
      cadence_value: cadenceValue,
      cadence_unit: cadenceUnit,
      next_order_on: null,
      configuration_snapshot: row.configuration_snapshot || {},
      fulfillment_method: row.fulfillment_method,
      delivery_profile_snapshot: {
        business_name: row.business_name,
        phone: row.phone,
        address_line1: row.address_line1,
        address_line2: row.address_line2,
        city: row.city,
        state: row.state,
        zip: row.zip,
        delivery_notes: row.delivery_notes,
      },
      created_from_order_id: row.id,
      last_order_id: row.id,
      updated_at: paidAt,
    });

  if (recurringError && recurringError.code !== "23505") {
    throw recurringError;
  }
}

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
    return bad("Partner order ID is required.");
  }

  const supa = db();

  const { data: row, error: rowError } = await supa
    .from("partner_store_orders")
    .select(
      "id,order_no,status,paid,paid_at,square_order_id,square_payment_id," +
      "partner_id,program_key,package_id,configuration_snapshot,fulfillment_method," +
      "business_name,phone,address_line1,address_line2,city,state,zip,delivery_notes"
    )
    .eq("id", orderId)
    .single();

  if (rowError || !row) {
    return bad("Partner order not found.", 404);
  }

  if (row.paid) {
    try {
      await ensureRecurringFromPaidOrder(
        supa,
        row,
        row.paid_at || new Date().toISOString()
      );
    } catch (error) {
      console.error(
        "Partner recurring reconciliation failed:",
        error?.message || error
      );
    }

    return ok({
      synced: true,
      state: "completed",
      squarePaymentId: row.square_payment_id || null,
      message: `Partner order ${row.order_no} is already marked paid.`,
    });
  }

  if (row.status === "cancelled") {
    return bad(
      "Cancelled partner orders cannot be restored by a Square status check.",
      409
    );
  }

  if (!row.square_order_id) {
    return ok({
      synced: false,
      state: "not_linked",
      message:
        "This partner order does not have a Square checkout ID yet.",
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
      message: "Square could not find this partner checkout yet.",
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
        "Square found the partner checkout, but no payment is attached yet.",
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
        "Partner Square payment refresh failed:",
        paymentId,
        error?.message || error
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
        ? `Square currently reports ${statusText}. The partner order will stay Awaiting Payment until Square reports COMPLETED.`
        : "Square found the checkout, but a completed payment could not be confirmed.",
    });
  }

  const paidAt = new Date().toISOString();

  const { error: updateError } = await supa
    .from("partner_store_orders")
    .update({
      paid: true,
      paid_at: paidAt,
      square_payment_id: completedPayment.id,
      status: "paid",
      updated_at: paidAt,
    })
    .eq("id", row.id);

  if (updateError) {
    return bad(updateError.message, 500);
  }

  try {
    await ensureRecurringFromPaidOrder(
      supa,
      { ...row, paid: true, paid_at: paidAt },
      paidAt
    );
  } catch (error) {
    console.error(
      "Partner recurring reconciliation failed:",
      error?.message || error
    );
    return ok({
      synced: true,
      state: "completed",
      squareStatus: "COMPLETED",
      squarePaymentId: completedPayment.id,
      recurringWarning:
        "Payment was reconciled, but the recurring schedule needs attention.",
      message:
        `Square confirmed partner order ${row.order_no} is paid. The payment is saved, but recurring setup needs attention.`,
    });
  }

  return ok({
    synced: true,
    state: "completed",
    squareStatus: "COMPLETED",
    squarePaymentId: completedPayment.id,
    message:
      `Square confirmed partner order ${row.order_no} is paid and moved it into the fulfillment workflow.`,
  });
};
