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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Enums and Custom Types (represented as text for simplicity or pgEnum)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  role: varchar("role", { length: 50 }).default("user").notNull(), // super_admin, admin, user, client
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").default("").notNull(),
  shareToken: varchar("share_token", { length: 50 }),
  isActive: boolean("is_active").default(true),
  tags: jsonb("tags").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

export const knowledgeCategories = pgTable("knowledge_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isWidgetExposed: boolean("is_widget_exposed").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  kbId: varchar("kb_id", { length: 50 }).unique(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: uuid("category_id")
    .references(() => knowledgeCategories.id, { onDelete: "set null" }),
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
});

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeSourceId: uuid("knowledge_source_id").references(() => knowledgeSources.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  chunkText: text("chunk_text").notNull(),
  embedding: vector("embedding", { dimensions: 768 }), // Gemini embedding size (768)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" }),
  modeId: uuid("mode_id").references(() => projectModes.id),
  title: text("title").notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
});

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
  name: varchar("name", { length: 255 }),
  provider: varchar("provider", { length: 50 }).default("gemini").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  isSystem: boolean("is_system").default(false).notNull(), // Preserved for system keys
  status: varchar("status", { length: 50 }).default("HEALTHY").notNull(), // HEALTHY, COOLDOWN, QUOTA_EXCEEDED, INVALID, UNHEALTHY
  lastSuccess: timestamp("last_success"),
  lastFailure: timestamp("last_failure"),
  failureReason: text("failure_reason"),
  cooldownUntil: timestamp("cooldown_until"),
  totalRequests: integer("total_requests").default(0).notNull(),
  totalFailures: integer("total_failures").default(0).notNull(),
  dailyLimit: integer("daily_limit"), // null = no limit (for user keys), 20 for system keys
  dailyUsed: integer("daily_used").default(0).notNull(),
  lastResetAt: timestamp("last_reset_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userApiSettings = pgTable("user_api_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  apiMode: varchar("api_mode", { length: 50 }).default("auto").notNull(), // auto, user_first, system_first
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const connectedServices = pgTable("connected_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
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

export const projectApiKeys = pgTable("project_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // gemini, openai, claude, groq, etc.
  encryptedKey: text("encrypted_key").notNull(),
  maskedKey: varchar("masked_key", { length: 50 }).notNull(),
  model: varchar("model", { length: 255 }), // Default model to use for this project & provider
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const widgetSettingsRelations = relations(projectWidgetSettings, ({ one }) => ({
  project: one(projects, { fields: [projectWidgetSettings.projectId], references: [projects.id] }),
}));

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
  project: one(projects, { fields: [projectApiKeys.projectId], references: [projects.id] }),
}));

export const widgetAnalyticsRelations = relations(widgetAnalytics, ({ one }) => ({
  project: one(projects, { fields: [widgetAnalytics.projectId], references: [projects.id] }),
}));

export const widgetLeadsRelations = relations(widgetLeads, ({ one }) => ({
  project: one(projects, { fields: [widgetLeads.projectId], references: [projects.id] }),
}));

