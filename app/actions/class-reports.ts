"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/queries/profile";

export interface ReportActionState {
  error?: string;
  ok?: boolean;
}

export async function reportClassAction(
  classId: string,
  reason: string,
): Promise<ReportActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };

  const trimmed = reason.trim();
  if (!trimmed) return { error: "Please describe what's wrong with this class." };
  if (trimmed.length > 1000) return { error: "Reason must be 1000 characters or fewer." };

  const supabase = await createClient();
  const { error } = await supabase.from("class_reports").insert({
    class_id: classId,
    reporter_id: profile.id,
    reason: trimmed,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "You've already reported this class — an admin will review it shortly." };
    }
    return { error: error.message };
  }

  return { ok: true };
}

export async function dismissReportAction(reportId: string): Promise<ReportActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "admin") return { error: "Admins only." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("class_reports")
    .update({
      status: "dismissed",
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "pending");

  if (error) return { error: error.message };

  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true };
}

export async function actionReportAction(reportId: string): Promise<ReportActionState> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Sign in required." };
  if (profile.role !== "admin") return { error: "Admins only." };

  const supabase = await createClient();

  const { data: report, error: fetchError } = await supabase
    .from("class_reports")
    .select("id, class_id, status")
    .eq("id", reportId)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!report) return { error: "Report not found." };
  if ((report as { status: string }).status !== "pending") {
    return { error: "Report has already been resolved." };
  }

  const classId = (report as { class_id: string }).class_id;

  const { error: unpublishError } = await supabase
    .from("classes")
    .update({ is_published: false })
    .eq("id", classId);
  if (unpublishError) return { error: unpublishError.message };

  const { error: updateError } = await supabase
    .from("class_reports")
    .update({
      status: "actioned",
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "pending");
  if (updateError) return { error: updateError.message };

  await supabase
    .from("class_reports")
    .update({
      status: "actioned",
      resolved_by: profile.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("class_id", classId)
    .eq("status", "pending");

  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  revalidatePath("/classes/browse");
  return { ok: true };
}
