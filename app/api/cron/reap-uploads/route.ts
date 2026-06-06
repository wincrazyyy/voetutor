import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { CloudflareApiError, deleteVideo, getVideoDetails } from "@/lib/cloudflare/client";
import type { VideoStatus } from "@/lib/types/database";

/**
 * Reaps abandoned uploads. A `videos` row is created at status='uploading' the
 * moment a Cloudflare upload URL is minted; if the browser upload never finishes
 * (tab closed, navigation, dropped network), no "ready" webhook ever fires and
 * the row is stranded — Cloudflare also keeps the half-made video as
 * 'pendingupload'. This scheduled sweep reconciles every stranded row against
 * Cloudflare's true state: it finishes rows that quietly went 'ready' (a missed
 * webhook), records failures, syncs rows still encoding, and deletes rows whose
 * upload was clearly abandoned — removing both the `videos` row and the
 * Cloudflare video so storage isn't reserved forever.
 *
 * Machine-to-machine: authenticated by a bearer `CRON_SECRET`, NOT the auth gate
 * (it has no user session), so it is excluded from the proxy matcher. Writes via
 * the service-role client because it spans every educator's rows. Every write is
 * constrained to the row still being in its 'uploading' pre-image, so a webhook
 * that advances the same row mid-sweep is never clobbered.
 */

const RECONCILE_AFTER_MS = 10 * 60 * 1000;
/**
 * tus uploads sit at Cloudflare state 'pendingupload' for the WHOLE byte
 * transfer ('downloading'/'inprogress' are for URL-pull + encoding), so the
 * abandon threshold must clear the slowest plausible upload — a 30 GB file on a
 * weak link can run many hours — or a genuine in-flight upload would be reaped
 * as data loss. 12 h is safely past that; an abandoned row merely shows
 * "Uploading" until then (and the educator can delete it by hand at any time).
 */
const ABANDON_AFTER_MS = 12 * 60 * 60 * 1000;
const BATCH_LIMIT = 25;

/* Each stranded row costs one sequential Cloudflare round-trip, so give the
   function headroom over the default timeout; a backlog drains across sweeps. */
export const maxDuration = 60;

interface StrandedRow {
  id: string;
  cloudflare_uid: string | null;
  created_at: string;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[reap-uploads] CRON_SECRET is not set; the reaper is disabled.");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Deletes a stranded row, guarded on status='uploading' so a row the webhook
 * just advanced is left untouched. Returns whether the row was removed.
 */
async function deleteRow(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("videos")
    .delete()
    .eq("id", id)
    .eq("status", "uploading");
  if (error) {
    console.error(`[reap-uploads] failed to delete videos row ${id}:`, error.message);
    return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const reconcileCutoff = new Date(Date.now() - RECONCILE_AFTER_MS).toISOString();

  const { data, error } = await supabase
    .from("videos")
    .select("id, cloudflare_uid, created_at")
    .eq("status", "uploading")
    .lt("created_at", reconcileCutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    console.error("[reap-uploads] lookup failed:", error.message);
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  const rows = (data ?? []) as StrandedRow[];
  let readied = 0;
  let failed = 0;
  let progressing = 0;
  let reaped = 0;
  let pending = 0;
  let skipped = 0;

  for (const row of rows) {
    /* No Cloudflare upload was ever minted — the row can never progress. */
    if (!row.cloudflare_uid) {
      if (await deleteRow(supabase, row.id)) reaped += 1;
      continue;
    }

    let detail;
    try {
      detail = await getVideoDetails(row.cloudflare_uid);
    } catch (cause) {
      if (cause instanceof CloudflareApiError && cause.status === 404) {
        if (await deleteRow(supabase, row.id)) reaped += 1;
        continue;
      }
      /* Transient/unknown API error: never delete on uncertainty — a Cloudflare
         outage must not wipe good uploads. Log it and retry on the next sweep. */
      console.error(`[reap-uploads] getVideoDetails failed for ${row.cloudflare_uid}:`, cause);
      skipped += 1;
      continue;
    }

    if (detail.readyToStream) {
      const update: Record<string, unknown> = { status: "ready" };
      if (typeof detail.duration === "number") update.duration = `${detail.duration} seconds`;
      if (detail.thumbnail) update.thumbnail_url = detail.thumbnail;
      const { error: updateError } = await supabase
        .from("videos")
        .update(update)
        .eq("id", row.id)
        .not("status", "in", "(ready,errored)");
      if (updateError) {
        console.error(`[reap-uploads] ready update failed for ${row.id}:`, updateError.message);
        skipped += 1;
      } else {
        readied += 1;
      }
      continue;
    }

    const state = detail.status?.state;
    if (state === "error") {
      await supabase
        .from("videos")
        .update({ status: "errored" })
        .eq("id", row.id)
        .not("status", "in", "(ready,errored)");
      failed += 1;
      continue;
    }
    if (state === "queued" || state === "inprogress" || state === "downloading") {
      const status: VideoStatus = state === "queued" ? "queued" : "processing";
      await supabase
        .from("videos")
        .update({ status })
        .eq("id", row.id)
        .not("status", "in", "(ready,errored)");
      progressing += 1;
      continue;
    }

    /* 'pendingupload' (or unknown): Cloudflare is still waiting for the bytes.
       Only reap once well past any plausible upload, and only after Cloudflare's
       copy is confirmed gone — delete it FIRST and keep the DB row (our only
       handle to the uid) until that succeeds, so a failed Cloudflare delete can
       never orphan the video. */
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs <= ABANDON_AFTER_MS) {
      pending += 1;
      continue;
    }
    try {
      await deleteVideo(row.cloudflare_uid);
    } catch (cause) {
      console.error(`[reap-uploads] Cloudflare delete failed for ${row.cloudflare_uid}:`, cause);
      skipped += 1;
      continue;
    }
    if (await deleteRow(supabase, row.id)) reaped += 1;
  }

  return NextResponse.json({
    scanned: rows.length,
    readied,
    failed,
    progressing,
    reaped,
    pending,
    skipped,
  });
}
