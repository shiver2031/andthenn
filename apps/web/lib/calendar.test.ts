import { describe, expect, it } from "vitest";
import { calendarDate, nextCalendarDate, projectHealth } from "./calendar";
import { attentionReasons } from "./task-attention";
import { teamLoad } from "./team-load";
describe("organization calendar and health reconciliation", () => {
  it("uses local midnight rather than a rolling 24 hour window", () => {
    const now = new Date("2026-09-05T18:29:00Z"), next = new Date("2026-09-05T18:31:00Z");
    expect(calendarDate(now)).toBe("2026-09-05"); expect(calendarDate(next)).toBe("2026-09-06");
    const task = { status: "OPEN", dueAt: next, priority: "NORMAL", pending: false, review: false };
    expect(attentionReasons(task, { reviewer: false, mentioned: false }, now)).not.toContain("Due today");
    expect(nextCalendarDate("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("uses Blocked then Waiting then At risk health precedence and excludes completed tasks", () => {
    const overdue = { status: "OPEN", dueAt: new Date("2020-01-01") };
    expect(projectHealth([overdue, { ...overdue, status: "WAITING" }])).toBe("Waiting");
    expect(projectHealth([{ ...overdue, status: "BLOCKED" }, { ...overdue, status: "WAITING" }])).toBe("Blocked");
    expect(projectHealth([{ ...overdue, status: "COMPLETED" }])).toBe("On track");
  });
  it("uses the local date for the seven day capacity window", () => {
    const result = teamLoad(new Date("2026-09-06T20:00:00Z"), [{ effectiveFrom: "2026-09-07", weeklyMinutes: 2400 }], [], []);
    expect(result.available).toBe(2400);
  });
});
