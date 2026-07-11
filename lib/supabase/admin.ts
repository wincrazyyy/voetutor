import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses ALL row-level security.
 *
 * SECURITY BOUNDARY: this module may be imported ONLY by trusted server
 * code that performs its own authorization FIRST:
 *   1. the Cloudflare Stream webhook route (authenticates by HMAC signature);
 *   2. the scheduled cron reapers (app/api/cron/reap-uploads and
 *      app/api/cron/reap-r2-notes), each authenticated by a CRON_SECRET bearer
 *      and running with no user session, so they legitimately span every
 *      educator's rows to reconcile external storage;
 *   3. deleteEducatorAccountAction (app/actions/educators.ts), which verifies
 *      the caller is an admin (and not deleting themselves) with the regular
 *      user session BEFORE constructing this client — it then needs the
 *      service role both to delete the auth.users row (auth admin API) and to
 *      DELETE rows that have no profiles DELETE policy under FORCE RLS;
 *   4. createStudentAccountAction (app/actions/student-accounts.ts), which
 *      verifies the caller is an approved educator who owns the target class
 *      (or an admin) with the regular user session BEFORE constructing this
 *      client — it then needs the service role only for
 *      auth.admin.createUser / the rollback deleteUser; the enrollment
 *      INSERT itself uses the caller's own RLS-checked client.
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
