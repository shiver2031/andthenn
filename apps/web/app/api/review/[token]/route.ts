import { and, annotations, createDatabase, eq, fileVersions, gt, idempotencyKeys, reviewComments, reviewerSessions, reviewShares } from "@andthenn/db";
import { reviewCommentSchema } from "@andthenn/contracts";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hashReviewToken } from "../../../../lib/security";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.DATABASE_URL) return NextResponse.json({ version: "V2", status: "ACTIVE", demo: true });
  const { db } = createDatabase();
  const [share] = await db.select({ id: reviewShares.id, fileVersionId: reviewShares.fileVersionId, expiresAt: reviewShares.expiresAt, downloadAllowed: reviewShares.downloadAllowed, versionNumber: fileVersions.versionNumber, originalFilename: fileVersions.filename }).from(reviewShares).innerJoin(fileVersions, eq(fileVersions.id, reviewShares.fileVersionId)).where(and(eq(reviewShares.tokenHash, hashReviewToken(token)), eq(reviewShares.status, "ACTIVE"), gt(reviewShares.expiresAt, new Date()))).limit(1);
  return share ? NextResponse.json(share) : NextResponse.json({ error: "Share unavailable" }, { status: 404 });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = reviewCommentSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid comment", issues: parsed.error.issues }, { status: 400 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ id: crypto.randomUUID(), demo: true }, { status: 201 });
  const { db } = createDatabase();
  const created = await db.transaction(async (tx) => {
    const [share] = await tx.select({ id: reviewShares.id, organizationId: reviewShares.organizationId, fileVersionId: reviewShares.fileVersionId }).from(reviewShares).where(and(eq(reviewShares.tokenHash, hashReviewToken(token)), eq(reviewShares.status, "ACTIVE"), gt(reviewShares.expiresAt, new Date()))).limit(1);
    if (!share) throw new Error("Share unavailable");
    const [session] = await tx.select({ id: reviewerSessions.id, name: reviewerSessions.displayName }).from(reviewerSessions).where(and(eq(reviewerSessions.id, parsed.data.reviewerSessionId), eq(reviewerSessions.reviewShareId, share.id))).limit(1);
    if (!session) throw new Error("Reviewer identity required");
    const requestHash = createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
    await tx.insert(idempotencyKeys).values({ organizationId: share.organizationId, key: parsed.data.idempotencyKey, operation: "review.comment", requestHash, expiresAt: new Date(Date.now() + 86_400_000) }).onConflictDoNothing();
    const [comment] = await tx.insert(reviewComments).values({ organizationId: share.organizationId, reviewShareId: share.id, fileVersionId: share.fileVersionId, reviewerSessionId: session.id, parentCommentId: parsed.data.parentCommentId, body: parsed.data.body }).returning({ id: reviewComments.id });
    if (comment && parsed.data.annotation.kind !== "GENERAL") {
      const value = parsed.data.annotation;
      await tx.insert(annotations).values({ organizationId: share.organizationId, reviewCommentId: comment.id, kind: value.kind, ...(value.kind === "TIMECODE" ? { timeMs: value.timeMs } : {}), ...(value.kind === "PDF_REGION" ? { page: value.page } : {}), ...("x" in value ? { xBasisPoints: Math.round(value.x * 10_000), yBasisPoints: Math.round(value.y * 10_000) } : {}), ...(value.kind === "IMAGE_REGION" || value.kind === "PDF_REGION" ? { widthBasisPoints: Math.round(value.width * 10_000), heightBasisPoints: Math.round(value.height * 10_000) } : {}) });
    }
    return comment;
  });
  return NextResponse.json(created, { status: 201 });
}
