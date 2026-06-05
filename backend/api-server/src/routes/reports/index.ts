import { Router } from "express";
import { db, reports, projects, knowledgeChunks } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ai } from "@workspace/integrations-gemini-ai";
import { supabaseAdmin } from "../../lib/supabase";
import { randomUUID } from "crypto";
import { buildKnowledgeIsolationCondition } from "../../services/knowledge-isolation";

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
    const userId = (req as any).auth?.userId ?? null;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Check project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Gather knowledge to summarize
    const isolationCondition = buildKnowledgeIsolationCondition({
      scope: "project",
      userId,
      projectId,
      userRole: (req as any).auth?.role ?? "user",
    });
    if (!isolationCondition) {
      res.status(400).json({ error: "Invalid knowledge context" });
      return;
    }
    const chunks = await db.select().from(knowledgeChunks).where(isolationCondition);
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

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    
    let markdownContent = result.text || "# Empty Report";
    // Strip markdown code block wrapper if present
    if (markdownContent.startsWith("```markdown")) {
        markdownContent = markdownContent.replace(/^```markdown\n?/, "").replace(/```$/, "");
    }

    // Convert MD to PDF
    const { mdToPdf } = await import("md-to-pdf");
    const pdf = await mdToPdf({ content: markdownContent }).catch(err => {
      req.log.error({ err }, "md-to-pdf failed");
      throw new Error("Failed to generate PDF");
    });

    if (!pdf) throw new Error("Failed to generate PDF");

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
    const userId = (req as any).auth?.userId ?? null;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (project.userId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const list = await db.select().from(reports).where(eq(reports.projectId, projectId)).orderBy(reports.createdAt);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
