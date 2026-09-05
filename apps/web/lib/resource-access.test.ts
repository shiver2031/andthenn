import { describe, expect, it } from "vitest";
import type { ActorContext } from "./actor-context";
import { canReadFile, canReadProject, canReadTask, isResourceId } from "./resource-access";

const actor = (overrides: Partial<ActorContext> = {}): ActorContext => ({ membershipId: "member", userId: "user", organizationId: "org", role: "CLIENT", accountType: "PERMANENT", status: "ACTIVE", expiresAt: null, financeAccess: false, email: "client@example.test", displayName: "Client", sessionIssuedAt: null, linkedClientIds: new Set(["client-a"]), visibleProjectIds: new Set(["project-a"]), primaryTaskIds: new Set(), collaboratorTaskIds: new Set(), assignedByMeTaskIds: new Set(), reviewShareTaskIds: new Set(), ...overrides });
const resource = { id: "project-a", clientId: "client-a", taskId: "task-a", taskIds: ["task-a"], lockedAt: new Date(), isCurrentFinal: true };

describe("resource read boundaries", () => {
  it("lets clients read granted final files but never internal task details", () => {
    expect(canReadProject(actor(), resource)).toBe(true);
    expect(canReadTask(actor(), resource)).toBe(false);
    expect(canReadFile(actor(), resource)).toBe(true);
    expect(canReadFile(actor(), { ...resource, lockedAt: null })).toBe(false);
    expect(canReadFile(actor(), { ...resource, isCurrentFinal: false })).toBe(false);
  });
  it("requires both client lineage and an unrevoked project grant", () => {
    expect(canReadFile(actor(), { ...resource, clientId: "client-b" })).toBe(false);
    expect(canReadFile(actor({ visibleProjectIds: new Set() }), resource)).toBe(false);
    expect(canReadFile(actor({ linkedClientIds: new Set() }), resource)).toBe(false);
    expect(canReadFile(actor({ expiresAt: new Date(0) }), resource)).toBe(false);
  });
  it("does not broaden a narrow assignment into sibling task/file access", () => {
    const designer = actor({ role: "DESIGNER", visibleProjectIds: new Set(), primaryTaskIds: new Set(["task-a"]) });
    expect(canReadFile(designer, resource)).toBe(true);
    expect(canReadFile(designer, { ...resource, taskId: "task-b" })).toBe(false);
    expect(canReadTask(designer, { ...resource, taskId: "task-b" })).toBe(false);
  });
  it("rejects malformed route ids before database queries", () => {
    expect(isResourceId("not-a-uuid")).toBe(false);
    expect(isResourceId("28000000-0000-4000-8000-000000000001")).toBe(true);
  });
});
