import postgres from "postgres";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) throw new Error("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required");

const quote = (identifier: string) => `"${identifier.replaceAll("\"", "\"\"")}"`;

async function main() {
  const source = postgres(sourceUrl, { prepare: false, max: 1 });
  const target = postgres(targetUrl, { prepare: false, max: 1 });
  try {
    const tableRows = await source<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;
    const tables = tableRows.map((row) => row.table_name);
    const foreignKeys = await source<{ table_name: string; referenced_table: string }[]>`
      select tc.table_name, ccu.table_name as referenced_table
      from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
    `;
    const pending = new Set(tables);
    const ordered: string[] = [];
    while (pending.size) {
      const ready = [...pending].filter((table) => foreignKeys
        .filter((key) => key.table_name === table)
        .every((key) => !pending.has(key.referenced_table)));
      if (!ready.length) throw new Error(`Unable to order tables with foreign keys: ${[...pending].join(", ")}`);
      ready.sort();
      for (const table of ready) { pending.delete(table); ordered.push(table); }
    }

    if (tables.length) await target.unsafe(`truncate table ${tables.map(quote).join(", ")} restart identity cascade`);
    for (const table of ordered) {
      const rows = await source.unsafe(`select * from ${quote(table)}`) as Array<Record<string, unknown>>;
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]!);
      const statement = `insert into ${quote(table)} (${columns.map(quote).join(", ")}) values (${columns.map((_, index) => `$${index + 1}`).join(", ")})`;
      for (const row of rows) await target.unsafe(statement, columns.map((column) => row[column]));
      console.log(`Copied ${rows.length} row${rows.length === 1 ? "" : "s"} from ${table}`);
    }
  } finally {
    await Promise.all([source.end({ timeout: 5 }), target.end({ timeout: 5 })]);
  }
}

await main();
