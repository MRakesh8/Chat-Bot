import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini";
import localDemoGeminiRouter from "./gemini/local-demo";
import filesRouter from "./files";
import projectsRouter from "./projects";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gemini", process.env.LOCAL_DEMO_MODE === "true" ? localDemoGeminiRouter : geminiRouter);
router.use("/files", filesRouter);
router.use("/projects", projectsRouter);
router.use("/reports", reportsRouter);

export default router;
