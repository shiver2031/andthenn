import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { crmSchemaReady } from "./crm-schema";
import { migratePrototype } from "./prototype-migrations";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

// Embedded Postgres substitutes only the unavailable PGMQ extension. All CRM
// DDL, transaction semantics, journal selection, and tenant guards are real.
async function bootstrap(client: postgres.Sql) {
  await client.unsafe(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid'; CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS 'SELECT ''{}''::jsonb'; CREATE SCHEMA pgmq; CREATE FUNCTION pgmq.create(text) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';`);
}

describe("production journal-driven CRM migration", () => {
  it("upgrades 0011, preserves phase/terminal backfill, rejects invalid relations, and supports a clean install and replay", async () => {
    const directory = await mkdtemp(join(tmpdir(), "andthenn-migration-test-"));
    const port = await freePort();
    const pg = new EmbeddedPostgres({ databaseDir: join(directory, "postgres"), user: "postgres", password: "test", port, persistent: false, postgresFlags: ["-h", "127.0.0.1"] });
    let client: postgres.Sql | undefined;
    let clean: postgres.Sql | undefined;
    try {
      await pg.initialise(); await pg.start();
      client = postgres(`postgres://postgres:test@127.0.0.1:${port}/postgres`, { max: 1, onnotice: () => {} });
      await client.unsafe("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;");
      await bootstrap(client);
      const source = new URL("../migrations/", import.meta.url);
      const journal = JSON.parse(await readFile(new URL("meta/_journal.json", source), "utf8")) as { entries: { idx: number; tag: string; when: number }[] };
      const folder = join(directory, "migrations"); await mkdir(join(folder, "meta"), { recursive: true });
      for (const entry of journal.entries) {
        const ddl = await readFile(new URL(`${entry.tag}.sql`, source), "utf8");
        await writeFile(join(folder, `${entry.tag}.sql`), ddl.replace(/CREATE EXTENSION IF NOT EXISTS pgmq;\s*/g, ""));
      }
      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 11) }));
      await migrate(drizzle(client), { migrationsFolder: folder });
      expect(await crmSchemaReady(drizzle(client))).toBe(false);
      expect((await client`select to_regtype('task_execution_status') as value`)[0]?.value).toBeNull();

      const org = randomUUID(), profile = randomUUID(), member = randomUUID(), customer = randomUUID(), project = randomUUID(), workflow = randomUUID(), stage = randomUUID(), output = randomUUID();
      await client`insert into organizations (id, name, slug) values (${org}, 'Migration fixture', 'migration-fixture')`;
      await client`insert into profiles (id, auth_user_id, display_name, email) values (${profile}, ${randomUUID()}, 'Owner', 'owner@example.test')`;
      await client`insert into memberships (id, organization_id, profile_id, role, account_type, status) values (${member}, ${org}, ${profile}, 'MANAGER', 'PERMANENT', 'ACTIVE')`;
      await client`insert into clients (id, organization_id, name) values (${customer}, ${org}, 'Client')`;
      await client`insert into projects (id, organization_id, client_id, owner_membership_id, name, deadline) values (${project}, ${org}, ${customer}, ${member}, 'Project', now())`;
      await client`insert into workflows (id, organization_id, project_id) values (${workflow}, ${org}, ${project})`;
      await client`insert into workflow_stages (id, organization_id, workflow_id, name, position) values (${stage}, ${org}, ${workflow}, 'Completed is only a phase label', 0)`;
      await client`insert into deliverables (id, organization_id, project_id, name, quantity, format, due_at) values (${output}, ${org}, ${project}, 'Output', 1, 'Text', now())`;
      const open = randomUUID(), done = randomUUID();
      await client`insert into tasks (id, organization_id, deliverable_id, current_workflow_stage_id, name, due_at) values (${open}, ${org}, ${output}, ${stage}, 'Open task', now())`;
      await client`insert into tasks (id, organization_id, deliverable_id, state_kind, name, due_at, completed_at) values (${done}, ${org}, ${output}, 'COMPLETED', 'Terminal task', now(), now())`;

      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.filter((entry) => entry.idx <= 12) }));
      await migrate(drizzle(client), { migrationsFolder: folder });
      expect(await crmSchemaReady(drizzle(client))).toBe(false);
      const legacyAsset = randomUUID(), legacyVersion = randomUUID(), legacyApproval = randomUUID();
      await client`insert into file_assets(id, organization_id, task_id, logical_name) values (${legacyAsset}, ${org}, ${done}, 'Historical master')`;
      await client`insert into file_versions(id, organization_id, file_asset_id, version_number, filename, content_type, size_bytes, checksum_sha256, storage_provider, storage_key, uploader_membership_id, processing_status, locked_at) values (${legacyVersion}, ${org}, ${legacyAsset}, 1, 'legacy.pdf', 'application/pdf', 10, ${"b".repeat(64)}, 'TEST', ${legacyVersion}, ${member}, 'READY', now())`;
      await client`insert into file_approvals(id, organization_id, task_id, file_version_id, approved_by_membership_id) values (${legacyApproval}, ${org}, ${done}, ${legacyVersion}, ${member})`;
      await writeFile(join(folder, "meta/_journal.json"), JSON.stringify(journal));
      await migrate(drizzle(client), { migrationsFolder: folder });
      expect((await client`select execution_status, current_workflow_stage_id from tasks where id = ${open}`)[0]).toMatchObject({ execution_status: "OPEN", current_workflow_stage_id: stage });
      expect(await crmSchemaReady(drizzle(client))).toBe(true);
      expect((await client`select approval_kind, approval_source from approval_reconciliation_queue where id=${legacyApproval}`)[0]).toMatchObject({ approval_kind: 'LEGACY_UNVERIFIED', approval_source: 'LEGACY' });
      expect((await client`select * from current_final_files where file_version_id=${legacyVersion}`).length).toBe(0);
      expect((await client`select requires_client_delivery from tasks where id=${done}`)[0]?.requires_client_delivery).toBe(true);
      expect((await client`select execution_status from tasks where id = ${done}`)[0]?.execution_status).toBe("COMPLETED");
      expect((await client`select role from memberships where id = ${member}`)[0]?.role).toBe("MANAGER");
      const foreignOrg = randomUUID();
      await client`insert into organizations (id, name, slug) values (${foreignOrg}, 'Other tenant', 'other-tenant')`;
      await expect(client`insert into client_memberships (organization_id, client_id, membership_id) values (${foreignOrg}, ${customer}, ${member})`).rejects.toThrow();
      await expect(client`insert into project_expenses (organization_id, project_id, amount_minor, category, incurred_on, created_by_membership_id) values (${foreignOrg}, ${project}, 100, 'Travel', current_date, ${member})`).rejects.toThrow();
      await expect(client`update tasks set completion_confirmed_at = now(), completion_confirmed_by_membership_id = ${member} where id = ${open}`).rejects.toThrow();
      // CRM-R2: neither internal clearance nor Client approval publishes bytes.
      const asset = randomUUID(), version = randomUUID(), internal = randomUUID(), clientApproval = randomUUID();
      await client`insert into file_assets(id, organization_id, task_id, logical_name) values (${asset}, ${org}, ${open}, 'Master')`;
      await client`insert into file_versions(id, organization_id, file_asset_id, version_number, filename, content_type, size_bytes, checksum_sha256, storage_provider, storage_key, uploader_membership_id, processing_status, locked_at) values (${version}, ${org}, ${asset}, 1, 'master.pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'TEST', ${version}, ${member}, 'READY', now())`;
      await client`insert into task_review_selections(organization_id, task_id, file_version_id, selected_by_membership_id) values (${org}, ${open}, ${version}, ${member})`;
      await client`insert into file_approvals(id, organization_id, task_id, file_version_id, approved_by_membership_id, approval_kind, approval_source) values (${internal}, ${org}, ${open}, ${version}, ${member}, 'INTERNAL', 'INTERNAL')`;
      expect((await client`select * from current_final_files where task_id=${open}`).length).toBe(0);
      await expect(client`insert into final_deliveries(organization_id, task_id, file_version_id, client_approval_id, published_by_membership_id) values (${org}, ${open}, ${version}, ${internal}, ${member})`).rejects.toThrow();
      await expect(client`insert into file_approvals(organization_id, task_id, file_version_id, approved_by_membership_id, approval_kind, approval_source, client_approver) values (${org}, ${open}, ${version}, ${member}, 'CLIENT', 'EMAIL', 'Client')`).rejects.toThrow();
      await client`insert into file_approvals(id, organization_id, task_id, file_version_id, approved_by_membership_id, approval_kind, approval_source, client_approver, evidence_reference, note) values (${clientApproval}, ${org}, ${open}, ${version}, ${member}, 'CLIENT', 'EMAIL', 'Client', 'message-123', 'Client approved exact PDF')`;
      expect((await client`select * from current_final_files where task_id=${open}`).length).toBe(0);
      await expect(client`insert into final_deliveries(organization_id, task_id, file_version_id, client_approval_id, published_by_membership_id) values (${foreignOrg}, ${open}, ${version}, ${clientApproval}, ${member})`).rejects.toThrow();
      await client`insert into final_deliveries(organization_id, task_id, file_version_id, client_approval_id, published_by_membership_id) values (${org}, ${open}, ${version}, ${clientApproval}, ${member})`;
      expect((await client`select * from current_final_files where task_id=${open}`).length).toBe(1);
      await client`update file_approvals set reopened_at=now(), reopened_by_membership_id=${member}, reopen_reason='Client changes' where id=${clientApproval}`;
      expect((await client`select * from current_final_files where task_id=${open}`).length).toBe(0);
      await expect(client`update file_versions set filename='changed.pdf' where id=${version}`).rejects.toThrow();
      for (const table of ['final_deliveries', 'client_memberships', 'internal_comment_mentions', 'task_review_selections', 'project_expenses', 'current_final_files']) {
        expect((await client`select has_table_privilege('authenticated', ${table}, 'SELECT') as allowed`)[0]?.allowed).toBe(false);
      }
      await migrate(drizzle(client), { migrationsFolder: folder });
      expect(Number((await client`select count(*) as count from drizzle.__drizzle_migrations`)[0]?.count)).toBe(journal.entries.length);

      await client.unsafe("CREATE DATABASE crm_clean_install");
      clean = postgres(`postgres://postgres:test@127.0.0.1:${port}/crm_clean_install`, { max: 1, onnotice: () => {} });
      await bootstrap(clean); await migrate(drizzle(clean), { migrationsFolder: folder });
      expect((await clean`select to_regclass('project_expenses')::text as value`)[0]?.value).toBe("project_expenses");
    } finally {
      await clean?.end(); await client?.end(); await pg.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});


describe("persistent prototype migrations", () => {
  it("upgrades an unjournaled 0011 database without losing data and supports restart and fresh install", async () => {
    const directory = await mkdtemp(join(tmpdir(), "andthenn-prototype-migration-test-"));
    const port = await freePort();
    const pg = new EmbeddedPostgres({ databaseDir: join(directory, "postgres"), user: "postgres", password: "test", port, persistent: false, postgresFlags: ["-h", "127.0.0.1"] });
    const url = `postgres://postgres:test@127.0.0.1:${port}/postgres`;
    let client: postgres.Sql | undefined;
    let clean: postgres.Sql | undefined;
    try {
      await pg.initialise(); await pg.start();
      client = postgres(url, { max: 1, onnotice: () => {} });
      await client.unsafe("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN");
      await bootstrap(client);
      const source = new URL("../migrations/", import.meta.url);
      const journal = JSON.parse(await readFile(new URL("meta/_journal.json", source), "utf8")) as { entries: { idx: number; tag: string }[] };
      // Reproduce the old runner: raw SQL with no migration journal.
      for (const entry of journal.entries.filter((entry) => entry.idx <= 11)) {
        const ddl = (await readFile(new URL(`${entry.tag}.sql`, source), "utf8")).replace(/CREATE EXTENSION IF NOT EXISTS pgmq;\s*/g, "");
        for (const statement of ddl.split("--> statement-breakpoint").filter((value) => value.trim())) await client.unsafe(statement);
      }
      const org = randomUUID();
      await client`insert into organizations (id, name, slug) values (${org}, 'User-created prototype data', 'preserved')`;
      const demoOrg = "20000000-0000-4000-8000-000000000001", demoProfile = "21000000-0000-4000-8000-000000000001", demoMember = "22000000-0000-4000-8000-000000000001";
      await client`insert into organizations (id, name, slug) values (${demoOrg}, 'AndThenn Media', 'andthenn-media')`;
      await client`insert into profiles (id, auth_user_id, display_name, email) values (${demoProfile}, '10000000-0000-4000-8000-000000000001', 'Mira Shah', 'mira@andthenn.example')`;
      await client`insert into memberships (id, organization_id, profile_id, role, account_type, status) values (${demoMember}, ${demoOrg}, ${demoProfile}, 'MANAGER', 'PERMANENT', 'ACTIVE')`;
      await expect(migratePrototype(url)).rejects.toThrow("Unrecognized legacy prototype schema");
      await migratePrototype(url, true);
      await migratePrototype(url, true);
      expect((await client`select role, finance_access from memberships where id=${demoMember}`)[0]).toMatchObject({ role: "FOUNDER", finance_access: true });
      expect((await client`select role from memberships where id='22000000-0000-4000-8000-000000000006'`)[0]?.role).toBe("MANAGER");
      expect((await client`select count(*)::int as n from prototype_data_migrations`)[0]?.n).toBe(1);
      // An intentional later role change must not be overwritten on restart.
      await client`update memberships set role='MANAGER', finance_access=false where id=${demoMember}`;
      await migratePrototype(url, true);
      expect((await client`select role, finance_access from memberships where id=${demoMember}`)[0]).toMatchObject({ role: "MANAGER", finance_access: false });
      expect((await client`select name from organizations where id = ${org}`)[0]?.name).toBe("User-created prototype data");
      expect(await crmSchemaReady(drizzle(client))).toBe(true);
      expect(await client`select client_id from client_memberships where organization_id = ${org} and membership_id = ${randomUUID()}`).toHaveLength(0);
      expect(Number((await client`select count(*) as count from drizzle.__drizzle_migrations`)[0]?.count)).toBe(journal.entries.length);
      // Roles belong to the cluster; a new database still needs auth and PGMQ.
      // Use a separate cluster database with the already-existing shared roles.
      await client.unsafe("CREATE DATABASE prototype_clean");
      const cleanUrl = `postgres://postgres:test@127.0.0.1:${port}/prototype_clean`;
      await migratePrototype(cleanUrl);
      await migratePrototype(cleanUrl);
      clean = postgres(cleanUrl, { max: 1, onnotice: () => {} });
      expect(await crmSchemaReady(drizzle(clean))).toBe(true);
    } finally {
      await clean?.end(); await client?.end(); await pg.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);
});
