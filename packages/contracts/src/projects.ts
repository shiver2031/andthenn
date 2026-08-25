import { z } from "zod";
import { idSchema, isoDateSchema, nonEmptyTextSchema } from "./common";

const optionalId = idSchema.nullable();
export const projectSetupDeliverableSchema = z.object({
  id: z.string().uuid(),
  name: nonEmptyTextSchema.max(300),
  quantity: z.number().int().positive().default(1),
  format: nonEmptyTextSchema.max(120),
  dueAt: isoDateSchema,
  notes: z.string().max(10_000).default(""),
});

export const projectSetupTaskSchema = z.object({
  id: z.string().uuid(),
  deliverableId: idSchema,
  name: nonEmptyTextSchema.max(300),
  description: z.string().max(10_000).default(""),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueAt: isoDateSchema,
  estimatedMinutes: z.number().int().positive().nullable().default(null),
  primaryOwnerId: idSchema,
  collaboratorIds: z.array(idSchema).default([]),
}).superRefine((task, ctx) => {
  if (task.collaboratorIds.includes(task.primaryOwnerId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["collaboratorIds"], message: "Primary owner cannot also be a collaborator" });
  }
  if (new Set(task.collaboratorIds).size !== task.collaboratorIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["collaboratorIds"], message: "A collaborator can only be assigned once" });
  }
});

export const projectSetupDraftSchema = z.object({
  schemaVersion: z.literal(1),
  intakeItemId: optionalId,
  title: nonEmptyTextSchema.max(300),
  brief: z.string().max(10_000).default(""),
  clientId: idSchema,
  ownerMembershipId: idSchema,
  deadline: isoDateSchema,
  budgetMinor: z.number().int().nonnegative().nullable().default(null),
  currency: z.string().length(3).default("INR"),
  notes: z.string().max(10_000).default(""),
  deliverables: z.array(projectSetupDeliverableSchema).min(1),
  tasks: z.array(projectSetupTaskSchema).min(1),
});

export const projectSetupSaveSchema = z.object({
  proposalId: idSchema,
  expectedVersion: z.number().int().nonnegative(),
  draft: projectSetupDraftSchema,
});

export const projectSetupFinalizeSchema = z.object({
  proposalId: idSchema,
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(16).max(200),
});

const taskDraftSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema.max(300),
  deliverableId: idSchema,
  primaryOwnerId: idSchema,
  collaboratorIds: z.array(idSchema).default([]),
  dueAt: isoDateSchema,
  estimatedMinutes: z.number().int().positive().nullable().default(null),
});

const deliverableDraftSchema = z.object({
  id: idSchema,
  name: nonEmptyTextSchema.max(300),
  quantity: z.number().int().positive(),
  format: nonEmptyTextSchema.max(120),
  dueAt: isoDateSchema,
  notes: z.string().max(10_000).default(""),
  tasks: z.array(taskDraftSchema).min(1),
});

export const activationSchema = z.object({
  proposalId: idSchema.nullable(),
  intakeItemId: idSchema.nullable(),
  clientId: idSchema,
  name: nonEmptyTextSchema.max(300),
  ownerUserId: idSchema,
  deadline: isoDateSchema,
  deliverables: z.array(deliverableDraftSchema).min(1),
  workflowStages: z.array(z.object({
    id: idSchema,
    name: nonEmptyTextSchema.max(120),
    position: z.number().int().nonnegative(),
    semantic: z.enum(["NORMAL", "CLIENT_REVIEW"]),
  })).min(1),
  budgetMinor: z.number().int().nonnegative().nullable(),
  currency: z.string().length(3).default("INR"),
  acknowledgedWarnings: z.array(z.string()).default([]),
  idempotencyKey: z.string().min(16),
});

export const taskTransitionSchema = z.object({
  taskId: idSchema,
  expectedVersion: z.number().int().nonnegative(),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("WORKFLOW"), stageId: idSchema, selectedReviewVersionId: idSchema.nullable().default(null) }),
    z.object({ kind: z.literal("COMPLETED") }),
  ]),
  overrideReason: z.string().trim().min(3).max(500).optional(),
});

export const workflowMigrationSchema = z.object({
  projectId: idSchema,
  stageId: idSchema,
  targetStageId: idSchema,
  expectedWorkflowVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(3).max(500),
});

export type ActivationInput = z.infer<typeof activationSchema>;
export type ProjectSetupDraft = z.infer<typeof projectSetupDraftSchema>;
export type ProjectSetupSaveInput = z.infer<typeof projectSetupSaveSchema>;
export type ProjectSetupFinalizeInput = z.infer<typeof projectSetupFinalizeSchema>;
export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;
