import { db, projectApiKeys, userApiKeys, crypto } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { RoutingRequirement, ResolvedModel, NormalizedModel } from "./types";
import { registry } from "./registry";
import { getRedisClient } from "../../lib/redis";
import {
  RetryOptions,
  AllAiProvidersFailedError,
  isTransientError,
  isPermanentCredentialError,
  extractRetryAfterMs,
  calculateBackoffMs,
  sleepWithDeadline
} from "./retry";

export type { RetryOptions };
export { AllAiProvidersFailedError };

export class UniversalRouterService {
  /**
   * Helper to check if a decrypted API key is non-empty and not raw un-decrypted ciphertext.
   */
  static isValidKey(key: string | null | undefined): boolean {
    if (!key || typeof key !== "string" || !key.trim()) return false;
    if (key.split(":").length === 3 && /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i.test(key)) {
      return false;
    }
    return true;
  }

  /**
   * Resolves all eligible candidate credentials across Project -> User -> System -> Env tiers.
   * Only decryptable, valid keys are returned. Invalid or un-decryptable keys are safely skipped.
   * Candidates matching preferredProvider appear first, followed by fallback providers.
   */
  static async resolveCandidates(req: RoutingRequirement): Promise<ResolvedModel[]> {
    const { projectId, userId, preferredProvider, preferredModel } = req;
    const candidates: ResolvedModel[] = [];
    const seenKeys = new Set<string>();

    const addCandidate = (cand: ResolvedModel) => {
      if (cand.credential.apiKey && !seenKeys.has(cand.credential.apiKey)) {
        seenKeys.add(cand.credential.apiKey);
        candidates.push(cand);
      }
    };

    // Tier 1: Project API Keys
    if (projectId && projectId !== "demo" && projectId !== "00000000-0000-4000-8000-000000000000") {
      try {
        const pKeys = await db.select().from(projectApiKeys).where(
          and(eq(projectApiKeys.projectId, projectId), eq(projectApiKeys.isEnabled, true))
        );
        if (pKeys.length > 0) {
          const sorted = [...pKeys].sort((a, b) => {
            if (preferredProvider) {
              if (a.provider === preferredProvider && b.provider !== preferredProvider) return -1;
              if (b.provider === preferredProvider && a.provider !== preferredProvider) return 1;
            }
            return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
          });
          for (const match of sorted) {
            const decrypted = crypto.decrypt(match.encryptedKey);
            if (this.isValidKey(decrypted)) {
              addCandidate({
                provider: match.provider,
                modelId: preferredModel || match.model || "default",
                credential: { id: match.id, apiKey: decrypted, type: "project" }
              });
            }
          }
        }
      } catch (e) {
        console.warn("[AI-ROUTER] Failed to query project keys:", e);
      }
    }

    // Tier 2: User API Keys
    if (userId && userId !== "system") {
      try {
        const uKeys = await db.select().from(userApiKeys).where(
          and(eq(userApiKeys.userId, userId), eq(userApiKeys.isEnabled, true))
        );
        if (uKeys.length > 0) {
          const sorted = [...uKeys].sort((a, b) => {
            if (preferredProvider) {
              if (a.provider === preferredProvider && b.provider !== preferredProvider) return -1;
              if (b.provider === preferredProvider && a.provider !== preferredProvider) return 1;
            }
            return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
          });
          for (const match of sorted) {
            const decrypted = crypto.decrypt(match.encryptedKey);
            if (this.isValidKey(decrypted)) {
              addCandidate({
                provider: match.provider,
                modelId: preferredModel || "default",
                credential: { id: match.id, apiKey: decrypted, type: "user" }
              });
            }
          }
        }
      } catch (e) {
        console.warn("[AI-ROUTER] Failed to query user keys:", e);
      }
    }

    // Tier 3: Global System DB Keys
    try {
      const systemKeys = await db.select().from(userApiKeys).where(
        and(eq(userApiKeys.isEnabled, true), isNull(userApiKeys.userId))
      );
      if (systemKeys.length > 0) {
        const sorted = [...systemKeys].sort((a, b) => {
          if (preferredProvider) {
            if (a.provider === preferredProvider && b.provider !== preferredProvider) return -1;
            if (b.provider === preferredProvider && a.provider !== preferredProvider) return 1;
          }
          return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
        });
        for (const match of sorted) {
          const decrypted = crypto.decrypt(match.encryptedKey);
          if (this.isValidKey(decrypted)) {
            addCandidate({
              provider: match.provider,
              modelId: preferredModel || "default",
              credential: { id: match.id, apiKey: decrypted, type: "system" }
            });
          }
        }
      }
    } catch (e) {
      console.warn("[AI-ROUTER] Failed to query system DB keys:", e);
    }

    // Tier 4: Environment Variable Fallbacks
    const envGeminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    const envOpenaiKey = process.env.OPENAI_API_KEY || process.env.openapi || process.env.OPENAPI;
    const envAnthropicKey = process.env.ANTHROPIC_API_KEY;

    const envCandidates: ResolvedModel[] = [];
    if (this.isValidKey(envGeminiKey)) {
      envCandidates.push({
        provider: "gemini",
        modelId: preferredModel || "default",
        credential: { id: "env_gemini_key", apiKey: envGeminiKey!, type: "system" }
      });
    }
    if (this.isValidKey(envOpenaiKey)) {
      envCandidates.push({
        provider: "openai",
        modelId: preferredModel || "default",
        credential: { id: "env_openai_key", apiKey: envOpenaiKey!, type: "system" }
      });
    }
    if (this.isValidKey(envAnthropicKey)) {
      envCandidates.push({
        provider: "anthropic",
        modelId: preferredModel || "default",
        credential: { id: "env_anthropic_key", apiKey: envAnthropicKey!, type: "system" }
      });
    }

    envCandidates.sort((a, b) => {
      if (preferredProvider) {
        if (a.provider === preferredProvider && b.provider !== preferredProvider) return -1;
        if (b.provider === preferredProvider && a.provider !== preferredProvider) return 1;
      }
      return 0;
    });

    for (const ec of envCandidates) {
      addCandidate(ec);
    }

    return candidates;
  }

  /**
   * Resolves the authoritative primary credential based on Routing Hierarchy.
   */
  static async resolveCredential(req: RoutingRequirement): Promise<ResolvedModel> {
    const candidates = await this.resolveCandidates(req);
    if (candidates.length > 0) {
      return candidates[0];
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
    // Dynamic 'default' model resolution from catalog is standard operation, not a repair
    if (!originalModelId || originalModelId === "default" || originalModelId === finalResolved.modelId) return;

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
        details: JSON.stringify({
          provider: initialResolved.provider,
          originalModel: originalModelId || initialResolved.modelId,
          substitutedModel: finalResolved.modelId,
          credentialType: initialResolved.credential.type
        })
      } as any);
      
      console.log(`[AI-ROUTER] Automatically substituted model ${originalModelId || initialResolved.modelId} -> ${finalResolved.modelId} for ${initialResolved.credential.type} key ${initialResolved.credential.id}`);
    } catch (e) {
      console.error("[AI-ROUTER] Failed to persist repaired model", e);
    }
  }

  static async executeChat(req: RoutingRequirement, messages: any[], temperature?: number, options?: RetryOptions) {
    const candidates = await this.resolveCandidates(req);
    if (candidates.length === 0) {
      throw new Error("No valid AI provider credential found for this request.");
    }

    const maxRetries = options?.maxRetries ?? 2;
    const baseDelayMs = options?.baseDelayMs ?? 300;
    const maxDelayMs = options?.maxDelayMs ?? 2000;
    const jitterMs = options?.jitterMs ?? 200;
    const deadline = Date.now() + (options?.deadlineMs ?? 20000);

    let lastError: any = null;
    const excludeModels = new Set<string>();

    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const candidate = candidates[cIdx];
      let resolvedCandidate: ResolvedModel;
      try {
        resolvedCandidate = await this.selectModel(candidate, req, excludeModels);
      } catch (err: any) {
        lastError = err;
        continue;
      }

      let adapter;
      try {
        adapter = registry.getAdapter(resolvedCandidate.provider);
      } catch (err: any) {
        lastError = err;
        continue;
      }

      const originalModelId = resolvedCandidate.modelId;
      let wasRepaired = resolvedCandidate.modelId !== originalModelId;
      let attempt = 0;

      while (attempt <= maxRetries) {
        if (options?.signal?.aborted || Date.now() >= deadline) {
          throw new Error("Request deadline exceeded or aborted");
        }
        const startTime = Date.now();
        try {
          const response = await adapter.generateChat({
            messages,
            temperature,
            model: resolvedCandidate,
            signal: options?.signal
          });

          if (wasRepaired) {
            await this.persistRepairedModel(candidate, resolvedCandidate, originalModelId);
          }

          const { updateKeyStats } = await import("../api-health");
          updateKeyStats({
            key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
            success: true,
            latencyMs: Date.now() - startTime,
            status: "HEALTHY",
            model: resolvedCandidate.modelId,
            promptTokens: response.usage?.promptTokens,
            completionTokens: response.usage?.completionTokens,
            totalTokens: response.usage?.totalTokens
          }).catch((e: any) => console.error(e));

          return response;
        } catch (e: any) {
          lastError = e;
          const status = adapter.classifyError(e);
          const { updateKeyStats } = await import("../api-health");
          updateKeyStats({
            key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
            success: false,
            latencyMs: Date.now() - startTime,
            status: status as any,
            model: resolvedCandidate.modelId,
            error: e.message
          }).catch((e2: any) => console.error(e2));

          // 1. Model Not Found -> auto substitute once
          if (status === "MODEL_NOT_FOUND" && attempt === 0) {
            if (resolvedCandidate.modelId) excludeModels.add(resolvedCandidate.modelId);
            const cacheKey = `raghub:model_catalog:${resolvedCandidate.provider}:${resolvedCandidate.credential.id}`;
            const redis = getRedisClient();
            if (redis && redis.status === "ready") {
              await redis.del(cacheKey);
            }
            try {
              const fresh = { ...candidate, modelId: "default" };
              resolvedCandidate = await this.selectModel(fresh, req, excludeModels);
              wasRepaired = true;
              attempt++;
              continue;
            } catch {
              break;
            }
          }

          // 2. Permanent Credential Failure -> do NOT retry, fail over immediately
          if (isPermanentCredentialError(status, e)) {
            console.warn(`[AI-ROUTER] Credential ${resolvedCandidate.credential.id} (${resolvedCandidate.provider}) permanently rejected. Skipping retries, failing over.`);
            break;
          }

          // 3. Transient error -> bounded exponential backoff retry if attempts remaining and within deadline
          if (isTransientError(status, e) && attempt < maxRetries) {
            const retryAfter = extractRetryAfterMs(e);
            const delay = calculateBackoffMs(attempt, retryAfter, baseDelayMs, maxDelayMs, jitterMs);
            const canSleep = await sleepWithDeadline(delay, deadline);
            if (canSleep) {
              attempt++;
              continue;
            }
          }

          break; // Retries exhausted or non-retryable for this candidate, failover to next candidate
        }
      }
    }

    throw new AllAiProvidersFailedError(
      `All available AI providers failed. Last error: ${lastError?.message || "Unknown error"}`,
      lastError
    );
  }

  static async *executeStream(req: RoutingRequirement, messages: any[], temperature?: number, options?: RetryOptions) {
    const candidates = await this.resolveCandidates(req);
    if (candidates.length === 0) {
      throw new Error("No valid AI provider credential found for this request.");
    }

    const maxRetries = options?.maxRetries ?? 2;
    const baseDelayMs = options?.baseDelayMs ?? 300;
    const maxDelayMs = options?.maxDelayMs ?? 2000;
    const jitterMs = options?.jitterMs ?? 200;
    const deadline = Date.now() + (options?.deadlineMs ?? 20000);

    let lastError: any = null;
    const excludeModels = new Set<string>();

    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const candidate = candidates[cIdx];
      let resolvedCandidate: ResolvedModel;
      try {
        resolvedCandidate = await this.selectModel(candidate, req, excludeModels);
      } catch (err: any) {
        lastError = err;
        continue;
      }

      let adapter;
      try {
        adapter = registry.getAdapter(resolvedCandidate.provider);
      } catch (err: any) {
        lastError = err;
        continue;
      }

      const originalModelId = resolvedCandidate.modelId;
      let wasRepaired = resolvedCandidate.modelId !== originalModelId;
      let attempt = 0;

      while (attempt <= maxRetries) {
        if (options?.signal?.aborted || Date.now() >= deadline) {
          throw new Error("Request deadline exceeded or aborted");
        }
        const startTime = Date.now();
        let chunkCount = 0;
        try {
          const stream = adapter.generateChatStream({
            messages,
            temperature,
            model: resolvedCandidate,
            signal: options?.signal
          });

          for await (const chunk of stream) {
            chunkCount++;
            yield chunk;
          }

          if (wasRepaired) {
            await this.persistRepairedModel(candidate, resolvedCandidate, originalModelId);
          }

          const { updateKeyStats } = await import("../api-health");
          updateKeyStats({
            key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
            success: true,
            latencyMs: Date.now() - startTime,
            status: "HEALTHY",
            model: resolvedCandidate.modelId
          }).catch((e: any) => console.error(e));

          return; // Stream finished successfully
        } catch (e: any) {
          lastError = e;
          const status = adapter.classifyError(e);
          const { updateKeyStats } = await import("../api-health");
          updateKeyStats({
            key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
            success: false,
            latencyMs: Date.now() - startTime,
            status: status as any,
            model: resolvedCandidate.modelId,
            error: e.message
          }).catch((e2: any) => console.error(e2));

          // If chunks were already yielded, cannot retry or failover without corrupting client output
          if (chunkCount > 0) {
            throw e;
          }

          // 1. Model Not Found -> auto substitute once if chunkCount === 0
          if (status === "MODEL_NOT_FOUND" && attempt === 0) {
            if (resolvedCandidate.modelId) excludeModels.add(resolvedCandidate.modelId);
            const cacheKey = `raghub:model_catalog:${resolvedCandidate.provider}:${resolvedCandidate.credential.id}`;
            const redis = getRedisClient();
            if (redis && redis.status === "ready") {
              await redis.del(cacheKey);
            }
            try {
              const fresh = { ...candidate, modelId: "default" };
              resolvedCandidate = await this.selectModel(fresh, req, excludeModels);
              wasRepaired = true;
              attempt++;
              continue;
            } catch {
              break;
            }
          }

          // 2. Permanent credential rejection -> fail over immediately
          if (isPermanentCredentialError(status, e)) {
            console.warn(`[AI-ROUTER] Credential ${resolvedCandidate.credential.id} (${resolvedCandidate.provider}) permanently rejected. Skipping retries, failing over.`);
            break;
          }

          // 3. Transient error -> bounded exponential backoff retry if chunkCount === 0 and within deadline
          if (isTransientError(status, e) && attempt < maxRetries) {
            const retryAfter = extractRetryAfterMs(e);
            const delay = calculateBackoffMs(attempt, retryAfter, baseDelayMs, maxDelayMs, jitterMs);
            const canSleep = await sleepWithDeadline(delay, deadline);
            if (canSleep) {
              attempt++;
              continue;
            }
          }

          break; // Retries exhausted or non-retryable, fail over to next candidate
        }
      }
    }

    throw new AllAiProvidersFailedError(
      `All available AI providers failed. Last error: ${lastError?.message || "Unknown error"}`,
      lastError
    );
  }
}