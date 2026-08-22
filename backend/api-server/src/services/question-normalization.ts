import { db, frequentQuestions } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

/**
 * Safe text normalization for user questions.
 * Preserves core question meaning while stripping leading chatter,
 * unnecessary punctuation, and casing differences.
 */
export function normalizeQuestion(rawQuestion: string): string {
  if (!rawQuestion || typeof rawQuestion !== "string") return "";

  let cleaned = rawQuestion.trim().toLowerCase();

  // 1. Remove surrounding/unnecessary punctuation
  cleaned = cleaned.replace(/[?.,!;:""''`~@#$%^&*()_+={}\[\]\\|/<>]/g, " ");

  // 2. Normalize contractions and common leading filler phrases
  cleaned = cleaned
    .replace(/\bwhat's\b/g, "what is")
    .replace(/\bwhere's\b/g, "where is")
    .replace(/\bhow's\b/g, "how is")
    .replace(/\bi'm\b/g, "i am")
    .replace(/\bcan you please\b/g, "")
    .replace(/\bplease tell me\b/g, "")
    .replace(/\bcould you tell me\b/g, "")
    .replace(/\bi want to know\b/g, "");

  // 3. Collapse multiple spaces into single space
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || rawQuestion.trim().toLowerCase();
}

/**
 * Determine a high-level category/intent for frequent question reporting.
 */
export function categorizeQuestion(questionText: string): { category: string; intent: string } {
  const lower = questionText.toLowerCase();

  if (/\b(price|pricing|cost|plan|subscription|rate|fee|discount)\b/i.test(lower)) {
    return { category: "Sales & Pricing", intent: "pricing" };
  }
  if (/\b(install|setup|integrate|embed|api|webhook|sdk|code)\b/i.test(lower)) {
    return { category: "Integration & Setup", intent: "integration" };
  }
  if (/\b(feature|function|capability|support|ai|model|rag|custom)\b/i.test(lower)) {
    return { category: "Product Capabilities", intent: "product" };
  }
  if (/\b(contact|email|phone|call|support|help|human|talk)\b/i.test(lower)) {
    return { category: "Support & Contact", intent: "support" };
  }
  if (/\b(login|password|account|user|security|privacy|gdpr|data)\b/i.test(lower)) {
    return { category: "Account & Security", intent: "account" };
  }

  return { category: "General Inquiries", intent: "general" };
}

/**
 * Track user question in the frequent_questions table.
 * Uses upsert (onConflictDoUpdate) to increment asked count efficiently.
 */
export async function trackUserQuestion(params: {
  projectId: string;
  questionText: string;
}): Promise<void> {
  const { projectId, questionText } = params;
  if (!questionText || questionText.trim().length < 3) return;

  const norm = normalizeQuestion(questionText);
  if (!norm) return;

  const { category, intent } = categorizeQuestion(questionText);

  try {
    const existing = await db.query.frequentQuestions.findFirst({
      where: and(
        eq(frequentQuestions.projectId, projectId as any),
        eq(frequentQuestions.normalizedQuestion, norm)
      ),
    });

    if (existing) {
      await db
        .update(frequentQuestions)
        .set({
          count: existing.count + 1,
          lastAskedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(frequentQuestions.id, existing.id));
    } else {
      await db.insert(frequentQuestions).values({
        projectId: projectId as any,
        questionText: questionText.trim(),
        normalizedQuestion: norm,
        category,
        intent,
        count: 1,
        lastAskedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (error) {
    console.error("[QUESTION_NORMALIZATION] Failed to track user question:", error);
  }
}
