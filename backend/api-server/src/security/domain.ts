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

  // Empty allowedDomains array indicates unrestricted domain access
  if (!allowedDomains || allowedDomains.length === 0) {
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
 * Validates whether a given URL is a safe, valid local development URL (localhost / 127.0.0.1).
 * Blocks SSRF attempts against cloud metadata endpoints, internal private IPs, invalid ports, and malformed protocols.
 */
export function validateSafeLocalUrl(rawUrl: string | null | undefined): {
  valid: boolean;
  normalizedUrl?: string;
  hostname?: string;
  port?: number;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, error: "Local website URL is required." };
  }

  const trimmed = rawUrl.trim();

  // Enforce http/https protocol
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: "URL must start with http:// or https:// (e.g. http://localhost:3000).",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "User credentials are not permitted in local development URLs.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Cloud metadata endpoint protection (AWS, GCP, Azure metadata 169.254.169.254 / metadata.google.internal)
  if (
    hostname === "169.254.169.254" ||
    hostname.includes("metadata.google.internal") ||
    hostname.includes("169.254.")
  ) {
    return {
      valid: false,
      error: "Cloud metadata endpoints are strictly prohibited.",
    };
  }

  // Private network ranges (10.x, 192.168.x, 172.16-31.x) are blocked for localhost testing
  if (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    return {
      valid: false,
      error: "Private network IP addresses (e.g. 192.168.x.x, 10.x.x.x) are not permitted as localhost URLs.",
    };
  }

  // Only allow localhost and 127.0.0.1 / ::1
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost");

  if (!isLocalHost) {
    return {
      valid: false,
      error: "Local development URL must target localhost or 127.0.0.1 (e.g. http://localhost:3000).",
    };
  }

  // Validate Port (default to 80 for http, 443 for https if not specified)
  let portNum: number;
  if (parsed.port) {
    portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: "Invalid port number. Port must be between 1 and 65535." };
    }
  } else {
    portNum = parsed.protocol === "https:" ? 443 : 80;
  }

  // Construct canonical normalized local URL without trailing slashes
  const normalizedUrl = `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}`;

  return {
    valid: true,
    normalizedUrl,
    hostname,
    port: portNum,
  };
}

/**
 * Checks if a domain or origin string is localhost / 127.0.0.1.
 */
export function isLocalhostOrigin(originOrUrl: string | null | undefined): boolean {
  if (!originOrUrl) return false;
  const normalized = normalizeDomain(originOrUrl);
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

/**
 * Validates an Express Request against configured allowed domains using Origin and Referer fallbacks.
 */
export function validateWidgetOrigin(
  req: Request,
  allowedDomains: string[]
): { valid: boolean; domain: string; reason?: string } {
  const originHeader = req.headers.origin || (req.headers as any)?.Origin;
  const refererHeader = req.headers.referer || (req.headers as any)?.Referer;

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

/**
 * Validates whether a given URL is a safe, valid public production website URL.
 * Blocks SSRF attempts, loopback/localhost (which belong in local dev), private network IPs, and cloud metadata.
 */
export function validateSafeProductionUrl(rawUrl: string | null | undefined): {
  valid: boolean;
  normalizedUrl?: string;
  domain?: string;
  hostname?: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, error: "Production website URL is required." };
  }

  const trimmed = rawUrl.trim();

  // Enforce http/https protocol
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: "Production website URL must start with http:// or https:// (e.g. https://example.com).",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "User credentials are not permitted in production website URLs.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost / 127.0.0.1 for production
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  ) {
    return {
      valid: false,
      error: "Localhost URLs belong to Local Development mode. Please enter a public production domain (e.g. https://yourbusiness.com).",
    };
  }

  // Cloud metadata endpoint protection
  if (
    hostname === "169.254.169.254" ||
    hostname.includes("metadata.google.internal") ||
    hostname.includes("169.254.")
  ) {
    return {
      valid: false,
      error: "Cloud metadata endpoints are strictly prohibited.",
    };
  }

  // Private network ranges (10.x, 192.168.x, 172.16-31.x) are blocked
  if (
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    return {
      valid: false,
      error: "Private network IP addresses (e.g. 192.168.x.x, 10.x.x.x) are not permitted as production URLs.",
    };
  }

  const domain = normalizeDomain(trimmed);
  if (!domain || !domain.includes(".")) {
    return {
      valid: false,
      error: "Please enter a valid top-level domain (e.g. https://example.com).",
    };
  }

  // Normalize URL (strip trailing slash)
  const normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;

  return {
    valid: true,
    normalizedUrl: normalizedUrl || `${parsed.protocol}//${parsed.host}`,
    domain,
    hostname,
  };
}


