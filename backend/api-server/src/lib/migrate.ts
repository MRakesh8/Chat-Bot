import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { logger } from "./logger";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import crypto from "crypto";
import { sql } from "drizzle-orm";

// Find the drizzle folder depending on if we are running in dist or src
export async function runMigrations() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const possiblePaths = [
      path.resolve(__dirname, "../../../../database/db/drizzle"), // src/lib -> root
      path.resolve(__dirname, "../../../database/db/drizzle"),    // dist/index.mjs -> root
      path.resolve(process.cwd(), "../../database/db/drizzle"),     // from api-server
      path.resolve(process.cwd(), "database/db/drizzle"),           // from root
      "/opt/render/project/src/database/db/drizzle"                 // Render absolute fallback
    ];

    let migrationsFolder = "";
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        migrationsFolder = p;
        break;
      }
    }
    
    if (migrationsFolder && fs.existsSync(migrationsFolder)) {
      logger.info({ migrationsFolder }, "Running database migrations");
      try {
        await migrate(db, { migrationsFolder });
        logger.info("Migrations completed successfully");
      } catch (err: any) {
        if (err.message?.includes("already exists") || err.message?.includes("Duplicate")) {
          logger.warn("Schema already exists. Attempting to mark existing migrations as applied...");
          
          try {
             const journalStr = fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8");
             const journal = JSON.parse(journalStr);
             
             await db.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle;`);
             await db.execute(sql`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);`);
             
             for (const entry of journal.entries) {
               const filePath = path.join(migrationsFolder, `${entry.tag}.sql`);
               if (fs.existsSync(filePath)) {
                 const content = fs.readFileSync(filePath, "utf8");
                 const hash = crypto.createHash("sha256").update(content).digest("hex");
                 
                 // check if exists
                 const res = await db.execute(sql`SELECT count(*) as count FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`);
                 const count = Array.isArray(res) ? res[0]?.count : (res as any).rows?.[0]?.count;
                 
                 if (Number(count) === 0) {
                    await db.execute(sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${Date.now()})`);
                    logger.info(`Marked migration ${entry.tag} as applied`);
                 }
               }
             }
             
             logger.info("Retrying migrations...");
             await migrate(db, { migrationsFolder });
             logger.info("Migrations completed successfully after fix");
          } catch (fixErr) {
             logger.error({ fixErr }, "Failed to fix migrations");
             throw err; // throw original
          }
        } else {
          throw err;
        }
      }
    } else {
      logger.error({ migrationsFolder }, "Migrations folder not found. Skipping auto-migration.");
    }
  } catch (err) {
    logger.error({ err }, "Failed to run migrations");
    throw err; // throw to stop startup
  }
}

