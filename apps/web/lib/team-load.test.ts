import { describe, expect, it } from "vitest";
import { teamLoad } from "./team-load";
describe("weekly operational load", () => {
  const now = new Date("2026-09-04T10:00:00Z");
  const schedules = [{ effectiveFrom: "2026-01-01", weeklyMinutes: 2400 }];
  it("applies weekend exceptions as replacement capacity and future schedule changes", () => {
    expect(teamLoad(now, [...schedules, { effectiveFrom: "2026-09-07", weeklyMinutes: 1200 }], [{ onDate: "2026-09-05", availableMinutes: 120 }], []).available).toBe(1560);
  });
  it("counts overdue and due-window tasks once, excluding future and complete work", () => {
    const task = { taskId: "a", dueAt: new Date("2026-09-01"), estimate: 60, status: "OPEN" };
    expect(teamLoad(now, schedules, [], [task, task, { ...task, taskId: "future", dueAt: new Date("2026-10-01") }, { ...task, taskId: "done", status: "COMPLETED" }])).toMatchObject({ planned: 60, activeCount: 1, overdue: 1, available: 2400 });
  });
});
