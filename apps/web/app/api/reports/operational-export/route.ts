import { and, createDatabase, eq, inArray, tasks, timeEntries } from "@andthenn/db";
import { NextResponse } from "next/server";
import { resolveActorContext } from "../../../../lib/actor-context";

const csv = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
export async function GET() {
  const actor = await resolveActorContext();
  if (!actor || actor.role === "TEMP_FREELANCER") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { db } = createDatabase();
  const assignedTaskIds = [...new Set([...actor.primaryTaskIds, ...actor.collaboratorTaskIds])];
  const taskScope = actor.role === "MANAGER"
    ? eq(tasks.organizationId, actor.organizationId)
    : and(eq(tasks.organizationId, actor.organizationId), inArray(tasks.id, assignedTaskIds));
  const [taskRows, timeRows] = await Promise.all([
    db.select({ id: tasks.id, name: tasks.name, state: tasks.stateKind, dueAt: tasks.dueAt, completedAt: tasks.completedAt }).from(tasks).where(taskScope),
    db.select({ taskId: timeEntries.taskId, minutes: timeEntries.minutes, date: timeEntries.workDate }).from(timeEntries).innerJoin(tasks, eq(tasks.id, timeEntries.taskId)).where(taskScope),
  ]);
  const text = ["section,id,name_or_task,state_or_date,value", ...taskRows.map((row) => ["task", row.id, row.name, row.state, row.dueAt?.toISOString() ?? ""].map(csv).join(",")), ...timeRows.map((row) => ["time", row.taskId, "", row.date, row.minutes].map(csv).join(","))].join("\n");
  return new Response(text, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=andthenn-operational-export.csv", "cache-control": "no-store" } });
}
