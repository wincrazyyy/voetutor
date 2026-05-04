import { createClient } from "@/lib/supabase/server";
import type { Announcement, ProfilePublic } from "@/lib/types/database";

export interface AnnouncementWithAuthor extends Announcement {
  author: ProfilePublic | null;
  class_code: string | null;
}

export async function getAnnouncementsForUser(limit = 20): Promise<AnnouncementWithAuthor[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("announcements")
    .select(
      "id, class_id, author_id, title, content, type, link_title, link_url, image_alt, image_url, created_at, updated_at, classes!inner(code), author:profiles_public!announcements_author_id_fkey(id, first_name, last_name, display_name, role, is_approved)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const r = row as unknown as Announcement & {
      classes: { code: string };
      author: ProfilePublic | null;
    };
    return {
      ...r,
      class_code: r.classes?.code ?? null,
      author: r.author ?? null,
    } as AnnouncementWithAuthor;
  });
}

export async function getAnnouncementsForClass(classId: string, limit = 20): Promise<AnnouncementWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select(
      "id, class_id, author_id, title, content, type, link_title, link_url, image_alt, image_url, created_at, updated_at, classes!inner(code), author:profiles_public!announcements_author_id_fkey(id, first_name, last_name, display_name, role, is_approved)",
    )
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const r = row as unknown as Announcement & {
      classes: { code: string };
      author: ProfilePublic | null;
    };
    return {
      ...r,
      class_code: r.classes?.code ?? null,
      author: r.author ?? null,
    } as AnnouncementWithAuthor;
  });
}
