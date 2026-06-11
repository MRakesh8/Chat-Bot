import { db, knowledgeChunks, knowledgeSources } from "@workspace/db";
import { supabaseAdmin } from "../lib/supabase";
import { ai } from "@workspace/integrations-gemini-ai";
import mammoth from "mammoth";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { extractYouTubeId, fetchYouTubeTranscriptText } from "../lib/youtube";

// Helper to chunk text
function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = index + chunkSize;
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end);
      if (boundary > index + overlap) end = boundary;
    }
    chunks.push(text.slice(index, end).trim());
    index = end - overlap;
  }
  return chunks.filter((c) => c.length > 0);
}

export async function processKnowledgeSource(sourceId: string) {
  try {
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
    if (!source) throw new Error(`Source ${sourceId} not found`);

    if (source.status === "processed") {
      logger.info(`Source ${sourceId} is already processed`);
      return;
    }

    await db.update(knowledgeSources).set({ status: "processing" }).where(eq(knowledgeSources.id, sourceId));
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.knowledgeSourceId, sourceId));

    let extractedText = "";

    try {
      if (source.sourceType === "youtube") {
        const videoId = extractYouTubeId(source.sourceUrl || "");
        if (!videoId) {
          throw new Error(`Invalid YouTube URL: ${source.sourceUrl}`);
        }
        extractedText = await fetchYouTubeTranscriptText(videoId);
      } else if (source.sourceType === "website") {
        const res = await fetch(source.sourceUrl as string);
        if (!res.ok) throw new Error(`Failed to fetch website: ${res.statusText}`);
        const html = await res.text();
        // A simple html extraction, ideally use cheerio/readability
        extractedText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else if (source.sourceType === "github") {
        let repoPath = source.sourceUrl?.replace(/https?:\/\/github\.com\//, "");
        if (repoPath?.endsWith("/")) repoPath = repoPath.slice(0, -1);
        
        const headers = { "User-Agent": "Aria-AI-Knowledge-Base" };
        const repoRes = await fetch(`https://api.github.com/repos/${repoPath}`, { headers });
        if (!repoRes.ok) throw new Error(`Failed to fetch github repo details for ${repoPath}`);
        const repoData = await repoRes.json();
        
        let readmeText = "";
        const readmeRes = await fetch(`https://api.github.com/repos/${repoPath}/readme`, { headers });
        if (readmeRes.ok) {
          const readmeData = await readmeRes.json();
          if (readmeData.content) {
            readmeText = Buffer.from(readmeData.content, "base64").toString("utf8");
          }
        }
        extractedText = `Repository: ${repoData.full_name}\nDescription: ${repoData.description || "No description"}\n\nREADME:\n${readmeText}`;
        
      } else if (source.sourceType === "note") {
        extractedText = source.notes || "";
      } else if (source.sourceType === "instagram" || source.sourceType === "video") {
        // Fallback or generic AI-based video/audio processing
        if (source.sourceUrl) {
          throw new Error("Direct Instagram/Video URL scraping not fully supported without proxy/auth. Please upload video file instead.");
        }
      }

      // If it's an uploaded file (sourceType = file or it has fileId)
      if (source.fileId) {
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from("project-files")
          .download(source.fileId);

        if (downloadError || !fileData) {
          throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const filename = source.filename?.toLowerCase() || "";

        if (filename.endsWith(".pdf")) {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: buffer });
          try {
            const parsed = await parser.getText();
            extractedText = parsed.text;
          } finally {
            await parser.destroy();
          }
        } else if (filename.endsWith(".docx")) {
          const parsed = await mammoth.extractRawText({ buffer });
          extractedText = parsed.value;
        } else if (filename.endsWith(".txt") || filename.endsWith(".md") || filename.endsWith(".csv")) {
          extractedText = buffer.toString("utf-8");
        } else if (filename.endsWith(".pptx")) {
          const { parseOfficeAsync } = await import("officeparser");
          extractedText = await parseOfficeAsync(buffer);
        } else if (filename.match(/\.(png|jpe?g|webp)$/)) {
          const res = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              "Please describe this image in great detail, including any text written in it. This will be used for vector search retrieval.",
              { inlineData: { mimeType: "image/jpeg", data: buffer.toString("base64") } }
            ]
          });
          extractedText = res.text || "";
        } else if (filename.match(/\.(mp4|mp3|wav|mov|webm)$/)) {
           // Audio/Video processing via Gemini
           const res = await ai.models.generateContent({
             model: "gemini-1.5-pro",
             contents: [
               "Please transcribe the audio from this file, and describe any visual information if it is a video. Return the full text transcript.",
               { inlineData: { mimeType: fileData.type || "video/mp4", data: buffer.toString("base64") } }
             ]
           });
           extractedText = res.text || "";
        } else if (filename.endsWith(".zip")) {
          const AdmZipModule = await import("adm-zip");
          const AdmZip = AdmZipModule.default || AdmZipModule;
          const zip = new AdmZip(buffer);
          const zipEntries = zip.getEntries();
          let combinedText = "";
          for (const zipEntry of zipEntries) {
            if (!zipEntry.isDirectory) {
              const ext = zipEntry.name.split('.').pop()?.toLowerCase();
              if (["txt", "md", "csv"].includes(ext || "")) {
                combinedText += `\n\n--- File: ${zipEntry.entryName} ---\n`;
                combinedText += zipEntry.getData().toString("utf8");
              }
            }
          }
          extractedText = combinedText;
          if (!extractedText) throw new Error("No supported text files found in ZIP");
        } else {
          throw new Error(`Unsupported file type: ${filename}`);
        }
      }

      if (!extractedText.trim()) {
        throw new Error("No text extracted from source.");
      }

      const chunks = chunkText(extractedText);
      logger.info(`Extracted ${chunks.length} chunks from ${sourceId}`);

      let savedChunks = 0;
      for (const text of chunks) {
        let embedded = false;
        for (let attempt = 0; attempt < 3 && !embedded; attempt++) {
          try {
            const response = await ai.models.embedContent({
              model: "gemini-embedding-2",
              contents: text,
              config: { outputDimensionality: 768 },
            });

            const embedding = response.embeddings?.[0]?.values;
            if (embedding) {
              await db.insert(knowledgeChunks).values({
                knowledgeSourceId: source.id,
                projectId: source.projectId,
                chunkText: text,
                embedding: embedding,
              });
              savedChunks++;
              embedded = true;
            }
          } catch (embedError) {
            if (attempt === 2) {
              logger.error({ err: embedError }, "Failed to embed chunk after retries");
            } else {
              await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
            }
          }
        }
      }

      if (savedChunks === 0) {
        throw new Error("No knowledge chunks could be embedded");
      }

      // Successful retrieval test point - we assume success if chunks > 0 saved
      await db.update(knowledgeSources).set({ status: "processed" }).where(eq(knowledgeSources.id, sourceId));
      logger.info(`Successfully processed source ${sourceId}`);

    } catch (err: any) {
      logger.error({ err }, `Processing pipeline failed for source ${sourceId}`);
      throw err; // Caught by outer block
    }
  } catch (error) {
    logger.error({ err: error }, `Error processing source ${sourceId}`);
    await db.update(knowledgeSources).set({ status: "error" }).where(eq(knowledgeSources.id, sourceId));
  }
}
