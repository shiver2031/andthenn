export const roles = ["FOUNDER", "MANAGER", "DESIGNER", "CLIENT"] as const;
export type Role = (typeof roles)[number];

export function isInternalRole(role: Role): role is Exclude<Role, "CLIENT"> {
  return role !== "CLIENT";
}

export function isOperationalLeader(role: Role): role is "FOUNDER" | "MANAGER" {
  return role === "FOUNDER" || role === "MANAGER";
}

export const capabilities = [
  "clients:manage",
  "accounts:manage",
  "company:view",
  "team:view",
  "files:view",
  "client:portal",
  "intake:process",
  "proposals:decide",
  "projects:activate",
  "projects:close",
  "workflows:configure",
  "finances:view",
  "tasks:create",
  "tasks:assign",
  "tasks:confirm",
  "tasks:status",
  "tasks:contribute",
  "time:log",
  "reviews:share",
  "reviews:comment",
  "reviews:approve",
  "deliverables:confirm",
  "reports:global",
  "audit:view",
] as const;
export type Capability = (typeof capabilities)[number];

export type MembershipStatus = "INVITED" | "ACTIVE" | "DEACTIVATED" | "EXPIRED";
export type AccountType = "PERMANENT" | "TEMPORARY";

export interface MembershipContext {
  userId: string;
  organizationId: string;
  role: Role;
  accountType: AccountType;
  status: MembershipStatus;
  expiresAt: Date | null;
  financeAccess: boolean;
  visibleProjectIds: ReadonlySet<string>;
  primaryTaskIds: ReadonlySet<string>;
  collaboratorTaskIds: ReadonlySet<string>;
  assignedByMeTaskIds: ReadonlySet<string>;
  reviewShareTaskIds: ReadonlySet<string>;
  linkedClientIds: ReadonlySet<string>;
}

export const taskExecutionStatuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
] as const;
export type TaskExecutionStatus = (typeof taskExecutionStatuses)[number];

export type ProjectHealth = "ON_TRACK" | "AT_RISK" | "BLOCKED" | "WAITING";

export type IntakeStatus =
  | "UNASSIGNED"
  | "CLAIMED"
  | "NEEDS_MANAGER_INPUT"
  | "READY_FOR_DECISION"
  | "SETUP_IN_PROGRESS"
  | "CONVERTED"
  | "IGNORED"
  | "ARCHIVED";

export type IntakeConversionTarget = "PENDING_PROPOSAL" | "NEW_PROJECT" | "EXISTING_PROJECT_TASK";
export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ProjectStatus =
  | "DRAFT_ACTIVATION"
  | "ACTIVE"
  | "READY_FOR_FINAL_CLOSURE"
  | "COMPLETED"
  | "REOPENED";
export type DeliverableStatus = "OPEN" | "READY_FOR_MANAGER_CONFIRMATION" | "COMPLETED" | "REOPENED";
export type TaskSystemState = "CLIENT_FEEDBACK_RECEIVED" | "COMPLETED";

export interface WorkflowStage {
  id: string;
  projectId: string;
  name: string;
  position: number;
  semantic: "NORMAL" | "CLIENT_REVIEW";
}

export type TaskState =
  | { kind: "WORKFLOW"; stageId: string }
  | { kind: "SYSTEM"; state: TaskSystemState; interruptedStageId: string | null };

export interface TaskAssignment {
  userId: string;
  kind: "PRIMARY" | "COLLABORATOR";
}

export interface TaskSnapshot {
  id: string;
  deliverableId: string;
  state: TaskState;
  assignments: readonly TaskAssignment[];
  hasValidFileVersion: boolean;
  selectedReviewVersionId: string | null;
  approvedVersionId: string | null;
  dueAt: Date;
  completedAt: Date | null;
}

export interface DeliverableSnapshot {
  id: string;
  projectId: string;
  status: DeliverableStatus;
  taskStates: readonly TaskState[];
}

export interface ProjectSnapshot {
  id: string;
  clientId: string | null;
  ownerUserId: string | null;
  deadline: Date | null;
  status: ProjectStatus;
  deliverableStatuses: readonly DeliverableStatus[];
  unresolvedRequiredWork: number;
}

export interface ActivationDraft {
  clientId: string | null;
  name: string;
  ownerUserId: string | null;
  deadline: Date | null;
  deliverables: readonly {
    id: string;
    name: string;
    quantity: number | null;
    format: string;
    dueAt: Date | null;
    tasks: readonly { id: string; deliverableId: string | null; primaryOwnerId: string | null }[];
  }[];
  workflowStages: readonly WorkflowStage[];
}

export interface FileVersionSnapshot {
  id: string;
  taskId: string;
  versionNumber: number;
  lockedAt: Date | null;
}

export interface ReviewShareSnapshot {
  id: string;
  taskId: string;
  fileVersionId: string;
  status: "DRAFT" | "SHARED" | "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: Date | null;
  downloadAllowed: boolean;
}

export type InvoiceStatus =
  | "NOT_RAISED"
  | "DRAFT"
  | "SENT"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export interface QuoteLineInput {
  description: string;
  quantity: number;
  unitRateMinor: number;
  discountBasisPoints: number;
  taxBasisPoints: number;
}

export interface WorkloadInput {
  userId: string;
  capacityMinutes: number;
  primaryEstimatedMinutes: number;
  collaboratorEstimatedMinutes: number;
  missingEstimateCount: number;
}
/** Workflow phases are never terminal execution statuses. */
export const defaultProjectPhases = ["Work", "Internal review", "Client review", "Changes", "Approval", "Final delivery"] as const;
