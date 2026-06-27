import { createClient } from "@/lib/supabase/server";
import type { EducatorProfile, PublicEducatorProfile } from "@/lib/types/database";

const SELECT_COLUMNS =
  "educator_id, gender, whatsapp_number, education, education_degree, education_major, graduation_year, teaching_experience, teaching_subjects, self_introduction, avatar_url, role_label, headline, hourly_rate_cents, subject_tags, profile_doc, is_published, published_at, tier, slug, is_verified, verified_by, verified_at, created_at, updated_at";

export async function getEducatorProfile(educatorId: string): Promise<EducatorProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("educator_profiles")
    .select(SELECT_COLUMNS)
    .eq("educator_id", educatorId)
    .maybeSingle();
  return (data as EducatorProfile | null) ?? null;
}

export async function getEducatorProfilesByIds(educatorIds: string[]): Promise<Record<string, EducatorProfile>> {
  if (educatorIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("educator_profiles").select(SELECT_COLUMNS).in("educator_id", educatorIds);
  const map: Record<string, EducatorProfile> = {};
  for (const row of (data ?? []) as EducatorProfile[]) {
    map[row.educator_id] = row;
  }
  return map;
}

/**
 * Public read of a *published, approved* educator's profile via the SECURITY DEFINER RPC.
 * Returns only public-safe columns; null for unpublished / unapproved / non-existent. Works for anon.
 */
export async function getPublicEducatorProfile(educatorId: string): Promise<PublicEducatorProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .rpc("get_public_educator_profile", { p_educator_id: educatorId })
    .maybeSingle();
  return (data as PublicEducatorProfile | null) ?? null;
}
