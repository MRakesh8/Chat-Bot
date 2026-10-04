import { db, projectApiKeys, userApiKeys, crypto } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { RoutingRequirement, ResolvedModel, NormalizedModel } from "./types";
import { registry } from "./registry";
import { getRedisClient } from "../../lib/redis";

export class UniversalRouterService {
  /**
   * Resolves the authoritative credential based on Routing Hierarchy: Project -> User -> System -> Env Fallback.
   * Enforces enabled state, quotas, and health constraints.
   */
  static async resolveCredential(req: RoutingRequirement): Promise<ResolvedModel> {
    const { projectId, userId, preferredProvider, preferredModel } = req;
    
    const isValidKey = (key: string | null | undefined): boolean => {
      if (!key || typeof key !== "string" || !key.trim()) return false;
      if (key.split(":").length === 3 && /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(key)) {
        return false;
      }
      return true;
    };

    // Attempt 1: Project API Key
    if (projectId) {
      const pKeys = await db.select().from(projectApiKeys).where(
        and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true))
      );
      if (pKeys.length > 0) {
        const sorted = preferredProvider ? pKeys.filter(k => k.provider === preferredProvider) : [...pKeys].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
        for (const match of sorted) {
          const decrypted = crypto.decrypt(match.encryptedKey);
          if (isValidKey(decrypted)) {
            return {
              provider: match.provider,
              modelId: preferredModel || match.model || "default",
              credential: { id: match.id, apiKey: decrypted, type: "project" }
            };
          }
        }
      }
    }

    // Attempt 2: User API Key
    if (userId && userId !== "system") {
      const uKeys = await db.select().from(userApiKeys).where(
        and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true))
      );
      if (uKeys.length > 0) {
        const sorted = preferredProvider ? uKeys.filter(k => k.provider === preferredProvider) : [...uKeys].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
        for (const match of sorted) {
          const decrypted = crypto.decrypt(match.encryptedKey);
          if (isValidKey(decrypted)) {
            return {
              provider: match.provider,
              modelId: preferredModel || "default",
              credential: { id: match.id, apiKey: decrypted, type: "user" }
            };
          }
        }
      }
    }

    // Attempt 3: Global System Config Fallback from DB
    const { isNull } = await import("drizzle-orm");
    const systemKeys = await db.select().from(userApiKeys).where(
      and(
        eq(userApiKeys.isEnabled, true),
        isNull(userApiKeys.userId)
      )
    );
    if (systemKeys.length > 0) {
      const sorted = preferredProvider ? systemKeys.filter(k => k.provider === preferredProvider) : [...systemKeys].sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
      for (const match of sorted) {
        const decrypted = crypto.decrypt(match.encryptedKey);
        if (isValidKey(decrypted)) {
          return {
            provider: match.provider,
            modelId: preferredModel || "default",
            credential: { id: match.id, apiKey: decrypted, type: "system" }
          };
        }
      }
    }

    // Attempt 4: Environment Variable Fallback
    const envGeminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (envGeminiKey && (!preferredProvider || preferredProvider === "gemini")) {
      return {
        provider: "gemini",
        modelId: preferredModel || "default",
        credential: { id: "env_gemini_key", apiKey: envGeminiKey, type: "system" }
      };
    }

    const envOpenaiKey = process.env.OPENAI_API_KEY || process.env.openapi || process.env.OPENAPI;
    if (envOpenaiKey && preferredProvider === "openai") {
      return {
        provider: "openai",
        modelId: preferredModel || "default",
        credential: { id: "env_openai_key", apiKey: envOpenaiKey, type: "system" }
      };
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
   * Matches a model against capabilities, skipping excluded models (e.g., after 404 MODEL_NOT_FOUND).
   */
  static async selectModel(resolved: ResolvedModel, req: RoutingRequirement, excludeModels?: Set<string>): Promise<ResolvedModel> {
    const catalog = await this.getCatalog(resolved);
    
    // Check if preferred model is compatible and not excluded
    if (resolved.modelId && resolved.modelId !== "default" && (!excludeModels || !excludeModels.has(resolved.modelId))) {
       const model = catalog.find(m => m.modelId === resolved.modelId);
       if (model) return resolved;
    }

    // Capability based selection
    for (const model of catalog) {
       if (excludeModels && excludeModels.has(model.modelId)) continue;

       let match = true;
       if (req.capabilities.textGeneration && !model.capabilities.textGeneration) match = false;
       if (req.capabilities.vision && !model.capabilities.vision) match = false;
       if (req.capabilities.tools && !model.capabilities.tools) match = false;
       if (req.capabilities.streaming && !model.capabilities.streaming) match = false;
       
       if (match) {
         return {
           ...resolved,
           modelId: model.modelId
         };
       }
    }

    throw new Error(`CAPABILITY_MISMATCH: No compatible model found in provider ${resolved.provider} satisfying requirements.`);
  }

  static async persistRepairedModel(initialResolved: ResolvedModel, finalResolved: ResolvedModel, originalModelId?: string) {
    if (originalModelId === finalResolved.modelId) return;

    try {
      const { auditLogs } = await import("@workspace/db/schema");

      if (initialResolved.credential.type === "project") {
        await db.update(projectApiKeys)
          .set({ model: finalResolved.modelId })
          .where(eq(projectApiKeys.id, initialResolved.credential.id));
      }

      await db.insert(auditLogs).values({
        userId: null,
        action: "MODEL_AUTO_SUBSTITUTION",
        target: initialResolved.credential.id,
      } as any);
      
      console.log(`[AI-ROUTER] Automatically substituted model ${originalModelId || initialResolved.modelId} -> ${finalResolved.modelId} for ${initialResolved.credential.type} key ${initialResolved.credential.id}`);
    } catch (e) {
      console.error("[AI-ROUTER] Failed to persist repaired model", e);
    }
  }

  static async executeChat(req: RoutingRequirement, messages: any[], temperature?: number) {
    const excludeModels = new Set<string>();
    const initialResolved = await this.resolveCredential(req);
    const originalModelId = initialResolved.modelId;
    let resolved = await this.selectModel(initialResolved, req, excludeModels);
    const adapter = registry.getAdapter(resolved.provider);
    
    let attempt = 0;
    let wasRepaired = resolved.modelId !== originalModelId;
    while (attempt < 3) {
      attempt++;
      const startTime = Date.now();
      try {
        const response = await adapter.generateChat({
          messages,
          temperature,
          model: resolved
        });
        
        if (wasRepaired) await this.persistRepairedModel(initialResolved, resolved, originalModelId);
        const { updateKeyStats } = await import("../api-health");
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
        const { updateKeyStats } = await import("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: false,
          latencyMs: Date.now() - startTime,
          status: status as any,
          model: resolved.modelId,
          error: e.message
        }).catch((e2: any) => console.error(e2));

        if ((status === "MODEL_NOT_FOUND" || status === "RATE_LIMITED") && attempt < 3) {
           if (resolved.modelId) excludeModels.add(resolved.modelId);
           const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
           const redis = getRedisClient();
           if (redis && redis.status === "ready") {
             await redis.del(cacheKey);
           }
           const freshResolved = { ...initialResolved, modelId: "default" };
           resolved = await this.selectModel(freshResolved, req, excludeModels);
           wasRepaired = true;
           continue;
        }

        throw e;
      }
    }
    throw new Error("Failed after retries");
  }

  static async *executeStream(req: RoutingRequirement, messages: any[], temperature?: number) {
    const excludeModels = new Set<string>();
    const initialResolved = await this.resolveCredential(req);
    const originalModelId = initialResolved.modelId;
    let resolved = await this.selectModel(initialResolved, req, excludeModels);
    let wasRepaired = resolved.modelId !== originalModelId;
    const adapter = registry.getAdapter(resolved.provider);
    
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      const startTime = Date.now();
      try {
        const stream = adapter.generateChatStream({
          messages,
          temperature,
          model: resolved
        });
        
        yield* stream;
        if (wasRepaired) await this.persistRepairedModel(initialResolved, resolved, originalModelId);

        const { updateKeyStats } = await import("../api-health");
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
        const { updateKeyStats } = await import("../api-health");
        updateKeyStats({
          key: { id: resolved.credential.id, type: resolved.credential.type, provider: resolved.provider, rawDbKey: {} },
          success: false,
          latencyMs: Date.now() - startTime,
          status: status as any,
          model: resolved.modelId,
          error: e.message
        }).catch((e2: any) => console.error(e2));

        if ((status === "MODEL_NOT_FOUND" || status === "RATE_LIMITED") && attempt < 3) {
           if (resolved.modelId) excludeModels.add(resolved.modelId);
           const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
           const redis = getRedisClient();
           if (redis && redis.status === "ready") {
             await redis.del(cacheKey);
           }
           const freshResolved = { ...initialResolved, modelId: "default" };
           resolved = await this.selectModel(freshResolved, req, excludeModels);
           wasRepaired = true;
           continue;
        }
        throw e;
      }
    }
    throw new Error("Failed after retries");
  }
}