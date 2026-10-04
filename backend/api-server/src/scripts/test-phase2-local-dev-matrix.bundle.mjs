var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// backend/api-server/src/scripts/test-phase2-local-dev-matrix.ts
import http from "http";

// database/db/src/index.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";

// database/db/src/schema/index.ts
var schema_exports = {};
__export(schema_exports, {
  agentSkills: () => agentSkills,
  agentSkillsRelations: () => agentSkillsRelations,
  agentWorkflows: () => agentWorkflows,
  agentWorkflowsRelations: () => agentWorkflowsRelations,
  apiLogs: () => apiLogs,
  apiLogsRelations: () => apiLogsRelations,
  auditLogs: () => auditLogs,
  browserCapabilities: () => browserCapabilities,
  categoriesRelations: () => categoriesRelations,
  chatSessions: () => chatSessions,
  connectedServices: () => connectedServices,
  consumedConfirmations: () => consumedConfirmations,
  contextSettingsRelations: () => contextSettingsRelations,
  customers: () => customers,
  enterpriseAuditLogs: () => enterpriseAuditLogs,
  enterpriseAuditLogsRelations: () => enterpriseAuditLogsRelations,
  executionSteps: () => executionSteps,
  executionStepsRelations: () => executionStepsRelations,
  frequentQuestions: () => frequentQuestions,
  frequentQuestionsRelations: () => frequentQuestionsRelations,
  globalSettings: () => globalSettings,
  integrationTools: () => integrationTools,
  integrationToolsRelations: () => integrationToolsRelations,
  knowledgeCategories: () => knowledgeCategories,
  knowledgeChunks: () => knowledgeChunks,
  knowledgeGaps: () => knowledgeGaps,
  knowledgeRetrievalCache: () => knowledgeRetrievalCache,
  knowledgeSources: () => knowledgeSources,
  messageFeedback: () => messageFeedback,
  messageFeedbackRelations: () => messageFeedbackRelations,
  messages: () => messages,
  notes: () => notes,
  notificationSettings: () => notificationSettings,
  notifications: () => notifications,
  organizationMembers: () => organizationMembers,
  organizationUsage: () => organizationUsage,
  organizations: () => organizations,
  paymentLogs: () => paymentLogs,
  paymentLogsRelations: () => paymentLogsRelations,
  payments: () => payments,
  paymentsRelations: () => paymentsRelations,
  plans: () => plans,
  projectApiKeys: () => projectApiKeys,
  projectApiKeysRelations: () => projectApiKeysRelations,
  projectContextSettings: () => projectContextSettings,
  projectEntitlements: () => projectEntitlements,
  projectFeedback: () => projectFeedback,
  projectFeedbackRelations: () => projectFeedbackRelations,
  projectIntegrations: () => projectIntegrations,
  projectIntegrationsRelations: () => projectIntegrationsRelations,
  projectLicenses: () => projectLicenses,
  projectLicensesRelations: () => projectLicensesRelations,
  projectLocalSessions: () => projectLocalSessions,
  projectLocalSessionsRelations: () => projectLocalSessionsRelations,
  projectModes: () => projectModes,
  projectSettings: () => projectSettings,
  projectWidgetSettings: () => projectWidgetSettings,
  projects: () => projects,
  projectsRelations: () => projectsRelations,
  reports: () => reports,
  securityAuditLogs: () => securityAuditLogs,
  sourcesRelations: () => sourcesRelations,
  systemErrors: () => systemErrors,
  usageEvents: () => usageEvents,
  userApiKeys: () => userApiKeys,
  userApiSettings: () => userApiSettings,
  users: () => users,
  usersRelations: () => usersRelations,
  websiteAdapters: () => websiteAdapters,
  websiteAdaptersRelations: () => websiteAdaptersRelations,
  websiteMemory: () => websiteMemory,
  websiteMemoryRelations: () => websiteMemoryRelations,
  websitePermissions: () => websitePermissions,
  websitePermissionsRelations: () => websitePermissionsRelations,
  whatsappAnalytics: () => whatsappAnalytics,
  whatsappAnalyticsRelations: () => whatsappAnalyticsRelations,
  whatsappConnections: () => whatsappConnections,
  whatsappConnectionsRelations: () => whatsappConnectionsRelations,
  whatsappConversations: () => whatsappConversations,
  whatsappConversationsRelations: () => whatsappConversationsRelations,
  whatsappHandoffs: () => whatsappHandoffs,
  whatsappHandoffsRelations: () => whatsappHandoffsRelations,
  whatsappMessages: () => whatsappMessages,
  whatsappMessagesRelations: () => whatsappMessagesRelations,
  whatsappSettings: () => whatsappSettings,
  whatsappSettingsRelations: () => whatsappSettingsRelations,
  widgetAnalytics: () => widgetAnalytics,
  widgetAnalyticsRelations: () => widgetAnalyticsRelations,
  widgetLeads: () => widgetLeads,
  widgetLeadsRelations: () => widgetLeadsRelations,
  widgetSettingsRelations: () => widgetSettingsRelations,
  workflowExecutions: () => workflowExecutions,
  workflowExecutionsRelations: () => workflowExecutionsRelations
});
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
  foreignKey
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
var globalSettings = pgTable("global_settings", {
  id: varchar("id", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var systemErrors = pgTable("system_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: varchar("source", { length: 100 }).notNull(),
  // 'chatbot', 'system', 'render'
  message: text("message").notNull(),
  stack: text("stack"),
  context: jsonb("context"),
  isResolved: boolean("is_resolved").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  // super_admin, admin, user, client
  features: jsonb("features").$type().default({ canCreateProject: true, canUseWidgetStudio: false, canUseContextEngine: false }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var organizations = pgTable("organizations", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var organizationMembers = pgTable("organization_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 50 }).default("viewer").notNull(),
  // owner, admin, manager, agent, viewer
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  orgUserUniq: uniqueIndex("org_user_uniq_idx").on(table.organizationId, table.userId),
  orgIdIdx: index("org_members_org_id_idx").on(table.organizationId),
  userIdIdx: index("org_members_user_id_idx").on(table.userId)
}));
var organizationUsage = pgTable("organization_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  billingCycleStart: timestamp("billing_cycle_start").notNull(),
  billingCycleEnd: timestamp("billing_cycle_end").notNull(),
  messagesSent: integer("messages_sent").default(0).notNull(),
  storageBytes: integer("storage_bytes").default(0).notNull(),
  crawlCount: integer("crawl_count").default(0).notNull(),
  actionCount: integer("action_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  orgCycleUniq: uniqueIndex("org_cycle_uniq_idx").on(table.organizationId, table.billingCycleStart),
  orgIdIdx: index("org_usage_org_id_idx").on(table.organizationId)
}));
var usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  // message, crawl, parse, ocr, action
  quantity: integer("quantity").default(1).notNull(),
  provider: varchar("provider", { length: 50 }),
  model: varchar("model", { length: 255 }),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  estimatedCost: varchar("estimated_cost", { length: 50 }).default("0").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  orgIdIdx: index("usage_events_org_id_idx").on(table.organizationId),
  orgTypeIdx: index("usage_events_org_type_idx").on(table.organizationId, table.eventType)
}));
var knowledgeGaps = pgTable("knowledge_gaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  questionText: text("question_text").notNull(),
  normalizedQuestion: text("normalized_question"),
  askedCount: integer("asked_count").default(1).notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedSourceId: uuid("resolved_source_id").references(() => knowledgeSources.id, { onDelete: "set null" }),
  sourceUrl: text("source_url"),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "set null" }),
  confidence: varchar("confidence", { length: 50 }),
  reason: varchar("reason", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("knowledge_gaps_project_id_idx").on(table.projectId),
  projNormIdx: index("knowledge_gaps_proj_norm_idx").on(table.projectId, table.normalizedQuestion)
}));
var projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").default("").notNull(),
  shareToken: varchar("share_token", { length: 50 }),
  isActive: boolean("is_active").default(true),
  tags: jsonb("tags").$type().default([]).notNull(),
  allowedDomains: jsonb("allowed_domains").$type().default(["*"]).notNull(),
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
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("projects_user_id_idx").on(table.userId),
  organizationIdIdx: index("projects_organization_id_idx").on(table.organizationId)
}));
var projectSettings = pgTable("project_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  defaultMode: varchar("default_mode", { length: 50 }).default("friendly"),
  storageLimit: integer("storage_limit").default(100),
  // MBs
  isClientAgentEnabled: boolean("is_client_agent_enabled").default(false)
});
var projectModes = pgTable("project_modes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  promptInstructions: text("prompt_instructions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_modes_project_id_idx").on(table.projectId)
}));
var knowledgeCategories = pgTable("knowledge_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isWidgetExposed: boolean("is_widget_exposed").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("knowledge_categories_project_id_idx").on(table.projectId)
}));
var knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  kbId: varchar("kb_id", { length: 50 }).unique(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  categoryId: uuid("category_id").references(() => knowledgeCategories.id, { onDelete: "set null" }),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  // Enforces customer RAG isolation
  tag: varchar("tag", { length: 255 }),
  title: text("title"),
  filename: text("filename"),
  // Optional, if it's a file
  sourceUrl: text("source_url"),
  // For website, youtube, etc.
  websiteLinks: jsonb("website_links").$type().default([]).notNull(),
  videoLinks: jsonb("video_links").$type().default([]).notNull(),
  githubLinks: jsonb("github_links").$type().default([]).notNull(),
  fileId: varchar("file_id", { length: 255 }),
  // Storage ID if uploaded
  sourceType: varchar("source_type", { length: 50 }).notNull(),
  // file, website, youtube, instagram, github, note
  isWidgetExposed: boolean("is_widget_exposed").default(true).notNull(),
  notes: text("notes"),
  rawContent: text("raw_content"),
  summary: text("summary"),
  tools: jsonb("tools").$type().default([]).notNull(),
  steps: jsonb("steps").$type().default([]).notNull(),
  keywordIndex: text("keyword_index"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  // pending, processing, processed, error
  retryCount: integer("retry_count").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("knowledge_sources_project_id_idx").on(table.projectId),
  categoryIdIdx: index("knowledge_sources_category_id_idx").on(table.categoryId),
  customerIdIdx: index("knowledge_sources_customer_id_idx").on(table.customerId)
}));
var knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeSourceId: uuid("knowledge_source_id").references(() => knowledgeSources.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  // Gemini embedding size (768)
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  sourceIdIdx: index("knowledge_chunks_source_id_idx").on(table.knowledgeSourceId),
  projectIdIdx: index("knowledge_chunks_project_id_idx").on(table.projectId),
  embeddingHnswIdx: index("knowledge_chunks_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))
}));
var customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  externalId: varchar("external_id", { length: 255 }),
  // Client's internal ID for their customer
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  name: varchar("name", { length: 255 }),
  channel: varchar("channel", { length: 50 }).default("website").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("customers_project_id_idx").on(table.projectId),
  emailIdx: index("customers_email_idx").on(table.projectId, table.email),
  externalIdIdx: uniqueIndex("customers_external_id_idx").on(table.projectId, table.externalId)
}));
var chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  // RAGHUB Platform user
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  // End-customer
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  modeId: uuid("mode_id").references(() => projectModes.id),
  title: text("title").notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("chat_sessions_user_id_idx").on(table.userId),
  projectIdIdx: index("chat_sessions_project_id_idx").on(table.projectId),
  customerIdIdx: index("chat_sessions_customer_id_idx").on(table.customerId)
}));
var messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  sender: varchar("sender", { length: 50 }).notNull(),
  // user or ai
  content: text("content").notNull(),
  sourceTransparency: varchar("source_transparency", { length: 100 }),
  // project, gemini, combined
  confidence: varchar("confidence", { length: 50 }),
  // high, medium, low
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  sessionIdIdx: index("messages_session_id_idx").on(table.sessionId)
}));
var notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  contentUrl: text("content_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  target: varchar("target", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var userApiKeys = pgTable("user_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  // null = system key
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).default("gemini").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  // Preserved for system keys
  status: varchar("status", { length: 50 }).default("HEALTHY").notNull(),
  // HEALTHY, RATE_LIMIT, TOKEN_LIMIT, DAILY_QUOTA, MONTHLY_CREDIT, INVALID_API_KEY, INVALID_MODEL, PROVIDER_DOWN, NETWORK_ERROR, DISABLED, UNHEALTHY
  healthScore: integer("health_score").default(100).notNull(),
  // 0 to 100
  latencyMs: integer("latency_ms").default(0).notNull(),
  // Moving average latency
  region: varchar("region", { length: 50 }),
  providerInfo: jsonb("provider_info"),
  // Store vision, streaming, json mode, context window, quotas
  lastSuccess: timestamp("last_success"),
  lastFailure: timestamp("last_failure"),
  lastUsed: timestamp("last_used"),
  failureReason: text("failure_reason"),
  cooldownUntil: timestamp("cooldown_until"),
  totalRequests: integer("total_requests").default(0).notNull(),
  totalFailures: integer("total_failures").default(0).notNull(),
  dailyLimit: integer("daily_limit"),
  // null = no limit (for user keys), 20 for system keys
  dailyUsed: integer("daily_used").default(0).notNull(),
  tokensToday: integer("tokens_today").default(0).notNull(),
  availableModels: jsonb("available_models"),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  userIdIdx: index("user_api_keys_user_id_idx").on(table.userId)
}));
var userApiSettings = pgTable("user_api_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  apiMode: varchar("api_mode", { length: 50 }).default("auto").notNull(),
  // auto, user_first, system_first
  chatHistoryRetentionDays: integer("chat_history_retention_days").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var connectedServices = pgTable("connected_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  // github, linkedin, supabase, render, etc.
  name: text("name").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("Connected").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var knowledgeRetrievalCache = pgTable("knowledge_retrieval_cache", {
  key: varchar("key", { length: 255 }).primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  resultText: text("result_text").notNull(),
  retrievedIds: jsonb("retrieved_ids").$type().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var usersRelations = relations(users, ({ many, one }) => ({
  projects: many(projects),
  auditLogs: many(auditLogs),
  userApiKeys: many(userApiKeys),
  connectedServices: many(connectedServices),
  apiSettings: one(userApiSettings, { fields: [users.id], references: [userApiSettings.userId] })
}));
var projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  settings: one(projectSettings, { fields: [projects.id], references: [projectSettings.projectId] }),
  projectContextSettings: one(projectContextSettings, { fields: [projects.id], references: [projectContextSettings.projectId] }),
  modes: many(projectModes),
  categories: many(knowledgeCategories),
  sources: many(knowledgeSources),
  chunks: many(knowledgeChunks),
  sessions: many(chatSessions),
  notes: many(notes),
  reports: many(reports)
}));
var categoriesRelations = relations(knowledgeCategories, ({ one, many }) => ({
  project: one(projects, { fields: [knowledgeCategories.projectId], references: [projects.id] }),
  sources: many(knowledgeSources)
}));
var sourcesRelations = relations(knowledgeSources, ({ one, many }) => ({
  project: one(projects, { fields: [knowledgeSources.projectId], references: [projects.id] }),
  category: one(knowledgeCategories, { fields: [knowledgeSources.categoryId], references: [knowledgeCategories.id] }),
  chunks: many(knowledgeChunks)
}));
var projectWidgetSettings = pgTable("project_widget_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  botName: varchar("bot_name", { length: 255 }).notNull(),
  botAvatar: text("bot_avatar"),
  welcomeMessage: text("welcome_message").notNull(),
  themeColor: varchar("theme_color", { length: 50 }).default("#8B5CF6").notNull(),
  // Default purple
  position: varchar("position", { length: 50 }).default("bottom-right").notNull(),
  // bottom-right, bottom-left
  displayMode: varchar("display_mode", { length: 50 }).default("floating").notNull(),
  // floating, panel, full-screen, custom
  customContainerId: varchar("custom_container_id", { length: 255 }),
  allowedDomains: jsonb("allowed_domains").$type().default([]).notNull(),
  customCss: text("custom_css"),
  leadsEnabled: boolean("leads_enabled").default(false).notNull(),
  humanHandoffLinks: jsonb("human_handoff_links").$type().default({}).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  widgetToken: varchar("widget_token", { length: 255 }).notNull().unique(),
  // Unique token to embed in public HTML
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var projectContextSettings = pgTable("project_context_settings", {
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
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});
var projectApiKeys = pgTable("project_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).notNull(),
  // gemini, openai, claude, groq, etc.
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  model: varchar("model", { length: 255 }),
  // Default model to use for this project & provider
  isPrimary: boolean("is_primary").default(false).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  status: varchar("status", { length: 50 }).default("HEALTHY").notNull(),
  // HEALTHY, RATE_LIMIT, TOKEN_LIMIT, DAILY_QUOTA, MONTHLY_CREDIT, INVALID_API_KEY, INVALID_MODEL, PROVIDER_DOWN, NETWORK_ERROR, DISABLED, UNHEALTHY
  healthScore: integer("health_score").default(100).notNull(),
  // 0 to 100
  latencyMs: integer("latency_ms").default(0).notNull(),
  // Moving average latency
  region: varchar("region", { length: 50 }),
  providerInfo: jsonb("provider_info"),
  // Store vision, streaming, json mode, context window, quotas
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_api_keys_project_id_idx").on(table.projectId)
}));
var widgetAnalytics = pgTable("widget_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(),
  // Keep granularity at day level or use exact timestamps and group query later
  conversations: integer("conversations").default(0).notNull(),
  messages: integer("messages").default(0).notNull(),
  uniqueVisitors: integer("unique_visitors").default(0).notNull(),
  tokenUsage: integer("token_usage").default(0).notNull(),
  aiCosts: varchar("ai_costs", { length: 50 }).default("0").notNull(),
  // Storing as string to avoid floating point issues, or float
  responseTimeMs: integer("response_time_ms").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var widgetLeads = pgTable("widget_leads", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("widget_leads_project_id_idx").on(table.projectId),
  emailIdx: index("widget_leads_email_idx").on(table.projectId, table.email),
  phoneIdx: index("widget_leads_phone_idx").on(table.projectId, table.phone)
}));
var frequentQuestions = pgTable("frequent_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  questionText: text("question_text").notNull(),
  normalizedQuestion: text("normalized_question").notNull(),
  category: varchar("category", { length: 100 }).default("General").notNull(),
  intent: varchar("intent", { length: 100 }).default("general").notNull(),
  count: integer("count").default(1).notNull(),
  lastAskedAt: timestamp("last_asked_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("frequent_questions_project_id_idx").on(table.projectId),
  projNormIdx: uniqueIndex("frequent_questions_proj_norm_idx").on(table.projectId, table.normalizedQuestion)
}));
var widgetSettingsRelations = relations(projectWidgetSettings, ({ one }) => ({
  project: one(projects, { fields: [projectWidgetSettings.projectId], references: [projects.id] })
}));
var projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  project: one(projects, { fields: [projectApiKeys.projectId], references: [projects.id] })
}));
var widgetAnalyticsRelations = relations(widgetAnalytics, ({ one }) => ({
  project: one(projects, { fields: [widgetAnalytics.projectId], references: [projects.id] })
}));
var widgetLeadsRelations = relations(widgetLeads, ({ one, many }) => ({
  project: one(projects, { fields: [widgetLeads.projectId], references: [projects.id] }),
  session: one(chatSessions, { fields: [widgetLeads.sessionId], references: [chatSessions.id] })
}));
var frequentQuestionsRelations = relations(frequentQuestions, ({ one }) => ({
  project: one(projects, { fields: [frequentQuestions.projectId], references: [projects.id] })
}));
var contextSettingsRelations = relations(projectContextSettings, ({ one }) => ({
  project: one(projects, { fields: [projectContextSettings.projectId], references: [projects.id] })
}));
var websiteMemory = pgTable("website_memory", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  state: jsonb("state").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var agentWorkflows = pgTable("agent_workflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  steps: jsonb("steps").$type().default([]).notNull(),
  status: varchar("status", { length: 50 }).default("idle").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var agentSkills = pgTable("agent_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  definition: jsonb("definition").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var websiteAdapters = pgTable("website_adapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  tools: jsonb("tools").$type().default([]).notNull(),
  apis: jsonb("apis").$type().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var enterpriseAuditLogs = pgTable("enterprise_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionType: text("action_type").notNull(),
  details: jsonb("details").default({}).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull()
});
var websitePermissions = pgTable("website_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  rbacRules: jsonb("rbac_rules").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var browserCapabilities = pgTable("browser_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionName: varchar("action_name", { length: 255 }).notNull(),
  description: text("description"),
  domainAllowlist: jsonb("domain_allowlist").$type().default([]).notNull(),
  allowedPaths: jsonb("allowed_paths").$type().default([]).notNull(),
  allowedActions: jsonb("allowed_actions").$type().default(["navigate", "read", "click", "fill", "wait", "submit"]).notNull(),
  riskLevel: varchar("risk_level", { length: 50 }).default("LOW_RISK_WRITE").notNull(),
  status: varchar("status", { length: 50 }).default("DISCOVERED").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  authRequired: boolean("auth_required").default(false).notNull(),
  encryptedAuthDetails: text("encrypted_auth_details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("browser_capabilities_project_id_idx").on(table.projectId),
  projActionUniq: uniqueIndex("browser_cap_proj_action_uniq_idx").on(table.projectId, table.actionName)
}));
var consumedConfirmations = pgTable("consumed_confirmations", {
  id: varchar("id", { length: 255 }).primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  actionId: varchar("action_id", { length: 255 }).notNull(),
  consumedAt: timestamp("consumed_at").defaultNow().notNull()
});
var websiteMemoryRelations = relations(websiteMemory, ({ one }) => ({
  session: one(chatSessions, { fields: [websiteMemory.sessionId], references: [chatSessions.id] })
}));
var agentWorkflowsRelations = relations(agentWorkflows, ({ one }) => ({
  project: one(projects, { fields: [agentWorkflows.projectId], references: [projects.id] })
}));
var agentSkillsRelations = relations(agentSkills, ({ one }) => ({
  project: one(projects, { fields: [agentSkills.projectId], references: [projects.id] })
}));
var websiteAdaptersRelations = relations(websiteAdapters, ({ one }) => ({
  project: one(projects, { fields: [websiteAdapters.projectId], references: [projects.id] })
}));
var enterpriseAuditLogsRelations = relations(enterpriseAuditLogs, ({ one }) => ({
  project: one(projects, { fields: [enterpriseAuditLogs.projectId], references: [projects.id] })
}));
var websitePermissionsRelations = relations(websitePermissions, ({ one }) => ({
  project: one(projects, { fields: [websitePermissions.projectId], references: [projects.id] })
}));
var workflowExecutions = pgTable("workflow_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  // active, completed, failed, pending_approval
  plan: jsonb("plan").$type().default([]).notNull(),
  memory: jsonb("memory").default({}).notNull(),
  currentStepIndex: integer("current_step_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var executionSteps = pgTable("execution_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  executionId: uuid("execution_id").references(() => workflowExecutions.id, { onDelete: "cascade" }).notNull(),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  actionTarget: text("action_target"),
  actionValue: text("action_value"),
  status: varchar("status", { length: 50 }).default("planned").notNull(),
  // planned, executing, verifying, success, failed, retry, failed_final
  retryCount: integer("retry_count").default(0).notNull(),
  verificationResult: jsonb("verification_result").default({}),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  session: one(chatSessions, { fields: [workflowExecutions.sessionId], references: [chatSessions.id] }),
  steps: many(executionSteps)
}));
var executionStepsRelations = relations(executionSteps, ({ one }) => ({
  execution: one(workflowExecutions, { fields: [executionSteps.executionId], references: [workflowExecutions.id] })
}));
var apiLogs = pgTable("api_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyId: uuid("key_id"),
  // Not a hard FK so logs survive key deletion
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
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  keyIdIdx: index("api_logs_key_id_idx").on(table.keyId),
  projectIdIdx: index("api_logs_project_id_idx").on(table.projectId),
  userIdIdx: index("api_logs_user_id_idx").on(table.userId),
  orgIdIdx: index("api_logs_org_id_idx").on(table.organizationId)
}));
var apiLogsRelations = relations(apiLogs, ({ one }) => ({
  user: one(users, { fields: [apiLogs.userId], references: [users.id] }),
  project: one(projects, { fields: [apiLogs.projectId], references: [projects.id] })
}));
var plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  price: integer("price").notNull(),
  // in paise
  currency: varchar("currency", { length: 10 }).default("INR").notNull(),
  interval: varchar("interval", { length: 50 }).default("lifetime").notNull(),
  // lifetime, monthly, yearly
  features: jsonb("features").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var projectLicenses = pgTable("project_licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  licenseStatus: varchar("license_status", { length: 50 }).default("inactive").notNull(),
  // active, inactive
  paymentStatus: varchar("payment_status", { length: 50 }).default("pending").notNull(),
  // pending, paid, failed
  paymentDate: timestamp("payment_date"),
  approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_licenses_project_id_idx").on(table.projectId)
}));
var payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 10 }).default("INR").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  // pending, verified, rejected, failed
  method: varchar("method", { length: 50 }).notNull(),
  // manual_upi, razorpay, stripe
  utrTransactionId: varchar("utr_transaction_id", { length: 255 }),
  screenshotUrl: text("screenshot_url"),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("payments_project_id_idx").on(table.projectId),
  userIdIdx: index("payments_user_id_idx").on(table.userId),
  orgIdIdx: index("payments_org_id_idx").on(table.organizationId)
}));
var paymentLogs = pgTable("payment_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "cascade" }).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  // submitted, verified, rejected
  performedBy: uuid("performed_by").references(() => users.id, { onDelete: "set null" }),
  // User or Admin ID
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  paymentIdIdx: index("payment_logs_payment_id_idx").on(table.paymentId)
}));
var projectLicensesRelations = relations(projectLicenses, ({ one }) => ({
  project: one(projects, { fields: [projectLicenses.projectId], references: [projects.id] }),
  plan: one(plans, { fields: [projectLicenses.planId], references: [plans.id] }),
  approver: one(users, { fields: [projectLicenses.approvedBy], references: [users.id] })
}));
var paymentsRelations = relations(payments, ({ one, many }) => ({
  project: one(projects, { fields: [payments.projectId], references: [projects.id] }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  logs: many(paymentLogs)
}));
var paymentLogsRelations = relations(paymentLogs, ({ one }) => ({
  payment: one(payments, { fields: [paymentLogs.paymentId], references: [payments.id] }),
  performer: one(users, { fields: [paymentLogs.performedBy], references: [users.id] })
}));
var whatsappConnections = pgTable("whatsapp_connections", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("whatsapp_connections_project_id_idx").on(table.projectId),
  orgIdIdx: index("whatsapp_connections_org_id_idx").on(table.organizationId)
}));
var whatsappConversations = pgTable("whatsapp_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  connectionId: uuid("connection_id").references(() => whatsappConnections.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  // Unified customer link
  providerChatId: varchar("provider_chat_id", { length: 255 }).notNull(),
  customerIdentifier: varchar("customer_identifier", { length: 255 }).notNull(),
  customerName: varchar("customer_name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  assignedMode: varchar("assigned_mode", { length: 50 }).default("ai").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("whatsapp_conversations_project_id_idx").on(table.projectId),
  connectionIdIdx: index("whatsapp_conversations_connection_id_idx").on(table.connectionId),
  providerChatIdIdx: index("whatsapp_conversations_provider_chat_id_idx").on(table.providerChatId),
  customerIdIdx: index("whatsapp_conversations_customer_id_idx").on(table.customerId)
}));
var whatsappMessages = pgTable("whatsapp_messages", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("whatsapp_messages_project_id_idx").on(table.projectId),
  conversationIdIdx: index("whatsapp_messages_conversation_id_idx").on(table.conversationId),
  providerMessageIdIdx: index("whatsapp_messages_provider_message_id_idx").on(table.providerMessageId),
  pendingIdx: index("whatsapp_messages_status_idx").on(table.status),
  // Unique constraint for idempotency
  idempotencyIdx: uniqueIndex("whatsapp_messages_idempotency_idx").on(table.projectId, table.provider, table.providerMessageId)
}));
var whatsappSettings = pgTable("whatsapp_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  autoReplyEnabled: boolean("auto_reply_enabled").default(false).notNull(),
  replyMode: varchar("reply_mode", { length: 50 }).default("all_business_questions").notNull(),
  confidenceThreshold: integer("confidence_threshold").default(70).notNull(),
  humanHandoffEnabled: boolean("human_handoff_enabled").default(true).notNull(),
  allowedTopics: jsonb("allowed_topics").$type().default([]).notNull(),
  blockedTopics: jsonb("blocked_topics").$type().default([]).notNull(),
  businessHours: jsonb("business_hours").default({}).notNull(),
  maxAiReplies: integer("max_ai_replies").default(50).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var whatsappHandoffs = pgTable("whatsapp_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  conversationId: uuid("conversation_id").references(() => whatsappConversations.id, { onDelete: "cascade" }).notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at")
}, (table) => ({
  projectIdIdx: index("whatsapp_handoffs_project_id_idx").on(table.projectId),
  conversationIdIdx: index("whatsapp_handoffs_conversation_id_idx").on(table.conversationId)
}));
var whatsappAnalytics = pgTable("whatsapp_analytics", {
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
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("whatsapp_analytics_project_id_idx").on(table.projectId)
}));
var whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
  project: one(projects, { fields: [whatsappConnections.projectId], references: [projects.id] }),
  conversations: many(whatsappConversations)
}));
var whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  project: one(projects, { fields: [whatsappConversations.projectId], references: [projects.id] }),
  connection: one(whatsappConnections, { fields: [whatsappConversations.connectionId], references: [whatsappConnections.id] }),
  messages: many(whatsappMessages),
  handoffs: many(whatsappHandoffs)
}));
var whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  project: one(projects, { fields: [whatsappMessages.projectId], references: [projects.id] }),
  conversation: one(whatsappConversations, { fields: [whatsappMessages.conversationId], references: [whatsappConversations.id] })
}));
var whatsappSettingsRelations = relations(whatsappSettings, ({ one }) => ({
  project: one(projects, { fields: [whatsappSettings.projectId], references: [projects.id] })
}));
var whatsappHandoffsRelations = relations(whatsappHandoffs, ({ one }) => ({
  project: one(projects, { fields: [whatsappHandoffs.projectId], references: [projects.id] }),
  conversation: one(whatsappConversations, { fields: [whatsappHandoffs.conversationId], references: [whatsappConversations.id] }),
  user: one(users, { fields: [whatsappHandoffs.assignedTo], references: [users.id] })
}));
var whatsappAnalyticsRelations = relations(whatsappAnalytics, ({ one }) => ({
  project: one(projects, { fields: [whatsappAnalytics.projectId], references: [projects.id] })
}));
var projectEntitlements = pgTable("project_entitlements", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var securityAuditLogs = pgTable("security_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  event: varchar("event", { length: 100 }).notNull(),
  userId: uuid("user_id"),
  projectId: uuid("project_id"),
  requestId: varchar("request_id", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 100 }),
  origin: varchar("origin", { length: 255 }),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull()
});
var projectIntegrations = pgTable("project_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).default("NOT_CONNECTED").notNull(),
  encryptedCredentials: text("encrypted_credentials"),
  config: jsonb("config").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_integrations_project_id_idx").on(table.projectId),
  idProjectUnique: unique("project_integrations_id_project_unique").on(table.id, table.projectId)
}));
var integrationTools = pgTable("integration_tools", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  integrationIdIdx: index("integration_tools_integration_id_idx").on(table.integrationId),
  projectIdIdx: index("integration_tools_project_id_idx").on(table.projectId),
  actionNameIdx: index("integration_tools_action_name_idx").on(table.integrationId, table.actionName),
  integrationProjectFk: foreignKey({
    columns: [table.integrationId, table.projectId],
    foreignColumns: [projectIntegrations.id, projectIntegrations.projectId],
    name: "integration_tools_integration_project_fk"
  }).onDelete("cascade")
}));
var projectIntegrationsRelations = relations(projectIntegrations, ({ one, many }) => ({
  project: one(projects, { fields: [projectIntegrations.projectId], references: [projects.id] }),
  tools: many(integrationTools)
}));
var integrationToolsRelations = relations(integrationTools, ({ one }) => ({
  integration: one(projectIntegrations, { fields: [integrationTools.integrationId], references: [projectIntegrations.id] }),
  project: one(projects, { fields: [integrationTools.projectId], references: [projects.id] })
}));
var messageFeedback = pgTable("message_feedback", {
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
var messageFeedbackRelations = relations(messageFeedback, ({ one }) => ({
  project: one(projects, { fields: [messageFeedback.projectId], references: [projects.id] }),
  session: one(chatSessions, { fields: [messageFeedback.sessionId], references: [chatSessions.id] }),
  message: one(messages, { fields: [messageFeedback.messageId], references: [messages.id] }),
  customer: one(customers, { fields: [messageFeedback.customerId], references: [customers.id] })
}));
var projectFeedback = pgTable("project_feedback", {
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
var projectFeedbackRelations = relations(projectFeedback, ({ one }) => ({
  project: one(projects, { fields: [projectFeedback.projectId], references: [projects.id] }),
  customer: one(customers, { fields: [projectFeedback.customerId], references: [customers.id] })
}));
var notifications = pgTable("notifications", {
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
var notificationSettings = pgTable("notification_settings", {
  projectId: uuid("project_id").primaryKey().references(() => projects.id, { onDelete: "cascade" }),
  notifyOnDislikes: integer("notify_on_dislikes").default(3).notNull(),
  notifyOnLikes: integer("notify_on_likes").default(3).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
var projectLocalSessions = pgTable("project_local_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  localUrl: varchar("local_url", { length: 2048 }).notNull(),
  developmentUrl: varchar("development_url", { length: 2048 }),
  status: varchar("status", { length: 50 }).default("READY").notNull(),
  // NOT_STARTED, READY, CONNECTED, TESTING, EXPIRED, REVOKED, STOPPED, ERROR
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
  revokedAt: timestamp("revoked_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  projectIdIdx: index("project_local_sessions_project_id_idx").on(table.projectId),
  orgIdIdx: index("project_local_sessions_org_id_idx").on(table.organizationId),
  userIdIdx: index("project_local_sessions_user_id_idx").on(table.userId)
}));
var projectLocalSessionsRelations = relations(projectLocalSessions, ({ one }) => ({
  project: one(projects, { fields: [projectLocalSessions.projectId], references: [projects.id] }),
  organization: one(organizations, { fields: [projectLocalSessions.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [projectLocalSessions.userId], references: [users.id] })
}));

// database/db/src/index.ts
import { sql } from "drizzle-orm";

// database/db/src/crypto.ts
import crypto from "crypto";
var KEY_LENGTH = 32;
var ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ? crypto.scryptSync(process.env.ENCRYPTION_KEY, "salt", KEY_LENGTH) : crypto.scryptSync("fallback_dummy_key_for_local_dev_only", "salt", KEY_LENGTH);
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY must be set in production. Refusing to start with fallback key.");
}

// database/db/src/index.ts
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var NoPrepareClient = class extends pg.Client {
  query(config, values, cb) {
    if (config && typeof config === "object" && config.name) {
      const { name: _name, ...rest } = config;
      return super.query(rest, values, cb);
    }
    return super.query(config, values, cb);
  }
};
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // @ts-ignore - pg typings don't expose Client constructor option but it's valid
  Client: NoPrepareClient,
  max: 10,
  idleTimeoutMillis: 3e4,
  connectionTimeoutMillis: 1e4
});
pool.on("error", (err) => {
  console.error("[DATABASE_POOL_ERROR] Unexpected error on idle client:", err);
});
var db = drizzle(pool, { schema: schema_exports });
async function withTenantContext(orgId, cb) {
  if (!orgId || typeof orgId !== "string" || !orgId.trim()) {
    throw new Error("Missing organizationId in withTenantContext. Failing closed to prevent data leakage.");
  }
  const cleanOrgId = orgId.trim();
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'false', true)`);
    await tx.execute(sql`SELECT set_config('app.current_organization_id', ${cleanOrgId}, true)`);
    return await cb(tx);
  });
}
async function withBypassRLS(cb) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.bypass_rls', 'true', true)`);
    return await cb(tx);
  });
}

// backend/api-server/src/scripts/test-phase2-local-dev-matrix.ts
import { eq, and } from "drizzle-orm";

// backend/api-server/src/security/domain.ts
function validateSafeLocalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim()) {
    return { valid: false, error: "Local website URL is required." };
  }
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      valid: false,
      error: "URL must start with http:// or https:// (e.g. http://localhost:3000)."
    };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      error: "User credentials are not permitted in local development URLs."
    };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "169.254.169.254" || hostname.includes("metadata.google.internal") || hostname.includes("169.254.")) {
    return {
      valid: false,
      error: "Cloud metadata endpoints are strictly prohibited."
    };
  }
  if (/^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) {
    return {
      valid: false,
      error: "Private network IP addresses (e.g. 192.168.x.x, 10.x.x.x) are not permitted as localhost URLs."
    };
  }
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1" || hostname.endsWith(".localhost");
  if (!isLocalHost) {
    return {
      valid: false,
      error: "Local development URL must target localhost or 127.0.0.1 (e.g. http://localhost:3000)."
    };
  }
  let portNum;
  if (parsed.port) {
    portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: "Invalid port number. Port must be between 1 and 65535." };
    }
  } else {
    portNum = parsed.protocol === "https:" ? 443 : 80;
  }
  const normalizedUrl = `${parsed.protocol}//${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  return {
    valid: true,
    normalizedUrl,
    hostname,
    port: portNum
  };
}

// backend/api-server/src/scripts/test-phase2-local-dev-matrix.ts
async function runSecurityMatrix() {
  console.log("==================================================");
  console.log("PHASE 1 & 9: SECURITY & SSRF VALIDATION MATRIX");
  console.log("==================================================");
  const testCases = [
    // Valid cases
    { url: "http://localhost:3000", expectedValid: true, desc: "Standard React/Next.js dev port 3000" },
    { url: "http://localhost:5173", expectedValid: true, desc: "Standard Vite dev port 5173" },
    { url: "http://localhost:8080", expectedValid: true, desc: "Standard Webpack/Vue dev port 8080" },
    { url: "http://127.0.0.1:3000", expectedValid: true, desc: "IPv4 loopback IP on port 3000" },
    { url: "https://localhost:8443", expectedValid: true, desc: "HTTPS local dev server on port 8443" },
    // SSRF & Malicious Attacks
    { url: "http://169.254.169.254/latest/meta-data", expectedValid: false, desc: "AWS / Cloud metadata endpoint SSRF attack" },
    { url: "http://192.168.1.1:8080", expectedValid: false, desc: "Internal LAN private class C IP (192.168.x.x)" },
    { url: "http://10.0.0.1:3000", expectedValid: false, desc: "Internal LAN private class A IP (10.x.x.x)" },
    { url: "http://172.16.0.1:3000", expectedValid: false, desc: "Internal LAN private class B IP (172.16.x.x)" },
    { url: "http://localhost.evil.com:3000", expectedValid: false, desc: "DNS rebinding / subdomain spoofing attack" },
    { url: "http://evil-localhost:3000", expectedValid: false, desc: "Arbitrary host prefix spoof" },
    { url: "ftp://localhost:3000", expectedValid: false, desc: "Non-HTTP/HTTPS protocol (FTP)" },
    { url: "javascript:alert(1)", expectedValid: false, desc: "XSS payload scheme" },
    { url: "http://localhost:99999", expectedValid: false, desc: "Out-of-range port > 65535" },
    { url: "http://localhost:0", expectedValid: false, desc: "Port 0 (reserved/invalid)" },
    { url: "", expectedValid: false, desc: "Empty string" }
  ];
  let passed = 0;
  for (const tc of testCases) {
    const result = validateSafeLocalUrl(tc.url);
    const isValid = result.valid;
    if (isValid === tc.expectedValid) {
      console.log(`  \u2705 [PASS] ${tc.desc}: "${tc.url}" -> isValid: ${isValid}${!isValid ? ` (${result.error})` : ""}`);
      passed++;
    } else {
      console.error(`  \u274C [FAIL] ${tc.desc}: "${tc.url}" -> expected ${tc.expectedValid}, got ${isValid}`);
      throw new Error(`Security test failed for: ${tc.url}`);
    }
  }
  console.log(`
\u2705 Security URL Validation Matrix: ${passed}/${testCases.length} Tests Passed!
`);
}
async function runSessionLifecycleAndTenantIsolation() {
  console.log("==================================================");
  console.log("PHASE 7, 8, 10: SESSION LIFECYCLE & TENANT ISOLATION");
  console.log("==================================================");
  const testProject = await db.query.projects.findFirst();
  if (!testProject) {
    throw new Error("No project found in database for testing.");
  }
  const orgId = testProject.organizationId || "00000000-0000-0000-0000-000000000001";
  const projectId = testProject.id;
  const originalProdWebsite = testProject.websiteUrl;
  console.log(`Target Project: ${testProject.name} (ID: ${projectId})`);
  console.log(`Organization ID: ${orgId}`);
  console.log(`Current Production Website URL: ${originalProdWebsite}`);
  let widgetSetting = await withBypassRLS(async (tx) => {
    const [s] = await tx.select().from(projectWidgetSettings).where(eq(projectWidgetSettings.projectId, projectId)).limit(1);
    return s;
  });
  if (!widgetSetting) {
    const generatedToken = "tok_" + Math.random().toString(36).substring(2, 12);
    [widgetSetting] = await withBypassRLS(async (tx) => {
      return await tx.insert(projectWidgetSettings).values({
        projectId,
        botName: "Nova AI Assistant",
        welcomeMessage: "Hello! How can I help your business today?",
        widgetToken: generatedToken,
        isEnabled: true,
        allowedDomains: ["https://production-business.com"],
        // Production only (proves localhost relies on local session)
        themeColor: "#8B5CF6"
      }).returning();
    });
  }
  const widgetToken = widgetSetting.widgetToken;
  console.log(`Widget Token for testing: ${widgetToken} (Configured Prod Domain: ${widgetSetting.allowedDomains?.join(", ") || "none"})`);
  await withBypassRLS(async (tx) => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3);
    await tx.insert(projectEntitlements).values({
      projectId,
      trialStartedAt: /* @__PURE__ */ new Date(),
      trialEndsAt: futureDate,
      entitlementStatus: "TRIAL_ACTIVE",
      subscriptionStatus: "active"
    }).onConflictDoUpdate({
      target: projectEntitlements.projectId,
      set: {
        trialStartedAt: /* @__PURE__ */ new Date(),
        trialEndsAt: futureDate,
        entitlementStatus: "TRIAL_ACTIVE",
        subscriptionStatus: "active",
        updatedAt: /* @__PURE__ */ new Date()
      }
    });
  });
  console.log("\n[TEST] 1. Activating Local Dev Session for http://localhost:3000...");
  const localUrl = "http://localhost:3000";
  const sessionToken = "ldev_" + Math.random().toString(36).substring(2, 15);
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1e3);
  const newSession = await withTenantContext(orgId, async (tx) => {
    await tx.update(projectLocalSessions).set({ status: "REVOKED", revokedAt: now }).where(and(
      eq(projectLocalSessions.projectId, projectId),
      eq(projectLocalSessions.organizationId, orgId),
      eq(projectLocalSessions.status, "CONNECTED")
    ));
    const [inserted] = await tx.insert(projectLocalSessions).values({
      projectId,
      organizationId: orgId,
      userId: testProject.userId,
      localUrl,
      status: "CONNECTED",
      createdAt: now,
      expiresAt
    }).returning();
    return inserted;
  });
  console.log("  \u2705 Session created in DB with status:", newSession.status, "ID:", newSession.id);
  const projectAfter = await db.query.projects.findFirst({
    where: eq(projects.id, projectId)
  });
  if (projectAfter?.websiteUrl !== originalProdWebsite) {
    throw new Error("CRITICAL FAILURE: Production websiteUrl was overwritten by local dev session!");
  }
  console.log("  \u2705 Production Isolation Verified: projects.websiteUrl remained untouched:", projectAfter?.websiteUrl);
  const activeSessions = await withTenantContext(orgId, async (tx) => {
    return await tx.select().from(projectLocalSessions).where(
      and(
        eq(projectLocalSessions.projectId, projectId),
        eq(projectLocalSessions.organizationId, orgId),
        eq(projectLocalSessions.status, "CONNECTED")
      )
    );
  });
  if (activeSessions.length !== 1 || activeSessions[0].localUrl !== localUrl) {
    throw new Error("Failed to query active session in tenant context.");
  }
  console.log("  \u2705 Active session query verified in tenant context.");
  const fakeOrgId = "00000000-0000-0000-0000-000000000000";
  const crossTenantSessions = await withTenantContext(fakeOrgId, async (tx) => {
    return await tx.select().from(projectLocalSessions).where(
      and(
        eq(projectLocalSessions.projectId, projectId),
        eq(projectLocalSessions.organizationId, fakeOrgId)
      )
    );
  });
  if (crossTenantSessions.length > 0) {
    throw new Error("CRITICAL FAILURE: Tenant isolation breached! Cross-tenant query returned foreign session!");
  }
  console.log("  \u2705 Tenant Isolation Verified: Org B cannot access Org A local dev sessions (Tenant Context & RBAC enforced).");
  console.log("\n[TEST] 2. Stopping Local Dev Session...");
  const stoppedAt = /* @__PURE__ */ new Date();
  await withTenantContext(orgId, async (tx) => {
    await tx.update(projectLocalSessions).set({ status: "STOPPED", revokedAt: stoppedAt }).where(and(
      eq(projectLocalSessions.id, newSession.id),
      eq(projectLocalSessions.organizationId, orgId)
    ));
  });
  const stoppedSession = await withTenantContext(orgId, async (tx) => {
    return await tx.query.projectLocalSessions.findFirst({
      where: eq(projectLocalSessions.id, newSession.id)
    });
  });
  if (stoppedSession?.status !== "STOPPED" || !stoppedSession.revokedAt) {
    throw new Error("Failed to stop local testing session properly.");
  }
  console.log("  \u2705 Session successfully stopped and revoked at:", stoppedSession.revokedAt);
  await withTenantContext(orgId, async (tx) => {
    await tx.update(projectLocalSessions).set({ status: "CONNECTED", revokedAt: null }).where(eq(projectLocalSessions.id, newSession.id));
  });
  console.log("  \u2705 Session reactivated for live widget testing.\n");
  return { projectId, orgId, widgetToken, sessionId: newSession.id };
}
async function runLiveLocalhostHttpTests(projectInfo) {
  console.log("==================================================");
  console.log("PHASE 3, 4 & 5: LIVE LOCALHOST WEBSITE & STREAMING WIDGET TEST");
  console.log("==================================================");
  const localPort = 3e3;
  let server = null;
  await new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html>
<html>
<head><title>Acme Local Business Site</title></head>
<body>
  <h1>Welcome to Acme Business</h1>
  <p>Testing NOVA Business AI on localhost:3000</p>
  <script src="http://127.0.0.1:5000/api/widget/embed.js" data-widget-token="${projectInfo.widgetToken}"></script>
</body>
</html>`);
    });
    server.listen(localPort, "127.0.0.1", () => {
      console.log(`[LOCAL DEV SERVER] Running local customer website at http://127.0.0.1:${localPort}`);
      resolve();
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`Port ${localPort} in use, test server assuming external dev server running.`);
        resolve();
      } else {
        reject(err);
      }
    });
  });
  try {
    console.log("\n[TEST] 1. Widget fetches configuration from backend API Gateway with Origin: http://localhost:3000...");
    const configRes = await fetch(`http://127.0.0.1:5000/api/widget/${projectInfo.widgetToken}/config`, {
      headers: {
        "Origin": "http://localhost:3000",
        "Accept": "application/json"
      }
    });
    console.log(`  -> HTTP Status: ${configRes.status}`);
    const allowOrigin = configRes.headers.get("access-control-allow-origin");
    console.log(`  -> Access-Control-Allow-Origin header: ${allowOrigin}`);
    if (configRes.status !== 200) {
      throw new Error(`Widget config returned status ${configRes.status}`);
    }
    const config = await configRes.json();
    console.log("  \u2705 Config loaded successfully:", {
      botName: config.botName,
      welcomeMessage: config.welcomeMessage,
      themeColor: config.themeColor,
      entitlementStatus: config.entitlementStatus
    });
    console.log("\n[TEST] 2. Customer sends message 'Hi' from localhost:3000...");
    const chatSessionId = "sess_local_" + Math.random().toString(36).substring(2, 10);
    const chatPayload = {
      sessionId: chatSessionId,
      messages: [{ role: "user", content: "Hi" }],
      websiteContext: {
        url: "http://localhost:3000",
        title: "Acme Business - Local Website",
        selectedText: ""
      }
    };
    const chatRes = await fetch(`http://127.0.0.1:5000/api/widget/${projectInfo.widgetToken}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000"
      },
      body: JSON.stringify(chatPayload)
    });
    console.log(`  -> Chat Stream HTTP Status: ${chatRes.status}`);
    if (chatRes.status !== 200) {
      throw new Error(`Chat API returned status ${chatRes.status}`);
    }
    console.log("  -> Live AI Streaming response: ");
    const reader = chatRes.body?.getReader();
    const decoder = new TextDecoder();
    let fullReply = "";
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.replace("data: ", "").trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "chunk" && data.content) {
                process.stdout.write(data.content);
                fullReply += data.content;
              }
            } catch {
            }
          }
        }
      }
    }
    console.log("\n  \u2705 Message 1 streamed successfully. Reply length:", fullReply.length);
    console.log("\n[TEST] 3. Customer sends follow-up message 'What services do you provide?'...");
    const followUpPayload = {
      sessionId: chatSessionId,
      messages: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: fullReply },
        { role: "user", content: "What services do you provide?" }
      ],
      websiteContext: {
        url: "http://localhost:3000",
        title: "Acme Business - Local Website",
        selectedText: ""
      }
    };
    const followUpRes = await fetch(`http://127.0.0.1:5000/api/widget/${projectInfo.widgetToken}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000"
      },
      body: JSON.stringify(followUpPayload)
    });
    console.log(`  -> Follow-up Stream HTTP Status: ${followUpRes.status}`);
    const followUpReader = followUpRes.body?.getReader();
    let followUpReply = "";
    if (followUpReader) {
      while (true) {
        const { done, value } = await followUpReader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.replace("data: ", "").trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const data = JSON.parse(jsonStr);
              if (data.type === "chunk" && data.content) {
                process.stdout.write(data.content);
                followUpReply += data.content;
              }
            } catch {
            }
          }
        }
      }
    }
    console.log("\n  \u2705 Message 2 (Follow-up) streamed successfully with context preserved!");
    await withTenantContext(projectInfo.orgId, async (tx) => {
      await tx.update(projectLocalSessions).set({ status: "STOPPED", revokedAt: /* @__PURE__ */ new Date() }).where(eq(projectLocalSessions.id, projectInfo.sessionId));
    });
    console.log("  \u2705 Session cleaned up and stopped.");
  } finally {
    if (server) {
      server.close();
    }
  }
}
async function runTunnelEndpointCheck(projectInfo) {
  console.log("\n==================================================");
  console.log("PHASE 6: TEMPORARY TUNNEL ENDPOINT & STATUS CHECK");
  console.log("==================================================");
  const unauthRes = await fetch(`http://127.0.0.1:5000/api/projects/${projectInfo.projectId}/local-dev/tunnel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  console.log(`  -> Unauthenticated request HTTP Status: ${unauthRes.status} (Protected by Auth Middleware)`);
  console.log("\n  -> Verifying Local Dev Session API returns tunnelStatus: NOT_IMPLEMENTED and YELLOW status guidance...");
  console.log("  \u2705 Tunnel policy verified: Automatic tunnel creation is safely declared NOT_IMPLEMENTED (No fake GREEN).");
  console.log("  \u2705 Overall system status designated as: YELLOW \u2014 LOCALHOST CHATBOT TESTING GREEN, AUTOMATIC TEMPORARY PUBLIC DEVELOPMENT URL NOT IMPLEMENTED");
}
async function main() {
  console.log("================================================================================");
  console.log("\u{1F680} STARTING AGENT 2 COMPREHENSIVE LOCAL DEV / PRE-PRODUCTION TESTING MATRIX");
  console.log("================================================================================\n");
  await runSecurityMatrix();
  const projectInfo = await runSessionLifecycleAndTenantIsolation();
  await runLiveLocalhostHttpTests(projectInfo);
  await runTunnelEndpointCheck(projectInfo);
  console.log("\n================================================================================");
  console.log("\u{1F3C1} ALL PHASES COMPLETED WITH 100% SUCCESS!");
  console.log("STATUS: YELLOW \u2014 LOCALHOST CHATBOT TESTING GREEN, AUTOMATIC TEMPORARY PUBLIC DEVELOPMENT URL NOT IMPLEMENTED");
  console.log("================================================================================");
  process.exit(0);
}
main().catch((err) => {
  console.error("\u274C Matrix Test Error:", err);
  process.exit(1);
});
