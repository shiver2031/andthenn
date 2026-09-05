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
