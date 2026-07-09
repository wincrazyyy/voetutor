import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (S3-compatible) wrapper for the notes (PDF) byte store. Server-only: the R2
 * credentials sign every request and must never reach the browser, which only ever receives an opaque
 * presigned URL. Mirrors the trust boundary of lib/cloudflare/client.ts and lib/supabase/admin.ts.
 *
 * R2 has no per-user auth/RLS — the app is the SOLE gatekeeper. Callers MUST authorize the request
 * before minting any presigned URL. Node.js runtime only (server actions + route handlers), never
 * Edge/middleware (the SDK needs Node crypto/fs). Presigning is a pure local signing op (no network
 * round-trip), so it is cheap inline. See plans/r2-notes-migration.md.
 *
 * Env (server-only): CLOUDFLARE_ACCOUNT_ID (shared with Stream — the R2 account id IS the CF account
 * id), CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_NOTES_BUCKET.
 */

const PUT_EXPIRY_SECONDS = 600;
const GET_EXPIRY_SECONDS = 600;

let cachedClient: S3Client | null = null;

/** True when all four R2 env vars are present (lets callers degrade gracefully when unconfigured). */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY &&
      process.env.CLOUDFLARE_R2_NOTES_BUCKET,
  );
}

function client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 is not configured.");
  }
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function bucket(): string {
  const name = process.env.CLOUDFLARE_R2_NOTES_BUCKET;
  if (!name) throw new Error("CLOUDFLARE_R2_NOTES_BUCKET is not configured.");
  return name;
}

/**
 * Presigned PUT for a browser-direct upload. Pinning ContentType bakes it into the signature, so a
 * client PUTting a different Content-Type gets 403 SignatureDoesNotMatch — an educator can't smuggle
 * a non-PDF through a PDF-scoped URL. Size can't be pinned on a presigned PUT (browsers set
 * Content-Length automatically), so the server enforces the cap authoritatively via headNoteSize.
 */
export function presignNotePut(key: string): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: "application/pdf" }),
    { expiresIn: PUT_EXPIRY_SECONDS },
  );
}

/**
 * Presigned GET for the download route. 10-minute window so a large PDF pulled over a slow link (or a
 * viewer issuing range requests) doesn't outlive the URL. The row is already authorized before this
 * is minted.
 */
export function presignNoteGet(key: string): Promise<string> {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: GET_EXPIRY_SECONDS },
  );
}

/**
 * Authoritative object size from R2 (HeadObject). Returns the byte length, or null when the object is
 * missing OR the head fails for any reason — the caller treats null as "reject" (fail closed) rather
 * than trusting the client-reported size.
 */
export async function headNoteSize(key: string): Promise<number | null> {
  try {
    const out = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return typeof out.ContentLength === "number" ? out.ContentLength : null;
  } catch {
    return null;
  }
}

/** Best-effort batched delete (up to 1000 keys/call). DeleteObjects is a FREE R2 op. Never throws. */
export async function deleteNoteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  for (let i = 0; i < unique.length; i += 1000) {
    const batch = unique.slice(i, i + 1000);
    try {
      await client().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    } catch {
      /* best-effort */
    }
  }
}

/**
 * Wipe every object under `${prefix}/` (account-deletion reap). ListObjectsV2 (Class A) + DeleteObjects
 * (free). Never throws.
 */
export async function wipeNotePrefix(prefix: string): Promise<void> {
  try {
    let token: string | undefined;
    do {
      const out = await client().send(
        new ListObjectsV2Command({ Bucket: bucket(), Prefix: `${prefix}/`, ContinuationToken: token }),
      );
      const keys = (out.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => Boolean(k));
      await deleteNoteObjects(keys);
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
  } catch {
    /* best-effort */
  }
}

export interface NoteObjectSummary {
  key: string;
  lastModified: Date | null;
}

/**
 * Lists every object in the notes bucket (paginated). Used by the scheduled orphan reaper to find R2
 * objects with no matching resources row. lastModified drives the min-age guard so a just-uploaded,
 * not-yet-registered object is never reaped.
 */
export async function listNoteObjects(): Promise<NoteObjectSummary[]> {
  const out: NoteObjectSummary[] = [];
  let token: string | undefined;
  do {
    const page = await client().send(
      new ListObjectsV2Command({ Bucket: bucket(), ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) out.push({ key: obj.Key, lastModified: obj.LastModified ?? null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}
