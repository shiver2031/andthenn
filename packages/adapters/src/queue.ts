import type { JobEnvelope, JobQueue } from "@andthenn/domain";
import postgres, { type Sql } from "postgres";

interface PgmqRow { msg_id: string; read_ct: number; message: JobEnvelope; }

export class PgmqJobQueue implements JobQueue {
  private readonly sql: Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 4, prepare: false });
  }

  async enqueue<T>(job: Omit<JobEnvelope<T>, "attempts" | "queueMessageId">, delaySeconds = 0) {
    await this.sql`select * from pgmq.send(${job.queue}, ${this.sql.json(JSON.parse(JSON.stringify({ ...job, attempts: 0 })) as postgres.JSONValue)}::jsonb, ${delaySeconds})`;
  }

  async claim<T>(queue: string, visibilitySeconds: number, quantity: number) {
    const rows = await this.sql<PgmqRow[]>`select msg_id::text, read_ct::int, message from pgmq.read(${queue}, ${visibilitySeconds}, ${quantity})`;
    return rows.map((row) => ({ ...(row.message as JobEnvelope<T>), queueMessageId: row.msg_id, queue, attempts: Math.max(0, row.read_ct - 1) }));
  }

  private messageId(job: JobEnvelope) {
    if (!job.queueMessageId) throw new Error("Claimed job has no queue message ID");
    return job.queueMessageId;
  }

  async recordAttempt(job: JobEnvelope) {
    await this.sql.begin(async (tx) => {
      await tx`insert into job_attempts (job_run_id, attempt_number)
        values (${job.id}::uuid, ${job.attempts + 1})
        on conflict (job_run_id, attempt_number) do nothing`;
      await tx`update job_runs
        set status = 'RUNNING', started_at = coalesce(started_at, now()), attempts = greatest(attempts, ${job.attempts + 1}), updated_at = now()
        where id = ${job.id}::uuid`;
    });
  }

  async complete(job: JobEnvelope) {
    await this.sql.begin(async (tx) => {
      await tx`select pgmq.delete(${job.queue}, ${this.messageId(job)}::bigint)`;
      await tx`update job_runs set status = 'SUCCEEDED', completed_at = now(), attempts = ${job.attempts + 1} where id = ${job.id}::uuid`;
    });
  }

  async retry(job: JobEnvelope, delaySeconds: number, reason: string) {
    await this.sql.begin(async (tx) => {
      await tx`select pgmq.set_vt(${job.queue}, ${this.messageId(job)}::bigint, ${delaySeconds})`;
      await tx`update job_runs set status = 'RETRYING', attempts = ${job.attempts + 1}, last_failure = ${reason} where id = ${job.id}::uuid`;
    });
  }

  async fail(job: JobEnvelope, reason: string) {
    await this.sql.begin(async (tx) => {
      await tx`select pgmq.archive(${job.queue}, ${this.messageId(job)}::bigint)`;
      await tx`update job_runs set status = 'FAILED', completed_at = now(), attempts = ${job.attempts + 1}, last_failure = ${reason} where id = ${job.id}::uuid`;
    });
  }

  async health() {
    const rows = await this.sql<Array<{ queue_name: string; queue_length: number; oldest_msg_age_sec: number | null }>>`
      select queue_name, queue_length::int, extract(epoch from oldest_msg_age_sec)::int as oldest_msg_age_sec
      from pgmq.metrics_all()
    `;
    return { queues: rows.map((row) => ({ name: row.queue_name, depth: row.queue_length, oldestSeconds: row.oldest_msg_age_sec })) };
  }
}
