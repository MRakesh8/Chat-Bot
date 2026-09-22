import { db, crypto } from "@workspace/db";
import { userApiKeys, projectApiKeys } from "@workspace/db/schema";
import { eq, and, ne, lt } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger";

import { ProviderVerifier } from "../services/provider-verifier";

// Test a Gemini API key by discovering models dynamically and executing a lightweight prompt request
async function testApiKey(apiKey: string): Promise<{ success: boolean; isRateLimit: boolean; isInvalid: boolean; message: string }> {
  try {
    const verified = await ProviderVerifier.verifyAndFetchModels(apiKey, "gemini");
    const candidateModels = verified.models.length > 0 ? verified.models : [verified.defaultModel];
    
    const httpOptions: any = {};
    if (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
      httpOptions.baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL.replace(/\/v1beta\/?$/, '').replace(/\/+$/, '');
    }
    const client = new GoogleGenAI({
      apiKey,
      ...(Object.keys(httpOptions).length > 0 ? { httpOptions } : {})
    });
    
    let lastErr: any = null;
    for (const targetModel of candidateModels) {
      try {
        await client.models.generateContent({
          model: targetModel,
          contents: "ping"
        });
        return { success: true, isRateLimit: false, isInvalid: false, message: "API key verified successfully." };
      } catch (e: any) {
        lastErr = e;
        const status = e?.status || e?.response?.status || e?.code;
        const errMessage = e?.message || String(e);
        const isRateLimit = status === 429 || errMessage.includes("429") || errMessage.toLowerCase().includes("quota") || errMessage.toLowerCase().includes("rate limit");
        const isAuthError = status === 401 || status === 403 || errMessage.toLowerCase().includes("permission denied") || errMessage.toLowerCase().includes("invalid key") || errMessage.toLowerCase().includes("invalid_credential");
        
        if (isRateLimit) {
          return { success: false, isRateLimit: true, isInvalid: false, message: errMessage };
        }
        if (isAuthError) {
          return { success: false, isRateLimit: false, isInvalid: true, message: errMessage };
        }
        // If 404 / MODEL_NOT_FOUND, loop to try next model in candidateModels
      }
    }
    
    const finalErrMessage = lastErr?.message || "No supported model available for API key.";
    return { success: false, isRateLimit: false, isInvalid: false, message: finalErrMessage };
  } catch (e: any) {
    const status = e?.status || e?.response?.status || e?.code;
    const errMessage = e?.message || String(e);
    const isRateLimit = status === 429 || errMessage.includes("429") || errMessage.toLowerCase().includes("quota") || errMessage.toLowerCase().includes("rate limit");
    const isInvalid = status === 401 || status === 403 || errMessage.toLowerCase().includes("invalid") || errMessage.toLowerCase().includes("permission denied");
    
    return {
      success: false,
      isRateLimit,
      isInvalid,
      message: errMessage
    };
  }
}

export async function resetDailyQuotas() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  try {
    const keysToReset = await db.select({ id: userApiKeys.id, status: userApiKeys.status }).from(userApiKeys).where(
      lt(userApiKeys.lastResetAt, todayUTC)
    );
    
    if (keysToReset.length > 0) {
      logger.info(`[QuotaReset] Resetting daily limit for ${keysToReset.length} system/user keys.`);
      
      for (const key of keysToReset) {
        let newStatus = key.status;
        let updateData: any = {
          dailyUsed: 0,
          lastResetAt: now
        };
        
        if (newStatus === "QUOTA_EXCEEDED") {
          updateData.status = "HEALTHY";
          updateData.failureReason = null;
        }
        
        await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, key.id));
      }
    }
  } catch (err) {
    logger.error(err, "[QuotaReset] Error resetting daily limits");
  }
}

export async function checkAllUnhealthyKeys() {
  logger.info("[HealthCheck] Starting periodic API key health check...");
  
  const now = new Date();
  
  try {
    // 1. Fetch all user/system API keys that are not healthy and not disabled
    const inactiveUserKeys = await db.select().from(userApiKeys).where(
      and(
        ne(userApiKeys.status, "HEALTHY"),
        ne(userApiKeys.status, "DISABLED")
      )
    );
    
    logger.info(`[HealthCheck] Found ${inactiveUserKeys.length} inactive user/system keys to check.`);
    
    for (const key of inactiveUserKeys) {
      try {
        const decrypted = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
        if (!decrypted) continue;
        
        const testRes = await testApiKey(decrypted);
        
        if (testRes.success) {
          logger.info(`[HealthCheck] User/System Key ${key.id} (${key.name}) has recovered! Restoring to HEALTHY.`);
          await db.update(userApiKeys).set({
            status: "HEALTHY",
            cooldownUntil: null,
            failureReason: null,
            isEnabled: true, // Re-enable if it was disabled by the system
            lastSuccess: now
          }).where(eq(userApiKeys.id, key.id));
        } else {
          const statusStr = testRes.message.toLowerCase();
          if (testRes.isRateLimit) {
            logger.info(`[HealthCheck] User/System Key ${key.id} (${key.name}) is still rate-limited/out of quota.`);
            if (key.status !== "QUOTA_EXCEEDED") {
              await db.update(userApiKeys).set({
                status: "QUOTA_EXCEEDED",
                failureReason: testRes.message,
                lastFailure: now
              }).where(eq(userApiKeys.id, key.id));
            }
          } else if (testRes.isInvalid) {
            logger.info(`[HealthCheck] User/System Key ${key.id} (${key.name}) is invalid (401/403/bad key). Disabling.`);
            await db.update(userApiKeys).set({
              status: "INVALID",
              isEnabled: false,
              failureReason: testRes.message,
              lastFailure: now
            }).where(eq(userApiKeys.id, key.id));
          } else {
            logger.info(`[HealthCheck] User/System Key ${key.id} (${key.name}) failed with connection/other error: ${testRes.message}`);
          }
        }
      } catch (err) {
        logger.error(err, `[HealthCheck] Error checking user key ${key.id}`);
      }
    }
  } catch (err) {
    logger.error(err, "[HealthCheck] Error fetching user keys");
  }
  
  try {
    // 2. Fetch all project API keys that are not healthy and not disabled
    const inactiveProjectKeys = await db.select().from(projectApiKeys).where(
      and(
        ne(projectApiKeys.status, "HEALTHY"),
        ne(projectApiKeys.status, "DISABLED")
      )
    );
    
    logger.info(`[HealthCheck] Found ${inactiveProjectKeys.length} inactive project keys to check.`);
    
    for (const key of inactiveProjectKeys) {
      try {
        const decrypted = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
        if (!decrypted) continue;
        
        const testRes = await testApiKey(decrypted);
        
        if (testRes.success) {
          logger.info(`[HealthCheck] Project Key ${key.id} (${key.name}) has recovered! Restoring to HEALTHY.`);
          await db.update(projectApiKeys).set({
            status: "HEALTHY",
            cooldownUntil: null,
            failureReason: null,
            isEnabled: true,
            lastSuccess: now
          }).where(eq(projectApiKeys.id, key.id));
        } else {
          const statusStr = testRes.message.toLowerCase();
          if (testRes.isRateLimit) {
            logger.info(`[HealthCheck] Project Key ${key.id} (${key.name}) is still rate-limited/out of quota.`);
            if (key.status !== "QUOTA_EXCEEDED") {
              await db.update(projectApiKeys).set({
                status: "QUOTA_EXCEEDED",
                failureReason: testRes.message,
                lastFailure: now
              }).where(eq(projectApiKeys.id, key.id));
            }
          } else if (testRes.isInvalid) {
            logger.info(`[HealthCheck] Project Key ${key.id} (${key.name}) is invalid (401/403/bad key). Disabling.`);
            await db.update(projectApiKeys).set({
              status: "INVALID",
              isEnabled: false,
              failureReason: testRes.message,
              lastFailure: now
            }).where(eq(projectApiKeys.id, key.id));
          } else {
            logger.info(`[HealthCheck] Project Key ${key.id} (${key.name}) failed with connection/other error: ${testRes.message}`);
          }
        }
      } catch (err) {
        logger.error(err, `[HealthCheck] Error checking project key ${key.id}`);
      }
    }
  } catch (err) {
    logger.error(err, "[HealthCheck] Error fetching project keys");
  }
}

export function startApiKeyHealthCheckTask() {
  // Run 10 seconds after server starts to avoid clogging startup database queries
  setTimeout(() => {
    resetDailyQuotas();
    checkAllUnhealthyKeys();
  }, 10000);
  
  // Run every 5 minutes
  const FIVE_MINUTES = 5 * 60 * 1000;
  setInterval(() => {
    resetDailyQuotas();
    checkAllUnhealthyKeys();
  }, FIVE_MINUTES);
}
