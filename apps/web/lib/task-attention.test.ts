import { describe, expect, it } from "vitest";
import { attentionReasons } from "./task-attention";
describe("shared task attention", () => {
  const now = new Date("2026-09-04T10:00:00Z");
  const task = { status: "BLOCKED", dueAt: new Date("2026-09-01"), priority: "HIGH", pending: false, review: false };
  it("keeps multiple reasons on one task instead of duplicating rows", () => expect(attentionReasons(task, { reviewer: false, mentioned: true }, now)).toEqual(["You were mentioned", "Blocked", "Overdue", "High priority"]));
  it("removes completed work even with old unread mentions", () => expect(attentionReasons({ ...task, status: "COMPLETED" }, { reviewer: true, mentioned: true }, now)).toEqual([]));
  it("does not request confirmation from unrelated reviewers", () => expect(attentionReasons({ ...task, status: "WAITING", pending: true, priority: "NORMAL", dueAt: new Date("2026-09-10") }, { reviewer: false, mentioned: false }, now)).toEqual([]));
});
