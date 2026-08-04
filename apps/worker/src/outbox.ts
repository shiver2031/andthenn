import postgres, { type Sql } from "postgres";

interface OutboxRow { id: string; organization_id: string; event_type: string; payload: unknown; idempotency_key: string; correlation_id: string; }

export class OutboxDispatcher {
  private stopping = false;
  private readonly sql: Sql;
  constructor(databaseUrl: string, private readonly idleDelayMs = 1_000) { this.sql = postgres(databaseUrl, { max: 2, prepare: false }); }
  stop() { this.stopping = true; }

  private queueFor(type: string) {
    if (type.startsWith("media.")) return "media";
    if (type.startsWith("notification.")) return "notifications";
    if (type.startsWith("archive.")) return "archive";
    if (type.startsWith("retention.")) return "retention";
    return "intake";
  }

  async dispatchBatch() {
    return this.sql.begin(async (tx) => {
      const rows = await tx<OutboxRow[]>`select id::text, organization_id::text, event_type, payload, idempotency_key, correlation_id::text
        from outbox_events where dispatched_at is null and available_at <= now()
        order by created_at for update skip locked limit 50`;
      for (const row of rows) {
        const queue = this.queueFor(row.event_type);
        const envelope = { id: row.id, queue, type: row.event_type, idempotencyKey: row.idempotency_key, correlationId: row.correlation_id, attempts: 0, payload: row.payload };
        await tx`insert into job_runs (id, organization_id, queue, type, status, payload, idempotency_key, correlation_id)
          values (${row.id}::uuid, ${row.organization_id}::uuid, ${queue}, ${row.event_type}, 'QUEUED', ${tx.json(JSON.parse(JSON.stringify(row.payload)) as postgres.JSONValue)}::jsonb, ${row.idempotency_key}, ${row.correlation_id}::uuid)
          on conflict (idempotency_key) do nothing`;
        await tx`select pgmq.send(${queue}, ${tx.json(JSON.parse(JSON.stringify(envelope)) as postgres.JSONValue)}::jsonb, 0)`;
        await tx`update outbox_events set dispatched_at = now() where id = ${row.id}::uuid`;
      }
      return rows.length;
    });
  }

  async run() {
    while (!this.stopping) {
      const dispatched = await this.dispatchBatch();
      if (!dispatched) await new Promise((resolve) => setTimeout(resolve, this.idleDelayMs));
    }
    await this.sql.end();
  }
}
