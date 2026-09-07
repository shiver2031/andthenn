import { describe, expect, it } from "vitest";
import { inlineMentionIds } from "./inline-mentions";
import { assignmentNotification } from "./assignment-notification";
import { isDueThisWeek, managerProjectGroup } from "./calendar";

describe("CRM browser audit regressions", () => {
  const members = [{ id: "rohan", name: "Rohan Bose" }, { id: "arjun", name: "Arjun Menon" }];
  it("resolves short, full, repeated, punctuation and case-insensitive mentions", () => {
    expect(inlineMentionIds("@Rohan please check, @ARJUN MENON: revise. @Rohan", members)).toEqual(["rohan", "arjun"]);
    expect(inlineMentionIds("Please review @Rohan.", members)).toEqual(["rohan"]);
    expect(inlineMentionIds("x@Rohan.com @RohanOther @Nobody @Rohan_Bose", members)).toEqual([]);
  });
  it("does not notify multiple people with the same first name", () => {
    const people = [...members, { id: "other", name: "Rohan Gupta" }];
    expect(inlineMentionIds("@Rohan please check", people)).toEqual([]);
    expect(inlineMentionIds("@Rohan Gupta please check", people)).toEqual(["other"]);
    expect(inlineMentionIds("@Rohan Bose please check", people)).toEqual(["rohan"]);
  });
  it("snapshots name, deadline, timezone and priority in the assignment notification", () => {
    const body = assignmentNotification("Priya", { name: "Approve creative", dueAt: "2026-09-07T18:30:00Z", priority: "HIGH" });
    expect(body).toContain('Priya assigned you: "Approve creative"');
    expect(body).toContain("8 Sept 2026");
    expect(body).toContain("Asia/Kolkata");
    expect(body).toContain("Priority: HIGH");
  });
  it("counts the calendar week across timezone midnight and year boundaries", () => {
    const monday = new Date("2026-09-06T18:30:00Z");
    expect(isDueThisWeek(new Date("2026-09-06T18:29:59Z"), monday, "Asia/Kolkata")).toBe(false);
    expect(isDueThisWeek(new Date("2026-09-13T18:29:59Z"), monday, "Asia/Kolkata")).toBe(true);
    expect(isDueThisWeek(new Date("2026-09-13T18:30:00Z"), monday, "Asia/Kolkata")).toBe(false);
    expect(isDueThisWeek(new Date("2027-01-01"), new Date("2026-12-31"), "Asia/Kolkata")).toBe(true);
  });
  it("separates delayed projects from risk and waiting for Client", () => {
    const now = new Date("2026-09-07"), later = new Date("2026-09-20"), past = new Date("2026-09-01");
    expect(managerProjectGroup(later, [{ status: "OPEN", dueAt: past }], now)).toBe("Delayed");
    expect(managerProjectGroup(later, [{ status: "COMPLETED", dueAt: past }], now)).toBe("Active");
    expect(managerProjectGroup(later, [{ status: "OPEN", dueAt: later, stage: "Client review" }], now)).toBe("Waiting for Client");
    expect(managerProjectGroup(later, [{ status: "BLOCKED", dueAt: later }], now)).toBe("At Risk");
  });
});
