import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EducatorProfileDoc } from "@/lib/types/profile-doc";
import { isOwnEducatorAssetUrl } from "./asset-url";

const BUCKET = "educator-assets";
const PLACEHOLDER = ".emptyFolderPlaceholder";
const PAGE = 100;

/** Every image URL the saved profile still references (avatar + photos-section images). */
export function collectReferencedAssetUrls(
  doc: EducatorProfileDoc,
  avatarUrl: string | null,
): string[] {
  const urls: string[] = [];
  if (avatarUrl) urls.push(avatarUrl);
  for (const section of doc.sections) {
    if (section.type === "photos") {
      for (const im of section.images) if (im.url) urls.push(im.url);
    }
  }
  return urls;
}

/** The object filename (under `{educatorId}/`) for one of this educator's own asset URLs, else null. */
function ownObjectName(url: string, educatorId: string): string | null {
  if (!isOwnEducatorAssetUrl(url, educatorId)) return null;
  try {
    const prefix = `/storage/v1/object/public/${BUCKET}/${educatorId}/`;
    const path = new URL(url).pathname;
    if (!path.startsWith(prefix)) return null;
    const name = path.slice(prefix.length);
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Delete every object under `educator-assets/{educatorId}/` that the saved profile no longer
 * references — the unbounded-storage backstop. Best-effort: never throws, so a cleanup hiccup can't
 * fail the educator's save. Caller passes a Supabase client whose session can list + delete that
 * prefix (the owning educator, or — after the admin-read/-delete policies — an admin).
 */
export async function cleanupEducatorAssetOrphans(
  supabase: SupabaseClient,
  educatorId: string,
  referencedUrls: string[],
): Promise<{ removed: number }> {
  try {
    const keep = new Set<string>();
    for (const url of referencedUrls) {
      const name = ownObjectName(url, educatorId);
      if (name) keep.add(name);
    }

    const toRemove: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(educatorId, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) break;
      for (const obj of data) {
        if (!obj.name || obj.name === PLACEHOLDER) continue;
        if (!keep.has(obj.name)) toRemove.push(`${educatorId}/${obj.name}`);
      }
      if (data.length < PAGE) break;
    }

    if (toRemove.length) {
      await supabase.storage.from(BUCKET).remove(toRemove);
    }
    return { removed: toRemove.length };
  } catch {
    return { removed: 0 };
  }
}
