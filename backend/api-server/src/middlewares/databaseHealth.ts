import { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

let isDatabaseHealthy = false;
let missingTablesList: string[] = [];
let hasCheckedSchema = false;

const REQUIRED_SCHEMA: Record<string, Record<string, string>> = {
  connected_services: { id: "uuid", name: "text" },
  user_api_keys: { id: "uuid", name: "text" },
  projects: { id: "uuid", name: "text" },
  knowledge_sources: { id: "uuid", title: "text" },
  chat_sessions: { id: "uuid", title: "text" },
  messages: { id: "uuid", content: "text" }
};

export async function validateDatabaseSchema() {
  const startTime = Date.now();
  logger.info("[DB] DATABASE_VALIDATION_START");

  try {
    const result = await db.execute(sql`
      SELECT c.table_name, c.column_name, c.data_type, 
             (SELECT count(*) FROM information_schema.key_column_usage kcu
              JOIN information_schema.table_constraints tc ON kcu.constraint_name = tc.constraint_name
              WHERE kcu.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY') as is_pk
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
    `);
    
    const rows = Array.isArray(result) ? result : (result as any).rows || [];
    
    const dbSchema: Record<string, Record<string, { type: string, is_pk: boolean }>> = {};
    rows.forEach((r: any) => {
      if (!dbSchema[r.table_name]) dbSchema[r.table_name] = {};
      dbSchema[r.table_name][r.column_name] = { type: r.data_type, is_pk: parseInt(r.is_pk) > 0 };
    });

    const missingTables: string[] = [];
    const missingColumns: string[] = [];
    const missingPk: string[] = [];

    for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
      if (!dbSchema[table]) {
        missingTables.push(table);
        continue;
      }
      for (const col of Object.keys(columns)) {
        const actual = dbSchema[table][col];
        if (!actual) {
          missingColumns.push(`${table}.${col}`);
        }
      }
      if (dbSchema[table]["id"] && !dbSchema[table]["id"].is_pk) {
         missingPk.push(`${table}.id`);
      }
    }
    
    missingTablesList = missingTables;

    if (missingTables.length > 0 || missingColumns.length > 0 || missingPk.length > 0) {
      isDatabaseHealthy = false;
      logger.error({ 
        missingTables, 
        missingColumns, 
        missingPk 
      }, `[DB] DATABASE_VALIDATION_FAILED in ${Date.now() - startTime}ms - Running in degraded mode`);
    } else {
      isDatabaseHealthy = true;
      logger.info(`[DB] DATABASE_VALIDATION_SUCCESS in ${Date.now() - startTime}ms`);
    }
    hasCheckedSchema = true;
  } catch (error: any) {
    logger.error({ 
      message: error?.message, 
      stack: error?.stack, 
      cause: error 
    }, `[DB] DATABASE_VALIDATION_FAILED in ${Date.now() - startTime}ms - Internal error`);
    isDatabaseHealthy = false;
    hasCheckedSchema = true;
  }
}

export function databaseHealthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Schema validation failure is logged but does NOT block the app or healthz.
  // We simply pass through.
  next();
}

export function getDatabaseStatus() {
  const status: Record<string, boolean> = {};
  Object.keys(REQUIRED_SCHEMA).forEach(table => {
    status[table] = !missingTablesList.includes(table);
  });
  return status;
}
