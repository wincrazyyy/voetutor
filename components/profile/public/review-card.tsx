import { getInitials, relativeTime } from "@/lib/utils/format";
import { imageAllowed } from "@/components/profile/render/photos";
import type { PublicEducatorReview } from "@/lib/types/database";

import { StarRating } from "./star-rating";

/**
 * One testimonial on the public profile (server component). Borderless, hairline-divided list item to
 * match the profile's editorial body. Imported reviews carry a neutral "Imported" pill (never gold —
 * gold signals the verified educator badge) so a visitor knows the testimonial is unverified. A
 * reviewer photo renders only when it passes the per-educator origin pin; otherwise initials.
 */
export function ReviewCard({
  review,
  educatorId,
}: {
  review: PublicEducatorReview;
  educatorId: string;
}) {
  const imageOk = Boolean(review.reviewer_image_url && imageAllowed(review.reviewer_image_url, educatorId));
  const name = review.reviewer_name;
  const isImported = review.source === "imported";

  return (
    <article className="flex gap-4">
      {imageOk && review.reviewer_image_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={review.reviewer_image_url}
          alt={name}
          className="h-11 w-11 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {getInitials(null, null, name)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-foreground">{name}</span>
          {review.reviewer_school ? (
            <span className="truncate text-sm text-muted-foreground">· {review.reviewer_school}</span>
          ) : null}
          {isImported ? (
            <span
              title="An external testimonial added by the educator — not a verified platform review."
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            >
              Imported
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <StarRating rating={review.rating} />
          <span className="text-xs text-muted-foreground">{relativeTime(review.created_at)}</span>
        </div>

        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
          {review.comment}
        </p>
      </div>
    </article>
  );
}
