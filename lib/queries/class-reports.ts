import { createClient } from "@/lib/supabase/server";
import type { ClassReport, Class, ProfilePublic } from "@/lib/types/database";

export interface PendingReportRow extends ClassReport {
  class: Pick<Class, "id" | "code" | "title" | "is_published" | "educator_id"> | null;
  reporter: ProfilePublic | null;
}

export async function getPendingReports(): Promise<PendingReportRow[]> {
  const supabase = await createClient();
  const { data: reports } = await supabase
    .from("class_reports")
    .select(
      "id, class_id, reporter_id, reason, status, resolved_by, resolved_at, created_at, updated_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows = (reports ?? []) as ClassReport[];
  if (rows.length === 0) return [];

  const classIds = Array.from(new Set(rows.map((r) => r.class_id)));
  const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_id)));

  const [{ data: classes }, { data: reporters }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, code, title, is_published, educator_id")
      .in("id", classIds),
    supabase
      .from("profiles_public")
      .select("id, first_name, last_name, display_name, role, is_approved")
      .in("id", reporterIds),
  ]);

  const classMap = new Map(
    ((classes ?? []) as PendingReportRow["class"][]).filter((c): c is NonNullable<PendingReportRow["class"]> => Boolean(c)).map((c) => [c.id, c]),
  );
  const reporterMap = new Map(
    ((reporters ?? []) as ProfilePublic[]).map((r) => [r.id, r]),
  );

  return rows.map((r) => ({
    ...r,
    class: classMap.get(r.class_id) ?? null,
    reporter: reporterMap.get(r.reporter_id) ?? null,
  }));
}

export async function getPendingReportCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("class_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
