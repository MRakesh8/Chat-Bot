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

// Security Headers
app.use((req, res, next) => {
  if (req.path.startsWith("/api/widget")) {
    next();
  } else {
    helmet()(req, res, next);
  }
});

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    const p = req.originalUrl.split('?')[0]; // Ignore query params
    return p === '/api/healthz' || 
           p.startsWith('/api/webhooks/') || 
           p.startsWith('/api/widget/') || 
           p.startsWith('/api/public/') || 
           p.startsWith('/api/auth/callback/');
  }
});
app.use("/api", limiter);
app.use("/gemini", limiter);

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

// ============================================================
// WIDGET PUBLIC ROUTES (registered FIRST, before global CORS)
// These routes must be accessible from ANY website embedding the widget.
// If registered after the global CORS, the global CORS handles the
// preflight OPTIONS request and rejects unknown origins before the
// widget-specific CORS middleware ever runs.
// ============================================================
app.use("/api/widget", cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}), widgetPublicRouter);

// Global CORS for all other routes (strict origin whitelist)
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", healthRouter);

app.use(supabaseAuthMiddleware);

app.use("/api", router);

export default app;
