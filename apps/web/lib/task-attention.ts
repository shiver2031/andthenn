import { calendarDate } from "./calendar";
import { and, clients, createDatabase, deliverables, eq, isNull, notifications, organizations, projects, tasks, workflowStages } from "@andthenn/db";
import type { ActorContext } from "./actor-context";
import { canReadTask } from "./resource-access";

export function attentionReasons(task: { status: string; dueAt: Date; priority: string; pending: boolean; review: boolean }, context: { reviewer: boolean; mentioned: boolean }, now: Date, timeZone = "Asia/Kolkata"): string[] {
  if (task.status === "COMPLETED") return [];
  return [task.pending && context.reviewer ? "Completion needs your confirmation" : null, context.mentioned ? "You were mentioned" : null, task.status === "BLOCKED" ? "Blocked" : null, task.status === "WAITING" && !task.pending ? "Waiting for follow-up" : null, task.dueAt < now ? "Overdue" : null, calendarDate(task.dueAt, timeZone) === calendarDate(now, timeZone) ? "Due today" : null, task.priority === "HIGH" || task.priority === "URGENT" ? "High priority" : null, task.review ? "Review needs attention" : null].filter((reason): reason is string => reason !== null);
}

export async function getTaskAttention(actor: ActorContext, now = new Date()) {
  if (actor.role === "CLIENT") return [];
  const { db } = createDatabase();
  const [rows, mentions, orgs] = await Promise.all([
    db.select({ id: tasks.id, name: tasks.name, status: tasks.executionStatus, dueAt: tasks.dueAt, priority: tasks.priority, completionRequestedAt: tasks.completionRequestedAt, reviewerId: tasks.completionReviewerMembershipId, semantic: workflowStages.semantic, phase: workflowStages.name, stateKind: tasks.stateKind, projectId: projects.id, project: projects.name, clientId: projects.clientId, client: clients.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).innerJoin(clients, eq(clients.id, projects.clientId)).leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId)).where(eq(tasks.organizationId, actor.organizationId)),
    db.select({ taskId: notifications.objectId }).from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.recipientMembershipId, actor.membershipId), eq(notifications.eventType, "task.mentioned"), isNull(notifications.readAt))),
    db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, actor.organizationId)),
  ]);
  const mentioned = new Set(mentions.map((row) => row.taskId));
  return rows.filter((row) => canReadTask(actor, { id: row.projectId, clientId: row.clientId, taskId: row.id, taskIds: [row.id] })).map((row) => ({ ...row, reasons: attentionReasons({ ...row, pending: Boolean(row.completionRequestedAt), review: row.semantic === "CLIENT_REVIEW" || /review|approval/i.test(row.phase ?? "") || row.stateKind === "CLIENT_FEEDBACK_RECEIVED" }, { reviewer: row.reviewerId === actor.membershipId, mentioned: mentioned.has(row.id) }, now, orgs[0]?.timezone) })).filter((row) => row.reasons.length).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
