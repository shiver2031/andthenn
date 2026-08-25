"use server";

import {
  activityEvents, and, auditEvents, clients, createDatabase, deliverables, eq, inArray, isNull,
  memberships, notifications, planningScenarios, projectMemberships, projectPacks, projects, taskAssignees,
  tasks, timeEntries, workflowStages, workflows,
} from "@andthenn/db";
import { authorize, can } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";

const defaultStages = ["Briefing", "In production", "Client review", "Completed"];

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
  const actor = await actorOrThrow(); authorize(actor, "accounts:manage");
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
  const actor = await actorOrThrow(); authorize(actor, "accounts:manage"); const clientId = text(form, "clientId");
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
  const { db } = createDatabase();
  const [deliverable] = await db.select({ id: deliverables.id, projectId: deliverables.projectId, dueAt: deliverables.dueAt }).from(deliverables).where(and(eq(deliverables.id, deliverableId), eq(deliverables.organizationId, actor.organizationId))).limit(1);
  if (!deliverable) throw new Error("Deliverable not found");
  if (actor.role !== "MANAGER") authorize(actor, "tasks:create", { projectId: deliverable.projectId, explicitlyGranted: false });
  const dueAt = date(form, "dueAt"); if (dueAt > deliverable.dueAt) throw new Error("Task cannot be due after its deliverable");
  await db.transaction(async (tx) => {
    const [workflow] = await tx.select().from(workflows).where(and(eq(workflows.projectId, deliverable.projectId), eq(workflows.organizationId, actor.organizationId))).limit(1);
    const [stage] = workflow ? await tx.select().from(workflowStages).where(eq(workflowStages.workflowId, workflow.id)).limit(1) : [];
    const [owner] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.id, ownerId), eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))).limit(1);
    if (!stage || !owner) throw new Error("Workflow or primary owner unavailable");
    const [created] = await tx.insert(tasks).values({ organizationId: actor.organizationId, deliverableId, currentWorkflowStageId: stage.id, name: text(form, "name"), description: text(form, "description"), priority: text(form, "priority") || "NORMAL", dueAt, estimatedMinutes: text(form, "estimatedMinutes") ? Number(text(form, "estimatedMinutes")) : null }).returning();
    await tx.insert(taskAssignees).values({ organizationId: actor.organizationId, taskId: created!.id, membershipId: owner.id, kind: "PRIMARY", assignedByMembershipId: actor.membershipId });
    await tx.insert(notifications).values({ organizationId: actor.organizationId, recipientMembershipId: owner.id, eventType: "task.assigned", title: "New task assigned", body: created!.name, objectType: "TASK", objectId: created!.id });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.created", "TASK", created!.id, null, { deliverableId, ownerId, dueAt: dueAt.toISOString() });
  });
  revalidatePath(`/projects/${deliverable.projectId}`);
}

export async function updateProjectTask(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "projects:activate");
  const taskId = text(form, "taskId"); const expectedVersion = Number(text(form, "expectedVersion"));
  const primaryOwnerId = text(form, "primaryOwnerId");
  const collaboratorIds = JSON.parse(text(form, "collaboratorIds") || "[]") as unknown;
  if (!Array.isArray(collaboratorIds) || !collaboratorIds.every((id) => typeof id === "string")) throw new Error("Collaborators are invalid");
  if (!primaryOwnerId || collaboratorIds.includes(primaryOwnerId) || new Set(collaboratorIds).size !== collaboratorIds.length) throw new Error("Choose one primary owner and distinct collaborators");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task) throw new Error("Task not found");
  const dueAt = date(form, "dueAt");
  const [deliverable] = await db.select({ id: deliverables.id, projectId: deliverables.projectId, dueAt: deliverables.dueAt }).from(deliverables).where(and(eq(deliverables.id, task.deliverableId), eq(deliverables.organizationId, actor.organizationId))).limit(1);
  if (!deliverable || dueAt > deliverable.dueAt) throw new Error("Task due date must be on or before its output deadline");
  const memberIds = [primaryOwnerId, ...collaboratorIds];
  const active = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"), inArray(memberships.id, memberIds)));
  if (active.length !== memberIds.length) throw new Error("Choose active team members");
  await db.transaction(async (tx) => {
    const [changed] = await tx.update(tasks).set({ name: text(form, "name"), description: text(form, "description"), priority: text(form, "priority") || "NORMAL", dueAt, estimatedMinutes: text(form, "estimatedMinutes") ? Number(text(form, "estimatedMinutes")) : null, version: expectedVersion + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning();
    if (!changed) throw new Error("This task changed elsewhere. Refresh and retry.");
    await tx.update(taskAssignees).set({ removedAt: new Date() }).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt)));
    for (const assignment of [{ membershipId: primaryOwnerId, kind: "PRIMARY" as const }, ...collaboratorIds.map((membershipId) => ({ membershipId, kind: "COLLABORATOR" as const }))]) {
      await tx.insert(taskAssignees).values({ organizationId: actor.organizationId, taskId, membershipId: assignment.membershipId, kind: assignment.kind, assignedByMembershipId: actor.membershipId }).onConflictDoUpdate({ target: [taskAssignees.taskId, taskAssignees.membershipId], set: { kind: assignment.kind, removedAt: null, assignedAt: new Date(), assignedByMembershipId: actor.membershipId } });
    }
    await tx.insert(notifications).values({ organizationId: actor.organizationId, recipientMembershipId: primaryOwnerId, eventType: "task.assigned", title: "Task assignment updated", body: changed.name, objectType: "TASK", objectId: taskId });
    await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.updated", "TASK", taskId, { version: expectedVersion }, { version: expectedVersion + 1, primaryOwnerId, collaboratorIds });
  });
  revalidatePath(`/projects`); revalidatePath(`/tasks/${taskId}`);
}

export async function moveTask(form: FormData) {
  const actor = await actorOrThrow(); const taskId = text(form, "taskId"); const targetStageId = text(form, "targetStageId"); const expectedVersion = Number(text(form, "expectedVersion")); const reason = text(form, "reason");
  const { db } = createDatabase();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1); if (!task) throw new Error("Task not found");
  const [primary] = await db.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.kind, "PRIMARY"), isNull(taskAssignees.removedAt))).limit(1);
  if (actor.role !== "MANAGER" && primary?.membershipId !== actor.membershipId) throw new Error("Only the primary owner can move this task");
  if (actor.role === "MANAGER" && primary?.membershipId !== actor.membershipId && reason.length < 3) throw new Error("Manager overrides require a reason");
  const [deliverable] = await db.select({ projectId: deliverables.projectId }).from(deliverables).where(and(eq(deliverables.id, task.deliverableId), eq(deliverables.organizationId, actor.organizationId))).limit(1);
  if (!deliverable) throw new Error("Task deliverable not found");
  const [stage] = await db.select({ id: workflowStages.id }).from(workflowStages).innerJoin(workflows, eq(workflowStages.workflowId, workflows.id)).where(and(eq(workflowStages.id, targetStageId), eq(workflowStages.organizationId, actor.organizationId), eq(workflows.organizationId, actor.organizationId), eq(workflows.projectId, deliverable.projectId))).limit(1); if (!stage) throw new Error("Workflow stage does not belong to this task's project");
  const updated = await db.transaction(async (tx) => { const changed = await tx.update(tasks).set({ currentWorkflowStageId: targetStageId, stateKind: "WORKFLOW", interruptedWorkflowStageId: null, version: task.version + 1, updatedAt: new Date() }).where(and(eq(tasks.id, taskId), eq(tasks.version, expectedVersion))).returning(); if (!changed[0]) throw new Error("Task changed by another user; refresh and retry"); await audit(tx as unknown as ReturnType<typeof createDatabase>["db"], actor, "task.stage_changed", "TASK", taskId, { stageId: task.currentWorkflowStageId, version: task.version }, { stageId: targetStageId, version: task.version + 1 }, reason || undefined); return changed[0]; });
  revalidatePath(`/tasks/${updated!.id}`); revalidatePath("/projects");
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
