import { createDatabase, crmSchemaReady, sql } from "@andthenn/db";
import { configurationProblems, prototypeRuntimeEnabled } from "./config";
import { createStorage } from "./storage";

export async function readiness() {
  const problems = configurationProblems();
  if (problems.length) return { ready: false, checks: { configuration: "failed" as const }, detail: problems.join(", ") };
  try {
    const { db } = createDatabase();
    if (!await crmSchemaReady(db, !prototypeRuntimeEnabled())) return { ready: false, checks: { database: "failed" as const }, detail: "Required CRM migration or schema is missing; run the journal-driven migrator before serving traffic" };
    const [database] = await db.execute<{ database: number; outbox: string | null; pgmq: string | null; crmSchema: boolean }>(sql`
      select
        1 as database,
        to_regclass('public.outbox_events')::text as outbox,
        to_regprocedure('pgmq.metrics_all()')::text as pgmq,
        to_regtype('public.task_execution_status') is not null
          and to_regclass('public.client_memberships') is not null
          and to_regclass('public.internal_comment_mentions') is not null
          and to_regclass('public.task_review_selections') is not null
          and to_regclass('public.project_expenses') is not null
          and exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'tasks' and column_name = 'execution_status'
          )
          and exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'tasks' and column_name = 'completion_reviewer_membership_id'
          ) as "crmSchema"
    `);
    if (!database?.outbox || !database.pgmq || !database.crmSchema) return { ready: false, checks: { database: "failed" as const }, detail: "Database schema is behind migration 0012 or PGMQ is unavailable" };
    const storage = await createStorage().healthCheck();
    if (!storage.healthy) return { ready: false, checks: { database: "ok" as const, storage: "failed" as const }, detail: storage.detail };
    return { ready: true, checks: { configuration: "ok" as const, database: "ok" as const, storage: "ok" as const } };
  } catch (error) {
    return { ready: false, checks: { database: "failed" as const }, detail: error instanceof Error ? error.message : "Dependency check failed" };
  }
}
