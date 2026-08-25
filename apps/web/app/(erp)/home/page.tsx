import { and, clients, createDatabase, deliverables, eq, isNull, projects, taskAssignees, tasks, workflowStages } from "@andthenn/db";
import { AssignedWorkHome } from "../../../components/assigned-work-home";
import { ManagerHome } from "../../../components/manager-home";
import { resolveActorContext } from "../../../lib/actor-context";
import { getManagerHomeData } from "../../../lib/manager-overview";

export default async function HomePage() {
  const actor = await resolveActorContext(); if (!actor) return null;
  if (actor.role === "MANAGER") return <ManagerHome name={actor.displayName} data={await getManagerHomeData(actor.organizationId)} />;
  const { db } = createDatabase();
  const rows = await db.select({ id: tasks.id, name: tasks.name, dueAt: tasks.dueAt, projectId: projects.id, project: projects.name, client: clients.name, output: deliverables.name, stage: workflowStages.name, priority: tasks.priority }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).innerJoin(clients, eq(clients.id, projects.clientId)).leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), eq(taskAssignees.membershipId, actor.membershipId), isNull(taskAssignees.removedAt)));
  return <AssignedWorkHome name={actor.displayName} temporary={actor.role === "TEMP_FREELANCER"} expiresAt={actor.expiresAt} tasks={rows.map((row) => ({ ...row, stage: row.stage ?? "Workflow" }))}/>;
}
