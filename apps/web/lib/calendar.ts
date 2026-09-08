/** ISO calendar keys in the organization's timezone, independent of host/browser timezone. */
export function calendarDate(value: Date, timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)!.value).join("-");
}
export function nextCalendarDate(key: string, days: number) { return new Date(Date.parse(`${key}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
export function projectHealth(rows: { status: string; dueAt: Date; stage?: string | null }[], now = new Date()): "Blocked" | "Waiting" | "At risk" | "On track" {
  const open = rows.filter((row) => row.status !== "COMPLETED");
  return open.some((row) => row.status === "BLOCKED") ? "Blocked" : open.some((row) => row.status === "WAITING" || /review/i.test(row.stage ?? "")) ? "Waiting" : open.some((row) => row.dueAt <= new Date(now.getTime() + 86400000)) ? "At risk" : "On track";
}

/** Monday through Sunday in the organization calendar, including elapsed days this week. */
export function isDueThisWeek(dueAt: Date, now: Date, timezone: string) {
  const today = calendarDate(now, timezone);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const start = nextCalendarDate(today, -((weekday + 6) % 7));
  const due = calendarDate(dueAt, timezone);
  return due >= start && due <= nextCalendarDate(start, 6);
}
export function managerProjectGroup(deadline: Date, rows: { status: string; dueAt: Date; stage?: string | null }[], now = new Date()): "Active" | "At Risk" | "Delayed" | "Waiting for Client" {
  const open = rows.filter((row) => row.status !== "COMPLETED");
  if (deadline < now || open.some((row) => row.dueAt < now)) return "Delayed";
  if (open.some((row) => row.stage === "Client review")) return "Waiting for Client";
  if (projectHealth(rows, now) !== "On track") return "At Risk";
  return "Active";
}
