import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NOTES_BUCKET, notePathFromUrl } from "@/lib/storage/notes";

/**
 * Mints a short-lived signed URL for a class note (PDF) and 302s to it.
 *
 * Access boundary: the `resources` row read runs under the CALLER's RLS
 * (resources_select_authorized = owner / admin / enrolled-or-teaching a class
 * the note is placed in), so a successful read IS the authorization check — a
 * student who isn't in any class the note is placed in gets a null row → 404.
 * Only after that check do we mint the signed URL with the SERVICE-ROLE client,
 * because under the owner-keyed storage model student reads are not permitted by
 * the storage RLS (owner/admin only) — the file is shared across classes, so a
 * path prefix can't encode membership. This mirrors server-side video token mint.
 * Only objects inside the notes bucket are served (no open-redirect).
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

  const path = notePathFromUrl(row.file_url);
  if (!path) {
    return new NextResponse("Invalid resource.", { status: 400 });
  }

  /* The membership check above passed; mint with service-role (storage RLS is owner/admin only). */
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from(NOTES_BUCKET).createSignedUrl(path, 120);
  if (error || !signed) {
    return new NextResponse("Unable to access this file.", { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
