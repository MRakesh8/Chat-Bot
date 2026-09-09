import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { knowledgeCategories, projects } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { invalidateKnowledgeCache } from "../services/knowledge";

import { logger } from "../lib/logger";

const router = Router();

const createCategorySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
});

const renameCategorySchema = z.object({
  name: z.string().trim().min(1).max(255),
});

async function userOwnsProject(projectId: string, userId: string, role?: string) {
  if (role === "super_admin" || role === "admin") {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    return Boolean(project);
  }
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return Boolean(project);
}

async function userOwnsCategory(categoryId: string, userId: string, role?: string) {
  if (role === "super_admin" || role === "admin") {
    const [category] = await db
      .select({ id: knowledgeCategories.id })
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.id, categoryId));
    return Boolean(category);
  }
  const [category] = await db
    .select({ id: knowledgeCategories.id })
    .from(knowledgeCategories)
    .innerJoin(projects, eq(knowledgeCategories.projectId, projects.id))
    .where(and(eq(knowledgeCategories.id, categoryId), eq(projects.userId, userId)));
  return Boolean(category);
}

// Get categories for a project
router.get("/project/:projectId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const projectId = String(req.params.projectId);
    if (!z.string().uuid().safeParse(projectId).success) {
      res.status(400).json({ error: "Invalid project id" });
      return;
    }
    if (!(await userOwnsProject(projectId, userId, (req as any).auth?.dbUser?.role))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const categories = await db.query.knowledgeCategories.findMany({
      where: eq(knowledgeCategories.projectId, projectId as string),
      orderBy: (categories, { asc }) => [asc(categories.createdAt)],
    });
    res.json(categories);
    return;
  } catch (error) {
    next(error);
  }
});

// Create a category
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { projectId, name } = createCategorySchema.parse(req.body);
    if (!(await userOwnsProject(projectId, userId, (req as any).auth?.dbUser?.role))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const [category] = await db
      .insert(knowledgeCategories)
      .values({ projectId, name })
      .returning();
    res.status(201).json(category);
    return;
  } catch (error) {
    next(error);
  }
});

// Rename a category
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);
    if (!z.string().uuid().safeParse(id).success) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    const { name } = renameCategorySchema.parse(req.body);
    if (!(await userOwnsCategory(id, userId, (req as any).auth?.dbUser?.role))) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const [existingCategory] = await db
      .select()
      .from(knowledgeCategories)
      .where(eq(knowledgeCategories.id, id));

    if (!existingCategory) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    // Check for duplicates
    const [duplicateCategory] = await db
      .select({ id: knowledgeCategories.id })
      .from(knowledgeCategories)
      .where(and(eq(knowledgeCategories.projectId, existingCategory.projectId), eq(knowledgeCategories.name, name)));

    if (duplicateCategory && duplicateCategory.id !== id) {
      res.status(400).json({ error: "A category with this name already exists in this project" });
      return;
    }

    const [category] = await db
      .update(knowledgeCategories)
      .set({ name, updatedAt: new Date() })
      .where(eq(knowledgeCategories.id, id as string))
      .returning();

    if (!category) {
      res.status(404).json({ error: "Category not found" });
      return;
    }

    logger.info(`Category Rename\n\nProject:\n${category.projectId}\n\nCategory ID:\n${category.id}\n\nOld:\n${existingCategory.name}\n\nNew:\n${category.name}\n\nResult:\nSuccess`);

    await invalidateKnowledgeCache(category.projectId);

    res.json(category);
    return;
  } catch (error) {
    next(error);
  }
});

// Delete a category
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const id = String(req.params.id);
    if (!z.string().uuid().safeParse(id).success) {
      res.status(400).json({ error: "Invalid category id" });
      return;
    }
    if (!(await userOwnsCategory(id, userId, (req as any).auth?.dbUser?.role))) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const [deleted] = await db
      .delete(knowledgeCategories)
      .where(eq(knowledgeCategories.id, id as string))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    res.status(204).send();
    return;
  } catch (error) {
    next(error);
  }
});

export default router;
