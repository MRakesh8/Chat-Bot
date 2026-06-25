/**
 * @file index.ts
 * @description Barrel exports and singleton instances for the context engine.
 */

// Re-export types
export * from "./types";

// Re-export modules
export { validateWebsiteContext } from "./context-validator";
export { DeltaReconstructor } from "./delta-reconstructor";
export { ContextFuser } from "./context-fuser";
export { buildContextAwarePrompt } from "./prompt-builder";
export { SessionMemoryStore, sessionMemoryStore } from "./session-memory";

// Singleton instances
import { DeltaReconstructor } from "./delta-reconstructor";
import { ContextFuser } from "./context-fuser";

export const deltaReconstructor = new DeltaReconstructor();
export const contextFuser = new ContextFuser();
