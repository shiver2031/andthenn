"use server";
import { activityEvents, and, auditEvents, createDatabase, deliverables, eq, fileApprovals, finalDeliveries, fileAssets, fileVersions, gt, isNull, notifications, or, projects, reviewComments, reviewHubs, reviewShares, taskAssignees, taskReviewSelections, tasks } from "@andthenn/db";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { canReadProject, isResourceId } from "../../lib/resource-access";
import { lockActiveTask } from "../../lib/task-transaction";
import { demoModeEnabled } from "../../lib/config";

export async function submitClientReview(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const actor = await resolveActorContext();
  if (!actor || actor.role !== "CLIENT" || demoModeEnabled()) return { error: "An active Client session is required." };
  const shareId = String(form.get("shareId") ?? ""), decision = String(form.get("decision") ?? ""), note = String(form.get("note") ?? "").trim(), expectedVersion = Number(form.get("expectedVersion"));
  if (!isResourceId(shareId) || !["APPROVE", "CHANGES"].includes(decision) || !Number.isInteger(expectedVersion) || (decision === "CHANGES" && note.length < 3) || note.length > 5000) return { error: "Choose a decision and describe any requested changes (3–5000 characters)." };
  const { db } = createDatabase();
  try {
    const projectId = await db.transaction(async (tx) => {
      const [scope] = await tx.select({ taskId: reviewHubs.taskId }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).where(and(eq(reviewShares.id, shareId), eq(reviewShares.organizationId, actor.organizationId))).limit(1);
      if (!scope) throw new Error("Review unavailable.");
      await lockActiveTask(tx, actor, scope.taskId);
      const [share] = await tx.select({ id: reviewShares.id, fileVersionId: reviewShares.fileVersionId, taskId: tasks.id, taskName: tasks.name, projectId: projects.id, clientId: projects.clientId, stateKind: tasks.stateKind, stageId: tasks.currentWorkflowStageId, interruptedStageId: tasks.interruptedWorkflowStageId, executionStatus: tasks.executionStatus }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).innerJoin(tasks, eq(tasks.id, reviewHubs.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(reviewShares.id, shareId), eq(reviewShares.organizationId, actor.organizationId), eq(reviewShares.status, "ACTIVE"), or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())))).limit(1).for("update");
      if (!share || !canReadProject(actor, { id: share.projectId, clientId: share.clientId })) throw new Error("Review unavailable. Access may have expired or been revoked.");
      if (share.executionStatus === "COMPLETED") throw new Error("This work is complete. Ask your contact to reopen it before requesting changes.");
      const [version] = await tx.select({ id: fileVersions.id }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).where(and(eq(fileVersions.id, share.fileVersionId), eq(fileAssets.taskId, share.taskId), eq(fileVersions.processingStatus, "READY"))).limit(1);
      const [selection] = await tx.select({ fileVersionId: taskReviewSelections.fileVersionId }).from(taskReviewSelections).where(eq(taskReviewSelections.taskId, share.taskId)).limit(1);
      const [clearance] = await tx.select().from(fileApprovals).where(and(eq(fileApprovals.taskId, share.taskId), eq(fileApprovals.fileVersionId, share.fileVersionId), eq(fileApprovals.approvalKind, "INTERNAL"), isNull(fileApprovals.reopenedAt))).limit(1);
      if (!version || !selection || selection.fileVersionId !== share.fileVersionId || !clearance) throw new Error("A newer version is under review. Ask your contact for the current review.");
      const now = new Date();
      const [changed] = await tx.update(tasks).set({ version: expectedVersion + 1, updatedAt: now, ...(decision === "CHANGES" ? { stateKind: "CLIENT_FEEDBACK_RECEIVED" as const, interruptedWorkflowStageId: share.stageId ?? share.interruptedStageId, currentWorkflowStageId: null, executionStatus: "IN_PROGRESS" as const, completionRequestedAt: null, completionRequestedByMembershipId: null, completionReviewerMembershipId: null, completionConfirmedAt: null, completionConfirmedByMembershipId: null } : {}) }).where(and(eq(tasks.id, share.taskId), eq(tasks.version, expectedVersion))).returning({ id: tasks.id });
      if (!changed) throw new Error("The review changed. Reload the project before deciding.");
      const [approval] = await tx.select({ id: fileApprovals.id, fileVersionId: fileApprovals.fileVersionId }).from(fileApprovals).where(and(eq(fileApprovals.taskId, share.taskId), eq(fileApprovals.approvalKind, "CLIENT"), isNull(fileApprovals.reopenedAt))).limit(1);
      if (decision === "APPROVE") {
        if (approval) throw new Error("A Client decision is already recorded. Ask the project owner to reopen the review before changing it.");
        if (!approval) await tx.insert(fileApprovals).values({ organizationId: actor.organizationId, taskId: share.taskId, fileVersionId: share.fileVersionId, approvedByMembershipId: actor.membershipId, approvalKind: "CLIENT", approvalSource: "PORTAL", clientApprover: actor.displayName, note });
        await tx.update(fileVersions).set({ lockedAt: now, lockedReason: "CLIENT_APPROVED" }).where(and(eq(fileVersions.id, share.fileVersionId), isNull(fileVersions.lockedAt)));
      } else {
        await tx.update(finalDeliveries).set({ withdrawnAt: now, withdrawnByMembershipId: actor.membershipId, withdrawalReason: note }).where(and(eq(finalDeliveries.taskId, share.taskId), isNull(finalDeliveries.withdrawnAt)));
        await tx.update(fileApprovals).set({ reopenedAt: now, reopenedByMembershipId: actor.membershipId, reopenReason: note }).where(and(eq(fileApprovals.taskId, share.taskId), isNull(fileApprovals.reopenedAt)));
      }
      await tx.insert(reviewComments).values({ organizationId: actor.organizationId, reviewShareId: share.id, fileVersionId: share.fileVersionId, internalAuthorMembershipId: actor.membershipId, body: `${actor.displayName} ${decision === "APPROVE" ? "approved this version" : "requested changes"}${note ? `: ${note}` : "."}`, resolvedAt: decision === "APPROVE" ? now : null, resolvedByMembershipId: decision === "APPROVE" ? actor.membershipId : null });
      const eventType = decision === "APPROVE" ? "review.client_approved" : "review.client_changes_requested";
      await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType, entityType: "TASK", entityId: share.taskId, source: "CLIENT_PORTAL", snapshot: { shareId, fileVersionId: share.fileVersionId, decision } });
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, source: "CLIENT_PORTAL", action: eventType, objectType: "TASK", objectId: share.taskId, after: { shareId, fileVersionId: share.fileVersionId, decision, note }, correlationId: crypto.randomUUID() });
      const assignees = await tx.select({ membershipId: taskAssignees.membershipId }).from(taskAssignees).where(and(eq(taskAssignees.taskId, share.taskId), isNull(taskAssignees.removedAt)));
      const recipients = [...new Set(assignees.map((row) => row.membershipId))];
      if (recipients.length) await tx.insert(notifications).values(recipients.map((recipientMembershipId) => ({ organizationId: actor.organizationId, recipientMembershipId, eventType, title: decision === "APPROVE" ? "Client approved the version" : "Client requested changes", body: share.taskName, objectType: "TASK", objectId: share.taskId })));
      revalidatePath(`/tasks/${share.taskId}`);
      return share.projectId;
    });
    for (const path of [`/projects/${projectId}`, "/home", "/files", "/notifications"]) revalidatePath(path);
    return { success: decision === "APPROVE" ? "Version approved. The team will publish final delivery separately." : "Changes sent to the team." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to save your decision. Please retry." }; }
}
