const PUBLIC_EXACT = [
  "/login",
  "/auth/callback",
  "/auth/invite",
  "/reset-password",
] as const;

const PUBLIC_PREFIXES = [
  "/review/",
  "/quote/",
  "/api/review/",
  "/api/quote/",
  "/api/webhooks/",
  "/api/prototype/session",
] as const;

export function isPublicRoute(pathname: string) {
  return PUBLIC_EXACT.includes(pathname as (typeof PUBLIC_EXACT)[number])
    || pathname === "/api/health"
    || pathname.startsWith("/api/health/")
    || PUBLIC_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

/**
 * Returns an internal path safe to preserve through sign-in. Protocol-relative
 * paths, encoded schemes, backslashes, and public callback routes are never a
 * valid post-auth destination.
 */
export function safeInternalPath(candidate: string | null | undefined) {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/home";
  try {
    // Decode before validation so encoded protocol-relative paths cannot be
    // turned into an external redirect by a downstream URL parser.
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) return "/home";
    const parsed = new URL(candidate, "https://andthenn.invalid");
    if (parsed.origin !== "https://andthenn.invalid" || isPublicRoute(parsed.pathname)) return "/home";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/home";
  }
}

export function loginPathFor(pathname: string, search: string) {
  const next = safeInternalPath(`${pathname}${search}`);
  return `/login?next=${encodeURIComponent(next)}`;
}
