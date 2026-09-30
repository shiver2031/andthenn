import Link from "next/link";
import { getDiscussionAttention } from "../../../lib/discussion-attention";
import { InternalHomeSupport } from "../../../components/internal-home-support";
import { getWorkSummary } from "../../../lib/work-summary";
import { getTaskAttention } from "../../../lib/task-attention";
import { and, createDatabase, deliverables, eq, fileVersions, gt, isNull, or, projects, reviewHubs, reviewShares, sql, tasks } from "@andthenn/db";
import { AssignedWorkHome } from "../../../components/assigned-work-home";
import { ManagerHome } from "../../../components/manager-home";
import { resolveActorContext } from "../../../lib/actor-context";
import { getManagerHomeData } from "../../../lib/manager-overview";
import { ClientHome } from "../../../components/client-home";
import { canReadProject } from "../../../lib/resource-access";
import { Suspense } from "react";
import type { ActorContext } from "../../../lib/actor-context";

export default async function HomePage() {
  const actor = await resolveActorContext(); if (!actor) return null;
  if (actor.role === "FOUNDER" || actor.role === "MANAGER") return <>
    <Suspense fallback={<HomeSectionFallback label="Loading company overview"/>}><ManagerOverview actor={actor}/></Suspense>
    <Suspense fallback={<HomeSectionFallback label="Loading your work"/>}><InternalHomeSupport actor={actor}/></Suspense>
  </>;
  const { db } = createDatabase();
  if (actor.role === "CLIENT") {
    const [projectRows, reviews] = await Promise.all([
      db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline, clientId: projects.clientId }).from(projects).where(eq(projects.organizationId, actor.organizationId)),
      db.select({ id: reviewShares.id, projectId: projects.id, project: projects.name, clientId: projects.clientId, filename: fileVersions.filename, version: fileVersions.versionNumber }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).innerJoin(tasks, eq(tasks.id, reviewHubs.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).innerJoin(fileVersions, eq(fileVersions.id, reviewShares.fileVersionId)).where(and(eq(reviewShares.organizationId, actor.organizationId), eq(reviewShares.status, "ACTIVE"), or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())), eq(fileVersions.processingStatus, "READY"), sql`not exists (select 1 from task_review_selections selection where selection.task_id = ${tasks.id} and selection.file_version_id <> ${fileVersions.id})`, sql`${tasks.executionStatus} <> 'COMPLETED'`, sql`exists (select 1 from file_approvals a where a.task_id=${tasks.id} and a.file_version_id=${fileVersions.id} and a.approval_kind='INTERNAL' and a.reopened_at is null)`, sql`not exists (select 1 from file_approvals a where a.task_id = ${tasks.id} and a.file_version_id = ${fileVersions.id} and a.reopened_at is null and a.approval_kind = 'CLIENT')`)),
    ]);
    return <ClientHome name={actor.displayName} projects={projectRows.filter((project) => canReadProject(actor, project))} reviews={reviews.filter((review) => canReadProject(actor, { id: review.projectId, clientId: review.clientId }))}/>;
  }
  const [attention, { rows, timezone }, mentions] = await Promise.all([getTaskAttention(actor), getWorkSummary(actor), getDiscussionAttention(actor)]);
  const visible = rows.filter((row) => row.mine || row.assignedByMe || row.reviewerId === actor.membershipId || attention.some((item) => item.id === row.id));
  return <>{mentions.length > 0 && <section className="surface mb-4 rounded-2xl p-4"><h2 className="font-bold">Unread mentions</h2>{mentions.slice(0,5).map((item) => <Link key={item.id} href={{ pathname: item.href.split("#")[0]!, hash: item.href.split("#")[1] }} className="block min-h-11 py-3 text-sm text-violet-700">{item.meta}</Link>)}<Link href="/work?view=mentions" className="inline-flex min-h-11 items-center text-sm font-bold">View all</Link></section>}<AssignedWorkHome name={actor.displayName} temporary={actor.accountType === "TEMPORARY"} expiresAt={actor.expiresAt} tasks={visible} timezone={timezone} attentionIds={attention.map((row) => row.id)}/></>;
}

async function ManagerOverview({ actor }: { actor: ActorContext }) {
  return <ManagerHome name={actor.displayName} role={actor.role} data={await getManagerHomeData(actor)}/>;
}

function HomeSectionFallback({ label }: { label: string }) {
  return <section role="status" aria-label={label} className="surface mb-4 animate-pulse rounded-2xl p-5"><div className="h-5 w-48 rounded bg-zinc-200"/><div className="mt-4 h-24 rounded-xl bg-zinc-100"/></section>;
}
