/**
 * One-off: copy every legacy note PDF from Supabase Storage (class-resources) to Cloudflare R2 and
 * rewrite resources.file_url from the full Supabase URL to the bare R2 object key. See
 * plans/r2-notes-migration.md §7 (Option B).
 *
 * Runs OUTSIDE Vercel (no 4.5 MB body limit) with BOTH credential sets in env. Self-contained — no
 * app imports — so it runs under plain tsx. It loads .env.local automatically (any var already in the
 * shell wins), so you normally just need:
 *
 *   npx tsx scripts/migrate-notes-to-r2.ts            # dry run: lists what WOULD migrate
 *   npx tsx scripts/migrate-notes-to-r2.ts --apply    # actually copy bytes + rewrite file_url
 *
 * PREREQUISITE: apply migration 20260710090000_resources_file_url_r2_key.sql FIRST — the file_url
 * rewrite to a bare key violates the old '^https://' CHECK until it's relaxed.
 *
 * Idempotent: rows whose file_url is already a bare key are skipped, so it is safe to re-run.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_NOTES_BUCKET.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const LEGACY_BUCKET = "class-resources";
const LEGACY_MARKER = `/storage/v1/object/${LEGACY_BUCKET}/`;
const PAGE = 1000;

/** Minimal .env.local loader — populates process.env for keys not already set. Split on first '='. */
function loadEnvLocal(): void {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

/** Recover the object key from a legacy Supabase URL, or null if it isn't one (already migrated). */
function legacyKey(fileUrl: string): string | null {
  const i = fileUrl.indexOf(LEGACY_MARKER);
  if (i === -1) return null;
  const key = decodeURIComponent(fileUrl.slice(i + LEGACY_MARKER.length));
  if (!key || key.includes("..") || !key.toLowerCase().endsWith(".pdf")) return null;
  return key;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} in the environment (.env.local or shell).`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");

  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const accessKeyId = requireEnv("CLOUDFLARE_R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("CLOUDFLARE_R2_NOTES_BUCKET");

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(apply ? "APPLY mode — copying bytes and rewriting file_url.\n" : "DRY RUN — pass --apply to migrate.\n");

  let total = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  /* Keyset pagination by the immutable uuid PK, not OFFSET — this run UPDATEs file_url as it goes,
     which relocates tuples and would make an OFFSET scan skip rows within a single pass. */
  let cursor: string | null = null;
  for (;;) {
    let query = admin.from("resources").select("id, file_url");
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query.order("id", { ascending: true }).limit(PAGE);
    if (error) {
      console.error(`resources lookup failed: ${error.message}`);
      process.exit(1);
    }
    const rows = (data ?? []) as Array<{ id: string; file_url: string }>;
    for (const row of rows) {
      total += 1;
      const key = legacyKey(row.file_url);
      if (!key) {
        skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`WOULD migrate ${row.id} → ${key}`);
        migrated += 1;
        continue;
      }

      try {
        const { data: blob, error: dlError } = await admin.storage.from(LEGACY_BUCKET).download(key);
        if (dlError || !blob) throw new Error(dlError?.message ?? "download returned no data");
        const body = Buffer.from(await blob.arrayBuffer());

        await r2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: "application/pdf",
            ContentLength: body.length,
          }),
        );

        const { error: upError } = await admin
          .from("resources")
          .update({ file_url: key })
          .eq("id", row.id);
        if (upError) throw new Error(`file_url update failed (${upError.message}) — is migration 20260710090000 applied?`);

        console.log(`OK  ${row.id} → ${key} (${body.length} bytes)`);
        migrated += 1;
      } catch (cause) {
        console.error(`FAIL ${row.id} (${key}): ${(cause as Error).message}`);
        failed += 1;
      }
    }
    if (rows.length < PAGE) break;
    cursor = rows[rows.length - 1].id;
  }

  console.log(`\nDone. total=${total} ${apply ? "migrated" : "would-migrate"}=${migrated} skipped(already-R2)=${skipped} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

void main();
