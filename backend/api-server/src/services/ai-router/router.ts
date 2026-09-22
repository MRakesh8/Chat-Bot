import { db, projectApiKeys, userApiKeys, crypto } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { RoutingRequirement, ResolvedModel, NormalizedModel } from "./types";
import { registry } from "./registry";
import { getRedisClient } from "../../lib/redis";

export class UniversalRouterService {
  /**
   * Resolves the authoritative credential based on Routing Hierarchy: Project -> User -> System.
   * Enforces enabled state, quotas, and health constraints.
   */
  static async resolveCredential(req: RoutingRequirement): Promise<ResolvedModel> {
    const { projectId, userId, preferredProvider, preferredModel } = req;
    
    // Attempt 1: Project API Key
    if (projectId) {
      const pKeys = await db.select().from(projectApiKeys).where(
        and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true))
      );
      if (pKeys.length > 0) {
        // Find best match (simplified matching)
        const match = preferredProvider ? pKeys.find(k => k.provider === preferredProvider) : pKeys.find(k => k.isPrimary) || pKeys[0];
        if (match) {
          return {
            provider: match.provider,
            modelId: preferredModel ||  "default",
            credential: { id: match.id, apiKey: crypto.decrypt(match.encryptedKey) || match.encryptedKey, type: "project" }
          };
        }
      }
    }

    // Attempt 2: User API Key
    if (userId && userId !== "system") {
      const uKeys = await db.select().from(userApiKeys).where(
        and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true))
      );
      if (uKeys.length > 0) {
        const match = preferredProvider ? uKeys.find(k => k.provider === preferredProvider) : uKeys.find(k => k.isPrimary) || uKeys[0];
        if (match) {
          return {
            provider: match.provider,
            modelId: preferredModel ||  "default",
            credential: { id: match.id, apiKey: crypto.decrypt(match.encryptedKey) || match.encryptedKey, type: "user" }
          };
        }
      }
    }

    // Attempt 3: Global System Config Fallback
    // Attempt 3: Global System Config Fallback
    const { isNull } = require("drizzle-orm");
    const systemKeys = await db.select().from(userApiKeys).where(
      and(
        eq(userApiKeys.isEnabled, true),
        isNull(userApiKeys.userId)
      )
    );
    if (systemKeys.length > 0) {
      const match = preferredProvider ? systemKeys.find(k => k.provider === preferredProvider) : systemKeys.find(k => k.isPrimary) || systemKeys[0];
      if (match) {
        return {
          provider: match.provider,
          modelId: preferredModel || "default",
          credential: { id: match.id, apiKey: crypto.decrypt(match.encryptedKey) || match.encryptedKey, type: "system" }
        };
      }
    }

    throw new Error("No valid AI provider credential found for this request.");
  }

  /**
   * Refreshes the model catalog for a specific credential utilizing a shared Redis cache.
   */
  static async getCatalog(resolved: ResolvedModel): Promise<NormalizedModel[]> {
    const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
    const redis = getRedisClient();

    if (redis && redis.status === "ready") {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const adapter = registry.getAdapter(resolved.provider);
    const catalog = await adapter.discoverModels(resolved.credential.apiKey, resolved.credential.baseUrl);
    
    if (redis && redis.status === "ready") {
      await redis.setex(cacheKey, 3600, JSON.stringify(catalog)); // Cache for 1 hr
    }
    
    return catalog;
  }

  /**
   * Matches a model against capabilities.
   */
  static async selectModel(resolved: ResolvedModel, req: RoutingRequirement): Promise<ResolvedModel> {
    const catalog = await this.getCatalog(resolved);
    
    // Check if preferred model is compatible
    if (req.preferredModel && resolved.modelId !== "default") {
       const model = catalog.find(m => m.modelId === resolved.modelId);
       if (model) return resolved;
    }

    // Capability based selection
    for (const model of catalog) {
       let match = true;
       if (req.capabilities.textGeneration && !model.capabilities.textGeneration) match = false;
       if (req.capabilities.vision && !model.capabilities.vision) match = false;
       if (req.capabilities.tools && !model.capabilities.tools) match = false;
       if (req.capabilities.streaming && !model.capabilities.streaming) match = false;
       
       if (match) {
         resolved.modelId = model.modelId;
         return resolved;
       }
    }

    throw new Error(`CAPABILITY_MISMATCH: No model found in provider ${resolved.provider} satisfying requirements.`);
  }

  static async executeChat(req: RoutingRequirement, messages: any[], temperature?: number) {
    const initialResolved = await this.resolveCredential(req);
    let resolved = await this.selectModel(initialResolved, req);
    const adapter = registry.getAdapter(resolved.provider);
    
    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      const startTime = Date.now();
      try {
        const response = await adapter.generateChat({
          messages,
          temperature,
          model: resolved
        });
        
        const { updateKeyStats } = require("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: true,
          latencyMs: Date.now() - startTime,
          status: "HEALTHY",
          model: resolved.modelId,
          promptTokens: response.usage?.promptTokens,
          completionTokens: response.usage?.completionTokens,
          totalTokens: response.usage?.totalTokens
        }).catch((e: any) => console.error(e));

        return response;
      } catch (e: any) {
        const status = adapter.classifyError(e);
        const { updateKeyStats } = require("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: false,
          latencyMs: Date.now() - startTime,
          status,
          model: resolved.modelId,
          error: e.message
        }).catch((e2: any) => console.error(e2));

        if (status === "MODEL_NOT_FOUND" && attempt === 1) {
           // Invalidate cache and retry once
           const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
           const redis = getRedisClient();
           if (redis && redis.status === "ready") {
             await redis.del(cacheKey);
           }
           resolved = await this.selectModel(initialResolved, req);
           continue;
        }

        throw e;
      }
    }
    throw new Error("Failed after retries");
  }

  static async *executeStream(req: RoutingRequirement, messages: any[], temperature?: number) {
    const initialResolved = await this.resolveCredential(req);
    let resolved = await this.selectModel(initialResolved, req);
    const adapter = registry.getAdapter(resolved.provider);
    
    let attempt = 0;
    while (attempt < 2) {
      attempt++;
      const startTime = Date.now();
      try {
        const stream = adapter.generateChatStream({
          messages,
          temperature,
          model: resolved
        });
        
        yield* stream;

        const { updateKeyStats } = require("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: true,
          latencyMs: Date.now() - startTime,
          status: "HEALTHY",
          model: resolved.modelId
        }).catch((e: any) => console.error(e));
        return; // Success, exit
      } catch (e: any) {
        const status = adapter.classifyError(e);
        const { updateKeyStats } = require("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: false,
          latencyMs: Date.now() - startTime,
          status,
          model: resolved.modelId,
          error: e.message
        }).catch((e2: any) => console.error(e2));

        if (status === "MODEL_NOT_FOUND" && attempt === 1) {
           // Invalidate cache and retry once
           const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
           const redis = getRedisClient();
           if (redis && redis.status === "ready") {
             await redis.del(cacheKey);
           }
           resolved = await this.selectModel(initialResolved, req);
           continue;
        }
        throw e;
      }
    }
    throw new Error("Failed after retries");
  }
}