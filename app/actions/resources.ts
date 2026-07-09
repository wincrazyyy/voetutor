"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";
import { getEducatorAccess } from "@/lib/tiers/gate";
import type { Profile } from "@/lib/types/database";
import {
  type PlacementParent,
  parentColumns,
  parentKey,
  parentOf,
  resolveOwnedParentClass,
  nextPlacementOrder,
  classesForPlacementRows,
} from "@/lib/curriculum/placements";
import { isOwnNoteKey, noteFileUrl, noteKeyFromFileUrl } from "@/lib/storage/notes";
import { deleteNoteObjects, headNoteSize, presignNotePut } from "@/lib/storage/r2";

const MAX_BYTES = 100 * 1024 * 1024;

export interface ResourceActionState {
  error?: string;
  ok?: boolean;
}

/** Shared auth + premium gate for note writes — the same block the create/reap actions run. */
async function requirePremiumEducator(): Promise<{ profile: Profile } | { error: string }> {
  const access = await getEducatorAccess();
  if (!access.profile) return { error: "Sign in required." };
  const { profile, isPremium } = access;
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can upload notes." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }
  if (!isPremium) {
    return { error: "Notes are a premium feature. Upgrade to add notes." };
  }
  return { profile };
}

/**
 * Mints a presigned R2 PUT URL so the browser can upload a note PDF directly to Cloudflare R2
 * (bypassing the Vercel body limit). Authorizes + premium-gates BEFORE minting — R2 has no per-user
 * RLS, so this action is the gatekeeper. Returns the object key (under the caller's own owner prefix)
 * and the one-time PUT URL. The row is registered separately by createNoteUploadAction.
 */
export async function createNotePresignAction(): Promise<
  { key: string; putUrl: string } | { error: string }
> {
  const gate = await requirePremiumEducator();
  if ("error" in gate) return gate;

  try {
    const key = noteFileUrl(gate.profile.id, crypto.randomUUID());
    const putUrl = await presignNotePut(key);
    return { key, putUrl };
  } catch {
    return { error: "Note storage is not configured on this deployment." };
  }
}

/**
 * Deletes a just-uploaded R2 object when row registration fails (the browser has no R2 credentials, so
 * it calls this instead of reaping directly). Only the caller's own object — or an admin's anything.
 */
export async function reapNoteObjectAction(key: string): Promise<ResourceActionState> {
  const gate = await requirePremiumEducator();
  if ("error" in gate) return gate;
  if (gate.profile.role !== "admin" && !isOwnNoteKey(key, gate.profile.id)) {
    return { error: "Invalid object key." };
  }
  await deleteNoteObjects([key]);
  return { ok: true };
}

/**
 * Registers a `resources` (note) row for a PDF the client already uploaded to Cloudflare R2 under the
 * caller's owner-keyed object key. The bytes never pass through this action, so the Next.js body limit
 * is irrelevant. The note lands in the educator's LIBRARY; an optional `parent` (topic or subtopic)
 * also places it there. Premium-gated, mirroring video uploads.
 *
 * The size cap is enforced authoritatively from R2 (HeadObject), never the client-reported size — a
 * client can't smuggle an oversized file past the cap, and the true byte length is what we persist.
 */
export async function createNoteUploadAction(input: {
  parent?: PlacementParent | null;
  title: string;
  description: string;
  storagePath: string;
  sizeBytes: number;
}): Promise<ResourceActionState> {
  const gate = await requirePremiumEducator();
  if ("error" in gate) return gate;
  const { profile } = gate;

  const title = input.title.trim();
  if (!title) return { error: "A title is required." };
  if (title.length > 255) return { error: "Title must be 255 characters or fewer." };

  const description = input.description.trim();
  if (description.length > 5000) return { error: "Description must be 5000 characters or fewer." };

  /* The object must live under the caller's OWN owner-keyed prefix. */
  if (!isOwnNoteKey(input.storagePath, profile.id)) {
    return { error: "Invalid upload path." };
  }

  /* Authoritative size from R2 — never trust the client. A missing object (null) means the upload
     didn't land (or a transient head failure); reject and reap so nothing is stranded. Oversize is
     rejected + reaped here even though the client also caps, so the cap can't be bypassed. */
  const trueSize = await headNoteSize(input.storagePath);
  if (trueSize === null) {
    await deleteNoteObjects([input.storagePath]);
    return { error: "Upload could not be verified. Please try again." };
  }
  if (trueSize > MAX_BYTES) {
    await deleteNoteObjects([input.storagePath]);
    return { error: "File must be 100 MB or smaller." };
  }

  const supabase = await createClient();

  const parent = input.parent ?? null;
  let classId: string | null = null;
  let orderIndex = 0;
  if (parent) {
    const resolved = await resolveOwnedParentClass(supabase, profile, parent);
    if ("error" in resolved) {
      await deleteNoteObjects([input.storagePath]);
      return { error: resolved.error };
    }
    classId = resolved.classId;
    orderIndex = await nextPlacementOrder(supabase, parent);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("resources")
    .insert({
      owner_id: profile.id,
      title,
      description: description || null,
      size_bytes: trueSize,
      file_url: input.storagePath,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    await deleteNoteObjects([input.storagePath]);
    return { error: insertError?.message ?? "Could not save the note." };
  }
  const resourceId = (inserted as { id: string }).id;

  if (parent) {
    const { error: placementError } = await supabase
      .from("resource_placements")
      .insert({ resource_id: resourceId, ...parentColumns(parent), order_index: orderIndex });
    if (placementError) {
      await supabase.from("resources").delete().eq("id", resourceId);
      await deleteNoteObjects([input.storagePath]);
      return { error: placementError.message };
    }
  }

  if (classId) revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Reconciles a library note's placements to exactly the given set of parents (topics and/or
 * subtopics). Mirrors setVideoPlacementsAction without the Q&A cleanup (notes aren't referenced by
 * forum_posts). Every requested parent is validated to a class the caller owns.
 */
export async function setNotePlacementsAction(
  resourceId: string,
  parents: PlacementParent[],
): Promise<ResourceActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage notes." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const supabase = await createClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("owner_id")
    .eq("id", resourceId)
    .maybeSingle();
  const resourceRow = resource as { owner_id: string } | null;
  if (!resourceRow) return { error: "Note not found." };
  if (profile.role !== "admin" && resourceRow.owner_id !== profile.id) {
    return { error: "You don't have permission to manage this note." };
  }

  const requested = new Map<string, PlacementParent>();
  for (const p of parents) requested.set(parentKey(p), p);

  const finalClasses = new Set<string>();
  for (const p of requested.values()) {
    const resolved = await resolveOwnedParentClass(supabase, profile, p);
    if ("error" in resolved) return { error: resolved.error };
    finalClasses.add(resolved.classId);
  }

  const { data: existing } = await supabase
    .from("resource_placements")
    .select("id, topic_id, subtopic_id")
    .eq("resource_id", resourceId);
  const existingRows = (existing ?? []) as Array<{
    id: string;
    topic_id: string | null;
    subtopic_id: string | null;
  }>;

  const existingByKey = new Map<string, string>();
  for (const row of existingRows) {
    const p = parentOf(row);
    if (p) existingByKey.set(parentKey(p), row.id);
  }

  const toAdd = [...requested.values()].filter((p) => !existingByKey.has(parentKey(p)));
  const removeIds = [...existingByKey.entries()]
    .filter(([key]) => !requested.has(key))
    .map(([, id]) => id);

  const currentClassMap = await classesForPlacementRows(supabase, existingRows);

  if (removeIds.length > 0) {
    const { error } = await supabase.from("resource_placements").delete().in("id", removeIds);
    if (error) return { error: error.message };
  }

  for (const parent of toAdd) {
    const orderIndex = await nextPlacementOrder(supabase, parent);
    const { error } = await supabase
      .from("resource_placements")
      .insert({ resource_id: resourceId, ...parentColumns(parent), order_index: orderIndex });
    if (error) return { error: error.message };
  }

  for (const classId of new Set([...currentClassMap.values(), ...finalClasses])) {
    revalidatePath(`/class/${classId}`);
  }
  revalidatePath("/library");
  return { ok: true };
}

/**
 * Adds existing library notes into one parent (topic or subtopic) — the curriculum board's "Add
 * notes" picker. Additive; mirrors addVideosToParentAction.
 */
export async function addNotesToParentAction(
  classId: string,
  parent: PlacementParent,
  resourceIds: string[],
): Promise<ResourceActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage notes." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const ids = [...new Set(resourceIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };

  const supabase = await createClient();

  const resolved = await resolveOwnedParentClass(supabase, profile, parent);
  if ("error" in resolved) return { error: resolved.error };
  if (resolved.classId !== classId) return { error: "That node is not in this class." };

  const { data: owned } = await supabase.from("resources").select("id, owner_id").in("id", ids);
  const ownedRows = (owned ?? []) as Array<{ id: string; owner_id: string }>;
  const ownedIds = new Set(
    ownedRows
      .filter((row) => profile.role === "admin" || row.owner_id === profile.id)
      .map((row) => row.id),
  );
  if (ids.some((id) => !ownedIds.has(id))) {
    return { error: "You can only add notes from your own library." };
  }

  const column = parent.kind === "topic" ? "topic_id" : "subtopic_id";
  const { data: existing } = await supabase
    .from("resource_placements")
    .select("resource_id, order_index")
    .eq(column, parent.id);
  const existingRows = (existing ?? []) as Array<{ resource_id: string; order_index: number }>;
  const alreadyPlaced = new Set(existingRows.map((row) => row.resource_id));
  let nextOrder = existingRows.reduce((max, row) => Math.max(max, row.order_index), -1) + 1;

  const toInsert = ids
    .filter((id) => !alreadyPlaced.has(id))
    .map((id) => ({ resource_id: id, ...parentColumns(parent), order_index: nextOrder++ }));
  if (toInsert.length === 0) return { ok: true };

  const { error } = await supabase.from("resource_placements").insert(toInsert);
  if (error) {
    if (error.code === "23505") return { error: "One or more of those notes are already here." };
    return { error: error.message };
  }

  revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return { ok: true };
}

/** Removes one note placement without deleting the underlying library note. Mirrors unplaceVideoAction. */
export async function unplaceNoteAction(placementId: string): Promise<ResourceActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can manage notes." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const supabase = await createClient();

  const { data: placement } = await supabase
    .from("resource_placements")
    .select("id, topic_id, subtopic_id")
    .eq("id", placementId)
    .maybeSingle();
  const row = placement as { id: string; topic_id: string | null; subtopic_id: string | null } | null;
  if (!row) return { error: "Placement not found." };

  const parent = parentOf(row);
  if (!parent) return { error: "Placement is malformed." };
  const resolved = await resolveOwnedParentClass(supabase, profile, parent);
  if ("error" in resolved) return { error: resolved.error };

  const { error } = await supabase.from("resource_placements").delete().eq("id", placementId);
  if (error) return { error: error.message };

  revalidatePath(`/class/${resolved.classId}`);
  revalidatePath("/library");
  return { ok: true };
}

/** Owner/admin renames a library note. Mirrors renameVideoAction. */
export async function renameNoteAction(
  resourceId: string,
  classId: string | null,
  title: string,
): Promise<ResourceActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can edit notes." };
  }
  if (profile.role === "educator" && !profile.is_approved) {
    return { error: "Educator account is awaiting approval." };
  }

  const cleanTitle = title.trim();
  if (!cleanTitle) return { error: "A title is required." };
  if (cleanTitle.length > 255) return { error: "Title must be 255 characters or fewer." };

  const supabase = await createClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("owner_id")
    .eq("id", resourceId)
    .maybeSingle();
  const resourceRow = resource as { owner_id: string } | null;
  if (!resourceRow) return { error: "Note not found." };
  if (profile.role !== "admin" && resourceRow.owner_id !== profile.id) {
    return { error: "You don't have permission to edit this note." };
  }

  const { error } = await supabase.from("resources").update({ title: cleanTitle }).eq("id", resourceId);
  if (error) return { error: error.message };

  if (classId) revalidatePath(`/class/${classId}`);
  else revalidatePath("/library");
  return { ok: true };
}

/**
 * Deletes a library note row (RLS is the real authorization gate), cascades its placements, and
 * best-effort reaps the underlying storage object (the Postgres cascade never reaches storage).
 */
export async function deleteNoteAction(resourceId: string): Promise<ResourceActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") {
    return { error: "Only educators can delete notes." };
  }

  const supabase = await createClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("owner_id, file_url")
    .eq("id", resourceId)
    .maybeSingle();
  const resourceRow = resource as { owner_id: string; file_url: string } | null;
  if (!resourceRow) return { error: "Note not found." };
  if (profile.role !== "admin" && resourceRow.owner_id !== profile.id) {
    return { error: "You don't have permission to delete this note." };
  }

  const { data: placementRows } = await supabase
    .from("resource_placements")
    .select("topic_id, subtopic_id")
    .eq("resource_id", resourceId);
  const classMap = await classesForPlacementRows(
    supabase,
    (placementRows ?? []) as Array<{ topic_id: string | null; subtopic_id: string | null }>,
  );

  const { error } = await supabase.from("resources").delete().eq("id", resourceId);
  if (error) return { error: error.message };

  /* Reap the note bytes from R2 (best-effort; the DB cascade never reaches storage). */
  const key = noteKeyFromFileUrl(resourceRow.file_url);
  if (key) await deleteNoteObjects([key]);

  for (const classId of new Set(classMap.values())) revalidatePath(`/class/${classId}`);
  revalidatePath("/library");
  return { ok: true };
}
