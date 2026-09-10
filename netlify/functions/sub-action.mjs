/* ============================================================
   SUB ACTION — /.netlify/functions/sub-action

   POST { subId, action }   action = skip | cancel
   Authorization: Bearer <admin Supabase access token>

   "skip" pauses exactly one billing cycle. Square schedules both
   the PAUSE and automatic RESUME actions.
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { square, db, ok, bad } from "./_square.mjs";

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const asUser = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  );

  const { data, error } = await asUser.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: row } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return row ? data.user : null;
}

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  const admin = await requireAdmin(req);
  if (!admin) return bad("Not an admin", 403);

  let subId, action;
  try {
    ({ subId, action } = await req.json());
  } catch {
    return bad("Bad JSON");
  }

  if (!subId || !["skip", "cancel"].includes(action)) {
    return bad("Bad action");
  }

  const supa = db();

  const { data: s, error } = await supa
    .from("subscriptions")
    .select("*")
    .eq("id", subId)
    .single();

  if (error || !s) return bad("Subscription not found", 404);

  const sqId = s.square_subscription_id;
  const hasScheduledPlanChange =
    s.plan_change_status === "scheduled" && Boolean(s.pending_plan_id);

  if (action === "skip" && hasScheduledPlanChange) {
    return bad(
      "A subscription change is already scheduled for this member. Cancel that scheduled change before skipping a billing cycle.",
      409
    );
  }

  if (!sqId) {
    if (action === "cancel") {
      const { error: updateError } = await supa
        .from("subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          paused_until: null,
          pending_plan_id: null,
          pending_cadence: null,
          plan_change_effective_date: null,
          plan_change_status: null,
        })
        .eq("id", subId);

      if (updateError) return bad(updateError.message, 500);

      if (hasScheduledPlanChange) {
        await supa
          .from("subscription_plan_change_events")
          .update({
            status: "cancelled",
            note: "Membership was cancelled before the scheduled plan change became effective.",
            completed_at: new Date().toISOString(),
          })
          .eq("subscription_id", subId)
          .eq("status", "scheduled");
      }

      return ok({
        status: "cancelled",
        square: "No Square subscription existed.",
      });
    }

    return bad(
      "No card is on file yet, so there is no Square billing cycle to skip.",
      409
    );
  }

  if (action === "cancel") {
    let alreadyScheduled = false;
    let pendingCancelDate = null;

    try {
      await square(`/v2/subscriptions/${sqId}/cancel`, {
        method: "POST",
      });
    } catch (e) {
      const message = String(e?.message || e);

      if (/already has a pending cancel date/i.test(message)) {
        alreadyScheduled = true;
        pendingCancelDate =
          message.match(/pending cancel date of [`'"]?([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] ?? null;
      } else {
        console.error("Square cancellation failed:", message);
        return bad(`Square refused: ${message}. Nothing was changed.`, 502);
      }
    }

    const { error: updateError } = await supa
      .from("subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        paused_until: null,
        pending_plan_id: null,
        pending_cadence: null,
        plan_change_effective_date: null,
        plan_change_status: null,
      })
      .eq("id", subId);

    if (updateError) {
      console.error(
        alreadyScheduled
          ? "Square cancellation was already scheduled but Supabase update failed:"
          : "Square cancelled but Supabase update failed:",
        updateError.message
      );

      return bad(
        alreadyScheduled
          ? "Square already scheduled this cancellation, but the Admin record did not update."
          : "Square accepted the cancellation, but the Admin record did not update.",
        500
      );
    }

    if (hasScheduledPlanChange) {
      const { error: planAuditError } = await supa
        .from("subscription_plan_change_events")
        .update({
          status: "cancelled",
          note: "Membership was cancelled before the scheduled plan change became effective.",
          completed_at: new Date().toISOString(),
        })
        .eq("subscription_id", subId)
        .eq("status", "scheduled");

      if (planAuditError) {
        console.error("Plan-change cancellation audit update failed:", planAuditError);
      }
    }

    return ok({
      status: "cancelled",
      already_scheduled: alreadyScheduled,
      cancel_date: pendingCancelDate,
      note: alreadyScheduled
        ? pendingCancelDate
          ? `Square already scheduled cancellation for ${pendingCancelDate}.`
          : "Square already scheduled this cancellation."
        : "Square will stop billing at the end of the paid period.",
    });
  }

  let result;

  try {
    result = await square(`/v2/subscriptions/${sqId}/pause`, {
      method: "POST",
      body: {
        pause_reason: "Member requested to skip the next Honey Club box",
        pause_cycle_duration: 1,
      },
    });
  } catch (e) {
    console.error("Square skip failed:", e.message);
    return bad(`Square refused: ${e.message}. Nothing was changed.`, 502);
  }

  const actions = result.actions || [];
  const pauseAction = actions.find((a) => a.type === "PAUSE");
  const resumeAction = actions.find((a) => a.type === "RESUME");

  if (!pauseAction || !resumeAction?.effective_date) {
    console.error("Unexpected Square pause response:", JSON.stringify(result));
    return bad(
      "Square did not confirm both the pause and automatic resume actions.",
      502
    );
  }

  /*
    Keep the local status active because the pause is scheduled for the
    next billing cycle. paused_until records the automatic resume date.
  */
  const { error: updateError } = await supa
    .from("subscriptions")
    .update({
      paused_until: resumeAction.effective_date,
    })
    .eq("id", subId);

  if (updateError) {
    console.error("Square scheduled skip but Supabase update failed:", updateError.message);
    return bad(
      "Square scheduled the skip, but the Admin record did not save the resume date.",
      500
    );
  }

  return ok({
    status: result.subscription?.status?.toLowerCase() || s.status,
    skip_scheduled: true,
    pause_effective_date: pauseAction.effective_date,
    resume_effective_date: resumeAction.effective_date,
    note: "The next billing cycle will be skipped and Square will resume automatically.",
  });
};
