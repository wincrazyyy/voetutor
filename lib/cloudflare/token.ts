import "server-only";
import { SignJWT, importJWK } from "jose";

/**
 * Playback token lifetime. Cloudflare re-validates the token on every
 * HLS segment request, so this must comfortably outlast a single
 * lesson — a short token would break playback mid-video. A fresh token
 * is minted on every lesson page load.
 */
const TOKEN_TTL_SECONDS = 2 * 60 * 60;

/**
 * Self-signs a short-lived RS256 playback token scoped to one video.
 * Cloudflare verifies it against the public half of the signing key,
 * so no per-view API call is made and no rate limit applies.
 *
 * Server-only — the signing key must never reach the browser. Callers
 * must verify the viewer's access BEFORE minting a token.
 *
 * Cloudflare resolves the verifying key from `kid` in the token PAYLOAD,
 * not the JWT header — omitting it from the claims yields a 401
 * "failed to fetch verification key undefined" even with a valid header.
 */
export async function generateStreamToken(videoUid: string): Promise<string> {
  const rawJwk = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK;
  const keyId = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID;
  if (!rawJwk || !keyId) {
    throw new Error("Cloudflare Stream signing key is not configured.");
  }

  const jwk = JSON.parse(Buffer.from(rawJwk, "base64").toString("utf8"));
  const key = await importJWK(jwk, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ kid: keyId })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setSubject(videoUid)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + TOKEN_TTL_SECONDS)
    .sign(key);
}
