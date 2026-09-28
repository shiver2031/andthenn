import { describe, expect, it } from "vitest";
import { walkthroughSteps, type WalkthroughTargets } from "./walkthrough-flow";

const targets = Object.fromEntries(["brief", "project", "task", "assignment", "internalReview", "clientReview", "feedback", "approval", "finalDelivery", "completed"].map((key) => [key, "/projects/one#overview"])) as WalkthroughTargets;

describe("CRM walkthrough sequence", () => {
  const stages = ["brief", "project", "tasks", "assign", "work", "internal-review", "client-review", "feedback", "approval", "final-delivery", "completed"];
  it("keeps the documented lifecycle in order for Founder and Manager", () => {
    for (const role of ["FOUNDER", "MANAGER"] as const) {
      const keys = walkthroughSteps(role, false, targets).map((step) => step.key);
      expect(keys.filter((key) => stages.includes(key))).toEqual(stages);
    }
  });
  it("hides finance and brief actions from roles without access", () => {
    const manager = walkthroughSteps("MANAGER", false, targets).map((step) => step.key);
    const grantedManager = walkthroughSteps("MANAGER", true, targets).map((step) => step.key);
    const designer = walkthroughSteps("DESIGNER", false, targets).map((step) => step.key);
    const client = walkthroughSteps("CLIENT", false, targets).map((step) => step.key);
    expect(manager).not.toContain("accounts");
    expect(grantedManager).toContain("accounts");
    expect(designer).not.toContain("brief");
    expect(designer).not.toContain("accounts");
    expect(client.filter((key) => stages.includes(key))).toEqual(["project", "client-review", "feedback", "approval", "final-delivery", "completed"]);
    expect(client).not.toContain("assign");
    expect(client).not.toContain("my-tasks");
  });
});
