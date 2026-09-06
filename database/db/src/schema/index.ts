import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uuid,
  varchar,
  jsonb,
  vector,
  index,
  uniqueIndex,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const globalSettings = pgTable("global_settings", {
  id: varchar("id", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const systemErrors = pgTable("system_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: varchar("source", { length: 100 }).notNull(), // 'chatbot', 'system', 'render'
  message: text("message").notNull(),
  stack: text("stack"),
  context: jsonb("context"),
  isResolved: boolean("is_resolved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Enums and Custom Types (represented as text for simplicity or pgEnum)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: varchar("role", { length: 50 }).default("user").notNull(), // super_admin, admin, user, client
  features: jsonb("features").$type<{
    canCreateProject: boolean;
    canUseWidgetStudio: boolean;
    canUseContextEngine: boolean;
  }>().default({ canCreateProject: true, canUseWidgetStudio: false, canUseContextEngine: false }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  razorpayCustomerId: varchar("razorpay_customer_id", { length: 255 }),
  subscriptionId: varchar("subscription_id", { length: 255 }),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("inactive").notNull(),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndedAt: timestamp("trial_ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 50 }).default("viewer").notNull(), // owner, admin, manager, agent, viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgUserUniq: uniqueIndex("org_user_uniq_idx").on(table.organizationId, table.userId),
  orgIdIdx: index("org_members_org_id_idx").on(table.organizationId),
  userIdIdx: index("org_members_user_id_idx").on(table.userId),
}));

export const organizationUsage = pgTable("organization_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  billingCycleStart: timestamp("billing_cycle_start").notNull(),
  billingCycleEnd: timestamp("billing_cycle_end").notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  storageBytes: integer("storage_bytes").default(0).notNull(),
  crawlCount: integer("crawl_count").default(0).notNull(),
  actionCount: integer("action_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  orgCycleUniq: uniqueIndex("org_cycle_uniq_idx").on(table.organizationId, table.billingCycleStart),
  orgIdIdx: index("org_usage_org_id_idx").on(table.organizationId),
}));

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 50 }).notNull(), // message, crawl, parse, ocr, action
  quantity: integer("quantity").default(1).notNull(),
  provider: varchar("provider", { length: 50 }),
  model: varchar("model", { length: 255 }),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  estimatedCost: varchar("estimated_cost", { length: 50 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  orgIdIdx: index("usage_events_org_id_idx").on(table.organizationId),
  orgTypeIdx: index("usage_events_org_type_idx").on(table.organizationId, table.eventType),
}));

export const knowledgeGaps = pgTable("knowledge_gaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  questionText: text("question_text").notNull(),
  normalizedQuestion: text("normalized_question"),
  askedCount: integer("asked_count").default(1).notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedSourceId: uuid("resolved_source_id")
    .references(() => knowledgeSources.id, { onDelete: "set null" }),
  sourceUrl: text("source_url"),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
  confidence: varchar("confidence", { length: 50 }),
  reason: varchar("reason", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("knowledge_gaps_project_id_idx").on(table.projectId),
  projNormIdx: index("knowledge_gaps_proj_norm_idx").on(table.projectId, table.normalizedQuestion),
}));


export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").default("").notNull(),
  shareToken: varchar("share_token", { length: 50 }),
  isActive: boolean("is_active").default(true),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  allowedDomains: jsonb("allowed_domains").$type<string[]>().default(["*"]).notNull(),
  deploymentPaid: boolean("deployment_paid").default(false).notNull(),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  customTrialDays: integer("custom_trial_days"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  websiteUrl: varchar("website_url", { length: 2048 }),
  discoveryStatus: varchar("discovery_status", { length: 50 }).default("pending").notNull(),
  platform: varchar("platform", { length: 100 }),
  platformConfidence: varchar("platform_confidence", { length: 50 }),
  businessType: varchar("business_type", { length: 100 }),
  businessTypeConfidence: varchar("business_type_confidence", { length: 50 }),
  intelligence: jsonb("intelligence").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("projects_user_id_idx").on(table.userId),
  organizationIdIdx: index("projects_organization_id_idx").on(table.organizationId),
}));

export const projectSettings = pgTable("project_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  defaultMode: varchar("default_mode", { length: 50 }).default("friendly"),
  storageLimit: integer("storage_limit").default(100), // MBs
  isClientAgentEnabled: boolean("is_client_agent_enabled").default(false),
});

export const projectModes = pgTable("project_modes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  promptInstructions: text("prompt_instructions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("project_modes_project_id_idx").on(table.projectId),
}));

export const knowledgeCategories = pgTable("knowledge_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isWidgetExposed: boolean("is_widget_exposed").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("knowledge_categories_project_id_idx").on(table.projectId),
}));

export const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  kbId: varchar("kb_id", { length: 50 }).unique(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: uuid("category_id")
    .references(() => knowledgeCategories.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }), // Enforces customer RAG isolation
  tag: varchar("tag", { length: 255 }),
  title: text("title"),
  filename: text("filename"), // Optional, if it's a file
  sourceUrl: text("source_url"), // For website, youtube, etc.
  websiteLinks: jsonb("website_links").$type<string[]>().default([]).notNull(),
  videoLinks: jsonb("video_links").$type<string[]>().default([]).notNull(),
  githubLinks: jsonb("github_links").$type<string[]>().default([]).notNull(),
  fileId: varchar("file_id", { length: 255 }), // Storage ID if uploaded
  sourceType: varchar("source_type", { length: 50 }).notNull(), // file, website, youtube, instagram, github, note
  isWidgetExposed: boolean("is_widget_exposed").default(true).notNull(),
  notes: text("notes"),
  rawContent: text("raw_content"),
  summary: text("summary"),
  tools: jsonb("tools").$type<string[]>().default([]).notNull(),
  steps: jsonb("steps").$type<string[]>().default([]).notNull(),
  keywordIndex: text("keyword_index"),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, processed, error
  retryCount: integer("retry_count").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("knowledge_sources_project_id_idx").on(table.projectId),
  categoryIdIdx: index("knowledge_sources_category_id_idx").on(table.categoryId),
  customerIdIdx: index("knowledge_sources_customer_id_idx").on(table.customerId),
}));

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeSourceId: uuid("knowledge_source_id").references(() => knowledgeSources.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", { dimensions: 768 }), // Gemini embedding size (768)
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sourceIdIdx: index("knowledge_chunks_source_id_idx").on(table.knowledgeSourceId),
  projectIdIdx: index("knowledge_chunks_project_id_idx").on(table.projectId),
  embeddingHnswIdx: index("knowledge_chunks_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
}));

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }), // Client's internal ID for their customer
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  name: varchar("name", { length: 255 }),
  channel: varchar("channel", { length: 50 }).default("website").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("customers_project_id_idx").on(table.projectId),
  emailIdx: index("customers_email_idx").on(table.projectId, table.email),
  externalIdIdx: uniqueIndex("customers_external_id_idx").on(table.projectId, table.externalId),
}));

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // RAGHUB Platform user
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }), // End-customer
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  modeId: uuid("mode_id").references(() => projectModes.id),
  title: text("title").notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("chat_sessions_user_id_idx").on(table.userId),
  projectIdIdx: index("chat_sessions_project_id_idx").on(table.projectId),
  customerIdIdx: index("chat_sessions_customer_id_idx").on(table.customerId),
}));

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .references(() => chatSessions.id, { onDelete: "cascade" })
    .notNull(),
  sender: varchar("sender", { length: 50 }).notNull(), // user or ai
  content: text("content").notNull(),
  sourceTransparency: varchar("source_transparency", { length: 100 }), // project, gemini, combined
  confidence: varchar("confidence", { length: 50 }), // high, medium, low
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  sessionIdIdx: index("messages_session_id_idx").on(table.sessionId),
}));

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").notNull(),
  contentUrl: text("content_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  target: varchar("target", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userApiKeys = pgTable("user_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }), // null = system key
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).default("gemini").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isSystem: boolean("is_system").default(false).notNull(), // Preserved for system keys
  status: varchar("status", { length: 50 }).default("HEALTHY").notNull(), // HEALTHY, RATE_LIMIT, TOKEN_LIMIT, DAILY_QUOTA, MONTHLY_CREDIT, INVALID_API_KEY, INVALID_MODEL, PROVIDER_DOWN, NETWORK_ERROR, DISABLED, UNHEALTHY
  healthScore: integer("health_score").default(100).notNull(), // 0 to 100
  latencyMs: integer("latency_ms").default(0).notNull(), // Moving average latency
  region: varchar("region", { length: 50 }),
  providerInfo: jsonb("provider_info"), // Store vision, streaming, json mode, context window, quotas
  lastSuccess: timestamp("last_success"),
  lastFailure: timestamp("last_failure"),
  lastUsed: timestamp("last_used"),
  failureReason: text("failure_reason"),
  cooldownUntil: timestamp("cooldown_until"),
  totalRequests: integer("total_requests").default(0).notNull(),
  totalFailures: integer("total_failures").default(0).notNull(),
  dailyLimit: integer("daily_limit"), // null = no limit (for user keys), 20 for system keys
  dailyUsed: integer("daily_used").default(0).notNull(),
  tokensToday: integer("tokens_today").default(0).notNull(),
  availableModels: jsonb("available_models"),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_api_keys_user_id_idx").on(table.userId),
}));

export const userApiSettings = pgTable("user_api_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  apiMode: varchar("api_mode", { length: 50 }).default("auto").notNull(), // auto, user_first, system_first
  chatHistoryRetentionDays: integer("chat_history_retention_days").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const connectedServices = pgTable("connected_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(), // github, linkedin, supabase, render, etc.
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("Connected").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledgeRetrievalCache = pgTable("knowledge_retrieval_cache", {
  key: varchar("key", { length: 255 }).primaryKey(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  resultText: text("result_text").notNull(),
  retrievedIds: jsonb("retrieved_ids").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  projects: many(projects),
  auditLogs: many(auditLogs),
  userApiKeys: many(userApiKeys),
  connectedServices: many(connectedServices),
  apiSettings: one(userApiSettings, { fields: [users.id], references: [userApiSettings.userId] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  settings: one(projectSettings, { fields: [projects.id], references: [projectSettings.projectId] }),
  projectContextSettings: one(projectContextSettings, { fields: [projects.id], references: [projectContextSettings.projectId] }),
  modes: many(projectModes),
  categories: many(knowledgeCategories),
  sources: many(knowledgeSources),
  chunks: many(knowledgeChunks),
  sessions: many(chatSessions),
  notes: many(notes),
  reports: many(reports),
}));

export const categoriesRelations = relations(knowledgeCategories, ({ one, many }) => ({
  project: one(projects, { fields: [knowledgeCategories.projectId], references: [projects.id] }),
  sources: many(knowledgeSources),
}));

export const sourcesRelations = relations(knowledgeSources, ({ one, many }) => ({
  project: one(projects, { fields: [knowledgeSources.projectId], references: [projects.id] }),
  category: one(knowledgeCategories, { fields: [knowledgeSources.categoryId], references: [knowledgeCategories.id] }),
  chunks: many(knowledgeChunks),
}));

export const projectWidgetSettings = pgTable("project_widget_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  botName: varchar("bot_name", { length: 255 }).notNull(),
  botAvatar: text("bot_avatar"),
  welcomeMessage: text("welcome_message").notNull(),
  themeColor: varchar("theme_color", { length: 50 }).default("#8B5CF6").notNull(), // Default purple
  position: varchar("position", { length: 50 }).default("bottom-right").notNull(), // bottom-right, bottom-left
  displayMode: varchar("display_mode", { length: 50 }).default("floating").notNull(), // floating, panel, full-screen, custom
  customContainerId: varchar("custom_container_id", { length: 255 }),
  allowedDomains: jsonb("allowed_domains").$type<string[]>().default([]).notNull(),
  customCss: text("custom_css"),
  leadsEnabled: boolean("leads_enabled").default(false).notNull(),
  humanHandoffLinks: jsonb("human_handoff_links").$type<Record<string, string>>().default({}).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  widgetToken: varchar("widget_token", { length: 255 }).notNull().unique(), // Unique token to embed in public HTML
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Website Context Engine Settings
export const projectContextSettings = pgTable("project_context_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  dashboardAnalysis: boolean("dashboard_analysis").notNull().default(true),
  formAssistant: boolean("form_assistant").notNull().default(true),
  tableAnalysis: boolean("table_analysis").notNull().default(true),
  navigationAssistant: boolean("navigation_assistant").notNull().default(true),
  knowledgeComparison: boolean("knowledge_comparison").notNull().default(true),
  mistakeDetection: boolean("mistake_detection").notNull().default(true),
  contextMemory: boolean("context_memory").notNull().default(true),
  developerDebugMode: boolean("developer_debug_mode").notNull().default(false),
  maxContextSizeBytes: integer("max_context_size_bytes").notNull().default(6144),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const projectApiKeys = pgTable("project_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).notNull(), // gemini, openai, claude, groq, etc.
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  model: varchar("model", { length: 255 }), // Default model to use for this project & provider
  isPrimary: boolean("is_primary").default(false).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  status: varchar("status", { length: 50 }).default("HEALTHY").notNull(), // HEALTHY, RATE_LIMIT, TOKEN_LIMIT, DAILY_QUOTA, MONTHLY_CREDIT, INVALID_API_KEY, INVALID_MODEL, PROVIDER_DOWN, NETWORK_ERROR, DISABLED, UNHEALTHY
  healthScore: integer("health_score").default(100).notNull(), // 0 to 100
  latencyMs: integer("latency_ms").default(0).notNull(), // Moving average latency
  region: varchar("region", { length: 50 }),
  providerInfo: jsonb("provider_info"), // Store vision, streaming, json mode, context window, quotas
  lastSuccess: timestamp("last_success"),
  lastFailure: timestamp("last_failure"),
  lastUsed: timestamp("last_used"),
  failureReason: text("failure_reason"),
  cooldownUntil: timestamp("cooldown_until"),
  availableModels: jsonb("available_models"),
  totalRequests: integer("total_requests").default(0).notNull(),
  totalFailures: integer("total_failures").default(0).notNull(),
  tokensToday: integer("tokens_today").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("project_api_keys_project_id_idx").on(table.projectId),
}));

export const widgetAnalytics = pgTable("widget_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(), // Keep granularity at day level or use exact timestamps and group query later
  conversations: integer("conversations").default(0).notNull(),
  messages: integer("messages").default(0).notNull(),
  uniqueVisitors: integer("unique_visitors").default(0).notNull(),
  tokenUsage: integer("token_usage").default(0).notNull(),
  aiCosts: varchar("ai_costs", { length: 50 }).default("0").notNull(), // Storing as string to avoid floating point issues, or float
  responseTimeMs: integer("response_time_ms").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const widgetLeads = pgTable("widget_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  company: varchar("company", { length: 255 }),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
  sourcePageUrl: text("source_page_url"),
  userIntent: text("user_intent"),
  status: varchar("status", { length: 50 }).default("NEW").notNull(),
  score: varchar("score", { length: 50 }).default("MEDIUM").notNull(),
  scoreValue: integer("score_value").default(50).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("widget_leads_project_id_idx").on(table.projectId),
  emailIdx: index("widget_leads_email_idx").on(table.projectId, table.email),
  phoneIdx: index("widget_leads_phone_idx").on(table.projectId, table.phone),
}));

export const frequentQuestions = pgTable("frequent_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  questionText: text("question_text").notNull(),
  normalizedQuestion: text("normalized_question").notNull(),
  category: varchar("category", { length: 100 }).default("General").notNull(),
  intent: varchar("intent", { length: 100 }).default("general").notNull(),
  count: integer("count").default(1).notNull(),
  lastAskedAt: timestamp("last_asked_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("frequent_questions_project_id_idx").on(table.projectId),
  projNormIdx: uniqueIndex("frequent_questions_proj_norm_idx").on(table.projectId, table.normalizedQuestion),
}));

export const widgetSettingsRelations = relations(projectWidgetSettings, ({ one }) => ({
  project: one(projects, { fields: [projectWidgetSettings.projectId], references: [projects.id] }),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  project: one(projects, { fields: [projectApiKeys.projectId], references: [projects.id] }),
}));

export const widgetAnalyticsRelations = relations(widgetAnalytics, ({ one }) => ({
  project: one(projects, { fields: [widgetAnalytics.projectId], references: [projects.id] }),
}));

export const widgetLeadsRelations = relations(widgetLeads, ({ one, many }) => ({
  project: one(projects, { fields: [widgetLeads.projectId], references: [projects.id] }),
  session: one(chatSessions, { fields: [widgetLeads.sessionId], references: [chatSessions.id] }),
}));

export const frequentQuestionsRelations = relations(frequentQuestions, ({ one }) => ({
  project: one(projects, { fields: [frequentQuestions.projectId], references: [projects.id] }),
}));

export const contextSettingsRelations = relations(projectContextSettings, ({ one }) => ({
  project: one(projects, { fields: [projectContextSettings.projectId], references: [projects.id] }),
}));

// Aria AI v2 - Agent Tables
export const websiteMemory = pgTable("website_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  state: jsonb("state").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentWorkflows = pgTable("agent_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<any[]>().default([]).notNull(),
  status: varchar("status", { length: 50 }).default("idle").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentSkills = pgTable("agent_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  definition: jsonb("definition").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const websiteAdapters = pgTable("website_adapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  tools: jsonb("tools").$type<any[]>().default([]).notNull(),
  apis: jsonb("apis").$type<any[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const enterpriseAuditLogs = pgTable("enterprise_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionType: text("action_type").notNull(),
  details: jsonb("details").default({}).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const websitePermissions = pgTable("website_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  rbacRules: jsonb("rbac_rules").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const browserCapabilities = pgTable("browser_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionName: varchar("action_name", { length: 255 }).notNull(),
  description: text("description"),
  domainAllowlist: jsonb("domain_allowlist").$type<string[]>().default([]).notNull(),
  allowedPaths: jsonb("allowed_paths").$type<string[]>().default([]).notNull(),
  allowedActions: jsonb("allowed_actions").$type<string[]>().default(["navigate", "read", "click", "fill", "wait", "submit"]).notNull(),
  riskLevel: varchar("risk_level", { length: 50 }).default("LOW_RISK_WRITE").notNull(),
  status: varchar("status", { length: 50 }).default("DISCOVERED").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  authRequired: boolean("auth_required").default(false).notNull(),
  encryptedAuthDetails: text("encrypted_auth_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("browser_capabilities_project_id_idx").on(table.projectId),
  projActionUniq: uniqueIndex("browser_cap_proj_action_uniq_idx").on(table.projectId, table.actionName),
}));

export const consumedConfirmations = pgTable("consumed_confirmations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionId: varchar("action_id", { length: 255 }).notNull(),
  consumedAt: timestamp("consumed_at").defaultNow().notNull(),
});

// Aria AI v2 - Relations
export const websiteMemoryRelations = relations(websiteMemory, ({ one }) => ({
  session: one(chatSessions, { fields: [websiteMemory.sessionId], references: [chatSessions.id] }),
}));

export const agentWorkflowsRelations = relations(agentWorkflows, ({ one }) => ({
  project: one(projects, { fields: [agentWorkflows.projectId], references: [projects.id] }),
}));

export const agentSkillsRelations = relations(agentSkills, ({ one }) => ({
  project: one(projects, { fields: [agentSkills.projectId], references: [projects.id] }),
}));

export const websiteAdaptersRelations = relations(websiteAdapters, ({ one }) => ({
  project: one(projects, { fields: [websiteAdapters.projectId], references: [projects.id] }),
}));

export const enterpriseAuditLogsRelations = relations(enterpriseAuditLogs, ({ one }) => ({
  project: one(projects, { fields: [enterpriseAuditLogs.projectId], references: [projects.id] }),
}));

export const websitePermissionsRelations = relations(websitePermissions, ({ one }) => ({
  project: one(projects, { fields: [websitePermissions.projectId], references: [projects.id] }),
}));

// Aria AI v2 - True Website Agent Executions
export const workflowExecutions = pgTable("workflow_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, completed, failed, pending_approval
  plan: jsonb("plan").$type<any[]>().default([]).notNull(),
  memory: jsonb("memory").default({}).notNull(),
  currentStepIndex: integer("current_step_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const executionSteps = pgTable("execution_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  executionId: uuid("execution_id").references(() => workflowExecutions.id, { onDelete: "cascade" }).notNull(),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionTarget: text("action_target"),
  actionValue: text("action_value"),
  status: varchar("status", { length: 50 }).default("planned").notNull(), // planned, executing, verifying, success, failed, retry, failed_final
  retryCount: integer("retry_count").default(0).notNull(),
  verificationResult: jsonb("verification_result").default({}),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  session: one(chatSessions, { fields: [workflowExecutions.sessionId], references: [chatSessions.id] }),
  steps: many(executionSteps),
}));

export const executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(workflowExecutions, { fields: [executionSteps.executionId], references: [workflowExecutions.id] }),
}));

export const apiLogs = pgTable("api_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: uuid("key_id"), // Not a hard FK so logs survive key deletion
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  latencyMs: integer("latency_ms").notNull(),
  success: boolean("success").notNull(),
  failureReason: text("failure_reason"),
  httpCode: integer("http_code"),
  retryCount: integer("retry_count").default(0),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  cost: varchar("cost", { length: 50 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  keyIdIdx: index("api_logs_key_id_idx").on(table.keyId),
  projectIdIdx: index("api_logs_project_id_idx").on(table.projectId),
  userIdIdx: index("api_logs_user_id_idx").on(table.userId),
  orgIdIdx: index("api_logs_org_id_idx").on(table.organizationId),
}));

export const apiLogsRelations = relations(apiLogs, ({ one }) => ({
  user: one(users, { fields: [apiLogs.userId], references: [users.id] }),
  project: one(projects, { fields: [apiLogs.projectId], references: [projects.id] }),
}));

// --- Billing & Licensing Schema ---

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  price: integer("price").notNull(), // in paise
  currency: varchar("currency", { length: 10 }).default("INR").notNull(),
  interval: varchar("interval", { length: 50 }).default("lifetime").notNull(), // lifetime, monthly, yearly
  features: jsonb("features").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projectLicenses = pgTable("project_licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  licenseStatus: varchar("license_status", { length: 50 }).default("inactive").notNull(), // active, inactive
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending").notNull(), // pending, paid, failed
  paymentDate: timestamp("payment_date"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("project_licenses_project_id_idx").on(table.projectId),
}));

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("INR").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, verified, rejected, failed
  method: varchar("method", { length: 50 }).notNull(), // manual_upi, razorpay, stripe
  utrTransactionId: varchar("utr_transaction_id", { length: 255 }),
  screenshotUrl: text("screenshot_url"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("payments_project_id_idx").on(table.projectId),
  userIdIdx: index("payments_user_id_idx").on(table.userId),
  orgIdIdx: index("payments_org_id_idx").on(table.organizationId),
}));

export const paymentLogs = pgTable("payment_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "cascade" }).notNull(),
  action: varchar("action", { length: 100 }).notNull(), // submitted, verified, rejected
  performedBy: uuid("performed_by").references(() => users.id, { onDelete: "set null" }), // User or Admin ID
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  paymentIdIdx: index("payment_logs_payment_id_idx").on(table.paymentId),
}));

// Relations
export const projectLicensesRelations = relations(projectLicenses, ({ one }) => ({
  project: one(projects, { fields: [projectLicenses.projectId], references: [projects.id] }),
  plan: one(plans, { fields: [projectLicenses.planId], references: [plans.id] }),
  approver: one(users, { fields: [projectLicenses.approvedBy], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  logs: many(paymentLogs),
}));

export const paymentLogsRelations = relations(paymentLogs, ({ one }) => ({
  payment: one(payments, { fields: [paymentLogs.paymentId], references: [payments.id] }),
  performer: one(users, { fields: [paymentLogs.performedBy], references: [users.id] }),
}));

// --- WhatsApp Integration Schema ---

export const whatsappConnections = pgTable("whatsapp_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerAccountId: varchar("provider_account_id", { length: 255 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }),
  displayName: varchar("display_name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("disconnected").notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  webhookId: varchar("webhook_id", { length: 255 }),
  lastConnectedAt: timestamp("last_connected_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("whatsapp_connections_project_id_idx").on(table.projectId),
  orgIdIdx: index("whatsapp_connections_org_id_idx").on(table.organizationId),
}));

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => whatsappConnections.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }), // Unified customer link
  providerChatId: varchar("provider_chat_id", { length: 255 }).notNull(),
  customerIdentifier: varchar("customer_identifier", { length: 255 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  assignedMode: varchar("assigned_mode", { length: 50 }).default("ai").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("whatsapp_conversations_project_id_idx").on(table.projectId),
  connectionIdIdx: index("whatsapp_conversations_connection_id_idx").on(table.connectionId),
  providerChatIdIdx: index("whatsapp_conversations_provider_chat_id_idx").on(table.providerChatId),
  customerIdIdx: index("whatsapp_conversations_customer_id_idx").on(table.customerId),
}));

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  conversationId: uuid("conversation_id").references(() => whatsappConversations.id, { onDelete: "cascade" }).notNull(),
  providerMessageId: varchar("provider_message_id", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  direction: varchar("direction", { length: 50 }).notNull(),
  sender: varchar("sender", { length: 255 }),
  messageType: varchar("message_type", { length: 50 }).default("text").notNull(),
  content: text("content"),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  processingStartedAt: timestamp("processing_started_at"),
  processingAttempts: integer("processing_attempts").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  lastError: text("last_error"),
  leaseUntil: timestamp("lease_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("whatsapp_messages_project_id_idx").on(table.projectId),
  conversationIdIdx: index("whatsapp_messages_conversation_id_idx").on(table.conversationId),
  providerMessageIdIdx: index("whatsapp_messages_provider_message_id_idx").on(table.providerMessageId),
  pendingIdx: index("whatsapp_messages_status_idx").on(table.status),
  // Unique constraint for idempotency
  idempotencyIdx: uniqueIndex("whatsapp_messages_idempotency_idx").on(table.projectId, table.provider, table.providerMessageId), 
}));

export const whatsappSettings = pgTable("whatsapp_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  autoReplyEnabled: boolean("auto_reply_enabled").default(false).notNull(),
  replyMode: varchar("reply_mode", { length: 50 }).default("all_business_questions").notNull(),
  confidenceThreshold: integer("confidence_threshold").default(70).notNull(),
  humanHandoffEnabled: boolean("human_handoff_enabled").default(true).notNull(),
  allowedTopics: jsonb("allowed_topics").$type<string[]>().default([]).notNull(),
  blockedTopics: jsonb("blocked_topics").$type<string[]>().default([]).notNull(),
  businessHours: jsonb("business_hours").default({}).notNull(),
  maxAiReplies: integer("max_ai_replies").default(50).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const whatsappHandoffs = pgTable("whatsapp_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  conversationId: uuid("conversation_id").references(() => whatsappConversations.id, { onDelete: "cascade" }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  projectIdIdx: index("whatsapp_handoffs_project_id_idx").on(table.projectId),
  conversationIdIdx: index("whatsapp_handoffs_conversation_id_idx").on(table.conversationId),
}));

export const whatsappAnalytics = pgTable("whatsapp_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(),
  messagesReceived: integer("messages_received").default(0).notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  aiReplies: integer("ai_replies").default(0).notNull(),
  humanReplies: integer("human_replies").default(0).notNull(),
  humanHandoffs: integer("human_handoffs").default(0).notNull(),
  unresolvedQuestions: integer("unresolved_questions").default(0).notNull(),
  averageResponseTimeMs: integer("average_response_time_ms").default(0).notNull(),
  providerErrors: integer("provider_errors").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("whatsapp_analytics_project_id_idx").on(table.projectId),
}));

export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
  project: one(projects, { fields: [whatsappConnections.projectId], references: [projects.id] }),
  conversations: many(whatsappConversations),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  project: one(projects, { fields: [whatsappConversations.projectId], references: [projects.id] }),
  connection: one(whatsappConnections, { fields: [whatsappConversations.connectionId], references: [whatsappConnections.id] }),
  messages: many(whatsappMessages),
  handoffs: many(whatsappHandoffs),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  project: one(projects, { fields: [whatsappMessages.projectId], references: [projects.id] }),
  conversation: one(whatsappConversations, { fields: [whatsappMessages.conversationId], references: [whatsappConversations.id] }),
}));

export const whatsappSettingsRelations = relations(whatsappSettings, ({ one }) => ({
  project: one(projects, { fields: [whatsappSettings.projectId], references: [projects.id] }),
}));

export const whatsappHandoffsRelations = relations(whatsappHandoffs, ({ one }) => ({
  project: one(projects, { fields: [whatsappHandoffs.projectId], references: [projects.id] }),
  conversation: one(whatsappConversations, { fields: [whatsappHandoffs.conversationId], references: [whatsappConversations.id] }),
  user: one(users, { fields: [whatsappHandoffs.assignedTo], references: [users.id] }),
}));

export const whatsappAnalyticsRelations = relations(whatsappAnalytics, ({ one }) => ({
  project: one(projects, { fields: [whatsappAnalytics.projectId], references: [projects.id] }),
}));

export const projectEntitlements = pgTable("project_entitlements", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  trialStartedAt: timestamp("trial_started_at"),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("inactive").notNull(),
  entitlementStatus: varchar("entitlement_status", { length: 50 }).default("TRIAL_ACTIVE").notNull(),
  customTrialDays: integer("custom_trial_days"),
  planId: uuid("plan_id"),
  subscriptionId: varchar("subscription_id", { length: 255 }),
  subscriptionStartedAt: timestamp("subscription_started_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const securityAuditLogs = pgTable("security_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  event: varchar("event", { length: 100 }).notNull(),
  userId: uuid("user_id"),
  projectId: uuid("project_id"),
  requestId: varchar("request_id", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 100 }),
  origin: varchar("origin", { length: 255 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Phase 2E: Authorized Business Integrations ---

export const projectIntegrations = pgTable("project_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).default("NOT_CONNECTED").notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  config: jsonb("config").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index("project_integrations_project_id_idx").on(table.projectId),
  idProjectUnique: unique("project_integrations_id_project_unique").on(table.id, table.projectId),
}));

export const integrationTools = pgTable("integration_tools", {
  id: uuid("id").primaryKey().defaultRandom(),
  integrationId: uuid("integration_id").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionName: varchar("action_name", { length: 255 }).notNull(),
  description: text("description"),
  inputSchema: jsonb("input_schema").default({}).notNull(),
  outputSchema: jsonb("output_schema").default({}).notNull(),
  riskLevel: varchar("risk_level", { length: 50 }).default("READ_ONLY").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  status: varchar("status", { length: 50 }).default("DISCOVERED").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  integrationIdIdx: index("integration_tools_integration_id_idx").on(table.integrationId),
  projectIdIdx: index("integration_tools_project_id_idx").on(table.projectId),
  actionNameIdx: index("integration_tools_action_name_idx").on(table.integrationId, table.actionName),
  integrationProjectFk: foreignKey({
    columns: [table.integrationId, table.projectId],
    foreignColumns: [projectIntegrations.id, projectIntegrations.projectId],
    name: "integration_tools_integration_project_fk"
  }).onDelete("cascade"),
}));

export const projectIntegrationsRelations = relations(projectIntegrations, ({ one, many }) => ({
  project: one(projects, { fields: [projectIntegrations.projectId], references: [projects.id] }),
  tools: many(integrationTools),
}));

export const integrationToolsRelations = relations(integrationTools, ({ one }) => ({
  integration: one(projectIntegrations, { fields: [integrationTools.integrationId], references: [projectIntegrations.id] }),
  project: one(projects, { fields: [integrationTools.projectId], references: [projects.id] }),
}));

export const messageFeedback = pgTable("message_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  type: varchar("type", { length: 50 }).notNull(),
  comment: text("comment"),
  channel: varchar("channel", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("message_feedback_project_id_idx").on(table.projectId),
  messageIdIdx: index("message_feedback_message_id_idx").on(table.messageId)
}));

export const messageFeedbackRelations = relations(messageFeedback, ({ one }) => ({
  project: one(projects, { fields: [messageFeedback.projectId], references: [projects.id] }),
  session: one(chatSessions, { fields: [messageFeedback.sessionId], references: [chatSessions.id] }),
  message: one(messages, { fields: [messageFeedback.messageId], references: [messages.id] }),
  customer: one(customers, { fields: [messageFeedback.customerId], references: [customers.id] })
}));

export const projectFeedback = pgTable("project_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  category: varchar("category", { length: 100 }),
  rating: integer("rating"),
  comment: text("comment").notNull(),
  channel: varchar("channel", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_feedback_project_id_idx").on(table.projectId)
}));

export const projectFeedbackRelations = relations(projectFeedback, ({ one }) => ({
  project: one(projects, { fields: [projectFeedback.projectId], references: [projects.id] }),
  customer: one(customers, { fields: [projectFeedback.customerId], references: [customers.id] })
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: varchar("organization_id", { length: 255 }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  referenceId: uuid("reference_id"),
  readAt: timestamp("read_at"),
  dedupeKey: varchar("dedupe_key", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("notifications_project_id_idx").on(table.projectId),
  orgIdIdx: index("notifications_org_id_idx").on(table.organizationId),
  dedupeKeyIdx: index("notifications_dedupe_key_idx").on(table.dedupeKey)
}));

export const notificationSettings = pgTable("notification_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  notifyOnDislikes: integer("notify_on_dislikes").default(3).notNull(),
  notifyOnLikes: integer("notify_on_likes").default(3).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
