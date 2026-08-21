"use server";

import {
  activityEvents, and, auditEvents, clients, createDatabase, eq,
  intakeConversions, intakeItems, intakeSourceItems, memberships, projectMemberships, projects, proposals,
  workflowStages, workflows,
} from "@andthenn/db";
import { authorize } from "@andthenn/domain";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveActorContext, type ActorContext } from "../../../lib/actor-context";
import { demoModeEnabled } from "../../../lib/config";

const defaultStages = ["Briefing", "In production", "Client review", "Completed"];
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const required = (form: FormData, key: string) => {
  const result = value(form, key); if (!result) throw new Error(`${key} is required`); return result;
};

async function actorOrThrow() {
  if (demoModeEnabled()) throw new Error("Demo mode is read-only");
  const actor = await resolveActorContext();
  if (!actor) throw new Error("Authentication required");
  authorize(actor, "intake:process");
  return actor;
}

async function record(tx: ReturnType<typeof createDatabase>["db"], actor: ActorContext, action: string, objectType: string, objectId: string, before: unknown, after: unknown, reason?: string) {
  await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: `${actor.displayName} <${actor.email}>`, source: "SERVER_ACTION", action, objectType, objectId, before: before ?? null, after: after ?? null, reason: reason ?? null, correlationId: crypto.randomUUID() });
  await tx.insert(activityEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, eventType: action, entityType: objectType, entityId: objectId, source: "SERVER_ACTION", snapshot: after ?? {} });
}

export async function createManualIntake(form: FormData) {
  const actor = await actorOrThrow();
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
  revalidatePath("/intake");
}

export async function claimIntake(form: FormData) {
  const actor = await actorOrThrow(); const id = required(form, "intakeItemId"); const expected = Number(required(form, "lockVersion"));
  if (!Number.isInteger(expected) || expected < 0) throw new Error("Invalid queue version");
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const changed = await tx.update(intakeItems).set({ status: "CLAIMED", claimedByMembershipId: actor.membershipId, claimedAt: new Date(), lockVersion: expected + 1, updatedAt: new Date() }).where(and(eq(intakeItems.id, id), eq(intakeItems.organizationId, actor.organizationId), eq(intakeItems.lockVersion, expected), eq(intakeItems.status, "UNASSIGNED"))).returning();
    if (!changed[0]) throw new Error("This item was claimed or changed by another manager; refresh and retry");
    await record(tx as never, actor, "intake.claimed", "INTAKE", id, { status: "UNASSIGNED", lockVersion: expected }, { status: "CLAIMED", claimedBy: actor.membershipId, lockVersion: expected + 1 });
  });
  revalidatePath("/intake");
}

export async function releaseIntake(form: FormData) {
  const actor = await actorOrThrow(); const id = required(form, "intakeItemId"); const expected = Number(required(form, "lockVersion"));
  const { db } = createDatabase();
  await db.transaction(async (tx) => {
    const changed = await tx.update(intakeItems).set({ status: "UNASSIGNED", claimedByMembershipId: null, claimedAt: null, lockVersion: expected + 1, updatedAt: new Date() }).where(and(eq(intakeItems.id, id), eq(intakeItems.organizationId, actor.organizationId), eq(intakeItems.claimedByMembershipId, actor.membershipId), eq(intakeItems.lockVersion, expected))).returning();
    if (!changed[0]) throw new Error("The claim changed; refresh and retry");
    await record(tx as never, actor, "intake.released", "INTAKE", id, { status: "CLAIMED", lockVersion: expected }, { status: "UNASSIGNED", lockVersion: expected + 1 });
  });
  revalidatePath("/intake");
}

export async function createProposalFromIntake(form: FormData) {
  const actor = await actorOrThrow(); const intakeItemId = required(form, "intakeItemId"); const title = required(form, "title"); const brief = required(form, "brief");
  const { db } = createDatabase();
  const [proposal] = await db.transaction(async (tx) => {
    const [item] = await tx.select().from(intakeItems).where(and(eq(intakeItems.id, intakeItemId), eq(intakeItems.organizationId, actor.organizationId))).limit(1);
    if (!item || item.claimedByMembershipId !== actor.membershipId) throw new Error("Claim this intake item before creating a proposal");
    const [created] = await tx.insert(proposals).values({ organizationId: actor.organizationId, intakeItemId, clientId: item.confirmedClientId, title, brief, budgetMinor: value(form, "budgetMinor") ? Number(value(form, "budgetMinor")) : null }).returning();
    await tx.insert(intakeConversions).values({ organizationId: actor.organizationId, intakeItemId, targetType: "PENDING_PROPOSAL", proposalId: created!.id, idempotencyKey: required(form, "idempotencyKey"), convertedByMembershipId: actor.membershipId });
    await tx.update(intakeItems).set({ status: "CONVERTED", convertedAt: new Date(), updatedAt: new Date() }).where(eq(intakeItems.id, intakeItemId));
    await record(tx as never, actor, "proposal.created_from_intake", "PROPOSAL", created!.id, null, { intakeItemId, title }); return [created!];
  });
  revalidatePath("/intake"); redirect(`/proposals?created=${proposal.id}`);
}

/** Final activation is intentionally one transaction: downstream objects and source lineage either all exist or none do. */
export async function activateIntakeProject(form: FormData) {
  const actor = await actorOrThrow(); authorize(actor, "projects:activate");
  const intakeItemId = required(form, "intakeItemId"), clientId = required(form, "clientId"), name = required(form, "name"), ownerMembershipId = required(form, "ownerMembershipId");
  const deadline = new Date(required(form, "deadline")); if (Number.isNaN(deadline.getTime())) throw new Error("A valid deadline is required");
  const { db } = createDatabase();
  const [project] = await db.transaction(async (tx) => {
    const [[item], [client], [owner]] = await Promise.all([
      tx.select().from(intakeItems).where(and(eq(intakeItems.id, intakeItemId), eq(intakeItems.organizationId, actor.organizationId))).limit(1),
      tx.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId), eq(clients.lifecycle, "ACTIVE"))).limit(1),
      tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.id, ownerMembershipId), eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))).limit(1),
    ]);
    if (!item || item.claimedByMembershipId !== actor.membershipId || !client || !owner) throw new Error("The intake claim, client, or owner is no longer valid");
    const [created] = await tx.insert(projects).values({ organizationId: actor.organizationId, clientId, sourceIntakeItemId: intakeItemId, ownerMembershipId, name, deadline, budgetMinor: value(form, "budgetMinor") ? Number(value(form, "budgetMinor")) : null, notes: value(form, "notes") || null, status: "ACTIVE", activatedAt: new Date() }).returning();
    await tx.insert(projectMemberships).values({ organizationId: actor.organizationId, projectId: created!.id, membershipId: ownerMembershipId, canCreateTasks: true, canShareReviews: true, canViewFinances: true });
    const [workflow] = await tx.insert(workflows).values({ organizationId: actor.organizationId, projectId: created!.id }).returning();
    await tx.insert(workflowStages).values(defaultStages.map((stage, position) => ({ organizationId: actor.organizationId, workflowId: workflow!.id, name: stage, position, semantic: stage === "Client review" ? "CLIENT_REVIEW" as const : "NORMAL" as const })));
    await tx.insert(intakeConversions).values({ organizationId: actor.organizationId, intakeItemId, targetType: "NEW_PROJECT", projectId: created!.id, idempotencyKey: required(form, "idempotencyKey"), convertedByMembershipId: actor.membershipId });
    await tx.update(intakeItems).set({ status: "CONVERTED", convertedAt: new Date(), confirmedClientId: clientId, confirmedProjectId: created!.id, updatedAt: new Date() }).where(eq(intakeItems.id, intakeItemId));
    await record(tx as never, actor, "intake.activated", "PROJECT", created!.id, null, { intakeItemId, clientId, ownerMembershipId, deadline: deadline.toISOString() }); return [created!];
  });
  revalidatePath("/intake"); revalidatePath("/projects"); redirect(`/projects/${project.id}`);
}
