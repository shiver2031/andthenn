"use server";
import { and, auditEvents, clientMemberships, createDatabase, eq, memberships, projectMemberships, projects } from "@andthenn/db";
import { can } from "@andthenn/domain";
import { revalidatePath } from "next/cache";
import { resolveActorContext } from "../../lib/actor-context";
import { demoModeEnabled } from "../../lib/config";
import { isResourceId } from "../../lib/resource-access";

export async function setClientProjectAccess(_state: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const actor = await resolveActorContext();
  if (!actor || !can(actor, "clients:manage") || demoModeEnabled()) return { error: "Client management permission required." };
  const projectId = String(form.get("projectId") ?? ""), memberId = String(form.get("memberId") ?? ""), grant = form.get("access") === "grant";
  if (!isResourceId(projectId) || !isResourceId(memberId) || !["grant", "revoke"].includes(String(form.get("access")))) return { error: "Choose a Client and access action." };
  const { db } = createDatabase();
  try {
    await db.transaction(async (tx) => {
      const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.organizationId, actor.organizationId))).limit(1).for("update");
      if (!project) throw new Error("Project unavailable.");
      const [member] = await tx.select({ status: memberships.status, expiresAt: memberships.expiresAt, startsAt: memberships.startsAt }).from(clientMemberships).innerJoin(memberships, eq(memberships.id, clientMemberships.membershipId)).where(and(eq(clientMemberships.organizationId, actor.organizationId), eq(clientMemberships.clientId, project.clientId), eq(memberships.id, memberId), eq(memberships.role, "CLIENT"))).limit(1);
      if (!member) throw new Error("Client must already be linked to this client record.");
      const now = new Date();
      if (grant && (member.status !== "ACTIVE" || (member.expiresAt && member.expiresAt <= now) || (member.startsAt && member.startsAt > now))) throw new Error("An active Client membership is required.");
      if (grant) await tx.insert(projectMemberships).values({ organizationId: actor.organizationId, projectId, membershipId: memberId }).onConflictDoUpdate({ target: [projectMemberships.projectId, projectMemberships.membershipId], set: { removedAt: null, canCreateTasks: false, canShareReviews: false, canViewFinances: false, updatedAt: now } });
      else await tx.update(projectMemberships).set({ removedAt: now, updatedAt: now }).where(and(eq(projectMemberships.projectId, projectId), eq(projectMemberships.membershipId, memberId)));
      await tx.insert(auditEvents).values({ organizationId: actor.organizationId, actorMembershipId: actor.membershipId, actorSnapshot: actor.displayName, source: "SERVER_ACTION", action: grant ? "client.project_granted" : "client.project_revoked", objectType: "PROJECT", objectId: projectId, after: { membershipId: memberId }, correlationId: crypto.randomUUID() });
    });
    for (const path of [`/projects/${projectId}`, "/home", "/files"]) revalidatePath(path);
    return { success: grant ? "Client access granted." : "Client access revoked. New requests are denied immediately." };
  } catch (error) { return { error: error instanceof Error && !error.message.startsWith("Failed query:") ? error.message : "Unable to change access. Retry shortly." }; }
}
