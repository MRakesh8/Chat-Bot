import { db, knowledgeGaps } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { normalizeQuestion } from "./question-normalization";

export interface KnowledgeGapSignal {
  projectId: string;
  questionText: string;
  sessionId?: string;
  sourceUrl?: string;
  confidence?: "low" | "medium" | "high";
  reason: "NO_RAG_MATCH" | "LOW_CONFIDENCE" | "AI_FALLBACK" | "EXPLICIT_UNKNOWN" | "USER_UNHELPFUL";
  isSystemError?: boolean;
}

const FALLBACK_PHRASES = [
  "i don't have information",
  "i do not have information",
  "i'm sorry, i don't know",
  "i am sorry, i don't know",
  "i cannot answer that",
  "no relevant context found",
  "i couldn't find any information",
  "please contact support for details",
  "information is unavailable",
];

export function isFallbackResponse(responseText: string): boolean {
  if (!responseText) return false;
  const lower = responseText.toLowerCase();
  return FALLBACK_PHRASES.some((phrase) => lower.includes(phrase));
}

export async function trackKnowledgeGap(signal: KnowledgeGapSignal): Promise<void> {
  const { projectId, questionText, sessionId, sourceUrl, confidence = "low", reason, isSystemError } = signal;

  // Rule 7: Avoid marking temporary provider/API failures as knowledge gaps
  if (isSystemError) {
    return;
  }

  if (!questionText || questionText.trim().length < 3) return;

  const norm = normalizeQuestion(questionText);
  if (!norm) return;

  try {
    const existing = await db.query.knowledgeGaps.findFirst({
      where: and(
        eq(knowledgeGaps.projectId, projectId as any),
        eq(knowledgeGaps.normalizedQuestion, norm)
      ),
    });

    if (existing) {
      await db
        .update(knowledgeGaps)
        .set({
          askedCount: existing.askedCount + 1,
          sessionId: sessionId || existing.sessionId,
          sourceUrl: sourceUrl || existing.sourceUrl,
          confidence,
          reason,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeGaps.id, existing.id));
    } else {
      await db.insert(knowledgeGaps).values({
        projectId: projectId as any,
        questionText: questionText.trim(),
        normalizedQuestion: norm,
        askedCount: 1,
        isResolved: false,
        sourceUrl: sourceUrl || null,
        sessionId: sessionId as any,
        confidence,
        reason,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[UNANSWERED_QUESTIONS] Failed to track knowledge gap:", error);
  }
}
