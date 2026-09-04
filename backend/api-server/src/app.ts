import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import compression from "compression";
import router from "./routes";
import healthRouter from "./routes/health";
import widgetPublicRouter from "./routes/widget-public";
import { logger } from "./lib/logger";
import { supabaseAuthMiddleware } from "./middlewares/supabaseAuth";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Initialize express
const app: Express = express();

// Speed optimization: Compress responses
app.use(compression({
  filter: (req, res) => {
    if (res.getHeader('Content-Type') === 'text/event-stream') {
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
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// 2. Global CORS (Strict whitelist for admin dashboard / app)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  }),
);

// Global API Rate Limiting (Fallback)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const p = req.originalUrl.split('?')[0];
    return p === '/api/healthz' || 
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
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to the AI model. Please try again later." },
});
// Apply to message endpoints specifically with correct route prefix
app.use("/api/gemini/conversations/:id/messages", geminiLimiter);

// Specific rate limiters for key validation and payment submissions
const keyVerifyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many key verification attempts. Please wait a minute." }
});
app.use("/api/projects/:projectId/widget/api-keys/:keyId/verify", keyVerifyLimiter);
app.use("/api/projects/:projectId/widget/api-keys/:keyId/test", keyVerifyLimiter);

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment submission attempts. Please try again later." }
});
app.use("/api/payments/manual", paymentLimiter);

const widgetLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to the widget API. Please try again later." },
});
app.use("/api/widget", widgetLimiter);

// Strict API Rate Limiter for Integrations and Tools (Phase 2E)
const integrationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many integration requests. Please wait a minute." }
});
app.use("/api/projects/:projectId/integrations", integrationLimiter);
app.use("/api/projects/:projectId/tools", integrationLimiter);

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
app.use("/api/widget", widgetPublicRouter);

app.use("/api", healthRouter);

app.use(supabaseAuthMiddleware);

app.use("/api", router);

export default app;
