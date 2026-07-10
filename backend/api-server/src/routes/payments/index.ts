import { Router } from "express";
import { db, projects, payments, projectLicenses, paymentLogs, globalSettings } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();
const DEPLOYMENT_PRICE_PAISE = 49900; // ₹499 in paise

const manualPaymentSchema = z.object({
  projectId: z.string(),
  utrTransactionId: z.string(),
  method: z.string(),
  screenshotUrl: z.string(),
});

// POST /api/payments/manual
router.post("/manual", async (req, res) => {
  try {
    const parsed = manualPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
      return;
    }

    const { projectId, utrTransactionId, method, screenshotUrl } = parsed.data;
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Check project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Check if already paid/pending
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
        licenseStatus: "inactive",
        paymentStatus: "pending",
      });
    } else {
      await db.update(projectLicenses)
        .set({ paymentStatus: "pending", updatedAt: new Date() })
        .where(eq(projectLicenses.projectId, projectId));
    }

    // 2. Create the payment record
    const [paymentRecord] = await db.insert(payments).values({
      userId,
      projectId,
      amount: DEPLOYMENT_PRICE_PAISE,
      currency: "INR",
      status: "pending",
      method,
      utrTransactionId,
      screenshotUrl,
    }).returning();

    // 3. Log the payment submission
    await db.insert(paymentLogs).values({
      paymentId: paymentRecord.id,
      action: "submitted",
      performedBy: userId,
      notes: "User submitted manual payment",
    });

    res.json({ success: true, paymentId: paymentRecord.id });
  } catch (err: any) {
    req.log.error({ err }, "Manual payment submission error");
    res.status(500).json({ error: err.message || "Internal server error" });
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

    // Verify ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

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

export default router;
