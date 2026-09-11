import { createClient } from "@supabase/supabase-js";
import { db, ok, bad } from "./_square.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value) => String(value ?? "").trim();

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

  const { data: adminRow, error: adminError } = await db()
    .from("admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (adminError || !adminRow) return null;
  return data.user;
}

async function listAll(supa) {
  const [requestResult, flagResult] = await Promise.all([
    supa
      .from("flavor_requests")
      .select("id,flavor_id,flavor_name,source,review_id,requested_at,requested_on")
      .order("requested_at", { ascending: false })
      .limit(5000),
    supa
      .from("flavor_request_flags")
      .select("flavor_id,popular,updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  if (requestResult.error) throw new Error(requestResult.error.message);
  if (flagResult.error) throw new Error(flagResult.error.message);

  return {
    requests: (requestResult.data || []).map((row) => ({
      id: row.id,
      flavorId: row.flavor_id,
      flavorName: row.flavor_name,
      source: row.source,
      reviewId: row.review_id,
      requestedAt: row.requested_at,
      requestedOn: row.requested_on,
    })),
    flags: (flagResult.data || []).map((row) => ({
      flavorId: row.flavor_id,
      popular: row.popular === true,
      updatedAt: row.updated_at,
    })),
  };
}

export default async (req) => {
  const admin = await requireAdmin(req);
  if (!admin) return bad("Admin authorization required.", 401);

  const supa = db();

  try {
    if (req.method === "GET") {
      return ok(await listAll(supa));
    }

    if (req.method !== "POST") return bad("GET or POST only", 405);

    const body = await req.json().catch(() => ({}));
    const action = text(body?.action);

    if (action === "delete") {
      const id = text(body?.id);
      if (!UUID_RE.test(id)) return bad("Flavor request ID is required.");

      const { data, error } = await supa
        .from("flavor_requests")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return bad("Flavor request not found.", 404);

      return ok({ deleted: true });
    }

    if (action === "popular") {
      const flavorId = text(body?.flavorId);
      if (!UUID_RE.test(flavorId)) return bad("Flavor ID is required.");

      const { data: flavor, error: flavorError } = await supa
        .from("flavors")
        .select("id")
        .eq("id", flavorId)
        .maybeSingle();

      if (flavorError) throw new Error(flavorError.message);
      if (!flavor) return bad("Flavor not found.", 404);

      const { error } = await supa.from("flavor_request_flags").upsert(
        {
          flavor_id: flavorId,
          popular: body?.popular === true,
          updated_at: new Date().toISOString(),
          updated_by: admin.id,
        },
        { onConflict: "flavor_id" }
      );

      if (error) throw new Error(error.message);

      return ok({ saved: true });
    }

    return bad("Choose a valid flavor request action.");
  } catch (error) {
    console.error("Flavor request admin failed:", error);
    return bad(error.message || "Flavor request admin failed.", 500);
  }
};
