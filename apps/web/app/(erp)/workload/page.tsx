import { Badge } from "@andthenn/ui";
import { and, capacitySchedules, createDatabase, eq, memberships, taskAssignees, tasks } from "@andthenn/db";
import { workloadSummary } from "@andthenn/domain";
import { PageHeading } from "../../../components/page-heading";
import { resolveActorContext } from "../../../lib/actor-context";

export default async function WorkloadPage() {
  const actor = await resolveActorContext(); if (!actor) return null; const { db } = createDatabase();
  const [memberRows, scheduleRows, assignments] = await Promise.all([
    db.select({ id: memberships.id, role: memberships.role }).from(memberships).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))),
    db.select().from(capacitySchedules).where(eq(capacitySchedules.organizationId, actor.organizationId)),
    db.select({ membershipId: taskAssignees.membershipId, kind: taskAssignees.kind, estimate: tasks.estimatedMinutes }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), eq(tasks.organizationId, actor.organizationId))),
  ]);
  const rows = memberRows.map((member) => {
    const capacity = scheduleRows.filter((schedule) => schedule.membershipId === member.id).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.weeklyMinutes ?? 0;
    const owned = assignments.filter((assignment) => assignment.membershipId === member.id && assignment.kind === "PRIMARY");
    const collaborators = assignments.filter((assignment) => assignment.membershipId === member.id && assignment.kind === "COLLABORATOR");
    return workloadSummary({ userId: member.id, capacityMinutes: capacity, primaryEstimatedMinutes: owned.reduce((sum, item) => sum + (item.estimate ?? 0), 0), collaboratorEstimatedMinutes: collaborators.reduce((sum, item) => sum + (item.estimate ?? 0), 0), missingEstimateCount: [...owned, ...collaborators].filter((item) => item.estimate === null).length });
  });
  const totalCapacity = rows.reduce((sum, row) => sum + row.capacityMinutes, 0); const totalPlanned = rows.reduce((sum, row) => sum + row.primaryEstimatedMinutes + row.collaboratorEstimatedMinutes, 0);
  return <><PageHeading eyebrow="Studio capacity" title="Workload" description="Primary commitments and collaborator load are planned separately—never ranked."/><div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="surface rounded-2xl p-4"><p className="text-xs text-zinc-400">Studio utilisation</p><p className="display mt-2 text-2xl font-bold">{totalCapacity ? Math.round((totalPlanned / totalCapacity) * 100) : "—"}{totalCapacity ? "%" : ""}</p></div><div className="surface rounded-2xl p-4"><p className="text-xs text-zinc-400">Capacity risk</p><p className="display mt-2 text-2xl font-bold text-amber-600">{rows.filter((row) => row.risk === "OVERLOADED" || row.risk === "WATCH").length}</p></div><div className="surface rounded-2xl p-4"><p className="text-xs text-zinc-400">Missing estimates</p><p className="display mt-2 text-2xl font-bold">{rows.reduce((sum, row) => sum + row.missingEstimateCount, 0)}</p></div></div><div className="surface overflow-hidden rounded-2xl"><div className="grid grid-cols-[1fr_120px_120px_110px] border-b border-zinc-100 px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400"><span>Team member</span><span>Primary</span><span>Collaborator</span><span>Risk</span></div>{rows.map((row) => <div key={row.userId} className="grid grid-cols-[1fr_120px_120px_110px] border-b border-zinc-100 px-5 py-4 text-sm"><span>{row.userId === actor.membershipId ? "You" : "Team member"}</span><span>{row.primaryEstimatedMinutes} min</span><span>{row.collaboratorEstimatedMinutes} min</span><Badge tone={row.risk === "OVERLOADED" ? "amber" : row.risk === "HEALTHY" ? "green" : "neutral"}>{row.risk}</Badge></div>)}</div></>;
}
