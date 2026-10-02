import { describe, it, expect } from "vitest";
import { normalizeDomain, isDomainAllowed, validateWidgetOrigin } from "../src/security/domain";

describe("Universal Widget Origin Security & Normalization Suite", () => {
  describe("normalizeDomain", () => {
    it("normalizes full URLs with paths and query params to hostnames", () => {
      expect(normalizeDomain("https://crm-website01.vercel.app/login?redirect=dashboard")).toBe("crm-website01.vercel.app");
      expect(normalizeDomain("http://crm-website01.vercel.app/")).toBe("crm-website01.vercel.app");
      expect(normalizeDomain("crm-website01.vercel.app")).toBe("crm-website01.vercel.app");
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

  describe("isDomainAllowed", () => {
    it("treats empty allowedDomains array as unrestricted (all domains allowed)", () => {
      expect(isDomainAllowed("crm-website01.vercel.app", [])).toBe(true);
      expect(isDomainAllowed("any-customer-domain.com", [])).toBe(true);
    });

    it("allows explicit wildcard * for unrestricted embedding", () => {
      expect(isDomainAllowed("random-site.org", ["*"])).toBe(true);
    });

    it("matches exact domains when allowedDomains contains full URLs", () => {
      const allowed = ["https://crm-website01.vercel.app/login?redirect=1"];
      expect(isDomainAllowed("crm-website01.vercel.app", allowed)).toBe(true);
      expect(isDomainAllowed("other-site.com", allowed)).toBe(false);
    });

    it("matches subdomains when wildcard pattern *.domain.com or .domain.com is used", () => {
      const allowed = ["*.vercel.app"];
      expect(isDomainAllowed("crm-website01.vercel.app", allowed)).toBe(true);
      expect(isDomainAllowed("my-app.vercel.app", allowed)).toBe(true);
      expect(isDomainAllowed("external.com", allowed)).toBe(false);
    });
  });

  describe("validateWidgetOrigin", () => {
    it("validates request with Origin header", () => {
      const req: any = {
        headers: {
          origin: "https://crm-website01.vercel.app",
        },
      };
      const res = validateWidgetOrigin(req, ["https://crm-website01.vercel.app/login"]);
      expect(res.valid).toBe(true);
      expect(res.domain).toBe("crm-website01.vercel.app");
    });

    it("validates request with Referer header fallback when Origin is missing", () => {
      const req: any = {
        headers: {
          referer: "https://crm-website01.vercel.app/dashboard/settings",
        },
      };
      const res = validateWidgetOrigin(req, ["crm-website01.vercel.app"]);
      expect(res.valid).toBe(true);
      expect(res.domain).toBe("crm-website01.vercel.app");
    });

    it("rejects unauthorized domain requests when domain restriction is active", () => {
      const req: any = {
        headers: {
          origin: "https://unauthorized-attacker.com",
        },
      };
      const res = validateWidgetOrigin(req, ["https://crm-website01.vercel.app"]);
      expect(res.valid).toBe(false);
      expect(res.domain).toBe("unauthorized-attacker.com");
    });
  });
});
