import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { knowledgeCategories } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const createCategorySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
});

const renameCategorySchema = z.object({
  name: z.string().min(1).max(255),
});

// Get categories for a project
router.get("/project/:projectId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const categories = await db.query.knowledgeCategories.findMany({
      where: eq(knowledgeCategories.projectId, projectId),
      orderBy: (categories, { asc }) => [asc(categories.createdAt)],
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

// Create a category
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId, name } = createCategorySchema.parse(req.body);
    const [category] = await db
      .insert(knowledgeCategories)
      .values({ projectId, name })
      .returning();
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

// Rename a category
router.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name } = renameCategorySchema.parse(req.body);
    const [category] = await db
      .update(knowledgeCategories)
      .set({ name, updatedAt: new Date() })
      .where(eq(knowledgeCategories.id, id))
      .returning();
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    next(error);
  }
});

// Delete a category
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [deleted] = await db
      .delete(knowledgeCategories)
      .where(eq(knowledgeCategories.id, id))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
