import { Router, type IRouter } from "express";

import geminiRouter from "./gemini";
import localDemoGeminiRouter from "./gemini/local-demo";
import filesRouter from "./files";
import projectsRouter from "./projects";
import reportsRouter from "./reports";
import categoriesRouter from "./categories";
import apiKeysRouter from "./api-keys";

const router: IRouter = Router();


router.use("/gemini", process.env.LOCAL_DEMO_MODE === "true" ? localDemoGeminiRouter : geminiRouter);
router.use("/files", filesRouter);
router.use("/projects", projectsRouter);
router.use("/reports", reportsRouter);
router.use("/categories", categoriesRouter);
router.use("/api-keys", apiKeysRouter);

export default router;
