import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoDateSchema = z.iso.datetime({ offset: true });
export const nonEmptyTextSchema = z.string().trim().min(1).max(20_000);

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
