import { createClient } from "@/lib/supabase/server";
import type { Class, ProfilePublic } from "@/lib/types/database";

export interface MarketplaceClass extends Class {
  educator: ProfilePublic | null;
}

export async function getPublishedClasses(excludeUserId?: string): Promise<MarketplaceClass[]> {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, code, title, description, educator_id, price_cents, currency, is_published, published_at, created_at, updated_at",
    )
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false });

  const rows = (classes ?? []) as Class[];
  if (rows.length === 0) return [];

  let enrolledIds = new Set<string>();
  if (excludeUserId) {
    const { data: enrollments } = await supabase
      .from("class_enrollments")
      .select("class_id")
      .eq("user_id", excludeUserId);
    enrolledIds = new Set(((enrollments ?? []) as Array<{ class_id: string }>).map((e) => e.class_id));
  }

  const filtered = rows.filter((c) => !enrolledIds.has(c.id));

  const educatorIds = Array.from(
    new Set(filtered.map((c) => c.educator_id).filter((id): id is string => Boolean(id))),
  );
  let educatorMap = new Map<string, ProfilePublic>();
  if (educatorIds.length > 0) {
    const { data: educators } = await supabase
      .from("profiles_public")
      .select("id, first_name, last_name, display_name, role, is_approved")
      .in("id", educatorIds);
    educatorMap = new Map(
      ((educators ?? []) as ProfilePublic[]).map((e) => [e.id, e]),
    );
  }

  return filtered.map((c) => ({
    ...c,
    educator: c.educator_id ? (educatorMap.get(c.educator_id) ?? null) : null,
  }));
}
