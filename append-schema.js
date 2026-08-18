const fs = require('fs');
const content = \

// --- WhatsApp Integration Schema ---

export const whatsappConnections = pgTable('whatsapp_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  phoneNumber: varchar('phone_number', { length: 50 }),
  displayName: varchar('display_name', { length: 255 }),
  status: varchar('status', { length: 50 }).default('disconnected').notNull(),
  encryptedCredentials: text('encrypted_credentials'),
  webhookId: varchar('webhook_id', { length: 255 }),
  lastConnectedAt: timestamp('last_connected_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('whatsapp_connections_project_id_idx').on(table.projectId),
}));

export const whatsappConversations = pgTable('whatsapp_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  connectionId: uuid('connection_id').references(() => whatsappConnections.id, { onDelete: 'cascade' }).notNull(),
  providerChatId: varchar('provider_chat_id', { length: 255 }).notNull(),
  customerIdentifier: varchar('customer_identifier', { length: 255 }).notNull(),
  customerName: varchar('customer_name', { length: 255 }),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  assignedMode: varchar('assigned_mode', { length: 50 }).default('ai').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('whatsapp_conversations_project_id_idx').on(table.projectId),
  connectionIdIdx: index('whatsapp_conversations_connection_id_idx').on(table.connectionId),
  providerChatIdIdx: index('whatsapp_conversations_provider_chat_id_idx').on(table.providerChatId),
}));

export const whatsappMessages = pgTable('whatsapp_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }).notNull(),
  providerMessageId: varchar('provider_message_id', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  direction: varchar('direction', { length: 50 }).notNull(),
  sender: varchar('sender', { length: 255 }),
  messageType: varchar('message_type', { length: 50 }).default('text').notNull(),
  content: text('content'),
  aiGenerated: boolean('ai_generated').default(false).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  processingStartedAt: timestamp('processing_started_at'),
  processingAttempts: integer('processing_attempts').default(0).notNull(),
  nextRetryAt: timestamp('next_retry_at'),
  lastError: text('last_error'),
  leaseUntil: timestamp('lease_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('whatsapp_messages_project_id_idx').on(table.projectId),
  conversationIdIdx: index('whatsapp_messages_conversation_id_idx').on(table.conversationId),
  providerMessageIdIdx: index('whatsapp_messages_provider_message_id_idx').on(table.providerMessageId),
  pendingIdx: index('whatsapp_messages_status_idx').on(table.status),
  idempotencyIdx: index('whatsapp_messages_idempotency_idx').on(table.projectId, table.provider, table.providerMessageId), 
}));

export const whatsappSettings = pgTable('whatsapp_settings', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  autoReplyEnabled: boolean('auto_reply_enabled').default(false).notNull(),
  replyMode: varchar('reply_mode', { length: 50 }).default('all_business_questions').notNull(),
  confidenceThreshold: integer('confidence_threshold').default(70).notNull(),
  humanHandoffEnabled: boolean('human_handoff_enabled').default(true).notNull(),
  allowedTopics: jsonb('allowed_topics').default([]).notNull(),
  blockedTopics: jsonb('blocked_topics').default([]).notNull(),
  businessHours: jsonb('business_hours').default({}).notNull(),
  maxAiReplies: integer('max_ai_replies').default(50).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const whatsappHandoffs = pgTable('whatsapp_handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  conversationId: uuid('conversation_id').references(() => whatsappConversations.id, { onDelete: 'cascade' }).notNull(),
  reason: varchar('reason', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
}, (table) => ({
  projectIdIdx: index('whatsapp_handoffs_project_id_idx').on(table.projectId),
  conversationIdIdx: index('whatsapp_handoffs_conversation_id_idx').on(table.conversationId),
}));

export const whatsappAnalytics = pgTable('whatsapp_analytics', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  date: timestamp('date').notNull(),
  messagesReceived: integer('messages_received').default(0).notNull(),
  messagesSent: integer('messages_sent').default(0).notNull(),
  aiReplies: integer('ai_replies').default(0).notNull(),
  humanReplies: integer('human_replies').default(0).notNull(),
  humanHandoffs: integer('human_handoffs').default(0).notNull(),
  unresolvedQuestions: integer('unresolved_questions').default(0).notNull(),
  averageResponseTimeMs: integer('average_response_time_ms').default(0).notNull(),
  providerErrors: integer('provider_errors').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  projectIdIdx: index('whatsapp_analytics_project_id_idx').on(table.projectId),
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
\
fs.appendFileSync('database/db/src/schema/index.ts', content);

