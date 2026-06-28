import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { getReviewsForEducatorManage } from "@/lib/queries/educator-reviews";
import { capabilitiesFor } from "@/lib/tiers/capabilities";
import { Button } from "@/components/ui/button";
import { ReviewsManager } from "@/components/educator/reviews-manager";
import { getDisplayName } from "@/lib/utils/format";

export default async function AdminEducatorReviewsPage({
  params,
}: {
  params: Promise<{ educatorId: string }>;
}) {
  const { educatorId } = await params;

  const me = await getCurrentProfile();
  if (!me) redirect("/auth/login");
  if (me.role !== "admin") redirect("/dashboard");

  const target = await getProfileById(educatorId);
  if (!target || (target.role !== "educator" && target.role !== "admin")) notFound();

  const ep = await getEducatorProfile(educatorId);
  const reviews = await getReviewsForEducatorManage(educatorId);
  const maxReviews = capabilitiesFor(ep?.tier).maxReviews;
  const name = getDisplayName(target.first_name, target.last_name, target.display_name);

  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Link href="/educators">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to educators
          </Button>
        </Link>
      </div>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <div className="mb-6">
          <h1 className="text-xl font-black text-foreground">Reviews — {name}</h1>
          <p className="text-sm text-muted-foreground">
            Add, edit, hide, or remove this educator&apos;s reviews.
          </p>
        </div>
        <ReviewsManager reviews={reviews} educatorId={educatorId} maxReviews={maxReviews} adminEdit />
      </div>
    </div>
  );
}
