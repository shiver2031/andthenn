import { DomainError } from "./errors";
import type { Capability, MembershipContext } from "./model";

export interface ResourceScope {
  projectId?: string;
  taskId?: string;
  isPrimaryOwner?: boolean;
  isCollaborator?: boolean;
  explicitlyGranted?: boolean;
}

export function isMembershipActive(membership: MembershipContext, now = new Date()): boolean {
  if (membership.status !== "ACTIVE") return false;
  return membership.expiresAt === null || membership.expiresAt.getTime() > now.getTime();
}

export function can(
  membership: MembershipContext,
  capability: Capability,
  scope: ResourceScope = {},
  now = new Date(),
): boolean {
  if (!isMembershipActive(membership, now)) return false;
  if (membership.role === "MANAGER") return true;

  const taskVisible =
    scope.taskId !== undefined &&
    (membership.primaryTaskIds.has(scope.taskId) || membership.collaboratorTaskIds.has(scope.taskId));
  const projectVisible = scope.projectId !== undefined && membership.visibleProjectIds.has(scope.projectId);

  if (membership.role === "TEMP_FREELANCER") {
    if (!taskVisible) return false;
    return capability === "tasks:contribute" || capability === "time:log" || capability === "reviews:comment" ||
      (capability === "tasks:status" && membership.primaryTaskIds.has(scope.taskId ?? ""));
  }

  switch (capability) {
    case "finances:view":
      return membership.financeAccess && (projectVisible || scope.explicitlyGranted === true);
    case "tasks:create":
      return projectVisible && scope.explicitlyGranted === true;
    case "tasks:status":
      return scope.isPrimaryOwner === true || membership.primaryTaskIds.has(scope.taskId ?? "");
    case "tasks:contribute":
    case "time:log":
    case "reviews:comment":
      return taskVisible;
    case "reviews:share":
      return taskVisible || membership.reviewShareTaskIds.has(scope.taskId ?? "");
    case "reviews:approve":
      return scope.isPrimaryOwner === true || membership.primaryTaskIds.has(scope.taskId ?? "");
    case "reports:global":
      return false;
    default:
      return false;
  }
}

export function authorize(
  membership: MembershipContext,
  capability: Capability,
  scope: ResourceScope = {},
  now = new Date(),
): void {
  if (!can(membership, capability, scope, now)) {
    throw new DomainError("FORBIDDEN", `Missing permission: ${capability}`, {
      role: membership.role,
      capability,
      projectId: scope.projectId,
      taskId: scope.taskId,
    });
  }
}
