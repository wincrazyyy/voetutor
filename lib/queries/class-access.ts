import { createClient } from "@/lib/supabase/server";
import type { ClassPass, ClassPassItem, EnrollmentAccess } from "@/lib/types/database";

/** A pass with the counts the manage UI renders (item summary, holder count,
 *  targeted-announcement count). RLS-gated: only the class educator / admin sees rows. */
export interface ClassPassSummary extends ClassPass {
  items: ClassPassItem[];
  holder_count: number;
  announcement_count: number;
}

/** One roster row's access: the enrollment scope plus the passes the student holds. */
export interface StudentAccess {
  scope: EnrollmentAccess;
  passes: Array<{ id: string; name: string }>;
}

/**
 * Every Access Pass of a class (newest first) with its items and holder /
 * targeted-announcement counts. Educator/admin management read — students get an
 * empty list via RLS (they can only read passes they hold, and never the items).
 */
export async function getClassPasses(classId: string): Promise<ClassPassSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_passes")
    .select("id, class_id, name, description, created_by, created_at, updated_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  const passes = (data ?? []) as ClassPass[];
  if (passes.length === 0) return [];
  const passIds = passes.map((p) => p.id);

  const [{ data: items }, { data: holders }, { data: announcements }] = await Promise.all([
    supabase
      .from("class_pass_items")
      .select("id, pass_id, topic_id, subtopic_id, video_id, resource_id, created_at")
      .in("pass_id", passIds),
    supabase.from("class_pass_holders").select("pass_id").in("pass_id", passIds),
    supabase.from("announcements").select("id, pass_id").in("pass_id", passIds),
  ]);

  const itemsByPass = new Map<string, ClassPassItem[]>();
  for (const item of (items ?? []) as ClassPassItem[]) {
    const list = itemsByPass.get(item.pass_id) ?? [];
    list.push(item);
    itemsByPass.set(item.pass_id, list);
  }
  const holderCounts = new Map<string, number>();
  for (const h of (holders ?? []) as Array<{ pass_id: string }>) {
    holderCounts.set(h.pass_id, (holderCounts.get(h.pass_id) ?? 0) + 1);
  }
  const announcementCounts = new Map<string, number>();
  for (const a of (announcements ?? []) as Array<{ id: string; pass_id: string | null }>) {
    if (a.pass_id) announcementCounts.set(a.pass_id, (announcementCounts.get(a.pass_id) ?? 0) + 1);
  }

  return passes.map((p) => ({
    ...p,
    items: itemsByPass.get(p.id) ?? [],
    holder_count: holderCounts.get(p.id) ?? 0,
    announcement_count: announcementCounts.get(p.id) ?? 0,
  }));
}

/** The items of one pass (educator/admin read; RLS returns nothing to students). */
export async function getPassItems(passId: string): Promise<ClassPassItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("class_pass_items")
    .select("id, pass_id, topic_id, subtopic_id, video_id, resource_id, created_at")
    .eq("pass_id", passId);
  return (data ?? []) as ClassPassItem[];
}

/**
 * Per-student access for the roster: enrollment scope + held pass chips.
 * Educator/admin read (both queries are RLS-gated to the class educator / admin,
 * plus the student's own rows, which is harmless here).
 */
export async function getRosterAccessMap(classId: string): Promise<Map<string, StudentAccess>> {
  const supabase = await createClient();
  const [{ data: enrollments }, { data: holders }] = await Promise.all([
    supabase.from("class_enrollments").select("user_id, access_scope").eq("class_id", classId),
    supabase
      .from("class_pass_holders")
      .select("user_id, pass_id, class_passes(name)")
      .eq("class_id", classId),
  ]);

  const map = new Map<string, StudentAccess>();
  for (const e of (enrollments ?? []) as Array<{ user_id: string; access_scope: EnrollmentAccess }>) {
    map.set(e.user_id, { scope: e.access_scope, passes: [] });
  }
  for (const h of (holders ?? []) as unknown as Array<{
    user_id: string;
    pass_id: string;
    class_passes: { name: string } | null;
  }>) {
    const entry = map.get(h.user_id);
    if (entry) entry.passes.push({ id: h.pass_id, name: h.class_passes?.name ?? "Pass" });
  }
  return map;
}

/**
 * The caller's own access to one class: scope + held pass names. Drives the
 * scoped-access banner on the student class view; a full student gets
 * { scope: "full", passes: [] } and the banner renders nothing.
 */
export async function getMyClassAccess(classId: string, userId: string): Promise<StudentAccess | null> {
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("class_enrollments")
    .select("access_scope")
    .eq("class_id", classId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!enrollment) return null;

  const scope = (enrollment as { access_scope: EnrollmentAccess }).access_scope;
  if (scope === "full") return { scope, passes: [] };

  const { data: holders } = await supabase
    .from("class_pass_holders")
    .select("pass_id, class_passes(name)")
    .eq("class_id", classId)
    .eq("user_id", userId);

  return {
    scope,
    passes: ((holders ?? []) as unknown as Array<{
      pass_id: string;
      class_passes: { name: string } | null;
    }>).map((h) => ({ id: h.pass_id, name: h.class_passes?.name ?? "Pass" })),
  };
}
