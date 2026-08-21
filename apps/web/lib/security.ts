import { createHash, timingSafeEqual } from "node:crypto";
import { createDatabase, sql } from "@andthenn/db";

export function hashReviewToken(token: string) {
  const pepper = process.env.REVIEW_TOKEN_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") throw new Error("REVIEW_TOKEN_PEPPER is required");
  return createHash("sha256").update(`${pepper ?? "development-only"}:${token}`).digest("hex");
}

export function hashQuoteToken(token: string) {
  const pepper = process.env.REVIEW_TOKEN_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") throw new Error("REVIEW_TOKEN_PEPPER is required");
  return createHash("sha256").update(`${pepper ?? "development-only"}:quote:${token}`).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hashes only a normalized client/network and opaque-token fingerprint. */
export function publicRateLimitSubject(request: Request, opaqueToken = "") {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const pepper = process.env.REVIEW_TOKEN_PEPPER ?? "development-only";
  return createHash("sha256").update(`${pepper}:rate-limit:${address}:${opaqueToken}`).digest("hex");
}

/**
 * Atomically consumes one fixed-window request allowance.  It intentionally
 * fails closed: an unavailable database must not make public links abusable.
 */
export async function consumePublicRateLimit(
  request: Request,
  scope: string,
  opaqueToken: string,
  maxAttempts: number,
  windowSeconds: number,
) {
  const { db } = createDatabase();
  const ipSubject = publicRateLimitSubject(request);
  const tokenSubject = publicRateLimitSubject(request, opaqueToken);
  const [ipRows, tokenRows] = await db.transaction(async (tx) => {
    const ipRows = await tx.execute<{ allowed: boolean }>(sql`
      select consume_public_rate_limit(${`${scope}.ip`}, ${ipSubject}, ${maxAttempts * 4}, ${windowSeconds}) as allowed
    `);
    const tokenRows = await tx.execute<{ allowed: boolean }>(sql`
      select consume_public_rate_limit(${`${scope}.token`}, ${tokenSubject}, ${maxAttempts}, ${windowSeconds}) as allowed
    `);
    return [ipRows, tokenRows] as const;
  });
  return ipRows[0]?.allowed === true && tokenRows[0]?.allowed === true;
}

export async function verifyGooglePushToken(authorization: string | null) {
  const audience = process.env.GOOGLE_PUBSUB_VERIFICATION_AUDIENCE;
  const expectedServiceAccount = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
  if (!audience && process.env.NODE_ENV !== "production") return true;
  if (!audience || !expectedServiceAccount || !authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!response.ok) return false;
  const claims = await response.json() as { aud?: string; email?: string; email_verified?: string; exp?: string; iss?: string };
  return claims.aud === audience
    && claims.email === expectedServiceAccount
    && claims.email_verified === "true"
    && (claims.iss === "accounts.google.com" || claims.iss === "https://accounts.google.com")
    && Number(claims.exp) * 1_000 > Date.now();
}
