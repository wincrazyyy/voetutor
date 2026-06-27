import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

const PENDING_GATE_PATH = "/pending";
const ALLOWED_WHILE_PENDING = new Set<string>([PENDING_GATE_PATH, "/settings"]);

export async function updateSession(request: NextRequest) {
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
