import { db, knowledgeChunks, projectFiles } from "@workspace/db";
import { supabaseAdmin } from "../lib/supabase";
import { ai } from "@workspace/integrations-gemini-ai";
import mammoth from "mammoth";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// Recursive Character Text Splitter simplified
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = index + chunkSize;
    if (end < text.length) {
      // Try to find a safe boundary
      const boundary = text.lastIndexOf('\n', end);
      if (boundary > index + overlap) {
        end = boundary;
      }
    }
    chunks.push(text.slice(index, end).trim());
    index = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

function extractYouTubeId(text: string): string | null {
  const match = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/.exec(text);
  return match?.[1] ?? null;
}

export async function processProjectFile(fileId: string) {
  try {
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, fileId));
    if (!file) throw new Error(`File ${fileId} not found`);

    if (file.status === "processed") {
      logger.info(`File ${fileId} is already processed`);
      return;
    }

    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.projectFileId, fileId));

    let extractedText = "";

    if (file.type === "youtube") {
      const { YoutubeTranscript } = require("youtube-transcript");
      const videoId = extractYouTubeId(file.fileUrl) ?? file.fileUrl;
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: "en" });
        extractedText = transcript.map((t: any) => t.text).join(" ");
      } catch (err: any) {
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId);
          extractedText = transcript.map((t: any) => t.text).join(" ");
        } catch {
          logger.warn(`Failed to fetch youtube transcript for ${file.fileUrl}: ${err.message}`);
          extractedText = `[YouTube Video: ${file.fileUrl}] No transcript available.`;
        }
      }
    } else if (file.type === "website") {
      try {
        const res = await fetch(file.fileUrl);
        const html = await res.text();
        // Basic HTML stripping
        extractedText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } catch (err: any) {
        logger.warn(`Failed to fetch website ${file.fileUrl}: ${err.message}`);
      }
    } else {
      // Download file from Supabase Storage
      const { data: fileData, error: downloadError } = await supabaseAdmin.storage
        .from("project-files")
        .download(file.fileUrl);

      if (downloadError || !fileData) {
        throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Extract Text based on type
      if (file.type === "pdf") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        try {
          const parsed = await parser.getText();
          extractedText = parsed.text;
        } finally {
          await parser.destroy();
        }
      } else if (file.type === "docx") {
        const parsed = await mammoth.extractRawText({ buffer });
        extractedText = parsed.value;
      } else if (file.type === "txt") {
        extractedText = buffer.toString("utf-8");
      } else if (file.type === "pptx") {
        const { parseOfficeAsync } = require("officeparser");
        extractedText = await parseOfficeAsync(buffer);
      } else if (file.type === "image") {
        const res = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            "Please describe this image in great detail, including any text written in it. This will be used for vector search retrieval.",
            { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } }
          ]
        });
        extractedText = res.text || "";
      } else {
        logger.warn(`Unsupported file type for extraction: ${file.type}`);
        await db.update(projectFiles).set({ status: "processed" }).where(eq(projectFiles.id, fileId));
        return;
      }
    }

    if (!extractedText.trim()) {
      logger.warn(`No text extracted from file: ${file.filename}`);
      await db.update(projectFiles).set({ status: "processed" }).where(eq(projectFiles.id, fileId));
      return;
    }

    // Chunking
    const chunks = chunkText(extractedText);
    logger.info(`Extracted ${chunks.length} chunks from ${file.filename}`);

    // Embeddings & Storage
    let savedChunks = 0;
    for (const text of chunks) {
      try {
        const response = await ai.models.embedContent({
          model: "gemini-embedding-2",
          contents: text,
          config: { outputDimensionality: 768 },
        });

        const embedding = response.embeddings?.[0]?.values;
        if (embedding) {
          await db.insert(knowledgeChunks).values({
            projectFileId: file.id,
            projectId: file.projectId,
            chunkText: text,
            embedding: embedding,
          });
          savedChunks++;
        }
      } catch (embedError) {
        logger.error({ err: embedError }, "Failed to embed chunk");
      }
    }

    if (savedChunks === 0) {
      throw new Error(`No knowledge chunks could be embedded for ${file.filename}`);
    }

    // Mark as processed
    await db.update(projectFiles).set({ status: "processed" }).where(eq(projectFiles.id, fileId));
    logger.info(`Successfully processed file ${file.filename}`);

  } catch (error) {
    logger.error({ err: error }, `Error processing file ${fileId}`);
    await db.update(projectFiles).set({ status: "error" }).where(eq(projectFiles.id, fileId));
  }
}
