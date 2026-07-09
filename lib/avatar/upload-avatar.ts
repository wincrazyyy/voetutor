import { createClient } from "@/lib/supabase/client";
import { prepareImageForUpload } from "@/lib/images/compress-image";

/**
 * Uploads an account avatar to the PUBLIC owner-keyed `avatars` bucket under `{userId}/...` (storage RLS
 * keys write on that first folder segment matching auth.uid()). Returns the public URL, which
 * updateAvatarAction then origin-pins (isOwnAvatarUrl) before writing profiles.avatar_url.
 *
 * The image is compressed to WEBP under the size cap first (prepareImageForUpload) — storage + egress
 * cost control, and so a large photo uploads without the user hunting for a compressor tool. Mirrors
 * lib/forum/rte-image.ts (the app's other any-authenticated-user, owner-keyed public uploader).
 */
const BUCKET = "avatars";
const CACHE_ONE_YEAR = "31536000";

export interface UploadAvatarResult {
  url?: string;
  error?: string;
}

export async function uploadUserAvatar(file: File, userId: string): Promise<UploadAvatarResult> {
  const prepared = await prepareImageForUpload(file);
  if ("error" in prepared) return { error: prepared.error };

  const supabase = createClient();
  const path = `${userId}/avatar-${crypto.randomUUID()}.${prepared.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.blob, {
    contentType: prepared.contentType,
    cacheControl: CACHE_ONE_YEAR,
    upsert: false,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}
