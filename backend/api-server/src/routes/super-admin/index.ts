import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { users, projects, globalSettings, systemErrors } from "@workspace/db";
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
  console.log("PATCH /global-settings received!");
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
    console.log("DB update success");
    res.json({ success: true });
  } catch (err: any) {
    console.error("DB Update Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /super-admin/errors
router.get("/errors", async (req, res) => {
  try {
    const errorsList = await db.select().from(systemErrors).orderBy(desc(systemErrors.createdAt)).limit(100);
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
    const [sysErr] = await db.select().from(systemErrors).where(eq(systemErrors.id, id));
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

    const { text } = await ai.generateText({
      model: ai.models.gemini25Flash,
      prompt,
    });

    res.json({ fixSuggestion: text });
  } catch (err: any) {
    req.log.error({ err }, "Error generating fix for system error");
    res.status(500).json({ error: "Internal server error generating fix" });
  }
});

// GET /super-admin/supabase-stats
router.get("/supabase-stats", async (req, res) => {
  try {
    const dbSize = await db.execute(sql`SELECT pg_size_pretty(pg_database_size(current_database())) as size, pg_database_size(current_database()) as bytes`);
    
    // Some supabase instances might have storage.objects restricted or not present in local dev. We wrap in a try-catch for safety.
    let storageSizeRaw = 0;
    let userStorage = [];
    try {
      const storageResult = await db.execute(sql`SELECT SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes FROM storage.objects`);
      storageSizeRaw = Number(storageResult.rows[0]?.bytes || 0);

      const userStorageResult = await db.execute(sql`
        SELECT owner as user_id, SUM(COALESCE((metadata->>'size')::bigint, 0)) as bytes 
        FROM storage.objects 
        GROUP BY owner
      `);
      userStorage = userStorageResult.rows;
    } catch (e) {
      req.log.warn({ e }, "storage.objects not available or query failed");
    }

    res.json({
      database: {
        sizeStr: dbSize.rows[0]?.size || "0 bytes",
        bytes: Number(dbSize.rows[0]?.bytes || 0)
      },
      storage: {
        bytes: storageSizeRaw,
        perUser: userStorage
      }
    });
  } catch (err: any) {
    req.log.error({ err }, "Error fetching supabase stats");
    res.status(500).json({ error: "Internal server error fetching stats" });
  }
});

export default router;
