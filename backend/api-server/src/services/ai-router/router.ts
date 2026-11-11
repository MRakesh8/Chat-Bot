import { db, projectApiKeys, userApiKeys, crypto } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import nodeCrypto from "crypto";
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

const CATALOG_L1_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CATALOG_L1_ENTRIES = 500;

export class UniversalRouterService {
  private static catalogL1Cache = new Map<string, { catalog: NormalizedModel[]; expiresAt: number }>();
  private static catalogInFlight = new Map<string, Promise<NormalizedModel[]>>();

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

  private static getCatalogL1Key(resolved: ResolvedModel): string {
    const keyFingerprint = nodeCrypto
      .createHash("sha256")
      .update(resolved.credential.apiKey || "")
      .digest("hex")
      .slice(0, 12);
    return `${resolved.provider}:${resolved.credential.id}:${keyFingerprint}:${resolved.credential.baseUrl || "default"}`;
  }

  private static async invalidateCatalogCache(resolved: ResolvedModel): Promise<void> {
    this.catalogL1Cache.delete(this.getCatalogL1Key(resolved));
    const cacheKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
    const redis = getRedisClient();
    if (redis && redis.status === "ready") {
      try {
        await redis.del(cacheKey);
      } catch {
        // Ignore Redis deletion failures
      }
    }
  }

  private static sortKeys<T extends { provider: string; isPrimary?: boolean | null }>(
    rows: T[],
    preferredProvider?: string
  ): T[] {
    return [...rows].sort((a, b) => {
      if (preferredProvider) {
        if (a.provider === preferredProvider && b.provider !== preferredProvider) return -1;
        if (b.provider === preferredProvider && a.provider !== preferredProvider) return 1;
      }
      return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0);
    });
  }

  /**
   * Resolves all eligible candidate credentials across Project -> User -> System -> Env tiers.
   * Executes DB tier queries in parallel while preserving strict precedence order.
   * Only decryptable, valid keys are returned. Invalid or un-decryptable keys are safely skipped.
   */
  static async resolveCandidates(req: RoutingRequirement): Promise<ResolvedModel[]> {
    if (req.preResolvedCandidates && req.preResolvedCandidates.length > 0) {
      return req.preResolvedCandidates.map((cand) => ({
        ...cand,
        modelId: req.preferredModel || cand.modelId,
      }));
    }

    const { projectId, userId, preferredProvider, preferredModel } = req;
    const candidates: ResolvedModel[] = [];
    const seenKeys = new Set<string>();

    const addCandidate = (cand: ResolvedModel) => {
      if (cand.credential.apiKey && !seenKeys.has(cand.credential.apiKey)) {
        seenKeys.add(cand.credential.apiKey);
        candidates.push(cand);
      }
    };

    const hasProjectTier = Boolean(
      projectId && projectId !== "demo" && projectId !== "00000000-0000-4000-8000-000000000000"
    );
    const hasUserTier = Boolean(userId && userId !== "system");

    const projectKeysPromise = hasProjectTier
      ? db
          .select()
          .from(projectApiKeys)
          .where(and(eq(projectApiKeys.projectId, projectId!), eq(projectApiKeys.isEnabled, true)))
          .catch((e) => {
            console.warn("[AI-ROUTER] Failed to query project keys:", e);
            return [] as any[];
          })
      : Promise.resolve([] as any[]);

    // Fetch User DB keys and System DB keys in a single parallel DB query
    const userAndSystemKeysPromise = db
      .select()
      .from(userApiKeys)
      .where(
        hasUserTier
          ? and(eq(userApiKeys.isEnabled, true), or(eq(userApiKeys.userId, userId!), isNull(userApiKeys.userId)))
          : and(eq(userApiKeys.isEnabled, true), isNull(userApiKeys.userId))
      )
      .catch((e) => {
        console.warn("[AI-ROUTER] Failed to query user/system keys:", e);
        return [] as any[];
      });

    const [pKeys, combinedUserKeys] = await Promise.all([projectKeysPromise, userAndSystemKeysPromise]);

    // Tier 1: Project API Keys
    if (pKeys.length > 0) {
      for (const match of this.sortKeys(pKeys, preferredProvider)) {
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

    // Tier 2: User API Keys
    if (hasUserTier) {
      const uKeys = combinedUserKeys.filter((k: any) => k.userId === userId);
      for (const match of this.sortKeys(uKeys, preferredProvider)) {
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

    // Tier 3: Global System DB Keys
    const systemKeys = combinedUserKeys.filter((k: any) => k.userId === null);
    for (const match of this.sortKeys(systemKeys, preferredProvider)) {
      const decrypted = crypto.decrypt(match.encryptedKey);
      if (this.isValidKey(decrypted)) {
        addCandidate({
          provider: match.provider,
          modelId: preferredModel || "default",
          credential: { id: match.id, apiKey: decrypted, type: "system" }
        });
      }
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
   * Refreshes the model catalog utilizing L1 in-memory cache, in-flight coalescing, and Redis L2 cache.
   */
  static async getCatalog(resolved: ResolvedModel, signal?: AbortSignal): Promise<NormalizedModel[]> {
    const l1Key = this.getCatalogL1Key(resolved);
    const cachedL1 = this.catalogL1Cache.get(l1Key);
    if (cachedL1 && cachedL1.expiresAt > Date.now()) {
      return cachedL1.catalog;
    }

    const inFlight = this.catalogInFlight.get(l1Key);
    if (inFlight) {
      return inFlight;
    }

    const loadPromise = (async () => {
      const redisKey = `raghub:model_catalog:${resolved.provider}:${resolved.credential.id}`;
      const redis = getRedisClient();

      if (redis && redis.status === "ready") {
        try {
          const cached = await redis.get(redisKey);
          if (cached) {
            const parsed = JSON.parse(cached) as NormalizedModel[];
            this.setCatalogL1(l1Key, parsed);
            return parsed;
          }
        } catch {
          // Proceed to provider discovery on Redis read/parse error
        }
      }

      const adapter = registry.getAdapter(resolved.provider);
      const catalog = await adapter.discoverModels(resolved.credential.apiKey, resolved.credential.baseUrl, signal);

      this.setCatalogL1(l1Key, catalog);
      if (redis && redis.status === "ready") {
        redis.setex(redisKey, 3600, JSON.stringify(catalog)).catch(() => {});
      }

      return catalog;
    })().finally(() => {
      this.catalogInFlight.delete(l1Key);
    });

    this.catalogInFlight.set(l1Key, loadPromise);
    return loadPromise;
  }

  private static setCatalogL1(key: string, catalog: NormalizedModel[]): void {
    if (this.catalogL1Cache.size >= MAX_CATALOG_L1_ENTRIES && !this.catalogL1Cache.has(key)) {
      const oldestKey = this.catalogL1Cache.keys().next().value;
      if (oldestKey) this.catalogL1Cache.delete(oldestKey);
    }
    this.catalogL1Cache.set(key, { catalog, expiresAt: Date.now() + CATALOG_L1_TTL_MS });
  }

  /**
   * Matches a model against capabilities, skipping excluded models (e.g., after 404 MODEL_NOT_FOUND).
   */
  static async selectModel(
    resolved: ResolvedModel,
    req: RoutingRequirement,
    excludeModels?: Set<string>,
    signal?: AbortSignal
  ): Promise<ResolvedModel> {
    const catalog = await this.getCatalog(resolved, signal);
    
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

  /**
   * Fast initial model selection: if a project key already stores an explicit model ID
   * for standard chat/streaming, skip the cold /models discovery HTTP roundtrip and rely on
   * 404 MODEL_NOT_FOUND auto-repair if the stored model has been deprecated.
   */
  private static async resolveInitialModel(
    candidate: ResolvedModel,
    req: RoutingRequirement,
    excludeModels: Set<string>,
    signal?: AbortSignal
  ): Promise<ResolvedModel> {
    const needsExtendedCapabilities = Boolean(
      req.capabilities.vision ||
      req.capabilities.tools ||
      req.capabilities.reasoning ||
      req.capabilities.audio
    );
    if (
      candidate.modelId &&
      candidate.modelId !== "default" &&
      candidate.credential.type === "project" &&
      !excludeModels.has(candidate.modelId) &&
      !needsExtendedCapabilities
    ) {
      return candidate;
    }
    return this.selectModel(candidate, req, excludeModels, signal);
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
    const hasPreResolved = Boolean(req.preResolvedCandidates && req.preResolvedCandidates.length > 0);
    const resolveStart = performance.now();
    const candidates = hasPreResolved
      ? req.preResolvedCandidates!.map((cand) => ({
          ...cand,
          modelId: req.preferredModel || cand.modelId,
        }))
      : await this.resolveCandidates(req);
    if (!hasPreResolved) {
      req.onTiming?.("api_key_resolution", Math.round(performance.now() - resolveStart));
    }
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
      if (options?.signal?.aborted) {
        throw new Error("Request was aborted");
      }
      const candidate = candidates[cIdx];
      let resolvedCandidate: ResolvedModel;
      try {
        resolvedCandidate = await this.resolveInitialModel(candidate, req, excludeModels, options?.signal);
      } catch (err: any) {
        if (options?.signal?.aborted) throw new Error("Request was aborted");
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
          throw new Error(options?.signal?.aborted ? "Request was aborted" : "Request deadline exceeded or aborted");
        }
        const startTime = Date.now();
        try {
          const response = await adapter.generateChat({
            messages,
            temperature,
            model: resolvedCandidate,
            signal: options?.signal,
            disableThinking: req.disableThinking
          });

          if (wasRepaired) {
            await this.persistRepairedModel(candidate, resolvedCandidate, originalModelId);
          }

          import("../api-health").then(({ updateKeyStats }) => {
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
          }).catch(() => {});

          return response;
        } catch (e: any) {
          if (options?.signal?.aborted) {
            throw new Error("Request was aborted");
          }
          lastError = e;
          const status = adapter.classifyError(e);
          import("../api-health").then(({ updateKeyStats }) => {
            updateKeyStats({
              key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
              success: false,
              latencyMs: Date.now() - startTime,
              status: status as any,
              model: resolvedCandidate.modelId,
              error: e.message
            }).catch((e2: any) => console.error(e2));
          }).catch(() => {});

          // 1. Model Not Found -> auto substitute once
          if (status === "MODEL_NOT_FOUND" && attempt === 0) {
            if (resolvedCandidate.modelId) excludeModels.add(resolvedCandidate.modelId);
            await this.invalidateCatalogCache(resolvedCandidate);
            try {
              const fresh = { ...candidate, modelId: "default" };
              resolvedCandidate = await this.selectModel(fresh, req, excludeModels, options?.signal);
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
            if (canSleep && !options?.signal?.aborted) {
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
    const hasPreResolved = Boolean(req.preResolvedCandidates && req.preResolvedCandidates.length > 0);
    const resolveStart = performance.now();
    const candidates = hasPreResolved
      ? req.preResolvedCandidates!.map((cand) => ({
          ...cand,
          modelId: req.preferredModel || cand.modelId,
        }))
      : await this.resolveCandidates(req);
    if (!hasPreResolved) {
      req.onTiming?.("api_key_resolution", Math.round(performance.now() - resolveStart));
    }
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
      if (options?.signal?.aborted) {
        return;
      }
      const candidate = candidates[cIdx];
      let resolvedCandidate: ResolvedModel;
      try {
        resolvedCandidate = await this.resolveInitialModel(candidate, req, excludeModels, options?.signal);
      } catch (err: any) {
        if (options?.signal?.aborted) return;
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
        if (options?.signal?.aborted) {
          return;
        }
        if (Date.now() >= deadline) {
          throw new Error("Request deadline exceeded or aborted");
        }
        const startTime = Date.now();
        const streamPerfStart = performance.now();
        let ttftRecorded = false;
        let chunkCount = 0;
        try {
          req.onTiming?.("provider_request_start", 0, {
            provider: resolvedCandidate.provider,
            model: resolvedCandidate.modelId,
          });
          const stream = adapter.generateChatStream({
            messages,
            temperature,
            model: resolvedCandidate,
            signal: options?.signal,
            disableThinking: req.disableThinking
          });

          for await (const chunk of stream) {
            if (options?.signal?.aborted) {
              return;
            }
            if (Date.now() >= deadline && chunkCount === 0) {
              throw new Error("Request deadline exceeded before first token");
            }
            if (chunk?.text && !ttftRecorded) {
              ttftRecorded = true;
              req.onTiming?.("provider_ttft", Math.round(performance.now() - streamPerfStart), {
                provider: resolvedCandidate.provider,
                model: resolvedCandidate.modelId,
              });
            }
            chunkCount++;
            yield chunk;
          }

          if (options?.signal?.aborted) {
            return;
          }

          req.onTiming?.("provider_generation", Math.round(performance.now() - streamPerfStart), {
            provider: resolvedCandidate.provider,
            model: resolvedCandidate.modelId,
            chunkCount,
          });

          if (wasRepaired) {
            await this.persistRepairedModel(candidate, resolvedCandidate, originalModelId);
          }

          import("../api-health").then(({ updateKeyStats }) => {
            updateKeyStats({
              key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
              success: true,
              latencyMs: Date.now() - startTime,
              status: "HEALTHY",
              model: resolvedCandidate.modelId
            }).catch((e: any) => console.error(e));
          }).catch(() => {});

          return; // Stream finished successfully
        } catch (e: any) {
          if (options?.signal?.aborted) {
            return;
          }
          lastError = e;
          const status = adapter.classifyError(e);
          import("../api-health").then(({ updateKeyStats }) => {
            updateKeyStats({
              key: { id: resolvedCandidate.credential.id, type: resolvedCandidate.credential.type, provider: resolvedCandidate.provider, rawDbKey: {} },
              success: false,
              latencyMs: Date.now() - startTime,
              status: status as any,
              model: resolvedCandidate.modelId,
              error: e.message
            }).catch((e2: any) => console.error(e2));
          }).catch(() => {});

          // If chunks were already yielded, cannot retry or failover without corrupting client output
          if (chunkCount > 0) {
            throw e;
          }

          // 1. Model Not Found -> auto substitute once if chunkCount === 0
          if (status === "MODEL_NOT_FOUND" && attempt === 0) {
            if (resolvedCandidate.modelId) excludeModels.add(resolvedCandidate.modelId);
            await this.invalidateCatalogCache(resolvedCandidate);
            try {
              const fresh = { ...candidate, modelId: "default" };
              resolvedCandidate = await this.selectModel(fresh, req, excludeModels, options?.signal);
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
            if (canSleep && !options?.signal?.aborted) {
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