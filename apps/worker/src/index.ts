import { GmailIntakeAdapter, MetaWhatsAppAdapter, PgmqJobQueue, SupabaseS3Storage } from "@andthenn/adapters";
import { createServer } from "node:http";
import postgres from "postgres";
import { createHandlers } from "./handlers.js";
import { OutboxDispatcher } from "./outbox.js";
import { DurableWorker } from "./runner.js";
import { persistEmailIntake, persistWhatsAppIntake } from "./intake.js";
import { processMediaVersion } from "./media.js";
import { runArchiveJob } from "./archive.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 6, prepare: false });
const queue = new PgmqJobQueue(databaseUrl);

async function markRun(type: string, entityId: string) {
  await sql`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot)
    select organization_id, ${type}, 'WORKER_JOB', ${entityId}, 'SYSTEM', ${sql.json({ worker: "andthenn-worker" })}::jsonb
    from organizations where lifecycle = 'ACTIVE' limit 1`;
}

const organizationId = process.env.ORGANIZATION_ID;
const gmail = organizationId && process.env.GOOGLE_WORKSPACE_INTAKE_EMAIL && process.env.GOOGLE_PUBSUB_TOPIC
  ? new GmailIntakeAdapter({ delegatedUser: process.env.GOOGLE_WORKSPACE_INTAKE_EMAIL, pubsubTopic: process.env.GOOGLE_PUBSUB_TOPIC, ...(process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) as Record<string, unknown> } : {}) })
  : null;
const storage = process.env.SUPABASE_S3_ENDPOINT && process.env.SUPABASE_S3_ACCESS_KEY_ID && process.env.SUPABASE_S3_SECRET_ACCESS_KEY && process.env.SUPABASE_STORAGE_BUCKET
  ? new SupabaseS3Storage({ endpoint: process.env.SUPABASE_S3_ENDPOINT, accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY, bucket: process.env.SUPABASE_STORAGE_BUCKET, region: process.env.SUPABASE_S3_REGION ?? "ap-south-1" }) : null;
const whatsapp = process.env.META_WHATSAPP_APP_SECRET && process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID
  ? new MetaWhatsAppAdapter({ appSecret: process.env.META_WHATSAPP_APP_SECRET, accessToken: process.env.META_WHATSAPP_ACCESS_TOKEN, phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID }) : null;

const handlers = createHandlers({
  reconcileGmail: async (payload) => {
    if (!organizationId || !gmail) throw new Error("Gmail worker configuration is missing");
    const notificationHistoryCursor = payload && typeof payload === "object" && typeof (payload as { notificationHistoryCursor?: unknown }).notificationHistoryCursor === "string"
      ? (payload as { notificationHistoryCursor: string }).notificationHistoryCursor
      : null;
    const [connection] = await sql<Array<{ config: { historyCursor?: unknown } }>>`
      select config from integration_connections
      where organization_id = ${organizationId}::uuid and provider = 'GOOGLE' and kind = 'GMAIL'
      limit 1`;
    const savedCursor = typeof connection?.config?.historyCursor === "string" ? connection.config.historyCursor : null;
    const cursor = savedCursor ?? notificationHistoryCursor;
    if (!cursor) throw new Error("Gmail reconciliation has no history cursor");
    try {
      if (!storage) throw new Error("Storage is required for Gmail evidence capture");
      const result = await gmail.reconcile(cursor);
      for (const email of result.messages) {
        const rawMessage = await gmail.fetchRaw(email.providerMessageId);
        await persistEmailIntake(sql, organizationId, email, rawMessage, (input) => storage.storeEvidence(input));
      }
      await sql`insert into integration_connections (organization_id, provider, kind, status, external_account_id, config, last_health_at, last_health_detail)
        values (${organizationId}::uuid, 'GOOGLE', 'GMAIL', 'CONNECTED', ${process.env.GOOGLE_WORKSPACE_INTAKE_EMAIL!}, ${sql.json({ historyCursor: result.nextCursor })}::jsonb, now(), 'Gmail history reconciled')
        on conflict (organization_id, kind, provider) do update
          set config = integration_connections.config || excluded.config,
              status = 'CONNECTED', last_health_at = now(), last_health_detail = 'Gmail history reconciled', updated_at = now()`;
      await markRun("gmail.reconciled", result.nextCursor);
    } catch (error) {
      await sql`insert into integration_connections (organization_id, provider, kind, status, external_account_id, config, last_health_at, last_health_detail)
        values (${organizationId}::uuid, 'GOOGLE', 'GMAIL', 'FAILED', ${process.env.GOOGLE_WORKSPACE_INTAKE_EMAIL!}, ${sql.json({})}::jsonb, now(), ${error instanceof Error ? error.message : "Gmail reconciliation failed"})
        on conflict (organization_id, kind, provider) do update
          set status = 'FAILED', last_health_at = now(), last_health_detail = excluded.last_health_detail, updated_at = now()`;
      throw error;
    }
  },
  processIntake: async (payload) => {
    if (!organizationId) throw new Error("ORGANIZATION_ID is required for intake processing");
    if (payload && typeof payload === "object" && "providerMessageId" in payload && "senderNumber" in payload) {
      const message = payload as import("@andthenn/domain").NormalizedWhatsAppMessage;
      let media: { bytes: Uint8Array; contentType: string; filename: string } | undefined;
      if (message.mediaId) {
        if (!whatsapp || !storage) throw new Error("WhatsApp media capture requires WhatsApp and storage configuration");
        const retrieved = await whatsapp.retrieveMedia(message.mediaId);
        media = { bytes: retrieved.bytes, contentType: retrieved.contentType, filename: retrieved.filename ?? `${message.providerMessageId}.${retrieved.contentType.split("/")[1] ?? "bin"}` };
      }
      await persistWhatsAppIntake(sql, organizationId, message, media, storage ? (input) => storage.storeEvidence(input) : undefined);
      return;
    }
    if (payload && typeof payload === "object" && typeof (payload as { intakeItemId?: unknown }).intakeItemId === "string") {
      await markRun("intake.processed", (payload as { intakeItemId: string }).intakeItemId); return;
    }
    throw new Error("Unsupported intake job payload");
  },
  processMedia: async (id) => {
    if (!storage || !process.env.MEDIA_INSPECTION_URL) throw new Error("Storage and MEDIA_INSPECTION_URL are required for media processing");
    await processMediaVersion(sql, storage, id, async (input) => {
      const response = await fetch(process.env.MEDIA_INSPECTION_URL!, { method: "POST", headers: { "content-type": "application/json", ...(process.env.MEDIA_INSPECTION_TOKEN ? { authorization: `Bearer ${process.env.MEDIA_INSPECTION_TOKEN}` } : {}) }, body: JSON.stringify(input) });
      if (!response.ok) throw new Error(`Media inspection service failed (${response.status})`);
      return await response.json() as import("./media.js").MediaInspection;
    });
  },
  deliverNotification: (id) => markRun("NOTIFICATION_DELIVERY_REQUESTED", id),
  deliverReviewShare: async (payload) => {
    const value = payload as { reviewShareId?: string; channel?: string; recipient?: string; message?: string; reviewUrl?: string; subject?: string };
    if (!value.reviewShareId || !value.recipient || !value.message || !value.reviewUrl) throw new Error("Review delivery payload is incomplete");
    let result: { providerMessageId: string } | null = null;
    if (value.channel === "WHATSAPP") {
      if (!whatsapp) throw new Error("WhatsApp delivery is not configured");
      result = await whatsapp.sendConfirmed({ recipient: value.recipient, message: value.message, reviewUrl: value.reviewUrl });
    } else if (value.channel === "EMAIL") {
      if (!gmail) throw new Error("Gmail delivery is not configured");
      result = await gmail.sendReview({ recipient: value.recipient, subject: value.subject ?? "Media review requested", message: value.message, reviewUrl: value.reviewUrl });
    }
    if (!result) throw new Error("Unsupported review delivery channel");
    await sql`update review_shares set provider_message_id = ${result.providerMessageId}, updated_at = now() where id = ${value.reviewShareId}::uuid`;
  },
  expireReviewShare: async (reviewShareId) => { await sql`update review_shares set status = 'EXPIRED', updated_at = now() where id = ${reviewShareId}::uuid and status = 'ACTIVE' and expires_at <= now()`; },
  sendRightsExpiryAlert: async (payload) => {
    const value = payload as { assetRightId?: string; days?: number }; if (!value.assetRightId || !value.days) throw new Error("Rights alert payload is incomplete");
    await sql`insert into notifications (organization_id, recipient_membership_id, event_type, title, body, object_type, object_id)
      select r.organization_id, m.id, 'rights.expiry', 'Asset rights expiring', ${`An asset right expires in ${value.days} days.`}, 'ASSET_RIGHT', r.id
      from asset_rights r join memberships m on m.organization_id = r.organization_id and m.role = 'MANAGER' and m.status = 'ACTIVE'
      where r.id = ${value.assetRightId}::uuid on conflict do nothing`;
  },
  runRetention: (id) => markRun("RETENTION_RUN_REQUESTED", id),
  runArchive: async (id) => {
    if (!storage) throw new Error("Storage is required for archive processing");
    await runArchiveJob(sql, storage, id);
  },
  syncCalendar: async (id) => {
    await sql`update calendar_sync_records
      set status = 'FAILED', failure_detail = 'Google Calendar OAuth synchronization is not configured', updated_at = now()
      where id = ${id}::uuid`;
    throw new Error("Google Calendar OAuth synchronization is not configured");
  },
});

const worker = new DurableWorker(queue, handlers, {
  queues: ["intake", "media", "notifications", "retention", "archive"],
  visibilitySeconds: 120,
  batchSize: 10,
  maxAttempts: 6,
  idleDelayMs: 1_500,
});
const dispatcher = new OutboxDispatcher(databaseUrl);
let ready = false;
const port = Number(process.env.PORT ?? 8080);
const healthServer = createServer((request, response) => {
  if (request.url === "/health/live") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: "ok", service: "andthenn-worker" }));
    return;
  }
  if (request.url === "/health/ready") {
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ status: ready ? "ok" : "starting", service: "andthenn-worker" }));
    return;
  }
  response.writeHead(404).end();
});

await new Promise<void>((resolve, reject) => {
  healthServer.once("error", reject);
  healthServer.listen(port, "0.0.0.0", () => {
    healthServer.off("error", reject);
    resolve();
  });
});
await sql`select 1`;
await queue.health();
ready = true;

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { ready = false; worker.stop(); dispatcher.stop(); healthServer.close(); });
await Promise.all([worker.run(), dispatcher.run()]);
await sql.end();
