/* ============================================================
   SUB ACTION  —  /.netlify/functions/sub-action

   POST { subId, action }   action = pause | resume | cancel
   Authorization: Bearer <the admin's Supabase access token>

   THE BUG THIS FIXES:
   Admin used to pause and cancel subscriptions by writing to
   Supabase and nothing else. Square never heard about it — and
   Square is the thing holding the card. So a "cancelled" member
   kept getting charged every cycle. This makes Square the source
   of truth for billing, and mirrors the result into our database.

   WHY IT VERIFIES THE CALLER:
   This function can stop someone's billing. It runs with the
   service_role key, which bypasses every RLS policy. So it checks
   the caller's Supabase token and confirms they're actually in the
   admins table before it touches anything.
   ============================================================ */

import { createClient } from "@supabase/supabase-js";
import { square, db, ok, bad } from "./_square.mjs";

async function requireAdmin(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  // Verify the JWT against Supabase using the anon key — this only
  // tells us WHO they are, not what they're allowed to do.
  const asUser = createClient(process.env.SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY);
  const { data, error } = await asUser.auth.getUser(token);
  if (error || !data?.user) return null;

  // Now check they're actually an admin, with the privileged client.
  const { data: row } = await db().from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  return row ? data.user : null;
}

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  const admin = await requireAdmin(req);
  if (!admin) return bad("Not an admin", 403);

  let subId, action;
  try { ({ subId, action } = await req.json()); } catch { return bad("Bad JSON"); }
  if (!subId || !["pause", "resume", "cancel"].includes(action)) return bad("Bad action");

  const supa = db();
  const { data: s, error } = await supa.from("subscriptions").select("*").eq("id", subId).single();
  if (error || !s) return bad("Subscription not found", 404);

  const sqId = s.square_subscription_id;

  /* If Square never got as far as creating the subscription (the member
     never added a card), there's nothing to stop over there. Just close
     it out on our side. */
  if (!sqId) {
    await supa.from("subscriptions").update({
      status: action === "cancel" ? "cancelled" : action === "pause" ? "paused" : "pending",
      cancelled_at: action === "cancel" ? new Date().toISOString() : null,
    }).eq("id", subId);
    return ok({ status: action === "cancel" ? "cancelled" : "pending", square: "no card on file yet" });
  }

  try {
    if (action === "cancel") {
      // Square schedules the cancel at the end of the paid period —
      // they've already paid for the current box, so they still get it.
      await square(`/v2/subscriptions/${sqId}/cancel`, { method: "POST" });
      await supa.from("subscriptions").update({
        status: "cancelled", cancelled_at: new Date().toISOString(),
      }).eq("id", subId);
      return ok({ status: "cancelled", note: "Square will stop billing at the end of the paid period." });
    }

    if (action === "pause") {
      await square(`/v2/subscriptions/${sqId}/pause`, {
        method: "POST",
        body: { pause_reason: "Requested by member" },
      });
      await supa.from("subscriptions").update({ status: "paused" }).eq("id", subId);
      return ok({ status: "paused", note: "Square will not bill again until you resume." });
    }

    // resume
    await square(`/v2/subscriptions/${sqId}/resume`, {
      method: "POST",
      body: { resume_effective_date: new Date().toISOString().slice(0, 10) },
    });
    await supa.from("subscriptions").update({ status: "active", failed_at: null }).eq("id", subId);
    return ok({ status: "active" });

  } catch (e) {
    // Square said no. Do NOT update our database — a mismatch here is
    // exactly the bug we're fixing.
    console.error("Square action failed:", e.message);
    return bad(`Square refused: ${e.message}. Nothing was changed.`, 502);
  }
};
