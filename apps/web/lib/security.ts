import { createHash, timingSafeEqual } from "node:crypto";

export function hashReviewToken(token: string) {
  const pepper = process.env.REVIEW_TOKEN_PEPPER;
  if (!pepper && process.env.NODE_ENV === "production") throw new Error("REVIEW_TOKEN_PEPPER is required");
  return createHash("sha256").update(`${pepper ?? "development-only"}:${token}`).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyGooglePushToken(authorization: string | null) {
  const audience = process.env.GOOGLE_PUBSUB_VERIFICATION_AUDIENCE;
  if (!audience && process.env.NODE_ENV !== "production") return true;
  if (!audience || !authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!response.ok) return false;
  const claims = await response.json() as { aud?: string; email_verified?: string; exp?: string };
  return claims.aud === audience && claims.email_verified === "true" && Number(claims.exp) * 1_000 > Date.now();
}
