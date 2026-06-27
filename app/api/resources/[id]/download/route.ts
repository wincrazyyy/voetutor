import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "class-resources";
const STORAGE_MARKER = `/storage/v1/object/${BUCKET}/`;

/**
 * Mints a short-lived signed URL for a class resource and 302s to it. The
 * resources row read is RLS-gated (resources_select_authorized) and the
 * createSignedUrl call is gated by the storage SELECT policy, so only an
 * enrolled student, the class educator, or an admin can ever resolve the file.
 * Only objects that live inside the class-resources bucket are served — a row
 * whose file_url points elsewhere is treated as not-downloadable (no
 * open-redirect to an arbitrary origin).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const { data } = await supabase
    .from("resources")
    .select("file_url")
    .eq("id", id)
    .maybeSingle();
  const row = data as { file_url: string } | null;
  if (!row) {
    return new NextResponse("Resource not found.", { status: 404 });
  }

  const markerIndex = row.file_url.indexOf(STORAGE_MARKER);
  if (markerIndex === -1) {
    return new NextResponse("Resource not found.", { status: 404 });
  }

  const path = decodeURIComponent(row.file_url.slice(markerIndex + STORAGE_MARKER.length));
  if (!path || path.includes("..") || !path.toLowerCase().endsWith(".pdf")) {
    return new NextResponse("Invalid resource.", { status: 400 });
  }

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 120);
  if (error || !signed) {
    return new NextResponse("Unable to access this file.", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
