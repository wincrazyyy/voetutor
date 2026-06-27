import { cn } from "@/lib/utils";
import type { PublicEducatorReview } from "@/lib/types/database";

import { ReviewCard } from "./review-card";
import { StarRating } from "./star-rating";

/** Below this many visible reviews the header aggregate is hidden — no vanity "0.0 ★" / "1 review". */
const MIN_REVIEWS_FOR_AGGREGATE = 3;

/**
 * Public reviews block (server component). Renders nothing when there are no visible reviews (the
 * no-empty-void rule). The aggregate is computed from the returned list — the public RPC returns
 * every visible review, so this equals educator_profiles.review_count / rating_sum, with no risk of a
 * hidden review leaking in. Shows the average only at MIN_REVIEWS_FOR_AGGREGATE or more.
 */
export function ReviewsSection({
  reviews,
  educatorId,
}: {
  reviews: PublicEducatorReview[];
  educatorId: string;
}) {
  if (!reviews.length) return null;

  const count = reviews.length;
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / count;
  const showAggregate = count >= MIN_REVIEWS_FOR_AGGREGATE;

  return (
    <section className="border-t border-border py-10 sm:py-12 lg:grid lg:grid-cols-[3rem_1fr] lg:gap-6">
      <div
        aria-hidden
        className="hidden text-xs font-semibold uppercase tabular-nums tracking-[0.14em] text-muted-foreground lg:block"
      >
        ★
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="font-serif text-[1.75rem] font-semibold leading-tight tracking-[-0.01em] text-foreground sm:text-3xl">
            What students say
          </h2>
          {showAggregate ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <StarRating rating={avg} label={`${avg.toFixed(1)} out of 5`} />
              <span className="font-semibold text-foreground">{avg.toFixed(1)}</span>
              <span>· {count} reviews</span>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col">
          {reviews.map((review, i) => (
            <div key={review.id} className={cn("py-6", i > 0 && "border-t border-border")}>
              <ReviewCard review={review} educatorId={educatorId} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
