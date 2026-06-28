import { createClient } from "@/lib/supabase/client";

const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const BUCKET = "rte-images";
const PUBLIC_PREFIX = "/storage/v1/object/public/rte-images/";
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DIM = 1600;
const WEBP_QUALITY = 0.85;
const CACHE_ONE_YEAR = "31536000";
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Origin-pin for embedded RTE images — the single gate the markdown renderer uses to decide whether an
 * `![](url)` is safe to render as an `<img>`. True only for an https object on OUR Supabase Storage
 * origin under the public `rte-images/` prefix. Rejects any `%` in the path (a real upload path never
 * contains one; an encoded slash/dot would pass a naive startsWith but decode into another folder). This
 * is what stops a user from embedding an arbitrary external image (tracking pixel / mixed content) — a
 * hand-typed `![](https://tracker/x.png)` simply won't render.
 */
export function isRteImageUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  if (!trimmed || !STORAGE_ORIGIN) return false;
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.pathname.includes("%")) return false;
  return u.origin === STORAGE_ORIGIN && u.pathname.startsWith(PUBLIC_PREFIX);
}

export interface RteImageUploadResult {
  url?: string;
  error?: string;
}

/**
 * Downscale to <=MAX_DIM on the longest edge and re-encode as WEBP (egress/storage cost control).
 * Returns null on any failure so the caller falls back to the original file untouched.
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

/**
 * Upload an embedded image to `rte-images/{uploaderId}/...` and return its public URL. The path's first
 * segment must equal the uploader's auth.uid() (storage RLS enforces it). Used by the markdown editor's
 * image button across the forum (and later announcements).
 */
export async function uploadRteImage(file: File, uploaderId: string): Promise<RteImageUploadResult> {
  const baseExt = EXT[file.type];
  if (!baseExt) return { error: "Use a PNG, JPG, or WEBP image." };
  if (file.size > MAX_BYTES) return { error: "Image must be 5 MB or smaller." };

  const optimized = await optimizeImage(file);
  const blob: Blob = optimized?.blob ?? file;
  const ext = optimized?.ext ?? baseExt;
  const contentType = optimized?.contentType ?? file.type;
  if (blob.size > MAX_BYTES) return { error: "Image must be 5 MB or smaller." };

  const supabase = createClient();
  const path = `${uploaderId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    cacheControl: CACHE_ONE_YEAR,
    upsert: false,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
