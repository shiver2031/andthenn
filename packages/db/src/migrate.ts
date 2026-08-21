import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, createDatabase } from "./client";

const { db } = createDatabase();
await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
await closeDatabase();
