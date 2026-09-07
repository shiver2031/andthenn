/** Local, persistent prototype runtime. It deliberately starts only on loopback
 * and does not replace the production PostgreSQL/Supabase configuration. */
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { migratePrototype } from "./prototype-migrations";

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

async function migrateAndSeed(url: string) {
  await migratePrototype(url);
  const seed = spawn(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "packages/db/src/seed.ts")], { cwd: root, env: { ...process.env, DATABASE_URL: url, REVIEW_TOKEN_PEPPER: "prototype-pepper" }, stdio: "inherit" });
  await new Promise<void>((resolveSeed, reject) => seed.once("exit", (code) => code === 0 ? resolveSeed() : reject(new Error(`Prototype seed failed (${code})`))));
}

async function ensurePrototypeMediaFixtures(url: string, fixtureDataDir = dataDir) {
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
    const destination = resolve(join(fixtureDataDir, "storage"), version.storage_key);
    const storageRoot = resolve(join(fixtureDataDir, "storage"));
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
  else await migratePrototype(url, true);
  // Older persistent prototype directories may predate the bundled review
  // fixture, so repair it on every start without replacing user-created data.
  await ensurePrototypeMediaFixtures(url);
  const env = { ...process.env, APP_RUNTIME: "prototype", APP_URL: `http://localhost:${port}`, DATABASE_URL: url, REVIEW_TOKEN_PEPPER: "prototype-pepper", PROTOTYPE_DATA_DIR: dataDir, PROTOTYPE_SIGNING_SECRET: process.env.PROTOTYPE_SIGNING_SECRET ?? "andthenn-local-prototype-secret", PORT: String(port), HOSTNAME: "127.0.0.1" };
  console.log(`AndThenn prototype is ready at ${env.APP_URL}`);
  const web = spawn("pnpm", ["--filter", "@andthenn/web", "dev"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
  const workerPort = await availablePort();
  const worker = spawn(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "apps/worker/src/index.ts")], { cwd: root, env: { ...env, PORT: String(workerPort), PROTOTYPE_FIXTURE_INSPECTION: "1" }, stdio: "inherit" });
  const stop = async () => { web.kill("SIGTERM"); worker.kill("SIGTERM"); await pg.stop().catch(() => undefined); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  await new Promise<void>((resolveWeb) => web.once("exit", () => resolveWeb()));
  worker.kill("SIGTERM");
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

async function runAcceptance(browserProject?: string) {
  const temporaryDataDir = await mkdtemp(join(tmpdir(), "andthenn-prototype-"));
  const webPort = await availablePort();
  const dbPort = await availablePort();
  const pg = new EmbeddedPostgres({ databaseDir: join(temporaryDataDir, "postgres"), user: "postgres", password: "prototype", port: dbPort, persistent: false, postgresFlags: ["-h", "127.0.0.1"] });
  const databaseUrl = `postgres://postgres:prototype@127.0.0.1:${dbPort}/postgres`;
  let web: ReturnType<typeof spawn> | null = null;
  let worker: ReturnType<typeof spawn> | null = null;
  try {
    await pg.initialise(); await pg.start(); await migrateAndSeed(databaseUrl);
    await ensurePrototypeMediaFixtures(databaseUrl, temporaryDataDir);
    const appUrl = `http://localhost:${webPort}`;
    const environment = { ...process.env, APP_RUNTIME: "prototype", APP_URL: appUrl, DATABASE_URL: databaseUrl, REVIEW_TOKEN_PEPPER: "prototype-pepper", PROTOTYPE_DATA_DIR: temporaryDataDir, PROTOTYPE_SIGNING_SECRET: "andthenn-acceptance-secret", PORT: String(webPort), HOSTNAME: "127.0.0.1" };
    // Build once before acceptance. Development compilation makes browser outcomes
    // depend on route compilation order instead of the product being tested.
    await run("pnpm", ["build"], environment);
    // The workspace does not emit a standalone server artifact, despite the
    // Next configuration warning, so `next start` is the verified runtime.
    web = spawn("pnpm", ["--filter", "@andthenn/web", "start"], { cwd: root, env: environment, stdio: "inherit", shell: process.platform === "win32" });
    await waitFor(`${appUrl}/api/health/ready`, web);
    const workerPort = await availablePort();
    worker = spawn(process.execPath, [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "apps/worker/src/index.ts")], { cwd: root, env: { ...environment, PORT: String(workerPort), PROTOTYPE_FIXTURE_INSPECTION: "1" }, stdio: "inherit" });
    await waitFor(`http://127.0.0.1:${workerPort}/health/ready`, worker);
    const result = spawn("pnpm", ["exec", "playwright", "test", "--config=playwright.prototype.config.ts", ...(browserProject ? ["--project", browserProject] : []), ...(process.env.PROTOTYPE_TEST_GREP ? ["--grep", process.env.PROTOTYPE_TEST_GREP] : [])], { cwd: root, env: { ...environment, PROTOTYPE_APP_URL: appUrl, ...(browserProject ? { PROTOTYPE_RESULT_DIR: join(root, "test-results", browserProject) } : {}) }, stdio: "inherit", shell: process.platform === "win32" });
    const code = await new Promise<number | null>((resolveExit) => result.once("exit", resolveExit));
    if (code !== 0) throw new Error(`Prototype acceptance failed (${code})`);
  } finally {
    web?.kill("SIGTERM");
    worker?.kill("SIGTERM");
    await pg.stop().catch(() => undefined);
    await rm(temporaryDataDir, { recursive: true, force: true });
  }
}

async function runAcceptanceMatrix() {
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const startedClean = !execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  const browserProjects = ["chromium-375", "chromium-768", "chromium-1024", "chromium-1440", "webkit-375", "webkit-1440"];
  const reports = [];
  let failed = false;
  for (const browserProject of browserProjects) {
    await rm(join(root, "test-results", browserProject), { recursive: true, force: true });
    try { await runAcceptance(browserProject); } catch (error) { failed = true; console.error(error); }
    const path = join(root, "test-results", browserProject, "prototype-results.json");
    if (existsSync(path)) reports.push(JSON.parse(await readFile(path, "utf8")));
  }
  const stats = { expected: 0, unexpected: 0, skipped: 0, flaky: 0, duration: 0 };
  for (const report of reports) for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] += Number(report.stats?.[key] ?? 0);
  await mkdir(join(root, "test-results"), { recursive: true });
  await writeFile(join(root, "test-results", "prototype-results.json"), JSON.stringify({ releaseCommit: sourceCommit, cleanCheckout: startedClean && sourceCommit === execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim() && !execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), config: reports[0]?.config, suites: reports.flatMap((report) => report.suites ?? []), errors: reports.flatMap((report) => report.errors ?? []), stats }, null, 2));
  console.warn(`Isolated browser matrix: ${stats.expected} passed, ${stats.unexpected} failed, ${stats.skipped} skipped.`);
  if (failed || reports.length !== browserProjects.length) throw new Error("Browser acceptance matrix failed; inspect per-browser artifacts.");
}

async function repeatAcceptance() {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.warn(`Prototype acceptance rehearsal ${attempt}/3`);
    await runAcceptanceMatrix();
  }
}

async function main() {
  const command = process.argv[2] ?? "start";
  if (command === "start") return start();
  if (command === "reset") return reset();
  if (command === "acceptance") {
    const browserProject = process.argv[3];
    if (!browserProject) return runAcceptanceMatrix();
    if (!["chromium-375", "chromium-768", "chromium-1024", "chromium-1440", "webkit-375", "webkit-1440"].includes(browserProject)) throw new Error("Unknown acceptance browser project");
    return runAcceptance(browserProject);
  }
  if (command === "repeat") return repeatAcceptance();
  throw new Error(`Unknown prototype command: ${command}`);
}

await main();
