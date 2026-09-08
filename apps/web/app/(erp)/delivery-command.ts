"use server";
import { and, auditEvents, activityEvents, createDatabase, eq, fileApprovals, fileVersions, finalDeliveries, isNull, taskReviewSelections, tasks } from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { lockActiveTask } from "../../lib/task-transaction";
import { isResourceId } from "../../lib/resource-access";
import { approveFileVersion } from "./tasks/review-actions";

export async function runDeliveryCommand(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  try {
    if (form.get("command") === "clear") { await approveFileVersion(form); return { success: "Cleared for Client review. Client approval and delivery are still required." }; }
    const actor = await resolveActorContext();
    if (!actor || actor.role === "CLIENT" || demoModeEnabled()) throw new Error("Active internal access required.");
    const taskId = String(form.get("taskId") ?? ""), versionId = String(form.get("fileVersionId") ?? ""), expected = Number(form.get("expectedTaskVersion")), command = form.get("command");
    if (!isResourceId(taskId) || !isResourceId(versionId) || !Number.isInteger(expected)) throw new Error("Choose a current task version.");
    const { db } = createDatabase();
    const projectId = await db.transaction(async (tx) => {
      const locked = await lockActiveTask(tx, actor, taskId);
      if (!isOperationalLeader(actor.role) && locked.primary?.membershipId !== actor.membershipId) throw new Error("Only the primary owner or leadership can approve or deliver.");
      if (locked.task.version !== expected || locked.task.executionStatus === "COMPLETED" || !["ACTIVE", "REOPENED"].includes(locked.projectStatus)) throw new Error("Task changed. Reload before deciding.");
      const [selection] = await tx.select().from(taskReviewSelections).where(and(eq(taskReviewSelections.taskId, taskId), eq(taskReviewSelections.fileVersionId, versionId))).limit(1);
      const [version] = await tx.select().from(fileVersions).where(and(eq(fileVersions.id, versionId), eq(fileVersions.organizationId, actor.organizationId), eq(fileVersions.processingStatus, "READY"))).limit(1);
      const [clearance] = await tx.select().from(fileApprovals).where(and(eq(fileApprovals.taskId, taskId), eq(fileApprovals.fileVersionId, versionId), eq(fileApprovals.approvalKind, "INTERNAL"), isNull(fileApprovals.reopenedAt))).limit(1);
      if (!selection || !version || !clearance) throw new Error("Select and internally clear this exact version first.");
      const now = new Date();
      let after: Record<string, unknown> = { fileVersionId: versionId };
      if (command === "external") {
        const approver = String(form.get("clientApprover") ?? "").trim(), source = String(form.get("source") ?? ""), evidence = String(form.get("evidence") ?? "").trim(), note = String(form.get("note") ?? "").trim(), approvedAt = new Date(String(form.get("approvedAt") ?? ""));
        if (!approver || !["EMAIL", "WHATSAPP", "OTHER"].includes(source) || !evidence || note.length < 3 || !Number.isFinite(approvedAt.getTime()) || approvedAt > now) throw new Error("Provide the Client approver, past approval time, channel, evidence reference and note.");
        const [existing] = await tx.select().from(fileApprovals).where(and(eq(fileApprovals.taskId, taskId), eq(fileApprovals.approvalKind, "CLIENT"), isNull(fileApprovals.reopenedAt))).limit(1);
        if (existing) throw new Error("Client approval is already recorded. Reopen it before changing the decision.");
        await tx.insert(fileApprovals).values({ organizationId: actor.organizationId, taskId, fileVersionId: versionId, approvedByMembershipId: actor.membershipId, approvalKind: "CLIENT", approvalSource: source, clientApprover: approver, evidenceReference: evidence, note, approvedAt });
        after = { ...after, clientApprover: approver, source, evidence, approvedAt: approvedAt.toISOString(), note };
      } else if (command === "publish") {
        const [approval] = await tx.select().from(fileApprovals).where(and(eq(fileApprovals.taskId, taskId), eq(fileApprovals.fileVersionId, versionId), eq(fileApprovals.approvalKind, "CLIENT"), isNull(fileApprovals.reopenedAt))).limit(1);
        if (!approval) throw new Error("Client approval is required before final delivery.");
        const [existing] = await tx.select().from(finalDeliveries).where(and(eq(finalDeliveries.taskId, taskId), isNull(finalDeliveries.withdrawnAt))).limit(1);
        if (existing) throw new Error("This final has already been delivered.");
        await tx.insert(finalDeliveries).values({ organizationId: actor.organizationId, taskId, fileVersionId: versionId, clientApprovalId: approval.id, publishedByMembershipId: actor.membershipId });
        after = { ...after, clientApprovalId: approval.id };
      } else throw new Error("Choose a delivery action.");
      await tx.update(fileVersions).set({ lockedAt: now, lockedReason: "CLIENT_APPROVED" }).where(and(eq(fileVersions.id, versionId), isNull(fileVersions.lockedAt)));
      await tx.update(tasks).set({ version: expected + 1, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.version, expected)));
      const event = command === "publish" ? "file.final_delivered" : "review.client_approved_external";
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, action: event, objectType: "TASK", objectId: taskId, source: "SERVER_ACTION", after, correlationId: crypto.randomUUID() });
      await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType: event, entityType: "TASK", entityId: taskId, source: "SERVER_ACTION", snapshot: after });
      return locked.projectId;
    });
    for (const path of [`/tasks/${taskId}`, `/projects/${projectId}`, "/home", "/work", "/files", "/notifications"]) revalidatePath(path);
    return { success: command === "publish" ? "Final delivery published." : "Client approval recorded. Publish final delivery when ready." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to save. Reload and retry." }; }
}
