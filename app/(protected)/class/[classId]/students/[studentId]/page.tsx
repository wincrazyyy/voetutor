import { redirect } from "next/navigation";

/**
 * The per-student insight moved to the top-level /students/[studentId], which opens the matching
 * class tab via ?class= (IA restructure v2). This stub keeps old links and bookmarks resolving.
 */
export default async function ClassStudentDetailPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  const { classId, studentId } = await params;
  redirect(`/students/${studentId}?class=${classId}`);
}
