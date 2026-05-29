import "server-only";

/**
 * Cloudflare Stream REST + GraphQL wrapper. Server-only — every call
 * carries the secret API token, which must never reach the browser.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export class CloudflareApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudflareApiError";
    this.status = status;
  }
}

function accountId(): string {
  const value = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!value) throw new CloudflareApiError("CLOUDFLARE_ACCOUNT_ID is not configured.", 500);
  return value;
}

function apiToken(): string {
  const value = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!value) throw new CloudflareApiError("CLOUDFLARE_STREAM_API_TOKEN is not configured.", 500);
  return value;
}

export interface CloudflareVideo {
  uid: string;
  readyToStream: boolean;
  status: { state: string; pctComplete?: string; errReasonCode?: string };
  duration: number;
  thumbnail: string;
}

export interface DirectUpload {
  uploadUrl: string;
  uid: string;
}

/**
 * Builds a tus `Upload-Metadata` header value: comma-separated
 * `key base64(value)` pairs. A `true` flag is emitted as a bare key.
 */
function buildUploadMetadata(entries: Record<string, string | boolean>): string {
  return Object.entries(entries)
    .map(([key, value]) => {
      if (value === false) return null;
      if (value === true) return key;
      return `${key} ${Buffer.from(value).toString("base64")}`;
    })
    .filter((part): part is string => part !== null)
    .join(",");
}

/**
 * Mints a one-time, resumable (tus) upload URL. The browser uploads
 * straight to this URL, so the API token never leaves the server. The
 * video is created with `requiresignedurls` — it is private from birth,
 * with no window in which a uid-only URL would play.
 */
export async function createTusUpload(params: {
  uploadLength: number;
  name: string;
  maxDurationSeconds: number;
  allowedOrigins?: string[];
}): Promise<DirectUpload> {
  const metadata: Record<string, string | boolean> = {
    name: params.name,
    maxdurationseconds: String(params.maxDurationSeconds),
    requiresignedurls: true,
  };
  if (params.allowedOrigins?.length) {
    metadata.allowedorigins = params.allowedOrigins.join(",");
  }

  const response = await fetch(`${API_BASE}/accounts/${accountId()}/stream?direct_user=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(params.uploadLength),
      "Upload-Metadata": buildUploadMetadata(metadata),
    },
  });

  if (response.status !== 201) {
    const detail = await response.text().catch(() => "");
    throw new CloudflareApiError(
      `Direct upload creation failed (${response.status}). ${detail}`.trim(),
      response.status,
    );
  }

  const uploadUrl = response.headers.get("Location");
  const uid = response.headers.get("stream-media-id");
  if (!uploadUrl || !uid) {
    throw new CloudflareApiError(
      "Direct upload response was missing the Location or stream-media-id header.",
      502,
    );
  }
  return { uploadUrl, uid };
}

/** Fetches the current encoding state of a video. */
export async function getVideoDetails(uid: string): Promise<CloudflareVideo> {
  const response = await fetch(`${API_BASE}/accounts/${accountId()}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${apiToken()}` },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new CloudflareApiError(`Failed to fetch video ${uid} (${response.status}).`, response.status);
  }
  return json.result as CloudflareVideo;
}

/** Deletes a video. A 404 is treated as success — the video is already gone. */
export async function deleteVideo(uid: string): Promise<void> {
  const response = await fetch(`${API_BASE}/accounts/${accountId()}/stream/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiToken()}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new CloudflareApiError(`Failed to delete video ${uid} (${response.status}).`, response.status);
  }
}

/** Runs a query against the Cloudflare GraphQL Analytics API. */
export async function queryStreamAnalytics<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${API_BASE}/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.errors) {
    throw new CloudflareApiError(`Stream analytics query failed (${response.status}).`, response.status);
  }
  return json.data as T;
}
