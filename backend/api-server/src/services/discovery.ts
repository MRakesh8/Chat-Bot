import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { projects, knowledgeSources } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { enqueueKnowledgeProcessing } from "../lib/queue";
import { URL } from "url";
import dns from "dns/promises";

// Safe Discovery Constraints
const MAX_PAGES = 5;
const MAX_DEPTH = 1;
const PAGE_TIMEOUT_MS = 10000;
const TOTAL_JOB_TIMEOUT_MS = 45000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const CONCURRENCY_LIMIT = 2;

interface CapabilityEvidence {
  signalType: string;
  evidence: string;
  sourceUrl: string;
  confidence: "low" | "medium" | "high";
  detectedAt: string;
}

interface Capability {
  state: "DISCOVERED" | "UNAVAILABLE";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  executionMethod: "UNKNOWN";
  evidenceList: CapabilityEvidence[];
}

export class WebsiteDiscoveryService {
  private static BLOCKED_IP_RANGES = [
    // IPv4 private & loopback
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
    /^0\./,
    // IPv6 loopback & private
    /^::1$/,
    /^[fF][cCdD]/,
    /^[fF][eE][89aAbB]/
  ];

  private static async validateUrlSafe(inputUrl: string): Promise<URL> {
    const parsed = new URL(inputUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Invalid protocol. Only HTTP and HTTPS are allowed.");
    }

    if (parsed.hostname === "localhost") {
       throw new Error("Localhost is not allowed.");
    }

    try {
      const addresses = await dns.lookup(parsed.hostname, { all: true });
      for (const record of addresses) {
        for (const regex of this.BLOCKED_IP_RANGES) {
          if (regex.test(record.address)) {
             throw new Error(`Hostname resolves to a blocked private/internal IP: ${record.address}`);
          }
        }
      }
    } catch (e: any) {
      if (e.message.includes("blocked private")) throw e;
      throw new Error(`DNS lookup failed for ${parsed.hostname}`);
    }

    return parsed;
  }

  private static async fetchWithRedirectProtection(urlStr: string, redirectsLeft = MAX_REDIRECTS): Promise<{ html: string, finalUrl: URL }> {
    let currentUrl = await this.validateUrlSafe(urlStr);

    while (redirectsLeft >= 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);

      try {
        const res = await fetch(currentUrl.toString(), {
          method: "GET",
          signal: controller.signal,
          redirect: "manual", // Prevent native, unsafe following
          headers: {
            "User-Agent": "RAGHUB-DiscoveryBot/1.0",
            "Accept": "text/html,application/xhtml+xml,application/xml"
          }
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) throw new Error("Redirect location missing");
          if (redirectsLeft === 0) throw new Error("Too many redirects");
          
          const nextUrl = new URL(location, currentUrl);
          // Recursively validate the redirect destination
          currentUrl = await this.validateUrlSafe(nextUrl.toString()); 
          redirectsLeft--;
          continue;
        }

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const contentLength = res.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
           throw new Error("Response exceeds size limit");
        }

        const body = await res.text();
        if (body.length > MAX_RESPONSE_SIZE) {
           throw new Error("Response body exceeds size limit after reading");
        }

        return { html: body, finalUrl: currentUrl };
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error("Max redirects exceeded");
  }

  private static extractLinks(html: string, baseUrl: URL): string[] {
    const navLinks = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
    const validInternalUrls: string[] = [];
    
    for (const link of navLinks) {
      try {
        const resolvedUrl = new URL(link, baseUrl);
        // Same-domain restriction
        if (resolvedUrl.hostname === baseUrl.hostname && (resolvedUrl.protocol === "http:" || resolvedUrl.protocol === "https:")) {
           validInternalUrls.push(resolvedUrl.toString());
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }
    return [...new Set(validInternalUrls)];
  }

  private static analyzeHtml(html: string, sourceUrl: string): { platform: string, platformConfidence: string, businessType: string, businessTypeConfidence: string, intelligence: any } {
    let platform = "unknown";
    let platformConfidence = "low";
    let businessType = "unknown";
    let businessTypeConfidence = "low";
    const evidence: string[] = [];

    const lowerHtml = html.toLowerCase();

    // 1. Platform Detection
    if (lowerHtml.includes('content="wordpress') || lowerHtml.includes('/wp-content/')) {
       platform = "wordpress";
       platformConfidence = "high";
       evidence.push("WordPress specific paths or generator tag found.");
    } else if (lowerHtml.includes('cdn.shopify.com') || lowerHtml.includes('shopify.theme')) {
       platform = "shopify";
       platformConfidence = "high";
       evidence.push("Shopify CDN or theme variables found.");
    } else if (lowerHtml.includes('wix.com') || lowerHtml.includes('wix-image')) {
       platform = "wix";
       platformConfidence = "medium";
       evidence.push("Wix assets found.");
    } else if (lowerHtml.includes('webflow.com') || lowerHtml.includes('data-wf-site')) {
       platform = "webflow";
       platformConfidence = "high";
       evidence.push("Webflow data attributes found.");
    } else if (lowerHtml.includes('woocommerce')) {
       platform = "woocommerce";
       platformConfidence = "high";
       evidence.push("WooCommerce specific scripts found.");
    }

    // JSON-LD Extraction
    const jsonLdMatches = [...html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    const structuredData = jsonLdMatches.map(m => {
      try { return JSON.parse(m[1]); } catch(e) { return null; }
    }).filter(Boolean);

    const hasProductSchema = structuredData.some(d => JSON.stringify(d).includes('"@type":"Product"'));
    const hasHotelSchema = structuredData.some(d => JSON.stringify(d).includes('"@type":"Hotel"'));
    const hasRestaurantSchema = structuredData.some(d => JSON.stringify(d).includes('"@type":"Restaurant"'));

    // 2. Business Type Detection (Heuristics)
    if (platform === "shopify" || platform === "woocommerce") {
       businessType = "ecommerce";
       businessTypeConfidence = "high";
       evidence.push(`Platform ${platform} strongly implies ecommerce.`);
    } else {
      if (hasProductSchema || lowerHtml.includes('add to cart') || lowerHtml.includes('shopping-cart') || lowerHtml.includes('checkout')) {
         businessType = "ecommerce";
         businessTypeConfidence = hasProductSchema ? "high" : "medium";
         evidence.push("Product schema or cart-related keywords found.");
      } else if (hasHotelSchema || lowerHtml.includes('book a room') || lowerHtml.includes('check-in') || lowerHtml.includes('hotel')) {
         businessType = "hotel";
         businessTypeConfidence = hasHotelSchema ? "high" : "medium";
         evidence.push("Hotel schema or booking-related keywords found.");
      } else if (hasRestaurantSchema || (lowerHtml.includes('menu') && (lowerHtml.includes('order online') || lowerHtml.includes('restaurant')))) {
         businessType = "restaurant";
         businessTypeConfidence = hasRestaurantSchema ? "high" : "medium";
         evidence.push("Restaurant schema or menu-related keywords found.");
      } else if (lowerHtml.includes('real estate') || lowerHtml.includes('property listings')) {
         businessType = "real_estate";
         businessTypeConfidence = "medium";
         evidence.push("Real estate property listing keywords found.");
      }
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : undefined;

    const faviconMatch = html.match(/<link\s+rel=["'](?:shortcut\s+)?icon["']\s+href=["']([^"']+)["']/i) || html.match(/<link\s+href=["']([^"']+)["']\s+rel=["'](?:shortcut\s+)?icon["']/i);
    const favicon = faviconMatch ? faviconMatch[1].trim() : undefined;

    const intelligence = {
      title,
      description,
      favicon,
      evidence,
      structuredData,
      analyzedAt: new Date().toISOString()
    };

    return { platform, platformConfidence, businessType, businessTypeConfidence, intelligence };
  }

  private static extractCapabilities(html: string, sourceUrl: string, businessType: string, caps: Map<string, Capability>) {
    const timestamp = new Date().toISOString();
    const lowerHtml = html.toLowerCase();

    const addEvidence = (capKey: string, signalType: string, evidenceStr: string, confidence: "low" | "medium" | "high", riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") => {
      if (!caps.has(capKey)) {
        caps.set(capKey, { state: "DISCOVERED", riskLevel, executionMethod: "UNKNOWN", evidenceList: [] });
      }
      caps.get(capKey)!.evidenceList.push({ signalType, evidence: evidenceStr, sourceUrl, confidence, detectedAt: timestamp });
    };

    // SEARCH
    if (html.match(/<form[^>]*action=["'][^"']*search[^"']*["']/i) || html.match(/<input[^>]*type=["']search["']/i)) {
      if (businessType === "ecommerce") {
        addEvidence("product_search", "form_detection", "Product search form/input detected", "high", "LOW");
      } else if (businessType === "real_estate") {
        addEvidence("property_search", "form_detection", "Property search form/input detected", "high", "LOW");
      } else if (businessType === "hotel") {
        addEvidence("room_search", "form_detection", "Room search form/input detected", "high", "LOW");
      } else {
        addEvidence("search", "form_detection", "Generic search form/input detected", "high", "LOW");
      }
    }

    // E-COMMERCE: CART & CHECKOUT
    if (lowerHtml.includes('href="/cart"') || html.match(/<button[^>]*>.*?add to cart.*?<\/button>/i)) {
      addEvidence("add_to_cart", "element_detection", "Cart navigation or Add to Cart button detected", "medium", "MEDIUM");
    }
    if (lowerHtml.includes('href="/checkout"')) {
      addEvidence("checkout", "link_detection", "Checkout flow link detected", "high", "CRITICAL");
    }

    // BOOKING / APPOINTMENTS
    const hasBookingForm = html.match(/<form[^>]*>.*?date.*?<\/form>/is);
    const hasBookingKeywords = lowerHtml.includes('book now') || lowerHtml.includes('make an appointment');
    
    if (hasBookingForm) {
       addEvidence("booking", "form_detection", "Booking form with date fields detected", "high", "HIGH");
    } else if (hasBookingKeywords) {
       addEvidence("booking", "keyword_heuristics", "Booking keywords detected (weak evidence)", "low", "HIGH");
    }

    // CONTACT
    if (lowerHtml.includes('href="/contact"') || html.match(/<form[^>]*>.*?message.*?<\/form>/is)) {
      addEvidence("contact_information", "form_or_link", "Contact link or message form detected", "medium", "LOW");
    }
  }

  public static async runDiscovery(projectId: string, rawUrl: string, orgId: string): Promise<void> {
    const jobStartTime = Date.now();
    try {
      logger.info({ projectId, rawUrl }, "[DISCOVERY] Starting bounded multi-page discovery process");
      
      await db.update(projects).set({ discoveryStatus: "ANALYZING" } as any).where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));

      const visitedUrls = new Set<string>();
      const queue: { url: string, depth: number }[] = [{ url: rawUrl, depth: 0 }];
      
      let platform = "unknown";
      let businessType = "unknown";
      let intelligenceSnapshot: any = {};
      const capabilitiesMap = new Map<string, Capability>();
      const allExtractedLinks = new Set<string>();
      
      let homepageHtml: string | null = null;
      let homepageUrl: URL | null = null;

      // In-Memory Bounded BFS Crawl
      while (queue.length > 0 && visitedUrls.size < MAX_PAGES) {
        if (Date.now() - jobStartTime > TOTAL_JOB_TIMEOUT_MS) {
           logger.warn({ projectId }, "[DISCOVERY] Job timeout reached during multi-page crawl");
           break;
        }

        // Bounded concurrency processing
        const batch = queue.splice(0, CONCURRENCY_LIMIT);
        
        await Promise.all(batch.map(async (item) => {
          if (visitedUrls.has(item.url) || visitedUrls.size >= MAX_PAGES) return;
          visitedUrls.add(item.url);

          try {
            const { html, finalUrl } = await this.fetchWithRedirectProtection(item.url);
            
            // Only aggregate business logic from homepage for base profile
            if (item.depth === 0) {
               homepageHtml = html;
               homepageUrl = finalUrl;
               const analysis = this.analyzeHtml(html, finalUrl.toString());
               platform = analysis.platform;
               businessType = analysis.businessType;
               intelligenceSnapshot = analysis.intelligence;
            }

            // Extract capabilities from EVERY visited page
            this.extractCapabilities(html, finalUrl.toString(), businessType, capabilitiesMap);

            // Extract links for next depth
            if (item.depth < MAX_DEPTH) {
               const newLinks = this.extractLinks(html, finalUrl);
               for (const link of newLinks) {
                 allExtractedLinks.add(link);
                 // Prioritize high-value links (search, product, contact, book, cart, checkout)
                 const lowerLink = link.toLowerCase();
                 if (!visitedUrls.has(link) && (lowerLink.includes('search') || lowerLink.includes('product') || lowerLink.includes('contact') || lowerLink.includes('book') || lowerLink.includes('cart') || lowerLink.includes('checkout'))) {
                    queue.unshift({ url: link, depth: item.depth + 1 }); // Push to front for priority
                 } else if (!visitedUrls.has(link)) {
                    queue.push({ url: link, depth: item.depth + 1 });
                 }
               }
            }
          } catch (e: any) {
             logger.warn({ url: item.url, err: e.message }, "[DISCOVERY] Failed to fetch sub-page");
          }
        }));
      }

      if (!homepageHtml || !homepageUrl) {
         throw new Error("Failed to fetch or validate homepage URL");
      }

      // Finalize capability snapshot
      const capabilitiesObject: Record<string, Capability> = {};
      capabilitiesMap.forEach((val, key) => { capabilitiesObject[key] = val; });
      intelligenceSnapshot.capabilities = capabilitiesObject;
      intelligenceSnapshot.links = { discoveredInternal: Array.from(allExtractedLinks).slice(0, 50) };

      // Seamless RAG Integration for Homepage only (to prevent queue flooding)
      let sourceId: string | null = null;
      const [existingSource] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.projectId, projectId), eq(knowledgeSources.sourceUrl, (homepageUrl as any).toString())));
      
      if (existingSource) {
         sourceId = existingSource.id;
      } else {
         const [newSource] = await db.insert(knowledgeSources).values({
           projectId,
           sourceType: "website",
           sourceUrl: (homepageUrl as any).toString(),
           title: intelligenceSnapshot.title || "Website Homepage",
           rawContent: homepageHtml,
           status: "pending"
         }).returning();
         sourceId = newSource.id;
      }

      // Completely replace snapshot
      await db.update(projects)
        .set({
           platform: platform as any,
           businessType: businessType as any,
           intelligence: intelligenceSnapshot,
           discoveryStatus: "READY",
           websiteUrl: (homepageUrl as any).toString(),
        } as any)
        .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
      
      logger.info({ projectId, pagesCrawled: visitedUrls.size }, "[DISCOVERY] Discovery process completed successfully");

      if (sourceId) {
         enqueueKnowledgeProcessing(sourceId).catch(err => logger.error({ err, sourceId }, "Failed to enqueue knowledge processing after discovery"));
      }

    } catch (err: any) {
      logger.error({ err, projectId }, "[DISCOVERY] Unhandled error in discovery process");
      await db.update(projects)
           .set({ discoveryStatus: "FAILED" } as any)
           .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)))
           .catch(e => logger.error({ err: e }, "Failed to update fallback status"));
    }
  }
}
