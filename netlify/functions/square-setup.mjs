/* ============================================================
   SQUARE SETUP  —  /.netlify/functions/square-setup

   RUN THIS ONCE. It builds your Square catalog from the plans
   already in Supabase, then writes the resulting IDs back.

   Visit in a browser:
     https://your-site.netlify.app/.netlify/functions/square-setup?key=YOUR_WEBHOOK_SECRET

   Safe to re-run — it upserts by a stable idempotency key, so
   running it twice won't give you eight duplicate plans.

   WHAT SQUARE CALLS THINGS:
     SUBSCRIPTION_PLAN            = what you sell   ("The Signature")
     SUBSCRIPTION_PLAN_VARIATION  = how it's sold   ("$20, every 2 months")

   Each of your four boxes needs TWO variations, because a member
   can choose monthly or bimonthly. Four plans → eight variations.
   ============================================================ */

import { square, db, idem, ok, bad } from "./_square.mjs";

const CADENCES = [
  { col: "square_var_1mo", cadence: "MONTHLY",          label: "Monthly" },
  { col: "square_var_2mo", cadence: "EVERY_TWO_MONTHS", label: "Every 2 months" },
];

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== process.env.WEBHOOK_SECRET) {
    return bad("Unauthorized", 401);
  }
  if (!process.env.SQUARE_ACCESS_TOKEN) return bad("SQUARE_ACCESS_TOKEN is not set", 500);
  if (!process.env.SQUARE_LOCATION_ID) return bad("SQUARE_LOCATION_ID is not set", 500);

  const supa = db();
  const { data: plans, error } = await supa.from("plans").select("*").order("sort");
  if (error) return bad(error.message, 500);

  const report = [];

  for (const p of plans) {
    /* ---- 1. the plan itself ---- */
    const planRes = await square("/v2/catalog/object", {
      body: {
        idempotency_key: idem(),
        object: {
          type: "SUBSCRIPTION_PLAN",
          id: p.square_plan_id || `#plan_${p.id}`,
          subscription_plan_data: {
            name: `${p.name} — NectarFusions`,
            all_items: false,
          },
        },
      },
    });
    const planId = planRes.catalog_object.id;

    /* ---- 2. one variation per cadence ---- */
    const patch = { square_plan_id: planId };

    for (const cd of CADENCES) {
      const varRes = await square("/v2/catalog/object", {
        body: {
          idempotency_key: idem(),
          object: {
            type: "SUBSCRIPTION_PLAN_VARIATION",
            id: p[cd.col] || `#var_${p.id}_${cd.cadence}`,
            subscription_plan_variation_data: {
              name: `${p.name} — ${cd.label}`,
              subscription_plan_id: planId,
              phases: [
                {
                  cadence: cd.cadence,
                  ordinal: 0,
                  pricing: {
                    type: "STATIC",
                    price_money: { amount: p.price_cents, currency: "USD" },
                  },
                },
              ],
            },
          },
        },
      });
      patch[cd.col] = varRes.catalog_object.id;
    }

    await supa.from("plans").update(patch).eq("id", p.id);
    report.push({ plan: p.name, price: `$${(p.price_cents / 100).toFixed(2)}`, ...patch });
  }

  return ok({
    done: true,
    env: process.env.SQUARE_ENV === "production" ? "PRODUCTION — real money" : "sandbox — fake money",
    note: "Plan variation IDs are now stored in Supabase. You shouldn't need to run this again unless you change a plan's price.",
    plans: report,
  });
};
