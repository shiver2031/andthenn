import { decodeGmailNotification, gmailPushSchema } from "@andthenn/contracts";
import { createDatabase, outboxEvents, webhookReceipts } from "@andthenn/db";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { verifyGooglePushToken } from "../../../../lib/security";
import { assertProviderConfiguration } from "../../../../lib/config";
import { consumePublicRateLimit } from "../../../../lib/security";

export async function POST(request: Request) {
  try { assertProviderConfiguration("gmail"); } catch { return NextResponse.json({ error: "Service unavailable" }, { status: 503 }); }
  if (!await consumePublicRateLimit(request, "webhook.gmail", "", 120, 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": "60" } });
  if (!await verifyGooglePushToken(request.headers.get("authorization"))) return NextResponse.json({ error: "Unverified push identity" }, { status: 401 });
  const parsed = gmailPushSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid Gmail push payload" }, { status: 400 });
  const notification = decodeGmailNotification(parsed.data.message.data);
  if (notification.emailAddress.toLowerCase() !== process.env.GOOGLE_WORKSPACE_INTAKE_EMAIL?.toLowerCase()) return NextResponse.json({ accepted: false }, { status: 202 });
  const { db } = createDatabase();
  const correlationId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(webhookReceipts).values({ organizationId: process.env.ORGANIZATION_ID!, provider: "GMAIL", providerEventId: parsed.data.message.messageId, signatureValid: true, payloadHash: createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex"), status: "ACCEPTED", payload: parsed.data }).onConflictDoNothing();
    await tx.insert(outboxEvents).values({ organizationId: process.env.ORGANIZATION_ID!, eventType: "gmail.reconcile", aggregateType: "MAILBOX", aggregateId: process.env.ORGANIZATION_ID!, payload: { notificationHistoryCursor: notification.historyId }, idempotencyKey: `gmail:${parsed.data.message.messageId}`, correlationId }).onConflictDoNothing();
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
