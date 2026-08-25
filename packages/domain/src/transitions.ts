import { invariant } from "./errors";
import type {
  ActivationDraft,
  DeliverableSnapshot,
  FileVersionSnapshot,
  IntakeStatus,
  ProjectSnapshot,
  ReviewShareSnapshot,
  TaskSnapshot,
  TaskState,
  WorkflowStage,
} from "./model";

const terminalIntakeStatuses = new Set<IntakeStatus>(["CONVERTED", "IGNORED", "ARCHIVED"]);

export function assertIntakeTransition(from: IntakeStatus, to: IntakeStatus): void {
  invariant(!terminalIntakeStatuses.has(from), "INTAKE_TERMINAL", "Terminal intake items cannot transition", { from, to });
  const allowed: Record<IntakeStatus, readonly IntakeStatus[]> = {
    UNASSIGNED: ["CLAIMED", "SETUP_IN_PROGRESS", "ARCHIVED", "IGNORED"],
    CLAIMED: ["UNASSIGNED", "NEEDS_MANAGER_INPUT", "READY_FOR_DECISION", "SETUP_IN_PROGRESS", "CONVERTED", "ARCHIVED", "IGNORED"],
    NEEDS_MANAGER_INPUT: ["READY_FOR_DECISION", "UNASSIGNED", "SETUP_IN_PROGRESS", "ARCHIVED", "IGNORED"],
    READY_FOR_DECISION: ["CLAIMED", "SETUP_IN_PROGRESS", "CONVERTED", "ARCHIVED", "IGNORED"],
    SETUP_IN_PROGRESS: ["READY_FOR_DECISION", "CONVERTED", "ARCHIVED", "IGNORED"],
    CONVERTED: [],
    IGNORED: [],
    ARCHIVED: [],
  };
  invariant(allowed[from].includes(to), "INVALID_INTAKE_TRANSITION", `Cannot move intake from ${from} to ${to}`, { from, to });
}

export function validateActivation(draft: ActivationDraft): string[] {
  const issues: string[] = [];
  if (!draft.clientId) issues.push("Client is required");
  if (draft.name.trim().length === 0) issues.push("Project name is required");
  if (!draft.ownerUserId) issues.push("Project owner is required");
  if (!draft.deadline) issues.push("Final project deadline is required");
  if (draft.deliverables.length === 0) issues.push("At least one deliverable is required");
  if (draft.workflowStages.length === 0) issues.push("At least one workflow stage is required");

  for (const deliverable of draft.deliverables) {
    if (deliverable.name.trim().length === 0) issues.push(`Deliverable ${deliverable.id} needs a name`);
    if (!deliverable.quantity || deliverable.quantity <= 0) issues.push(`Deliverable ${deliverable.id} needs a positive quantity`);
    if (deliverable.format.trim().length === 0) issues.push(`Deliverable ${deliverable.id} needs a format`);
    if (!deliverable.dueAt) issues.push(`Deliverable ${deliverable.id} needs a due date`);
    if (deliverable.dueAt && draft.deadline && deliverable.dueAt > draft.deadline) {
      issues.push(`Deliverable ${deliverable.id} is due after the project deadline`);
    }
    for (const task of deliverable.tasks) {
      if (task.deliverableId !== deliverable.id) issues.push(`Task ${task.id} is not linked to its containing deliverable`);
      if (!task.primaryOwnerId) issues.push(`Task ${task.id} needs one primary owner`);
    }
  }
  return issues;
}

export function assertActivationReady(draft: ActivationDraft): void {
  const issues = validateActivation(draft);
  invariant(issues.length === 0, "ACTIVATION_INVALID", "Project activation is incomplete", { issues });
}

export function primaryOwnerId(task: TaskSnapshot): string {
  const primary = task.assignments.filter((assignment) => assignment.kind === "PRIMARY");
  invariant(primary.length === 1, "PRIMARY_OWNER_REQUIRED", "Every task must have exactly one primary owner", {
    taskId: task.id,
    primaryCount: primary.length,
  });
  return primary[0]!.userId;
}

export function assertTaskTransition(
  task: TaskSnapshot,
  next: TaskState,
  actor: { userId: string; isManager: boolean; overrideReason?: string },
  stages: readonly WorkflowStage[],
): void {
  const ownerId = primaryOwnerId(task);
  if (actor.isManager && actor.userId !== ownerId) {
    invariant(
      Boolean(actor.overrideReason?.trim()),
      "OVERRIDE_REASON_REQUIRED",
      "Manager overrides require an audit reason",
      { taskId: task.id },
    );
  } else {
    invariant(actor.userId === ownerId, "PRIMARY_OWNER_ONLY", "Only the primary owner changes normal task status", {
      taskId: task.id,
    });
  }

  if (next.kind === "WORKFLOW") {
    const stage = stages.find((candidate) => candidate.id === next.stageId);
    invariant(stage, "WORKFLOW_STAGE_UNKNOWN", "Task stage must belong to the project workflow", { stageId: next.stageId });
    if (stage.semantic === "CLIENT_REVIEW") {
      invariant(task.hasValidFileVersion, "REVIEW_FILE_REQUIRED", "Client Review requires a valid file version");
      invariant(task.selectedReviewVersionId, "REVIEW_VERSION_REQUIRED", "Client Review requires an explicitly selected version");
    }
  }

  if (task.state.kind === "SYSTEM" && task.state.state === "COMPLETED" && next.kind !== "SYSTEM") {
    invariant(Boolean(actor.overrideReason?.trim()), "REOPEN_REASON_REQUIRED", "Reopening a completed task requires a reason");
  }
}

export function feedbackState(current: TaskState): TaskState {
  const interruptedStageId = current.kind === "WORKFLOW" ? current.stageId : current.interruptedStageId;
  return { kind: "SYSTEM", state: "CLIENT_FEEDBACK_RECEIVED", interruptedStageId };
}

export function approvedState(task: TaskSnapshot, version: FileVersionSnapshot): TaskState {
  invariant(version.taskId === task.id, "VERSION_TASK_MISMATCH", "Approved version must belong to the task");
  invariant(version.lockedAt === null, "VERSION_ALREADY_LOCKED", "File version is already locked");
  return { kind: "SYSTEM", state: "COMPLETED", interruptedStageId: null };
}

export function nextDeliverableStatus(deliverable: DeliverableSnapshot): DeliverableSnapshot["status"] {
  const allComplete =
    deliverable.taskStates.length > 0 &&
    deliverable.taskStates.every((state) => state.kind === "SYSTEM" && state.state === "COMPLETED");
  return allComplete ? "READY_FOR_MANAGER_CONFIRMATION" : deliverable.status;
}

export function assertDeliverableConfirmation(deliverable: DeliverableSnapshot, actorIsManager: boolean): void {
  invariant(actorIsManager, "MANAGER_ONLY", "Only a manager can confirm a deliverable");
  invariant(
    deliverable.status === "READY_FOR_MANAGER_CONFIRMATION",
    "DELIVERABLE_NOT_READY",
    "Deliverable must be ready for manager confirmation",
  );
}

export function nextProjectStatus(project: ProjectSnapshot): ProjectSnapshot["status"] {
  const allComplete =
    project.deliverableStatuses.length > 0 && project.deliverableStatuses.every((status) => status === "COMPLETED");
  return allComplete ? "READY_FOR_FINAL_CLOSURE" : project.status;
}

export function assertProjectClosure(project: ProjectSnapshot, actorIsManager: boolean): void {
  invariant(actorIsManager, "MANAGER_ONLY", "Only a manager can close a project");
  invariant(project.status === "READY_FOR_FINAL_CLOSURE", "PROJECT_NOT_READY", "Project is not ready for final closure");
  invariant(project.unresolvedRequiredWork === 0, "PROJECT_HAS_OPEN_WORK", "Required work must be resolved before closure");
}

export function isReviewShareAccessible(share: ReviewShareSnapshot, now = new Date()): boolean {
  if (share.status === "REVOKED" || share.status === "EXPIRED" || share.status === "DRAFT") return false;
  return share.expiresAt === null || share.expiresAt.getTime() > now.getTime();
}

export function assertWorkflowStageDeletion(stageId: string, taskCount: number, migrationTargetStageId?: string): void {
  invariant(taskCount === 0 || Boolean(migrationTargetStageId), "STAGE_MIGRATION_REQUIRED", "A populated stage requires task migration", {
    stageId,
    taskCount,
  });
  invariant(stageId !== migrationTargetStageId, "STAGE_MIGRATION_SELF", "Migration target must be a different stage");
}
