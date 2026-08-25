"use server";

import { activityEvents, and, auditEvents, clients, createDatabase, deliverables, eq, inArray, intakeConversions, intakeItems, intakeSourceItems, memberships, notifications, projectMemberships, projects, proposals, taskAssignees, tasks, workflowStages, workflows } from "@andthenn/db";
import { projectSetupDraftSchema, projectSetupFinalizeSchema, projectSetupSaveSchema } from "@andthenn/contracts";
import { authorize } from "@andthenn/domain";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveActorContext, type ActorContext } from "../../../lib/actor-context";
import { demoModeEnabled } from "../../../lib/config";

const defaultStages = ["Briefing", "In production", "Client review", "Completed"];
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const required = (form: FormData, key: string) => {
  const result = value(form, key);
  if (!result) throw new Error(`${key} is required`);
  return result;
};

async function managerOrThrow() {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  authorize(actor, "intake:process");
  if (actor.role !== "MANAGER") throw new Error("Only managers can approve intake and create projects");
  return actor;
}

async function record(tx: ReturnType<typeof createDatabase>["db"], actor: ActorContext, action: string, objectType: string, objectId: string, before: unknown, after: unknown) {
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action, objectType, objectId, before: before ?? null, after: after ?? null, correlationId: crypto.randomUUID() });
  await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType: action, entityType: objectType, entityId: objectId, source: "SERVER_ACTION", snapshot: after ?? {} });
}

function defaultDraft(input: { intakeItemId: string | null; title: string | null; brief: string | null; clientId: string | null; ownerMembershipId: string }) {
  return { schemaVersion: 1, intakeItemId: input.intakeItemId, title: input.title ?? "New project", brief: input.brief ?? "", clientId: input.clientId ?? "", ownerMembershipId: input.ownerMembershipId, deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(), budgetMinor: null, currency: "INR", notes: "", deliverables: [], tasks: [] };
}

function revalidateManagerSurfaces() {
  revalidatePath("/intake");
  revalidatePath("/home");
  revalidatePath("/projects");
  revalidatePath("/", "layout");
}

export async function createManualIntake(form: FormData) {
  const actor = await managerOrThrow();
  const summary = value(form, "summary");
  const title = value(form, "title") || summary.slice(0, 120) || "Manual intake";
  if (!summary) throw new Error("A request summary is required");
  const capturedAt = new Date(value(form, "capturedAt") || Date.now());
  if (Number.isNaN(capturedAt.getTime())) throw new Error("Capture time is invalid");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const [item] = await tx.insert(intakeItems).values({ organizationId: actor.organizationId, sourceChannel: "MANUAL", title, confirmedSummary: summary, status: "UNASSIGNED" }).returning();
    await tx.insert(intakeSourceItems).values({ organizationId: actor.organizationId, intakeItemId: item!.id, provider: "MANUAL", sender: value(form, "sender") || actor.email, forwarder: actor.email, capturedAt, sequence: 0, kind: "TEXT", rawText: summary, rawHeaders: {}, contentHash: createHash("sha256").update(`${actor.membershipId}:${capturedAt.toISOString()}:${summary}`).digest("hex"), providerPayload: { capture: "manual" } });
    await record(tx as never, actor, "intake.created", "INTAKE", item!.id, null, { source: "MANUAL", title });
  });
  revalidateManagerSurfaces();
}

export async function startIntakeSetup(form: FormData) {
  const actor = await managerOrThrow();
  const intakeItemId = required(form, "intakeItemId");
  const { db } = createDatabase();
  const proposal = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(intakeItems).where(and(eq(intakeItems.id, intakeItemId), eq(intakeItems.organizationId, actor.organizationId))).limit(1);
    if (!item || item.status === "CONVERTED") throw new Error("This intake item is no longer available for setup");
    if (item.claimedByMembershipId && item.claimedByMembershipId !== actor.membershipId) throw new Error("Another manager is already setting up this intake item");
    const [existing] = await tx.select().from(proposals).where(and(eq(proposals.intakeItemId, intakeItemId), eq(proposals.organizationId, actor.organizationId))).limit(1);
    const changed = await tx.update(intakeItems).set({ status: "SETUP_IN_PROGRESS", claimedByMembershipId: actor.membershipId, claimedAt: item.claimedAt ?? new Date(), lockVersion: item.lockVersion + 1, updatedAt: new Date() }).where(and(eq(intakeItems.id, intakeItemId), eq(intakeItems.lockVersion, item.lockVersion))).returning();
    if (!changed[0]) throw new Error("This intake item changed; refresh and retry");
    if (existing) return existing;
    const [created] = await tx.insert(proposals).values({ organizationId: actor.organizationId, intakeItemId, clientId: item.confirmedClientId, title: item.title || "New project", brief: item.confirmedSummary || "", draftData: defaultDraft({ intakeItemId, title: item.title, brief: item.confirmedSummary, clientId: item.confirmedClientId, ownerMembershipId: actor.membershipId }) }).returning();
    await record(tx as never, actor, "intake.setup_started", "INTAKE", intakeItemId, { status: item.status }, { status: "SETUP_IN_PROGRESS", proposalId: created!.id });
    return created!;
  });
  revalidateManagerSurfaces();
  redirect(`/intake?view=setups&setup=${proposal.id}`);
}

export async function startManualProjectSetup() {
  const actor = await managerOrThrow();
  const { db } = createDatabase();
  const [proposal] = await db.insert(proposals).values({ organizationId: actor.organizationId, title: "New project", brief: "", draftData: defaultDraft({ intakeItemId: null, title: "New project", brief: "", clientId: null, ownerMembershipId: actor.membershipId }) }).returning();
  await db.transaction(async (tx) => record(tx as never, actor, "project.setup_started", "PROPOSAL", proposal!.id, null, { source: "MANUAL" }));
  revalidateManagerSurfaces();
  redirect(`/intake?view=setups&setup=${proposal!.id}`);
}

export async function saveProjectSetup(form: FormData) {
  const actor = await managerOrThrow();
  const input = projectSetupSaveSchema.parse({ proposalId: required(form, "proposalId"), expectedVersion: Number(required(form, "expectedVersion")), draft: JSON.parse(required(form, "draft")) });
  const { db } = createDatabase();
  const [updated] = await db.update(proposals).set({ title: input.draft.title, brief: input.draft.brief, clientId: input.draft.clientId, budgetMinor: input.draft.budgetMinor, currency: input.draft.currency, draftData: input.draft, version: input.expectedVersion + 1, updatedAt: new Date() }).where(and(eq(proposals.id, input.proposalId), eq(proposals.organizationId, actor.organizationId), eq(proposals.status, "PENDING"), eq(proposals.version, input.expectedVersion))).returning();
  if (!updated) throw new Error("This setup changed elsewhere. Refresh and continue from the latest version.");
  revalidateManagerSurfaces();
  return { version: updated.version };
}

export async function finalizeProjectSetup(form: FormData) {
  const actor = await managerOrThrow();
  const input = projectSetupFinalizeSchema.parse({ proposalId: required(form, "proposalId"), expectedVersion: Number(required(form, "expectedVersion")), idempotencyKey: required(form, "idempotencyKey") });
  const { db } = createDatabase();
  const [existingProposal] = await db.select().from(proposals).where(and(eq(proposals.id, input.proposalId), eq(proposals.organizationId, actor.organizationId))).limit(1);
  if (!existingProposal) throw new Error("Project setup not found");
  if (existingProposal.intakeItemId) {
    const [conversion] = await db.select().from(intakeConversions).where(and(eq(intakeConversions.intakeItemId, existingProposal.intakeItemId), eq(intakeConversions.organizationId, actor.organizationId))).limit(1);
    if (conversion?.projectId) redirect(`/projects?project=${conversion.projectId}`);
  }
  const draft = projectSetupDraftSchema.parse(existingProposal.draftData);
  const project = await db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(proposals).where(and(eq(proposals.id, input.proposalId), eq(proposals.organizationId, actor.organizationId))).limit(1);
    if (!proposal || proposal.status !== "PENDING" || proposal.version !== input.expectedVersion) throw new Error("This setup changed elsewhere. Refresh and continue from the latest version.");
    const memberIds = [...new Set([draft.ownerMembershipId, ...draft.tasks.flatMap((task) => [task.primaryOwnerId, ...task.collaboratorIds])])];
    const [[client], activeMembers] = await Promise.all([
      tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, draft.clientId), eq(clients.organizationId, actor.organizationId), eq(clients.lifecycle, "ACTIVE"))).limit(1),
      tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"), inArray(memberships.id, memberIds))),
    ]);
    if (!client || activeMembers.length !== memberIds.length) throw new Error("Choose an active client and active team members before creating the project");
    const deadline = new Date(draft.deadline);
    for (const deliverable of draft.deliverables) if (new Date(deliverable.dueAt) > deadline) throw new Error(`${deliverable.name} is due after the project deadline`);
    const deliveryById = new Map(draft.deliverables.map((deliverable) => [deliverable.id, deliverable]));
    for (const task of draft.tasks) {
      const deliverable = deliveryById.get(task.deliverableId);
      if (!deliverable) throw new Error(`Task ${task.name} must belong to an output group`);
      if (new Date(task.dueAt) > new Date(deliverable.dueAt)) throw new Error(`${task.name} is due after its output group`);
    }
    const [created] = await tx.insert(projects).values({ organizationId: actor.organizationId, clientId: draft.clientId, proposalId: proposal.id, sourceIntakeItemId: proposal.intakeItemId, ownerMembershipId: draft.ownerMembershipId, name: draft.title, deadline, budgetMinor: draft.budgetMinor, currency: draft.currency, notes: draft.notes || null, status: "ACTIVE", activatedAt: new Date() }).returning();
    await tx.insert(projectMemberships).values(memberIds.map((membershipId) => ({ organizationId: actor.organizationId, projectId: created!.id, membershipId, canCreateTasks: false, canShareReviews: false, canViewFinances: false })));
    const [workflow] = await tx.insert(workflows).values({ organizationId: actor.organizationId, projectId: created!.id }).returning();
    const stages = await tx.insert(workflowStages).values(defaultStages.map((name, position) => ({ organizationId: actor.organizationId, workflowId: workflow!.id, name, position, semantic: name === "Client review" ? "CLIENT_REVIEW" as const : "NORMAL" as const }))).returning();
    const firstStage = stages.find((stage) => stage.position === 0);
    if (!firstStage) throw new Error("Project workflow could not be created");
    await tx.insert(deliverables).values(draft.deliverables.map((deliverable) => ({ id: deliverable.id, organizationId: actor.organizationId, projectId: created!.id, name: deliverable.name, quantity: deliverable.quantity, format: deliverable.format, dueAt: new Date(deliverable.dueAt), notes: deliverable.notes || null })));
    await tx.insert(tasks).values(draft.tasks.map((task) => ({ id: task.id, organizationId: actor.organizationId, deliverableId: task.deliverableId, currentWorkflowStageId: firstStage.id, name: task.name, description: task.description, priority: task.priority, dueAt: new Date(task.dueAt), estimatedMinutes: task.estimatedMinutes })));
    await tx.insert(taskAssignees).values(draft.tasks.flatMap((task) => [{ organizationId: actor.organizationId, taskId: task.id, membershipId: task.primaryOwnerId, kind: "PRIMARY" as const, assignedByMembershipId: actor.membershipId }, ...task.collaboratorIds.map((membershipId) => ({ organizationId: actor.organizationId, taskId: task.id, membershipId, kind: "COLLABORATOR" as const, assignedByMembershipId: actor.membershipId }))]));
    await tx.insert(notifications).values(draft.tasks.map((task) => ({ organizationId: actor.organizationId, recipientMembershipId: task.primaryOwnerId, eventType: "task.assigned", title: "New task assigned", body: task.name, objectType: "TASK", objectId: task.id })));
    const [changedProposal] = await tx.update(proposals).set({ status: "APPROVED", decidedByMembershipId: actor.membershipId, decidedAt: new Date(), version: proposal.version + 1, updatedAt: new Date() }).where(and(eq(proposals.id, proposal.id), eq(proposals.version, input.expectedVersion))).returning();
    if (!changedProposal) throw new Error("This setup changed elsewhere. Refresh and continue from the latest version.");
    if (proposal.intakeItemId) {
      await tx.insert(intakeConversions).values({ organizationId: actor.organizationId, intakeItemId: proposal.intakeItemId, targetType: "NEW_PROJECT", projectId: created!.id, idempotencyKey: input.idempotencyKey, convertedByMembershipId: actor.membershipId });
      await tx.update(intakeItems).set({ status: "CONVERTED", convertedAt: new Date(), confirmedClientId: draft.clientId, confirmedProjectId: created!.id, updatedAt: new Date() }).where(and(eq(intakeItems.id, proposal.intakeItemId), eq(intakeItems.organizationId, actor.organizationId), eq(intakeItems.status, "SETUP_IN_PROGRESS")));
    }
    await record(tx as never, actor, "project.created_from_setup", "PROJECT", created!.id, null, { proposalId: proposal.id, intakeItemId: proposal.intakeItemId, taskCount: draft.tasks.length, teamSize: memberIds.length });
    return created!;
  });
  revalidateManagerSurfaces();
  redirect(`/projects?project=${project.id}`);
}

export async function claimIntake(form: FormData) {
  const actor = await managerOrThrow(); const id = required(form, "intakeItemId"); const expected = Number(required(form, "lockVersion"));
  const { db } = createDatabase();
  const changed = await db.update(intakeItems).set({ status: "CLAIMED", claimedByMembershipId: actor.membershipId, claimedAt: new Date(), lockVersion: expected + 1, updatedAt: new Date() }).where(and(eq(intakeItems.id, id), eq(intakeItems.organizationId, actor.organizationId), eq(intakeItems.lockVersion, expected), eq(intakeItems.status, "UNASSIGNED"))).returning();
  if (!changed[0]) throw new Error("This item was claimed or changed by another manager; refresh and retry");
  revalidateManagerSurfaces();
}

export async function releaseIntake(form: FormData) {
  const actor = await managerOrThrow(); const id = required(form, "intakeItemId"); const expected = Number(required(form, "lockVersion"));
  const { db } = createDatabase();
  const changed = await db.update(intakeItems).set({ status: "UNASSIGNED", claimedByMembershipId: null, claimedAt: null, lockVersion: expected + 1, updatedAt: new Date() }).where(and(eq(intakeItems.id, id), eq(intakeItems.organizationId, actor.organizationId), eq(intakeItems.claimedByMembershipId, actor.membershipId), eq(intakeItems.lockVersion, expected))).returning();
  if (!changed[0]) throw new Error("The claim changed; refresh and retry");
  revalidateManagerSurfaces();
}
