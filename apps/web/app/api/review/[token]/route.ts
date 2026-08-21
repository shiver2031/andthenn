import {
  activityEvents,
  and,
  annotations,
  createDatabase,
  deliverables,
  eq,
  fileAssets,
  fileVersions,
  gt,
  idempotencyKeys,
  isNull,
  notifications,
  or,
  projects,
  reviewCommentRevisions,
  reviewComments,
  reviewerSessions,
  reviewShares,
  reviewHubs,
  reviewViewEvents,
  sql,
  taskAssignees,
  tasks,
} from "@andthenn/db";
import { reviewCommentSchema } from "@andthenn/contracts";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { consumePublicRateLimit, hashReviewToken } from "../../../../lib/security";
import { assertRuntimeConfiguration } from "../../../../lib/config";

const availableShare = (token: string) =>
  and(
    eq(reviewShares.tokenHash, hashReviewToken(token)),
    eq(reviewShares.status, "ACTIVE"),
    or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())),
  );

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { token } = await params;
  if (!await consumePublicRateLimit(request, "review.view", token, 120, 60)) {
    return NextResponse.json({ error: "Too many requests; try again shortly" }, { status: 429, headers: { "retry-after": "60" } });
  }
  const { db } = createDatabase();
  const [share] = await db
    .select({
      id: reviewShares.id,
      organizationId: reviewShares.organizationId,
      fileVersionId: reviewShares.fileVersionId,
      expiresAt: reviewShares.expiresAt,
      downloadAllowed: reviewShares.downloadAllowed,
      versionNumber: fileVersions.versionNumber,
      filename: fileVersions.filename,
      contentType: fileVersions.detectedContentType,
      declaredContentType: fileVersions.contentType,
      sizeBytes: fileVersions.sizeBytes,
      storageKey: fileVersions.storageKey,
      mediaMetadata: fileVersions.mediaMetadata,
      taskId: tasks.id,
      taskName: tasks.name,
      projectName: projects.name,
    })
    .from(reviewShares)
    .innerJoin(fileVersions, eq(fileVersions.id, reviewShares.fileVersionId))
    .innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId))
    .innerJoin(tasks, eq(tasks.id, fileAssets.taskId))
    .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .where(availableShare(token))
    .limit(1);
  if (!share || !share.storageKey)
    return NextResponse.json({ error: "Share unavailable" }, { status: 404 });
  const rows = await db
    .select({
      id: reviewComments.id,
      body: reviewComments.body,
      parentCommentId: reviewComments.parentCommentId,
      resolvedAt: reviewComments.resolvedAt,
      createdAt: reviewComments.createdAt,
      reviewerName: reviewerSessions.displayName,
      kind: annotations.kind,
      timeMs: annotations.timeMs,
      page: annotations.page,
      x: annotations.xBasisPoints,
      y: annotations.yBasisPoints,
      width: annotations.widthBasisPoints,
      height: annotations.heightBasisPoints,
    })
    .from(reviewComments)
    .leftJoin(
      reviewerSessions,
      eq(reviewerSessions.id, reviewComments.reviewerSessionId),
    )
    .leftJoin(annotations, eq(annotations.reviewCommentId, reviewComments.id))
    .where(
      and(
        eq(reviewComments.reviewShareId, share.id),
        eq(reviewComments.fileVersionId, share.fileVersionId),
      ),
    )
    .orderBy(reviewComments.createdAt);
  const mediaUrl = `/api/review/${encodeURIComponent(token)}/media`;
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256").update(forwarded).digest("hex");
  await db
    .insert(reviewViewEvents)
    .values({
      organizationId: share.organizationId,
      reviewShareId: share.id,
      ipHash,
      userAgent: request.headers.get("user-agent"),
    });
  const {
    storageKey: _storageKey,
    organizationId: _organizationId,
    declaredContentType,
    ...publicShare
  } = share;
  return NextResponse.json({
    ...publicShare,
    contentType: share.contentType ?? declaredContentType,
    mediaUrl,
    comments: rows.map((row) => ({
      ...row,
      x: row.x === null ? null : row.x / 10_000,
      y: row.y === null ? null : row.y / 10_000,
      width: row.width === null ? null : row.width / 10_000,
      height: row.height === null ? null : row.height / 10_000,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    assertRuntimeConfiguration();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  const { token } = await params;
  if (!await consumePublicRateLimit(request, "review.comment", token, 20, 60)) {
    return NextResponse.json({ error: "Comment rate limit reached; wait a minute and retry" }, { status: 429, headers: { "retry-after": "60" } });
  }
  const parsed = reviewCommentSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid comment", issues: parsed.error.issues },
      { status: 400 },
    );
  const { db } = createDatabase();
  try {
    const result = await db.transaction(async (tx) => {
      const [share] = await tx
        .select({
          id: reviewShares.id,
          organizationId: reviewShares.organizationId,
          fileVersionId: reviewShares.fileVersionId,
          taskId: reviewHubs.taskId,
        })
        .from(reviewShares)
        .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
        .where(availableShare(token))
        .limit(1);
      if (!share) throw new Error("Share unavailable");
      const [session] = await tx
        .select({ id: reviewerSessions.id, name: reviewerSessions.displayName })
        .from(reviewerSessions)
        .where(
          and(
            eq(reviewerSessions.id, parsed.data.reviewerSessionId),
            eq(reviewerSessions.reviewShareId, share.id),
            eq(
              reviewerSessions.sessionTokenHash,
              hashReviewToken(parsed.data.reviewerSessionToken),
            ),
          ),
        )
        .limit(1);
      if (!session) throw new Error("Reviewer identity required");
      const [recent] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewComments)
        .where(
          and(
            eq(reviewComments.reviewerSessionId, session.id),
            gt(reviewComments.createdAt, new Date(Date.now() - 60_000)),
          ),
        );
      const count = recent?.count ?? 0;
      if (count >= 20)
        throw new Error("Comment rate limit reached; wait a minute and retry");
      if (parsed.data.parentCommentId) {
        const [parent] = await tx
          .select({ id: reviewComments.id })
          .from(reviewComments)
          .where(
            and(
              eq(reviewComments.id, parsed.data.parentCommentId),
              eq(reviewComments.reviewShareId, share.id),
              eq(reviewComments.fileVersionId, share.fileVersionId),
            ),
          )
          .limit(1);
        if (!parent) throw new Error("Reply parent is outside this review");
      }
      const requestHash = createHash("sha256")
        .update(JSON.stringify(parsed.data))
        .digest("hex");
      const claimed = await tx
        .insert(idempotencyKeys)
        .values({
          organizationId: share.organizationId,
          key: parsed.data.idempotencyKey,
          operation: "review.comment",
          requestHash,
          expiresAt: new Date(Date.now() + 86_400_000),
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });
      if (!claimed[0]) {
        const [existing] = await tx
          .select()
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.organizationId, share.organizationId),
              eq(idempotencyKeys.key, parsed.data.idempotencyKey),
            ),
          )
          .limit(1);
        if (
          !existing ||
          existing.operation !== "review.comment" ||
          existing.requestHash !== requestHash
        )
          throw new Error("Idempotency key conflicts with a different request");
        if (!existing.responseBody)
          throw new Error("Identical comment request is still processing");
        return {
          response: existing.responseBody as { id: string },
          replay: true,
        };
      }
      const [comment] = await tx
        .insert(reviewComments)
        .values({
          organizationId: share.organizationId,
          reviewShareId: share.id,
          fileVersionId: share.fileVersionId,
          reviewerSessionId: session.id,
          parentCommentId: parsed.data.parentCommentId,
          body: parsed.data.body,
        })
        .returning({ id: reviewComments.id });
      if (!comment) throw new Error("Unable to create comment");
      if (parsed.data.annotation.kind !== "GENERAL") {
        const value = parsed.data.annotation;
        await tx
          .insert(annotations)
          .values({
            organizationId: share.organizationId,
            reviewCommentId: comment.id,
            kind: value.kind,
            ...(value.kind === "TIMECODE" ? { timeMs: value.timeMs } : {}),
            ...(value.kind === "PDF_REGION" ? { page: value.page } : {}),
            ...(value.kind === "IMAGE_POINT" ||
            value.kind === "IMAGE_REGION" ||
            value.kind === "PDF_REGION"
              ? {
                  xBasisPoints: Math.round(value.x * 10_000),
                  yBasisPoints: Math.round(value.y * 10_000),
                }
              : {}),
            ...(value.kind === "IMAGE_REGION" || value.kind === "PDF_REGION"
              ? {
                  widthBasisPoints: Math.round(value.width * 10_000),
                  heightBasisPoints: Math.round(value.height * 10_000),
                }
              : {}),
          });
      }
      await tx
        .insert(reviewCommentRevisions)
        .values({
          organizationId: share.organizationId,
          reviewCommentId: comment.id,
          action: "CREATED",
          after: {
            body: parsed.data.body,
            annotation: parsed.data.annotation,
            reviewerName: session.name,
          },
        });
      const [task] = await tx
        .select({
          stateKind: tasks.stateKind,
          currentStageId: tasks.currentWorkflowStageId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, share.taskId),
            eq(tasks.organizationId, share.organizationId),
          ),
        )
        .limit(1);
      if (task && task.stateKind === "WORKFLOW") {
        const changed = await tx
          .update(tasks)
          .set({
            stateKind: "CLIENT_FEEDBACK_RECEIVED",
            interruptedWorkflowStageId: task.currentStageId,
            currentWorkflowStageId: null,
            version: sql`${tasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, share.taskId),
              eq(tasks.stateKind, "WORKFLOW"),
              eq(tasks.currentWorkflowStageId, task.currentStageId!),
            ),
          )
          .returning({ id: tasks.id });
        if (changed.length) {
          const assignees = await tx
            .select({ membershipId: taskAssignees.membershipId })
            .from(taskAssignees)
            .where(
              and(
                eq(taskAssignees.taskId, share.taskId),
                isNull(taskAssignees.removedAt),
              ),
            );
          if (assignees.length)
            await tx
              .insert(notifications)
              .values(
                assignees.map(({ membershipId }) => ({
                  organizationId: share.organizationId,
                  recipientMembershipId: membershipId,
                  eventType: "review.feedback_received",
                  title: "Client feedback received",
                  body: `${session.name} added feedback to the shared version.`,
                  objectType: "TASK",
                  objectId: share.taskId,
                })),
              );
          await tx
            .insert(activityEvents)
            .values({
              organizationId: share.organizationId,
              eventType: "review.feedback_cycle_started",
              entityType: "TASK",
              entityId: share.taskId,
              source: "PUBLIC_REVIEW",
              snapshot: {
                reviewShareId: share.id,
                fileVersionId: share.fileVersionId,
                interruptedWorkflowStageId: task.currentStageId,
              },
            });
        }
      }
      await tx
        .update(idempotencyKeys)
        .set({ responseStatus: 201, responseBody: comment })
        .where(
          and(
            eq(idempotencyKeys.organizationId, share.organizationId),
            eq(idempotencyKeys.key, parsed.data.idempotencyKey),
          ),
        );
      return { response: comment, replay: false };
    });
    return NextResponse.json(result.response, {
      status: result.replay ? 200 : 201,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to add feedback";
    return NextResponse.json(
      { error: message },
      {
        status: message.includes("rate limit")
          ? 429
          : message.includes("unavailable")
            ? 404
            : 409,
      },
    );
  }
}
