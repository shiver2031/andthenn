import { and, createDatabase, eq, gt, isNull, or, reviewerSessions, reviewShares, reviewViewEvents, sql } from "@andthenn/db";
import { reviewerIdentitySchema } from "@andthenn/contracts";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { assertRuntimeConfiguration } from "../../../../../lib/config";
import { hashReviewToken } from "../../../../../lib/security";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try { assertRuntimeConfiguration(); } catch { return NextResponse.json({ error: "Service unavailable" }, { status: 503 }); }
  const parsed = reviewerIdentitySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Reviewer name is required", issues: parsed.error.issues }, { status: 400 });
  const { token } = await params; const { db } = createDatabase(); const secret = randomBytes(32).toString("base64url");
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(forwarded).digest("hex");
  try { const result = await db.transaction(async (tx) => {
    const [share] = await tx.select({ id: reviewShares.id, organizationId: reviewShares.organizationId }).from(reviewShares).where(and(eq(reviewShares.tokenHash, hashReviewToken(token)), eq(reviewShares.status, "ACTIVE"), or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())))).limit(1);
    if (!share) return null;
    const [recent] = await tx.select({ count: sql<number>`count(*)::int` }).from(reviewViewEvents).where(and(eq(reviewViewEvents.reviewShareId, share.id), eq(reviewViewEvents.ipHash, ipHash), gt(reviewViewEvents.viewedAt, new Date(Date.now() - 3_600_000))));
    if ((recent?.count ?? 0) >= 20) throw new Error("Reviewer session rate limit reached");
    const [session] = await tx.insert(reviewerSessions).values({ organizationId: share.organizationId, reviewShareId: share.id, displayName: parsed.data.displayName, email: parsed.data.email, sessionTokenHash: hashReviewToken(secret) }).returning({ id: reviewerSessions.id });
    await tx.insert(reviewViewEvents).values({ organizationId: share.organizationId, reviewShareId: share.id, reviewerSessionId: session!.id, ipHash, userAgent: request.headers.get("user-agent") });
    return { id: session!.id, token: secret };
  });
  return result ? NextResponse.json(result, { status: 201 }) : NextResponse.json({ error: "Share unavailable" }, { status: 404 });
  } catch (error) { const message = error instanceof Error ? error.message : "Unable to start review"; return NextResponse.json({ error: message }, { status: message.includes("rate limit") ? 429 : 409 }); }
}
