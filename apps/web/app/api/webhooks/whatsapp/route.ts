import { MetaWhatsAppAdapter } from "@andthenn/adapters";
import { createDatabase, outboxEvents, webhookReceipts } from "@andthenn/db";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { assertProviderConfiguration } from "../../../../lib/config";
import { consumePublicRateLimit } from "../../../../lib/security";

export function GET(request: Request) {
  try { assertProviderConfiguration("whatsapp"); } catch { return new Response("Service unavailable", { status: 503 }); }
  const url = new URL(request.url);
  const verified = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.META_WHATSAPP_VERIFY_TOKEN;
  return new Response(verified ? url.searchParams.get("hub.challenge") ?? "" : "Forbidden", { status: verified ? 200 : 403 });
}

export async function POST(request: Request) {
  try { assertProviderConfiguration("whatsapp"); } catch { return NextResponse.json({ error: "Service unavailable" }, { status: 503 }); }
  if (!await consumePublicRateLimit(request, "webhook.whatsapp", "", 120, 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": "60" } });
  const raw = new Uint8Array(await request.arrayBuffer());
  const secret = process.env.META_WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "WhatsApp is not configured" }, { status: 503 });
  const adapter = new MetaWhatsAppAdapter({ appSecret: secret, accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN ?? "", phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID ?? "" });
  const verified = await adapter.verifyWebhook(request.headers.get("x-hub-signature-256") ?? "", raw);
  if (!verified) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const payload = JSON.parse(Buffer.from(raw).toString("utf8")) as unknown;
  const phoneNumberIds = (payload as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: unknown }; messages?: unknown[] } }> }> }).entry
    ?.flatMap((entry) => entry.changes ?? [])
    .map((change) => change.value)
    .filter((value): value is { metadata?: { phone_number_id?: unknown }; messages?: unknown[] } => Boolean(value?.messages?.length))
    .map((value) => value.metadata?.phone_number_id)
    ?? [];
  if (phoneNumberIds.some((id) => id !== process.env.META_WHATSAPP_PHONE_NUMBER_ID)) {
    return NextResponse.json({ error: "Webhook is for an unconfigured phone number" }, { status: 403 });
  }
  const messages = await adapter.normalizeWebhook(payload);
  const { db } = createDatabase();
  await db.transaction(async (tx) => { for (const message of messages) {
    const correlationId = crypto.randomUUID();
    await tx.insert(webhookReceipts).values({ organizationId: process.env.ORGANIZATION_ID!, provider: "WHATSAPP", providerEventId: message.providerMessageId, signatureValid: true, payloadHash: createHash("sha256").update(raw).digest("hex"), status: "ACCEPTED", payload }).onConflictDoNothing();
    await tx.insert(outboxEvents).values({ organizationId: process.env.ORGANIZATION_ID!, eventType: "intake.process", aggregateType: "WHATSAPP_MESSAGE", aggregateId: process.env.ORGANIZATION_ID!, payload: message, idempotencyKey: `whatsapp:${message.providerMessageId}`, correlationId }).onConflictDoNothing();
  }});
  return NextResponse.json({ accepted: messages.length }, { status: 202 });
}
