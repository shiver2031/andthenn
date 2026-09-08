import { and, clients, createDatabase, deliverables, eq, inArray, isNull, memberships, organizations, profiles, projects, taskAssignees, tasks, workflowStages } from "@andthenn/db";
import type { ActorContext } from "./actor-context";
import { canReadTask } from "./resource-access";
import { calendarDate, nextCalendarDate } from "./calendar";
export async function getWorkSummary(actor: ActorContext) {
  const { db } = createDatabase();
  const [candidates, assignments, org] = await Promise.all([
    db.select({ id: tasks.id, name: tasks.name, description: tasks.description, dueAt: tasks.dueAt, status: tasks.executionStatus, stateKind: tasks.stateKind, priority: tasks.priority, reviewerId: tasks.completionReviewerMembershipId, pending: tasks.completionRequestedAt, projectId: projects.id, clientId: clients.id, project: projects.name, client: clients.name, stage: workflowStages.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).innerJoin(clients, eq(clients.id, projects.clientId)).leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId)).where(eq(tasks.organizationId, actor.organizationId)),
    db.select({ taskId: taskAssignees.taskId, memberId: taskAssignees.membershipId, assignedBy: taskAssignees.assignedByMembershipId, assignedAt: taskAssignees.assignedAt, kind: taskAssignees.kind, name: profiles.displayName }).from(taskAssignees).innerJoin(memberships, eq(memberships.id, taskAssignees.membershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt))),
    db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1),
  ]);
  const assigners = [...new Set(assignments.map((row) => row.assignedBy))];
  const names = assigners.length ? await db.select({ id: memberships.id, name: profiles.displayName }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), inArray(memberships.id, assigners))) : [];
  const rows = candidates.filter((row) => canReadTask(actor, { id: row.projectId, clientId: row.clientId, taskId: row.id, taskIds: [row.id] })).map((row) => {
    const assigned = assignments.filter((a) => a.taskId === row.id), primary = assigned.find((a) => a.kind === "PRIMARY");
    return { ...row, pending: row.status === "COMPLETED" ? null : row.pending, owner: primary?.name ?? "Unassigned", assignedBy: names.find((p) => p.id === primary?.assignedBy)?.name ?? "Unknown", assignedAt: primary?.assignedAt ?? null, mine: assigned.some((a) => a.memberId === actor.membershipId), assignedByMe: assigned.some((a) => a.assignedBy === actor.membershipId), memberIds: [...new Set(assigned.flatMap((a) => [a.memberId, a.assignedBy]))] };
  }).sort((a,b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id));
  return { rows, timezone: org[0]?.timezone ?? "Asia/Kolkata" };
}
export type WorkSummaryRow = Awaited<ReturnType<typeof getWorkSummary>>["rows"][number];
export function inWorkGroup(row: Pick<WorkSummaryRow, "status" | "dueAt" | "stage">, group: string, now: Date, timezone: string) {
  const day = calendarDate(row.dueAt, timezone), today = calendarDate(now, timezone);
  if (group === "completed") return row.status === "COMPLETED";
  if (row.status === "COMPLETED") return false;
  if (group === "today") return day === today;
  if (group === "tomorrow") return day === nextCalendarDate(today, 1);
  if (group === "waiting") return row.status === "WAITING" || /review/i.test(row.stage ?? "");
  return day > nextCalendarDate(today, 1);
}
