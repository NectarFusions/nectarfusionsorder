import { db, ok, bad } from "./_square.mjs";

async function signedImageUrl(supa, row) {
  if (!row.image_path) return null;

  const bucket = row.image_bucket || "review-images";
  const { data, error } = await supa.storage
    .from(bucket)
    .createSignedUrl(row.image_path, 60 * 60);

  if (error) {
    console.error("Could not sign review image:", error.message);
    return null;
  }

  return data?.signedUrl || null;
}

export default async (req) => {
  if (req.method !== "GET") return bad("GET only", 405);

  try {
    const supa = db();
    const { data, error } = await supa
      .from("reviews")
      .select(
        "id,display_name,rating,title,body,product_text,image_bucket,image_path,approved_at"
      )
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);

    const reviews = await Promise.all(
      (data || []).map(async (review) => ({
        id: review.id,
        displayName: review.display_name,
        rating: review.rating,
        title: review.title || "",
        body: review.body,
        productText: review.product_text || "",
        approvedAt: review.approved_at,
        imageUrl: await signedImageUrl(supa, review),
      }))
    );

    return ok({ reviews });
  } catch (error) {
    console.error("Public review list failed:", error);
    return bad("Reviews are temporarily unavailable.", 500);
  }
};
