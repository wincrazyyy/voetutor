"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireEducatorOrAdmin, ownsClass } from "@/lib/auth/educator-class-gate";
import type { ClassPassItem } from "@/lib/types/database";

export interface PassActionState {
  error?: string;
}

export interface CreatePassState {
  error?: string;
  passId?: string;
}

export type PassItemKind = "topic" | "subtopic" | "video" | "note";

export interface PassItemInput {
  kind: PassItemKind;
  id: string;
}

/** Sanity bound on the reconcile payload — a pass is a small curated subset, never the whole DB. */
const MAX_PASS_ITEMS = 200;

const ITEM_KINDS: PassItemKind[] = ["topic", "subtopic", "video", "note"];

const ITEM_COLUMN: Record<PassItemKind, "topic_id" | "subtopic_id" | "video_id" | "resource_id"> = {
  topic: "topic_id",
  subtopic: "subtopic_id",
  video: "video_id",
  note: "resource_id",
};

function itemKeyOf(row: Pick<ClassPassItem, "topic_id" | "subtopic_id" | "video_id" | "resource_id">): string | null {
  if (row.topic_id) return `topic:${row.topic_id}`;
  if (row.subtopic_id) return `subtopic:${row.subtopic_id}`;
  if (row.video_id) return `video:${row.video_id}`;
  if (row.resource_id) return `note:${row.resource_id}`;
  return null;
}

function validateNameAndDescription(
  name: string,
  description: string | undefined,
): { name: string; description: string | null } | { error: string } {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Enter a pass name." };
  if (trimmedName.length > 80) return { error: "Pass name must be 80 characters or fewer." };
  const trimmedDescription = description?.trim() || null;
  if (trimmedDescription && trimmedDescription.length > 500) {
    return { error: "Description must be 500 characters or fewer." };
  }
  return { name: trimmedName, description: trimmedDescription };
}

/** Educator/admin creates a named pass on their class (contents added via the picker). */
export async function createClassPassAction(
  classId: string,
  name: string,
  description?: string,
): Promise<CreatePassState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const clean = validateNameAndDescription(name, description);
  if ("error" in clean) return clean;

  const { data, error } = await supabase
    .from("class_passes")
    .insert({
      class_id: classId,
      name: clean.name,
      description: clean.description,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "A pass with this name already exists." };
    return { error: error.message };
  }

  revalidatePath(`/class/${classId}/students`);
  return { passId: (data as { id: string }).id };
}

/** Educator/admin renames / re-describes a pass (class_id is trigger-locked against reparenting). */
export async function renameClassPassAction(
  passId: string,
  classId: string,
  name: string,
  description?: string,
): Promise<PassActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const clean = validateNameAndDescription(name, description);
  if ("error" in clean) return clean;

  const { error } = await supabase
    .from("class_passes")
    .update({ name: clean.name, description: clean.description })
    .eq("id", passId)
    .eq("class_id", classId);

  if (error) {
    if (error.code === "23505") return { error: "A pass with this name already exists." };
    return { error: error.message };
  }

  revalidatePath(`/class/${classId}/students`);
  revalidatePath(`/class/${classId}`);
  return {};
}

/**
 * Educator/admin deletes a pass. Items, holders, scoped invites, and targeted announcements
 * cascade away in the DB; students who held it stay enrolled (scoped, fail-closed) with no
 * content until reassigned. The UI supplies the informed confirm with the holder count.
 */
export async function deleteClassPassAction(
  passId: string,
  classId: string,
): Promise<PassActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const { error } = await supabase
    .from("class_passes")
    .delete()
    .eq("id", passId)
    .eq("class_id", classId);

  if (error) return { error: error.message };

  revalidatePath(`/class/${classId}/students`);
  revalidatePath(`/class/${classId}`);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Reconcile a pass's items to exactly the given set (diff insert/delete), mirroring
 * setVideoPlacementsAction's reconcile-to-set style. The enforce_pass_item_class DB trigger
 * is the cross-class integrity backstop; RLS gates the writes to the class educator/admin.
 */
export async function setClassPassItemsAction(
  passId: string,
  classId: string,
  items: PassItemInput[],
): Promise<PassActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  if (items.length > MAX_PASS_ITEMS) {
    return { error: `A pass can grant at most ${MAX_PASS_ITEMS} items.` };
  }
  for (const item of items) {
    if (!ITEM_KINDS.includes(item.kind) || !item.id) return { error: "Invalid pass item." };
  }

  const { data: passRow } = await supabase
    .from("class_passes")
    .select("id")
    .eq("id", passId)
    .eq("class_id", classId)
    .maybeSingle();
  if (!passRow) return { error: "Pass not found." };

  const { data: existing, error: readError } = await supabase
    .from("class_pass_items")
    .select("id, topic_id, subtopic_id, video_id, resource_id")
    .eq("pass_id", passId);
  if (readError) return { error: readError.message };

  const existingRows = (existing ?? []) as Array<
    Pick<ClassPassItem, "id" | "topic_id" | "subtopic_id" | "video_id" | "resource_id">
  >;
  const desiredKeys = new Set(items.map((i) => `${i.kind}:${i.id}`));
  const existingByKey = new Map<string, string>();
  for (const row of existingRows) {
    const key = itemKeyOf(row);
    if (key) existingByKey.set(key, row.id);
  }

  const toDelete = existingRows
    .filter((row) => {
      const key = itemKeyOf(row);
      return !key || !desiredKeys.has(key);
    })
    .map((row) => row.id);
  const toInsert = items
    .filter((item) => !existingByKey.has(`${item.kind}:${item.id}`))
    .map((item) => ({ pass_id: passId, [ITEM_COLUMN[item.kind]]: item.id }));

  if (toDelete.length > 0) {
    const { error } = await supabase.from("class_pass_items").delete().in("id", toDelete);
    if (error) return { error: error.message };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase.from("class_pass_items").insert(toInsert);
    if (error) return { error: error.message };
  }

  revalidatePath(`/class/${classId}/students`);
  revalidatePath(`/class/${classId}`);
  return {};
}

export type StudentAccessInput =
  | { scope: "full" }
  | { scope: "scoped"; passIds: string[] };

/**
 * The roster access editor's writer: sets a student's enrollment scope and reconciles
 * their held passes. "full" = UPDATE access_scope + clear holder rows (the manual upgrade —
 * progress, forum history, receipts, and sidebar order all survive because the enrollment
 * row is updated in place, never recreated). "scoped" = UPDATE + reconcile holders to the
 * given passes (each validated to the class via an RLS read of class_passes).
 */
export async function setStudentAccessAction(
  classId: string,
  studentId: string,
  access: StudentAccessInput,
): Promise<PassActionState> {
  const gate = await requireEducatorOrAdmin();
  if ("error" in gate) return { error: gate.error };
  const { profile } = gate;

  const supabase = await createClient();
  if (!(await ownsClass(supabase, profile, classId))) {
    return { error: "You do not manage this class." };
  }

  const { data: enrollment } = await supabase
    .from("class_enrollments")
    .select("user_id")
    .eq("class_id", classId)
    .eq("user_id", studentId)
    .maybeSingle();
  if (!enrollment) return { error: "That student is not enrolled in this class." };

  if (access.scope === "scoped") {
    const passIds = [...new Set(access.passIds)];
    if (passIds.length > 0) {
      const { data: passes } = await supabase
        .from("class_passes")
        .select("id")
        .eq("class_id", classId)
        .in("id", passIds);
      if (((passes ?? []) as Array<{ id: string }>).length !== passIds.length) {
        return { error: "One of the selected passes does not belong to this class." };
      }
    }

    const { error: scopeError } = await supabase
      .from("class_enrollments")
      .update({ access_scope: "scoped" })
      .eq("class_id", classId)
      .eq("user_id", studentId);
    if (scopeError) return { error: scopeError.message };

    const { data: held, error: heldError } = await supabase
      .from("class_pass_holders")
      .select("pass_id")
      .eq("class_id", classId)
      .eq("user_id", studentId);
    if (heldError) return { error: heldError.message };

    const heldIds = new Set(((held ?? []) as Array<{ pass_id: string }>).map((h) => h.pass_id));
    const wantedIds = new Set(passIds);
    const toRemove = [...heldIds].filter((id) => !wantedIds.has(id));
    const toAdd = passIds.filter((id) => !heldIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("class_pass_holders")
        .delete()
        .eq("class_id", classId)
        .eq("user_id", studentId)
        .in("pass_id", toRemove);
      if (error) return { error: error.message };
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from("class_pass_holders").insert(
        toAdd.map((passId) => ({
          user_id: studentId,
          class_id: classId,
          pass_id: passId,
          granted_by: profile.id,
        })),
      );
      if (error) return { error: error.message };
    }
  } else {
    const { error: scopeError } = await supabase
      .from("class_enrollments")
      .update({ access_scope: "full" })
      .eq("class_id", classId)
      .eq("user_id", studentId);
    if (scopeError) return { error: scopeError.message };

    const { error: holderError } = await supabase
      .from("class_pass_holders")
      .delete()
      .eq("class_id", classId)
      .eq("user_id", studentId);
    if (holderError) return { error: holderError.message };
  }

  revalidatePath(`/class/${classId}`);
  revalidatePath(`/class/${classId}/students`);
  revalidatePath("/", "layout");
  return {};
}
