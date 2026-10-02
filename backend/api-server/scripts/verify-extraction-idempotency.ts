import { WebsiteDiscoveryService } from "../src/services/discovery";
import { db } from "@workspace/db";
import { projects, organizations, users, knowledgeSources } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

async function runRealisticExtractionTest() {
  console.log("=================================================================");
  console.log("   WEBSITE INTELLIGENCE 2.0 — REALISTIC EXTRACTION TEST");
  console.log("=================================================================\n");

  let userId = "";
  let orgId = "";
  let projectId = "";

  // Setup
  const [existingUser] = await db.select().from(users).limit(1);
  userId = existingUser?.id || "";
  if (!userId) throw new Error("No user found in DB");

  const [org] = await db.insert(organizations).values({ name: "Extraction Test Org" }).returning();
  orgId = org.id;

  const [proj] = await db.insert(projects).values({
    userId,
    organizationId: orgId,
    name: "Extraction Test Project",
    discoveryStatus: "PENDING"
  }).returning();
  projectId = proj.id;
  
  console.log(`Test Project ID: ${projectId}\n`);

  // ---- PART A: Static HTML Fixture Test (deterministic extraction) ----
  console.log("----------------------------------------------------------");
  console.log("PART A: UNIT-LEVEL HTML FIXTURE EXTRACTION (DETERMINISTIC)");
  console.log("----------------------------------------------------------\n");

  const mockRichHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Acme Coffee Roasters — Premium Coffee Shop</title>
  <meta name="description" content="Artisan coffee roasters in San Francisco. We source ethically, roast locally, and serve daily.">
  <link rel="icon" href="/favicon.ico">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "CoffeeShop",
    "name": "Acme Coffee Roasters",
    "description": "Artisan coffee roasters in San Francisco",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "123 Brew Street",
      "addressLocality": "San Francisco",
      "addressRegion": "CA",
      "postalCode": "94105"
    },
    "openingHours": "Mo-Fr 07:00-18:00",
    "telephone": "+14155551234",
    "url": "https://acmecoffee.example.com"
  }
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What are your opening hours?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "We are open Monday to Friday from 7am to 6pm."
        }
      },
      {
        "@type": "Question",
        "name": "Do you offer decaf options?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, all our espresso drinks can be made with decaf."
        }
      }
    ]
  }
  </script>
  <script type="application/ld+json">
  [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Ethiopian Yirgacheffe",
      "description": "Light roast with floral and citrus notes",
      "offers": {
        "@type": "Offer",
        "price": "18.99",
        "priceCurrency": "USD"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Colombian Dark Roast",
      "description": "Bold, full-bodied coffee with chocolate undertones",
      "offers": {
        "@type": "Offer",
        "price": "16.99",
        "priceCurrency": "USD"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": "Corporate Coffee Subscription",
      "description": "Monthly coffee delivery for offices"
    }
  ]
  </script>
</head>
<body>
  <header>
    <nav>
      <a href="/menu">Menu</a>
      <a href="/about">About Us</a>
      <a href="/contact">Contact</a>
    </nav>
  </header>
  <main>
    <h1>Welcome to Acme Coffee Roasters</h1>
    <p>Visit us at 123 Brew Street, San Francisco CA.</p>
    <p>Hours: <strong>Monday-Friday 7am to 6pm</strong></p>
    <p>Email: <a href="mailto:hello@acmecoffee.example.com">hello@acmecoffee.example.com</a></p>
    <p>Phone: <a href="tel:+14155551234">+1 (415) 555-1234</a></p>
  </main>
  <footer>
    <a href="https://twitter.com/acmecoffee">Twitter</a>
    <a href="https://instagram.com/acmecoffee">Instagram</a>
    <a href="https://linkedin.com/company/acmecoffee">LinkedIn</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
  </footer>
</body>
</html>`;

  // Run all extractors directly (no network)
  const contactDetails = (WebsiteDiscoveryService as any).extractContactDetails(mockRichHtml);
  const socialLinks = (WebsiteDiscoveryService as any).extractSocialLinks(mockRichHtml);
  const jsonLdMatches = [...mockRichHtml.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const structuredData = jsonLdMatches.map((m: any) => {
    try { return JSON.parse(m[1]); } catch(e) { return null; }
  }).filter(Boolean);
  const offerings = (WebsiteDiscoveryService as any).extractOfferings(mockRichHtml, structuredData);
  const faqs = (WebsiteDiscoveryService as any).extractFaqs(mockRichHtml, structuredData);
  const pageClassHome = (WebsiteDiscoveryService as any).classifyPageUrl("https://acmecoffee.example.com/", "Acme Coffee");
  const pageClassContact = (WebsiteDiscoveryService as any).classifyPageUrl("https://acmecoffee.example.com/contact", "Contact Us");
  const pageClassPricing = (WebsiteDiscoveryService as any).classifyPageUrl("https://acmecoffee.example.com/pricing", "Pricing");
  const pageClassFaq = (WebsiteDiscoveryService as any).classifyPageUrl("https://acmecoffee.example.com/faq", "FAQ");

  console.log("=== CONTACT EXTRACTION ===");
  console.log("Emails:", JSON.stringify(contactDetails.emails));
  console.log("Phones:", JSON.stringify(contactDetails.phones));
  console.log("Hours:", JSON.stringify(contactDetails.hours));
  
  console.log("\n=== SOCIAL LINKS ===");
  console.log(JSON.stringify(socialLinks, null, 2));
  
  console.log("\n=== OFFERINGS (Products/Services from JSON-LD) ===");
  console.log(JSON.stringify(offerings, null, 2));
  
  console.log("\n=== FAQs ===");
  console.log(JSON.stringify(faqs, null, 2));

  console.log("\n=== PAGE CLASSIFICATION ===");
  console.log("/: ", JSON.stringify(pageClassHome));
  console.log("/contact:", JSON.stringify(pageClassContact));
  console.log("/pricing:", JSON.stringify(pageClassPricing));
  console.log("/faq:", JSON.stringify(pageClassFaq));

  // Validate extractions
  let passed = 0;
  let failed = 0;

  const emailOk = contactDetails.emails.includes("hello@acmecoffee.example.com");
  const phoneOk = contactDetails.phones.includes("+14155551234");
  const twitterOk = socialLinks.twitter && socialLinks.twitter.includes("twitter.com/acmecoffee");
  const instagramOk = socialLinks.instagram && socialLinks.instagram.includes("instagram.com/acmecoffee");
  const linkedinOk = socialLinks.linkedin && socialLinks.linkedin.includes("linkedin.com/company/acmecoffee");
  const offeringsOk = offerings.length >= 2;
  const faqOk = faqs.length >= 2;
  const homeClassOk = pageClassHome.category === "HOME";
  const contactClassOk = pageClassContact.category === "CONTACT";
  const pricingClassOk = pageClassPricing.category === "PRICING";
  const faqClassOk = pageClassFaq.category === "FAQ";

  const checks = [
    ["Email extraction: hello@acmecoffee.example.com", emailOk],
    ["Phone extraction: +14155551234", phoneOk],
    ["Twitter social link", twitterOk],
    ["Instagram social link", instagramOk],
    ["LinkedIn social link", linkedinOk],
    [`Offerings extracted (got ${offerings.length})`, offeringsOk],
    [`FAQs extracted (got ${faqs.length})`, faqOk],
    ["HOME page classified correctly", homeClassOk],
    ["CONTACT page classified correctly", contactClassOk],
    ["PRICING page classified correctly", pricingClassOk],
    ["FAQ page classified correctly", faqClassOk],
  ];

  console.log("\n=== EXTRACTION VALIDATION RESULTS ===");
  for (const [label, ok] of checks) {
    if (ok) { console.log(`✅ PASS: ${label}`); passed++; }
    else { console.error(`❌ FAIL: ${label}`); failed++; }
  }

  // ---- PART B: Idempotency / Re-Analysis Test (against live DB) ----
  console.log("\n----------------------------------------------------------");
  console.log("PART B: RE-ANALYSIS IDEMPOTENCY TEST (https://example.com)");
  console.log("----------------------------------------------------------\n");

  // Run 1
  await WebsiteDiscoveryService.runDiscovery(projectId, "https://example.com", orgId);
  const sources1 = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
  const sourceIdRun1 = sources1[0]?.id;
  const updatedAtRun1 = sources1[0]?.updatedAt;
  console.log(`Run 1 — knowledge_sources: ${sources1.length}, Source ID: ${sourceIdRun1}, UpdatedAt: ${updatedAtRun1}`);

  // Run 2 (re-analysis, identical content)
  await WebsiteDiscoveryService.runDiscovery(projectId, "https://example.com", orgId);
  const sources2 = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
  const sourceIdRun2 = sources2[0]?.id;
  const updatedAtRun2 = sources2[0]?.updatedAt;
  console.log(`Run 2 — knowledge_sources: ${sources2.length}, Source ID: ${sourceIdRun2}, UpdatedAt: ${updatedAtRun2}`);

  // Run 3 (idempotency)
  await WebsiteDiscoveryService.runDiscovery(projectId, "https://example.com", orgId);
  const sources3 = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
  const sourceIdRun3 = sources3[0]?.id;
  const updatedAtRun3 = sources3[0]?.updatedAt;
  console.log(`Run 3 — knowledge_sources: ${sources3.length}, Source ID: ${sourceIdRun3}, UpdatedAt: ${updatedAtRun3}`);

  console.log("\n=== SOURCE ID STABILITY ===");
  const idStable = (sourceIdRun1 === sourceIdRun2) && (sourceIdRun2 === sourceIdRun3);
  const noduplicates = sources1.length === 1 && sources2.length === 1 && sources3.length === 1;

  if (idStable) { console.log(`✅ PASS: Source ID stable across 3 runs: ${sourceIdRun1}`); passed++; }
  else { console.error(`❌ FAIL: Source ID changed! R1=${sourceIdRun1} R2=${sourceIdRun2} R3=${sourceIdRun3}`); failed++; }
  
  if (noduplicates) { console.log(`✅ PASS: knowledge_sources count remains 1 across 3 runs (no duplicates)`); passed++; }
  else { console.error(`❌ FAIL: Duplicate knowledge_sources created! Counts: ${sources1.length}, ${sources2.length}, ${sources3.length}`); failed++; }

  console.log("\n=== FRESHNESS TEST (IDEMPOTENT RE-ANALYSIS) ===");
  console.log(`Source ID before re-run: ${sourceIdRun1}`);
  console.log(`Source ID after re-run:  ${sourceIdRun3}`);
  console.log(`UpdatedAt before (Run 1): ${updatedAtRun1}`);
  console.log(`UpdatedAt after  (Run 3): ${updatedAtRun3}`);
  console.log("NOTE: IDEMPOTENT RE-ANALYSIS — same content tested, not content-change detection.");
  console.log("Content-change detection would require modifying the target website between runs,");
  console.log("which cannot be done on https://example.com (external site not under our control).");

  // Cleanup
  try {
    await db.delete(knowledgeSources).where(eq(knowledgeSources.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  } catch (e) {}

  console.log("\n=================================================================");
  console.log(`EXTRACTION + IDEMPOTENCY SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log("=================================================================");

  if (failed > 0) process.exit(1);
}

runRealisticExtractionTest().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
