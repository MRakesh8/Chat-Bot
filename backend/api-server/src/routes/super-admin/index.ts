import { Router } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, withBypassRLS } from "@workspace/db";
import { users, projects, globalSettings, systemErrors, payments, projectLicenses, paymentLogs, projectEntitlements, notifications } from "@workspace/db";
import { logSecurityEvent } from "../../security/middleware";
import { z } from "zod";
import { ai } from "@workspace/integrations-gemini-ai";

const router = Router();

// Middleware to ensure admin or super_admin
router.use((req, res, next) => {
  const dbUser = (req as any).auth?.dbUser;
  if (!dbUser || (dbUser.role !== "super_admin" && dbUser.role !== "admin")) {
    res.status(403).json({ error: "Forbidden: Admin access required" });
    return;
  }
  next();
});

// POST /api/super-admin/payments/:id/approve
router.post("/payments/:id/approve", async (req, res) => {
  try {
    const paymentId = req.params.id;
    const adminId = (req as any).auth?.userId;

    const result = await withBypassRLS(async (tx: any) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.status === "verified") {
        return { success: true, message: "Payment already verified" };
      }

      const [project] = await tx.select().from(projects).where(eq(projects.id, payment.projectId));

      // 1. Update payment status
      await tx.update(payments).set({ status: "verified" }).where(eq(payments.id, paymentId));

      // 2. Log action
      await tx.insert(paymentLogs).values({
        paymentId: paymentId,
        action: "verified",
        performedBy: adminId,
        notes: "Approved manually by Super Admin",
      });

      // 3. Update project license to active
      await tx.update(projectLicenses)
        .set({ 
          licenseStatus: "active", 
          paymentStatus: "paid", 
          approvedBy: adminId, 
          approvedAt: new Date(),
          paymentDate: new Date(),
          updatedAt: new Date()
        })
        .where(eq(projectLicenses.projectId, payment.projectId));

      // 4. Sync to projectEntitlements & update project deploymentPaid
      const now = new Date();
      await tx
        .insert(projectEntitlements)
        .values({
          projectId: payment.projectId,
          subscriptionStatus: "active",
          entitlementStatus: "SUBSCRIPTION_ACTIVE",
          subscriptionStartedAt: now,
          subscriptionEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: projectEntitlements.projectId,
          set: {
            subscriptionStatus: "active",
            entitlementStatus: "SUBSCRIPTION_ACTIVE",
            subscriptionStartedAt: now,
            subscriptionEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: now,
          }
        });

      await tx
        .update(projects)
        .set({ deploymentPaid: true })
        .where(eq(projects.id, payment.projectId));

      // 5. Dispatch Notification Alert
      await tx.insert(notifications).values({
        organizationId: project?.organizationId || "global",
        projectId: payment.projectId,
        type: "billing",
        severity: "info",
        title: "Payment Verified! 🎉",
        message: `Your manual payment reference (${payment.utrTransactionId || "UPI"}) has been verified. 30 days of Pro access has been activated for project "${project?.name || 'Workspace'}".`,
        createdAt: now,
      });

      return { success: true };
    });

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error approving payment");
    if (err.message === "Payment not found") {
      res.status(404).json({ error: "Payment not found" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// POST /api/super-admin/payments/:id/reject
router.post("/payments/:id/reject", async (req, res) => {
  try {
    const paymentId = req.params.id;
    const adminId = (req as any).auth?.userId;
    const { reason } = req.body;

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ error: "Rejection reason is mandatory when rejecting a payment." });
      return;
    }

    const trimmedReason = reason.trim();

    const result = await withBypassRLS(async (tx: any) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId));
      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.status === "rejected") {
        return { success: true, message: "Payment already rejected" };
      }

      const [project] = await tx.select().from(projects).where(eq(projects.id, payment.projectId));

      // 1. Update payment status
      await tx.update(payments).set({ status: "rejected" }).where(eq(payments.id, paymentId));

      // 2. Log action
      await tx.insert(paymentLogs).values({
        paymentId: paymentId,
        action: "rejected",
        performedBy: adminId,
        notes: trimmedReason,
      });

      // 3. Update project license to failed (if currently pending)
      await tx.update(projectLicenses)
        .set({ 
          paymentStatus: "failed", 
          updatedAt: new Date()
        })
        .where(and(eq(projectLicenses.projectId, payment.projectId), eq(projectLicenses.paymentStatus, "pending")));

      // 4. Sync status to projectEntitlements as inactive subscription
      await tx
        .update(projectEntitlements)
        .set({
          subscriptionStatus: "inactive",
          updatedAt: new Date(),
        })
        .where(eq(projectEntitlements.projectId, payment.projectId));

      // 5. Dispatch Notification Alert
      await tx.insert(notifications).values({
        organizationId: project?.organizationId || "global",
        projectId: payment.projectId,
        type: "billing",
        severity: "warning",
        title: "Payment Reference Rejected",
        message: `Your manual payment reference (${payment.utrTransactionId || "UPI"}) was rejected. Reason: ${trimmedReason}`,
        createdAt: new Date(),
      });

      return { success: true };
    });

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error rejecting payment");
    if (err.message === "Payment not found") {
      res.status(404).json({ error: "Payment not found" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// GET /api/super-admin/users
router.get("/users", async (req, res) => {
  try {
    const allUsers = await withBypassRLS(async (tx: any) => {
      return await tx
        .select({
          user: users,
          projectCount: sql<number>`count(${projects.id})`.mapWith(Number),
        })
        .from(users)
        .leftJoin(projects, eq(users.id, projects.userId))
        .groupBy(users.id)
        .orderBy(desc(users.createdAt));
    });
      
    const flattened = allUsers.map((u: any) => ({ ...u.user, projectCount: u.projectCount }));
    res.json(flattened);
  } catch (err: any) {
    req.log.error({ err }, "Error listing users for super-admin");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateUserSchema = z.object({
  role: z.string().optional(),
  features: z.any().optional(),
});

// PATCH /api/super-admin/users/:id
router.patch("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  
  try {
    const updateData: any = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.features !== undefined) updateData.features = parsed.data.features;
    
    const [updated] = await withBypassRLS(async (tx: any) => {
      return await tx.update(users)
        .set(updateData)
        .where(eq(users.id, req.params.id))
        .returning();
    });
      
    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/super-admin/projects
router.get("/projects", async (req, res) => {
  try {
    const allProjects = await withBypassRLS(async (tx: any) => {
      return await tx.select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        userId: projects.userId,
        isActive: projects.isActive,
        createdAt: projects.createdAt
      }).from(projects).orderBy(desc(projects.createdAt));
    });
    res.json(allProjects);
  } catch (err: any) {
    req.log.error({ err }, "Error listing projects for super-admin");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/super-admin/projects/:id/trial
router.patch("/projects/:id/trial", async (req, res) => {
  const { customTrialDays } = req.body;
  if (typeof customTrialDays !== "number" || customTrialDays < 0) {
    res.status(400).json({ error: "Invalid customTrialDays. Must be a non-negative number." });
    return;
  }

  try {
    await withBypassRLS(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(projectEntitlements)
        .where(eq(projectEntitlements.projectId, req.params.id))
        .limit(1);

      const now = new Date();
      if (existing) {
        const started = existing.trialStartedAt || now;
        const ends = new Date(started.getTime() + customTrialDays * 24 * 60 * 60 * 1000);
        await tx
          .update(projectEntitlements)
          .set({
            customTrialDays,
            trialStartedAt: started,
            trialEndsAt: ends,
            entitlementStatus: now <= ends ? "TRIAL_ACTIVE" : "TRIAL_EXPIRED",
            updatedAt: now,
          })
          .where(eq(projectEntitlements.projectId, req.params.id));
      } else {
        const ends = new Date(now.getTime() + customTrialDays * 24 * 60 * 60 * 1000);
        await tx
          .insert(projectEntitlements)
          .values({
            projectId: req.params.id,
            trialStartedAt: now,
            trialEndsAt: ends,
            customTrialDays,
            entitlementStatus: now <= ends ? "TRIAL_ACTIVE" : "TRIAL_EXPIRED",
            subscriptionStatus: "inactive",
            createdAt: now,
            updatedAt: now,
          });
      }

      // Update projects table as fallback
      await tx
        .update(projects)
        .set({
          customTrialDays,
          trialStartedAt: existing?.trialStartedAt || now,
          trialEndsAt: new Date((existing?.trialStartedAt || now).getTime() + customTrialDays * 24 * 60 * 60 * 1000),
        })
        .where(eq(projects.id, req.params.id));
    });

    await logSecurityEvent({
      eventName: "ADMIN_TRIAL_OVERRIDE",
      req,
      projectId: req.params.id,
      details: { customTrialDays }
    });

    res.json({ success: true, customTrialDays });
  } catch (err: any) {
    req.log.error({ err }, "Error overriding project trial days");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/super-admin/projects/:id/status
router.patch("/projects/:id/status", async (req, res) => {
  const { status } = req.body;
  if (status !== "active" && status !== "suspended" && status !== "cancelled") {
    res.status(400).json({ error: "Invalid status. Must be active, suspended, or cancelled." });
    return;
  }

  try {
    await withBypassRLS(async (tx: any) => {
      await tx
        .update(projects)
        .set({
          status,
          isActive: status === "active"
        })
        .where(eq(projects.id, req.params.id));

      const entitlementStatus =
        status === "suspended" ? "SUSPENDED" :
        status === "cancelled" ? "CANCELLED" :
        "TRIAL_ACTIVE";

      await tx
        .insert(projectEntitlements)
        .values({
          projectId: req.params.id,
          entitlementStatus,
          subscriptionStatus: "inactive",
        })
        .onConflictDoUpdate({
          target: projectEntitlements.projectId,
          set: {
            entitlementStatus,
            updatedAt: new Date()
          }
        });
    });

    await logSecurityEvent({
      eventName: "ADMIN_STATUS_OVERRIDE",
      req,
      projectId: req.params.id,
      details: { status }
    });

    res.json({ success: true, status });
  } catch (err: any) {
    req.log.error({ err }, "Error overriding project status");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/super-admin/global-settings
router.get("/global-settings", async (req, res) => {
  try {
    const settings = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(globalSettings);
    });
    const result = settings.reduce((acc: any, s: any) => {
      acc[s.id] = s.value;
      return acc;
    }, {} as Record<string, string>);
    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching global settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateGlobalSettingsSchema = z.object({
  NORMAL_AI_PROMPT: z.string().optional(),
  PAYMENT_UPI_ID: z.string().optional(),
  PAYMENT_QR_CODE_URL: z.string().optional(),
});

// PATCH /api/super-admin/global-settings
router.patch("/global-settings", async (req, res) => {
  req.log.info("PATCH /global-settings received!");
  const parsed = updateGlobalSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  
  try {
    const entries = Object.entries(parsed.data);
    await withBypassRLS(async (tx: any) => {
      for (const [key, value] of entries) {
        if (value !== undefined) {
          await tx.insert(globalSettings)
            .values({ id: key, value })
            .onConflictDoUpdate({
              target: globalSettings.id,
              set: { value, updatedAt: new Date() }
            });
        }
      }
    });
    req.log.info("DB update success");
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "DB Update Error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /super-admin/errors
router.get("/errors", async (req, res) => {
  try {
    const errorsList = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(systemErrors).orderBy(desc(systemErrors.createdAt)).limit(100);
    });
    res.json(errorsList);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching system errors");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /super-admin/errors/:id/fix
router.post("/errors/:id/fix", async (req, res) => {
  const id = req.params.id;
  try {
    const sysErr = await withBypassRLS(async (tx: any) => {
      const result = await tx.select().from(systemErrors).where(eq(systemErrors.id, id));
      return result[0];
    });
    if (!sysErr) {
      res.status(404).json({ error: "Error not found" });
      return;
    }

    const prompt = `You are a Senior Full-Stack Engineer debugging a system error.
Analyze the following error and provide a concise, step-by-step fix.

Source: ${sysErr.source}
Message: ${sysErr.message}
Stack Trace: ${sysErr.stack || "N/A"}
Context: ${JSON.stringify(sysErr.context || {})}

Provide the likely root cause and how to fix it in 2-3 short paragraphs or bullet points.`;

    const response = await ai.models.generateContent((req as any).auth.userId, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: "You are a Senior Full-Stack Engineer debugging a system error.",
      generationConfig: { maxOutputTokens: 1024 }
    });

    res.json({ fixSuggestion: response.text });
  } catch (err: any) {
    req.log.error({ err }, "Error generating fix for system error");
    res.status(500).json({ error: "Internal server error generating fix" });
  }
});

// GET /super-admin/supabase-stats
router.get("/supabase-stats", async (req, res) => {
  try {
    const stats = await withBypassRLS(async (tx: any) => {
      const dbSize = await tx.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes`);
      
      let storageSizeRaw = 0;
      let userStorage: any[] = [];
      try {
        const storageResult = await tx.execute(sql`SELECT SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes FROM storage.objects`);
        storageSizeRaw = Number(storageResult.rows[0]?.bytes || 0);

        const userStorageResult = await tx.execute(sql`
          SELECT owner as user_id, SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes 
          FROM storage.objects 
          GROUP BY owner
        `);
        userStorage = userStorageResult.rows;
      } catch (e) {
        req.log.warn({ e }, "storage.objects not available or query failed");
      }
      return { dbSize, storageSizeRaw, userStorage };
    });

    res.json({
      database: {
        sizeStr: stats.dbSize.rows[0]?.size || "0 bytes",
        bytes: Number(stats.dbSize.rows[0]?.bytes || 0)
      },
      storage: {
        bytes: stats.storageSizeRaw,
        perUser: stats.userStorage
      }
    });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching supabase stats");
    res.status(500).json({ error: "Internal server error fetching stats" });
  }
});

// GET /api/super-admin/payments
router.get("/payments", async (req, res) => {
  try {
    const allPayments = await withBypassRLS(async (tx: any) => {
      return await tx
        .select({
          id: payments.id,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          method: payments.method,
          utrTransactionId: payments.utrTransactionId,
          screenshotUrl: payments.screenshotUrl,
          createdAt: payments.createdAt,
          project: {
            id: projects.id,
            name: projects.name,
          },
          user: {
            id: users.id,
            email: users.email,
          }
        })
        .from(payments)
        .innerJoin(projects, eq(payments.projectId, projects.id))
        .innerJoin(users, eq(payments.userId, users.id))
        .orderBy(desc(payments.createdAt));
    });

    res.json(allPayments);
  } catch (err: any) {
    req.log.error({ err }, "Error fetching payments for admin");
    res.status(500).json({ error: "Internal server error" });
  }
});



// PATCH /api/super-admin/projects/:id/trial
// Admin-only endpoint to configure custom trial duration or override entitlement status
router.patch("/projects/:id/trial", async (req, res) => {
  try {
    const projectId = req.params.id;
    const { customTrialDays, entitlementStatus } = req.body;

    const [existing] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const { projectEntitlements } = await import("@workspace/db/schema");

    const [entitlement] = await db
      .select()
      .from(projectEntitlements)
      .where(eq(projectEntitlements.projectId, projectId));

    const updateFields: any = { updatedAt: new Date() };
    if (typeof customTrialDays === "number") {
      updateFields.customTrialDays = customTrialDays;
      // Re-calculate trialEndsAt if trial was started
      if (entitlement?.trialStartedAt) {
        const start = new Date(entitlement.trialStartedAt);
        updateFields.trialEndsAt = new Date(start.getTime() + customTrialDays * 24 * 60 * 60 * 1000);
      }
    }
    if (entitlementStatus && ["TRIAL_ACTIVE", "TRIAL_EXPIRED", "SUBSCRIPTION_ACTIVE", "SUSPENDED"].includes(entitlementStatus)) {
      updateFields.entitlementStatus = entitlementStatus;
    }

    if (entitlement) {
      await db
        .update(projectEntitlements)
        .set(updateFields)
        .where(eq(projectEntitlements.projectId, projectId));
    } else {
      await db.insert(projectEntitlements).values({
        projectId,
        customTrialDays: typeof customTrialDays === "number" ? customTrialDays : undefined,
        entitlementStatus: entitlementStatus || "TRIAL_ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    res.json({ success: true, projectId, updated: updateFields });
  } catch (err: any) {
    req.log.error({ err }, "Error updating project trial settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/super-admin/subscriptions
// Returns all projects with owner emails, trial details, subscription statuses, and entitlement info
router.get("/subscriptions", async (req, res) => {
  try {
    const list = await withBypassRLS(async (tx: any) => {
      const rows = await tx
        .select({
          id: projects.id,
          name: projects.name,
          userId: projects.userId,
          userEmail: users.email,
          isActive: projects.isActive,
          createdAt: projects.createdAt,
          entitlement: projectEntitlements,
        })
        .from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .leftJoin(projectEntitlements, eq(projects.id, projectEntitlements.projectId))
        .orderBy(desc(projects.createdAt));

      return rows.map((r: any) => {
        const ent = r.entitlement || {};
        const now = new Date();
        const trialStartedAt = ent.trialStartedAt || null;
        const trialEndsAt = ent.trialEndsAt || null;

        let derivedStatus = ent.entitlementStatus;
        if (!derivedStatus) {
          if (ent.subscriptionStatus === "active") {
            derivedStatus = "SUBSCRIPTION_ACTIVE";
          } else if (trialEndsAt && now > new Date(trialEndsAt)) {
            derivedStatus = "TRIAL_EXPIRED";
          } else {
            derivedStatus = "TRIAL_ACTIVE";
          }
        }

        return {
          projectId: r.id,
          projectName: r.name,
          userId: r.userId,
          userEmail: r.userEmail || "Unknown",
          isActive: r.isActive,
          createdAt: r.createdAt,
          customTrialDays: ent.customTrialDays ?? null,
          trialStartedAt,
          trialEndsAt,
          entitlementStatus: derivedStatus,
          subscriptionStatus: ent.subscriptionStatus || "inactive",
          subscriptionStartedAt: ent.subscriptionStartedAt || null,
          subscriptionEndsAt: ent.subscriptionEndsAt || null,
        };
      });
    });

    res.json(list);
  } catch (err: any) {
    req.log.error({ err }, "Error listing subscriptions for super-admin");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/super-admin/subscriptions/:projectId
// Updates entitlement status, custom trial days, or grants subscription days
router.patch("/subscriptions/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { customTrialDays, entitlementStatus, subscriptionStatus, grantSubscriptionDays } = req.body;

    await withBypassRLS(async (tx: any) => {
      const [existingProject] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!existingProject) {
        throw new Error("Project not found");
      }

      const [existingEnt] = await tx
        .select()
        .from(projectEntitlements)
        .where(eq(projectEntitlements.projectId, projectId));

      const now = new Date();
      const updateData: any = { updatedAt: now };

      if (typeof customTrialDays === "number" && customTrialDays >= 0) {
        updateData.customTrialDays = customTrialDays;
        const started = existingEnt?.trialStartedAt || now;
        updateData.trialStartedAt = started;
        updateData.trialEndsAt = new Date(started.getTime() + customTrialDays * 24 * 60 * 60 * 1000);
      }

      if (entitlementStatus) {
        updateData.entitlementStatus = entitlementStatus;
      }

      if (subscriptionStatus) {
        updateData.subscriptionStatus = subscriptionStatus;
        if (subscriptionStatus === "active") {
          updateData.entitlementStatus = "SUBSCRIPTION_ACTIVE";
        }
      }

      if (typeof grantSubscriptionDays === "number" && grantSubscriptionDays > 0) {
        const subStart = existingEnt?.subscriptionStartedAt || now;
        const currentEnd = existingEnt?.subscriptionEndsAt && new Date(existingEnt.subscriptionEndsAt) > now
          ? new Date(existingEnt.subscriptionEndsAt)
          : now;
        const subEnd = new Date(currentEnd.getTime() + grantSubscriptionDays * 24 * 60 * 60 * 1000);

        updateData.subscriptionStatus = "active";
        updateData.entitlementStatus = "SUBSCRIPTION_ACTIVE";
        updateData.subscriptionStartedAt = subStart;
        updateData.subscriptionEndsAt = subEnd;
      }

      if (existingEnt) {
        await tx
          .update(projectEntitlements)
          .set(updateData)
          .where(eq(projectEntitlements.projectId, projectId));
      } else {
        await tx.insert(projectEntitlements).values({
          projectId,
          subscriptionStatus: updateData.subscriptionStatus || "inactive",
          entitlementStatus: updateData.entitlementStatus || "TRIAL_ACTIVE",
          customTrialDays: updateData.customTrialDays,
          trialStartedAt: updateData.trialStartedAt,
          trialEndsAt: updateData.trialEndsAt,
          subscriptionStartedAt: updateData.subscriptionStartedAt,
          subscriptionEndsAt: updateData.subscriptionEndsAt,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (updateData.subscriptionStatus === "active" || updateData.entitlementStatus === "SUBSCRIPTION_ACTIVE") {
        await tx
          .update(projects)
          .set({ deploymentPaid: true })
          .where(eq(projects.id, projectId));
      }
    });

    await logSecurityEvent({
      eventName: "ADMIN_SUBSCRIPTION_UPDATE",
      req,
      projectId: req.params.projectId,
      details: { customTrialDays, entitlementStatus, subscriptionStatus, grantSubscriptionDays }
    });

    res.json({ success: true, projectId: req.params.projectId });
  } catch (err: any) {
    req.log.error({ err }, "Error updating subscription for admin");
    if (err.message === "Project not found") {
      res.status(404).json({ error: "Project not found" });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export default router;


