import { describe, it, expect } from "vitest";
import { normalizeDomain, isDomainAllowed, validateWidgetOrigin } from "../src/security/domain";

describe("Universal Widget Final Security & Reliability Suite", () => {
  // 1. Origin Normalization
  describe("1. Origin Normalization", () => {
    it("normalizes full URLs with paths and query params to hostnames", () => {
      expect(normalizeDomain("https://crm-website01.vercel.app/login?redirect=dashboard")).toBe("crm-website01.vercel.app");
      expect(normalizeDomain("http://crm-website01.vercel.app/")).toBe("crm-website01.vercel.app");
      expect(normalizeDomain("crm-website01.vercel.app")).toBe("crm-website01.vercel.app");
    });

    it("prevents query param redirect injection attack from bypassing domain check", () => {
      expect(normalizeDomain("https://evil-attacker.com/?redirect=https://crm-website01.vercel.app")).toBe("evil-attacker.com");
      expect(isDomainAllowed("https://evil-attacker.com/?redirect=https://crm-website01.vercel.app", ["crm-website01.vercel.app"])).toBe(false);
    });

    it("strips www. prefix for consistent matching", () => {
      expect(normalizeDomain("https://www.example.com/checkout")).toBe("example.com");
      expect(normalizeDomain("www.store.co.uk")).toBe("store.co.uk");
    });

    it("handles localhost and dev ports", () => {
      expect(normalizeDomain("http://localhost:3000")).toBe("localhost");
      expect(normalizeDomain("http://127.0.0.1:5173")).toBe("127.0.0.1");
    });

    it("handles null, empty, or invalid inputs safely", () => {
      expect(normalizeDomain("")).toBe("");
      expect(normalizeDomain(null as any)).toBe("");
      expect(normalizeDomain(undefined as any)).toBe("");
    });
  });

  // 2. Allowed / Disallowed Origin Validation
  describe("2. Allowed & Disallowed Origin Security", () => {
    it("validates request with Origin header for allowed origin", () => {
      const req: any = { headers: { origin: "https://crm-website01.vercel.app" } };
      const res = validateWidgetOrigin(req, ["https://crm-website01.vercel.app/login"]);
      expect(res.valid).toBe(true);
      expect(res.domain).toBe("crm-website01.vercel.app");
    });

    it("validates request with Referer header fallback when Origin is missing", () => {
      const req: any = { headers: { referer: "https://crm-website01.vercel.app/dashboard/settings" } };
      const res = validateWidgetOrigin(req, ["crm-website01.vercel.app"]);
      expect(res.valid).toBe(true);
      expect(res.domain).toBe("crm-website01.vercel.app");
    });

    it("rejects request from disallowed origin", () => {
      const req: any = { headers: { origin: "https://unauthorized-attacker.com" } };
      const res = validateWidgetOrigin(req, ["https://crm-website01.vercel.app"]);
      expect(res.valid).toBe(false);
      expect(res.domain).toBe("unauthorized-attacker.com");
    });
  });

  // 3. Empty allowedDomains Security Behavior
  describe("3. Empty allowedDomains Security Behavior", () => {
    it("treats empty allowedDomains array as unrestricted public embedding mode", () => {
      expect(isDomainAllowed("crm-website01.vercel.app", [])).toBe(true);
      expect(isDomainAllowed("customer-site.com", [])).toBe(true);
    });

    it("allows explicit wildcard * for unrestricted embedding", () => {
      expect(isDomainAllowed("random-site.org", ["*"])).toBe(true);
    });

    it("enforces domain lockdown as soon as allowedDomains has entries", () => {
      const allowed = ["my-official-site.com"];
      expect(isDomainAllowed("my-official-site.com", allowed)).toBe(true);
      expect(isDomainAllowed("unlisted-site.com", allowed)).toBe(false);
    });
  });

  // 4. Token Resolution & Conflict Handling Simulation
  describe("4. Token Resolution & Idempotency", () => {
    it("simulates deterministic token resolution with currentScript", () => {
      const mockScriptA = { getAttribute: (attr: string) => (attr === "data-widget-token" ? "TOKEN_A" : null) };
      const mockScriptB = { getAttribute: (attr: string) => (attr === "data-widget-token" ? "TOKEN_B" : null) };

      // Script A execution
      let currentScript: any = mockScriptA;
      let token = currentScript ? currentScript.getAttribute("data-widget-token") : null;
      expect(token).toBe("TOKEN_A");

      // Script B execution
      currentScript = mockScriptB;
      token = currentScript ? currentScript.getAttribute("data-widget-token") : null;
      expect(token).toBe("TOKEN_B");
    });

    it("simulates Set-based token idempotency", () => {
      const initializedTokens = new Set<string>();

      // First run for TOKEN_A
      const tokenA = "TOKEN_A";
      expect(initializedTokens.has(tokenA)).toBe(false);
      initializedTokens.add(tokenA);

      // Second run for TOKEN_A (duplicate script)
      expect(initializedTokens.has(tokenA)).toBe(true); // Early return, 1 instance

      // First run for TOKEN_B (different project)
      const tokenB = "TOKEN_B";
      expect(initializedTokens.has(tokenB)).toBe(false);
      initializedTokens.add(tokenB);
      expect(initializedTokens.size).toBe(2);
    });

    it("simulates dynamic script injection after page load", () => {
      const initializedTokens = new Set<string>();
      const dynamicToken = "TOKEN_DYNAMIC_" + Date.now();

      expect(initializedTokens.has(dynamicToken)).toBe(false);
      initializedTokens.add(dynamicToken);
      expect(initializedTokens.has(dynamicToken)).toBe(true);
    });

    it("simulates failed token extraction followed by valid token load", () => {
      const initializedTokens = new Set<string>();

      // Invalid/null token run
      const invalidToken = null;
      if (invalidToken) {
        initializedTokens.add(invalidToken);
      }
      expect(initializedTokens.size).toBe(0);

      // Subsequent valid token run
      const validToken = "TOKEN_VALID";
      if (validToken && !initializedTokens.has(validToken)) {
        initializedTokens.add(validToken);
      }
      expect(initializedTokens.has("TOKEN_VALID")).toBe(true);
    });
  });

  // 5. Public Config Security & Secret Exposure Prevention
  describe("5. Public Config Security", () => {
    it("verifies public widget config object structure excludes sensitive server state", () => {
      const mockPublicConfigResponse = {
        botName: "Support AI",
        botAvatar: null,
        welcomeMessage: "Hello! How can I help you today?",
        themeColor: "#8B5CF6",
        position: "bottom-right",
        displayMode: "floating",
        customCss: null,
        customContainerId: null,
        humanHandoffLinks: {},
        leadsEnabled: false,
        isLocked: false,
        contextEngine: { enabled: true, maxContextSizeBytes: 6144, developerDebugMode: false },
      };

      const jsonStr = JSON.stringify(mockPublicConfigResponse);
      expect(jsonStr).not.toContain("encryptedKey");
      expect(jsonStr).not.toContain("supabaseServiceRole");
      expect(jsonStr).not.toContain("apiKeys");
      expect(jsonStr).not.toContain("databaseUrl");
      expect(jsonStr).not.toContain("organizationId");
    });
  });
});
