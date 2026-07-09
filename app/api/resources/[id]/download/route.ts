import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LEGACY_NOTES_BUCKET,
  isLegacySupabaseNote,
  noteKeyFromFileUrl,
} from "@/lib/storage/notes";
import { presignNoteGet } from "@/lib/storage/r2";

/**
 * Mints a short-lived signed URL for a class note (PDF) and 302s to it.
 *
 * Access boundary: the `resources` row read runs under the CALLER's RLS
 * (resources_select_authorized = owner / admin / enrolled-or-teaching a class
 * the note is placed in), so a successful read IS the authorization check — a
 * student who isn't in any class the note is placed in gets a null row → 404.
 * Only after that check do we mint the download URL — the bytes live in an
 * app-gated store with no per-user auth (Cloudflare R2, or legacy Supabase
 * Storage during the migration), so the row read is the sole membership gate.
 *
 * Dual-read: rows migrated to R2 hold a bare object key and are served via an R2
 * presigned GET; rows not yet migrated still hold a Supabase Storage https URL
 * and are served via a service-role signed URL. Both derive the same owner-keyed
 * object path, so neither is an open redirect. See plans/r2-notes-migration.md.
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

  /* Legacy rows still on Supabase Storage: mint with service-role (storage RLS is owner/admin only). */
  if (isLegacySupabaseNote(row.file_url)) {
    const admin = createAdminClient();
    const { data: signed, error } = await admin.storage
      .from(LEGACY_NOTES_BUCKET)
      .createSignedUrl(key, 600);
    if (error || !signed) {
      return new NextResponse("Unable to access this file.", { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }

  /* Migrated rows: 302 to a short-lived Cloudflare R2 presigned GET. */
  try {
    const url = await presignNoteGet(key);
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("Unable to access this file.", { status: 500 });
  }
}
