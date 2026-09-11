const INPUT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SOURCE_MAX_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 1_500_000;
const HARD_MAX_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSIONS = [1600, 1400, 1200, 1000];
const QUALITY_STEPS = [0.82, 0.76, 0.7, 0.64];

const safeStem = (name = "review-photo") =>
  String(name)
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "review-photo";

function loadBrowserImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo could not be opened. Please choose another image."));
    };

    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("That photo could not be optimized. Please choose another image."));
      },
      type,
      quality
    );
  });
}

async function encode(canvas, quality) {
  const webp = await canvasToBlob(canvas, "image/webp", quality);
  if (webp.type === "image/webp") return webp;

  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = canvas.width;
  jpegCanvas.height = canvas.height;
  const jpegContext = jpegCanvas.getContext("2d", { alpha: false });
  jpegContext.fillStyle = "#FFFFFF";
  jpegContext.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  jpegContext.drawImage(canvas, 0, 0);

  return canvasToBlob(jpegCanvas, "image/jpeg", quality);
}

export async function optimizeReviewImage(file) {
  if (!file) return null;

  if (!INPUT_TYPES.has(file.type)) {
    throw new Error("Review photos must be PNG, JPG, or WebP images.");
  }

  if (file.size > SOURCE_MAX_BYTES) {
    throw new Error("Please choose a photo smaller than 25 MB.");
  }

  const image = await loadBrowserImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("That photo could not be read. Please choose another image.");
  }

  let smallest = null;

  for (const maxDimension of MAX_DIMENSIONS) {
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    for (const quality of QUALITY_STEPS) {
      const blob = await encode(canvas, quality);
      if (!smallest || blob.size < smallest.size) smallest = blob;

      if (blob.size <= TARGET_BYTES) {
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `${safeStem(file.name)}-web.${extension}`, {
          type: blob.type,
          lastModified: Date.now(),
        });
      }
    }
  }

  if (!smallest || smallest.size > HARD_MAX_BYTES) {
    throw new Error(
      "That photo is still too large after optimization. Please choose a different photo."
    );
  }

  const extension = smallest.type === "image/webp" ? "webp" : "jpg";
  return new File([smallest], `${safeStem(file.name)}-web.${extension}`, {
    type: smallest.type,
    lastModified: Date.now(),
  });
}

export async function downloadReviewImage(url, displayName = "review") {
  if (!url) return;

  const response = await fetch(url);
  if (!response.ok) throw new Error("The review image could not be downloaded.");

  const blob = await response.blob();
  const extension =
    blob.type === "image/webp"
      ? "webp"
      : blob.type === "image/png"
        ? "png"
        : "jpg";

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${safeStem(displayName)}-review.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
