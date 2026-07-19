import { redirect } from "next/navigation";

/**
 * The class statistics page moved to the top-level /statistics/[classId] (IA restructure v2).
 * This stub keeps old links and bookmarks resolving.
 */
export default async function ClassStatsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const { classId } = await params;
  redirect(`/statistics/${classId}`);
}
