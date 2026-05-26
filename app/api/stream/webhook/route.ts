import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { VideoStatus } from "@/lib/types/database";

/**
 * Cloudflare Stream webhook. Notifies us when an uploaded video finishes
 * encoding. The `Webhook-Signature` header is the ONLY authentication —
 * this route is intentionally reachable unauthenticated (excluded from
 * the proxy matcher), so signature verification is mandatory.
 */

const REPLAY_WINDOW_SECONDS = 300;

interface StreamWebhookPayload {
  uid?: string;
  readyToStream?: boolean;
  status?: { state?: string; errReasonCode?: string };
  duration?: number;
  thumbnail?: string;
}

/**
 * Verifies the `time=<unix>,sig1=<hex>` signature header. The HMAC-SHA256
 * is computed over `${time}.${rawBody}` with the webhook secret. Stale
 * deliveries are rejected to blunt replay attacks.
 */
function verifySignature(header: string | null, body: string): boolean {
  const secret = process.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );
  const time = parts.time;
  const signature = parts.sig1;
  if (!time || !signature) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(time));
  if (!Number.isFinite(age) || age > REPLAY_WINDOW_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}

/** Collapses Cloudflare's encoding lifecycle onto our `video_status` enum. */
function mapStatus(payload: StreamWebhookPayload): VideoStatus {
  if (payload.readyToStream === true) return "ready";
  if (payload.status?.state === "error") return "errored";
  if (payload.status?.state === "queued") return "queued";
  return "processing";
}

export async function POST(request: NextRequest) {
  const body = await request.text();

  if (!verifySignature(request.headers.get("Webhook-Signature"), body)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  let payload: StreamWebhookPayload;
  try {
    payload = JSON.parse(body) as StreamWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }
  if (!payload.uid) {
    return NextResponse.json({ error: "Missing uid." }, { status: 400 });
  }

  try {
    const status = mapStatus(payload);
    const update: Record<string, unknown> = { status };
    if (status === "ready" && typeof payload.duration === "number") {
      update.duration = `${payload.duration} seconds`;
    }
    if (payload.thumbnail) {
      update.thumbnail_url = payload.thumbnail;
    }

    const supabase = createAdminClient();
    let query = supabase.from("videos").update(update).eq("cloudflare_uid", payload.uid);

    /* Idempotent: a late non-terminal event must not overwrite a row that
       already reached a terminal state. Terminal events write unconditionally,
       and a uid that matches no row is a harmless no-op (ack with 200). */
    if (status !== "ready" && status !== "errored") {
      query = query.not("status", "in", "(ready,errored)");
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: "Database update failed." }, { status: 500 });
    }
  } catch {
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
