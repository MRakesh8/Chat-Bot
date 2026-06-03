import { Router, type IRouter } from "express";
import healthRouter from "./health";
import geminiRouter from "./gemini";
import filesRouter from "./files";
import projectsRouter from "./projects";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gemini", geminiRouter);
router.use("/files", filesRouter);
router.use("/projects", projectsRouter);

export default router;
