import { db, crypto } from "@workspace/db";
import { projectApiKeys, userApiKeys } from "@workspace/db/schema";
import { lte, or, and, isNotNull, lt, eq, isNull } from "drizzle-orm";
import { ProviderVerifier } from "../services/provider-verifier";
import { updateKeyStats } from "../services/api-health";

/**
 * Intelligent Health Monitor
 * 
 * Rules:
 * 1. Never waste API quota just to check health.
 * 2. Update health using real production requests whenever possible.
 * 3. Only perform an active health check if a key has been idle for more than 24 hours.
 * 4. After an error (429, 500, etc.), schedule a lightweight recheck after the cooldown expires.
 */
export async function runIntelligentHealthCheck() {
  console.log("[Health Monitor] Starting intelligent health check...");
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Find keys that have been idle for > 24 hours (lastUsed < 24h ago OR lastUsed is null)
  const idleUserKeys = await db.query.userApiKeys.findMany({
    where: and(
      eq(userApiKeys.isEnabled, true),
      or(
        lte(userApiKeys.lastUsed, twentyFourHoursAgo),
        isNull(userApiKeys.lastUsed)
      )
    ),
  });

  const idleProjectKeys = await db.query.projectApiKeys.findMany({
    where: and(
      eq(projectApiKeys.isEnabled, true),
      or(
        lte(projectApiKeys.lastUsed, twentyFourHoursAgo),
        isNull(projectApiKeys.lastUsed)
      )
    ),
  });

  // 2. Find keys where cooldown just expired (cooldownUntil < now AND status != HEALTHY)
  const cooldownExpiredUserKeys = await db.query.userApiKeys.findMany({
    where: and(
      eq(userApiKeys.isEnabled, true),
      isNotNull(userApiKeys.cooldownUntil),
      lt(userApiKeys.cooldownUntil, now)
    )
  });

  const cooldownExpiredProjectKeys = await db.query.projectApiKeys.findMany({
    where: and(
      eq(projectApiKeys.isEnabled, true),
      isNotNull(projectApiKeys.cooldownUntil),
      lt(projectApiKeys.cooldownUntil, now)
    )
  });

  const keysToVerify = [
    ...idleUserKeys.map(k => ({ ...k, type: 'user' as const })),
    ...idleProjectKeys.map(k => ({ ...k, type: 'project' as const })),
    ...cooldownExpiredUserKeys.map(k => ({ ...k, type: 'user' as const })),
    ...cooldownExpiredProjectKeys.map(k => ({ ...k, type: 'project' as const }))
  ];

  // Deduplicate keys by ID
  const uniqueKeysMap = new Map();
  for (const k of keysToVerify) {
    uniqueKeysMap.set(k.id, k);
  }
  const uniqueKeys = Array.from(uniqueKeysMap.values());

  console.log(`[Health Monitor] Found ${uniqueKeys.length} keys requiring active verification.`);

  let verifiedCount = 0;
  for (const key of uniqueKeys) {
    try {
      console.log(`[Health Monitor] Verifying ${key.type} key: ${key.id} (Provider: ${key.provider})`);
      const decryptedKey = crypto.decrypt(key.encryptedKey) || key.encryptedKey;
      
      const startTime = Date.now();
      let result;
      let isValid = false;
      let errorMsg = "Invalid API key";
      try {
        result = await ProviderVerifier.verifyAndFetchModels(decryptedKey, key.provider);
        isValid = true;
      } catch (err: any) {
        errorMsg = err?.message || String(err);
      }
      const latencyMs = Date.now() - startTime;

      // Ensure key object structure matches what updateKeyStats expects
      const keyObj = {
        id: key.id,
        type: key.type,
        provider: key.provider,
        rawDbKey: key
      };

      if (isValid && result) {
        await updateKeyStats({
          key: keyObj,
          success: true,
          latencyMs,
          status: "HEALTHY",
          model: result.defaultModel || "unknown"
        });
        
        // If models were discovered, update them
        if (result.models && result.models.length > 0) {
          const updateData = { availableModels: result.models };
          if (key.type === 'project') {
            await db.update(projectApiKeys).set(updateData).where(eq(projectApiKeys.id, key.id));
          } else {
            await db.update(userApiKeys).set(updateData).where(eq(userApiKeys.id, key.id));
          }
        }
      } else {
        await updateKeyStats({
          key: keyObj,
          success: false,
          latencyMs,
          status: "INVALID_API_KEY", // Default mapping for verifier fail
          error: new Error(errorMsg),
          model: "unknown"
        });
      }
      
      verifiedCount++;
    } catch (err) {
      console.error(`[Health Monitor] Failed to verify key ${key.id}:`, err);
    }
  }
  
  console.log(`[Health Monitor] Completed active verification for ${verifiedCount} keys.`);
}
