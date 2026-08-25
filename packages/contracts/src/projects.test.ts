import { describe, expect, it } from "vitest";
import { projectSetupDraftSchema } from "./projects";

const id = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";

describe("project setup draft", () => {
  it("requires a distinct primary owner and collaborators", () => {
    const result = projectSetupDraftSchema.safeParse({
      schemaVersion: 1, intakeItemId: null, title: "Launch", brief: "", clientId: id, ownerMembershipId: id,
      deadline: "2026-09-01T12:00:00.000Z", budgetMinor: null, currency: "INR", notes: "",
      deliverables: [{ id, name: "Film", quantity: 1, format: "Digital", dueAt: "2026-08-30T12:00:00.000Z", notes: "" }],
      tasks: [{ id: otherId, deliverableId: id, name: "Edit", description: "", priority: "NORMAL", dueAt: "2026-08-29T12:00:00.000Z", estimatedMinutes: null, primaryOwnerId: id, collaboratorIds: [id] }],
    });
    expect(result.success).toBe(false);
  });
});
