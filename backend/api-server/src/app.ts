import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import compression from "compression";
import router from "./routes";
import healthRouter from "./routes/health";
import widgetPublicRouter from "./routes/widget-public";
import localDevPublicRouter from "./routes/local-dev-public";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./middlewares/supabaseAuth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Initialize express
const app: Express = express();

// Trust Render reverse proxy to correctly identify client IPs for rate-limiting
app.set("trust proxy", 1);

// Speed optimization: Compress responses (never buffer SSE streams)
app.use(compression({
  filter: (req, res) => {
    const contentType = String(res.getHeader("Content-Type") || "").toLowerCase();
    if (contentType.includes("text/event-stream")) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Security Headers
app.use((req, res, next) => {
  if (req.path.startsWith("/api/widget")) {
    helmet({ frameguard: false, contentSecurityPolicy: false })(req, res, next);
  } else {
    helmet()(req, res, next);
  }
});

// ============================================================
// CORS CONFIGURATION
// Must be registered before rate limiters and auth so OPTIONS 
// preflights are handled immediately without consuming limits.
// ============================================================
const envOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [
  "https://chatbot-rakesh.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  ...envOrigins,
];

// 1. Widget CORS (Open to all domains so it can be embedded anywhere)
app.use("/api/widget", cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "x-organization-id", "X-Organization-Id"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// 2. Global CORS (Strict whitelist for admin dashboard / app)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "x-organization-id", "X-Organization-Id"],
  }),
);

import { RedisFallbackStore } from "./lib/rate-limiter";

// Localhost and development rate-limit bypass helper
const isLocalhostRequest = (req: express.Request) => {
  const ip = req.ip || req.socket?.remoteAddress || "";
  const host = req.get("host") || "";
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.endsWith("127.0.0.1") ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1")
  );
};

const shouldBypassRateLimit = (req: express.Request) => {
  if (req.method === "OPTIONS") return true;
  if (process.env.NODE_ENV !== "production") return true;
  if (process.env.LOCAL_DEMO_MODE === "true") return true;
  if (isLocalhostRequest(req)) return true;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.includes("local-demo-token")) return true;
  return false;
};

// Global API Rate Limiting (Fallback)
const globalLimiter = rateLimit({
  store: new RedisFallbackStore('global'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 1500 : 100000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  skip: (req) => {
    if (shouldBypassRateLimit(req)) return true;
    const p = req.originalUrl.split('?')[0];
    return p === '/api/healthz' || 
           p === '/healthz' ||
           p.startsWith('/api/webhooks/') || 
           p.startsWith('/api/widget/') || 
           p.startsWith('/api/public/') || 
           p.startsWith('/api/auth/callback/') ||
           p.startsWith('/gemini/conversations/');
  }
});
app.use("/api", globalLimiter);

// Strict LLM API Rate Limiter
const geminiLimiter = rateLimit({
  store: new RedisFallbackStore('gemini'),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to the AI model. Please try again later." },
  skip: shouldBypassRateLimit,
});
// Apply to message endpoints specifically with correct route prefix
app.use("/api/gemini/conversations/:id/messages", geminiLimiter);

// Specific rate limiters for key validation and payment submissions
const keyVerifyLimiter = rateLimit({
  store: new RedisFallbackStore('key_verify'),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many key verification attempts. Please wait a minute." },
  skip: shouldBypassRateLimit,
});
app.use("/api/projects/:projectId/widget/api-keys/:keyId/verify", keyVerifyLimiter);
app.use("/api/projects/:projectId/widget/api-keys/:keyId/test", keyVerifyLimiter);

const paymentLimiter = rateLimit({
  store: new RedisFallbackStore('payments'),
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment submission attempts. Please try again later." },
  skip: shouldBypassRateLimit,
});
app.use("/api/payments/manual", paymentLimiter);

const widgetLimiter = rateLimit({
  store: new RedisFallbackStore('widget'),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to the widget API. Please try again later." },
  skip: shouldBypassRateLimit,
});
app.use("/api/widget", widgetLimiter);

// Strict API Rate Limiter for Integrations and Tools (Phase 2E)
const integrationLimiter = rateLimit({
  store: new RedisFallbackStore('integrations'),
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many integration requests. Please wait a minute." },
  skip: shouldBypassRateLimit,
});
app.use("/api/projects/:projectId/integrations", integrationLimiter);
app.use("/api/projects/:projectId/tools", integrationLimiter);

// Rate Limiter for AI Agent (Phase 2F) - expensive AI operations
const agentLimiter = rateLimit({
  store: new RedisFallbackStore('agent'),
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many agent requests. Please wait a minute." },
  skip: shouldBypassRateLimit,
});
app.use("/api/agent", agentLimiter);

import { databaseHealthMiddleware } from "./middlewares/databaseHealth";
app.use(databaseHealthMiddleware);

// Basic middleware
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ============================================================
// ROUTES
// ============================================================

// Prevent CDN/Browser caching of all API responses by default (avoids cross-user data leakage)
app.use("/api", (req, res, next) => {
  if (!req.path.startsWith("/widget")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Root server status and health discovery endpoints
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "NOVA Business AI API Server",
    version: "1.0.0",
    health: "/api/healthz",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.redirect("/api/healthz");
});

app.get("/healthz", (_req, res) => {
  res.redirect("/api/healthz");
});

app.get("/api", (_req, res) => {
  res.json({
    status: "ok",
    service: "NOVA Business AI API Server",
    version: "1.0.0",
    health: "/api/healthz",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/widget", widgetPublicRouter);

app.use("/api", healthRouter);
app.use("/api/local-dev", localDevPublicRouter);

app.use(supabaseAuthMiddleware);

app.use("/api", router);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, reqId: req.id }, "Unhandled error");
  res.status(500).json({ error: "Internal Server Error", errorId: req.id });
});

export default app;
