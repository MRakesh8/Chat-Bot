import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, desc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { knowledgeSources, projects } from "@workspace/db";
import { logger } from "../../lib/logger";
import { supabaseAdmin } from "../../lib/supabase";
import { processKnowledgeSource } from "../../services/knowledge";

const router = Router();

const uploadsDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for video/zips
});

// POST /files/upload - Upload file as knowledge source
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { projectId, categoryId, tag, notes } = req.body;
    const userId = (req as any).auth?.userId;
    let localPath: string | undefined;
    let originalname: string | undefined;
    let mimetype: string | undefined;
    let filename: string | undefined;

    if (req.file) {
      localPath = req.file.path;
      originalname = req.file.originalname;
      mimetype = req.file.mimetype;
      filename = req.file.filename;
    }

    if (!projectId || !categoryId) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(400).json({ error: "Missing projectId or categoryId" });
      return;
    }

    if (!userId) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(403).json({ error: "Forbidden: You do not own this project" });
      return;
    }

    let fileId: string | undefined;
    let sourceType = "file";
    
    if (localPath && originalname && mimetype && filename) {
      const fileBuffer = fs.readFileSync(localPath);
      const storagePath = `${projectId}/${filename}`;
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from("project-files")
        .upload(storagePath, fileBuffer, {
          contentType: mimetype,
          upsert: false,
        });

      fs.unlinkSync(localPath);

      if (uploadError) {
        req.log.error({ err: uploadError }, "Supabase storage upload failed");
        res.status(500).json({ error: "Failed to upload file to storage" });
        return;
      }
      
      fileId = storagePath;
      
      if (mimetype.startsWith("video/")) sourceType = "video";
      else if (mimetype.startsWith("image/")) sourceType = "image";
    }

    const [record] = await db
      .insert(knowledgeSources)
      .values({
        projectId,
        categoryId,
        tag: tag || null,
        notes: notes || null,
        filename: originalname || null,
        fileId: fileId || null,
        sourceType,
        status: "pending",
      })
      .returning();

    processKnowledgeSource(record.id).catch((e) => {
      req.log.error({ err: e }, "Async processing failed");
    });

    res.status(201).json(record);
  } catch (err) {
    req.log.error({ err }, "Error uploading file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /files/url - Add non-file knowledge (Website, YouTube, Instagram, GitHub, Note)
router.post("/url", async (req, res) => {
  try {
    const { projectId, categoryId, tag, sourceType, sourceUrl, notes } = req.body;
    
    if (!projectId || !categoryId || !sourceType) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) {
      res.status(403).json({ error: "Forbidden: You do not own this project" });
      return;
    }

    const [record] = await db
      .insert(knowledgeSources)
      .values({
        projectId,
        categoryId,
        tag: tag || null,
        sourceType,
        sourceUrl: sourceUrl || null,
        notes: notes || null,
        status: "pending",
      })
      .returning();

    processKnowledgeSource(record.id).catch((e) => {
      req.log.error({ err: e }, "Async processing failed for source");
    });

    res.status(201).json(record);
  } catch (err) {
    req.log.error({ err }, "Error saving source");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /files/project/:projectId
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) { res.status(403).json({ error: "Forbidden" }); return; }

    const sources = await db
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.projectId, projectId))
      .orderBy(desc(knowledgeSources.createdAt));
    
    res.json(sources);
  } catch (err) {
    req.log.error({ err }, "Error listing sources");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /files/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [result] = await db
      .select({ source: knowledgeSources })
      .from(knowledgeSources)
      .innerJoin(projects, eq(knowledgeSources.projectId, projects.id))
      .where(and(eq(knowledgeSources.id, id), eq(projects.userId, userId)));

    if (!result || !result.source) {
      res.status(404).json({ error: "Source not found or access denied" });
      return;
    }
    
    const record = result.source;

    if (record.fileId) {
      const { error: deleteError } = await supabaseAdmin.storage
        .from("project-files")
        .remove([record.fileId]);

      if (deleteError) {
        logger.warn({ err: deleteError }, "Could not delete file from storage");
      }
    }

    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting source");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /files/:id/reprocess
router.post("/:id/reprocess", async (req, res) => {
  try {
    const id = req.params.id;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [result] = await db
      .select({ source: knowledgeSources })
      .from(knowledgeSources)
      .innerJoin(projects, eq(knowledgeSources.projectId, projects.id))
      .where(and(eq(knowledgeSources.id, id), eq(projects.userId, userId)));

    if (!result || !result.source) {
      res.status(404).json({ error: "Source not found or access denied" });
      return;
    }

    const [record] = await db
      .update(knowledgeSources)
      .set({ status: "pending" })
      .where(eq(knowledgeSources.id, id))
      .returning();

    processKnowledgeSource(record.id).catch((e) => {
      req.log.error({ err: e }, "Async reprocessing failed");
    });

    res.json(record);
  } catch (err) {
    req.log.error({ err }, "Error reprocessing source");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /files/:id/category
router.patch("/:id/category", async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryId } = req.body;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [result] = await db
      .select({ source: knowledgeSources })
      .from(knowledgeSources)
      .innerJoin(projects, eq(knowledgeSources.projectId, projects.id))
      .where(and(eq(knowledgeSources.id, id), eq(projects.userId, userId)));

    if (!result || !result.source) {
      res.status(404).json({ error: "Source not found or access denied" });
      return;
    }

    const [record] = await db
      .update(knowledgeSources)
      .set({ categoryId, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, id))
      .returning();

    res.json(record);
  } catch (err) {
    req.log.error({ err }, "Error moving source");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
