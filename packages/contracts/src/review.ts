import { z } from "zod";
import { idSchema, nonEmptyTextSchema } from "./common";

export const reviewerIdentitySchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().optional(),
});

const annotationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GENERAL") }),
  z.object({ kind: z.literal("TIMECODE"), timeMs: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("IMAGE_POINT"), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  z.object({
    kind: z.literal("IMAGE_REGION"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }),
  z.object({
    kind: z.literal("PDF_REGION"),
    page: z.number().int().positive(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }),
]);

export const reviewCommentSchema = z.object({
  reviewerSessionId: idSchema,
  body: nonEmptyTextSchema.max(5_000),
  parentCommentId: idSchema.nullable().default(null),
  annotation: annotationSchema,
  idempotencyKey: z.string().min(16),
});

export const reviewShareSchema = z.object({
  taskId: idSchema,
  fileVersionId: idSchema,
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  downloadAllowed: z.boolean().default(false),
  recipientSnapshot: z.string().trim().max(320).nullable(),
  messageSnapshot: z.string().max(4_000).nullable(),
});

export const approvalSchema = z.object({
  taskId: idSchema,
  fileVersionId: idSchema,
  expectedTaskVersion: z.number().int().nonnegative(),
  note: z.string().max(2_000).default(""),
});

export type ReviewCommentInput = z.infer<typeof reviewCommentSchema>;
export type ReviewShareInput = z.infer<typeof reviewShareSchema>;
