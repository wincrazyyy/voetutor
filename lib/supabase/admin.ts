import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses ALL row-level security.
 *
 * SECURITY BOUNDARY: this module must be imported ONLY by the Cloudflare
 * Stream webhook route, which authenticates its caller by HMAC signature
 * verification. It must never be imported by a client component, a
 * user-facing server action, a page, or a layout. The `server-only`
 * import turns any such misuse into a build error.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Service-role Supabase client is not configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
