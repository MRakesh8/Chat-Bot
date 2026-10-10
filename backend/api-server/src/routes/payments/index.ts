import { Router } from "express";
import { db, projects, payments, projectLicenses, paymentLogs, globalSettings, plans, projectEntitlements, withBypassRLS, withTenantContext } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import Razorpay from "razorpay";
import crypto from "crypto";
import { logger } from "../../lib/logger";

const router = Router();
const DEPLOYMENT_PRICE_PAISE = 49900; // â‚¹499 in paise

let razorpay: Razorpay | null = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

const manualPaymentSchema = z.object({
  projectId: z.string(),
  utrTransactionId: z.string().min(3, "UTR / Reference ID must be at least 3 characters"),
  method: z.string(),
  screenshotUrl: z.string().optional().default(""),
  planId: z.string().optional(),
});

// POST /api/payments/manual
router.post("/manual", async (req, res) => {
  try {
    const parsed = manualPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
      return;
    }

    const { projectId, utrTransactionId, method, screenshotUrl, planId } = parsed.data;
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = (req as any).auth?.dbUser?.role;
    const condition = (role === "super_admin" || role === "admin")
      ? eq(projects.id, projectId)
      : and(eq(projects.id, projectId), eq(projects.userId, userId));

    const [project] = await db
      .select()
      .from(projects)
      .where(condition);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Check for duplicate UTR transaction ID (excluding failed/rejected)
    const trimmedUtr = utrTransactionId.trim();
    const existingUtr = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.utrTransactionId, trimmedUtr),
          sql`LOWER(${payments.status}) IN ('pending', 'verified')`
        )
      );

    if (existingUtr.length > 0) {
      res.status(400).json({
        error: "This UTR / Transaction Reference ID has already been submitted and is currently pending or verified."
      });
      return;
    }

    // Determine price dynamically based on planId if provided
    let amount = DEPLOYMENT_PRICE_PAISE;
    if (planId) {
      const [targetPlan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, planId));
      if (targetPlan && typeof targetPlan.price === "number" && targetPlan.price > 0) {
        amount = targetPlan.price;
      }
    }

    // Check if license is already paid
    const [existingLicense] = await db
      .select()
      .from(projectLicenses)
      .where(eq(projectLicenses.projectId, projectId));

    if (existingLicense && existingLicense.paymentStatus === 'paid') {
      res.json({ alreadyPaid: true });
      return;
    }

    // 1. Ensure a project license exists (inactive)
    if (!existingLicense) {
      await db.insert(projectLicenses).values({
        projectId,
        planId: planId || null,
        licenseStatus: "inactive",
        paymentStatus: "pending",
      });
    } else {
      await db.update(projectLicenses)
        .set({ paymentStatus: "pending", planId: planId || existingLicense.planId, updatedAt: new Date() })
        .where(eq(projectLicenses.projectId, projectId));
    }

    // 2. Create the payment record
    const [paymentRecord] = await db.insert(payments).values({
      userId,
      projectId,
      amount,
      currency: "INR",
      status: "pending",
      method,
      utrTransactionId: trimmedUtr,
      screenshotUrl,
      metadata: planId ? { planId } : {},
    }).returning();

    // 3. Log the payment submission
    await db.insert(paymentLogs).values({
      paymentId: paymentRecord.id,
      action: "submitted",
      performedBy: userId,
      notes: `User submitted manual payment for ${planId ? 'selected plan' : 'Pro deployment'}`,
    });

    res.json({ success: true, paymentId: paymentRecord.id });
  } catch (err: any) {
    req.log.error({ err }, "Manual payment submission error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/payments/status/:projectId
router.get("/status/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const role = (req as any).auth?.dbUser?.role;
    const condition = (role === "super_admin" || role === "admin")
      ? eq(projects.id, projectId)
      : and(eq(projects.id, projectId), eq(projects.userId, userId));

    const [project] = await db
      .select()
      .from(projects)
      .where(condition);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Get global settings for payment config
    const settings = await db.select().from(globalSettings);
    const configMap = settings.reduce((acc, s) => {
      acc[s.id] = s.value;
      return acc;
    }, {} as Record<string, string>);

    const upiId = configMap['PAYMENT_UPI_ID'] || 'rakesh837m@okaxis';
    const qrCodeUrl = configMap['PAYMENT_QR_CODE_URL'] || '/qr-code.png';

    // Get latest license status
    const [license] = await db
      .select()
      .from(projectLicenses)
      .where(eq(projectLicenses.projectId, projectId));

    if (!license) {
      res.json({ status: "unpaid", licenseStatus: "inactive", upiId, qrCodeUrl });
      return;
    }

    res.json({
      status: license.paymentStatus, // 'pending', 'paid', 'failed'
      licenseStatus: license.licenseStatus, // 'active', 'inactive'
      upiId,
      qrCodeUrl,
    });
  } catch (err: any) {
    req.log.error({ err }, "Payment status check error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/razorpay/create-subscription
router.post("/razorpay/create-subscription", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { projectId, planId } = req.body;
    if (!projectId || !planId) {
      return res.status(400).json({ error: "projectId and planId are required" });
    }

    const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
    const project = await withBypassRLS(async (tx: any) => {
      return await tx.query.projects.findFirst({ where: eq(projects.id, projectId) });
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const membership = (req as any).auth?.memberships?.find((m: any) => m.organizationId === project.organizationId);
    if (!isSuperAdmin && (!membership || (membership.role !== "owner" && membership.role !== "admin" && membership.role !== "manager"))) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges in this workspace" });
    }

    // Fetch plan details
    const [plan] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(plans).where(eq(plans.id, planId)).limit(1);
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const planFeatures = typeof plan.features === "string" ? JSON.parse(plan.features) : plan.features;
    let razorpayPlanId = planFeatures?.razorpayPlanId;

    if (!razorpayPlanId) {
      // In production, the admin will have mapped Razorpay plan IDs to database plans.
      // If not configured, we create a dynamic Plan on Razorpay or fallback.
      try {
        if (!razorpay) {
          throw new Error("Razorpay credentials are not configured on the server.");
        }
        const rpPlan = await razorpay.plans.create({
          period: plan.interval === "yearly" ? "yearly" : "monthly",
          interval: 1,
          item: {
            name: plan.name,
            amount: plan.price, // price is already in paise according to schema
            currency: plan.currency || "INR",
          }
        });
        razorpayPlanId = rpPlan.id;
        // Save back to db plan features
        const updatedFeatures = { ...planFeatures, razorpayPlanId };
        await withBypassRLS(async (tx: any) => {
          await tx.update(plans).set({ features: updatedFeatures }).where(eq(plans.id, plan.id));
        });
      } catch (rpErr: any) {
        req.log.error(rpErr, "Failed to dynamically create Razorpay plan. Using fallback.");
        return res.status(500).json({ error: "Razorpay integration is not configured correctly." });
      }
    }

    if (!razorpay) {
      return res.status(500).json({ error: "Razorpay credentials are not configured on the server." });
    }

    // Create Subscription on Razorpay
    const subscription = await razorpay.subscriptions.create({
      plan_id: razorpayPlanId,
      customer_notify: 1,
      total_count: 12, // 1 year of billing cycle
      quantity: 1,
      notes: {
        projectId,
        organizationId: project.organizationId,
        userId
      }
    });

    res.json({
      success: true,
      subscriptionId: subscription.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount: plan.price,
      currency: plan.currency || "INR",
      name: plan.name,
      description: `Subscription for ${project.name}`
    });
  } catch (err: any) {
    req.log.error(err, "Error creating Razorpay subscription");
    res.status(500).json({ error: "Failed to create subscription" });
  }
});

// POST /api/payments/razorpay/webhook
router.post("/razorpay/webhook", async (req, res): Promise<any> => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  if (!signature) {
    return res.status(400).json({ error: "Missing signature" });
  }

  try {
    const rawBody = (req as any).rawBody || req.body;
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : JSON.stringify(rawBody);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(bodyStr)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ error: "Invalid signature verification" });
    }

    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const payload = event.payload;

    if (
      event.event === "subscription.charged" ||
      event.event === "payment.captured" ||
      event.event === "order.paid"
    ) {
      const entity = payload.subscription?.entity || payload.payment?.entity;
      const notes = entity?.notes || {};
      const { projectId, organizationId, userId } = notes;

      if (projectId && organizationId) {
        await withBypassRLS(async (tx: any) => {
          // 1. Provision active paid status in projectLicenses
          await tx
            .insert(projectLicenses)
            .values({
              projectId,
              licenseStatus: "active",
              paymentStatus: "paid",
              paymentDate: new Date(),
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: projectLicenses.projectId,
              set: {
                licenseStatus: "active",
                paymentStatus: "paid",
                paymentDate: new Date(),
                updatedAt: new Date()
              }
            });

          // 2. Synchronize to projectEntitlements
          const now = new Date();
          await tx
            .insert(projectEntitlements)
            .values({
              projectId,
              subscriptionStatus: "active",
              entitlementStatus: "SUBSCRIPTION_ACTIVE",
              subscriptionStartedAt: now,
              subscriptionEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
              createdAt: now,
              updatedAt: now
            })
            .onConflictDoUpdate({
              target: projectEntitlements.projectId,
              set: {
                subscriptionStatus: "active",
                entitlementStatus: "SUBSCRIPTION_ACTIVE",
                subscriptionStartedAt: now,
                subscriptionEndsAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
                updatedAt: now
              }
            });

          // 3. Log payment success
          const [paymentRecord] = await tx.insert(payments).values({
            userId: userId || null,
            projectId,
            amount: entity.amount || 0,
            currency: entity.currency || "INR",
            status: "verified",
            method: "razorpay",
            utrTransactionId: entity.id || null,
            metadata: entity
          }).returning();

          await tx.insert(paymentLogs).values({
            paymentId: paymentRecord.id,
            action: "verified",
            notes: `Razorpay webhook processed event ${event.event}`
          });
        });

        logger.info({ projectId, organizationId }, "Successfully processed Razorpay payment webhook");
      }
    }

    res.json({ status: "ok" });
  } catch (err: any) {
    logger.error(err, "Error processing Razorpay webhook");
    res.status(500).json({ error: "Webhook handling failure" });
  }
});

// POST /api/payments/razorpay/cancel-subscription
router.post("/razorpay/cancel-subscription", async (req, res): Promise<any> => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ error: "projectId is required" });
    }

    const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
    const project = await withBypassRLS(async (tx: any) => {
      return await tx.query.projects.findFirst({ where: eq(projects.id, projectId) });
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const membership = (req as any).auth?.memberships?.find((m: any) => m.organizationId === project.organizationId);
    if (!isSuperAdmin && (!membership || (membership.role !== "owner" && membership.role !== "admin" && membership.role !== "manager"))) {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges in this workspace" });
    }

    const [entitlement] = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(projectEntitlements).where(eq(projectEntitlements.projectId, projectId)).limit(1);
    });

    if (!entitlement || !entitlement.subscriptionId) {
       return res.status(400).json({ error: "No active Razorpay subscription found to cancel." });
    }

    if (razorpay) {
      await razorpay.subscriptions.cancel(entitlement.subscriptionId);
    }
    
    // Update DB to reflect cancellation
    await withBypassRLS(async (tx: any) => {
       await tx.update(projectEntitlements).set({
         subscriptionStatus: "inactive",
         entitlementStatus: "CANCELLED"
       }).where(eq(projectEntitlements.projectId, projectId));
    });

    logger.info({ projectId, userId }, "Successfully cancelled Razorpay subscription");
    res.json({ success: true });
  } catch (err: any) {
    logger.error(err, "Error cancelling Razorpay subscription");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

export default router;
