import { and, createDatabase, deliverables, eq, inArray, sql, tasks, timeEntries } from "@andthenn/db";
import { notFound } from "next/navigation";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";
export default async function ReportsPage() {
  const actor = await resolveActorContext(); if (!actor || actor.role === "TEMP_FREELANCER") notFound(); const { db } = createDatabase();
  const assignedTaskIds = [...new Set([...actor.primaryTaskIds, ...actor.collaboratorTaskIds])];
  const taskScope = actor.role === "MANAGER"
    ? eq(tasks.organizationId, actor.organizationId)
    : and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.id, assignedTaskIds));
  const [[taskTotals], [timeTotals], [deliveryTotals]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${tasks.stateKind} = 'COMPLETED')::int`, late: sql<number>`count(*) filter (where ${tasks.completedAt} > ${tasks.dueAt})::int` }).from(tasks).where(taskScope),
    db.select({ minutes: sql<number>`coalesce(sum(${timeEntries.minutes}), 0)::int` }).from(timeEntries).innerJoin(tasks, eq(tasks.id, timeEntries.taskId)).where(taskScope),
    actor.role === "MANAGER"
      ? db.select({ total: sql<number>`count(*)::int`, completed: sql<number>`count(*) filter (where ${deliverables.status} = 'COMPLETED')::int` }).from(deliverables).where(eq(deliverables.organizationId, actor.organizationId))
      : db.select({ total: sql<number>`count(distinct ${deliverables.id})::int`, completed: sql<number>`count(distinct ${deliverables.id}) filter (where ${deliverables.status} = 'COMPLETED')::int` }).from(deliverables).innerJoin(tasks, eq(tasks.deliverableId, deliverables.id)).where(taskScope),
  ]);
  const adherence = (taskTotals?.completed ?? 0) ? Math.round(100 * ((taskTotals?.completed ?? 0) - (taskTotals?.late ?? 0)) / (taskTotals?.completed ?? 1)) : 0;
  return <><PageHeading eyebrow="Operational intelligence" title="Reports" description="Totals reconcile directly to persisted tasks, deliverables and time entries." action={<a href="/api/reports/operational-export" className="rounded-xl border border-zinc-200 px-3 py-2 text-sm font-bold">Export CSV</a>}/><div className="grid gap-4 md:grid-cols-3">{[["Tasks", taskTotals?.total ?? 0, `${taskTotals?.completed ?? 0} completed`], ["Time", `${Math.round((timeTotals?.minutes ?? 0) / 60)}h`, "logged time"], ["Deliverables", deliveryTotals?.total ?? 0, `${deliveryTotals?.completed ?? 0} completed`]].map(([label, value, detail]) => <section key={String(label)} className="surface rounded-2xl p-5"><p className="text-xs font-bold uppercase tracking-widest text-zinc-400">{label}</p><p className="display mt-3 text-4xl font-bold">{value}</p><p className="mt-2 text-sm text-zinc-500">{detail}</p></section>)}</div><section className="surface mt-4 max-w-2xl rounded-2xl p-5"><h2 className="display text-lg font-bold">Deadline adherence</h2><p className="mt-3 text-4xl font-bold text-violet-600">{adherence}%</p><p className="mt-2 text-sm text-zinc-500">Based on completed tasks with a due date; {taskTotals?.late ?? 0} completed late.</p></section></>;
}
