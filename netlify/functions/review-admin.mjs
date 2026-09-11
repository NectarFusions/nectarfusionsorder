import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { db, ok, bad } from "./_square.mjs";

const IMAGE_BUCKET = "review-images";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

const safeImageName = (name) =>
  text(name || "review-photo")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 110) || "review-photo";

async function uploadImage(supa, reviewId, file) {
  if (!file || typeof file.arrayBuffer !== "function" || !file.size) {
    return null;
  }

  if (!IMAGE_TYPES.has(file.type)) {
    throw new Error("Review photos must be PNG, JPG, or WebP images.");
  }

  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Review photos must be 2 MB or smaller after optimization.");
  }

  const path = `${reviewId}/${randomUUID()}-${safeImageName(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error } = await supa.storage.from(IMAGE_BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(error.message);
  return path;
}

async function signedImageUrl(supa, row) {
  if (!row.image_path) return null;

  const { data, error } = await supa.storage
    .from(row.image_bucket || IMAGE_BUCKET)
    .createSignedUrl(row.image_path, 60 * 60);

  if (error) {
    console.error("Could not sign admin review image:", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

async function listReviews(supa) {
  const { data, error } = await supa
    .from("reviews")
    .select(
      "id,display_name,email,rating,title,body,product_text,image_bucket,image_path,status,source,submitted_at,approved_at,created_at"
    )
    .order("submitted_at", { ascending: false });

  if (error) throw new Error(error.message);

  return Promise.all(
    (data || []).map(async (review) => ({
      id: review.id,
      displayName: review.display_name,
      email: review.email || "",
      rating: review.rating,
      title: review.title || "",
      body: review.body,
      productText: review.product_text || "",
      status: review.status,
      source: review.source,
      submittedAt: review.submitted_at,
      approvedAt: review.approved_at,
      imageUrl: await signedImageUrl(supa, review),
    }))
  );
}

export default async (req) => {
  const admin = await requireAdmin(req);
  if (!admin) return bad("Admin authorization required.", 401);

  const supa = db();

  try {
    if (req.method === "GET") {
      return ok({ reviews: await listReviews(supa) });
    }

    if (req.method !== "POST") return bad("GET or POST only", 405);

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      if (text(form.get("action")) !== "create") {
        return bad("Choose a valid review action.");
      }

      const displayName = text(form.get("displayName"));
      const email = text(form.get("email")).toLowerCase();
      const rating = Number.parseInt(form.get("rating"), 10);
      const title = text(form.get("title"));
      const body = text(form.get("body"));
      const productText = text(form.get("productText"));
      const publishNow = text(form.get("publishNow")) === "true";
      const image = form.get("image");

      if (!displayName) return bad("Reviewer name is required.");
      if (displayName.length > 120) return bad("Please shorten the reviewer name.");
      if (email && (!EMAIL_RE.test(email) || email.length > 320)) {
        return bad("Enter a valid reviewer email or leave it blank.");
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return bad("Choose a bee rating from 1 to 5.");
      }
      if (!body) return bad("Review text is required.");
      if (title.length > 180) return bad("Please shorten the review title.");
      if (productText.length > 220) return bad("Please shorten the product description.");

      const id = randomUUID();
      let imagePath = null;

      try {
        imagePath = await uploadImage(supa, id, image);

        const { error } = await supa.from("reviews").insert({
          id,
          display_name: displayName,
          email: email || null,
          rating,
          title: title || null,
          body,
          product_text: productText || null,
          image_bucket: imagePath ? IMAGE_BUCKET : null,
          image_path: imagePath,
          status: publishNow ? "approved" : "pending",
          source: "admin",
          approved_at: publishNow ? new Date().toISOString() : null,
          approved_by: publishNow ? admin.id : null,
        });

        if (error) throw new Error(error.message);
      } catch (error) {
        if (imagePath) {
          await supa.storage.from(IMAGE_BUCKET).remove([imagePath]).catch(() => {});
        }
        throw error;
      }

      return ok({ saved: true });
    }

    const body = await req.json();
    const action = text(body?.action);
    const id = text(body?.id);

    if (!id) return bad("Review ID is required.");

    if (action === "approve") {
      const { data, error } = await supa
        .from("reviews")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: admin.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return bad("Review not found.", 404);
      return ok({ approved: true });
    }

    if (action === "delete") {
      const { data: review, error: readError } = await supa
        .from("reviews")
        .select("id,image_bucket,image_path")
        .eq("id", id)
        .maybeSingle();

      if (readError) throw new Error(readError.message);
      if (!review) return bad("Review not found.", 404);

      const { error: deleteError } = await supa
        .from("reviews")
        .delete()
        .eq("id", id);

      if (deleteError) throw new Error(deleteError.message);

      if (review.image_path) {
        const { error: storageError } = await supa.storage
          .from(review.image_bucket || IMAGE_BUCKET)
          .remove([review.image_path]);

        if (storageError) {
          console.error("Review deleted but image cleanup failed:", storageError.message);
        }
      }

      return ok({ deleted: true });
    }

    return bad("Choose a valid review action.");
  } catch (error) {
    console.error("Review admin failed:", error);
    return bad(error.message || "The review admin request failed.", 500);
  }
};
