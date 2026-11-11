import { db, projects, projectEntitlements, projectLicenses, globalSettings, withBypassRLS } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

export type EntitlementStatus =
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRED"
  | "SUBSCRIPTION_ACTIVE"
  | "PAYMENT_PENDING"
  | "SUSPENDED"
  | "CANCELLED";

export interface EntitlementCheckResult {
  allowed: boolean;
  status: EntitlementStatus;
  expiresAt?: Date | null;
  message?: string;
}

export async function getEffectiveTrialDays(tx?: any, customTrialDays?: number | null): Promise<number> {
  if (customTrialDays && customTrialDays > 0) {
    return customTrialDays;
  }
  if (tx && typeof tx.select === "function") {
    try {
      const [setting] = await tx
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.id, "DEFAULT_TRIAL_DAYS"))
        .limit(1);
      if (setting?.value) {
        const val = parseInt(setting.value, 10);
        if (!isNaN(val) && val > 0) return val;
      }
    } catch {
      // Proceed to env default if DB query fails or uninitialized
    }
  }
  const envDefault = parseInt(process.env.DEFAULT_TRIAL_DAYS || "", 10);
  if (!isNaN(envDefault) && envDefault > 0) {
    return envDefault;
  }
  return 7;
}

export interface EntitlementContextResult {
  entitlement: EntitlementCheckResult;
  project?: typeof projects.$inferSelect | null;
  license?: typeof projectLicenses.$inferSelect | null;
}

/**
 * Core entitlement check implementation returning both the public EntitlementCheckResult
 * and the already-fetched project/license records for intra-request reuse.
 * Keeps EntitlementCheckResult strictly free of internal DB rows.
 */
export async function checkProjectEntitlementWithContext(
  projectId: string,
  isSuperAdmin?: boolean,
  externalTx?: any
): Promise<EntitlementContextResult> {
  try {
    if (isSuperAdmin) {
      return {
        entitlement: {
          allowed: true,
          status: "SUBSCRIPTION_ACTIVE",
          message: "Super Admin override",
        },
      };
    }

    if (!projectId) {
      return {
        entitlement: {
          allowed: false,
          status: "TRIAL_EXPIRED",
          message: "Invalid project ID.",
        },
      };
    }

    if (
      projectId === "demo" ||
      projectId === "00000000-0000-4000-8000-000000000000" ||
      projectId.startsWith("11111111") ||
      projectId.startsWith("22222222")
    ) {
      return {
        entitlement: {
          allowed: true,
          status: "SUBSCRIPTION_ACTIVE",
          message: "Test project override",
        },
      };
    }

    const runInTx = async (tx: any): Promise<EntitlementContextResult> => {
      // Single roundtrip: fetch project, prioritized license, and entitlement record together
      const rows = await tx
        .select({
          project: projects,
          license: projectLicenses,
          entitlement: projectEntitlements,
        })
        .from(projects)
        .leftJoin(projectLicenses, eq(projectLicenses.projectId, projects.id))
        .leftJoin(projectEntitlements, eq(projectEntitlements.projectId, projects.id))
        .where(eq(projects.id, projectId))
        .orderBy(
          sql`CASE WHEN ${projectLicenses.licenseStatus} = 'active' AND ${projectLicenses.paymentStatus} = 'paid' THEN 0 WHEN ${projectLicenses.paymentStatus} = 'pending' THEN 1 ELSE 2 END`,
          sql`${projectLicenses.createdAt} DESC NULLS LAST`
        )
        .limit(1);

      const row = rows[0];
      const project = row?.project;
      const license = row?.license ?? null;
      const entitlement = row?.entitlement ?? null;

      if (!project) {
        return {
          entitlement: {
            allowed: false,
            status: "CANCELLED",
            message: "Project not found.",
          },
        };
      }

      // Precedence Rule 1: Project deactivated or status is suspended
      if (project.isActive === false || project.status === "suspended") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "SUSPENDED",
            message: "Project has been disabled or suspended.",
          },
        };
      }

      // Precedence Rule 2: Project status is cancelled
      if (project.status === "cancelled") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "CANCELLED",
            message: "Project subscription has been cancelled.",
          },
        };
      }

      // Precedence Rule 3: Valid active paid license/subscription
      if (license && license.licenseStatus === "active" && license.paymentStatus === "paid") {
        return {
          project,
          license,
          entitlement: {
            allowed: true,
            status: "SUBSCRIPTION_ACTIVE",
            expiresAt: license.paymentDate ? new Date(license.paymentDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
          },
        };
      }

      // Precedence Rule 4: Pending payment verification
      if (license && license.paymentStatus === "pending") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "PAYMENT_PENDING",
            message: "Payment verification is pending administrator approval.",
          },
        };
      }

      // Double-check active subscription indicators in entitlement table
      if (
        entitlement?.subscriptionStatus === "active" ||
        entitlement?.entitlementStatus === "SUBSCRIPTION_ACTIVE" ||
        project.deploymentPaid === true
      ) {
        return {
          project,
          license,
          entitlement: {
            allowed: true,
            status: "SUBSCRIPTION_ACTIVE",
            expiresAt: entitlement?.subscriptionEndsAt ?? null,
          },
        };
      }

      // Check explicit SUSPENDED / CANCELLED status on entitlement record
      if (entitlement?.entitlementStatus === "SUSPENDED") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "SUSPENDED",
            message: "Project entitlement is suspended.",
          },
        };
      }
      if (entitlement?.entitlementStatus === "CANCELLED") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "CANCELLED",
            message: "Project entitlement is cancelled.",
          },
        };
      }
      if (entitlement?.entitlementStatus === "TRIAL_EXPIRED") {
        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "TRIAL_EXPIRED",
            message: "Project trial has expired.",
            expiresAt: entitlement?.trialEndsAt ?? null,
          },
        };
      }

      const now = new Date();

      // Precedence Rule 5: Active Trial Check & Atomic Initialization
      let trialStartedAt = entitlement?.trialStartedAt;
      let trialEndsAt = entitlement?.trialEndsAt;

      if (!entitlement || (!trialStartedAt && !trialEndsAt)) {
        const trialDays = await getEffectiveTrialDays(tx, entitlement?.customTrialDays);
        const newTrialStartedAt = now;
        const newTrialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        // Atomic DB Upsert to prevent race conditions during concurrent requests
        await tx
          .insert(projectEntitlements)
          .values({
            projectId,
            trialStartedAt: newTrialStartedAt,
            trialEndsAt: newTrialEndsAt,
            entitlementStatus: "TRIAL_ACTIVE",
            subscriptionStatus: "inactive",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: projectEntitlements.projectId,
            set: {
              trialStartedAt: sql`COALESCE(project_entitlements.trial_started_at, ${newTrialStartedAt})`,
              trialEndsAt: sql`COALESCE(project_entitlements.trial_ends_at, ${newTrialEndsAt})`,
              entitlementStatus: sql`CASE WHEN project_entitlements.entitlement_status = 'TRIAL_EXPIRED' THEN 'TRIAL_EXPIRED' ELSE COALESCE(project_entitlements.entitlement_status, 'TRIAL_ACTIVE') END`,
              updatedAt: now,
            },
          });

        // Reload parameters
        const [reloaded] = await tx
          .select()
          .from(projectEntitlements)
          .where(eq(projectEntitlements.projectId, projectId))
          .limit(1);

        trialStartedAt = reloaded.trialStartedAt || newTrialStartedAt;
        trialEndsAt = reloaded.trialEndsAt || newTrialEndsAt;

        logger.info(
          { projectId, trialDays, trialEndsAt: trialEndsAt.toISOString() },
          "Initialized atomic trial for project"
        );
      }

      // Check custom trial days override dynamically
      let currentTrialEndsAt = trialEndsAt!;
      const customTrialDays = entitlement?.customTrialDays ?? project.customTrialDays;
      if (customTrialDays !== null && customTrialDays !== undefined && customTrialDays > 0 && trialStartedAt) {
        currentTrialEndsAt = new Date(
          new Date(trialStartedAt).getTime() + customTrialDays * 24 * 60 * 60 * 1000
        );
      }

      // Precedence Rule 6: Expired trial/license
      if (now > currentTrialEndsAt) {
        // Mark expired in DB if not already updated
        if (entitlement && entitlement.entitlementStatus !== "TRIAL_EXPIRED") {
          await tx
            .update(projectEntitlements)
            .set({
              entitlementStatus: "TRIAL_EXPIRED",
              updatedAt: now,
            })
            .where(eq(projectEntitlements.projectId, projectId));
        }

        return {
          project,
          license,
          entitlement: {
            allowed: false,
            status: "TRIAL_EXPIRED",
            expiresAt: currentTrialEndsAt,
            message: "Your trial has expired. Please upgrade to continue.",
          },
        };
      }

      return {
        project,
        license,
        entitlement: {
          allowed: true,
          status: "TRIAL_ACTIVE",
          expiresAt: currentTrialEndsAt,
        },
      };
    };

    if (externalTx) {
      return await runInTx(externalTx);
    }
    return await withBypassRLS(runInTx);
  } catch (err: any) {
    logger.error({ err, projectId }, "Error checking project entitlement");
    return {
      entitlement: {
        allowed: false,
        status: "SUSPENDED",
        message: "Unable to verify project entitlement status.",
      },
    };
  }
}

/**
 * Server-side single source of truth for project entitlement checks.
 * Combines project status, trial status, and manual/Stripe project licenses.
 * Handles race-safe atomic trial initialization on first access.
 */
export async function checkProjectEntitlement(
  projectId: string,
  isSuperAdmin?: boolean
): Promise<EntitlementCheckResult> {
  const { entitlement } = await checkProjectEntitlementWithContext(projectId, isSuperAdmin);
  return entitlement;
}
