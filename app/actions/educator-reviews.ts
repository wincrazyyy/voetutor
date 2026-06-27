"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getProfileById } from "@/lib/queries/profile";
import { getEducatorProfile } from "@/lib/queries/educator-profiles";
import { getReviewsForEducatorManage } from "@/lib/queries/educator-reviews";
import { capabilitiesFor } from "@/lib/tiers/capabilities";
import { REVIEW_LIMITS } from "@/lib/profile/review-limits";

export interface ReviewActionState {
  error?: string;
}

export interface ImportedReviewInput {
  /** Set only by the admin-assist path; ignored for educators (they always act on themselves). */
  educatorId?: string;
  rating: number;
  comment: string;
  firstName?: string;
  lastName?: string;
  school?: string;
}

interface ResolvedTarget {
  isAdmin: boolean;
  targetId: string;
}

/**
 * Resolve the educator a review belongs to. Educators always act on themselves; an admin may pass an
 * explicit educatorId to assist an import. Everything downstream (cap, insert educator_id, revalidate)
 * keys off targetId, never the caller, so the admin path writes the right row.
 */
async function resolveTarget(inputEducatorId?: string): Promise<ResolvedTarget | ReviewActionState> {
  const me = await getCurrentProfile();
  if (!me) return { error: "Sign in required." };
  const isAdmin = me.role === "admin";
  if (!isAdmin && me.role !== "educator") return { error: "Only educators have reviews." };

  if (isAdmin && inputEducatorId && inputEducatorId !== me.id) {
    const target = await getProfileById(inputEducatorId);
    if (!target) return { error: "Educator not found." };
    if (target.role !== "educator" && target.role !== "admin") {
      return { error: "Reviews can only be added for educators." };
    }
    return { isAdmin, targetId: inputEducatorId };
  }
  return { isAdmin, targetId: me.id };
}

function cleanName(value: string | undefined, max: number): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

export async function addImportedReviewAction(input: ImportedReviewInput): Promise<ReviewActionState> {
  const r = await resolveTarget(input.educatorId);
  if (!("targetId" in r)) return r;
  const { targetId } = r;

  const comment = input.comment?.trim() ?? "";
  if (!comment) return { error: "A review needs a comment." };
  if (comment.length > REVIEW_LIMITS.commentMax) {
    return { error: `Keep the comment under ${REVIEW_LIMITS.commentMax} characters.` };
  }
  const rating = Math.min(REVIEW_LIMITS.ratingMax, Math.max(REVIEW_LIMITS.ratingMin, Math.round(input.rating)));
  if (!Number.isFinite(rating)) return { error: "Choose a star rating from 1 to 5." };

  /* Tier cap is read from the TARGET educator's profile (Profile has no tier). */
  const targetProfile = await getEducatorProfile(targetId);
  const cap = capabilitiesFor(targetProfile?.tier).maxReviews;
  const existing = await getReviewsForEducatorManage(targetId);
  if (existing.length >= cap) return { error: `Review limit (${cap}) reached.` };

  const supabase = await createClient();
  const { error } = await supabase.from("educator_reviews").insert({
    educator_id: targetId,
    source: "imported",
    rating,
    comment,
    reviewer_first_name: cleanName(input.firstName, REVIEW_LIMITS.nameMax),
    reviewer_last_name: cleanName(input.lastName, REVIEW_LIMITS.nameMax),
    reviewer_school: cleanName(input.school, REVIEW_LIMITS.schoolMax),
  });
  if (error) return { error: error.message };

  revalidatePath(`/educators/${targetId}`);
  return {};
}

export interface UpdateImportedReviewInput extends ImportedReviewInput {
  reviewId: string;
}

export async function updateImportedReviewAction(input: UpdateImportedReviewInput): Promise<ReviewActionState> {
  const r = await resolveTarget(input.educatorId);
  if (!("targetId" in r)) return r;
  const { targetId } = r;

  const comment = input.comment?.trim() ?? "";
  if (!comment) return { error: "A review needs a comment." };
  if (comment.length > REVIEW_LIMITS.commentMax) {
    return { error: `Keep the comment under ${REVIEW_LIMITS.commentMax} characters.` };
  }
  const rating = Math.min(REVIEW_LIMITS.ratingMax, Math.max(REVIEW_LIMITS.ratingMin, Math.round(input.rating)));

  const supabase = await createClient();
  const { error } = await supabase
    .from("educator_reviews")
    .update({
      rating,
      comment,
      reviewer_first_name: cleanName(input.firstName, REVIEW_LIMITS.nameMax),
      reviewer_last_name: cleanName(input.lastName, REVIEW_LIMITS.nameMax),
      reviewer_school: cleanName(input.school, REVIEW_LIMITS.schoolMax),
    })
    .eq("id", input.reviewId);
  if (error) return { error: error.message };

  revalidatePath(`/educators/${targetId}`);
  return {};
}

export async function deleteReviewAction(input: {
  reviewId: string;
  educatorId?: string;
}): Promise<ReviewActionState> {
  const r = await resolveTarget(input.educatorId);
  if (!("targetId" in r)) return r;
  const { targetId } = r;

  const supabase = await createClient();
  const { error } = await supabase.from("educator_reviews").delete().eq("id", input.reviewId);
  if (error) return { error: error.message };

  revalidatePath(`/educators/${targetId}`);
  return {};
}

/** Admin-only visibility toggle. The set_review_visibility RPC enforces the admin check server-side. */
export async function setReviewVisibilityAction(input: {
  reviewId: string;
  visible: boolean;
  educatorId?: string;
}): Promise<ReviewActionState> {
  const r = await resolveTarget(input.educatorId);
  if (!("targetId" in r)) return r;
  const { isAdmin, targetId } = r;
  if (!isAdmin) return { error: "Only admins can hide or show reviews." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_review_visibility", {
    p_review_id: input.reviewId,
    p_visible: input.visible,
  });
  if (error) return { error: error.message };

  revalidatePath(`/educators/${targetId}`);
  return {};
}
