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
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    "/((?!_next/static|_next/image|favicon.ico|api/stream/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
