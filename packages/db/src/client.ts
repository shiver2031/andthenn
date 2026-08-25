import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DatabaseConnection = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
};

const globalForDatabase = globalThis as typeof globalThis & {
  __andthennDatabaseConnections?: Map<string, DatabaseConnection>;
};

function connections() {
  globalForDatabase.__andthennDatabaseConnections ??= new Map();
  return globalForDatabase.__andthennDatabaseConnections;
}

/**
 * Reuse one bounded pool per process and connection string. App Router server
 * rendering can invoke this function many times in one process; opening a pool
 * per request exhausts Supabase connection limits under ordinary concurrency.
 */
export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const existing = connections().get(connectionString);
  if (existing) return existing;
  // A Vercel function may be replicated many times. One connection per
  // instance keeps the review app within Supabase's pooler client limit while
  // postgres.js queues concurrent queries within that instance.
  const client = postgres(connectionString, { prepare: false, max: process.env.VERCEL ? 1 : 10 });
  const connection: DatabaseConnection = { db: drizzle(client, { schema }), client };
  connections().set(connectionString, connection);
  return connection;
}

export type Database = ReturnType<typeof createDatabase>["db"];

export async function closeDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return;
  const connection = connections().get(connectionString);
  if (!connection) return;
  connections().delete(connectionString);
  await connection.client.end();
}
