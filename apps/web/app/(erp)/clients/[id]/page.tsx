import { RelationshipEditor } from "../../../../components/relationship-editor";
import { sql, activityEvents, and, brands, clients, contacts, createDatabase, deliverables, desc, eq, fileAssets, fileVersions, inArray, isNull, projects, reviewComments, reviewHubs, reviewShares, tasks } from "@andthenn/db";
import { Badge } from "@andthenn/ui";
import { Activity, Building2, CheckCircle2, Files, MessageSquareMore, ScanEye } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "../../../../components/page-heading";
import { resolveActorContext } from "../../../../lib/actor-context";
import { isResourceId } from "../../../../lib/resource-access";
import { can } from "@andthenn/domain";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await resolveActorContext();
  if (!actor) return null;
  const { id } = await params;
  if (!isResourceId(id) || !can(actor, "clients:manage")) notFound();
  const { db } = createDatabase();
  const [[client], brandRows, contactRows, projectRows] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.id, id), eq(clients.organizationId, actor.organizationId))).limit(1),
    db.select().from(brands).where(and(eq(brands.clientId, id), eq(brands.organizationId, actor.organizationId))),
    db.select().from(contacts).where(and(eq(contacts.clientId, id), eq(contacts.organizationId, actor.organizationId))),
    db.select({ id: projects.id, name: projects.name, status: projects.status, deadline: projects.deadline }).from(projects).where(and(eq(projects.clientId, id), eq(projects.organizationId, actor.organizationId))).orderBy(projects.deadline),
  ]);
  if (!client) notFound();
  const [revision] = await db.select({ token: sql<string>`clients.xmin::text` }).from(clients).where(eq(clients.id, id));

  const projectIds = projectRows.map((project) => project.id);
  const taskRows = projectIds.length ? await db.select({ id: tasks.id, name: tasks.name, status: tasks.executionStatus, priority: tasks.priority, dueAt: tasks.dueAt, completionRequestedAt: tasks.completionRequestedAt, projectId: deliverables.projectId, project: projects.name }).from(tasks).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(tasks.organizationId, actor.organizationId), inArray(deliverables.projectId, projectIds))) : [];
  const taskIds = taskRows.map((task) => task.id);
  const [fileRows, reviewRows, feedbackRows, activityRows] = await Promise.all([
    taskIds.length ? db.select({ id: fileVersions.id, lockedAt: fileVersions.lockedAt }).from(fileVersions).innerJoin(fileAssets, eq(fileAssets.id, fileVersions.fileAssetId)).where(and(eq(fileVersions.organizationId, actor.organizationId), inArray(fileAssets.taskId, taskIds))) : Promise.resolve([]),
    taskIds.length ? db.select({ id: reviewShares.id, status: reviewShares.status }).from(reviewShares).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).where(and(eq(reviewShares.organizationId, actor.organizationId), inArray(reviewHubs.taskId, taskIds))) : Promise.resolve([]),
    taskIds.length ? db.select({ id: reviewComments.id, body: reviewComments.body, createdAt: reviewComments.createdAt, taskId: tasks.id, task: tasks.name, project: projects.name }).from(reviewComments).innerJoin(reviewShares, eq(reviewShares.id, reviewComments.reviewShareId)).innerJoin(reviewHubs, eq(reviewHubs.id, reviewShares.reviewHubId)).innerJoin(tasks, eq(tasks.id, reviewHubs.taskId)).innerJoin(deliverables, eq(deliverables.id, tasks.deliverableId)).innerJoin(projects, eq(projects.id, deliverables.projectId)).where(and(eq(reviewComments.organizationId, actor.organizationId), inArray(reviewHubs.taskId, taskIds), isNull(reviewComments.resolvedAt))).orderBy(desc(reviewComments.createdAt)).limit(8) : Promise.resolve([]),
    db.select({ id: activityEvents.id, eventType: activityEvents.eventType, entityType: activityEvents.entityType, entityId: activityEvents.entityId, createdAt: activityEvents.createdAt }).from(activityEvents).where(eq(activityEvents.organizationId, actor.organizationId)).orderBy(desc(activityEvents.createdAt)).limit(150),
  ]);

  const now = new Date();
  const openTasks = taskRows.filter((task) => task.status !== "COMPLETED");
  const prioritized = [...openTasks].sort((a, b) => {
    const score = (task: typeof a) => (task.completionRequestedAt ? 0 : task.status === "BLOCKED" ? 1 : task.dueAt < now ? 2 : task.priority === "URGENT" ? 3 : 4);
    return score(a) - score(b) || a.dueAt.getTime() - b.dueAt.getTime();
  });
  const next = prioritized[0];
  const activeReviews = reviewRows.filter((review) => review.status === "ACTIVE").length;
  const finalFiles = fileRows.filter((file) => file.lockedAt !== null).length;
  const entityIds = new Set([id, ...projectIds, ...taskIds]);
  const activity = activityRows.filter((event) => entityIds.has(event.entityId)).slice(0, 12);

  return <>
    <section aria-label="Relationship editing" className="surface mb-4 rounded-2xl p-5"><h2 className="text-lg font-bold">Maintain this relationship</h2><RelationshipEditor clientId={id} revision={revision!.token} kind="client" name={client.name} detail={client.notes ?? ""}/>{brandRows.map((brand) => <RelationshipEditor key={brand.id} clientId={id} revision={revision!.token} kind="brand" id={brand.id} name={brand.name} detail={brand.notes ?? ""}/>)}<RelationshipEditor clientId={id} revision={revision!.token} kind="brand"/>{contactRows.map((contact) => <RelationshipEditor key={contact.id} clientId={id} revision={revision!.token} kind="contact" id={contact.id} name={contact.name} detail={contact.roleLabel ?? ""}/>)}<RelationshipEditor clientId={id} revision={revision!.token} kind="contact"/></section>
    <PageHeading eyebrow={client.lifecycle} title={client.name} description={client.notes ?? "Relationship context, active work, approvals, feedback, and next action in one place."}/>
    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Building2} label="Projects" value={String(projectRows.length)}/>
      <Metric icon={ScanEye} label="Active reviews" value={String(activeReviews)}/>
      <Metric icon={Files} label="Approved finals" value={String(finalFiles)}/>
      <Metric icon={MessageSquareMore} label="Open feedback" value={String(feedbackRows.length)}/>
    </section>
    <section className="surface mb-4 rounded-2xl p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Next action</p>
      {next ? <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><Link href={`/tasks/${next.id}`} className="font-bold hover:text-violet-700">{next.name}</Link><p className="mt-1 text-sm text-zinc-500">{next.project} · due {next.dueAt.toLocaleDateString()}</p></div><Badge tone={next.completionRequestedAt ? "cyan" : next.status === "BLOCKED" ? "rose" : next.dueAt < now ? "amber" : "violet"}>{next.completionRequestedAt ? "CONFIRM COMPLETION" : next.status === "BLOCKED" ? "UNBLOCK" : next.dueAt < now ? "OVERDUE" : next.priority}</Badge></div> : <div className="mt-3 flex items-center gap-2 text-sm text-zinc-600"><CheckCircle2 size={17} className="text-emerald-600"/>No unresolved project task needs attention.</div>}
    </section>
    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <div className="space-y-4">
        <section className="surface overflow-hidden rounded-2xl"><SectionHeading title="Projects" detail="Open a project for tasks, outputs, review, files, and audit activity."/><div className="divide-y divide-zinc-100">{projectRows.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 text-sm transition hover:bg-violet-50/40"><span><strong className="block">{project.name}</strong><small className="mt-1 block text-zinc-500">Due {project.deadline.toLocaleDateString()}</small></span><Badge tone={project.status === "ACTIVE" ? "green" : "neutral"}>{project.status.replaceAll("_", " ")}</Badge></Link>)}{!projectRows.length && <Empty>No projects yet.</Empty>}</div></section>
        <section className="surface overflow-hidden rounded-2xl"><SectionHeading title="Unresolved client feedback" detail="The newest open review comments across this relationship."/><div className="divide-y divide-zinc-100">{feedbackRows.map((feedback) => <Link key={feedback.id} href={`/tasks/${feedback.taskId}`} className="block px-5 py-4 transition hover:bg-violet-50/40"><p className="line-clamp-2 text-sm font-semibold">{feedback.body}</p><p className="mt-2 text-xs text-zinc-500">{feedback.project} · {feedback.task} · {feedback.createdAt.toLocaleString()}</p></Link>)}{!feedbackRows.length && <Empty>No unresolved external feedback.</Empty>}</div></section>
      </div>
      <div className="space-y-4">
        <section className="surface rounded-2xl p-5"><h2 className="font-bold">Relationship</h2><div className="mt-4 space-y-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Brands</p><p className="mt-1 text-sm text-zinc-700">{brandRows.map((brand) => brand.name).join(", ") || "No brands recorded."}</p></div><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">Contacts</p><div className="mt-1 space-y-2">{contactRows.map((contact) => <p key={contact.id} className="text-sm"><strong>{contact.name}</strong>{contact.roleLabel && <span className="text-zinc-500"> · {contact.roleLabel}</span>}</p>)}{!contactRows.length && <p className="text-sm text-zinc-500">No contacts recorded.</p>}</div></div></div></section>
        <section className="surface overflow-hidden rounded-2xl"><div className="flex items-center gap-3 border-b border-zinc-100 p-5"><Activity size={17} className="text-violet-600"/><div><h2 className="font-bold">Recent activity</h2><p className="mt-1 text-xs text-zinc-500">Events tied to this client, its projects, or tasks.</p></div></div><div className="divide-y divide-zinc-100">{activity.map((event) => <div key={event.id} className="px-5 py-3"><p className="text-sm font-semibold capitalize">{event.eventType.replaceAll(".", " ").replaceAll("_", " ")}</p><time className="mt-1 block text-xs text-zinc-500">{event.createdAt.toLocaleString()}</time></div>)}{!activity.length && <Empty>No client activity recorded yet.</Empty>}</div></section>
      </div>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) { return <div className="surface rounded-2xl p-4"><Icon size={17} className="text-violet-600"/><p className="mt-3 text-xs font-semibold text-zinc-500">{label}</p><p className="display mt-1 text-xl font-bold">{value}</p></div>; }
function SectionHeading({ title, detail }: { title: string; detail: string }) { return <div className="border-b border-zinc-100 p-5"><h2 className="font-bold">{title}</h2><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="p-6 text-sm text-zinc-500">{children}</p>; }
