"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

/**
 * Persists the caller's preferred sidebar class ordering. Each id is upserted with its array index as
 * `position`; RLS (user_class_order_insert/update_self) gates that every class is one the caller is
 * enrolled in or teaches, so ids they don't belong to are rejected. Revalidates the whole layout so the
 * sidebar re-reads the new order. Works identically for students (Enrolled Classes) and educators/admins
 * (Your Classes) since the ordering table is role-agnostic.
 */
export async function reorderSidebarClassesAction(
  orderedClassIds: string[],
): Promise<{ error?: string }> {
  const me = await getCurrentProfile();
  if (!me) return { error: "You must be signed in." };

  const rows = orderedClassIds.map((classId, index) => ({
    user_id: me.id,
    class_id: classId,
    position: index,
  }));

  if (rows.length === 0) return {};

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_class_order")
    .upsert(rows, { onConflict: "user_id,class_id" });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {};
}
