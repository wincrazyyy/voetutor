import type { ImageItem } from "@/lib/types/profile-doc";
import { cn } from "@/lib/utils";
import { isOwnEducatorAssetUrl } from "@/lib/profile/asset-url";
import { gridClass } from "./grid";

/**
 * An image renders only when its URL is on our Supabase Storage origin AND under the educator's own
 * `educator-assets/{educatorId}/` prefix (and free of percent-encoded path tricks). Off-origin /
 * other-educator / placeholder (empty) URLs are dropped at render — the load-bearing per-educator
 * origin pin (plans/educator-profile.md §7/§8.4). Shared with the save action + validator.
 */
export function imageAllowed(url: string, educatorId: string): boolean {
  return isOwnEducatorAssetUrl(url, educatorId);
}

export function photosHaveRenderable(images: ImageItem[], educatorId: string): boolean {
  return images.some((im) => imageAllowed(im.url, educatorId));
}

export function PhotosBlock({ images, educatorId }: { images: ImageItem[]; educatorId: string }) {
  const safe = images.filter((im) => imageAllowed(im.url, educatorId));
  if (!safe.length) return null;
  const single = safe.length === 1;
  const cols = Math.min(safe.length, 3) as 1 | 2 | 3;
  return (
    <div className={cn("grid gap-4", single ? "mx-auto max-w-md grid-cols-1" : gridClass(cols))}>
      {safe.map((im) => (
        <figure
          key={im.id}
          className="group overflow-hidden rounded-[var(--radius)] border border-border bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={im.url}
            alt={im.alt}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:brightness-105"
          />
          {im.caption ? (
            <figcaption className="p-2 text-center text-xs text-muted-foreground">{im.caption}</figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
