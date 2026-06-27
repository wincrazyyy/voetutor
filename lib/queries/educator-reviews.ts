import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/utils/format";
import type { EducatorReview, PublicEducatorReview, ReviewSource } from "@/lib/types/database";

/** Fields needed to project a review down to its public shape — shared by the RPC row and a manage row. */
interface ReviewProjectable {
  id: string;
  rating: number;
  comment: string;
  reviewer_first_name: string | null;
  reviewer_last_name: string | null;
  reviewer_school: string | null;
  reviewer_image_url: string | null;
  source: ReviewSource;
  created_at: string;
}

function toPublicReview(r: ReviewProjectable): PublicEducatorReview {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    reviewer_name: getDisplayName(r.reviewer_first_name, r.reviewer_last_name, null),
    reviewer_school: r.reviewer_school,
    reviewer_image_url: r.reviewer_image_url,
    source: r.source,
    created_at: r.created_at,
  };
}

/**
 * Public anon-capable read for the profile page, via the SECURITY DEFINER RPC. Returns only visible
 * reviews of a published, approved educator, newest first; collapses the split name columns to one
 * display name.
 */
export async function getPublicEducatorReviews(educatorId: string): Promise<PublicEducatorReview[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_public_educator_reviews", { p_educator_id: educatorId });
  return ((data ?? []) as ReviewProjectable[]).map(toPublicReview);
}

/**
 * Owner / admin manage read — includes hidden reviews. Throws on error instead of swallowing to []
 * so an RLS rejection is never silently rendered as "no reviews".
 */
export async function getReviewsForEducatorManage(educatorId: string): Promise<EducatorReview[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("educator_reviews")
    .select(
      "id, educator_id, student_id, source, rating, comment, reviewer_first_name, reviewer_last_name, reviewer_school, reviewer_image_url, is_visible, created_at, updated_at",
    )
    .eq("educator_id", educatorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load reviews: ${error.message}`);
  return (data as EducatorReview[]) ?? [];
}

/**
 * Project owner-manage rows to the public shape for the OWNER PREVIEW of an unpublished profile (the
 * public RPC returns nothing there). Filters to visible rows so the draft preview matches the
 * published page.
 */
export function manageReviewsToPublic(rows: EducatorReview[]): PublicEducatorReview[] {
  return rows.filter((r) => r.is_visible).map(toPublicReview);
}
