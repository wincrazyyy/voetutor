"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { ANNOUNCEMENT_LIMITS } from "@/lib/announcements/limits";
import type { AnnouncementType } from "@/lib/types/database";

export interface AnnouncementActionState {
  error?: string;
}

export interface AnnouncementInput {
  classId: string;
  title: string;
  content: string;
  type: AnnouncementType;
  linkTitle?: string | null;
  linkUrl?: string | null;
  /** ISO instant (client converts the datetime-local picker to UTC); only kept for event-type. */
  eventAt?: string | null;
}

const TYPES: AnnouncementType[] = ["standard", "important", "event"];

interface CleanInput {
  title: string;
  content: string;
  type: AnnouncementType;
  link_title: string | null;
  link_url: string | null;
  event_at: string | null;
}

function validate(input: AnnouncementInput): CleanInput | { error: string } {
  const title = input.title.trim();
  if (title.length < ANNOUNCEMENT_LIMITS.titleMin) return { error: "Title is required." };
  if (title.length > ANNOUNCEMENT_LIMITS.titleMax) return { error: `Title must be ${ANNOUNCEMENT_LIMITS.titleMax} characters or fewer.` };

  const content = input.content.trim();
  if (content.length < ANNOUNCEMENT_LIMITS.bodyMin) return { error: "Content is required." };
  if (content.length > ANNOUNCEMENT_LIMITS.bodyMax) return { error: `Content must be ${ANNOUNCEMENT_LIMITS.bodyMax} characters or fewer.` };

  if (!TYPES.includes(input.type)) return { error: "Invalid announcement type." };

  const linkUrl = input.linkUrl?.trim() || null;
  if (linkUrl && !/^https:\/\//i.test(linkUrl)) return { error: "Link URL must start with https://" };
  if (linkUrl && linkUrl.length > 2048) return { error: "Link URL is too long." };
  const linkTitle = linkUrl ? (input.linkTitle?.trim() || null) : null;
  if (linkTitle && linkTitle.length > 255) return { error: "Link title is too long." };

  let eventAt: string | null = null;
  if (input.type === "event" && input.eventAt) {
    const d = new Date(input.eventAt);
    if (Number.isNaN(d.getTime())) return { error: "Invalid event date." };
    eventAt = d.toISOString();
  }

  return { title, content, type: input.type, link_title: linkTitle, link_url: linkUrl, event_at: eventAt };
}

export async function createAnnouncementAction(
  input: AnnouncementInput,
): Promise<{ error?: string; id?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const clean = validate(input);
  if ("error" in clean) return clean;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      class_id: input.classId,
      author_id: profile.id,
      title: clean.title,
      content: clean.content,
      type: clean.type,
      link_title: clean.link_title,
      link_url: clean.link_url,
      event_at: clean.event_at,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const id = (data as { id: string }).id;
  /* The author has, by definition, "seen" their own announcement — mark it read so it never lights their
     own unread dot/badge (best-effort). */
  await supabase.from("announcement_reads").insert({ user_id: profile.id, announcement_id: id });

  revalidatePath(`/class/${input.classId}`);
  revalidatePath("/dashboard");
  return { id };
}

export async function updateAnnouncementAction(
  announcementId: string,
  input: AnnouncementInput,
): Promise<AnnouncementActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const clean = validate(input);
  if ("error" in clean) return clean;

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({
      title: clean.title,
      content: clean.content,
      type: clean.type,
      link_title: clean.link_title,
      link_url: clean.link_url,
      event_at: clean.event_at,
    })
    .eq("id", announcementId);

  if (error) return { error: error.message };

  revalidatePath(`/class/${input.classId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function markAnnouncementsReadAction(
  announcementIds: string[],
): Promise<AnnouncementActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (announcementIds.length === 0) return {};

  const supabase = await createClient();
  const rows = announcementIds.map((id) => ({ user_id: profile.id, announcement_id: id }));
  const { error } = await supabase
    .from("announcement_reads")
    .upsert(rows, { onConflict: "user_id,announcement_id", ignoreDuplicates: true });
  if (error) return { error: error.message };
  return {};
}

export async function deleteAnnouncementAction(
  classId: string,
  announcementId: string,
): Promise<AnnouncementActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase.from("announcements").delete().eq("id", announcementId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}`);
  revalidatePath("/dashboard");
  return {};
}
