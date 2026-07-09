import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { noteKeyFromFileUrl } from "@/lib/storage/notes";
import { deleteNoteObjects, isR2Configured, listNoteObjects } from "@/lib/storage/r2";

/**
 * Reaps orphaned Cloudflare R2 note objects — bytes with no matching `resources` row. A note upload is
 * two steps (browser PUTs to R2, then createNoteUploadAction registers the row); if the browser
 * crashes between them, the object is stranded and the client-side reap never runs. This scheduled
 * sweep is the server-side backstop: it lists every object in the notes bucket and deletes any whose
 * key isn't referenced by a live resources row.
 *
 * The live-key set is built from noteKeyFromFileUrl over EVERY resources row (both migrated bare-key
 * rows and legacy Supabase rows resolve to the same owner-keyed object path), so a byte-migrated
 * legacy row is never mistaken for an orphan. A min-age guard skips freshly uploaded objects so an
 * in-flight upload whose row isn't registered yet is never reaped.
 *
 * Machine-to-machine: authenticated by a bearer CRON_SECRET (NOT the auth gate — no user session), so
 * it must stay excluded from the proxy matcher. Reads every educator's rows via the service-role
 * client. Best-effort and idempotent. DeleteObjects is a free R2 op.
 */

const MIN_AGE_MS = 60 * 60 * 1000;
const PAGE = 1000;

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[reap-r2-notes] CRON_SECRET is not set; the reaper is disabled.");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isR2Configured()) {
    return NextResponse.json({ skipped: "R2 not configured." });
  }

  const supabase = createAdminClient();

  /* Every live object key referenced by a resources row (both file_url shapes). KEYSET pagination by
     the immutable uuid PK — NOT .range()/OFFSET — because this set gates deletes: an OFFSET scan can
     skip a live row when a concurrent write (notably the migration script's bulk file_url UPDATE)
     shifts page boundaries, and a dropped live key would make the reaper permanently delete an object
     a live row still references. Keyset never skips a row that persists through the scan; a row
     inserted mid-scan is a fresh upload the min-age guard already protects. */
  const liveKeys = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    let query = supabase.from("resources").select("id, file_url");
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query.order("id", { ascending: true }).limit(PAGE);
    if (error) {
      console.error("[reap-r2-notes] resources lookup failed:", error.message);
      return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
    }
    const rows = (data ?? []) as Array<{ id: string; file_url: string }>;
    for (const row of rows) {
      const key = noteKeyFromFileUrl(row.file_url);
      if (key) liveKeys.add(key);
    }
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].id;
  }

  let objects;
  try {
    objects = await listNoteObjects();
  } catch (cause) {
    console.error("[reap-r2-notes] R2 list failed:", cause);
    return NextResponse.json({ error: "List failed." }, { status: 500 });
  }

  const cutoff = Date.now() - MIN_AGE_MS;
  const orphans: string[] = [];
  let tooYoung = 0;
  for (const obj of objects) {
    if (liveKeys.has(obj.key)) continue;
    /* Skip objects with no/too-recent timestamp — never reap something that may still be registering. */
    if (!obj.lastModified || obj.lastModified.getTime() > cutoff) {
      tooYoung += 1;
      continue;
    }
    orphans.push(obj.key);
  }

  if (orphans.length > 0) await deleteNoteObjects(orphans);

  return NextResponse.json({
    scanned: objects.length,
    live: liveKeys.size,
    reaped: orphans.length,
    tooYoung,
  });
}
