import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

let isDatabaseHealthy = false;
let missingTablesList: string[] = [];
let hasCheckedSchema = false;

const REQUIRED_TABLES = [
  "connected_services",
  "user_api_keys",
  "projects",
  "knowledge_sources"
];

export async function validateDatabaseSchema() {
  try {
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const existingTables = result.map((r: any) => r.table_name);
    missingTablesList = REQUIRED_TABLES.filter(t => !existingTables.includes(t));
    
    if (missingTablesList.length > 0) {
      isDatabaseHealthy = false;
      missingTablesList.forEach(table => {
        logger.error({ table }, "DATABASE_SCHEMA_MISSING");
      });
    } else {
      isDatabaseHealthy = true;
    }
    hasCheckedSchema = true;
  } catch (error) {
    logger.error({ error }, "Failed to validate database schema");
    isDatabaseHealthy = false;
    hasCheckedSchema = true;
  }
}

export function databaseHealthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Allow health checks to pass through so the system can monitor the app
  if (req.path.startsWith("/api/system/database") || req.path === "/api/health") {
    return next();
  }
  
  if (hasCheckedSchema && !isDatabaseHealthy) {
    res.status(503).json({
      error: "Service Unavailable",
      message: "Database schema validation failed. Required tables are missing.",
      missingTables: missingTablesList
    });
    return;
  }
  
  next();
}

export function getDatabaseStatus() {
  const status: Record<string, boolean> = {};
  REQUIRED_TABLES.forEach(table => {
    status[table] = !missingTablesList.includes(table);
  });
  return status;
}
