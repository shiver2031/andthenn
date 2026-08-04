import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "./client";

const { db, client } = createDatabase();
await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await client.end();
