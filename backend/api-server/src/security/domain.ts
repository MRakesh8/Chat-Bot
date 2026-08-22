import type { Request } from "express";

/**
 * Domain Authorization & Normalization Module
 */

/**
 * Normalizes a URL string, Origin, Referer, or domain name to a canonical lowercased hostname.
 * Examples:
 *   "https://www.example.com/page?query=1" -> "example.com"
 *   "http://localhost:3000"                -> "localhost"
 *   "example.com"                          -> "example.com"
 */
export function normalizeDomain(rawInput: string | null | undefined): string {
  if (!rawInput || typeof rawInput !== "string") {
    return "";
  }
  let str = rawInput.trim().toLowerCase();
  if (!str) return "";

  // Add dummy protocol if missing to enable URL parsing
  if (!str.startsWith("http://") && !str.startsWith("https://")) {
    str = `http://${str}`;
  }

  try {
    const parsed = new URL(str);
    let hostname = parsed.hostname;

    // Strip leading www. for uniform domain matching
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    // Basic fallback string cleaning if URL parsing fails
    let cleaned = rawInput.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.split("/")[0].split(":")[0];
    if (cleaned.startsWith("www.")) {
      cleaned = cleaned.slice(4);
    }
    return cleaned;
  }
}

/**
 * Validates whether a domain matches an array of allowed domains.
 */
export function isDomainAllowed(
  domain: string,
  allowedDomains: string[] = []
): boolean {
  const normalized = normalizeDomain(domain);
  if (!normalized) return false;

  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.LOCAL_DEMO_MODE === "true";

  // Development environment check for localhost / 127.0.0.1
  if ((normalized === "localhost" || normalized === "127.0.0.1") && isDev) {
    return true;
  }

  const normalizedAllowed = allowedDomains
    .map((d) => normalizeDomain(d))
    .filter(Boolean);

  // Check wildcard explicitly if configured
  if (allowedDomains.includes("*") || normalizedAllowed.includes("*")) {
    return true;
  }

  // Direct match or exact subdomain match
  for (const allowed of normalizedAllowed) {
    if (normalized === allowed) {
      return true;
    }
    // Subdomain matching if allowed starts with wildcard domain like .example.com or *.example.com
    let matchAllowed = allowed;
    if (matchAllowed.startsWith("*.")) {
      matchAllowed = matchAllowed.slice(1); // Converts *.example.com to .example.com
    }
    if (matchAllowed.startsWith(".") && normalized.endsWith(matchAllowed)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates an Express Request against configured allowed domains using Origin and Referer fallbacks.
 */
export function validateWidgetOrigin(
  req: Request,
  allowedDomains: string[]
): { valid: boolean; domain: string; reason?: string } {
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;

  const rawSource = (typeof originHeader === "string" && originHeader)
    ? originHeader
    : (typeof refererHeader === "string" && refererHeader)
    ? refererHeader
    : null;

  if (!rawSource) {
    // If no Origin or Referer header is present in browser request
    const isDev =
      process.env.NODE_ENV === "development" ||
      process.env.LOCAL_DEMO_MODE === "true";
    if (isDev) {
      return { valid: true, domain: "localhost" };
    }
    return {
      valid: false,
      domain: "",
      reason: "Missing Origin and Referer headers",
    };
  }

  const domain = normalizeDomain(rawSource);
  const valid = isDomainAllowed(domain, allowedDomains);

  if (!valid) {
    return {
      valid: false,
      domain,
      reason: `Domain '${domain}' is not in allowed domains list`,
    };
  }

  return { valid: true, domain };
}
