import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, projects, globalSettings } from "@workspace/db";
import { z } from "zod";

const router = Router();

// Middleware to ensure super_admin
router.use((req, res, next) => {
  const dbUser = (req as any).auth?.dbUser;
  if (!dbUser || dbUser.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: Super Admin access required" });
    return;
  }
  next();
});

// GET /api/super-admin/users
router.get("/users", async (req, res) => {
  try {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    res.json(allUsers);
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
    
    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, req.params.id))
      .returning();
      
    res.json(updated);
  } catch (err: any) {
    req.log.error({ err }, "Error updating user");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/super-admin/projects
router.get("/projects", async (req, res) => {
  try {
    const allProjects = await db.select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      userId: projects.userId,
      isActive: projects.isActive,
      createdAt: projects.createdAt
    }).from(projects).orderBy(desc(projects.createdAt));
    res.json(allProjects);
  } catch (err: any) {
    req.log.error({ err }, "Error listing projects for super-admin");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/super-admin/global-settings
router.get("/global-settings", async (req, res) => {
  try {
    const settings = await db.select().from(globalSettings);
    const result = settings.reduce((acc, s) => {
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
});

// PATCH /api/super-admin/global-settings
router.patch("/global-settings", async (req, res) => {
  const parsed = updateGlobalSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  
  try {
    if (parsed.data.NORMAL_AI_PROMPT !== undefined) {
      await db.insert(globalSettings)
        .values({ id: "NORMAL_AI_PROMPT", value: parsed.data.NORMAL_AI_PROMPT })
        .onConflictDoUpdate({
          target: globalSettings.id,
          set: { value: parsed.data.NORMAL_AI_PROMPT, updatedAt: new Date() }
        });
    }
    res.json({ success: true });
  } catch (err: any) {
    req.log.error({ err }, "Error updating global settings");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
