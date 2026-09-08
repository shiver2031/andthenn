import { and, eq, isNull, memberships, clientMemberships, projectMemberships, projects, deliverables, tasks, taskAssignees, sql, type Database } from "@andthenn/db";
import { isOperationalLeader } from "@andthenn/domain";
import type { ActorContext } from "./actor-context";
import { lockTaskProject } from "./project-lock";
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Recheck time-sensitive authority inside the project-serialized command. */
export async function lockActiveTask(tx: Transaction, actor: ActorContext, taskId: string) {
  await lockTaskProject(tx, taskId);
  const now = new Date();
  const [member] = await tx.select().from(memberships).where(and(eq(memberships.id, actor.membershipId), eq(memberships.organizationId, actor.organizationId))).limit(1).for("share");
  if (!member || member.status !== "ACTIVE" || (member.startsAt && member.startsAt > now) || (member.expiresAt && member.expiresAt <= now) || (member.sessionRevokedAfter && (!actor.sessionIssuedAt || actor.sessionIssuedAt <= member.sessionRevokedAfter)) || member.role !== actor.role) throw new Error("Your access changed. Sign in again.");
  const [task] = await tx.select({ task: tasks, projectStatus: projects.status, projectId: projects.id, clientId: projects.clientId, outputDueAt: deliverables.dueAt }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(tasks.id, taskId), eq(tasks.organizationId, actor.organizationId))).limit(1);
  if (!task) throw new Error("Task unavailable.");
  const assignments = await tx.select().from(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt)));
  if (!isOperationalLeader(actor.role)) {
    const [grant] = await tx.select({ id: projectMemberships.membershipId }).from(projectMemberships).where(and(eq(projectMemberships.projectId, task.projectId), eq(projectMemberships.membershipId, actor.membershipId), isNull(projectMemberships.removedAt))).limit(1);
    if (actor.role === "CLIENT") {
      const [link] = await tx.select({ id: clientMemberships.membershipId }).from(clientMemberships).where(and(eq(clientMemberships.membershipId, actor.membershipId), eq(clientMemberships.clientId, task.clientId))).limit(1);
      if (!grant || !link) throw new Error("Client project access was revoked.");
    } else if (!grant && !assignments.some((row) => row.membershipId === actor.membershipId || row.assignedByMembershipId === actor.membershipId)) throw new Error("Task access was revoked.");
  }
  const primary = assignments.find((row) => row.kind === "PRIMARY");
  return { ...task, assignments, primary };
}

export async function assertFinalDelivery(tx: Transaction, taskId: string) {
  const [state] = await tx.execute<{ ready: boolean }>(sql`select
    ((not exists (select 1 from file_assets where task_id = ${taskId}::uuid) and not exists (select 1 from tasks where id=${taskId}::uuid and requires_client_delivery))
     or exists (select 1 from current_final_files where task_id = ${taskId}::uuid)) as ready`);
  if (!state?.ready) throw new Error("Publish the Client-approved final version before requesting or confirming completion.");
}

export function independentReviewer(actor: ActorContext, requester: string) {
  if (actor.membershipId === requester) throw new Error("Another active internal reviewer must confirm your work.");
  return isOperationalLeader(actor.role);
}
