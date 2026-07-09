import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/images/compress-image";

const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const BUCKET = "rte-images";
const PUBLIC_PREFIX = "/storage/v1/object/public/rte-images/";
const CACHE_ONE_YEAR = "31536000";

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
 * Upload an embedded image to `rte-images/{uploaderId}/...` and return its public URL. The path's first
 * segment must equal the uploader's auth.uid() (storage RLS enforces it). Used by the markdown editor's
 * image button across the forum and announcements. The image is compressed to WEBP under the size cap
 * first (prepareImageForUpload) — egress/storage cost control, and so a large image just works.
 */
export async function uploadRteImage(file: File, uploaderId: string): Promise<RteImageUploadResult> {
  const prepared = await prepareImageForUpload(file);
  if ("error" in prepared) return { error: prepared.error };

  const supabase = createClient();
  const path = `${uploaderId}/${crypto.randomUUID()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    cacheControl: CACHE_ONE_YEAR,
    upsert: false,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
