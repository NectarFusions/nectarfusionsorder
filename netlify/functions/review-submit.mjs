import { randomUUID } from "node:crypto";
import { db, ok, bad } from "./_square.mjs";

const IMAGE_BUCKET = "review-images";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const text = (value) => String(value ?? "").trim();

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

export default async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);

  try {
    const form = await req.formData();

    // Honeypot: look successful to bots without creating a record.
    if (text(form.get("website"))) {
      return ok({ submitted: true });
    }

    const startedAt = Number(form.get("formStartedAt"));
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < 900) {
      return bad("Please take a moment to finish your review before sending it.");
    }

    const displayName = text(form.get("displayName"));
    const email = text(form.get("email")).toLowerCase();
    const productText = text(form.get("productText"));
    const title = text(form.get("title"));
    const body = text(form.get("body"));
    const flavorId = text(form.get("flavorId"));
    const rating = Number.parseInt(form.get("rating"), 10);
    const image = form.get("image");

    if (!displayName) return bad("Your name is required.");
    if (displayName.length > 120) return bad("Please shorten the name shown with your review.");
    if (!email || !EMAIL_RE.test(email) || email.length > 320) {
      return bad("Enter a valid email address.");
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return bad("Choose a bee rating from 1 to 5.");
    }
    if (!body) return bad("Your review is required.");
    if (title.length > 180) return bad("Please shorten the review title.");
    if (productText.length > 220) return bad("Please shorten the product or flavor description.");
    if (flavorId && !UUID_RE.test(flavorId)) return bad("Choose a valid flavor.");

    const supa = db();
    if (flavorId) {
      const { data: flavor, error: flavorError } = await supa.from("flavors").select("id").eq("id", flavorId).maybeSingle();
      if (flavorError) throw new Error(flavorError.message);
      if (!flavor) return bad("That flavor is no longer listed.");
    }
    const id = randomUUID();
    let imagePath = null;

    try {
      imagePath = await uploadImage(supa, id, image);

      const { error } = await supa.from("reviews").insert({
        id,
        display_name: displayName,
        email,
        rating,
        title: title || null,
        body,
        product_text: productText || null,
        flavor_id: flavorId || null,
        image_bucket: imagePath ? IMAGE_BUCKET : null,
        image_path: imagePath,
        status: "pending",
        source: "customer",
      });

      if (error) throw new Error(error.message);
    } catch (error) {
      if (imagePath) {
        await supa.storage.from(IMAGE_BUCKET).remove([imagePath]).catch(() => {});
      }
      throw error;
    }

    return ok({
      submitted: true,
      message: "Your review was submitted for NectarFusions approval.",
    });
  } catch (error) {
    console.error("Review submission failed:", error);
    const message = String(error?.message || "");

    if (
      message.includes("PNG") ||
      message.includes("2 MB") ||
      message.includes("valid email") ||
      message.includes("required") ||
      message.includes("bee rating") ||
      message.includes("shorten") ||
      message.includes("moment")
    ) {
      return bad(message);
    }

    return bad("Your review could not be submitted. Please try again.", 500);
  }
};
