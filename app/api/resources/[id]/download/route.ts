import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { noteKeyFromFileUrl } from "@/lib/storage/notes";
import { presignNoteGet } from "@/lib/storage/r2";

/**
 * Mints a short-lived Cloudflare R2 presigned GET for a class note (PDF) and 302s to it.
 *
 * Access boundary: the `resources` row read runs under the CALLER's RLS
 * (resources_select_authorized = owner / admin / enrolled-or-teaching a class
 * the note is placed in), so a successful read IS the authorization check — a
 * student who isn't in any class the note is placed in gets a null row → 404.
 * Only after that check do we presign the R2 GET — the bytes live in an app-gated
 * R2 bucket with no per-user auth, so the row read is the sole membership gate.
 * The key is re-derived from the stored owner-keyed file_url, so it's never an
 * open redirect. See plans/r2-notes-migration.md.
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

  /* RLS-gated read — null unless the caller owns / is admin / is enrolled-or-teaching a class it's in. */
  const { data } = await supabase
    .from("resources")
    .select("file_url")
    .eq("id", id)
    .maybeSingle();
  const row = data as { file_url: string } | null;
  if (!row) {
    return new NextResponse("Resource not found.", { status: 404 });
  }

  const key = noteKeyFromFileUrl(row.file_url);
  if (!key) {
    return new NextResponse("Invalid resource.", { status: 400 });
  }

  /* 302 to a short-lived Cloudflare R2 presigned GET. */
  try {
    const url = await presignNoteGet(key);
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Unable to access this file.", { status: 500 });
  }
}
