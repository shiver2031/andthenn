import { z } from "zod";
import { idSchema, isoDateSchema, nonEmptyTextSchema } from "./common";

export const manualIntakeSchema = z.object({
  text: nonEmptyTextSchema.optional(),
  sourceChannel: z.enum(["MANUAL", "PHONE", "WHATSAPP_FALLBACK", "EMAIL_FALLBACK"]),
  sender: z.string().trim().max(320).optional(),
  forwardedByUserId: idSchema,
  capturedAt: isoDateSchema,
  attachmentIds: z.array(idSchema).max(50).default([]),
}).refine((value) => Boolean(value.text) || value.attachmentIds.length > 0, {
  message: "Manual intake requires text or at least one attachment",
});

export const claimIntakeSchema = z.object({
  intakeItemId: idSchema,
  expectedLockVersion: z.number().int().nonnegative(),
  takeoverReason: z.string().trim().min(3).max(500).optional(),
});

export const intakeConversionSchema = z.discriminatedUnion("target", [
  z.object({ intakeItemId: idSchema, idempotencyKey: z.string().min(16), target: z.literal("PENDING_PROPOSAL") }),
  z.object({ intakeItemId: idSchema, idempotencyKey: z.string().min(16), target: z.literal("NEW_PROJECT") }),
  z.object({
    intakeItemId: idSchema,
    idempotencyKey: z.string().min(16),
    target: z.literal("EXISTING_PROJECT_TASK"),
    projectId: idSchema,
    deliverableId: idSchema,
  }),
]);

export type ManualIntakeInput = z.infer<typeof manualIntakeSchema>;
export type ClaimIntakeInput = z.infer<typeof claimIntakeSchema>;
export type IntakeConversionInput = z.infer<typeof intakeConversionSchema>;
