import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { StudentSetupToken } from "@/lib/types/database";

/**
 * Durable one-click setup link for educator-provisioned student accounts — the 5th sanctioned
 * createAdminClient importer, authorized by possession of the 192-bit student_setup_tokens
 * secret in the URL (analogous to the Stream webhook's HMAC). Resolves the token row, checks
 * the account is still awaiting first-password setup (profiles.must_change_password — the
 * natural single-use signal), then mints a FRESH short-lived Supabase recovery link and hands
 * off to the existing /auth/confirm route, which verifies the OTP, establishes the session,
 * and lands the student on /onboarding/set-password. Because the recovery link is generated
 * at click time its ~1h expiry never matters, and the durable token stays re-clickable for a
 * student who bails mid-flow. Link-preview/prefetch bots hitting this URL merely mint
 * throwaway recovery links (harmless — real single-use is the flag, cleared only after the
 * student sets a password). Never logs the token or the recovery hash; all failure modes
 * collapse to one generic redirect so the route is not an existence oracle beyond the secret.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = new URL(request.url).origin;
  const invalid = () => NextResponse.redirect(new URL("/auth/login?setup=invalid", origin));

  if (!token || token.length > 128) return invalid();

  const admin = createAdminClient();

  const { data: tokenRow } = await admin
    .from("student_setup_tokens")
    .select("user_id, revoked_at")
    .eq("token", token)
    .maybeSingle();
  const setup = tokenRow as Pick<StudentSetupToken, "user_id" | "revoked_at"> | null;
  if (!setup || setup.revoked_at !== null) return invalid();

  const { data: profileRow } = await admin
    .from("profiles")
    .select("must_change_password")
    .eq("id", setup.user_id)
    .maybeSingle();
  const flag = (profileRow as { must_change_password?: boolean } | null)?.must_change_password;
  if (typeof flag !== "boolean") return invalid();
  if (flag !== true) {
    return NextResponse.redirect(new URL("/auth/login?setup=done", origin));
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(setup.user_id);
  const email = userData?.user?.email;
  if (userError || !email) return invalid();

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) return invalid();

  const confirmUrl = new URL("/auth/confirm", origin);
  confirmUrl.searchParams.set("token_hash", hashedToken);
  confirmUrl.searchParams.set("type", "recovery");
  confirmUrl.searchParams.set("next", "/onboarding/set-password");
  return NextResponse.redirect(confirmUrl);
}
