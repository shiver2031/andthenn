import { Button } from "@andthenn/ui";
import { and, clients, createDatabase, deliverables, eq, inArray, isNull, memberships, profiles, projects, sql, taskAssignees, tasks, workflowStages } from "@andthenn/db";
import { Plus } from "lucide-react";
import Link from "next/link";
import { PageHeading } from "../../../components/page-heading";
import { ProjectWorkspace, type WorkspaceProject } from "../../../components/project-workspace";
import { resolveActorContext } from "../../../lib/actor-context";
import { startManualProjectSetup } from "../intake/actions";
import { notFound, redirect } from "next/navigation";
import { isOperationalLeader } from "@andthenn/domain";
import { canReadProject, canReadTask } from "../../../lib/resource-access";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ project?: string; task?: string; setup?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null;
  const params = await searchParams; const { db } = createDatabase(); const manager = isOperationalLeader(actor.role);
  if (manager && params.setup) redirect(`/intake?view=setups&setup=${params.setup}`);
  const [projectRows, projectTaskRows, membersRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, clientId: clients.id, client: clients.name, owner: profiles.displayName }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).innerJoin(memberships, eq(memberships.id, projects.ownerMembershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(eq(projects.organizationId, actor.organizationId)),
    db.select({ projectId: projects.id, taskId: tasks.id }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(eq(tasks.organizationId, actor.organizationId)),
    actor.role !== "CLIENT" ? db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role, expiresAt: memberships.expiresAt }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"), sql`${memberships.role} <> 'CLIENT'`)) : Promise.resolve([]),
  ]);
  const uniqueProjects = projectRows.filter((project) => canReadProject(actor, { id: project.id, clientId: project.clientId, taskIds: projectTaskRows.filter((row) => row.projectId === project.id).map((row) => row.taskId) }));
  if (actor.role === "CLIENT") {
    if (params.project && !uniqueProjects.some((project) => project.id === params.project)) notFound();
    if (params.project) redirect(`/projects/${params.project}`);
    return <><PageHeading title="My Projects" description="Open a shared project to review work and download final deliveries."/><div className="surface divide-y divide-zinc-100 rounded-2xl">{uniqueProjects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="block min-h-16 p-5 hover:bg-violet-50"><strong className="block">{project.name}</strong><span className="text-sm text-zinc-600">{project.client} · {project.status.replaceAll("_", " ")}</span></Link>)}{!uniqueProjects.length && <p className="p-6 text-sm text-zinc-600">No projects are currently shared with you. Your contact can arrange access.</p>}</div></>;
  }
  const projectIds = uniqueProjects.map((project) => project.id);
  const allTaskRows = projectIds.length ? await db.select({ id: tasks.id, name: tasks.name, description: tasks.description, priority: tasks.priority, executionStatus: tasks.executionStatus, dueAt: tasks.dueAt, estimatedMinutes: tasks.estimatedMinutes, version: tasks.version, output: deliverables.name, projectId: projects.id, clientId: projects.clientId, stage: workflowStages.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId)).where(and(eq(tasks.organizationId, actor.organizationId), inArray(projects.id, projectIds))): [];
  const taskRows = allTaskRows.filter((task) => canReadTask(actor, { id: task.projectId, clientId: task.clientId, taskId: task.id, taskIds: [task.id] }));
  const taskIds = taskRows.map((task) => task.id);
  const assignmentRows = taskIds.length ? await db.select({ taskId: taskAssignees.taskId, id: memberships.id, name: profiles.displayName, kind: taskAssignees.kind }).from(taskAssignees).innerJoin(memberships, eq(memberships.id, taskAssignees.membershipId)).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt), inArray(taskAssignees.taskId, taskIds))): [];
  const workspace: WorkspaceProject[] = uniqueProjects.map((project) => ({ ...project, deadline: project.deadline.toISOString(), tasks: taskRows.filter((task) => task.projectId === project.id).map((task) => ({ ...task, dueAt: task.dueAt.toISOString(), stage: task.stage ?? "—", assignees: assignmentRows.filter((assignment) => assignment.taskId === task.id).map((assignment) => ({ id: assignment.id, name: assignment.name, kind: assignment.kind as "PRIMARY" | "COLLABORATOR" })) })) }));
  if (params.project && !workspace.some((project) => project.id === params.project)) notFound();
  const selectedProjectId = params.project ?? workspace[0]?.id;
  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageHeading eyebrow={`${workspace.length} ${manager ? "projects" : "linked projects"}`} title={manager ? "Projects" : "My project work"} description={manager ? "Expand a project to manage tasks and assigned people without leaving this page." : "Scoped project work and assignments are shown here."}/><div className="flex flex-wrap gap-2">{<Link href={`/work?new=task${selectedProjectId ? `&project=${selectedProjectId}` : ""}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-700"><Plus size={16}/> New task</Link>}{manager && <form action={startManualProjectSetup}><Button type="submit"><Plus size={16}/> New project</Button></form>}</div></div>
    <ProjectWorkspace projects={workspace} members={membersRows.filter((member) => !member.expiresAt || member.expiresAt > new Date()).map((member) => ({ id: member.id, name: member.name, role: member.role }))} selectedProjectId={selectedProjectId} selectedTaskId={params.task} manager={true}/>
  </>;
}
