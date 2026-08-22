import { db, widgetLeads } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";

export interface LeadScoreConfig {
  weights: {
    pricing: number;
    demo: number;
    quoteContact: number;
    purchase: number;
    contactInfoProvided: number;
  };
  thresholds: {
    medium: number;
    high: number;
  };
}

export const DEFAULT_LEAD_SCORE_CONFIG: LeadScoreConfig = {
  weights: {
    pricing: 30,
    demo: 40,
    quoteContact: 40,
    purchase: 50,
    contactInfoProvided: 50,
  },
  thresholds: {
    medium: 40,
    high: 70,
  },
};

export interface ExtractedLeadInfo {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  intent?: string;
  signals: string[];
  scoreValue: number;
  score: "LOW" | "MEDIUM" | "HIGH";
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

export function detectLeadSignals(text: string, config: LeadScoreConfig = DEFAULT_LEAD_SCORE_CONFIG): ExtractedLeadInfo {
  const lower = text.toLowerCase();
  const signals: string[] = [];
  let scoreValue = 10; // base engagement score

  // 1. Contact Information Extraction
  const emailMatch = text.match(EMAIL_REGEX);
  const phoneMatch = text.match(PHONE_REGEX);
  
  const email = emailMatch ? emailMatch[0] : undefined;
  const phone = phoneMatch ? phoneMatch[0] : undefined;

  if (email || phone) {
    signals.push("CONTACT_INFO_PROVIDED");
    scoreValue += config.weights.contactInfoProvided;
  }

  // 2. Intent Keyword Detection
  if (/\b(price|pricing|cost|how much|plans?|subscription|tier|fees?)\b/i.test(lower)) {
    signals.push("PRICING_INTEREST");
    scoreValue += config.weights.pricing;
  }

  if (/\b(demo|walkthrough|tour|show me|preview|schedule|book a time)\b/i.test(lower)) {
    signals.push("DEMO_REQUEST");
    scoreValue += config.weights.demo;
  }

  if (/\b(quote|quotation|estimate|contact us|talk to sales|reach out|call me|consultation)\b/i.test(lower)) {
    signals.push("QUOTE_CONTACT");
    scoreValue += config.weights.quoteContact;
  }

  if (/\b(buy|purchase|checkout|order|subscribe|sign up|onboard|get started|payment)\b/i.test(lower)) {
    signals.push("PURCHASE_INTENT");
    scoreValue += config.weights.purchase;
  }

  // 3. Name & Company extraction hints
  let name: string | undefined;
  let company: string | undefined;

  const nameMatch = text.match(/(?:my name is|i am|i'm)\s+([a-zA-Z\s]{2,30})/i);
  if (nameMatch && nameMatch[1]) {
    name = nameMatch[1].trim();
  }

  const companyMatch = text.match(/(?:from|company|work at|organization)\s+([a-zA-Z0-9\s]{2,40})/i);
  if (companyMatch && companyMatch[1]) {
    company = companyMatch[1].trim();
  }

  // Determine intent category
  let intent = "general";
  if (signals.includes("PURCHASE_INTENT")) intent = "purchase";
  else if (signals.includes("DEMO_REQUEST")) intent = "demo";
  else if (signals.includes("QUOTE_CONTACT")) intent = "quote_contact";
  else if (signals.includes("PRICING_INTEREST")) intent = "pricing";
  else if (signals.includes("CONTACT_INFO_PROVIDED")) intent = "contact";

  // Score categorization
  let score: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (scoreValue >= config.thresholds.high) {
    score = "HIGH";
  } else if (scoreValue >= config.thresholds.medium) {
    score = "MEDIUM";
  }

  return {
    name,
    email,
    phone,
    company,
    intent,
    signals,
    scoreValue,
    score,
  };
}

export async function processAndSaveLead(params: {
  projectId: string;
  sessionId?: string;
  sourcePageUrl?: string;
  userMessage: string;
  config?: LeadScoreConfig;
}): Promise<any | null> {
  const { projectId, sessionId, sourcePageUrl, userMessage, config } = params;
  
  const extracted = detectLeadSignals(userMessage, config);

  // Only create or update a lead if there's a strong lead signal (contact info or high-intent signal)
  if (extracted.signals.length === 0) {
    return null; // Do not treat generic questions as leads automatically
  }

  try {
    // Check if an existing lead matches this session, email, or phone for the same project
    const existingLead = await db.query.widgetLeads.findFirst({
      where: and(
        eq(widgetLeads.projectId, projectId as any),
        or(
          sessionId ? eq(widgetLeads.sessionId, sessionId as any) : sql`false`,
          extracted.email ? eq(widgetLeads.email, extracted.email) : sql`false`,
          extracted.phone ? eq(widgetLeads.phone, extracted.phone) : sql`false`
        )
      ),
    });

    if (existingLead) {
      // Merge/update existing lead safely
      const newScoreValue = Math.max(existingLead.scoreValue || 0, extracted.scoreValue);
      const newScore = newScoreValue >= (config?.thresholds.high || DEFAULT_LEAD_SCORE_CONFIG.thresholds.high)
        ? "HIGH"
        : newScoreValue >= (config?.thresholds.medium || DEFAULT_LEAD_SCORE_CONFIG.thresholds.medium)
        ? "MEDIUM"
        : "LOW";

      const updated = await db
        .update(widgetLeads)
        .set({
          name: extracted.name || existingLead.name || "Anonymous Lead",
          email: extracted.email || existingLead.email,
          phone: extracted.phone || existingLead.phone,
          company: extracted.company || existingLead.company,
          sessionId: sessionId || existingLead.sessionId,
          sourcePageUrl: sourcePageUrl || existingLead.sourcePageUrl,
          userIntent: extracted.intent !== "general" ? extracted.intent : existingLead.userIntent,
          score: newScore,
          scoreValue: newScoreValue,
          updatedAt: new Date(),
        })
        .where(eq(widgetLeads.id, existingLead.id))
        .returning();

      return updated[0];
    } else {
      // Create new lead record
      const [inserted] = await db
        .insert(widgetLeads)
        .values({
          projectId: projectId as any,
          sessionId: sessionId as any,
          name: extracted.name || "Anonymous Lead",
          email: extracted.email || null,
          phone: extracted.phone || null,
          company: extracted.company || null,
          sourcePageUrl: sourcePageUrl || null,
          userIntent: extracted.intent,
          status: "NEW",
          score: extracted.score,
          scoreValue: extracted.scoreValue,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return inserted;
    }
  } catch (error) {
    console.error("[LEAD_DETECTION] Failed to process/save lead:", error);
    return null;
  }
}
