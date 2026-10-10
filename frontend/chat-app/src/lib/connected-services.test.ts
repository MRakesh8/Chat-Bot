import assert from "node:assert";

console.log("==================================================");
console.log("  RUNNING CONNECTED SERVICES CATEGORY & SEARCH TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function check(testName: string, actual: any, expected: any) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ✓ PASSED: ${testName} -> ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`  ✗ FAILED: ${testName} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

export const PROVIDERS = [
  { id: "github", label: "GitHub", category: "Development" },
  { id: "vercel", label: "Vercel", category: "Development" },
  { id: "linkedin", label: "LinkedIn", category: "Other" },
  { id: "render", label: "Render Dashboard", category: "Monitoring" },
  { id: "uptime_robot", label: "UptimeRobot", category: "Monitoring" },
  { id: "supabase", label: "Supabase", category: "Databases" },
  { id: "microsoft_clarity", label: "Microsoft Clarity", category: "AI & Analytics" },
  { id: "google_analytics", label: "Google Analytics", category: "AI & Analytics" },
  { id: "google_search_console", label: "Search Console", category: "AI & Analytics" },
  { id: "google_ai_studio", label: "Google AI Studio", category: "AI & Analytics" },
  { id: "youtube", label: "YouTube", category: "Other" },
  { id: "custom", label: "Custom Service", category: "Other" },
];

export function getServiceCategory(providerId: string): string {
  const found = PROVIDERS.find((p) => p.id === providerId);
  if (found) return found.category;
  const p = (providerId || "").toLowerCase();
  if (p.includes("analytics") || p.includes("clarity") || p.includes("ai")) return "AI & Analytics";
  if (p.includes("database") || p.includes("sql") || p.includes("db") || p.includes("supabase")) return "Databases";
  if (p.includes("git") || p.includes("dev") || p.includes("code") || p.includes("vercel")) return "Development";
  if (p.includes("monitor") || p.includes("uptime") || p.includes("status") || p.includes("render")) return "Monitoring";
  return "Other";
}

type Service = {
  id: string;
  provider: string;
  name: string;
  url: string;
  description: string | null;
  status: string;
};

// 1. Provider Category Mapping Tests
check("GitHub category", getServiceCategory("github"), "Development");
check("Vercel category", getServiceCategory("vercel"), "Development");
check("Supabase category", getServiceCategory("supabase"), "Databases");
check("Render category", getServiceCategory("render"), "Monitoring");
check("UptimeRobot category", getServiceCategory("uptime_robot"), "Monitoring");
check("Google Analytics category", getServiceCategory("google_analytics"), "AI & Analytics");
check("Microsoft Clarity category", getServiceCategory("microsoft_clarity"), "AI & Analytics");
check("LinkedIn category", getServiceCategory("linkedin"), "Other");
check("Fallback custom category", getServiceCategory("unknown_custom"), "Other");

// 2. Search and Category Filter logic
const mockServices: Service[] = [
  { id: "1", provider: "github", name: "GitHub Main Repo", url: "https://github.com/myorg/repo", description: "Source code", status: "active" },
  { id: "2", provider: "supabase", name: "Production Postgres", url: "https://supabase.com/dashboard", description: "Database cluster", status: "active" },
  { id: "3", provider: "google_analytics", name: "GA4 Dashboard", url: "https://analytics.google.com", description: "Web traffic analytics", status: "active" },
];

function filterServices(services: Service[], category: string, query: string): Service[] {
  return services.filter((service) => {
    const matchesCategory = category === "All Services" || getServiceCategory(service.provider) === category;
    const q = query.toLowerCase().trim();
    const matchesSearch =
      !q ||
      service.name.toLowerCase().includes(q) ||
      service.provider.toLowerCase().includes(q) ||
      (service.description && service.description.toLowerCase().includes(q)) ||
      service.url.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });
}

check("All services count", filterServices(mockServices, "All Services", "").length, 3);
check("Development category filter count", filterServices(mockServices, "Development", "").length, 1);
check("Databases category filter count", filterServices(mockServices, "Databases", "").length, 1);
check("Search query filter ('Postgres')", filterServices(mockServices, "All Services", "Postgres").length, 1);
check("Search query filter + Category match ('analytics')", filterServices(mockServices, "AI & Analytics", "analytics").length, 1);
check("Search query mismatch count ('nonexistent')", filterServices(mockServices, "All Services", "nonexistent").length, 0);

console.log(`\n--------------------------------------------------`);
console.log(`  SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log(`--------------------------------------------------\n`);

if (failed > 0) {
  process.exit(1);
}
