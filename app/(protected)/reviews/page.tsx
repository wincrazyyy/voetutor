import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { getReviewsForEducatorManage } from "@/lib/queries/educator-reviews";
import { capabilitiesFor } from "@/lib/tiers/capabilities";
import { ReviewsManager } from "@/components/educator/reviews-manager";

export default async function ReviewsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/auth/login");
  if (profile.role !== "educator" && profile.role !== "admin") redirect("/dashboard");
  if (profile.role === "educator" && !profile.is_approved) redirect("/pending");

  const ep = await getEducatorProfile(profile.id);
  const reviews = await getReviewsForEducatorManage(profile.id);
  const maxReviews = capabilitiesFor(ep?.tier).maxReviews;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="text-xl font-black text-foreground">Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Add testimonials from students you&apos;ve taught. They appear on your public profile.
        </p>
      </div>
      <ReviewsManager reviews={reviews} educatorId={profile.id} maxReviews={maxReviews} />
    </div>
  );
}
