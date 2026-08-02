/**
 * @file index.ts
 * @description Initializes the Drizzle ORM client with pg.Pool and exports the database connection instance (`db`).
 *
 * IMPORTANT: The DATABASE_URL uses Supabase's pgbouncer transaction pooler (port 6543).
 * Prepared statements are NOT supported in pgbouncer transaction mode.
 * We disable the pg statement cache by using a custom pool client class that
 * strips the 'name' field from queries (forcing simple/unprepared execution).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Custom Pool Client: disables prepared statements for pgbouncer transaction pooler compatibility.
// pgbouncer in transaction mode cannot route prepared statement handles across connections.
class NoPrepareClient extends pg.Client {
  query(config: any, values?: any, cb?: any): any {
    // Force unprepared (simple) queries by removing the statement name
    if (config && typeof config === "object" && config.name) {
      const { name: _name, ...rest } = config;
      return super.query(rest, values, cb);
    }
    return super.query(config, values, cb);
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // @ts-ignore - pg typings don't expose Client constructor option but it's valid
  Client: NoPrepareClient,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
export * as crypto from "./crypto";
