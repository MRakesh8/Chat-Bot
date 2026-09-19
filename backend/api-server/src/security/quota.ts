import { db, withBypassRLS, withTenantContext } from "@workspace/db";
import { projects, projectLicenses, plans, organizationUsage, usageEvents } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

/**
  * Validates and increments tenant usage counts inside the active billing cycle.
  * Writes to usage_events for audit trail.
  */
export async function checkAndIncrementUsage(
  projectId: string,
  eventType: "message" | "crawl" | "parse" | "action",
  quantity: number = 1,
  isSuperAdmin?: boolean
): Promise<QuotaCheckResult> {
  if (isSuperAdmin) {
    return { allowed: true, reason: "Super Admin bypass" };
  }

  try {
    return await withBypassRLS(async (tx: any) => {
      // 1. Resolve project details & organizationId
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (!project) {
        return { allowed: false, reason: "Project not found" };
      }

      const organizationId = project.organizationId;
      if (!organizationId) {
        // Fallback for unlinked legacy rows: bypass RLS limits
        return { allowed: true };
      }

      // 2. Fetch active paid license to check plan features
      const [license] = await tx
        .select()
        .from(projectLicenses)
        .where(
          and(
            eq(projectLicenses.projectId, projectId),
            eq(projectLicenses.licenseStatus, "active"),
            eq(projectLicenses.paymentStatus, "paid")
          )
        )
        .limit(1);

      let limits = {
        messages: 100, // Trial limit
        crawls: 10,
        actions: 50
      };

      if (license && license.planId) {
        const [plan] = await tx
          .select()
          .from(plans)
          .where(eq(plans.id, license.planId))
          .limit(1);

        if (plan && plan.features) {
          const feat = typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features;
          limits = {
            messages: feat.messagesLimit ?? 10000,
            crawls: feat.crawlsLimit ?? 500,
            actions: feat.actionsLimit ?? 5000
          };
        } else {
          limits = {
            messages: 10000,
            crawls: 500,
            actions: 5000
          };
        }
      }

      // 3. Resolve active billing cycle
      const now = new Date();
      const billingCycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const billingCycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Check / Upsert organization usage record
      let [usageRecord] = await tx
        .select()
        .from(organizationUsage)
        .where(
          and(
            eq(organizationUsage.organizationId, organizationId),
            eq(organizationUsage.billingCycleStart, billingCycleStart)
          )
        )
        .limit(1);

      if (!usageRecord) {
        try {
          const [inserted] = await tx
            .insert(organizationUsage)
            .values({
              organizationId,
              billingCycleStart,
              billingCycleEnd,
              messagesSent: 0,
              crawlCount: 0,
              actionCount: 0,
              updatedAt: now
            })
            .onConflictDoNothing({ target: [organizationUsage.organizationId, organizationUsage.billingCycleStart] })
            .returning();
            
          usageRecord = inserted;
        } catch (e) {
           // ignore
        }
        
        if (!usageRecord) {
           const [fetched] = await tx.select().from(organizationUsage).where(and(eq(organizationUsage.organizationId, organizationId), eq(organizationUsage.billingCycleStart, billingCycleStart))).limit(1);
           usageRecord = fetched;
        }
      }

      // 4. Verify against limits
      let currentVal = 0;
      let limitVal = 0;

      if (eventType === "message") {
        currentVal = usageRecord.messagesSent;
        limitVal = limits.messages;
      } else if (eventType === "crawl") {
        currentVal = usageRecord.crawlCount;
        limitVal = limits.crawls;
      } else if (eventType === "parse" || eventType === "action") {
        currentVal = usageRecord.actionCount;
        limitVal = limits.actions;
      }

      if (currentVal + quantity > limitVal) {
        return {
          allowed: false,
          reason: `Quota exceeded for ${eventType}. Limit: ${limitVal}, Current: ${currentVal}`,
          current: currentVal,
          limit: limitVal
        };
      }

      // 5. Update usage counters atomically
      const sqlIncrement = (col: string) => sql`${sql.raw(col)} + ${quantity}`;
      
      let updateResult;
      
      if (eventType === "message") {
        updateResult = await tx
          .update(organizationUsage)
          .set({ messagesSent: sqlIncrement("messages_sent"), updatedAt: now })
          .where(and(eq(organizationUsage.id, usageRecord.id), sql`messages_sent + ${quantity} <= ${limitVal}`))
          .returning();
      } else if (eventType === "crawl") {
        updateResult = await tx
          .update(organizationUsage)
          .set({ crawlCount: sqlIncrement("crawl_count"), updatedAt: now })
          .where(and(eq(organizationUsage.id, usageRecord.id), sql`crawl_count + ${quantity} <= ${limitVal}`))
          .returning();
      } else if (eventType === "parse" || eventType === "action") {
        updateResult = await tx
          .update(organizationUsage)
          .set({ actionCount: sqlIncrement("action_count"), updatedAt: now })
          .where(and(eq(organizationUsage.id, usageRecord.id), sql`action_count + ${quantity} <= ${limitVal}`))
          .returning();
      }
      
      if (!updateResult || updateResult.length === 0) {
        return {
          allowed: false,
          reason: `Concurrent Quota exceeded for ${eventType}. Limit: ${limitVal}`,
          limit: limitVal
        };
      }

      // 6. Log a usage event
      await tx.insert(usageEvents).values({
        organizationId,
        projectId,
        eventType,
        quantity,
        createdAt: now
      });

      return {
        allowed: true,
        current: currentVal + quantity,
        limit: limitVal
      };
    });
  } catch (err: any) {
    logger.error({ err, projectId, eventType }, "Quota check failed");
    return { allowed: false, reason: "Quota verification failed due to internal error." };
  }
}

/**
 * Refunds quota after a failed server-side tool/action execution.
 */
export async function refundUsage(
  projectId: string,
  eventType: "message" | "crawl" | "parse" | "action",
  quantity: number = 1
): Promise<void> {
  try {
    await withBypassRLS(async (tx: any) => {
      const [project] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project || !project.organizationId) return;
      
      const now = new Date();
      const [usageRecord] = await tx
        .select()
        .from(organizationUsage)
        .where(
          and(
            eq(organizationUsage.organizationId, project.organizationId),
            sql`${organizationUsage.billingCycleStart} <= ${now.toISOString()}`,
            sql`${organizationUsage.billingCycleEnd} >= ${now.toISOString()}`
          )
        )
        .limit(1);

      if (!usageRecord) return;

      const updates: any = { updatedAt: now };
      if (eventType === "message" && usageRecord.messagesSent >= quantity) {
        updates.messagesSent = usageRecord.messagesSent - quantity;
      } else if (eventType === "crawl" && usageRecord.crawlCount >= quantity) {
        updates.crawlCount = usageRecord.crawlCount - quantity;
      } else if ((eventType === "parse" || eventType === "action") && usageRecord.actionCount >= quantity) {
        updates.actionCount = usageRecord.actionCount - quantity;
      }

      await tx.update(organizationUsage).set(updates).where(eq(organizationUsage.id, usageRecord.id));
      
      // Optionally insert a refund event
      await tx.insert(usageEvents).values({
        organizationId: project.organizationId,
        projectId,
        eventType: `${eventType}_refund`,
        quantity: -quantity,
        metadata: { reason: "execution_failed" },
        createdAt: now
      });
    });
  } catch (err) {
    logger.error({ err, projectId, eventType }, "Usage refund failed");
  }
}
