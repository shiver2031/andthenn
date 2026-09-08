import { DomainError } from "./errors";
import type { Capability, MembershipContext } from "./model";

export interface ResourceScope {
  projectId?: string;
  taskId?: string;
  clientId?: string;
  isPrimaryOwner?: boolean;
  isCollaborator?: boolean;
  isAssigner?: boolean;
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
  if (membership.role === "FOUNDER") return true;

  const taskVisible =
    scope.taskId !== undefined &&
    (membership.primaryTaskIds.has(scope.taskId) || membership.collaboratorTaskIds.has(scope.taskId));
  const projectVisible = scope.projectId !== undefined && membership.visibleProjectIds.has(scope.projectId);
  const clientVisible = scope.clientId !== undefined && membership.linkedClientIds.has(scope.clientId);

  if (membership.role === "CLIENT") {
    switch (capability) {
      case "client:portal":
        return clientVisible && projectVisible;
      case "files:view":
      case "reviews:comment":
      case "reviews:approve":
        return projectVisible && clientVisible;
      default:
        return false;
    }
  }

  if (membership.role === "MANAGER") {
    if (capability === "finances:view" || capability === "accounts:manage") return membership.financeAccess;
    if (capability === "client:portal") return false;
    return true;
  }

  switch (capability) {
    case "files:view":
      return projectVisible || taskVisible;
    case "finances:view":
      return membership.financeAccess && (projectVisible || scope.explicitlyGranted === true);
    case "tasks:create":
    case "tasks:assign":
      return projectVisible;
    case "tasks:confirm":
      return scope.isAssigner === true;
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
    case "company:view":
    case "team:view":
    case "accounts:manage":
    case "clients:manage":
    case "intake:process":
    case "proposals:decide":
    case "projects:activate":
    case "projects:close":
    case "workflows:configure":
    case "deliverables:confirm":
    case "audit:view":
    case "client:portal":
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
