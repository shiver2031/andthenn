import { z } from "zod";
import { idSchema, isoDateSchema, nonEmptyTextSchema } from "./common";

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
export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;
