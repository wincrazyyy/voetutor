import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const PENDING_GATE_PATH = "/pending";
const ALLOWED_WHILE_PENDING = new Set<string>([PENDING_GATE_PATH, "/settings"]);

/* Self-contained maintenance screen (no external CSS/JS — _next assets are matcher-exempt). */
const MAINTENANCE_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><title>VOETutor — Maintenance</title>
<style>
  :root{color-scheme:dark}*{box-sizing:border-box}html,body{height:100%;margin:0}
  body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:radial-gradient(1200px 600px at 50% -10%,#0c2b27 0%,#061715 55%,#04100e 100%);
    color:#e8f4f1;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:560px;text-align:center}
  .crest{font-family:ui-serif,Georgia,serif;letter-spacing:.28em;font-size:13px;text-transform:uppercase;color:#9ec9c0;margin-bottom:28px}
  .crest b{color:#e0b341;font-weight:600}
  h1{font-family:ui-serif,Georgia,serif;font-weight:600;font-size:clamp(28px,6vw,44px);line-height:1.1;margin:0 0 14px;color:#f3faf8}
  p{font-size:16px;line-height:1.6;color:#a9ccc4;margin:0 auto;max-width:42ch}
  .rule{width:48px;height:2px;background:#16a394;margin:26px auto 0;border-radius:2px}
</style></head><body><main class="card">
  <div class="crest">Vault <b>of</b> Excellence</div>
  <h1>We&rsquo;ll be right back</h1>
  <p>VOETutor is undergoing brief scheduled maintenance. Thanks for your patience &mdash; please check back shortly.</p>
  <div class="rule"></div>
</main></body></html>`;

function maintenanceResponse() {
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "3600",
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * When MAINTENANCE_MODE === "true", every matched route returns a 503 maintenance screen (the Stream
 * webhook + cron are matcher-exempt, so they keep running). Optional bypass for the owner: set
 * MAINTENANCE_BYPASS_TOKEN and visit any URL with ?maint=<token> — it drops a cookie and lets that
 * browser through normally while everyone else still sees maintenance. Returns null when not gated.
 */
function maintenanceGate(request: NextRequest): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== "true") return null;

  const token = process.env.MAINTENANCE_BYPASS_TOKEN;
  const hasBypassCookie = !!token && request.cookies.get("maint-bypass")?.value === token;
  if (hasBypassCookie) return null;

  if (token && request.nextUrl.searchParams.get("maint") === token) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("maint");
    const res = NextResponse.redirect(clean);
    res.cookies.set("maint-bypass", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  }

  return maintenanceResponse();
}

export async function updateSession(request: NextRequest) {
  const maintenance = maintenanceGate(request);
  if (maintenance) return maintenance;

  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (
    path !== "/" &&
    !user &&
    !path.startsWith("/login") &&
    !path.startsWith("/auth") &&
    !path.startsWith("/privacy") &&
    !path.startsWith("/terms") &&
    !path.startsWith("/educators")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profileRow as { role?: string; is_approved?: boolean } | null)?.role;
    const isApproved = (profileRow as { is_approved?: boolean } | null)?.is_approved ?? true;

    if (role === "educator" && isApproved === false) {
      const isAuthFlow = path.startsWith("/auth");
      const isAllowed =
        ALLOWED_WHILE_PENDING.has(path) || isAuthFlow || path.startsWith("/educators");
      if (!isAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = PENDING_GATE_PATH;
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
