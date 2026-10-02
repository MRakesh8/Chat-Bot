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

  public static async validateUrlSafe(inputUrl: string): Promise<URL> {
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

  public static async fetchWithRedirectProtection(urlStr: string, redirectsLeft = MAX_REDIRECTS): Promise<{ html: string, finalUrl: URL }> {
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

  public static classifyPageUrl(urlStr: string, pageTitle = ""): { category: string; priority: number } {
    const lowerUrl = urlStr.toLowerCase();
    const lowerTitle = pageTitle.toLowerCase();

    if (lowerUrl.includes("/pricing") || lowerUrl.includes("/plans") || lowerUrl.includes("/rates") || lowerUrl.includes("/price") || lowerUrl.includes("/cost") || lowerTitle.includes("pricing")) {
      return { category: "PRICING", priority: 90 };
    }
    if (lowerUrl.includes("/product") || lowerUrl.includes("/shop") || lowerUrl.includes("/store") || lowerUrl.includes("/catalog") || lowerUrl.includes("/item") || lowerTitle.includes("product") || lowerTitle.includes("shop")) {
      return { category: "PRODUCTS", priority: 85 };
    }
    if (lowerUrl.includes("/service") || lowerUrl.includes("/solution") || lowerUrl.includes("/offering") || lowerUrl.includes("/what-we-do") || lowerTitle.includes("service")) {
      return { category: "SERVICES", priority: 80 };
    }
    if (lowerUrl.includes("/contact") || lowerUrl.includes("/location") || lowerUrl.includes("/reach-us") || lowerUrl.includes("/support") || lowerTitle.includes("contact")) {
      return { category: "CONTACT", priority: 75 };
    }
    if (lowerUrl.includes("/faq") || lowerUrl.includes("/help") || lowerUrl.includes("/support-center") || lowerUrl.includes("/kb") || lowerTitle.includes("faq")) {
      return { category: "FAQ", priority: 70 };
    }
    if (lowerUrl.includes("/book") || lowerUrl.includes("/schedule") || lowerUrl.includes("/appointment") || lowerUrl.includes("/reservation") || lowerTitle.includes("book")) {
      return { category: "BOOKING", priority: 65 };
    }
    if (lowerUrl.includes("/about") || lowerUrl.includes("/company") || lowerUrl.includes("/our-story") || lowerUrl.includes("/who-we-are") || lowerTitle.includes("about")) {
      return { category: "ABOUT", priority: 60 };
    }
    if (lowerUrl.includes("/privacy") || lowerUrl.includes("/terms") || lowerUrl.includes("/refund") || lowerUrl.includes("/legal") || lowerTitle.includes("privacy")) {
      return { category: "POLICY", priority: 50 };
    }

    try {
      const parsed = new URL(urlStr);
      if (parsed.pathname === "/" || parsed.pathname === "" || parsed.pathname === "/index.html") {
        return { category: "HOME", priority: 100 };
      }
    } catch (e) {}

    return { category: "OTHER", priority: 10 };
  }

  private static extractContactDetails(html: string): { emails: string[], phones: string[], addresses: string[], hours: string[] } {
    const emails = new Set<string>();
    const phones = new Set<string>();
    const addresses = new Set<string>();
    const hours = new Set<string>();

    const mailtoMatches = [...html.matchAll(/href=["']mailto:([^"'\?]+)["']/gi)];
    for (const m of mailtoMatches) {
      const email = m[1].trim();
      if (email && !email.includes(".png") && !email.includes("schema@org") && !email.includes("wix@")) {
        emails.add(email);
      }
    }

    const emailRegexMatches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    for (const em of emailRegexMatches) {
      if (!em.includes(".png") && !em.includes("schema@org") && !em.includes("wix@") && !em.includes("example.com")) {
        emails.add(em);
      }
    }

    const telMatches = [...html.matchAll(/href=["']tel:([^"']+)\b["']/gi)];
    for (const m of telMatches) {
      phones.add(m[1].trim());
    }

    const hoursMatch = html.match(/(?:mon(?:day)?\s*[-–]\s*fri(?:day)?|mon(?:day)?\s*[-–]\s*sat(?:urday)?|open\s+24\/7|hours?:?\s*[^<]+)/gi);
    if (hoursMatch) {
      for (const h of hoursMatch.slice(0, 3)) {
        const clean = h.replace(/<[^>]+>/g, '').trim();
        if (clean.length > 5 && clean.length < 80) hours.add(clean);
      }
    }

    return {
      emails: Array.from(emails).slice(0, 5),
      phones: Array.from(phones).slice(0, 5),
      addresses: Array.from(addresses).slice(0, 3),
      hours: Array.from(hours).slice(0, 3)
    };
  }

  private static extractSocialLinks(html: string): Record<string, string> {
    const social: Record<string, string> = {};
    const platforms: { name: string; pattern: RegExp }[] = [
      { name: "twitter", pattern: /href=["'](https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[^"'\s]+)["']/i },
      { name: "linkedin", pattern: /href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"'\s]+)["']/i },
      { name: "facebook", pattern: /href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"'\s]+)["']/i },
      { name: "instagram", pattern: /href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"'\s]+)["']/i },
      { name: "youtube", pattern: /href=["'](https?:\/\/(?:www\.)?youtube\.com\/[^"'\s]+)["']/i },
      { name: "github", pattern: /href=["'](https?:\/\/(?:www\.)?github\.com\/[^"'\s]+)["']/i },
      { name: "tiktok", pattern: /href=["'](https?:\/\/(?:www\.)?tiktok\.com\/[^"'\s]+)["']/i }
    ];

    for (const { name, pattern } of platforms) {
      const match = html.match(pattern);
      if (match && match[1]) {
        social[name] = match[1];
      }
    }
    return social;
  }

  private static extractOfferings(html: string, structuredData: any[]): Array<{ name: string; description?: string; price?: string; category?: string }> {
    const offerings: Array<{ name: string; description?: string; price?: string; category?: string }> = [];
    const seenNames = new Set<string>();

    for (const data of structuredData) {
      if (!data) continue;
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item["@type"] === "Product" || item["@type"] === "Service" || item["@type"] === "Offer") {
          const name = item.name;
          if (name && typeof name === "string" && !seenNames.has(name)) {
            seenNames.add(name);
            offerings.push({
              name,
              description: typeof item.description === "string" ? item.description.slice(0, 200) : undefined,
              price: item.offers?.price ? `${item.offers.priceCurrency || '$'}${item.offers.price}` : undefined,
              category: item["@type"] === "Product" ? "product" : "service"
            });
          }
        }
      }
    }
    return offerings.slice(0, 15);
  }

  private static extractFaqs(html: string, structuredData: any[]): Array<{ question: string; answer: string }> {
    const faqs: Array<{ question: string; answer: string }> = [];
    const seen = new Set<string>();

    for (const data of structuredData) {
      if (!data) continue;
      if (data["@type"] === "FAQPage" && Array.isArray(data.mainEntity)) {
        for (const item of data.mainEntity) {
          if (item["@type"] === "Question" && item.name && item.acceptedAnswer?.text) {
            const q = item.name.trim();
            const a = item.acceptedAnswer.text.replace(/<[^>]+>/g, '').trim();
            if (q && a && !seen.has(q)) {
              seen.add(q);
              faqs.push({ question: q, answer: a.slice(0, 300) });
            }
          }
        }
      }
    }
    return faqs.slice(0, 10);
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

    const contactDetails = this.extractContactDetails(html);
    const socialLinks = this.extractSocialLinks(html);
    const offerings = this.extractOfferings(html, structuredData);
    const faqs = this.extractFaqs(html, structuredData);

    const intelligence = {
      title,
      description,
      favicon,
      evidence,
      structuredData,
      identity: {
        name: title || "Business Website",
        description,
        industry: businessType,
        platform
      },
      contact: contactDetails,
      socialLinks,
      offerings,
      faqs,
      pages: [],
      crawledPages: [],
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
      logger.info({ projectId, rawUrl }, "[DISCOVERY] Starting bounded multi-page discovery process (Website Intelligence 2.0)");
      
      await db.update(projects).set({ discoveryStatus: "ANALYZING" } as any).where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));

      const visitedUrls = new Set<string>();
      const queue: { url: string, depth: number, priority: number }[] = [{ url: rawUrl, depth: 0, priority: 100 }];
      
      let platform = "unknown";
      let businessType = "unknown";
      let intelligenceSnapshot: any = {};
      const capabilitiesMap = new Map<string, Capability>();
      const allExtractedLinks = new Set<string>();
      
      const crawledPagesMap: Array<{ url: string; title: string; category: string; summary: string }> = [];
      const crawledPagesHtml: Array<{ url: string; title: string; html: string }> = [];
      const aggregatedEmails = new Set<string>();
      const aggregatedPhones = new Set<string>();
      const aggregatedHours = new Set<string>();
      const aggregatedSocial: Record<string, string> = {};
      const aggregatedOfferings: Array<{ name: string; description?: string; price?: string; category?: string }> = [];
      const aggregatedFaqs: Array<{ question: string; answer: string }> = [];
      const offeringNames = new Set<string>();
      const faqQuestions = new Set<string>();

      let homepageHtml: string | null = null;
      let homepageUrl: URL | null = null;

      // Bounded BFS Crawl with Priority Queue
      while (queue.length > 0 && visitedUrls.size < MAX_PAGES) {
        if (Date.now() - jobStartTime > TOTAL_JOB_TIMEOUT_MS) {
           logger.warn({ projectId }, "[DISCOVERY] Job timeout reached during multi-page crawl");
           break;
        }

        // Sort queue by priority descending before splicing batch
        queue.sort((a, b) => b.priority - a.priority);
        const batch = queue.splice(0, CONCURRENCY_LIMIT);
        
        await Promise.all(batch.map(async (item) => {
          if (visitedUrls.has(item.url) || visitedUrls.size >= MAX_PAGES) return;
          visitedUrls.add(item.url);

          try {
            const { html, finalUrl } = await this.fetchWithRedirectProtection(item.url);
            
            const pageAnalysis = this.analyzeHtml(html, finalUrl.toString());
            const classification = this.classifyPageUrl(finalUrl.toString(), pageAnalysis.intelligence?.title || "");

            // Track page html & summary
            crawledPagesHtml.push({ url: finalUrl.toString(), title: pageAnalysis.intelligence?.title || classification.category, html });
            crawledPagesMap.push({
              url: finalUrl.toString(),
              title: pageAnalysis.intelligence?.title || classification.category,
              category: classification.category,
              summary: pageAnalysis.intelligence?.description || ""
            });

            // Aggregate Contact & Social
            pageAnalysis.intelligence?.contact?.emails?.forEach((e: string) => aggregatedEmails.add(e));
            pageAnalysis.intelligence?.contact?.phones?.forEach((p: string) => aggregatedPhones.add(p));
            pageAnalysis.intelligence?.contact?.hours?.forEach((h: string) => aggregatedHours.add(h));
            Object.assign(aggregatedSocial, pageAnalysis.intelligence?.socialLinks || {});

            // Aggregate Offerings
            pageAnalysis.intelligence?.offerings?.forEach((off: any) => {
              if (off.name && !offeringNames.has(off.name)) {
                offeringNames.add(off.name);
                aggregatedOfferings.push(off);
              }
            });

            // Aggregate FAQs
            pageAnalysis.intelligence?.faqs?.forEach((faq: any) => {
              if (faq.question && !faqQuestions.has(faq.question)) {
                faqQuestions.add(faq.question);
                aggregatedFaqs.push(faq);
              }
            });

            if (item.depth === 0) {
               homepageHtml = html;
               homepageUrl = finalUrl;
               platform = pageAnalysis.platform;
               businessType = pageAnalysis.businessType;
               intelligenceSnapshot = pageAnalysis.intelligence;
            }

            // Extract capabilities from EVERY visited page
            this.extractCapabilities(html, finalUrl.toString(), businessType, capabilitiesMap);

            // Extract links for next depth
            if (item.depth < MAX_DEPTH) {
               const newLinks = this.extractLinks(html, finalUrl);
               for (const link of newLinks) {
                 allExtractedLinks.add(link);
                 if (!visitedUrls.has(link)) {
                   const linkClassification = this.classifyPageUrl(link);
                   queue.push({ url: link, depth: item.depth + 1, priority: linkClassification.priority });
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

      // Finalize multi-page intelligence profile snapshot
      const capabilitiesObject: Record<string, Capability> = {};
      capabilitiesMap.forEach((val, key) => { capabilitiesObject[key] = val; });

      intelligenceSnapshot.capabilities = capabilitiesObject;
      intelligenceSnapshot.links = { discoveredInternal: Array.from(allExtractedLinks).slice(0, 50) };
      intelligenceSnapshot.pages = crawledPagesMap;
      intelligenceSnapshot.crawledPages = Array.from(visitedUrls);
      intelligenceSnapshot.contact = {
        emails: Array.from(aggregatedEmails),
        phones: Array.from(aggregatedPhones),
        hours: Array.from(aggregatedHours)
      };
      intelligenceSnapshot.socialLinks = aggregatedSocial;
      intelligenceSnapshot.offerings = aggregatedOfferings;
      intelligenceSnapshot.faqs = aggregatedFaqs;
      intelligenceSnapshot.identity = {
        name: intelligenceSnapshot.title || "Business Website",
        description: intelligenceSnapshot.description || "",
        industry: businessType,
        platform
      };

      // Freshness & Upsert Strategy for Knowledge Sources (Multi-Page Indexing)
      const sourceIdsToProcess: string[] = [];
      for (const pageItem of crawledPagesHtml) {
        const [existingSource] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.projectId, projectId), eq(knowledgeSources.sourceUrl, pageItem.url)));
        
        if (existingSource) {
           await db.update(knowledgeSources)
             .set({
               title: pageItem.title || "Website Page",
               rawContent: pageItem.html,
               status: "pending"
             })
             .where(eq(knowledgeSources.id, existingSource.id));
           sourceIdsToProcess.push(existingSource.id);
        } else {
           const [newSource] = await db.insert(knowledgeSources).values({
             projectId,
             sourceType: "website",
             sourceUrl: pageItem.url,
             title: pageItem.title || "Website Page",
             rawContent: pageItem.html,
             status: "pending"
           }).returning();
           sourceIdsToProcess.push(newSource.id);
        }
      }

      // Save complete snapshot into project database
      await db.update(projects)
        .set({
           platform: platform as any,
           businessType: businessType as any,
           intelligence: intelligenceSnapshot,
           discoveryStatus: "READY",
           websiteUrl: (homepageUrl as any).toString(),
        } as any)
        .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
      
      logger.info({ projectId, pagesCrawled: visitedUrls.size, sourcesIndexed: sourceIdsToProcess.length }, "[DISCOVERY] Website Intelligence 2.0 process completed successfully");

      // Enqueue background processing for all indexed knowledge sources
      for (const sourceId of sourceIdsToProcess) {
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
