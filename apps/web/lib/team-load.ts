import { calendarDate, nextCalendarDate } from "./calendar";
type Schedule = { effectiveFrom: string; weeklyMinutes: number };
type Exception = { onDate: string; availableMinutes: number };
type Assignment = { taskId: string; estimate: number | null; dueAt: Date; status: string };

export function teamLoad(now: Date, schedules: Schedule[], exceptions: Exception[], assignments: Assignment[], timeZone = "Asia/Kolkata") {
  // UTC calendar dates avoid the server timezone shifting an ISO date backwards.
  const startKey = calendarDate(now, timeZone);
  const endKey = nextCalendarDate(startKey, 7);
  let available = 0;
  for (let offset = 0; offset < 7; offset++) {
    const key = nextCalendarDate(startKey, offset), date = new Date(`${key}T12:00:00Z`);
    const schedule = schedules.filter((item) => item.effectiveFrom <= key).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const exception = exceptions.find((item) => item.onDate === key);
    available += exception ? exception.availableMinutes : date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0 : (schedule?.weeklyMinutes ?? 0) / 5;
  }
  const active = [...new Map(assignments.filter((item) => item.status !== "COMPLETED" && calendarDate(item.dueAt, timeZone) < endKey).map((item) => [item.taskId, item])).values()];
  return { available: Math.max(0, Math.round(available)), planned: active.reduce((sum, item) => sum + (item.estimate ?? 0), 0), overdue: active.filter((item) => item.dueAt < now).length, missing: active.filter((item) => item.estimate === null).length, activeCount: active.length };
}
