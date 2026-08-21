import { describe, expect, it } from "vitest";
import { approvedState, assertProjectClosure, assertTaskTransition, assertWorkflowStageDeletion, can, calculateQuote, calculateQuoteLine, deadlineAdherence, feedbackState, isReviewShareAccessible, nextDeliverableStatus, splitGst, validateActivation, workloadSummary } from "./index";
import type { MembershipContext } from "./model";

function membership(overrides: Partial<MembershipContext> = {}): MembershipContext {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role: "EMPLOYEE",
    accountType: "PERMANENT",
    status: "ACTIVE",
    expiresAt: null,
    financeAccess: false,
    visibleProjectIds: new Set(["project-1"]),
    primaryTaskIds: new Set(["task-primary"]),
    collaboratorTaskIds: new Set(["task-collab"]),
    reviewShareTaskIds: new Set(["task-primary"]),
    ...overrides,
  };
}

describe("authorization", () => {
  it("allows only a primary employee to change normal task status", () => {
    expect(can(membership(), "tasks:status", { taskId: "task-primary" })).toBe(true);
    expect(can(membership(), "tasks:status", { taskId: "task-collab" })).toBe(false);
  });

  it("keeps temporary accounts assignment scoped and expiry aware", () => {
    const temp = membership({ role: "TEMP_FREELANCER", accountType: "TEMPORARY", expiresAt: new Date("2026-01-01") });
    expect(can(temp, "tasks:contribute", { taskId: "task-collab" }, new Date("2026-02-01"))).toBe(false);
    expect(can({ ...temp, expiresAt: new Date("2027-01-01") }, "tasks:contribute", { taskId: "task-collab" }, new Date("2026-02-01"))).toBe(true);
    expect(can({ ...temp, expiresAt: new Date("2027-01-01") }, "finances:view", { taskId: "task-collab" }, new Date("2026-02-01"))).toBe(false);
  });
});

describe("workflow and closure", () => {
  it("moves external feedback into the reserved state without losing its prior stage", () => {
    expect(feedbackState({ kind: "WORKFLOW", stageId: "client-review" })).toEqual({
      kind: "SYSTEM",
      state: "CLIENT_FEEDBACK_RECEIVED",
      interruptedStageId: "client-review",
    });
  });

  it("makes a deliverable ready, never complete, when all tasks complete", () => {
    expect(nextDeliverableStatus({
      id: "deliverable-1",
      projectId: "project-1",
      status: "OPEN",
      taskStates: [{ kind: "SYSTEM", state: "COMPLETED", interruptedStageId: null }],
    })).toBe("READY_FOR_MANAGER_CONFIRMATION");
  });

  it("rejects incomplete activation drafts", () => {
    const issues = validateActivation({ clientId: null, name: "", ownerUserId: null, deadline: null, deliverables: [], workflowStages: [] });
    expect(issues).toHaveLength(6);
  });

  it("blocks collaborators and requires a reason for manager overrides", () => {
    const task = { id: "task-1", deliverableId: "del-1", state: { kind: "WORKFLOW" as const, stageId: "edit" }, assignments: [{ userId: "owner", kind: "PRIMARY" as const }, { userId: "collab", kind: "COLLABORATOR" as const }], hasValidFileVersion: true, selectedReviewVersionId: "version-1", approvedVersionId: null, dueAt: new Date("2026-08-09"), completedAt: null };
    const stages = [{ id: "edit", projectId: "project-1", name: "Edit", position: 0, semantic: "NORMAL" as const }, { id: "review", projectId: "project-1", name: "Client review", position: 1, semantic: "CLIENT_REVIEW" as const }];
    expect(() => assertTaskTransition(task, { kind: "WORKFLOW", stageId: "review" }, { userId: "collab", isManager: false }, stages)).toThrow(/primary owner/i);
    expect(() => assertTaskTransition(task, { kind: "WORKFLOW", stageId: "review" }, { userId: "manager", isManager: true }, stages)).toThrow(/reason/i);
  });

  it("preserves version lineage and requires populated-stage migration", () => {
    const task = { id: "task-1", deliverableId: "del-1", state: { kind: "WORKFLOW" as const, stageId: "review" }, assignments: [{ userId: "owner", kind: "PRIMARY" as const }], hasValidFileVersion: true, selectedReviewVersionId: "version-1", approvedVersionId: null, dueAt: new Date("2026-08-09"), completedAt: null };
    expect(() => approvedState(task, { id: "version-x", taskId: "task-other", versionNumber: 1, lockedAt: null })).toThrow(/belong/i);
    expect(() => assertWorkflowStageDeletion("review", 4)).toThrow(/migration/i);
  });

  it("enforces review expiry and manager-only closure", () => {
    expect(isReviewShareAccessible({ id: "s1", taskId: "t1", status: "ACTIVE", expiresAt: new Date("2026-08-01"), fileVersionId: "v1", downloadAllowed: false }, new Date("2026-08-04"))).toBe(false);
    expect(() => assertProjectClosure({ id: "p1", clientId: "c1", ownerUserId: "u1", deadline: new Date("2026-08-03"), status: "READY_FOR_FINAL_CLOSURE", deliverableStatuses: ["COMPLETED"], unresolvedRequiredWork: 0 }, false)).toThrow(/manager/i);
  });
});

describe("commercial calculations", () => {
  it("calculates discount and GST in integer minor units", () => {
    const total = calculateQuoteLine({ description: "Film", quantity: 2, unitRateMinor: 100_000, discountBasisPoints: 1_000, taxBasisPoints: 1_800 });
    expect(total).toEqual({ subtotalMinor: 200_000, discountMinor: 20_000, taxableMinor: 180_000, taxMinor: 32_400, totalMinor: 212_400 });
    expect(splitGst(total.taxMinor, false)).toEqual({ cgstMinor: 16_200, sgstMinor: 16_200, igstMinor: 0 });
  });

  it("aggregates independently rounded lines and rejects unsafe totals", () => {
    expect(calculateQuote([
      { description: "A", quantity: 1, unitRateMinor: 101, discountBasisPoints: 0, taxBasisPoints: 1_800 },
      { description: "B", quantity: 1, unitRateMinor: 101, discountBasisPoints: 0, taxBasisPoints: 1_800 },
    ])).toEqual({ subtotalMinor: 202, discountMinor: 0, taxableMinor: 202, taxMinor: 36, totalMinor: 238 });
    expect(() => calculateQuoteLine({ description: "Huge", quantity: 2, unitRateMinor: Number.MAX_SAFE_INTEGER, discountBasisPoints: 0, taxBasisPoints: 0 })).toThrow(/safe minor-unit/i);
  });

  it("keeps missing estimates explicit in workload reporting", () => {
    expect(workloadSummary({ userId: "u1", capacityMinutes: 2400, primaryEstimatedMinutes: 1900, collaboratorEstimatedMinutes: 300, missingEstimateCount: 1 }).risk).toBe("UNKNOWN");
    expect(deadlineAdherence(new Date("2026-08-03"), null, new Date("2026-08-04"))).toBe("OVERDUE");
  });
});
