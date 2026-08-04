import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const roleEnum = pgEnum("membership_role", ["MANAGER", "EMPLOYEE", "TEMP_FREELANCER"]);
export const accountTypeEnum = pgEnum("account_type", ["PERMANENT", "TEMPORARY"]);
export const membershipStatusEnum = pgEnum("membership_status", ["INVITED", "ACTIVE", "DEACTIVATED", "EXPIRED"]);
export const lifecycleEnum = pgEnum("record_lifecycle", ["ACTIVE", "ARCHIVED"]);
export const intakeStatusEnum = pgEnum("intake_status", [
  "UNASSIGNED",
  "CLAIMED",
  "NEEDS_MANAGER_INPUT",
  "READY_FOR_DECISION",
  "CONVERTED",
  "IGNORED",
  "ARCHIVED",
]);
export const intakeChannelEnum = pgEnum("intake_channel", ["EMAIL", "WHATSAPP", "MANUAL", "PHONE"]);
export const proposalStatusEnum = pgEnum("proposal_status", ["PENDING", "APPROVED", "REJECTED"]);
export const projectStatusEnum = pgEnum("project_status", ["DRAFT_ACTIVATION", "ACTIVE", "READY_FOR_FINAL_CLOSURE", "COMPLETED", "REOPENED"]);
export const deliverableStatusEnum = pgEnum("deliverable_status", ["OPEN", "READY_FOR_MANAGER_CONFIRMATION", "COMPLETED", "REOPENED"]);
export const taskStateKindEnum = pgEnum("task_state_kind", ["WORKFLOW", "CLIENT_FEEDBACK_RECEIVED", "COMPLETED"]);
export const stageSemanticEnum = pgEnum("stage_semantic", ["NORMAL", "CLIENT_REVIEW"]);
export const assignmentKindEnum = pgEnum("assignment_kind", ["PRIMARY", "COLLABORATOR"]);
export const reviewShareStatusEnum = pgEnum("review_share_status", ["DRAFT", "SHARED", "ACTIVE", "REVOKED", "EXPIRED"]);
export const annotationKindEnum = pgEnum("annotation_kind", ["GENERAL", "TIMECODE", "IMAGE_POINT", "IMAGE_REGION", "PDF_REGION"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["NOT_RAISED", "DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]);
export const jobStatusEnum = pgEnum("job_status", ["QUEUED", "RUNNING", "RETRYING", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["IN_APP", "EMAIL", "WHATSAPP"]);
export const notificationStatusEnum = pgEnum("notification_status", ["PENDING", "SENT", "FAILED", "SKIPPED"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 240 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  timezone: varchar("timezone", { length: 80 }).notNull().default("Asia/Kolkata"),
  defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("INR"),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
});

export const organizationSettings = pgTable("organization_settings", {
  organizationId: uuid("organization_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  reviewShareExpiryDays: integer("review_share_expiry_days").notNull().default(30),
  intakeRetentionDays: integer("intake_retention_days").notNull().default(365),
  draftRetentionDays: integer("draft_retention_days").notNull().default(365),
  auditRetentionDays: integer("audit_retention_days").notNull().default(2557),
  timesheetEditWindowDays: integer("timesheet_edit_window_days").notNull().default(7),
  immediateEmailEvents: text("immediate_email_events").array().notNull().default(sql`ARRAY[]::text[]`),
  quotationLegalFields: jsonb("quotation_legal_fields").notNull().default({}),
  ...auditColumns,
}, (table) => [
  check("retention_positive", sql`${table.intakeRetentionDays} > 0 AND ${table.draftRetentionDays} > 0 AND ${table.auditRetentionDays} > 0`),
]);

export const featureFlags = pgTable("feature_flags", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default({}),
  ...auditColumns,
}, (table) => [primaryKey({ columns: [table.organizationId, table.key] })]);

export const integrationConnections = pgTable("integration_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  provider: varchar("provider", { length: 80 }).notNull(),
  kind: varchar("kind", { length: 80 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("DISABLED"),
  encryptedSecretReference: text("encrypted_secret_reference"),
  externalAccountId: text("external_account_id"),
  config: jsonb("config").notNull().default({}),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  lastHealthDetail: text("last_health_detail"),
  ...auditColumns,
}, (table) => [uniqueIndex("integration_org_kind_provider").on(table.organizationId, table.kind, table.provider)]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  authUserId: uuid("auth_user_id").notNull().unique(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  avatarUrl: text("avatar_url"),
  ...auditColumns,
}, (table) => [uniqueIndex("profile_email_lower_unique").on(sql`lower(${table.email})`)]);

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  profileId: uuid("profile_id").notNull().references(() => profiles.id),
  role: roleEnum("role").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  status: membershipStatusEnum("status").notNull().default("INVITED"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  financeAccess: boolean("finance_access").notNull().default(false),
  sessionRevokedAfter: timestamp("session_revoked_after", { withTimezone: true }),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  deactivationReason: text("deactivation_reason"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("membership_org_profile_unique").on(table.organizationId, table.profileId),
  index("membership_org_role_idx").on(table.organizationId, table.role, table.status),
  check("temporary_requires_expiry", sql`${table.accountType} <> 'TEMPORARY' OR ${table.expiresAt} IS NOT NULL`),
]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: varchar("email", { length: 320 }).notNull(),
  role: roleEnum("role").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  invitedByMembershipId: uuid("invited_by_membership_id").notNull().references(() => memberships.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  ...auditColumns,
});

export const capacitySchedules = pgTable("capacity_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  effectiveFrom: date("effective_from").notNull(),
  weeklyMinutes: integer("weekly_minutes").notNull(),
  ...auditColumns,
}, (table) => [check("capacity_nonnegative", sql`${table.weeklyMinutes} >= 0`)]);

export const capacityExceptions = pgTable("capacity_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  onDate: date("on_date").notNull(),
  availableMinutes: integer("available_minutes").notNull(),
  reason: text("reason"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("capacity_exception_member_date").on(table.membershipId, table.onDate),
  check("exception_nonnegative", sql`${table.availableMinutes} >= 0`),
]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: varchar("name", { length: 240 }).notNull(),
  notes: text("notes"),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
}, (table) => [index("client_org_name_idx").on(table.organizationId, table.name)]);

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  name: varchar("name", { length: 240 }).notNull(),
  notes: text("notes"),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
}, (table) => [uniqueIndex("brand_client_name_unique").on(table.clientId, table.name)]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  brandId: uuid("brand_id").references(() => brands.id),
  name: varchar("name", { length: 160 }).notNull(),
  roleLabel: varchar("role_label", { length: 160 }),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
});

export const contactChannels = pgTable("contact_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  value: varchar("value", { length: 320 }).notNull(),
  label: varchar("label", { length: 120 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  ...auditColumns,
}, (table) => [index("contact_channel_value_idx").on(table.organizationId, table.value)]);

export const rateCards = pgTable("rate_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  name: varchar("name", { length: 200 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
});

export const rateItems = pgTable("rate_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  rateCardId: uuid("rate_card_id").notNull().references(() => rateCards.id),
  serviceCode: varchar("service_code", { length: 120 }).notNull(),
  description: text("description").notNull(),
  unit: varchar("unit", { length: 80 }).notNull(),
  standardPriceMinor: bigint("standard_price_minor", { mode: "number" }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  notes: text("notes"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("rate_item_effective_unique").on(table.rateCardId, table.serviceCode, table.effectiveFrom),
  check("rate_price_nonnegative", sql`${table.standardPriceMinor} >= 0`),
]);

export const intakeItems = pgTable("intake_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  status: intakeStatusEnum("status").notNull().default("UNASSIGNED"),
  sourceChannel: intakeChannelEnum("source_channel").notNull(),
  title: varchar("title", { length: 300 }),
  confirmedSummary: text("confirmed_summary"),
  confirmedClientId: uuid("confirmed_client_id").references(() => clients.id),
  confirmedProjectId: uuid("confirmed_project_id"),
  claimedByMembershipId: uuid("claimed_by_membership_id").references(() => memberships.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  lockVersion: integer("lock_version").notNull().default(0),
  duplicateOfId: uuid("duplicate_of_id"),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  ...auditColumns,
}, (table) => [index("intake_org_status_idx").on(table.organizationId, table.status, table.createdAt)]);

export const intakeSourceItems = pgTable("intake_source_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id),
  provider: varchar("provider", { length: 80 }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 300 }),
  rfcMessageId: varchar("rfc_message_id", { length: 500 }),
  sender: varchar("sender", { length: 320 }),
  forwarder: varchar("forwarder", { length: 320 }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  sequence: integer("sequence").notNull(),
  kind: varchar("kind", { length: 80 }).notNull(),
  rawText: text("raw_text"),
  rawHeaders: jsonb("raw_headers").notNull().default({}),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  providerPayload: jsonb("provider_payload").notNull().default({}),
  ...auditColumns,
}, (table) => [
  uniqueIndex("intake_provider_message_unique").on(table.organizationId, table.provider, table.providerMessageId),
  uniqueIndex("intake_source_sequence_unique").on(table.intakeItemId, table.sequence),
  index("intake_hash_idx").on(table.organizationId, table.contentHash),
]);

export const intakeAttachments = pgTable("intake_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  sourceItemId: uuid("source_item_id").notNull().references(() => intakeSourceItems.id),
  filename: text("filename").notNull(),
  contentType: varchar("content_type", { length: 180 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
  storageKey: text("storage_key").notNull(),
  ...auditColumns,
});

export const intakeSuggestions = pgTable("intake_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id),
  kind: varchar("kind", { length: 80 }).notNull(),
  value: jsonb("value").notNull(),
  confidence: integer("confidence_basis_points"),
  sourceReferences: text("source_references").array().notNull().default(sql`ARRAY[]::text[]`),
  missingInformation: text("missing_information").array().notNull().default(sql`ARRAY[]::text[]`),
  provider: varchar("provider", { length: 80 }).notNull(),
  model: varchar("model", { length: 120 }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmedByMembershipId: uuid("confirmed_by_membership_id").references(() => memberships.id),
  ...auditColumns,
}, (table) => [check("suggestion_confidence_range", sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 10000)`)]);

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  intakeItemId: uuid("intake_item_id").references(() => intakeItems.id),
  clientId: uuid("client_id").references(() => clients.id),
  status: proposalStatusEnum("status").notNull().default("PENDING"),
  title: varchar("title", { length: 300 }).notNull(),
  brief: text("brief").notNull().default(""),
  draftData: jsonb("draft_data").notNull().default({}),
  budgetMinor: bigint("budget_minor", { mode: "number" }),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  decidedByMembershipId: uuid("decided_by_membership_id").references(() => memberships.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionReason: text("decision_reason"),
  ...auditColumns,
}, (table) => [index("proposal_org_status_idx").on(table.organizationId, table.status)]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  proposalId: uuid("proposal_id").references(() => proposals.id),
  sourceIntakeItemId: uuid("source_intake_item_id").references(() => intakeItems.id),
  ownerMembershipId: uuid("owner_membership_id").notNull().references(() => memberships.id),
  name: varchar("name", { length: 300 }).notNull(),
  status: projectStatusEnum("status").notNull().default("DRAFT_ACTIVATION"),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  budgetMinor: bigint("budget_minor", { mode: "number" }),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  notes: text("notes"),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
  version: integer("version").notNull().default(0),
  ...auditColumns,
}, (table) => [index("project_org_status_deadline_idx").on(table.organizationId, table.status, table.deadline)]);

export const projectMemberships = pgTable("project_memberships", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  canCreateTasks: boolean("can_create_tasks").notNull().default(false),
  canShareReviews: boolean("can_share_reviews").notNull().default(false),
  canViewFinances: boolean("can_view_finances").notNull().default(false),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  ...auditColumns,
}, (table) => [primaryKey({ columns: [table.projectId, table.membershipId] })]);

export const workflows = pgTable("workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull().default(1),
  ...auditColumns,
}, (table) => [uniqueIndex("workflow_project_unique").on(table.projectId)]);

export const workflowStages = pgTable("workflow_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
  name: varchar("name", { length: 120 }).notNull(),
  position: integer("position").notNull(),
  semantic: stageSemanticEnum("semantic").notNull().default("NORMAL"),
  ...auditColumns,
}, (table) => [
  uniqueIndex("workflow_stage_position_unique").on(table.workflowId, table.position),
  uniqueIndex("one_client_review_stage_per_workflow").on(table.workflowId).where(sql`${table.semantic} = 'CLIENT_REVIEW'`),
  check("workflow_stage_position_nonnegative", sql`${table.position} >= 0`),
]);

export const deliverables = pgTable("deliverables", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: varchar("name", { length: 300 }).notNull(),
  quantity: integer("quantity").notNull(),
  format: varchar("format", { length: 120 }).notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  status: deliverableStatusEnum("status").notNull().default("OPEN"),
  confirmedByMembershipId: uuid("confirmed_by_membership_id").references(() => memberships.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  reopenReason: text("reopen_reason"),
  ...auditColumns,
}, (table) => [
  index("deliverable_project_due_idx").on(table.projectId, table.dueAt),
  check("deliverable_quantity_positive", sql`${table.quantity} > 0`),
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  deliverableId: uuid("deliverable_id").notNull().references(() => deliverables.id),
  currentWorkflowStageId: uuid("current_workflow_stage_id").references(() => workflowStages.id),
  stateKind: taskStateKindEnum("state_kind").notNull().default("WORKFLOW"),
  interruptedWorkflowStageId: uuid("interrupted_workflow_stage_id").references(() => workflowStages.id),
  name: varchar("name", { length: 300 }).notNull(),
  description: text("description").notNull().default(""),
  priority: varchar("priority", { length: 40 }).notNull().default("NORMAL"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  version: integer("version").notNull().default(0),
  ...auditColumns,
}, (table) => [
  index("task_deliverable_due_idx").on(table.deliverableId, table.dueAt),
  index("task_state_idx").on(table.organizationId, table.stateKind, table.dueAt),
  check("task_state_shape", sql`(${table.stateKind} = 'WORKFLOW' AND ${table.currentWorkflowStageId} IS NOT NULL) OR (${table.stateKind} <> 'WORKFLOW' AND ${table.currentWorkflowStageId} IS NULL)`),
  check("task_estimate_positive", sql`${table.estimatedMinutes} IS NULL OR ${table.estimatedMinutes} > 0`),
]);

export const taskAssignees = pgTable("task_assignees", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  kind: assignmentKindEnum("kind").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  assignedByMembershipId: uuid("assigned_by_membership_id").notNull().references(() => memberships.id),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.membershipId] }),
  uniqueIndex("one_active_primary_owner_per_task").on(table.taskId).where(sql`${table.kind} = 'PRIMARY' AND ${table.removedAt} IS NULL`),
  index("task_assignee_member_idx").on(table.membershipId, table.kind),
]);

export const taskDependencies = pgTable("task_dependencies", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  dependsOnTaskId: uuid("depends_on_task_id").notNull().references(() => tasks.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.dependsOnTaskId] }),
  check("task_dependency_not_self", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
]);

export const taskChecklistItems = pgTable("task_checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByMembershipId: uuid("completed_by_membership_id").references(() => memberships.id),
  ...auditColumns,
});

export const taskProgress = pgTable("task_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  authorMembershipId: uuid("author_membership_id").notNull().references(() => memberships.id),
  body: text("body").notNull(),
  progressPercent: integer("progress_percent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("task_progress_percent_range", sql`${table.progressPercent} IS NULL OR (${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100)`)]);

export const internalComments = pgTable("internal_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  parentCommentId: uuid("parent_comment_id"),
  authorMembershipId: uuid("author_membership_id").notNull().references(() => memberships.id),
  body: text("body").notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check("internal_comment_parent_scope", sql`num_nonnulls(${table.projectId}, ${table.taskId}) = 1`)]);

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  workDate: date("work_date").notNull(),
  minutes: integer("minutes").notNull(),
  note: text("note"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  ...auditColumns,
}, (table) => [
  index("time_task_member_date_idx").on(table.taskId, table.membershipId, table.workDate),
  check("time_minutes_positive", sql`${table.minutes} > 0`),
]);

export const timeEntryRevisions = pgTable("time_entry_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  timeEntryId: uuid("time_entry_id").notNull().references(() => timeEntries.id),
  actorMembershipId: uuid("actor_membership_id").notNull().references(() => memberships.id),
  before: jsonb("before").notNull(),
  after: jsonb("after").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable("activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorMembershipId: uuid("actor_membership_id").references(() => memberships.id),
  eventType: varchar("event_type", { length: 160 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: text("entity_id").notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  snapshot: jsonb("snapshot").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("activity_org_entity_idx").on(table.organizationId, table.entityType, table.entityId, table.createdAt)]);

export const fileAssets = pgTable("file_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  logicalName: text("logical_name").notNull(),
  lifecycle: lifecycleEnum("lifecycle").notNull().default("ACTIVE"),
  ...auditColumns,
});

export const fileVersions = pgTable("file_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  fileAssetId: uuid("file_asset_id").notNull().references(() => fileAssets.id),
  versionNumber: integer("version_number").notNull(),
  filename: text("filename").notNull(),
  contentType: varchar("content_type", { length: 180 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
  storageProvider: varchar("storage_provider", { length: 80 }).notNull(),
  storageKey: text("storage_key").notNull(),
  uploaderMembershipId: uuid("uploader_membership_id").notNull().references(() => memberships.id),
  mediaMetadata: jsonb("media_metadata").notNull().default({}),
  processingStatus: varchar("processing_status", { length: 40 }).notNull().default("QUEUED"),
  thumbnailStorageKey: text("thumbnail_storage_key"),
  proxyStorageKey: text("proxy_storage_key"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedReason: text("locked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("file_version_number_unique").on(table.fileAssetId, table.versionNumber),
  uniqueIndex("file_version_storage_key_unique").on(table.storageProvider, table.storageKey),
  check("file_version_number_positive", sql`${table.versionNumber} > 0`),
]);

export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  fileAssetId: uuid("file_asset_id").references(() => fileAssets.id),
  logicalName: text("logical_name").notNull(),
  filename: text("filename").notNull(),
  contentType: varchar("content_type", { length: 180 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
  providerUploadId: text("provider_upload_id").notNull(),
  uploaderMembershipId: uuid("uploader_membership_id").notNull().references(() => memberships.id),
  status: varchar("status", { length: 40 }).notNull().default("INITIATED"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("upload_session_expiry_idx").on(table.status, table.expiresAt)]);

export const fileApprovals = pgTable("file_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  fileVersionId: uuid("file_version_id").notNull().references(() => fileVersions.id),
  approvedByMembershipId: uuid("approved_by_membership_id").notNull().references(() => memberships.id),
  note: text("note"),
  approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  reopenedByMembershipId: uuid("reopened_by_membership_id").references(() => memberships.id),
  reopenReason: text("reopen_reason"),
}, (table) => [uniqueIndex("active_task_approval_unique").on(table.taskId).where(sql`${table.reopenedAt} IS NULL`)]);

export const reviewHubs = pgTable("review_hubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  ...auditColumns,
}, (table) => [uniqueIndex("review_hub_task_unique").on(table.taskId)]);

export const reviewShares = pgTable("review_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reviewHubId: uuid("review_hub_id").notNull().references(() => reviewHubs.id),
  fileVersionId: uuid("file_version_id").notNull().references(() => fileVersions.id),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  status: reviewShareStatusEnum("status").notNull().default("DRAFT"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  downloadAllowed: boolean("download_allowed").notNull().default(false),
  recipientSnapshot: varchar("recipient_snapshot", { length: 320 }),
  messageSnapshot: text("message_snapshot"),
  createdByMembershipId: uuid("created_by_membership_id").notNull().references(() => memberships.id),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  ...auditColumns,
}, (table) => [index("review_share_hub_status_idx").on(table.reviewHubId, table.status)]);

export const reviewerSessions = pgTable("reviewer_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reviewShareId: uuid("review_share_id").notNull().references(() => reviewShares.id),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }),
  sessionTokenHash: varchar("session_token_hash", { length: 64 }).notNull().unique(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewComments = pgTable("review_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reviewShareId: uuid("review_share_id").notNull().references(() => reviewShares.id),
  fileVersionId: uuid("file_version_id").notNull().references(() => fileVersions.id),
  reviewerSessionId: uuid("reviewer_session_id").references(() => reviewerSessions.id),
  internalAuthorMembershipId: uuid("internal_author_membership_id").references(() => memberships.id),
  parentCommentId: uuid("parent_comment_id"),
  body: text("body").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByMembershipId: uuid("resolved_by_membership_id").references(() => memberships.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("review_comment_share_created_idx").on(table.reviewShareId, table.createdAt),
  check("review_comment_author_xor", sql`num_nonnulls(${table.reviewerSessionId}, ${table.internalAuthorMembershipId}) = 1`),
]);

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reviewCommentId: uuid("review_comment_id").notNull().references(() => reviewComments.id),
  kind: annotationKindEnum("kind").notNull(),
  timeMs: integer("time_ms"),
  page: integer("page"),
  xBasisPoints: integer("x_basis_points"),
  yBasisPoints: integer("y_basis_points"),
  widthBasisPoints: integer("width_basis_points"),
  heightBasisPoints: integer("height_basis_points"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("annotation_comment_unique").on(table.reviewCommentId),
  check("annotation_coordinate_range", sql`
    (${table.xBasisPoints} IS NULL OR ${table.xBasisPoints} BETWEEN 0 AND 10000) AND
    (${table.yBasisPoints} IS NULL OR ${table.yBasisPoints} BETWEEN 0 AND 10000) AND
    (${table.widthBasisPoints} IS NULL OR ${table.widthBasisPoints} BETWEEN 1 AND 10000) AND
    (${table.heightBasisPoints} IS NULL OR ${table.heightBasisPoints} BETWEEN 1 AND 10000)
  `),
]);

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  projectId: uuid("project_id").references(() => projects.id),
  proposalId: uuid("proposal_id").references(() => proposals.id),
  status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  ...auditColumns,
}, (table) => [check("quote_parent_xor", sql`num_nonnulls(${table.projectId}, ${table.proposalId}) = 1`)]);

export const quoteVersions = pgTable("quote_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  quoteId: uuid("quote_id").notNull().references(() => quotes.id),
  versionNumber: integer("version_number").notNull(),
  status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
  validUntil: date("valid_until"),
  interstateGst: boolean("interstate_gst").notNull().default(false),
  subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull().default(0),
  discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
  taxMinor: bigint("tax_minor", { mode: "number" }).notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
  notes: text("notes"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedByMembershipId: uuid("finalized_by_membership_id").references(() => memberships.id),
  pdfStorageKey: text("pdf_storage_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("quote_version_number_unique").on(table.quoteId, table.versionNumber)]);

export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  quoteVersionId: uuid("quote_version_id").notNull().references(() => quoteVersions.id),
  position: integer("position").notNull(),
  rateItemId: uuid("rate_item_id").references(() => rateItems.id),
  sourceDescription: text("source_description"),
  sourceUnitRateMinor: bigint("source_unit_rate_minor", { mode: "number" }),
  finalDescription: text("final_description").notNull(),
  quantity: integer("quantity").notNull(),
  unitRateMinor: bigint("unit_rate_minor", { mode: "number" }).notNull(),
  discountBasisPoints: integer("discount_basis_points").notNull().default(0),
  taxBasisPoints: integer("tax_basis_points").notNull().default(1800),
  lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("quote_line_position_unique").on(table.quoteVersionId, table.position),
  check("quote_line_quantity_positive", sql`${table.quantity} > 0`),
]);

export const invoiceRecords = pgTable("invoice_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  status: invoiceStatusEnum("status").notNull().default("NOT_RAISED"),
  amountMinor: bigint("amount_minor", { mode: "number" }),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  reference: varchar("reference", { length: 160 }),
  issuedAt: date("issued_at"),
  dueAt: date("due_at"),
  paidAt: date("paid_at"),
  notes: text("notes"),
  ...auditColumns,
}, (table) => [uniqueIndex("invoice_project_unique").on(table.projectId)]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  recipientMembershipId: uuid("recipient_membership_id").notNull().references(() => memberships.id),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  body: text("body").notNull(),
  objectType: varchar("object_type", { length: 80 }).notNull(),
  objectId: uuid("object_id").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("notification_recipient_unread_idx").on(table.recipientMembershipId, table.readAt, table.createdAt)]);

export const notificationPreferences = pgTable("notification_preferences", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  eventType: varchar("event_type", { length: 120 }).notNull(),
  inAppEnabled: boolean("in_app_enabled").notNull().default(true),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  ...auditColumns,
}, (table) => [primaryKey({ columns: [table.membershipId, table.eventType] })]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id),
  channel: notificationChannelEnum("channel").notNull(),
  status: notificationStatusEnum("status").notNull().default("PENDING"),
  provider: varchar("provider", { length: 80 }),
  providerMessageId: text("provider_message_id"),
  failureDetail: text("failure_detail"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  ...auditColumns,
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id),
  resourceType: varchar("resource_type", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  query: jsonb("query").notNull(),
  ...auditColumns,
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorMembershipId: uuid("actor_membership_id").references(() => memberships.id),
  actorSnapshot: varchar("actor_snapshot", { length: 200 }).notNull(),
  source: varchar("source", { length: 80 }).notNull(),
  action: varchar("action", { length: 160 }).notNull(),
  objectType: varchar("object_type", { length: 80 }).notNull(),
  objectId: uuid("object_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
  correlationId: uuid("correlation_id").notNull(),
  ipAddress: varchar("ip_address", { length: 80 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_org_object_idx").on(table.organizationId, table.objectType, table.objectId, table.createdAt)]);

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  eventType: varchar("event_type", { length: 160 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 80 }).notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull().unique(),
  correlationId: uuid("correlation_id").notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("outbox_dispatch_idx").on(table.dispatchedAt, table.availableAt)]);

export const webhookReceipts = pgTable("webhook_receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  provider: varchar("provider", { length: 80 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 300 }).notNull(),
  signatureValid: boolean("signature_valid").notNull(),
  payloadHash: varchar("payload_hash", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 40 }).notNull().default("RECEIVED"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  failureDetail: text("failure_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("webhook_provider_event_unique").on(table.provider, table.providerEventId)]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: varchar("key", { length: 200 }).notNull(),
  operation: varchar("operation", { length: 120 }).notNull(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.organizationId, table.key] })]);

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  queue: varchar("queue", { length: 120 }).notNull(),
  type: varchar("type", { length: 160 }).notNull(),
  status: jobStatusEnum("status").notNull().default("QUEUED"),
  payload: jsonb("payload").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull().unique(),
  correlationId: uuid("correlation_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastFailure: text("last_failure"),
  ...auditColumns,
}, (table) => [index("job_queue_status_available_idx").on(table.queue, table.status, table.availableAt)]);

export const jobAttempts = pgTable("job_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobRunId: uuid("job_run_id").notNull().references(() => jobRuns.id),
  attemptNumber: integer("attempt_number").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  outcome: varchar("outcome", { length: 40 }),
  detail: text("detail"),
}, (table) => [uniqueIndex("job_attempt_number_unique").on(table.jobRunId, table.attemptNumber)]);

export const archiveJobs = pgTable("archive_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  destinationPrefix: text("destination_prefix").notNull(),
  managerOverride: boolean("manager_override").notNull().default(false),
  status: jobStatusEnum("status").notNull().default("QUEUED"),
  manifest: jsonb("manifest").notNull().default({}),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failureDetail: text("failure_detail"),
  ...auditColumns,
});

export const intakeConversions = pgTable("intake_conversions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  intakeItemId: uuid("intake_item_id").notNull().references(() => intakeItems.id),
  targetType: varchar("target_type", { length: 80 }).notNull(),
  proposalId: uuid("proposal_id").references(() => proposals.id),
  projectId: uuid("project_id").references(() => projects.id),
  taskId: uuid("task_id").references(() => tasks.id),
  idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull().unique(),
  convertedByMembershipId: uuid("converted_by_membership_id").notNull().references(() => memberships.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("intake_single_conversion_unique").on(table.intakeItemId),
  check("intake_conversion_one_target", sql`num_nonnulls(${table.proposalId}, ${table.projectId}, ${table.taskId}) = 1`),
]);
