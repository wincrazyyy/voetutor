import { createClient } from "@/lib/supabase/server";
import type { Class, ProfilePublic } from "@/lib/types/database";

export interface AdminClassRow extends Class {
  educator: ProfilePublic | null;
  student_count: number;
  pending_report_count: number;
}

export async function getAllClassesForAdmin(): Promise<AdminClassRow[]> {
  const supabase = await createClient();
  const { data: classes } = await supabase
    .from("classes")
    .select(
      "id, code, title, description, educator_id, price_cents, currency, is_published, published_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  const rows = (classes ?? []) as Class[];
  if (rows.length === 0) return [];

  const educatorIds = Array.from(
    new Set(rows.map((c) => c.educator_id).filter((id): id is string => Boolean(id))),
  );
  const classIds = rows.map((c) => c.id);

  const [educatorsRes, enrollmentsRes, reportsRes] = await Promise.all([
    educatorIds.length > 0
      ? supabase
          .from("profiles_public")
          .select("id, first_name, last_name, display_name, role, is_approved")
          .in("id", educatorIds)
      : Promise.resolve({ data: [] }),
    supabase.from("class_enrollments").select("class_id").in("class_id", classIds),
    supabase
      .from("class_reports")
      .select("class_id")
      .eq("status", "pending")
      .in("class_id", classIds),
  ]);

  const educatorMap = new Map(
    ((educatorsRes.data ?? []) as ProfilePublic[]).map((e) => [e.id, e]),
  );

  const enrolmentCounts = new Map<string, number>();
  for (const r of (enrollmentsRes.data ?? []) as Array<{ class_id: string }>) {
    enrolmentCounts.set(r.class_id, (enrolmentCounts.get(r.class_id) ?? 0) + 1);
  }

  const reportCounts = new Map<string, number>();
  for (const r of (reportsRes.data ?? []) as Array<{ class_id: string }>) {
    reportCounts.set(r.class_id, (reportCounts.get(r.class_id) ?? 0) + 1);
  }

  return rows.map((c) => ({
    ...c,
    educator: c.educator_id ? (educatorMap.get(c.educator_id) ?? null) : null,
    student_count: enrolmentCounts.get(c.id) ?? 0,
    pending_report_count: reportCounts.get(c.id) ?? 0,
  }));
}
