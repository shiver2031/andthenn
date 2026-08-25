import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { prototypeRuntimeEnabled, reviewRuntimeEnabled, runtimeConfigurationIsValid } from "./lib/config";
import { PROTOTYPE_SESSION_COOKIE, REVIEW_PERSONA_COOKIE } from "./lib/prototype";
import { isPublicRoute, loginPathFor } from "./lib/route-policy";

export async function proxy(request: NextRequest) {
  if (isPublicRoute(request.nextUrl.pathname)) return NextResponse.next();
  const requestHeaders = new Headers(request.headers);
  // This is presentation context only. Every page and command still performs
  // its own actor/capability checks and never authorizes from this header.
  requestHeaders.set("x-andthenn-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (!runtimeConfigurationIsValid()) return new NextResponse("Service unavailable", { status: 503 });
  if (prototypeRuntimeEnabled() || reviewRuntimeEnabled()) {
    const hasSession = request.cookies.has(PROTOTYPE_SESSION_COOKIE) || (reviewRuntimeEnabled() && request.cookies.has(REVIEW_PERSONA_COOKIE));
    if (!hasSession) {
      if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      return NextResponse.redirect(new URL(loginPathFor(request.nextUrl.pathname, request.nextUrl.search), request.url));
    }
    return response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return new NextResponse("Service unavailable", { status: 503 });
  const supabase = createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const redirect = NextResponse.redirect(new URL(loginPathFor(request.nextUrl.pathname, request.nextUrl.search), request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

// Next's HMR endpoint is a WebSocket upgrade, not an application request.
// Let every `/_next/*` internal route bypass identity/prototype guards; only
// application pages and APIs should be evaluated by this proxy.
export const config = { matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest).*)"] };
