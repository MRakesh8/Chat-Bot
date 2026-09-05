import { URL } from "url";
import dns from "dns/promises";
import { logger } from "../../lib/logger";

export class BrowserNavigationGuard {
  private static BLOCKED_IP_RANGES = [
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local & cloud metadata (169.254.169.254)
    /^0\./,
    /^::1$/,
    /^[fF][cCdD]/,
    /^[fF][eE][89aAbB]/
  ];

  /**
   * Validates a target navigation URL against domain allowlist, IP restrictions, and scheme rules.
   */
  public static async validateUrl(inputUrl: string, domainAllowlist: string[]): Promise<URL> {
    const parsed = new URL(inputUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Security Violation: Protocol "${parsed.protocol}" is not allowed. Only HTTP and HTTPS are permitted.`);
    }

    if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".internal") || parsed.hostname === "metadata.google.internal") {
      throw new Error(`Security Violation: Internal/localhost target "${parsed.hostname}" is strictly blocked.`);
    }

    // Domain Allowlist Check
    const normalizedHostname = parsed.hostname.toLowerCase();
    const isDomainAllowed = domainAllowlist.some(allowed => {
      try {
        const allowedHost = new URL(allowed.startsWith("http") ? allowed : `https://${allowed}`).hostname.toLowerCase();
        return normalizedHostname === allowedHost || normalizedHostname.endsWith(`.${allowedHost}`);
      } catch (e) {
        return false;
      }
    });

    if (!isDomainAllowed && domainAllowlist.length > 0) {
      throw new Error(`Security Violation: Target domain "${parsed.hostname}" is not in the approved domain allowlist for this capability.`);
    }

    // DNS Resolution & Private IP Range Validation
    try {
      const addresses = await dns.lookup(parsed.hostname, { all: true });
      for (const record of addresses) {
        for (const regex of this.BLOCKED_IP_RANGES) {
          if (regex.test(record.address)) {
            throw new Error(`Security Violation: Hostname "${parsed.hostname}" resolves to a blocked internal/private IP: ${record.address}`);
          }
        }
      }
    } catch (err: any) {
      if (err.message.startsWith("Security Violation")) throw err;
      throw new Error(`Security Violation: DNS resolution failed for hostname "${parsed.hostname}".`);
    }

    return parsed;
  }

  /**
   * Attaches request/response interception handlers to Puppeteer Page to enforce navigation safety on redirects and subresources.
   */
  public static attachToPage(page: any, domainAllowlist: string[]) {
    page.on("response", async (response: any) => {
      const status = response.status();
      if (status >= 300 && status < 400) {
        const redirectUrl = response.headers()["location"];
        if (redirectUrl) {
          try {
            await BrowserNavigationGuard.validateUrl(redirectUrl, domainAllowlist);
          } catch (err: any) {
            logger.error({ err: err.message, redirectUrl }, "[BROWSER_GUARD] Intercepted unsafe redirect target");
            try {
              await page.close();
            } catch (e) {}
          }
        }
      }
    });
  }
}
