/** Migration support for the loopback-only embedded prototype database. */
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import postgres from "postgres";
import { migratePrototypePersonas } from "./prototype-personas";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";

const pgmqBootstrap = `
CREATE SCHEMA IF NOT EXISTS pgmq;
CREATE TABLE IF NOT EXISTS pgmq.messages (
  msg_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, queue_name text NOT NULL,
  message jsonb NOT NULL, enqueued_at timestamptz NOT NULL DEFAULT now(),
  vt timestamptz NOT NULL DEFAULT now(), read_ct integer NOT NULL DEFAULT 0, archived boolean NOT NULL DEFAULT false
);
CREATE OR REPLACE FUNCTION pgmq.create(text) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
CREATE OR REPLACE FUNCTION pgmq.send(queue text, payload jsonb, delay_seconds integer DEFAULT 0) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE result bigint; BEGIN INSERT INTO pgmq.messages(queue_name, message, vt) VALUES(queue, payload, now() + make_interval(secs => delay_seconds)) RETURNING msg_id INTO result; RETURN result; END; $$;
CREATE OR REPLACE FUNCTION pgmq.read(queue text, visibility_seconds integer, quantity integer) RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb) LANGUAGE plpgsql AS $$
BEGIN RETURN QUERY WITH claimed AS (SELECT m.msg_id FROM pgmq.messages m WHERE m.queue_name = queue AND NOT m.archived AND m.vt <= now() ORDER BY m.msg_id FOR UPDATE SKIP LOCKED LIMIT quantity)
UPDATE pgmq.messages m SET read_ct = m.read_ct + 1, vt = now() + make_interval(secs => visibility_seconds) FROM claimed WHERE m.msg_id = claimed.msg_id RETURNING m.msg_id, m.read_ct, m.message; END; $$;
CREATE OR REPLACE FUNCTION pgmq.delete(queue text, id bigint) RETURNS boolean LANGUAGE sql AS 'DELETE FROM pgmq.messages WHERE queue_name = queue AND msg_id = id RETURNING true';
CREATE OR REPLACE FUNCTION pgmq.set_vt(queue text, id bigint, visibility_seconds integer) RETURNS boolean LANGUAGE sql AS 'UPDATE pgmq.messages SET vt = now() + make_interval(secs => visibility_seconds) WHERE queue_name = queue AND msg_id = id RETURNING true';
CREATE OR REPLACE FUNCTION pgmq.archive(queue text, id bigint) RETURNS boolean LANGUAGE sql AS 'UPDATE pgmq.messages SET archived = true WHERE queue_name = queue AND msg_id = id RETURNING true';
CREATE OR REPLACE FUNCTION pgmq.metrics_all() RETURNS TABLE(queue_name text, queue_length bigint, newest_msg_age_sec bigint, oldest_msg_age_sec bigint) LANGUAGE sql AS 'SELECT queue_name, count(*) FILTER (WHERE NOT archived), NULL::bigint, extract(epoch FROM now() - min(enqueued_at))::bigint FROM pgmq.messages GROUP BY queue_name';
`;

async function bootstrap(sql: postgres.Sql) {
  await sql.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$; CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid'; CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT ''{}''::jsonb';`);
  await sql.unsafe(pgmqBootstrap);
}

/** Adopt pre-journal prototypes once, then apply pending migrations on every start. */
export async function migratePrototype(url: string, legacySeeded = false) {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const folder = await mkdtemp(join(tmpdir(), "andthenn-prototype-migrations-"));
  try {
    const source = new URL("../migrations/", import.meta.url);
    const journalText = await readFile(new URL("meta/_journal.json", source), "utf8");
    const journal = JSON.parse(journalText) as { entries: { idx: number; tag: string }[] };
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), journalText);
    for (const entry of journal.entries) {
      const ddl = await readFile(new URL(`${entry.tag}.sql`, source), "utf8");
      // Embedded Postgres uses the local queue implementation above.
      await writeFile(join(folder, `${entry.tag}.sql`), ddl.replace(/CREATE EXTENSION IF NOT EXISTS pgmq;\s*/g, ""));
    }
    const [state] = await sql`select to_regclass('public.organizations') as installed,
      to_regclass('drizzle.__drizzle_migrations') as journal,
      to_regclass('public.proposal_one_per_intake_unique') as setup,
      to_regclass('public.client_memberships') as crm,
      to_regclass('public.final_deliveries') as delivery`;
    if (!state?.installed) await bootstrap(sql);
    else if (!state.journal) {
      // The old runner wrote .seeded-v1 only after all migrations and seeding
      // succeeded. Its supported persistent schemas are 0011 through 0013.
      if (!legacySeeded || !state.setup) throw new Error("Unrecognized legacy prototype schema; refusing to replay migrations over existing data");
      const baseline = state.delivery ? 13 : state.crm ? 12 : 11;
      const migrations = readMigrationFiles({ migrationsFolder: folder });
      await sql.begin(async (tx) => {
        await tx.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)');
        for (const [index, entry] of journal.entries.entries()) {
          if (entry.idx > baseline) continue;
          const migration = migrations[index]!;
          await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${migration.hash}, ${migration.folderMillis})`;
        }
      });
    }
    await migrate(drizzle(sql), { migrationsFolder: folder });
    await migratePrototypePersonas(sql);
  } finally {
    await sql.end();
    await rm(folder, { recursive: true, force: true });
  }
}
