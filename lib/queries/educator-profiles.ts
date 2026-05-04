import { createClient } from "@/lib/supabase/server";
import type { EducatorProfile } from "@/lib/types/database";

const SELECT_COLUMNS =
  "educator_id, gender, whatsapp_number, education, education_degree, education_major, graduation_year, teaching_experience, teaching_subjects, self_introduction, created_at, updated_at";

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
  const { data } = await supabase
    .from("educator_profiles")
    .select(SELECT_COLUMNS)
    .in("educator_id", educatorIds);
  const map: Record<string, EducatorProfile> = {};
  for (const row of (data ?? []) as EducatorProfile[]) {
    map[row.educator_id] = row;
  }
  return map;
}
