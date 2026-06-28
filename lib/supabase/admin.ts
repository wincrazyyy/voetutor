import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses ALL row-level security.
 *
 * SECURITY BOUNDARY: this module may be imported ONLY by trusted server
 * route handlers that perform their own authorization first:
 *   1. the Cloudflare Stream webhook route (authenticates by HMAC signature);
 *   2. the note download route (app/api/resources/[id]/download), which
 *      RLS-checks the caller's access to the resources row with the regular
 *      user client BEFORE using this client to mint a signed URL — the
 *      service-role client is used only for the storage mint, never to read
 *      rows on the user's behalf.
 * It must never be imported by a client component, a user-facing server
 * action, a page, or a layout. The `server-only` import turns any such
 * misuse into a build error.
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
