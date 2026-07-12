import { createClient } from "@/lib/supabase/server";
import type { Announcement, ProfilePublic } from "@/lib/types/database";

export interface AnnouncementWithAuthor extends Announcement {
  author: ProfilePublic | null;
  class_code: string | null;
  has_read: boolean;
  /** Audience label when the announcement targets an Access Pass (null = broadcast). */
  pass_name: string | null;
}

const ANNOUNCEMENT_SELECT =
  "id, class_id, author_id, title, content, type, link_title, link_url, image_alt, image_url, event_at, pass_id, created_at, updated_at, classes!inner(code), class_passes(name), author:profiles_public!announcements_author_id_fkey(id, first_name, last_name, display_name, role, is_approved, avatar_url)";

type RawRow = Announcement & {
  classes: { code: string } | null;
  class_passes: { name: string } | null;
  author: ProfilePublic | null;
};

async function getReadIds(announcementIds: string[], userId: string | null): Promise<Set<string>> {
  if (!userId || announcementIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("user_id", userId)
    .in("announcement_id", announcementIds);
  return new Set(((data ?? []) as Array<{ announcement_id: string }>).map((r) => r.announcement_id));
}

async function decorate(rows: RawRow[], userId: string | null): Promise<AnnouncementWithAuthor[]> {
  const readIds = await getReadIds(rows.map((r) => r.id), userId);
  return rows.map((r) => ({
    ...r,
    class_code: r.classes?.code ?? null,
    author: r.author ?? null,
    has_read: readIds.has(r.id),
    pass_name: r.class_passes?.name ?? null,
  }));
}

export async function getAnnouncementById(id: string): Promise<Announcement | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("id, class_id, author_id, title, content, type, link_title, link_url, image_alt, image_url, event_at, pass_id, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Announcement | null) ?? null;
}

export async function getAnnouncementsForUser(limit = 20): Promise<AnnouncementWithAuthor[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  return decorate((data ?? []) as unknown as RawRow[], user.id);
}

export async function getAnnouncementsForClass(classId: string, limit = 20): Promise<AnnouncementWithAuthor[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return decorate((data ?? []) as unknown as RawRow[], user?.id ?? null);
}

/** Unread announcement counts keyed by class, scoped to the given class ids (the sidebar's classes). */
export async function getUnreadAnnouncementCountsByClass(
  userId: string,
  classIds: string[],
): Promise<Map<string, number>> {
  if (classIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("announcements").select("id, class_id").in("class_id", classIds);
  const rows = (data ?? []) as Array<{ id: string; class_id: string }>;
  const readIds = await getReadIds(rows.map((r) => r.id), userId);
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!readIds.has(r.id)) counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1);
  }
  return counts;
}
