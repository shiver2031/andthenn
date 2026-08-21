/** Local, persistent prototype runtime. It deliberately starts only on loopback
 * and does not replace the production PostgreSQL/Supabase configuration. */
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDir = resolve(process.env.PROTOTYPE_DATA_DIR ?? join(root, ".prototype"));
const marker = join(dataDir, ".seeded-v1");

function assertSafeDataDir() {
  const name = dataDir.split("/").at(-1) ?? "";
  if (dataDir === root || (!dataDir.includes(".prototype") && !name.startsWith("andthenn-prototype-"))) throw new Error("PROTOTYPE_DATA_DIR must be a dedicated prototype directory");
}

async function availablePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Unable to allocate loopback port"));
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

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
  await sql.unsafe(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid'; CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT ''{}''::jsonb';`);
  await sql.unsafe(pgmqBootstrap);
}

async function migrateAndSeed(url: string) {
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await bootstrap(sql);
    const migrationDir = join(root, "packages/db/migrations");
    const files = (await import("node:fs/promises")).readdir(migrationDir).then((names) => names.filter((name) => name.endsWith(".sql")).sort());
    for (const file of await files) {
      const source = await readFile(join(migrationDir, file), "utf8");
      const matches = source.match(/CREATE EXTENSION IF NOT EXISTS pgmq;/g) ?? [];
      if (matches.length > 1) throw new Error(`${file} contains an unexpected PGMQ extension declaration`);
      const prototypeSql = source.replace(/CREATE EXTENSION IF NOT EXISTS pgmq;\s*/g, "");
      for (const statement of prototypeSql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) await sql.unsafe(statement);
    }
  } finally { await sql.end(); }
  const seed = spawn(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "packages/db/src/seed.ts")], { cwd: root, env: { ...process.env, DATABASE_URL: url, REVIEW_TOKEN_PEPPER: "prototype-pepper" }, stdio: "inherit" });
  await new Promise<void>((resolveSeed, reject) => seed.once("exit", (code) => code === 0 ? resolveSeed() : reject(new Error(`Prototype seed failed (${code})`))));
}

async function ensurePrototypeMediaFixtures(url: string) {
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const [version] = await sql<{ storage_key: string }[]>`
      select storage_key
      from file_versions
      where filename = 'aster-afterhours-v2.mp4'
      order by created_at asc
      limit 1
    `;
    if (!version) return;
    const destination = resolve(join(dataDir, "storage"), version.storage_key);
    const storageRoot = resolve(join(dataDir, "storage"));
    if (!destination.startsWith(`${storageRoot}/`)) throw new Error("Invalid seeded storage key");
    if (existsSync(destination)) return;
    const encoded = await readFile(join(root, "packages/db/fixtures/prototype-review.mp4.base64"), "utf8");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(encoded.trim(), "base64"));
  } finally {
    await sql.end();
  }
}

async function start() {
  assertSafeDataDir();
  await mkdir(dataDir, { recursive: true });
  const port = await availablePort();
  const dbPort = await availablePort();
  const databaseDir = join(dataDir, "postgres");
  const pg = new EmbeddedPostgres({ databaseDir, user: "postgres", password: "prototype", port: dbPort, persistent: true, postgresFlags: ["-h", "127.0.0.1"] });
  // `initialise` invokes initdb and is only valid for an empty data directory.
  // A prototype must be restartable without losing the data the user created.
  if (!existsSync(join(databaseDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const url = `postgres://postgres:prototype@127.0.0.1:${dbPort}/postgres`;
  if (!existsSync(marker)) { await migrateAndSeed(url); await writeFile(marker, "seeded\n"); }
  // Older persistent prototype directories may predate the bundled review
  // fixture, so repair it on every start without replacing user-created data.
  await ensurePrototypeMediaFixtures(url);
  const env = { ...process.env, APP_RUNTIME: "prototype", APP_URL: `http://127.0.0.1:${port}`, DATABASE_URL: url, REVIEW_TOKEN_PEPPER: "prototype-pepper", PROTOTYPE_DATA_DIR: dataDir, PROTOTYPE_SIGNING_SECRET: process.env.PROTOTYPE_SIGNING_SECRET ?? "andthenn-local-prototype-secret", PORT: String(port), HOSTNAME: "127.0.0.1" };
  console.log(`AndThenn prototype is ready at ${env.APP_URL}`);
  const web = spawn("pnpm", ["--filter", "@andthenn/web", "dev"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  const stop = async () => { web.kill("SIGTERM"); await pg.stop().catch(() => undefined); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  await new Promise<void>((resolveWeb) => web.once("exit", () => resolveWeb()));
  await pg.stop();
}

async function reset() {
  assertSafeDataDir();
  await rm(dataDir, { recursive: true, force: true });
  console.log(`Removed prototype data at ${dataDir}`);
}

async function waitFor(url: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Prototype web server exited early (${child.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch { /* Server is still starting. */ }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  const child = spawn(command, args, { cwd: root, env: environment, stdio: "inherit", shell: process.platform === "win32" });
  const code = await new Promise<number | null>((resolveExit) => child.once("exit", resolveExit));
  if (code !== 0) throw new Error(`${command} ${args.join(" ")} failed (${code})`);
}

async function runAcceptance() {
  const temporaryDataDir = await mkdtemp(join(tmpdir(), "andthenn-prototype-"));
  const webPort = await availablePort();
  const dbPort = await availablePort();
  const pg = new EmbeddedPostgres({ databaseDir: join(temporaryDataDir, "postgres"), user: "postgres", password: "prototype", port: dbPort, persistent: false, postgresFlags: ["-h", "127.0.0.1"] });
  const databaseUrl = `postgres://postgres:prototype@127.0.0.1:${dbPort}/postgres`;
  let web: ReturnType<typeof spawn> | null = null;
  try {
    await pg.initialise(); await pg.start(); await migrateAndSeed(databaseUrl);
    const appUrl = `http://127.0.0.1:${webPort}`;
    const environment = { ...process.env, APP_RUNTIME: "prototype", APP_URL: appUrl, DATABASE_URL: databaseUrl, REVIEW_TOKEN_PEPPER: "prototype-pepper", PROTOTYPE_DATA_DIR: temporaryDataDir, PROTOTYPE_SIGNING_SECRET: "andthenn-acceptance-secret", PORT: String(webPort), HOSTNAME: "127.0.0.1" };
    // Build once before acceptance. Development compilation makes browser outcomes
    // depend on route compilation order instead of the product being tested.
    await run("pnpm", ["--filter", "@andthenn/web", "build"], environment);
    // The workspace does not emit a standalone server artifact, despite the
    // Next configuration warning, so `next start` is the verified runtime.
    web = spawn("pnpm", ["--filter", "@andthenn/web", "start"], { cwd: root, env: environment, stdio: "inherit", shell: process.platform === "win32" });
    await waitFor(`${appUrl}/api/health/ready`, web);
    const result = spawn("pnpm", ["exec", "playwright", "test", "--config=playwright.prototype.config.ts"], { cwd: root, env: { ...environment, PROTOTYPE_APP_URL: appUrl }, stdio: "inherit", shell: process.platform === "win32" });
    const code = await new Promise<number | null>((resolveExit) => result.once("exit", resolveExit));
    if (code !== 0) throw new Error(`Prototype acceptance failed (${code})`);
  } finally {
    web?.kill("SIGTERM");
    await pg.stop().catch(() => undefined);
    await rm(temporaryDataDir, { recursive: true, force: true });
  }
}

async function repeatAcceptance() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.warn(`Prototype acceptance rehearsal ${attempt}/3`);
    await runAcceptance();
  }
}

async function main() {
  const command = process.argv[2] ?? "start";
  if (command === "start") return start();
  if (command === "reset") return reset();
  if (command === "acceptance") return runAcceptance();
  if (command === "repeat") return repeatAcceptance();
  throw new Error(`Unknown prototype command: ${command}`);
}

await main();
