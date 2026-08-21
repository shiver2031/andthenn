"use server";

import {
  activityEvents,
  and,
  assetRights,
  auditEvents,
  createDatabase,
  deliverables,
  eq,
  fileApprovals,
  fileAssets,
  fileVersions,
  isNull,
  outboxEvents,
  projects,
  reviewCommentRevisions,
  reviewComments,
  reviewHubs,
  reviewShares,
  sql,
  tasks,
  workflowStages,
  workflows,
} from "@andthenn/db";
import { authorize } from "@andthenn/domain";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { demoModeEnabled } from "../../../lib/config";
import {
  resolveActorContext,
  type ActorContext,
} from "../../../lib/actor-context";
import { hashReviewToken } from "../../../lib/security";

const field = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim();
const required = (form: FormData, name: string) => {
  const value = field(form, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function actorOrThrow() {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  return actor;
}

async function taskScope(
  db: ReturnType<typeof createDatabase>["db"],
  actor: ActorContext,
  taskId: string,
) {
  const [row] = await db
    .select({ taskId: tasks.id, projectId: projects.id })
    .from(tasks)
    .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .where(
      and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId)),
    )
    .limit(1);
  if (!row) throw new Error("Task not found");
  return row;
}

async function audit(
  tx: ReturnType<typeof createDatabase>["db"],
  actor: ActorContext,
  action: string,
  objectType: string,
  objectId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  await tx
    .insert(auditEvents)
    .values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      actorSnapshot: `${actor.displayName} <${actor.email}>`,
      source: "SERVER_ACTION",
      action,
      objectType,
      objectId,
      before: before ?? null,
      after: after ?? null,
      reason: reason || null,
      correlationId: crypto.randomUUID(),
    });
  await tx
    .insert(activityEvents)
    .values({
      organizationId: actor.organizationId,
      actorMembershipId: actor.membershipId,
      eventType: action,
      entityType: objectType,
      entityId: objectId,
      source: "SERVER_ACTION",
      snapshot: after ?? {},
    });
}

export async function createReviewShare(form: FormData) {
  const actor = await actorOrThrow();
  const taskId = required(form, "taskId"),
    fileVersionId = required(form, "fileVersionId");
  const { db } = createDatabase();
  const scope = await taskScope(db, actor, taskId);
  authorize(actor, "reviews:share", {
    ...scope,
    explicitlyGranted:
      actor.role === "MANAGER" || actor.reviewShareTaskIds.has(taskId),
  });
  const expiryValue = field(form, "expiresAt");
  const expiresAt = expiryValue ? new Date(expiryValue) : null;
  if (
    expiresAt &&
    (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())
  )
    throw new Error("Expiry must be in the future");
  const token = randomBytes(32).toString("base64url");
  const channel = field(form, "channel") || "IN_APP";
  if (!["IN_APP", "EMAIL", "WHATSAPP"].includes(channel))
    throw new Error("Invalid share channel");
  const share = await db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: fileVersions.id })
      .from(fileVersions)
      .innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId))
      .where(
        and(
          eq(fileVersions.id, fileVersionId),
          eq(fileVersions.organizationId, actor.organizationId),
          eq(fileAssets.taskId, taskId),
          eq(fileVersions.processingStatus, "READY"),
        ),
      )
      .limit(1);
    if (!version)
      throw new Error(
        "Only a ready version belonging to this task can be shared",
      );
    await tx
      .insert(reviewHubs)
      .values({ organizationId: actor.organizationId, taskId })
      .onConflictDoNothing();
    const [hub] = await tx
      .select({ id: reviewHubs.id })
      .from(reviewHubs)
      .where(
        and(
          eq(reviewHubs.taskId, taskId),
          eq(reviewHubs.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!hub) throw new Error("Unable to create review hub");
    const recipient = field(form, "recipient") || null,
      message = field(form, "message") || null;
    if (
      (channel === "EMAIL" || channel === "WHATSAPP") &&
      (!recipient || !message)
    )
      throw new Error(
        "A recipient and message are required for provider delivery",
      );
    const [created] = await tx
      .insert(reviewShares)
      .values({
        organizationId: actor.organizationId,
        reviewHubId: hub.id,
        fileVersionId,
        tokenHash: hashReviewToken(token),
        status: "ACTIVE",
        expiresAt,
        downloadAllowed: form.get("downloadAllowed") === "on",
        recipientSnapshot: recipient,
        messageSnapshot: message,
        deliveryChannel: channel as "IN_APP" | "EMAIL" | "WHATSAPP",
        createdByMembershipId: actor.membershipId,
        sharedAt: new Date(),
      })
      .returning({ id: reviewShares.id });
    if (channel !== "IN_APP")
      await tx
        .insert(outboxEvents)
        .values({
          organizationId: actor.organizationId,
          eventType: "review.share_deliver",
          aggregateType: "REVIEW_SHARE",
          aggregateId: created!.id,
          payload: {
            reviewShareId: created!.id,
            channel,
            recipient,
            message,
            reviewUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/review/${token}`,
            subject: `Review requested: ${scope.taskId}`,
          },
          idempotencyKey: `review.share.deliver:${created!.id}`,
          correlationId: crypto.randomUUID(),
        });
    if (expiresAt)
      await tx
        .insert(outboxEvents)
        .values({
          organizationId: actor.organizationId,
          eventType: "review.share_expire",
          aggregateType: "REVIEW_SHARE",
          aggregateId: created!.id,
          payload: { reviewShareId: created!.id },
          idempotencyKey: `review.share.expire:${created!.id}`,
          correlationId: crypto.randomUUID(),
          availableAt: expiresAt,
        });
    await audit(
      tx as never,
      actor,
      "review.share_created",
      "REVIEW_SHARE",
      created!.id,
      null,
      {
        taskId,
        fileVersionId,
        channel,
        recipient,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    );
    return created!;
  });
  revalidatePath(`/tasks/${taskId}`);
  return {
    id: share.id,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/review/${token}`,
  };
}

export async function revokeReviewShare(form: FormData) {
  const actor = await actorOrThrow();
  const taskId = required(form, "taskId"),
    shareId = required(form, "shareId");
  const { db } = createDatabase();
  const scope = await taskScope(db, actor, taskId);
  authorize(actor, "reviews:share", {
    ...scope,
    explicitlyGranted:
      actor.role === "MANAGER" || actor.reviewShareTaskIds.has(taskId),
  });
  await db.transaction(async (tx) => {
    const [changed] = await tx
      .update(reviewShares)
      .set({ status: "REVOKED", revokedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(reviewShares.id, shareId),
          eq(reviewShares.organizationId, actor.organizationId),
          eq(reviewShares.status, "ACTIVE"),
        ),
      )
      .returning({ id: reviewShares.id });
    if (!changed) throw new Error("Active share not found");
    await audit(
      tx as never,
      actor,
      "review.share_revoked",
      "REVIEW_SHARE",
      shareId,
      { status: "ACTIVE" },
      { status: "REVOKED" },
    );
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function resolveReviewComment(form: FormData) {
  const actor = await actorOrThrow();
  const taskId = required(form, "taskId"),
    commentId = required(form, "commentId");
  const { db } = createDatabase();
  const scope = await taskScope(db, actor, taskId);
  authorize(actor, "reviews:comment", scope);
  await db.transaction(async (tx) => {
    const [comment] = await tx
      .select({ id: reviewComments.id, resolvedAt: reviewComments.resolvedAt })
      .from(reviewComments)
      .innerJoin(
        reviewShares,
        eq(reviewShares.id, reviewComments.reviewShareId),
      )
      .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
      .where(
        and(
          eq(reviewComments.id, commentId),
          eq(reviewComments.organizationId, actor.organizationId),
          eq(reviewHubs.taskId, taskId),
        ),
      )
      .limit(1);
    if (!comment) throw new Error("Comment not found");
    const resolvedAt = comment.resolvedAt ? null : new Date();
    await tx
      .update(reviewComments)
      .set({
        resolvedAt,
        resolvedByMembershipId: resolvedAt ? actor.membershipId : null,
      })
      .where(eq(reviewComments.id, commentId));
    await tx
      .insert(reviewCommentRevisions)
      .values({
        organizationId: actor.organizationId,
        reviewCommentId: commentId,
        actorMembershipId: actor.membershipId,
        action: resolvedAt ? "RESOLVED" : "REOPENED",
        before: { resolvedAt: comment.resolvedAt },
        after: { resolvedAt },
      });
    if (resolvedAt) {
      const [outstanding] = await tx
        .select({ id: reviewComments.id })
        .from(reviewComments)
        .innerJoin(
          reviewShares,
          eq(reviewShares.id, reviewComments.reviewShareId),
        )
        .innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId))
        .where(
          and(
            eq(reviewHubs.taskId, taskId),
            eq(reviewComments.organizationId, actor.organizationId),
            isNull(reviewComments.resolvedAt),
          ),
        )
        .limit(1);
      if (!outstanding)
        await tx
          .update(tasks)
          .set({
            stateKind: "WORKFLOW",
            currentWorkflowStageId: tasks.interruptedWorkflowStageId,
            interruptedWorkflowStageId: null,
            version: sql`${tasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tasks.id, taskId),
              eq(tasks.stateKind, "CLIENT_FEEDBACK_RECEIVED"),
            ),
          );
    }
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function approveFileVersion(form: FormData) {
  const actor = await actorOrThrow();
  const taskId = required(form, "taskId"),
    fileVersionId = required(form, "fileVersionId");
  const expectedVersion = Number(required(form, "expectedTaskVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0)
    throw new Error("Invalid task version");
  const { db } = createDatabase();
  const scope = await taskScope(db, actor, taskId);
  authorize(actor, "reviews:approve", {
    ...scope,
    isPrimaryOwner: actor.primaryTaskIds.has(taskId),
  });
  await db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: fileVersions.id })
      .from(fileVersions)
      .innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId))
      .where(
        and(
          eq(fileVersions.id, fileVersionId),
          eq(fileVersions.organizationId, actor.organizationId),
          eq(fileVersions.processingStatus, "READY"),
          eq(fileAssets.taskId, taskId),
        ),
      )
      .limit(1);
    if (!version) throw new Error("Ready version not found for task");
    const [changedTask] = await tx
      .update(tasks)
      .set({
        stateKind: "COMPLETED",
        currentWorkflowStageId: null,
        interruptedWorkflowStageId: null,
        completedAt: new Date(),
        version: expectedVersion + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.organizationId, actor.organizationId),
          eq(tasks.version, expectedVersion),
        ),
      )
      .returning({ id: tasks.id });
    if (!changedTask) throw new Error("Task changed; refresh before approving");
    await tx
      .insert(fileApprovals)
      .values({
        organizationId: actor.organizationId,
        taskId,
        fileVersionId,
        approvedByMembershipId: actor.membershipId,
        note: field(form, "note") || null,
      });
    await tx
      .update(fileVersions)
      .set({ lockedAt: new Date(), lockedReason: "APPROVED" })
      .where(eq(fileVersions.id, fileVersionId));
    const [delivery] = await tx
      .select({ id: deliverables.id })
      .from(deliverables)
      .innerJoin(tasks, eq(tasks.deliverableId, deliverables.id))
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (delivery) {
      const [remaining] = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.deliverableId, delivery.id),
            sql`${tasks.id} <> ${taskId}`,
            sql`${tasks.stateKind} <> 'COMPLETED'`,
          ),
        )
        .limit(1);
      if (!remaining)
        await tx
          .update(deliverables)
          .set({
            status: "READY_FOR_MANAGER_CONFIRMATION",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(deliverables.id, delivery.id),
              sql`${deliverables.status} in ('OPEN','REOPENED')`,
            ),
          );
    }
    await audit(
      tx as never,
      actor,
      "file.version_approved",
      "FILE_VERSION",
      fileVersionId,
      null,
      { taskId, completed: true },
    );
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function reopenFileApproval(form: FormData) {
  const actor = await actorOrThrow();
  if (actor.role !== "MANAGER") throw new Error("Manager permission required");
  const taskId = required(form, "taskId"),
    reason = required(form, "reason");
  if (reason.length < 3)
    throw new Error("A meaningful reopen reason is required");
  const { db } = createDatabase();
  const scope = await taskScope(db, actor, taskId);
  await db.transaction(async (tx) => {
    const [approval] = await tx
      .select()
      .from(fileApprovals)
      .where(
        and(
          eq(fileApprovals.taskId, taskId),
          eq(fileApprovals.organizationId, actor.organizationId),
          isNull(fileApprovals.reopenedAt),
        ),
      )
      .limit(1);
    if (!approval) throw new Error("Active task approval not found");
    const [stage] = await tx
      .select({ id: workflowStages.id })
      .from(workflowStages)
      .innerJoin(workflows, eq(workflows.id, workflowStages.workflowId))
      .where(
        and(
          eq(workflows.projectId, scope.projectId),
          eq(workflows.organizationId, actor.organizationId),
        ),
      )
      .orderBy(workflowStages.position)
      .limit(1);
    if (!stage) throw new Error("Project workflow has no reopen stage");
    await tx
      .update(fileApprovals)
      .set({
        reopenedAt: new Date(),
        reopenedByMembershipId: actor.membershipId,
        reopenReason: reason,
      })
      .where(eq(fileApprovals.id, approval.id));
    await tx
      .update(tasks)
      .set({
        stateKind: "WORKFLOW",
        currentWorkflowStageId: stage.id,
        interruptedWorkflowStageId: null,
        completedAt: null,
        version: sql`${tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await tx
      .update(deliverables)
      .set({
        status: "REOPENED",
        confirmedAt: null,
        confirmedByMembershipId: null,
        reopenReason: reason,
        updatedAt: new Date(),
      })
      .where(
        eq(
          deliverables.id,
          (
            await tx
              .select({ id: deliverables.id })
              .from(deliverables)
              .innerJoin(tasks, eq(tasks.deliverableId, deliverables.id))
              .where(eq(tasks.id, taskId))
              .limit(1)
          )[0]!.id,
        ),
      );
    await tx
      .update(projects)
      .set({
        status: "REOPENED",
        reopenedAt: new Date(),
        reopenReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, scope.projectId));
    await audit(
      tx as never,
      actor,
      "file.approval_reopened",
      "FILE_APPROVAL",
      approval.id,
      { fileVersionId: approval.fileVersionId, reopenedAt: null },
      {
        fileVersionId: approval.fileVersionId,
        reopenedAt: new Date(),
        lockedVersionPreserved: true,
      },
      reason,
    );
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/projects/${scope.projectId}`);
}

export async function createAssetRight(form: FormData) {
  const actor = await actorOrThrow();
  if (actor.role !== "MANAGER") throw new Error("Manager permission required");
  const taskId = required(form, "taskId"),
    fileAssetId = required(form, "fileAssetId"),
    territory = required(form, "territory"),
    kind = required(form, "kind");
  const validFrom = field(form, "validFrom") || null,
    validUntil = field(form, "validUntil") || null;
  if (validFrom && validUntil && validUntil < validFrom)
    throw new Error("Rights end date must not precede its start date");
  const channels = field(form, "channels")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const { db } = createDatabase();
  await taskScope(db, actor, taskId);
  await db.transaction(async (tx) => {
    const [asset] = await tx
      .select({ id: fileAssets.id })
      .from(fileAssets)
      .where(
        and(
          eq(fileAssets.id, fileAssetId),
          eq(fileAssets.taskId, taskId),
          eq(fileAssets.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!asset) throw new Error("File asset not found for task");
    const [created] = await tx
      .insert(assetRights)
      .values({
        organizationId: actor.organizationId,
        fileAssetId,
        kind,
        territory,
        channels,
        validFrom,
        validUntil,
        documentFileVersionId: field(form, "documentFileVersionId") || null,
        notes: field(form, "notes") || null,
        createdByMembershipId: actor.membershipId,
      })
      .returning({ id: assetRights.id });
    await audit(
      tx as never,
      actor,
      "asset.right_created",
      "ASSET_RIGHT",
      created!.id,
      null,
      { fileAssetId, kind, territory, channels, validFrom, validUntil },
    );
    if (validUntil) {
      for (const days of [30, 7])
        await tx
          .insert(outboxEvents)
          .values({
            organizationId: actor.organizationId,
            eventType: "rights.expiry_alert",
            aggregateType: "ASSET_RIGHT",
            aggregateId: created!.id,
            payload: { assetRightId: created!.id, days },
            idempotencyKey: `rights:${created!.id}:${days}`,
            correlationId: crypto.randomUUID(),
            availableAt: new Date(
              new Date(`${validUntil}T00:00:00Z`).getTime() - days * 86_400_000,
            ),
          })
          .onConflictDoNothing();
    }
  });
  revalidatePath(`/tasks/${taskId}`);
}
