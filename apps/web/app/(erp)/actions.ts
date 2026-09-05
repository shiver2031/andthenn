"use server";

import {
  activityEvents, and, auditEvents, clients, createDatabase, deliverables, eq, fileApprovals, finalDeliveries, fileAssets, fileVersions, inArray, internalComments, isNull,
  memberships, notifications, planningScenarios, projectExpenses, projectMemberships, projectPacks, projects, taskAssignees,
  taskReviewSelections, tasks, timeEntries, workflowStages, workflows, sql,
} from "@andthenn/db";
import { defaultProjectPhases, assertTaskExecutionTransition, assertTaskTransition, authorize, can, isOperationalLeader, taskExecutionStatuses, type TaskExecutionStatus } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { postDiscussion } from "./discussion-actions";

import { lockActiveTask, assertFinalDelivery, independentReviewer } from "../../lib/task-transaction";

import { discussionMemberScope } from "../../lib/discussion-scope";

const defaultStages = defaultProjectPhases;

async function actorOrThrow() {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  return actor;
}

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function date(form: FormData, key: string) {
  const value = text(form, key); const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error(`${key} is required`);
  return parsed;
}

async function audit(tx: ReturnType<typeof createDatabase>["db"], actor: Awaited<ReturnType<typeof actorOrThrow>>, action: string, objectType: string, objectId: string, before: unknown, after: unknown, reason?: string) {
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action, objectType, objectId, before: before ?? null, after: after ?? null, reason: reason ?? null, correlationId: crypto.randomUUID() });
}

export async function createClient(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "clients:manage");
  const name = text(form, "name"); if (!name) throw new Error("Client name is required");
  const { db } = createDatabase();
  const [client] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(clients).values({ organizationId: actor.organizationId, name, notes: text(form, "notes") || null }).returning();
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "client.created", "CLIENT", created!.id, null, { name: created!.name });
    await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType: "client.created", entityType: "CLIENT", entityId: created!.id, source: "SERVER_ACTION", snapshot: { name: created!.name } });
    return [created!];
  });
  revalidatePath("/clients"); redirect(`/clients?created=${client.id}`);
}

export async function archiveClient(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "clients:manage"); const clientId = text(form, "clientId");
  const { db } = createDatabase();
  const [before] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId))).limit(1);
  if (!before) throw new Error("Client not found");
  await db.transaction(async (tx) => { await tx.update(clients).set({ lifecycle: "ARCHIVED", updatedAt: new Date() }).where(eq(clients.id, clientId)); await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "client.archived", "CLIENT", clientId, { lifecycle: before.lifecycle }, { lifecycle: "ARCHIVED" }); });
  revalidatePath("/clients");
}

export async function createProject(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "projects:activate");
  const clientId = text(form, "clientId"); const name = text(form, "name"); const deadline = date(form, "deadline");
  if (!clientId || !name) throw new Error("Client and project name are required");
  const { db } = createDatabase();
  const [project] = await db.transaction(async (tx) => {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId), eq(clients.lifecycle, "ACTIVE"))).limit(1);
    if (!client) throw new Error("Active client not found");
    const [created] = await tx.insert(projects).values({ organizationId: actor.organizationId, clientId, ownerMembershipId: actor.membershipId, name, deadline, budgetMinor: Number(text(form, "budgetMinor") || 0), notes: text(form, "notes") || null, status: "ACTIVE", activatedAt: new Date() }).returning();
    await tx.insert(projectMemberships).values({ organizationId: actor.organizationId, projectId: created!.id, membershipId: actor.membershipId, canCreateTasks: true, canShareReviews: true, canViewFinances: true });
    await tx.insert(workflows).values({ organizationId: actor.organizationId, projectId: created!.id });
    const [workflow] = await tx.select().from(workflows).where(eq(workflows.projectId, created!.id)).limit(1);
    await tx.insert(workflowStages).values(defaultStages.map((stage, position) => ({ organizationId: actor.organizationId, workflowId: workflow!.id, name: stage, position, semantic: (stage === "Client review" ? "CLIENT_REVIEW" : "NORMAL") as "CLIENT_REVIEW" | "NORMAL" })));
    await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType: "project.activated", entityType: "PROJECT", entityId: created!.id, source: "SERVER_ACTION", snapshot: { name } });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "project.created", "PROJECT", created!.id, null, { name, clientId, deadline: deadline.toISOString() });
    return [created!];
  });
  revalidatePath("/projects"); redirect(`/projects/${project.id}`);
}

export async function createDeliverable(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "projects:activate"); const projectId = text(form, "projectId");
  const { db } = createDatabase(); const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, actor.organizationId))).limit(1);
  if (!project) throw new Error("Project not found"); const dueAt = date(form, "dueAt"); if (dueAt > project.deadline) throw new Error("Deliverable cannot be due after project deadline");
  await db.transaction(async (tx) => { const [created] = await tx.insert(deliverables).values({ organizationId: actor.organizationId, projectId, name: text(form, "name"), quantity: Number(text(form, "quantity")), format: text(form, "format"), dueAt, notes: text(form, "notes") || null }).returning(); await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "deliverable.created", "DELIVERABLE", created!.id, null, { projectId, name: created!.name }); });
  revalidatePath(`/projects/${projectId}`);
}

export async function createTask(form: FormData) {
  const actor = await actorOrThrow(); const deliverableId = text(form, "deliverableId"); const ownerId = text(form, "ownerMembershipId");
  const collaboratorIds = [...new Set(form.getAll("collaboratorMembershipId").map(String).filter(Boolean))];
  const name = text(form, "name");
  if (!name) throw new Error("Task name is required");
  if (!ownerId || collaboratorIds.includes(ownerId)) throw new Error("Choose one primary owner and distinct collaborators");
  const { db } = createDatabase();
  const [deliverable] = await db.select({ id: deliverables.id, projectId: deliverables.projectId, dueAt: deliverables.dueAt }).from(deliverables).where(and(eq(deliverables.id, deliverableId), eq(deliverables.organizationId, actor.organizationId))).limit(1);
  if (!deliverable) throw new Error("Deliverable not found");
  const accessibleTaskIds = [...actor.primaryTaskIds, ...actor.collaboratorTaskIds, ...actor.assignedByMeTaskIds];
  const [projectTask] = accessibleTaskIds.length ? await db.select({ id: tasks.id }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(deliverables.projectId, deliverable.projectId), inArray(tasks.id, accessibleTaskIds))).limit(1) : [];
  if (!can(actor, "tasks:create", { projectId: deliverable.projectId }) && !projectTask) throw new Error("Task creation permission required for this project");
  const dueAt = date(form, "dueAt"); if (dueAt > deliverable.dueAt) throw new Error("Task cannot be due after its deliverable");
  const created = await db.transaction(async (tx) => {
    const [projectState] = await tx.select({ status: projects.status }).from(projects).where(eq(projects.id, deliverable.projectId)).limit(1).for("update");
    const [outputState] = await tx.select({ status: deliverables.status }).from(deliverables).where(eq(deliverables.id, deliverableId)).limit(1);
    if (!projectState || !["ACTIVE", "REOPENED"].includes(projectState.status) || !outputState || !["OPEN", "REOPENED"].includes(outputState.status)) throw new Error("Reopen the project and output before adding more work");
    const [workflow] = await tx.select().from(workflows).where(and(eq(workflows.projectId, deliverable.projectId), eq(workflows.organizationId, actor.organizationId))).limit(1);
    const [stage] = workflow ? await tx.select().from(workflowStages).where(eq(workflowStages.workflowId, workflow.id)).limit(1) : [];
    const assigneeIds = [ownerId, ...collaboratorIds];
    const people = await tx.select({ id: memberships.id, role: memberships.role, startsAt: memberships.startsAt, expiresAt: memberships.expiresAt }).from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"), inArray(memberships.id, assigneeIds)));
    if (!stage || people.length !== assigneeIds.length || people.some((person) => person.role === "CLIENT" || (person.startsAt && person.startsAt > new Date()) || (person.expiresAt && person.expiresAt <= new Date()))) throw new Error("Choose active internal team members");
    const [task] = await tx.insert(tasks).values({ organizationId: actor.organizationId, deliverableId, currentWorkflowStageId: stage.id, requiresClientDelivery: form.get("requiresClientDelivery") === "on", name, description: text(form, "description"), priority: text(form, "priority") || "NORMAL", dueAt, estimatedMinutes: text(form, "estimatedMinutes") ? Number(text(form, "estimatedMinutes")) : null }).returning();
    await tx.insert(taskAssignees).values([{ organizationId: actor.organizationId, taskId: task!.id, membershipId: ownerId, kind: "PRIMARY" as const, assignedByMembershipId: actor.membershipId }, ...collaboratorIds.map((membershipId) => ({ organizationId: actor.organizationId, taskId: task!.id, membershipId, kind: "COLLABORATOR" as const, assignedByMembershipId: actor.membershipId }))]);
    const recipients = assigneeIds.filter((id) => id !== actor.membershipId);
    if (recipients.length) await tx.insert(notifications).values(recipients.map((recipientMembershipId) => ({ organizationId: actor.organizationId, recipientMembershipId, eventType: "task.assigned", title: "New task assigned", body: task!.name, objectType: "TASK", objectId: task!.id })));
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.created", "TASK", task!.id, null, { deliverableId, ownerId, collaboratorIds, dueAt: dueAt.toISOString() });
    return task!;
  });
  revalidatePath(`/projects/${deliverable.projectId}`); revalidatePath("/projects"); revalidatePath("/work"); revalidatePath("/home");
  return { taskId: created.id, projectId: deliverable.projectId };
}

export async function updateProjectTask(form: FormData) {
  const actor = await actorOrThrow(), taskId = text(form, "taskId");
  const expectedVersion = Number(text(form, "expectedVersion")), ownerId = text(form, "primaryOwnerId");
  const collaborators: unknown = JSON.parse(text(form, "collaboratorIds") || "[]");
  if (!Number.isInteger(expectedVersion) || !Array.isArray(collaborators) || !collaborators.every((id) => typeof id === "string") || !ownerId || collaborators.includes(ownerId) || new Set(collaborators).size !== collaborators.length) throw new Error("Choose one owner and distinct collaborators.");
  const dueAt = date(form, "dueAt"), name = text(form, "name"), estimate = text(form, "estimatedMinutes") ? Number(text(form, "estimatedMinutes")) : null;
  if (!name || (estimate !== null && (!Number.isInteger(estimate) || estimate <= 0))) throw new Error("A task name and positive estimate are required.");
  const { db } = createDatabase();
  const projectId = await db.transaction(async (tx) => {
    const { task, assignments, primary, projectId, projectStatus, outputDueAt } = await lockActiveTask(tx, actor, taskId);
    if (task.version !== expectedVersion) throw new Error("This task changed elsewhere. Refresh and retry.");
    if (task.executionStatus === "COMPLETED" || !["ACTIVE", "REOPENED"].includes(projectStatus)) throw new Error("Reopen completed work before editing.");
    if (!isOperationalLeader(actor.role) && !assignments.some((row) => row.membershipId === actor.membershipId || row.assignedByMembershipId === actor.membershipId)) throw new Error("Task edit permission required.");
    if (dueAt > outputDueAt) throw new Error("Task due date must be on or before its output deadline.");
    const desired = [{ membershipId: ownerId, kind: "PRIMARY" as const }, ...collaborators.map((membershipId: string) => ({ membershipId, kind: "COLLABORATOR" as const }))];
    const changedAssignment = desired.length !== assignments.length || desired.some((row) => !assignments.some((old) => old.membershipId === row.membershipId && old.kind === row.kind));
    // The quick editor uses minute precision; unchanged dates retain their original seconds.
    const deadlineChanged = Math.floor(dueAt.getTime() / 60000) !== Math.floor(task.dueAt.getTime() / 60000);
    const assigner = primary?.assignedByMembershipId === actor.membershipId;
    const reason = text(form, "reason");
    if ((changedAssignment || deadlineChanged) && !assigner) {
      if (!isOperationalLeader(actor.role)) throw new Error("Only the assigner can change the deadline or assignment.");
      if (reason.length < 3) throw new Error("Explain the leadership assignment or deadline override.");
    }
    const primaryChanged = primary?.membershipId !== ownerId;
    const now = new Date();
    if (changedAssignment) {
      const people = await tx.select().from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), inArray(memberships.id, desired.map((row) => row.membershipId)))).for("share");
      if (people.length !== desired.length || people.some((row) => row.role === "CLIENT" || row.status !== "ACTIVE" || (row.startsAt && row.startsAt > now) || (row.expiresAt && row.expiresAt <= now))) throw new Error("Choose active internal teammates.");
      const removed = assignments.filter((row) => !desired.some((next) => next.membershipId === row.membershipId && next.kind === row.kind));
      for (const row of removed) await tx.update(taskAssignees).set({ removedAt: now }).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.membershipId, row.membershipId)));
      const added = desired.filter((row) => !assignments.some((old) => old.membershipId === row.membershipId && old.kind === row.kind));
      for (const row of added) await tx.insert(taskAssignees).values({ organizationId: actor.organizationId, taskId, ...row, assignedByMembershipId: actor.membershipId, assignedAt: now }).onConflictDoUpdate({ target: [taskAssignees.taskId, taskAssignees.membershipId], set: { kind: row.kind, removedAt: null, assignedAt: now, assignedByMembershipId: actor.membershipId } });
      const recipients = [...new Set([...added.map((row) => row.membershipId), ...(primaryChanged && task.completionReviewerMembershipId ? [task.completionReviewerMembershipId] : [])])].filter((id) => id !== actor.membershipId);
      if (recipients.length) await tx.insert(notifications).values(recipients.map((recipientMembershipId) => ({ organizationId: actor.organizationId, recipientMembershipId, eventType: "task.assigned", title: "Task assignment changed", body: primaryChanged && task.completionRequestedAt ? `${name}: previous completion request withdrawn by reassignment.` : name, objectType: "TASK", objectId: taskId })));
      await audit(tx as never, actor, "task.reassigned", "TASK", taskId, { assignments }, { assignments: desired, assignedAt: now.toISOString(), assignedBy: actor.membershipId, completionWithdrawn: primaryChanged && Boolean(task.completionRequestedAt) }, reason);
    }
    const [changed] = await tx.update(tasks).set({ name, description: text(form, "description"), priority: text(form, "priority") || "NORMAL", dueAt: deadlineChanged ? dueAt : task.dueAt, estimatedMinutes: estimate, version: expectedVersion + 1, updatedAt: now,
      ...(primaryChanged ? { executionStatus: task.completionRequestedAt ? "IN_PROGRESS" as const : task.executionStatus, completionRequestedAt: null, completionRequestedByMembershipId: null, completionReviewerMembershipId: null, completionConfirmedAt: null, completionConfirmedByMembershipId: null, completionDelegateMembershipId: null } : {})
    }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning();
    if (!changed) throw new Error("Task changed. Refresh and retry.");
    await audit(tx as never, actor, "task.updated", "TASK", taskId, { name: task.name, dueAt: task.dueAt, description: task.description, priority: task.priority }, { name, dueAt: changed.dueAt, description: changed.description, priority: changed.priority });
    return projectId;
  });
  for (const path of ["/projects", `/projects/${projectId}`, `/tasks/${taskId}`, "/home", "/work", "/team"]) revalidatePath(path);
}

export async function moveTask(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const targetStageId = text(form, "targetStageId"); const expectedVersion = Number(text(form, "expectedVersion")); const reason = text(form, "reason");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1); if (!task) throw new Error("Task not found");
  if (task.executionStatus === "COMPLETED") throw new Error("Reopen the task before changing its phase");
  if (task.completionRequestedAt) throw new Error("Withdraw the completion request before changing its phase");
  const assignments = await db.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), isNull(taskAssignees.removedAt)));
  const [deliverable] = await db.select({ projectId: deliverables.projectId }).from(deliverables).where(and(eq(deliverables.id, task.deliverableId), eq(deliverables.organizationId, actor.organizationId))).limit(1);
  if (!deliverable) throw new Error("Task deliverable not found");
  const stages = await db.select({ id: workflowStages.id, projectId: workflows.projectId, name: workflowStages.name, position: workflowStages.position, semantic: workflowStages.semantic }).from(workflowStages).innerJoin(workflows, eq(workflowStages.workflowId, workflows.id)).where(and(eq(workflowStages.organizationId, actor.organizationId), eq(workflows.organizationId, actor.organizationId), eq(workflows.projectId, deliverable.projectId)));
  const stage = stages.find((candidate) => candidate.id === targetStageId); if (!stage) throw new Error("Workflow stage does not belong to this task's project");
  const [selection, readyVersions] = await Promise.all([
    db.select({ fileVersionId: taskReviewSelections.fileVersionId }).from(taskReviewSelections).where(and(eq(taskReviewSelections.taskId, taskId), eq(taskReviewSelections.organizationId, actor.organizationId))).limit(1),
    db.select({ id: fileVersions.id }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).where(and(eq(fileAssets.taskId, taskId), eq(fileVersions.organizationId, actor.organizationId), eq(fileVersions.processingStatus, "READY"))),
  ]);
  assertTaskTransition({ id: task.id, deliverableId: task.deliverableId, state: task.stateKind === "WORKFLOW" && task.currentWorkflowStageId ? { kind: "WORKFLOW", stageId: task.currentWorkflowStageId } : { kind: "SYSTEM", state: task.stateKind as "CLIENT_FEEDBACK_RECEIVED" | "COMPLETED", interruptedStageId: task.interruptedWorkflowStageId }, assignments: assignments.map((assignment) => ({ userId: assignment.membershipId, kind: assignment.kind })), hasValidFileVersion: readyVersions.length > 0, selectedReviewVersionId: selection[0]?.fileVersionId ?? null, approvedVersionId: null, dueAt: task.dueAt, completedAt: task.completedAt }, { kind: "WORKFLOW", stageId: targetStageId }, { userId: actor.membershipId, isManager: isOperationalLeader(actor.role), ...(reason ? { overrideReason: reason } : {}) }, stages);
  const updated = await db.transaction(async (tx) => {
    const current = await lockActiveTask(tx, actor, taskId);
    if (current.projectStatus === "COMPLETED" || current.task.executionStatus === "COMPLETED" || current.task.completionRequestedAt) throw new Error("Reopen the work or withdraw its completion request before changing phase.");
    if (!isOperationalLeader(actor.role) && current.primary?.membershipId !== actor.membershipId) throw new Error("Only the current primary owner can move this task.");
    if (stage.semantic === "CLIENT_REVIEW" || stage.name.toLowerCase() === "approval") {
      const [gate] = await tx.execute<{ ready: boolean }>(sql`select exists (select 1 from file_approvals a join task_review_selections s on s.task_id=a.task_id and s.file_version_id=a.file_version_id join file_versions v on v.id=a.file_version_id where a.task_id=${taskId}::uuid and a.approval_kind=${stage.semantic === "CLIENT_REVIEW" ? "INTERNAL" : "CLIENT"} and a.reopened_at is null and v.processing_status='READY') as ready`);
      if (!gate?.ready) throw new Error(stage.semantic === "CLIENT_REVIEW" ? "Clear the selected ready version for Client review first." : "Record Client approval of the selected version first.");
    }
    if (stage.name.toLowerCase() === "final delivery") await assertFinalDelivery(tx, taskId);
    const changed = await tx.update(tasks).set({ currentWorkflowStageId: targetStageId, stateKind: "WORKFLOW", interruptedWorkflowStageId: null, version: task.version + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning(); if (!changed[0]) throw new Error("Task changed by another user; refresh and retry"); await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.stage_changed", "TASK", taskId, { stageId: task.currentWorkflowStageId, version: task.version }, { stageId: targetStageId, version: task.version + 1 }, reason || undefined); return changed[0]; });
  revalidatePath(`/tasks/${updated!.id}`); revalidatePath("/projects");
}

export async function updateTaskStatus(form: FormData) {
  const actor = await actorOrThrow();
  const taskId = text(form, "taskId");
  const next = text(form, "status") as TaskExecutionStatus;
  const reason = text(form, "reason");
  const expectedVersion = Number(text(form, "expectedVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid task version");
  if (!taskExecutionStatuses.includes(next)) throw new Error("Choose a valid task status");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task) throw new Error("Task not found");
  const [primary] = await db.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.kind, "PRIMARY"), isNull(taskAssignees.removedAt))).limit(1);
  const isPrimaryOwner = primary?.membershipId === actor.membershipId;
  assertTaskExecutionTransition(task.executionStatus, next, { isPrimaryOwner, canOverride: isOperationalLeader(actor.role), ...(reason ? { overrideReason: reason } : {}) });
  await db.transaction(async (tx) => {
    await lockActiveTask(tx, actor, taskId);
    const [changed] = await tx.update(tasks).set({ executionStatus: next, completionRequestedAt: null, completionRequestedByMembershipId: null, completionReviewerMembershipId: null, completionConfirmedAt: null, completionConfirmedByMembershipId: null, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning();
    if (!changed) throw new Error("Task changed elsewhere. Refresh and retry.");
    if (reason) await tx.insert(internalComments).values({ organizationId: actor.organizationId, taskId, authorMembershipId: actor.membershipId, body: reason });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.status_changed", "TASK", taskId, { status: task.executionStatus }, { status: next }, reason || undefined);
  });
  revalidatePath(`/tasks/${taskId}`); revalidatePath("/work"); revalidatePath("/home"); revalidatePath("/team");
}

export async function requestTaskCompletion(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const note = text(form, "note"); const expectedVersion = Number(text(form, "expectedVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid task version");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task || task.executionStatus === "COMPLETED") throw new Error("Open task not found");
  const [primary] = await db.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.kind, "PRIMARY"), isNull(taskAssignees.removedAt))).limit(1);
  if (!primary || primary.membershipId !== actor.membershipId) throw new Error("Only the primary assignee can request completion");
  const [preferred] = await db.select({ id: memberships.id, status: memberships.status, expiresAt: memberships.expiresAt, startsAt: memberships.startsAt }).from(memberships).where(and(eq(memberships.id, primary.assignedByMembershipId), eq(memberships.organizationId, actor.organizationId))).limit(1);
  let reviewerId = preferred?.id !== actor.membershipId && preferred?.status === "ACTIVE" && (!preferred.expiresAt || preferred.expiresAt > new Date()) && (!preferred.startsAt || preferred.startsAt <= new Date()) ? preferred.id : undefined;
  if (!reviewerId && task.completionDelegateMembershipId && task.completionDelegateMembershipId !== actor.membershipId) {
    const [delegate] = await db.select().from(memberships).where(and(eq(memberships.id, task.completionDelegateMembershipId), eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))).limit(1);
    if (delegate && delegate.role !== "CLIENT" && (!delegate.startsAt || delegate.startsAt <= new Date()) && (!delegate.expiresAt || delegate.expiresAt > new Date())) reviewerId = delegate.id;
  }
  if (!reviewerId) {
    const leaders = await db.select({ id: memberships.id, role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"), sql`(${memberships.expiresAt} is null or ${memberships.expiresAt} > now()) and (${memberships.startsAt} is null or ${memberships.startsAt} <= now())`));
    reviewerId = leaders.filter((member) => member.id !== actor.membershipId).sort((a,b) => a.id.localeCompare(b.id)).find((member) => member.role === "FOUNDER")?.id ?? leaders.filter((member) => member.id !== actor.membershipId).sort((a,b) => a.id.localeCompare(b.id)).find((member) => member.role === "MANAGER")?.id;
  }
  if (!reviewerId) throw new Error("No active completion reviewer is available");
  const now = new Date();
  await db.transaction(async (tx) => {
    const locked = await lockActiveTask(tx, actor, taskId);
    if (locked.task.version !== expectedVersion || locked.task.executionStatus === "COMPLETED" || !["ACTIVE", "REOPENED"].includes(locked.projectStatus)) throw new Error("Task changed. Refresh before completion.");
    await assertFinalDelivery(tx, taskId);
    const [reviewer] = await tx.select().from(memberships).where(and(eq(memberships.id, reviewerId!), eq(memberships.organizationId, actor.organizationId))).limit(1).for("share");
    if (!reviewer || reviewer.status !== "ACTIVE" || reviewer.role === "CLIENT" || (reviewer.startsAt && reviewer.startsAt > new Date()) || (reviewer.expiresAt && reviewer.expiresAt <= new Date())) throw new Error("The reviewer is no longer active. Ask leadership to designate another reviewer.");
    if (locked.primary?.membershipId !== actor.membershipId) throw new Error("Only the current primary assignee can request completion.");
    const [changed] = await tx.update(tasks).set({ executionStatus: "WAITING", completionRequestedAt: now, completionRequestedByMembershipId: actor.membershipId, completionReviewerMembershipId: reviewerId, completionConfirmedAt: null, completionConfirmedByMembershipId: null, version: expectedVersion + 1, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion), isNull(tasks.completionRequestedAt))).returning({ id: tasks.id });
    if (!changed) throw new Error("Task changed or completion was already requested. Refresh and retry.");
    if (note) await tx.insert(internalComments).values({ organizationId: actor.organizationId, taskId, authorMembershipId: actor.membershipId, body: note });
    await tx.insert(notifications).values({ organizationId: actor.organizationId, recipientMembershipId: reviewerId, eventType: "task.completion_requested", title: "Completion requested", body: task.name, objectType: "TASK", objectId: taskId });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.completion_requested", "TASK", taskId, null, { reviewerId, requestedAt: now.toISOString(), fallbackReason: reviewerId !== primary.assignedByMembershipId ? "Original assigner unavailable or self-assigned; independent leadership reviewer selected" : null });
  });
  revalidatePath(`/tasks/${taskId}`); revalidatePath("/work"); revalidatePath("/home");
}

export async function confirmTaskCompletion(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const reason = text(form, "reason"); const expectedVersion = Number(text(form, "expectedVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid task version");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task?.completionRequestedAt || !task.completionRequestedByMembershipId || !task.completionReviewerMembershipId) throw new Error("No completion request is waiting");
  independentReviewer(actor, task.completionRequestedByMembershipId);
  const reviewerId = task.completionReviewerMembershipId;
  const designated = reviewerId === actor.membershipId;
  const [primary] = await db.select({ assignedBy: taskAssignees.assignedByMembershipId }).from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.kind, "PRIMARY"), isNull(taskAssignees.removedAt))).limit(1);
  if (!designated && !isOperationalLeader(actor.role)) throw new Error("Only the designated reviewer can confirm completion");
  if ((!designated || primary?.assignedBy !== actor.membershipId) && reason.length < 3) throw new Error("A reason is required when taking over completion review");
  const now = new Date();
  await db.transaction(async (tx) => {
    const locked = await lockActiveTask(tx, actor, taskId);
    if (locked.task.version !== expectedVersion || locked.task.executionStatus === "COMPLETED" || !["ACTIVE", "REOPENED"].includes(locked.projectStatus)) throw new Error("Task changed. Refresh before completion.");
    await assertFinalDelivery(tx, taskId);
    const [reviewer] = await tx.select().from(memberships).where(and(eq(memberships.id, designated ? reviewerId : actor.membershipId), eq(memberships.organizationId, actor.organizationId))).limit(1).for("share");
    if (!reviewer || reviewer.status !== "ACTIVE" || reviewer.role === "CLIENT" || (reviewer.startsAt && reviewer.startsAt > new Date()) || (reviewer.expiresAt && reviewer.expiresAt <= new Date())) throw new Error("The reviewer is no longer active. Ask leadership to designate another reviewer.");
    const [changed] = await tx.update(tasks).set({ executionStatus: "COMPLETED", stateKind: "COMPLETED", currentWorkflowStageId: null, completionConfirmedAt: now, completionConfirmedByMembershipId: actor.membershipId, completedAt: now, version: expectedVersion + 1, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion), eq(tasks.executionStatus, "WAITING"), eq(tasks.completionReviewerMembershipId, reviewerId))).returning({ id: tasks.id });
    if (!changed) throw new Error("Completion request changed. Refresh before confirming.");
    const [remaining] = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.deliverableId, task.deliverableId), sql`${tasks.executionStatus} <> 'COMPLETED'`)).limit(1);
    if (!remaining) await tx.update(deliverables).set({ status: "READY_FOR_MANAGER_CONFIRMATION", updatedAt: now }).where(and(eq(deliverables.id, task.deliverableId), inArray(deliverables.status, ["OPEN", "REOPENED"])));
    await tx.insert(notifications).values({ organizationId: actor.organizationId, recipientMembershipId: task.completionRequestedByMembershipId!, eventType: "task.completed", title: "Task completed", body: task.name, objectType: "TASK", objectId: taskId });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.completion_confirmed", "TASK", taskId, null, { confirmedAt: now.toISOString() }, reason || undefined);
  });
  revalidatePath(`/tasks/${taskId}`); revalidatePath("/work"); revalidatePath("/home"); revalidatePath("/projects"); revalidatePath("/team");
}

export async function reopenTask(form: FormData) {
  const actor = await actorOrThrow();
  if (!isOperationalLeader(actor.role)) throw new Error("Leadership permission required");
  const taskId = text(form, "taskId"), reason = text(form, "reason"), expectedVersion = Number(text(form, "expectedVersion"));
  if (reason.length < 3 || !Number.isInteger(expectedVersion)) throw new Error("A reason and current task version are required");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    await lockActiveTask(tx, actor, taskId);
    const [task] = await tx.select({ id: tasks.id, deliverableId: tasks.deliverableId, projectId: deliverables.projectId }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId), eq(tasks.executionStatus, "COMPLETED"))).limit(1);
    if (!task) throw new Error("Completed task not found");
    const [stage] = await tx.select({ id: workflowStages.id }).from(workflowStages).innerJoin(workflows, eq(workflows.id, workflowStages.workflowId)).where(eq(workflows.projectId, task.projectId)).orderBy(workflowStages.position).limit(1);
    if (!stage) throw new Error("Project workflow is unavailable");
    const now = new Date();
    const [changed] = await tx.update(tasks).set({ executionStatus: "IN_PROGRESS", stateKind: "WORKFLOW", currentWorkflowStageId: stage.id, interruptedWorkflowStageId: null, completedAt: null, completionRequestedAt: null, completionRequestedByMembershipId: null, completionReviewerMembershipId: null, completionConfirmedAt: null, completionConfirmedByMembershipId: null, version: expectedVersion + 1, updatedAt: now }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion), eq(tasks.executionStatus, "COMPLETED"))).returning({ id: tasks.id });
    if (!changed) throw new Error("Task changed. Refresh before reopening.");
    await tx.update(finalDeliveries).set({ withdrawnAt: now, withdrawnByMembershipId: actor.membershipId, withdrawalReason: reason }).where(and(eq(finalDeliveries.taskId, taskId), isNull(finalDeliveries.withdrawnAt)));
    await tx.update(fileApprovals).set({ reopenedAt: now, reopenedByMembershipId: actor.membershipId, reopenReason: reason }).where(and(eq(fileApprovals.taskId, taskId), isNull(fileApprovals.reopenedAt)));
    await tx.update(deliverables).set({ status: "REOPENED", confirmedAt: null, confirmedByMembershipId: null, reopenReason: reason, updatedAt: now }).where(eq(deliverables.id, task.deliverableId));
    await tx.update(projects).set({ status: "REOPENED", completedAt: null, reopenedAt: now, reopenReason: reason, updatedAt: now }).where(eq(projects.id, task.projectId));
    await audit(tx as never, actor, "task.reopened", "TASK", taskId, { status: "COMPLETED" }, { status: "IN_PROGRESS", lockedVersionsPreserved: true }, reason);
  });
  for (const path of [`/tasks/${taskId}`, "/home", "/work", "/projects", "/team", "/reports"]) revalidatePath(path);
}

export async function addInternalComment(form: FormData) {
  if (!form.get("requestId")) form.set("requestId", crypto.randomUUID());
  await postDiscussion(form);
}

export async function selectTaskReviewVersion(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const fileVersionId = text(form, "fileVersionId"); const expectedVersion = Number(text(form, "expectedVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid task version");
  const { db } = createDatabase();
  const [version] = await db.select({ id: fileVersions.id }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).where(and(eq(fileVersions.id, fileVersionId), eq(fileVersions.organizationId, actor.organizationId), eq(fileAssets.taskId, taskId), eq(fileVersions.processingStatus, "READY"))).limit(1);
  if (!version || (!isOperationalLeader(actor.role) && !can(actor, "reviews:share", { taskId }))) throw new Error("Choose a ready version you can review");
  await db.transaction(async (tx) => {
    const locked = await lockActiveTask(tx, actor, taskId);
    if (locked.task.executionStatus === "COMPLETED" || locked.task.completionRequestedAt) throw new Error("Reopen or withdraw completion before changing the review candidate.");
    const [previous] = await tx.select().from(taskReviewSelections).where(eq(taskReviewSelections.taskId, taskId)).limit(1);
    if (previous?.fileVersionId === fileVersionId) return;
    const now = new Date(), reason = "New review candidate selected";
    await tx.update(finalDeliveries).set({ withdrawnAt: now, withdrawnByMembershipId: actor.membershipId, withdrawalReason: reason }).where(and(eq(finalDeliveries.taskId, taskId), isNull(finalDeliveries.withdrawnAt)));
    await tx.update(fileApprovals).set({ reopenedAt: now, reopenedByMembershipId: actor.membershipId, reopenReason: reason }).where(and(eq(fileApprovals.taskId, taskId), isNull(fileApprovals.reopenedAt)));

    const [changed] = await tx.update(tasks).set({ version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning({ id: tasks.id });
    if (!changed) throw new Error("Task changed. Refresh before selecting a review version.");
    await tx.insert(taskReviewSelections).values({ organizationId: actor.organizationId, taskId, fileVersionId, selectedByMembershipId: actor.membershipId }).onConflictDoUpdate({ target: taskReviewSelections.taskId, set: { fileVersionId, selectedByMembershipId: actor.membershipId, selectedAt: new Date() } });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.review_version_selected", "TASK", taskId, null, { fileVersionId, version: expectedVersion + 1 });
  });
  revalidatePath(`/tasks/${taskId}`);
}

export async function logTime(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const minutes = Number(text(form, "minutes")); if (!Number.isInteger(minutes) || minutes <= 0) throw new Error("Minutes must be a positive whole number");
  const { db } = createDatabase(); const [task] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1); if (!task || !can(actor, "time:log", { taskId })) throw new Error("Task time permission required");
  await db.transaction(async (tx) => { const [entry] = await tx.insert(timeEntries).values({ organizationId: actor.organizationId, taskId, membershipId: actor.membershipId, workDate: text(form, "workDate") || new Date().toISOString().slice(0, 10), minutes, note: text(form, "note") || null }).returning(); await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "time.logged", "TIME_ENTRY", entry!.id, null, { taskId, minutes }); });
  revalidatePath("/workload"); revalidatePath(`/tasks/${taskId}`);
}

export async function savePlanningScenario(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "projects:activate"); const projectId = text(form, "projectId");
  const { db } = createDatabase(); const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, actor.organizationId))).limit(1); if (!project) throw new Error("Project not found");
  const changes = JSON.parse(text(form, "changes") || "{}"); const preview = JSON.parse(text(form, "preview") || "{}");
  await db.insert(planningScenarios).values({ organizationId: actor.organizationId, projectId, name: text(form, "name") || "Untitled scenario", changes, preview, createdByMembershipId: actor.membershipId }); revalidatePath(`/projects/${projectId}`);
}

export async function createProjectPack(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "workflows:configure"); const definition = JSON.parse(text(form, "definition") || "{}");
  const { db } = createDatabase(); await db.insert(projectPacks).values({ organizationId: actor.organizationId, name: text(form, "name"), description: text(form, "description") || null, definition, createdByMembershipId: actor.membershipId }); revalidatePath("/admin");
}

export async function createProjectExpense(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "accounts:manage");
  const projectId = text(form, "projectId"); const category = text(form, "category"); const amountMajor = text(form, "amountMajor"); const incurredOn = text(form, "incurredOn");
  if (!projectId || !category || !/^\d+(?:\.\d{1,2})?$/.test(amountMajor) || !/^\d{4}-\d{2}-\d{2}$/.test(incurredOn)) throw new Error("Project, category, amount, and incurred date are required");
  const amountMinor = Math.round(Number(amountMajor) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Enter a positive expense amount with at most two decimals");
  const { db } = createDatabase();
  const [project] = await db.select({ id: projects.id, currency: projects.currency }).from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, actor.organizationId))).limit(1);
  if (!project) throw new Error("Project not found");
  await db.transaction(async (tx) => {
    const [expense] = await tx.insert(projectExpenses).values({ organizationId: actor.organizationId, projectId, amountMinor, currency: project.currency, category, incurredOn, note: text(form, "note") || null, createdByMembershipId: actor.membershipId }).returning({ id: projectExpenses.id });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "project.expense_created", "PROJECT_EXPENSE", expense!.id, null, { projectId, amountMinor, currency: project.currency, category, incurredOn });
  });
  revalidatePath("/accounts"); revalidatePath(`/projects/${projectId}`);
}

export async function designateCompletionReviewer(form: FormData) {
  const actor = await actorOrThrow();
  if (!isOperationalLeader(actor.role)) throw new Error("Leadership permission required.");
  const taskId = text(form, "taskId"), memberId = text(form, "reviewerMembershipId"), reason = text(form, "reason"), expectedVersion = Number(text(form, "expectedVersion"));
  if (reason.length < 3) throw new Error("Explain the reviewer designation.");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const locked = await lockActiveTask(tx, actor, taskId);
    if (locked.task.version !== expectedVersion || locked.task.executionStatus === "COMPLETED") throw new Error("Task changed. Reload first.");
    if (memberId === locked.primary?.membershipId || memberId === locked.task.completionRequestedByMembershipId) throw new Error("Choose a reviewer other than the assignee.");
    const [member] = await tx.select().from(memberships).where(and(eq(memberships.id, memberId), discussionMemberScope(actor.organizationId, locked.projectId, taskId))).limit(1).for("share");
    if (!member) throw new Error("Choose an active internal reviewer with task access.");
    await tx.update(tasks).set({ completionDelegateMembershipId: memberId, ...(locked.task.completionRequestedAt ? { completionReviewerMembershipId: memberId } : {}), version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion)));
    await audit(tx as never, actor, "task.reviewer_designated", "TASK", taskId, { reviewerId: locked.task.completionReviewerMembershipId }, { reviewerId: memberId }, reason);
    await tx.insert(notifications).values({ organizationId: actor.organizationId, recipientMembershipId: memberId, eventType: "task.reviewer_designated", title: "Completion reviewer designated", body: locked.task.name, objectType: "TASK", objectId: taskId });
  });
  for (const path of [`/tasks/${taskId}`, "/home", "/work", "/notifications"]) revalidatePath(path);
}
