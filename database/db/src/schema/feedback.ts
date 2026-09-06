
import { pgTable, uuid, varchar, text, timestamp, index, integer, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { projects, chatSessions, messages, customers } from "./index";

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
