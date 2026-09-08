import { calendarDate } from "./calendar";
import { and, capacityExceptions, capacitySchedules, createDatabase, eq, isNull, memberships, organizations, profiles, taskAssignees, tasks } from "@andthenn/db";
import { teamLoad } from "./team-load";
import { isOperationalLeader } from "@andthenn/domain";
import type { ActorContext } from "./actor-context";
export async function getTeamSummary(actor: ActorContext) {
  if (!isOperationalLeader(actor.role)) throw new Error("Team access required.");
  const day = 86400000;
  const { db } = createDatabase(); const now = new Date();
  const [organization] = await db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, actor.organizationId)).limit(1);
  const timezone = organization?.timezone ?? "Asia/Kolkata";
  const windowStart = new Date(`${calendarDate(now, timezone)}T12:00:00Z`); const windowEnd = new Date(windowStart.getTime() + 7 * day);
  const [people, schedules, exceptions, assignments] = await Promise.all([
    db.select({ id: memberships.id, name: profiles.displayName, email: profiles.email, role: memberships.role, financeAccess: memberships.financeAccess, accountType: memberships.accountType, startsAt: memberships.startsAt, expiresAt: memberships.expiresAt }).from(memberships).innerJoin(profiles, eq(profiles.id, memberships.profileId)).where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, "ACTIVE"))),
    db.select().from(capacitySchedules).where(eq(capacitySchedules.organizationId, actor.organizationId)),
    db.select().from(capacityExceptions).where(eq(capacityExceptions.organizationId, actor.organizationId)),
    db.select({ taskId: tasks.id, taskName: tasks.name, membershipId: taskAssignees.membershipId, estimate: tasks.estimatedMinutes, dueAt: tasks.dueAt, status: tasks.executionStatus }).from(taskAssignees).innerJoin(tasks, eq(tasks.id, taskAssignees.taskId)).where(and(eq(taskAssignees.organizationId, actor.organizationId), isNull(taskAssignees.removedAt))),
  ]);
  const rows = people.filter((person) => person.role !== "CLIENT" && (!person.startsAt || person.startsAt <= now) && (!person.expiresAt || person.expiresAt > now)).map((person) => {
    const { available, planned, overdue, missing, activeCount } = teamLoad(now, schedules.filter((row) => row.membershipId === person.id), exceptions.filter((row) => row.membershipId === person.id), assignments.filter((row) => row.membershipId === person.id), timezone);
    const utilization = available ? Math.round(planned / available * 100) : null; const risk = missing ? "UNKNOWN" : available === 0 ? (planned ? "OVERLOADED" : "NO_CAPACITY") : planned > available ? "OVERLOADED" : planned > 0 ? "BUSY" : "AVAILABLE";
    return { ...person, work: assignments.filter((row) => row.membershipId === person.id && row.status !== "COMPLETED").map((row) => ({ id: row.taskId, name: row.taskName })), available, planned, overdue, missing, utilization, risk, activeCount };
  }).sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1));
  return { rows, timezone, windowStart, windowEnd };
}
