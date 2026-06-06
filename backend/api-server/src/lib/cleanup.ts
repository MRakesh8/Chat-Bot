import { db } from "@workspace/db";
import { chatSessions } from "@workspace/db";
import { lt, and, eq } from "drizzle-orm";
import { logger } from "./logger";

export async function cleanupExpiredChats() {
  try {
    const now = new Date();
    // Delete chats where expiresAt < now and isFavorite is false
    const result = await db
      .delete(chatSessions)
      .where(and(lt(chatSessions.expiresAt, now), eq(chatSessions.isFavorite, false)));
    
    // Result object in pg usually doesn't have rowCount directly without cast, but it's fine.
    logger.info("Ran expired chats cleanup");
  } catch (error) {
    logger.error({ error }, "Error cleaning up expired chats");
  }
}

export function startCleanupTask() {
  // Run immediately on start
  cleanupExpiredChats();

  // Then run every 12 hours
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  setInterval(cleanupExpiredChats, TWELVE_HOURS);
}
