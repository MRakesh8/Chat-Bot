import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import { logger } from "./logger";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Find the drizzle folder depending on if we are running in dist or src
export async function runMigrations() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // from src/lib to database/db/drizzle
    let migrationsFolder = path.resolve(__dirname, "../../../../database/db/drizzle");
    if (!fs.existsSync(migrationsFolder)) {
      // fallback for built app structure (dist/lib)
      migrationsFolder = path.resolve(__dirname, "../../../database/db/drizzle");
    }
    
    if (fs.existsSync(migrationsFolder)) {
      logger.info({ migrationsFolder }, "Running database migrations");
      await migrate(db, { migrationsFolder });
      logger.info("Migrations completed successfully");
    } else {
      logger.error({ migrationsFolder }, "Migrations folder not found. Skipping auto-migration.");
    }
  } catch (err) {
    logger.error({ err }, "Failed to run migrations");
    throw err; // throw to stop startup
  }
}
