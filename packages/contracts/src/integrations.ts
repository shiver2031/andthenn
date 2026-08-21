import { z } from "zod";

export const gmailPushSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().min(1),
    publishTime: z.string().optional(),
  }),
  subscription: z.string().min(1),
});

export const gmailNotificationDataSchema = z.object({
  emailAddress: z.email(),
  historyId: z.string().regex(/^\d+$/),
});

export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.unknown()),
});

export const uploadCompleteSchema = z.object({
  uploadId: z.string().min(1),
  fileVersionId: z.uuid(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sizeBytes: z.number().int().positive(),
  idempotencyKey: z.string().min(16),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1).max(256) })).max(2_000).optional(),
});

export const uploadInitiateSchema = z.object({
  taskId: z.uuid(),
  fileAssetId: z.uuid().nullable().default(null),
  logicalName: z.string().trim().min(1).max(300),
  filename: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(3).max(180),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export function decodeGmailNotification(data: string): z.infer<typeof gmailNotificationDataSchema> {
  const decoded = Buffer.from(data, "base64url").toString("utf8");
  return gmailNotificationDataSchema.parse(JSON.parse(decoded));
}
