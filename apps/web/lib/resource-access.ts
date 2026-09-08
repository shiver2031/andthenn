import type { ActorContext } from "./actor-context";
import { isMembershipActive, isOperationalLeader } from "@andthenn/domain";

export const isResourceId = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export interface ProjectResource {
  id: string;
  clientId: string;
  taskIds?: readonly string[];
}

/**
 * The shared read boundary for project-owned resources. Navigation is never
 * treated as authorization: every page/API that reads a project, task, file,
 * or review should resolve its lineage and pass it through this helper.
 */
export function canReadProject(actor: ActorContext, resource: ProjectResource): boolean {
  if (!isMembershipActive(actor)) return false;
  if (isOperationalLeader(actor.role)) return true;
  if (actor.role === "CLIENT") {
    return actor.linkedClientIds.has(resource.clientId) && actor.visibleProjectIds.has(resource.id);
  }
  if (actor.visibleProjectIds.has(resource.id)) return true;
  return (resource.taskIds ?? []).some(
    (taskId) => actor.primaryTaskIds.has(taskId) || actor.collaboratorTaskIds.has(taskId) || actor.assignedByMeTaskIds.has(taskId),
  );
}

export function canReadFile(actor: ActorContext, resource: ProjectResource & { taskId: string; lockedAt: Date | null; isCurrentFinal: boolean }): boolean {
  if (actor.role === "CLIENT") return resource.lockedAt !== null && resource.isCurrentFinal && canReadProject(actor, resource);
  return canReadTask(actor, resource);
}

export function canReadTask(
  actor: ActorContext,
  resource: ProjectResource & { taskId: string },
): boolean {
  if (!canReadProject(actor, resource)) return false;
  if (isOperationalLeader(actor.role)) return true;
  if (actor.role === "CLIENT") return false;
  return actor.visibleProjectIds.has(resource.id)
    || actor.primaryTaskIds.has(resource.taskId)
    || actor.collaboratorTaskIds.has(resource.taskId)
    || actor.assignedByMeTaskIds.has(resource.taskId);
}
