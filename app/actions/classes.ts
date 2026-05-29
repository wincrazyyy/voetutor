"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

export interface ClassFormState {
  error?: string;
}

interface ClassInput {
  title: string;
  description: string;
  priceCents: number;
}

function parseInput(formData: FormData): ClassInput | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "0").trim();

  if (!title) return { error: "Title is required." };
  if (title.length > 255) return { error: "Title must be 255 characters or fewer." };

  if (!/^\d+$/.test(priceRaw)) {
    return { error: "Price must be a whole number of HKD." };
  }
  const priceWhole = Number(priceRaw);
  if (!Number.isFinite(priceWhole) || priceWhole < 0) {
    return { error: "Price must be a non-negative whole number." };
  }
  const priceCents = priceWhole * 100;

  return { title, description, priceCents };
}

export async function createClassAction(formData: FormData): Promise<ClassFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "educator" && profile.role !== "admin") return { error: "Only educators can create classes." };
  if (profile.role === "educator" && !profile.is_approved) return { error: "Educator account is awaiting approval." };

  const parsed = parseInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .insert({
      title: parsed.title,
      description: parsed.description || null,
      educator_id: profile.id,
      price_cents: parsed.priceCents,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(`/educator/classes/${(data as { id: string }).id}/edit`);
}

export async function updateClassAction(classId: string, formData: FormData): Promise<ClassFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const parsed = parseInput(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update({
      title: parsed.title,
      description: parsed.description || null,
      price_cents: parsed.priceCents,
    })
    .eq("id", classId);

  if (error) return { error: error.message };

  revalidatePath(`/educator/classes/${classId}`);
  revalidatePath(`/educator/classes/${classId}/edit`);
  return {};
}

export async function setClassPublishedAction(
  classId: string,
  publish: boolean,
): Promise<ClassFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("classes")
    .update({ is_published: publish })
    .eq("id", classId);

  if (error) return { error: error.message };

  revalidatePath(`/educator/classes/${classId}`);
  revalidatePath(`/educator/classes/${classId}/edit`);
  revalidatePath("/classes/browse");
  return {};
}

export async function deleteClassAction(
  classId: string,
  confirmation: string,
): Promise<ClassFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { data: cls, error: fetchError } = await supabase
    .from("classes")
    .select("id, code, educator_id")
    .eq("id", classId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!cls) return { error: "Class not found." };

  const row = cls as { id: string; code: string; educator_id: string | null };
  const isOwner = row.educator_id === profile.id;
  const isAdmin = profile.role === "admin";
  if (!isOwner && !isAdmin) return { error: "You don't have permission to delete this class." };

  if (confirmation.trim() !== row.code) {
    return { error: "Confirmation does not match the class code." };
  }

  const { error: deleteError } = await supabase.from("classes").delete().eq("id", classId);
  if (deleteError) return { error: deleteError.message };

  revalidatePath("/", "layout");
  redirect(isAdmin ? "/admin/classes" : "/educator");
}

export async function enrollInFreeClassAction(classId: string): Promise<ClassFormState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("enroll_in_free_class", { p_class_id: classId });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(`/classes/${classId}`);
}
