import { Button } from "@andthenn/ui";
import { and, clients, createDatabase, deliverables, eq, inArray, isNull, memberships, profiles, projects, taskAssignees, tasks, workflowStages } from "@andthenn/db";
import { Plus } from "lucide-react";
import { PageHeading } from "../../../components/page-heading";
import { ProjectWorkspace, type WorkspaceProject } from "../../../components/project-workspace";
import { resolveActorContext } from "../../../lib/actor-context";
import { startManualProjectSetup } from "../intake/actions";
import { redirect } from "next/navigation";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ project?: string; task?: string; setup?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null;
  const params = await searchParams; const { db } = createDatabase(); const manager = actor.role === "MANAGER";
  if (manager && params.setup) redirect(`/intake?view=setups&setup=${params.setup}`);
  const [projectRows, membersRows] = await Promise.all([
    manager
      ? db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, client: clients.name, owner: profiles.displayName }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).innerJoin(memberships, eq(memberships.id, projects.ownerMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(eq(projects.organizationId, actor.organizationId))
      : db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, client: clients.name, owner: profiles.displayName }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).innerJoin(clients, eq(clients.id, projects.clientId)).innerJoin(memberships, eq(memberships.id, projects.ownerMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), eq(taskAssignees.membershipId, actor.membershipId), isNull(taskAssignees.removedAt))),
    manager ? db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))) : Promise.resolve([]),
  ]);
  const uniqueProjects = [...new Map(projectRows.map((project) => [project.id, project])).values()];
  const projectIds = uniqueProjects.map((project) => project.id);
  const taskRows = projectIds.length ? await db.select({ id: tasks.id, name: tasks.name, description: tasks.description, priority: tasks.priority, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes, version: tasks.version, output: deliverables.name, projectId: projects.id, stage: workflowStages.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId)).where(and(eq(tasks.organizationId, actor.organizationId), inArray(projects.id, projectIds), ...(manager ? [] : [inArray(tasks.id, [...actor.primaryTaskIds, ...actor.collaboratorTaskIds])]))): [];
  const taskIds = taskRows.map((task) => task.id);
  const assignmentRows = taskIds.length ? await db.select({ taskId: taskAssignees.taskId, id: memberships.id, name: profiles.displayName, kind: taskAssignees.kind }).from(taskAssignees).innerJoin(memberships, eq(memberships.id, taskAssignees.membershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt), inArray(taskAssignees.taskId, taskIds), ...(manager ? [] : [eq(taskAssignees.membershipId, actor.membershipId)]))): [];
  const workspace: WorkspaceProject[] = uniqueProjects.map((project) => ({ ...project, deadline: project.deadline.toISOString(), tasks: taskRows.filter((task) => task.projectId === project.id).map((task) => ({ ...task, dueAt: task.dueAt.toISOString(), stage: task.stage ?? "Workflow", assignees: assignmentRows.filter((assignment) => assignment.taskId === task.id).map((assignment) => ({ id: assignment.id, name: assignment.name, kind: assignment.kind as "PRIMARY" | "COLLABORATOR" })) })) }));
  const selectedProjectId = workspace.some((project) => project.id === params.project) ? params.project : workspace[0]?.id;
  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageHeading eyebrow={`${workspace.length} ${manager ? "projects" : "linked projects"}`} title={manager ? "Projects" : "My project work"} description={manager ? "Expand a project to manage tasks and assigned people without leaving this page." : "Only work assigned to you is shown."}/>{manager && <form action={startManualProjectSetup}><Button type="submit"><Plus size={16}/> New project</Button></form>}</div>
    <ProjectWorkspace projects={workspace} members={membersRows} selectedProjectId={selectedProjectId} selectedTaskId={params.task} manager={manager}/>
  </>;
}
