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

export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  filename: text("filename").notNull(),
  fileUrl: text("file_url").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // pdf, docx, txt, image, audio, youtube, website
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processed, error
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectFileId: uuid("project_file_id").references(() => projectFiles.id, { onDelete: "cascade" }),
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

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  auditLogs: many(auditLogs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  settings: one(projectSettings, { fields: [projects.id], references: [projectSettings.projectId] }),
  modes: many(projectModes),
  files: many(projectFiles),
  chunks: many(knowledgeChunks),
  sessions: many(chatSessions),
  notes: many(notes),
  reports: many(reports),
}));

export const filesRelations = relations(projectFiles, ({ one, many }) => ({
  project: one(projects, { fields: [projectFiles.projectId], references: [projects.id] }),
  chunks: many(knowledgeChunks),
}));
