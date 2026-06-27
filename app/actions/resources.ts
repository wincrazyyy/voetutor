"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import type { Profile } from "@/lib/types/database";

const BUCKET = "class-resources";
const STORAGE_MARKER = `/storage/v1/object/${BUCKET}/`;

export interface ResourceActionState {
  error?: string;
  ok?: boolean;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireEducator(): Promise<{ profile: Profile } | { error: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage resources." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }
  return { profile };
}

/**
 * Friendly-error ownership check. RLS (resources_modify_educator_or_admin and the
 * storage policies) is the real guard; this turns the common "not your class" case
 * into a clean message rather than a raw row-level-security violation.
 */
async function ownsClass(
  supabase: SupabaseServerClient,
  classId: string,
  profile: Profile,
): Promise<boolean> {
  if (profile.role === "admin") return true;
  const { data } = await supabase
    .from("classes")
    .select("educator_id")
    .eq("id", classId)
    .maybeSingle();
  return (data as { educator_id: string | null } | null)?.educator_id === profile.id;
}

/**
 * Registers a resources row for a PDF the client already uploaded to the
 * class-resources bucket. The file bytes never pass through this action (the
 * browser uploads straight to storage under the educator's own RLS), so the
 * Next.js server-action body limit is irrelevant. The storage path is validated
 * to live under {classId}/ and the parent topic/subtopic is confirmed to belong
 * to that same class, keeping the object's read boundary aligned with its row.
 */
export async function createResourceAction(
  classId: string,
  parentType: "topic" | "subtopic",
  parentId: string,
  title: string,
  storagePath: string,
  sizeBytes: number,
): Promise<ResourceActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const cleanTitle = title.trim();
  if (!cleanTitle) return { error: "A title is required." };
  if (cleanTitle.length > 255) return { error: "Title must be 255 characters or fewer." };
  if (parentType !== "topic" && parentType !== "subtopic") {
    return { error: "Invalid resource target." };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return { error: "Invalid file." };
  if (
    !storagePath.startsWith(`${classId}/`) ||
    !storagePath.toLowerCase().endsWith(".pdf") ||
    storagePath.includes("..")
  ) {
    return { error: "Invalid upload path." };
  }

  const supabase = await createClient();
  if (!(await ownsClass(supabase, classId, auth.profile))) {
    return { error: "You don't have permission to edit this class." };
  }

  let parentClassId: string | null = null;
  if (parentType === "topic") {
    const { data } = await supabase
      .from("topics")
      .select("class_id")
      .eq("id", parentId)
      .maybeSingle();
    parentClassId = (data as { class_id: string } | null)?.class_id ?? null;
  } else {
    const { data } = await supabase
      .from("subtopics")
      .select("topics!inner(class_id)")
      .eq("id", parentId)
      .maybeSingle();
    parentClassId = (data as { topics: { class_id: string } } | null)?.topics.class_id ?? null;
  }
  if (!parentClassId || parentClassId !== classId) {
    return { error: "Resource target not found in this class." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return { error: "Storage is not configured." };
  const fileUrl = `${baseUrl}${STORAGE_MARKER}${storagePath}`;

  const { error } = await supabase.from("resources").insert({
    title: cleanTitle,
    size_bytes: Math.round(sizeBytes),
    file_url: fileUrl,
    topic_id: parentType === "topic" ? parentId : null,
    subtopic_id: parentType === "subtopic" ? parentId : null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/educator/classes/${classId}`);
  revalidatePath(`/classes/${classId}`);
  return { ok: true };
}

/**
 * Deletes a resource row (the RLS DELETE policy is the real authorization gate)
 * and best-effort reaps the underlying storage object, which the Postgres
 * cascade never reaches. The DB delete runs first so a caller without permission
 * never touches storage; the object path is captured beforehand.
 */
export async function deleteResourceAction(
  resourceId: string,
  classId: string,
): Promise<ResourceActionState> {
  const auth = await requireEducator();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("resources")
    .select("file_url")
    .eq("id", resourceId)
    .maybeSingle();
  const row = existing as { file_url: string } | null;

  const { error } = await supabase.from("resources").delete().eq("id", resourceId);
  if (error) return { error: error.message };

  if (row?.file_url) {
    const markerIndex = row.file_url.indexOf(STORAGE_MARKER);
    if (markerIndex !== -1) {
      const path = decodeURIComponent(row.file_url.slice(markerIndex + STORAGE_MARKER.length));
      await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    }
  }

  revalidatePath(`/educator/classes/${classId}`);
  revalidatePath(`/classes/${classId}`);
  return { ok: true };
}
