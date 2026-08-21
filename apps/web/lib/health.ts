import { createDatabase, sql } from "@andthenn/db";
import { configurationProblems } from "./config";
import { createStorage } from "./storage";

export async function readiness() {
  const problems = configurationProblems();
  if (problems.length) return { ready: false, checks: { configuration: "failed" as const }, detail: problems.join(", ") };
  try {
    const { db } = createDatabase();
    const [database] = await db.execute<{ database: number; outbox: string | null; pgmq: string | null }>(sql`
      select
        1 as database,
        to_regclass('public.outbox_events')::text as outbox,
        to_regprocedure('pgmq.metrics_all()')::text as pgmq
    `);
    if (!database?.outbox || !database.pgmq) return { ready: false, checks: { database: "failed" as const }, detail: "Database schema or PGMQ is unavailable" };
    const storage = await createStorage().healthCheck();
    if (!storage.healthy) return { ready: false, checks: { database: "ok" as const, storage: "failed" as const }, detail: storage.detail };
    return { ready: true, checks: { configuration: "ok" as const, database: "ok" as const, storage: "ok" as const } };
  } catch (error) {
    return { ready: false, checks: { database: "failed" as const }, detail: error instanceof Error ? error.message : "Dependency check failed" };
  }
}
