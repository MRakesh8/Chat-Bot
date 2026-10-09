import { Router, type IRouter } from "express";

import geminiRouter from "./gemini";
import localDemoGeminiRouter from "./gemini/local-demo";
import filesRouter from "./files";
import projectsRouter from "./projects";
import reportsRouter from "./reports";
import categoriesRouter from "./categories";
import apiKeysRouter from "./api-keys";
import servicesRouter from "./services";
import paymentsRouter from "./payments";
import integrationsRouter from "./integrations";

import systemRouter from "./system";
import superAdminRouter from "./super-admin";
import agentRouter from "./agent";
import notificationsRouter from "./notifications";

const router: IRouter = Router();


router.use("/gemini", process.env.LOCAL_DEMO_MODE === "true" ? localDemoGeminiRouter : geminiRouter);
router.use("/files", filesRouter);
router.use("/projects", projectsRouter);
router.use("/reports", reportsRouter);
router.use("/categories", categoriesRouter);
router.use("/api-keys", apiKeysRouter);
router.use("/services", servicesRouter);
router.use("/payments", paymentsRouter);
router.use("/integrations", integrationsRouter);
router.use("/agent", agentRouter);
router.use("/notifications", notificationsRouter);
router.use("/system", systemRouter);
router.use("/super-admin", superAdminRouter);

export default router;
