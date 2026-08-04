import { PgmqJobQueue } from "@andthenn/adapters";
import postgres from "postgres";
import { createHandlers } from "./handlers.js";
import { OutboxDispatcher } from "./outbox.js";
import { DurableWorker } from "./runner.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 6, prepare: false });
const queue = new PgmqJobQueue(databaseUrl);

async function markRun(type: string, entityId: string) {
  await sql`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot)
    select organization_id, ${type}, 'WORKER_JOB', ${entityId}, 'SYSTEM', ${sql.json({ worker: "andthenn-worker" })}::jsonb
    from organizations where lifecycle_state = 'ACTIVE' limit 1`;
}

const handlers = createHandlers({
  reconcileGmail: (cursor) => markRun("GMAIL_RECONCILE_REQUESTED", cursor),
  processIntake: (id) => markRun("INTAKE_PROCESS_REQUESTED", id),
  processMedia: (id) => markRun("MEDIA_PROCESS_REQUESTED", id),
  deliverNotification: (id) => markRun("NOTIFICATION_DELIVERY_REQUESTED", id),
  runRetention: (id) => markRun("RETENTION_RUN_REQUESTED", id),
  runArchive: (id) => markRun("ARCHIVE_RUN_REQUESTED", id),
});

const worker = new DurableWorker(queue, handlers, {
  queues: ["intake", "media", "notifications", "retention", "archive"],
  visibilitySeconds: 120,
  batchSize: 10,
  maxAttempts: 6,
  idleDelayMs: 1_500,
});
const dispatcher = new OutboxDispatcher(databaseUrl);

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { worker.stop(); dispatcher.stop(); });
await Promise.all([worker.run(), dispatcher.run()]);
await sql.end();
