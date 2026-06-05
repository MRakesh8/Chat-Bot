import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { projectFiles } from "@workspace/db";
import { DeleteFileParams } from "@workspace/api-zod";
import { logger } from "../../lib/logger";
import { supabaseAdmin } from "../../lib/supabase";
import { processProjectFile } from "../../services/knowledge";

const router = Router();

// Ensure uploads directory exists temporarily
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /files/upload
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { originalname, filename, mimetype, path: localPath } = req.file;
    const projectId = req.body.projectId;

    if (!projectId) {
      fs.unlinkSync(localPath);
      res.status(400).json({ error: "Missing projectId" });
      return;
    }

    // Read the file buffer
    const fileBuffer = fs.readFileSync(localPath);

    // Upload to Supabase Storage
    const storagePath = `${projectId}/${filename}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("project-files")
      .upload(storagePath, fileBuffer, {
        contentType: mimetype,
        upsert: false,
      });

    // Delete local file regardless of success/failure
    fs.unlinkSync(localPath);

    if (uploadError) {
      req.log.error({ err: uploadError }, "Supabase storage upload failed");
      res.status(500).json({ error: "Failed to upload file to storage" });
      return;
    }

    // Determine type string
    let type = "other";
    if (mimetype.startsWith("image/")) type = "image";
    else if (mimetype === "application/pdf") type = "pdf";
    else if (mimetype.startsWith("text/")) type = "txt";
    else if (mimetype.includes("wordprocessingml") || mimetype.includes("msword")) type = "docx";
    else if (mimetype.includes("presentationml") || mimetype.includes("powerpoint")) type = "pptx";

    // Store in Database
    const [record] = await db
      .insert(projectFiles)
      .values({
        projectId,
        filename: originalname,
        fileUrl: storagePath,
        type,
        status: "pending",
      })
      .returning();

    // Trigger async processing for extracting text and embedding
    processProjectFile(record.id).catch((e) => {
      req.log.error({ err: e }, "Async processing failed");
    });

    res.status(201).json(record);
  } catch (err) {
    req.log.error({ err }, "Error uploading file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /files/url
router.post("/url", async (req, res) => {
  try {
    const { url, projectId } = req.body;
    if (!url || !projectId) {
      res.status(400).json({ error: "Missing url or projectId" });
      return;
    }

    let type = "website";
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      type = "youtube";
    }

    // Store in Database
    const [record] = await db
      .insert(projectFiles)
      .values({
        projectId,
        filename: url, // For URLs, filename is the URL itself
        fileUrl: url,
        type,
        status: "pending",
      })
      .returning();

    // Trigger async processing
    processProjectFile(record.id).catch((e) => {
      req.log.error({ err: e }, "Async processing failed for URL");
    });

    res.status(201).json(record);
  } catch (err) {
    req.log.error({ err }, "Error saving URL");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /files/project/:projectId
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const files = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(desc(projectFiles.createdAt));
    
    res.json(files);
  } catch (err) {
    req.log.error({ err }, "Error listing files");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /files/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [record] = await db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.id, id));

    if (!record) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Delete from Supabase Storage
    const { error: deleteError } = await supabaseAdmin.storage
      .from("project-files")
      .remove([record.fileUrl]);

    if (deleteError) {
      logger.warn({ err: deleteError }, "Could not delete file from storage");
    }

    // Delete from Database
    await db.delete(projectFiles).where(eq(projectFiles.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /files/:id/reprocess
router.post("/:id/reprocess", async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [record] = await db
      .update(projectFiles)
      .set({ status: "pending" })
      .where(eq(projectFiles.id, id))
      .returning();

    if (!record) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    processProjectFile(record.id).catch((e) => {
      req.log.error({ err: e }, "Async reprocessing failed");
    });

    res.json(record);
  } catch (err) {
    req.log.error({ err }, "Error reprocessing file");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
