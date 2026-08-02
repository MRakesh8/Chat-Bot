import { logger } from "./logger";
import { pool } from "@workspace/db";

export function startSupabaseKeepAliveTask() {
  const supabaseUrl = process.env.SUPABASE_URL;

  const ping = async () => {
    try {
      // 1. Keep Database Active (prevents Supabase 7-day free tier auto-pause)
      await pool.query("SELECT 1;");
      logger.info("[SUPABASE_KEEP_ALIVE] Database heartbeat ping successful.");

      // 2. Keep Auth/REST API endpoints active
      // The /auth/v1/health endpoint requires the apikey header, otherwise Supabase returns 401
      if (supabaseUrl) {
        const anonKey = process.env.SUPABASE_ANON_KEY || "";
        await fetch(`${supabaseUrl}/auth/v1/health`, {
          method: "GET",
          headers: { apikey: anonKey },
        }).catch(() => {});
      }
    } catch (err: any) {
      logger.warn({ err: err?.message }, "[SUPABASE_KEEP_ALIVE] Heartbeat ping warning");
    }
  };

  // Run initial ping on server startup
  ping();

  // Ping every 12 hours to guarantee zero project inactivity
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  setInterval(ping, TWELVE_HOURS);
}
