import { submitMessageFeedback, submitProjectFeedback } from "../services/feedback";
import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { chatSessions } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/projects/:projectId/messages/:messageId/feedback", async (req: any, res: any): Promise<any> => {
  try {
    const { projectId, messageId } = req.params;
    const { sessionId, type, comment, channel = "WEBSITE" } = req.body;
    
    if (!sessionId || !type) return res.status(400).json({ error: "Missing required fields" });
    if (type !== "LIKE" && type !== "DISLIKE") return res.status(400).json({ error: "Invalid type" });
    if (!UUID_RE.test(sessionId)) return res.status(400).json({ error: "Invalid session ID format" });
    
    const [session] = await db.select({ customerId: chatSessions.customerId, projectId: chatSessions.projectId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.projectId !== projectId) return res.status(403).json({ error: "Session does not belong to project" });
    
    await submitMessageFeedback({ projectId, sessionId, messageId, customerId: session.customerId || undefined, type, comment, channel });
    return res.json({ success: true });
  } catch (err: any) {
    req.log?.error ? req.log.error(err, "Error submitting message feedback") : console.error("Error submitting message feedback", err);
    return res.status(400).json({ error: "Error submitting feedback" });
  }
});

router.post("/projects/:projectId/feedback", async (req: any, res: any): Promise<any> => {
  try {
    const { projectId } = req.params;
    const { sessionId, category, rating, comment, channel = "WEBSITE" } = req.body;
    
    if (!comment) return res.status(400).json({ error: "Comment is required" });
    
    let customerId = undefined;
    if (sessionId && UUID_RE.test(sessionId)) {
      const [session] = await db.select({ customerId: chatSessions.customerId, projectId: chatSessions.projectId }).from(chatSessions).where(eq(chatSessions.id, sessionId));
      if (session && session.projectId !== projectId) return res.status(403).json({ error: "Session does not belong to project" });
      if (session && session.customerId) customerId = session.customerId;
    }
    
    await submitProjectFeedback({ projectId, customerId, category, rating, comment, channel });
    return res.json({ success: true });
  } catch (err: any) {
    req.log?.error ? req.log.error(err, "Error submitting project feedback") : console.error("Error submitting project feedback", err);
    return res.status(400).json({ error: "Error submitting feedback" });
  }
});
