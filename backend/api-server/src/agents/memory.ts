import { db } from "@workspace/db";
import { websiteMemory } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { BaseAgent, AgentContext, AgentResult } from "./base";

export class MemoryAgent extends BaseAgent {
  constructor() {
    super("MemoryAgent");
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    try {
      const { sessionId, payload } = context;

      if (!payload) {
        // Fetch current memory
        const records = await db.select().from(websiteMemory).where(eq(websiteMemory.sessionId, sessionId));
        return {
          success: true,
          data: records.length > 0 ? records[0].state : {},
        };
      }

      // Update memory
      const existing = await db.select().from(websiteMemory).where(eq(websiteMemory.sessionId, sessionId));
      let state = payload;

      if (existing.length > 0) {
        // Merge state
        state = { ...(existing[0].state as any), ...(payload as any) };
        await db.update(websiteMemory).set({ state, updatedAt: new Date() }).where(eq(websiteMemory.sessionId, sessionId));
      } else {
        await db.insert(websiteMemory).values({
          sessionId,
          state,
        });
      }

      return {
        success: true,
        data: state,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
