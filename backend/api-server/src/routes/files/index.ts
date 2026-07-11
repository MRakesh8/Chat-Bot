/**
 * @file index.ts (files route)
 * @description Defines Express routes for uploading, analyzing, and managing knowledge sources (files, URLs, repositories, notes) in the system.
 */
import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, desc, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { knowledgeCategories, knowledgeSources, projects, knowledgeChunks } from "@workspace/db";
import { logger } from "../../lib/logger";
import { supabaseAdmin } from "../../lib/supabase";
import { processKnowledgeSource, extractSourceContent, invalidateKnowledgeCache } from "../../services/knowledge";
import { extractYouTubeId } from "../../lib/youtube";
import { ai } from "@workspace/integrations-gemini-ai";

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
  fileFilter: (_req, file, cb) => {
    const allowedPrefixes = ["image/", "video/", "audio/", "text/"];
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
      "application/zip",
      "application/x-zip-compressed",
      "application/json",
      "application/xml",
      "application/javascript",
      "application/typescript",
    ];
    const allowedExtensions = new Set([
      "pdf", "docx", "doc", "txt", "md", "csv", "pptx", "ppt", "xls", "xlsx",
      "zip", "rar", "7z", "tar", "gz",
      "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "heic",
      "mp3", "wav", "ogg", "m4a", "aac",
      "mp4", "webm", "mov", "avi", "mkv",
      "js", "ts", "jsx", "tsx", "py", "html", "css", "json", "xml", "sh", "c", "cpp", "java", "go", "rs", "php", "sql", "yaml", "yml", "toml", "ini", "conf", "env", "tsv", "rtf"
    ]);
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    
    if (
      allowedExtensions.has(ext) ||
      allowedPrefixes.some(p => file.mimetype.startsWith(p)) || 
      allowedMimeTypes.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: .${ext || 'unknown'}`));
    }
  },
});

async function categoryBelongsToProject(categoryId: string, projectId: string) {
  const [category] = await db
    .select({ id: knowledgeCategories.id })
    .from(knowledgeCategories)
    .where(and(eq(knowledgeCategories.id, categoryId), eq(knowledgeCategories.projectId, projectId)));
  return Boolean(category);
}

// POST /files/upload-public - Upload file securely via backend using Service Role Key
router.post("/upload-public", (req, res, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: err.message || "File upload failed" });
    next();
  });
}, async (req, res) => {
  try {
    const { storagePath } = req.body;
    const userId = (req as any).auth?.userId;

    if (!userId) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.file || !storagePath) {
      if (req.file?.path) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: "File and storagePath are required" });
      return;
    }

    const fileBuffer = fs.readFileSync(req.file.path);
    const { error: uploadError } = await supabaseAdmin.storage
      .from("project-files")
      .upload(storagePath, fileBuffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    fs.unlinkSync(req.file.path);

    if (uploadError) {
      req.log.error({ err: uploadError }, "Admin upload failed");
      res.status(500).json({ error: "Upload failed: " + uploadError.message });
      return;
    }

    const baseUrl = process.env.API_URL || (req.protocol + '://' + req.get('host'));
    const publicUrl = `${baseUrl}/api/files/public/${storagePath}`;

    res.json({ publicUrl });
  } catch (err: any) {
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /files/public/* - Proxy file from private bucket securely
router.get("/public/*storagePath", async (req, res) => {
  try {
    let storagePathParam = req.params.storagePath;
    if (!storagePathParam) {
      res.status(400).json({ error: "Storage path required" });
      return;
    }
    
    let storagePath = Array.isArray(storagePathParam) 
      ? storagePathParam.join("/") 
      : String(storagePathParam);
      
    if (storagePath.startsWith("/")) {
      storagePath = storagePath.substring(1);
    }

    const { data, error } = await supabaseAdmin.storage
      .from("project-files")
      .download(storagePath);

    if (error || !data) {
      req.log.error({ err: error }, "Failed to proxy file");
      res.status(404).send("Not found");
      return;
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const ext = path.extname(storagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err: any) {
    req.log.error({ err }, "Error proxying file");
    res.status(500).send("Internal Error");
  }
});

// POST /files/upload - Upload file as knowledge source
router.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File is too large. Maximum size is 100MB." });
        return;
      }
      res.status(400).json({ error: err.message || "File upload failed" });
      return;
    }
    next();
  });
}, async (req, res) => {
  try {
    const { projectId, categoryId, tag, notes, conversationId } = req.body;
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

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    if (!userId) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Determine upload intent: Chat attachment vs Knowledge Base upload
    const isChatUpload = !projectId && !categoryId;

    if (!isChatUpload && (!projectId || !categoryId)) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(400).json({ error: "Missing projectId or categoryId for knowledge upload" });
      return;
    }

    if (!isChatUpload) {
      const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
      if (!project) {
        if (localPath) fs.unlinkSync(localPath);
        res.status(403).json({ error: "Forbidden: You do not own this project" });
        return;
      }

      if (!(await categoryBelongsToProject(categoryId, projectId))) {
        if (localPath) fs.unlinkSync(localPath);
        res.status(400).json({ error: "Category does not belong to this project" });
        return;
      }
    }

    let fileId: string | undefined;
    let sourceType = "file";
    
    if (localPath && originalname && mimetype && filename) {
      const fileBuffer = fs.readFileSync(localPath);
      const storagePath = isChatUpload ? `chats/${conversationId || "temp-" + Date.now()}/${filename}` : `${projectId}/${filename}`;
      let uploadMimetype = mimetype;
      
      // Supabase storage bucket default allows ["image/*", "application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
      // Convert unsupported text mimetypes (like text/markdown, text/csv, text/html) to text/plain to bypass bucket restrictions
      if (mimetype.startsWith("text/") && mimetype !== "text/plain") {
        uploadMimetype = "text/plain";
      } else if (!mimetype.startsWith("image/") && mimetype !== "application/pdf" && !mimetype.includes("wordprocessingml")) {
        // Fallback for everything else like videos, audio, or binary files that Supabase might reject
        uploadMimetype = "application/octet-stream";
      }

      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from("project-files")
        .upload(storagePath, fileBuffer, {
          contentType: uploadMimetype,
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
      else if (mimetype.startsWith("audio/")) sourceType = "audio";
    }

    // If it's a chat upload, we just return the fileId immediately
    if (isChatUpload) {
      res.json({ id: fileId, fileId, sourceType, filename: originalname, url: "" });
      return;
    }

    const [record] = await db
      .insert(knowledgeSources)
      .values({
        projectId,
        categoryId,
        tag: tag || null,
        title: req.body.title || null,
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
  } catch (err: any) {
    req.log.error({ err }, "Error uploading file");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

// POST /files/analyze - Extract metadata before saving
router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    const { sourceType, sourceUrl } = req.body;
    let fileBuffer;
    let filename;
    let localPath;
    
    if (req.file) {
      localPath = req.file.path;
      fileBuffer = fs.readFileSync(localPath);
      filename = req.file.originalname;
    }

    if (!sourceType) {
      if (localPath) fs.unlinkSync(localPath);
      res.status(400).json({ error: "Missing sourceType" });
      return;
    }

    const userId = (req as any).auth?.userId || null;

    const extractedText = await extractSourceContent({
      sourceType,
      sourceUrl,
      fileBuffer,
      filename,
      userId
    });

    if (localPath) fs.unlinkSync(localPath);

    const prompt = `Based on the following extracted text from a knowledge source, suggest a concise title, 2-3 relevant tags, and detailed notes/data containing all critical details, definitions, step-by-step instructions, and key information (do not summarize briefly). Return strictly valid JSON with keys: "title" (string), "tags" (comma-separated string), "notes" (string). \n\nText: ${extractedText.substring(0, 30000)}`;
    
    const resAi = await ai.models.generateContent(userId, {
      model: "gemini-2.0-flash",
      contents: prompt
    });

    let result = { title: "", tags: "", notes: "" };
    try {
      const jsonStr = resAi.text?.replace(/```json/g, '').replace(/```/g, '').trim() || "{}";
      result = JSON.parse(jsonStr);
    } catch (e) {
      logger.warn("Failed to parse JSON from AI suggestion");
    }

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Error analyzing source");
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || "Failed to analyze source" });
  }
});

// POST /files/url - Add non-file knowledge (Website, YouTube, Instagram, GitHub, Note)
router.post("/url", async (req, res) => {
  try {
    const { projectId, categoryId, tag, sourceType, sourceUrl, sourceUrls, notes, title } = req.body;
    
    if (!projectId || !categoryId || !sourceType) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const urlsToProcess = sourceUrls ? (Array.isArray(sourceUrls) ? sourceUrls : [sourceUrls]) : [sourceUrl];

    if (sourceType === "note" && !notes?.trim()) {
      res.status(400).json({ error: "Note content is required" });
      return;
    }

    for (const url of urlsToProcess) {
      if (["website", "youtube", "github", "instagram"].includes(sourceType) && !url?.trim()) {
        res.status(400).json({ error: "URL is required" });
        return;
      }

      if (sourceType === "youtube" && !extractYouTubeId(url.trim())) {
        res.status(400).json({ error: "Invalid YouTube URL" });
        return;
      }

      if (sourceType === "github" && !url.trim().match(/^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i)) {
        res.status(400).json({ error: "Invalid GitHub repository URL" });
        return;
      }

      if (sourceType === "instagram" && !url.trim().match(/^https?:\/\/(www\.)?instagram\.com\/.*$/i)) {
        res.status(400).json({ error: "Invalid Instagram URL" });
        return;
      }
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

    if (!(await categoryBelongsToProject(categoryId, projectId))) {
      res.status(400).json({ error: "Category does not belong to this project" });
      return;
    }

    const records = [];
    for (const url of urlsToProcess) {
      const [record] = await db
        .insert(knowledgeSources)
        .values({
          projectId,
          categoryId,
          tag: tag || null,
          title: title || null,
          sourceType,
          sourceUrl: url || null,
          notes: notes || null,
          status: "pending",
        })
        .returning();

      processKnowledgeSource(record.id).catch((e) => {
        req.log.error({ err: e }, "Async processing failed for source");
      });
      records.push(record);
    }

    res.status(201).json(records.length === 1 ? records[0] : records);
  } catch (err: any) {
    req.log.error({ err }, "Error saving source");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  } catch (err: any) {
    req.log.error({ err }, "Error listing sources");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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

    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.knowledgeSourceId, id));
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
    await invalidateKnowledgeCache(record.projectId);
    res.status(204).send();
  } catch (err: any) {
    req.log.error({ err }, "Error deleting source");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
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
  } catch (err: any) {
    req.log.error({ err }, "Error reprocessing source");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

// PATCH /files/:id
router.patch("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { tag, notes, sourceUrl, categoryId, isWidgetExposed } = req.body;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [result] = await db
      .select({ source: knowledgeSources })
      .from(knowledgeSources)
      .innerJoin(projects, eq(knowledgeSources.projectId, projects.id))
      .where(and(eq(knowledgeSources.id, id), eq(projects.userId, userId)));

    if (!result?.source) {
      res.status(404).json({ error: "Source not found or access denied" });
      return;
    }

    const existing = result.source;
    const updates: Partial<typeof knowledgeSources.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (tag !== undefined) updates.tag = tag || null;
    if (isWidgetExposed !== undefined) updates.isWidgetExposed = isWidgetExposed;
    if (categoryId !== undefined) {
      if (!(await categoryBelongsToProject(categoryId, existing.projectId))) {
        res.status(400).json({ error: "Category does not belong to this project" });
        return;
      }
      updates.categoryId = categoryId;
    }
    if (notes !== undefined && existing.sourceType === "note") {
      if (!notes.trim()) {
        res.status(400).json({ error: "Note content cannot be empty" });
        return;
      }
      updates.notes = notes;
    }
    if (sourceUrl !== undefined && ["website", "youtube", "github", "instagram"].includes(existing.sourceType)) {
      if (!sourceUrl.trim()) {
        res.status(400).json({ error: "URL cannot be empty" });
        return;
      }
      if (existing.sourceType === "youtube" && !extractYouTubeId(sourceUrl.trim())) {
        res.status(400).json({ error: "Invalid YouTube URL" });
        return;
      }
      if (existing.sourceType === "github" && !sourceUrl.trim().match(/^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/i)) {
        res.status(400).json({ error: "Invalid GitHub repository URL" });
        return;
      }
      if (existing.sourceType === "instagram" && !sourceUrl.trim().match(/^https?:\/\/(www\.)?instagram\.com\/.*$/i)) {
        res.status(400).json({ error: "Invalid Instagram URL" });
        return;
      }
      updates.sourceUrl = sourceUrl.trim();
    }

    const contentChanged =
      (notes !== undefined && notes !== existing.notes) ||
      (sourceUrl !== undefined && sourceUrl !== existing.sourceUrl);

    if (contentChanged) {
      updates.status = "pending";
    }

    const [record] = await db
      .update(knowledgeSources)
      .set(updates)
      .where(eq(knowledgeSources.id, id))
      .returning();

    if (contentChanged) {
      processKnowledgeSource(record.id).catch((e) => {
        req.log.error({ err: e }, "Async reprocessing failed after edit");
      });
    }

    res.json(record);
  } catch (err: any) {
    req.log.error({ err }, "Error updating source");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

// PATCH /files/:id/category
router.patch("/:id/category", async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryId } = req.body;
    const userId = (req as any).auth?.userId;
    if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!categoryId) { res.status(400).json({ error: "Missing categoryId" }); return; }

    const [result] = await db
      .select({ source: knowledgeSources })
      .from(knowledgeSources)
      .innerJoin(projects, eq(knowledgeSources.projectId, projects.id))
      .where(and(eq(knowledgeSources.id, id), eq(projects.userId, userId)));

    if (!result || !result.source) {
      res.status(404).json({ error: "Source not found or access denied" });
      return;
    }

    if (!(await categoryBelongsToProject(categoryId, result.source.projectId))) {
      res.status(400).json({ error: "Category does not belong to this project" });
      return;
    }

    const [record] = await db
      .update(knowledgeSources)
      .set({ categoryId, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, id))
      .returning();

    res.json(record);
  } catch (err: any) {
    req.log.error({ err }, "Error moving source");
    res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
});

export default router;
