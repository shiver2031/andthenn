import { getDiscussionAttention } from "../../../lib/discussion-attention";
import { getWorkSummary, inWorkGroup } from "../../../lib/work-summary";
import { WorkSummaryList } from "../../../components/work-summary-list";
import { getManagerHomeData } from "../../../lib/manager-overview";
import { isOperationalLeader } from "@andthenn/domain";
import { getTaskAttention } from "../../../lib/task-attention";
import { and, clients, createDatabase, deliverables, eq, inArray, isNull, memberships, profiles, projects, taskAssignees, tasks } from "@andthenn/db";
import Link from "next/link";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";
import { canReadProject } from "../../../lib/resource-access";
import { TaskCreateDialog } from "../../../components/task-create-dialog";

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ view?: string; new?: string; project?: string; deliverable?: string; group?: string; member?: string }> }) {
  const actor = await resolveActorContext(); if (!actor) return null;
  const { view = "mine", new: create, project: initialProjectId, deliverable: initialDeliverableId, group, member } = await searchParams;
  const { db } = createDatabase();
  const mine = await db.select({ taskId: taskAssignees.taskId }).from(taskAssignees).where(and(eq(taskAssignees.organizationId, actor.organizationId), eq(taskAssignees.membershipId, actor.membershipId), isNull(taskAssignees.removedAt)));
  const assignedByMe = await db.select({ taskId: taskAssignees.taskId }).from(taskAssignees).where(and(eq(taskAssignees.organizationId, actor.organizationId), eq(taskAssignees.assignedByMembershipId, actor.membershipId), isNull(taskAssignees.removedAt)));
  const attention = await getTaskAttention(actor);
  const summary = await getWorkSummary(actor);
  const rows = summary.rows.filter((row) => member ? row.memberIds.includes(member) : view === "attention" ? attention.some((item) => item.id === row.id) : view === "assigned" ? row.assignedByMe : view === "personal" ? row.status !== "COMPLETED" && (row.mine || (row.pending && row.reviewerId === actor.membershipId)) : view === "mentions" ? false : row.mine).filter((row) => !group || inWorkGroup(row, group, new Date(), summary.timezone));
  const operational = view === "attention" && isOperationalLeader(actor.role) ? (await getManagerHomeData(actor)).attention.filter((item) => item.id.startsWith("intake:") || item.id.startsWith("setup:") || item.id.startsWith("mention:")) : view === "attention" || view === "mentions" ? await getDiscussionAttention(actor) : [];
  const tabs = [{ key: "attention", label: "Needs attention", count: attention.length }, { key: "mine", label: "My tasks", count: mine.length }, { key: "assigned", label: "Assigned by me", count: assignedByMe.length }];
  const [candidateProjects, projectTaskRows, memberRows] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, clientId: projects.clientId, client: clients.name }).from(projects).innerJoin(clients, eq(clients.id, projects.clientId)).where(and(eq(projects.organizationId, actor.organizationId), inArray(projects.status, ["ACTIVE", "REOPENED"]))),
    db.select({ projectId: projects.id, taskId: tasks.id }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(eq(tasks.organizationId, actor.organizationId)),
    db.select({ id: memberships.id, name: profiles.displayName, role: memberships.role, startsAt: memberships.startsAt, expiresAt: memberships.expiresAt }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))),
  ]);
  const visibleProjects = candidateProjects.filter((project) => canReadProject(actor, { id: project.id, clientId: project.clientId, taskIds: projectTaskRows.filter((row) => row.projectId === project.id).map((row) => row.taskId) }));
  const visibleProjectIds = visibleProjects.map((project) => project.id);
  const outputRows = visibleProjectIds.length ? await db.select({ id: deliverables.id, projectId: deliverables.projectId, name: deliverables.name, dueAt: deliverables.dueAt }).from(deliverables).where(and(eq(deliverables.organizationId, actor.organizationId), inArray(deliverables.projectId, visibleProjectIds), inArray(deliverables.status, ["OPEN", "REOPENED"]))) : [];
  const createProjects = visibleProjects.map((project) => ({ ...project, deliverables: outputRows.filter((output) => output.projectId === project.id).map((output) => ({ id: output.id, name: output.name, dueAt: output.dueAt.toISOString() })) })).filter((project) => project.deliverables.length);
  const activeMembers = memberRows.filter((member) => member.role !== "CLIENT" && (!member.startsAt || member.startsAt <= new Date()) && (!member.expiresAt || member.expiresAt > new Date())).map((member) => ({ id: member.id, name: member.name, role: member.role }));
  return <><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageHeading eyebrow="Execution queue" title="Work" description="A focused list of actions. Open a task for context, files, discussion, and review."/><Link href="/work?new=task" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:bg-violet-700">Create task</Link></div><nav className="mb-4 flex flex-wrap gap-2" aria-label="Work views">{tabs.map((tab) => <Link data-walkthrough={tab.key === "mine" ? "my-tasks" : tab.key === "assigned" ? "assigned-by-me" : undefined} key={tab.key} href={`/work?view=${tab.key}`} className={`rounded-xl px-3 py-2 text-sm font-bold ${view === tab.key ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600"}`}>{tab.label} <span className="ml-1 opacity-70">{tab.count}</span></Link>)}</nav><section className="surface overflow-hidden rounded-2xl">{operational.map((item) => <Link key={item.id} href={{ pathname: item.href.split(/[?#]/)[0]!, query: Object.fromEntries(new URLSearchParams(item.href.split("?")[1]?.split("#")[0])), hash: item.href.split("#")[1] }} className="block border-b border-zinc-100 p-4"><strong>{item.title}</strong><p className="text-sm text-zinc-600">{item.meta}</p></Link>)}<WorkSummaryList rows={rows} timezone={summary.timezone}/></section>{create === "task" && <TaskCreateDialog projects={createProjects} members={activeMembers} initialProjectId={initialProjectId} initialDeliverableId={initialDeliverableId}/>}</>;
}
