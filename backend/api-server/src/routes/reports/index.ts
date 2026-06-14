import { Router } from "express";
import { db, reports, projects, chatSessions, messages, knowledgeChunks } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { ai } from "@workspace/integrations-gemini-ai";
import { supabaseAdmin } from "../../lib/supabase";
import { randomUUID } from "crypto";

const router = Router();

const GenerateReportBody = z.object({
  projectId: z.string(),
  title: z.string().optional(),
});

// POST /api/reports/generate
router.post("/generate", async (req, res) => {
  try {
    const parsed = GenerateReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const { projectId, title } = parsed.data;

    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Check project ownership
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) {
      res.status(404).json({ error: "Project not found or unauthorized" });
      return;
    }

    // Gather knowledge to summarize
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, projectId));
    const allKnowledge = chunks.map(c => c.chunkText).join("\n\n").slice(0, 50000); // Take up to 50k chars to avoid token limits

    // Trigger Gemini to write the report
    const prompt = `You are a professional Business Analyst and Technical Writer.
    
    Please generate a comprehensive, formal, and structured Project Summary Report based on the following project knowledge.
    Use professional markdown formatting including Headings, Bullet Points, and bold text for emphasis.
    
    Project Name: ${project.name}
    Project Description: ${project.description || "N/A"}
    
    --- PROJECT KNOWLEDGE ---
    ${allKnowledge}
    
    Your output MUST be entirely valid Markdown without any wrapping \`\`\`markdown tags.`;

    const result = await ai.models.generateContent(userId, {
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    let markdownContent = result.text || "# Empty Report";
    // Strip markdown code block wrapper if present
    if (markdownContent.startsWith("```markdown")) {
        markdownContent = markdownContent.replace(/^```markdown\n?/, "").replace(/```$/, "");
    }

    // Convert MD to PDF
    let pdf: any;
    try {
      const { mdToPdf } = await import("md-to-pdf");
      pdf = await mdToPdf(
        { content: markdownContent },
        {
          launch_options: {
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
          },
        }
      );
      if (!pdf || !pdf.content) {
         throw new Error("Empty PDF generated");
      }
    } catch (err: any) {
      req.log.error({ err }, "md-to-pdf or puppeteer failed");
      return res.json({ success: false, reason: "Chrome not installed" });
    }

    // Upload to Supabase Storage
    const fileName = `reports/${projectId}/${randomUUID()}.pdf`;
    const { data, error } = await supabaseAdmin
      .storage
      .from("project-files")
      .upload(fileName, pdf.content, {
        contentType: "application/pdf",
        upsert: false
      });

    if (error) {
      req.log.error({ error }, "Supabase upload failed");
      res.status(500).json({ error: "Failed to save report" });
      return;
    }

    const { data: { publicUrl } } = supabaseAdmin
      .storage
      .from("project-files")
      .getPublicUrl(fileName);

    // Save to DB
    const reportTitle = title || `${project.name} - Summary Report`;
    const [report] = await db.insert(reports).values({
      projectId,
      title: reportTitle,
      contentUrl: publicUrl,
    }).returning();

    res.json(report);
  } catch (err: any) {
    req.log.error({ err }, "Generate report error");
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// GET /api/reports/project/:projectId
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
    if (!project) {
      res.status(404).json({ error: "Project not found or unauthorized" });
      return;
    }

    const list = await db.select().from(reports).where(eq(reports.projectId, projectId)).orderBy(reports.createdAt);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
