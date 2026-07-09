import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/stream/webhook (Cloudflare Stream webhook — verified by its own
     *   HMAC signature; must bypass the auth gate, not be redirected to login)
     * - api/cron/reap-uploads (scheduled upload reaper — authenticated by its
     *   own CRON_SECRET bearer; has no user session, so must bypass the gate)
     * - api/cron/reap-r2-notes (scheduled R2 orphan-note reaper — same
     *   CRON_SECRET bearer, no user session)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    "/((?!_next/static|_next/image|favicon.ico|api/stream/webhook|api/cron/reap-uploads|api/cron/reap-r2-notes|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
