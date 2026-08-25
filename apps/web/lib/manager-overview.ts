import { and, clients, createDatabase, eq, intakeItems, memberships, profiles, projects, proposals, tasks, deliverables, workflowStages } from "@andthenn/db";

const queueStatuses = new Set(["UNASSIGNED", "CLAIMED", "NEEDS_MANAGER_INPUT", "READY_FOR_DECISION"]);
const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const formatDate = (value: Date) => dateFormatter.format(value);

export type ManagerNavigationCounts = {
  queue: number;
  setups: number;
  actionable: number;
};

export type ManagerAttentionItem = {
  id: string;
  title: string;
  meta: string;
  tone: "emerald" | "amber" | "violet" | "rose";
  href: string;
};

export type ManagerHomeData = {
  counts: ManagerNavigationCounts;
  activeProjects: number;
  overdueTasks: number;
  clientReviewTasks: number;
  projects: Array<{
    id: string;
    name: string;
    client: string;
    owner: string;
    deadlineLabel: string;
    progress: number;
    health: "On track" | "At risk";
  }>;
  attention: ManagerAttentionItem[];
};

export async function getManagerNavigationCounts(organizationId: string): Promise<ManagerNavigationCounts> {
  const { db } = createDatabase();
  const [intakes, pendingSetups] = await Promise.all([
    db.select({ status: intakeItems.status }).from(intakeItems).where(eq(intakeItems.organizationId, organizationId)),
    db.select({ id: proposals.id }).from(proposals).where(and(eq(proposals.organizationId, organizationId), eq(proposals.status, "PENDING"))),
  ]);
  const queue = intakes.filter((item) => queueStatuses.has(item.status)).length;
  const setups = pendingSetups.length;
  return { queue, setups, actionable: queue + setups };
}

export async function getManagerHomeData(organizationId: string, now = new Date()): Promise<ManagerHomeData> {
  const { db } = createDatabase();
  const [counts, projectRows, taskRows, queueRows, setupRows] = await Promise.all([
    getManagerNavigationCounts(organizationId),
    db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, client: clients.name, owner: profiles.displayName })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .innerJoin(memberships, eq(memberships.id, projects.ownerMembershipId))
      .innerJoin(profiles, eq(profiles.id, memberships.profileId))
      .where(eq(projects.organizationId, organizationId)),
    db.select({ id: tasks.id, name: tasks.name, stateKind: tasks.stateKind, dueAt: tasks.dueAt, projectId: projects.id, project: projects.name, client: clients.name, stageSemantic: workflowStages.semantic })
      .from(tasks)
      .innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId))
      .innerJoin(projects, eq(projects.id, deliverables.projectId))
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(workflowStages, eq(workflowStages.id, tasks.currentWorkflowStageId))
      .where(eq(tasks.organizationId, organizationId)),
    db.select({ id: intakeItems.id, title: intakeItems.title, status: intakeItems.status, createdAt: intakeItems.createdAt })
      .from(intakeItems).where(eq(intakeItems.organizationId, organizationId)),
    db.select({ id: proposals.id, title: proposals.title, intakeItemId: proposals.intakeItemId, updatedAt: proposals.updatedAt })
      .from(proposals).where(and(eq(proposals.organizationId, organizationId), eq(proposals.status, "PENDING"))),
  ]);

  const activeProjects = projectRows.filter((project) => project.status === "ACTIVE" || project.status === "REOPENED");
  const incomplete = taskRows.filter((task) => task.stateKind !== "COMPLETED");
  const overdue = incomplete.filter((task) => task.dueAt < now);
  const clientReview = incomplete.filter((task) => task.stageSemantic === "CLIENT_REVIEW");
  const projectData = activeProjects.sort((a, b) => a.deadline.getTime() - b.deadline.getTime()).map((project) => {
    const projectTasks = taskRows.filter((task) => task.projectId === project.id);
    const complete = projectTasks.filter((task) => task.stateKind === "COMPLETED").length;
    const atRisk = projectTasks.some((task) => task.stateKind !== "COMPLETED" && task.dueAt < now);
    return {
      id: project.id, name: project.name, client: project.client, owner: project.owner,
      deadlineLabel: formatDate(project.deadline), progress: projectTasks.length ? Math.round((complete / projectTasks.length) * 100) : 0,
      health: atRisk ? "At risk" as const : "On track" as const,
    };
  });
  const taskAttention: ManagerAttentionItem[] = [
    ...overdue.map((task) => ({ id: `overdue:${task.id}`, title: `Resolve overdue task: ${task.name}`, meta: `${task.client} · Due ${formatDate(task.dueAt)}`, tone: "rose" as const, href: `/projects?project=${task.projectId}&task=${task.id}` })),
    ...clientReview.filter((task) => !overdue.some((overdueTask) => overdueTask.id === task.id)).map((task) => ({ id: `review:${task.id}`, title: `Review ${task.name}`, meta: `${task.client} · Client review`, tone: "emerald" as const, href: `/projects?project=${task.projectId}&task=${task.id}` })),
  ];
  const queuedAttention = queueRows
    .filter((item) => queueStatuses.has(item.status))
    .map((item) => ({ id: `intake:${item.id}`, title: `Review intake: ${item.title ?? "Untitled request"}`, meta: `Captured ${formatDate(item.createdAt)}`, tone: "amber" as const, href: `/intake?view=queue&item=${item.id}` }));
  const setupAttention = setupRows.map((setup) => ({ id: `setup:${setup.id}`, title: `Resume setup: ${setup.title}`, meta: setup.intakeItemId ? "Intake-backed project setup" : "New project setup", tone: "violet" as const, href: `/intake?view=setups&setup=${setup.id}` }));
  return {
    counts,
    activeProjects: activeProjects.length,
    overdueTasks: overdue.length,
    clientReviewTasks: clientReview.length,
    projects: projectData,
    attention: [...taskAttention, ...queuedAttention, ...setupAttention].slice(0, 3),
  };
}
