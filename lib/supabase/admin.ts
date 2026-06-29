import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses ALL row-level security.
 *
 * SECURITY BOUNDARY: this module may be imported ONLY by trusted server
 * code that performs its own authorization FIRST:
 *   1. the Cloudflare Stream webhook route (authenticates by HMAC signature);
 *   2. the note download route (app/api/resources/[id]/download), which
 *      RLS-checks the caller's access to the resources row with the regular
 *      user client BEFORE using this client to mint a signed URL — the
 *      service-role client is used only for the storage mint, never to read
 *      rows on the user's behalf.
 *   3. deleteEducatorAccountAction (app/actions/educators.ts), which verifies
 *      the caller is an admin (and not deleting themselves) with the regular
 *      user session BEFORE constructing this client — it then needs the
 *      service role both to delete the auth.users row (auth admin API) and to
 *      DELETE rows that have no profiles DELETE policy under FORCE RLS.
 * It must never be imported by a client component, an UNAUTHORIZED server
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
