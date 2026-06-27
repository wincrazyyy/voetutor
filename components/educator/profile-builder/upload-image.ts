import { createClient } from "@/lib/supabase/client";

/**
 * Uploads a profile image to the public `educator-assets` bucket under the educator's own prefix
 * (`{educatorId}/...`), which the storage RLS and the renderer's origin-pin both key on. Returns the
 * public URL.
 *
 * Before upload the image is downscaled to <=MAX_DIM on its longest edge and re-encoded as WEBP — this
 * is the storage + egress cost control: a 4 MB phone photo lands as ~150–400 KB. Type + size of the
 * ORIGINAL are validated first for a friendly error; the remote bucket enforces the same size cap as a
 * backstop. Uploads are cached for a year (filenames are unique UUIDs, so the object is immutable).
 */
const BUCKET = "educator-assets";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIM = 1600;
const WEBP_QUALITY = 0.85;
const CACHE_ONE_YEAR = "31536000";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export interface UploadResult {
  url?: string;
  error?: string;
}

/**
 * Downscale to <=MAX_DIM on the longest edge and re-encode as WEBP. Returns null on any failure so the
 * caller falls back to uploading the original file untouched (upload never breaks on an odd image).
 */
async function optimizeImage(file: File): Promise<{ blob: Blob; ext: string; contentType: string } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/webp", WEBP_QUALITY),
    );
    if (!blob || blob.type !== "image/webp") return null;
    return { blob, ext: "webp", contentType: "image/webp" };
  } catch {
    return null;
  }
}

export async function uploadEducatorImage(
  file: File,
  educatorId: string,
  kind: "avatar" | "photo",
): Promise<UploadResult> {
  const baseExt = EXT[file.type];
  if (!baseExt) return { error: "Use a PNG, JPG, or WEBP image." };
  if (file.size > MAX_BYTES) return { error: "Image must be 5 MB or smaller." };

  const optimized = await optimizeImage(file);
  const blob: Blob = optimized?.blob ?? file;
  const ext = optimized?.ext ?? baseExt;
  const contentType = optimized?.contentType ?? file.type;
  if (blob.size > MAX_BYTES) return { error: "Image must be 5 MB or smaller." };

  const supabase = createClient();
  const path = `${educatorId}/${kind}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    cacheControl: CACHE_ONE_YEAR,
    upsert: false,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
