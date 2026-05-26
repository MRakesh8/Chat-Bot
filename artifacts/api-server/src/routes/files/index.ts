import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { uploadedFiles } from "@workspace/db";
import { DeleteFileParams } from "@workspace/api-zod";
import { logger } from "../../lib/logger";

const router = Router();

// Ensure uploads directory exists
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

    const { originalname, filename, mimetype, size } = req.file;
    const conversationId = req.body.conversationId
      ? parseInt(req.body.conversationId, 10)
      : null;

    let extractedText: string | null = null;

    // For text-based files, try to extract text content
    if (
      mimetype === "text/plain" ||
      mimetype.startsWith("text/")
    ) {
      try {
        extractedText = fs.readFileSync(req.file.path, "utf-8").slice(0, 50000);
      } catch {
        logger.warn("Could not read text file for extraction");
      }
    }

    const [record] = await db
      .insert(uploadedFiles)
      .values({
        filename,
        originalName: originalname,
        mimeType: mimetype,
        size,
        path: req.file.path,
        extractedText,
        userId: (req as any).auth?.userId ?? null,
      })
      .returning();

    res.status(201).json({
      id: record.id,
      filename: record.filename,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      extractedText: record.extractedText,
      createdAt: record.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error uploading file");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /files/:id
router.delete("/:id", async (req, res) => {
  try {
    const parsed = DeleteFileParams.safeParse({ id: Number(req.params.id) });
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [record] = await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.id, parsed.data.id));

    if (!record) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Delete from disk
    try {
      if (fs.existsSync(record.path)) {
        fs.unlinkSync(record.path);
      }
    } catch {
      logger.warn("Could not delete file from disk");
    }

    await db.delete(uploadedFiles).where(eq(uploadedFiles.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting file");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
