import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const PENDING_GATE_PATH = "/pending";
const ALLOWED_WHILE_PENDING = new Set<string>([PENDING_GATE_PATH, "/settings"]);
/* The maintenance screen (which also hosts the admin sign-in) — the only page non-admins reach
   while MAINTENANCE_MODE is on. */
const MAINTENANCE_PATH = "/maintenance";

/* Only the public marketplace surfaces under /educators are anon-reachable: the directory itself and a
   per-educator public profile. The admin editors (/educators/[id]/edit, /educators/[id]/reviews) sit
   under the same prefix but must stay auth-gated, so match exactly rather than by prefix. */
function isPublicEducatorPath(path: string): boolean {
  return path === "/educators" || /^\/educators\/[^/]+$/.test(path);
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const maintenance = process.env.MAINTENANCE_MODE === "true";
  const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN;

  /* Optional token bypass: ?maint=<token> drops a cookie + continues to a clean URL, so a non-admin
     reviewer can preview during maintenance without a session. */
  if (maintenance && bypassToken && request.nextUrl.searchParams.get("maint") === bypassToken) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("maint");
    const res = NextResponse.redirect(clean);
    res.cookies.set("maint-bypass", bypassToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  }

  /* /maintenance only makes sense while in maintenance; bounce it home otherwise. */
  if (!maintenance && path === MAINTENANCE_PATH) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const tokenBypassed =
    maintenance && !!bypassToken && request.cookies.get("maint-bypass")?.value === bypassToken;
  const isMaintenancePath = path === MAINTENANCE_PATH;

  let supabaseResponse = NextResponse.next({
    request,
  });

  if (!hasEnvVars) {
    /* No Supabase config to identify an admin — send everyone to the maintenance screen. */
    if (maintenance && !tokenBypassed && !isMaintenancePath) {
      return NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url));
    }
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

  /* Resolve role once — reused by both the maintenance admin-bypass and the pending gate. */
  let role: string | undefined;
  let isApproved = true;
  if (user) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("role, is_approved")
      .eq("id", user.id)
      .maybeSingle();
    role = (profileRow as { role?: string; is_approved?: boolean } | null)?.role;
    isApproved = (profileRow as { is_approved?: boolean } | null)?.is_approved ?? true;
  }

  /* Maintenance gate: non-admins go to the maintenance screen (which hosts the admin sign-in). Admins,
     token-bypass holders, and the maintenance page itself pass through. */
  if (maintenance && !tokenBypassed && !isMaintenancePath && role !== "admin") {
    return NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url));
  }

  if (
    path !== "/" &&
    !user &&
    !path.startsWith("/login") &&
    !path.startsWith("/auth") &&
    !path.startsWith(MAINTENANCE_PATH) &&
    !path.startsWith("/privacy") &&
    !path.startsWith("/terms") &&
    !isPublicEducatorPath(path)
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && role === "educator" && isApproved === false) {
    const isAuthFlow = path.startsWith("/auth");
    const isAllowed =
      ALLOWED_WHILE_PENDING.has(path) || isAuthFlow || isPublicEducatorPath(path);
    if (!isAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = PENDING_GATE_PATH;
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
