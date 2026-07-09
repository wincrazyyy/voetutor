import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/images/compress-image";

/**
 * Uploads a profile image to the public `educator-assets` bucket under the educator's own prefix
 * (`{educatorId}/...`), which the storage RLS and the renderer's origin-pin both key on. Returns the
 * public URL.
 *
 * The image is compressed to WEBP under the size cap first (prepareImageForUpload) — the storage +
 * egress cost control, and, crucially, so a large phone photo just uploads instead of being rejected
 * for size. Uploads are cached for a year (filenames are unique UUIDs, so the object is immutable).
 */
const BUCKET = "educator-assets";
const CACHE_ONE_YEAR = "31536000";

export interface UploadResult {
  url?: string;
  error?: string;
}

export async function uploadEducatorImage(
  file: File,
  educatorId: string,
  kind: "avatar" | "photo",
): Promise<UploadResult> {
  const prepared = await prepareImageForUpload(file);
  if ("error" in prepared) return { error: prepared.error };

  const supabase = createClient();
  const path = `${educatorId}/${kind}-${crypto.randomUUID()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    cacheControl: CACHE_ONE_YEAR,
    upsert: false,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
