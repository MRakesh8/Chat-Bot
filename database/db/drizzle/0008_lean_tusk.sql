CREATE TABLE "browser_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"action_name" varchar(255) NOT NULL,
	"description" text,
	"domain_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_actions" jsonb DEFAULT '["navigate","read","click","fill","wait","submit"]'::jsonb NOT NULL,
	"risk_level" varchar(50) DEFAULT 'LOW_RISK_WRITE' NOT NULL,
	"status" varchar(50) DEFAULT 'DISCOVERED' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"auth_required" boolean DEFAULT false NOT NULL,
	"encrypted_auth_details" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumed_confirmations" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"action_id" varchar(255) NOT NULL,
	"consumed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"organization_id" uuid,
	"external_id" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"name" varchar(255),
	"channel" varchar(50) DEFAULT 'website' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frequent_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"question_text" text NOT NULL,
	"normalized_question" text NOT NULL,
	"category" varchar(100) DEFAULT 'General' NOT NULL,
	"intent" varchar(100) DEFAULT 'general' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_asked_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"integration_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"action_name" varchar(255) NOT NULL,
	"description" text,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_level" varchar(50) DEFAULT 'READ_ONLY' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"status" varchar(50) DEFAULT 'DISCOVERED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"customer_id" uuid,
	"type" varchar(50) NOT NULL,
	"comment" text,
	"channel" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"notify_on_dislikes" integer DEFAULT 3 NOT NULL,
	"notify_on_likes" integer DEFAULT 3 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(255) NOT NULL,
	"project_id" uuid NOT NULL,
	"type" varchar(50) NOT NULL,
	"severity" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"reference_id" uuid,
	"read_at" timestamp,
	"dedupe_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_entitlements" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"trial_started_at" timestamp,
	"trial_ends_at" timestamp,
	"subscription_status" varchar(50) DEFAULT 'inactive' NOT NULL,
	"entitlement_status" varchar(50) DEFAULT 'TRIAL_ACTIVE' NOT NULL,
	"custom_trial_days" integer,
	"plan_id" uuid,
	"subscription_id" varchar(255),
	"subscription_started_at" timestamp,
	"subscription_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"customer_id" uuid,
	"category" varchar(100),
	"rating" integer,
	"comment" text NOT NULL,
	"channel" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'NOT_CONNECTED' NOT NULL,
	"encrypted_credentials" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_integrations_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "security_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" varchar(100) NOT NULL,
	"user_id" uuid,
	"project_id" uuid,
	"request_id" varchar(100),
	"ip_address" varchar(100),
	"origin" varchar(255),
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD COLUMN "normalized_question" text;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD COLUMN "confidence" varchar(50);--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD COLUMN "reason" varchar(100);--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "trial_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "custom_trial_days" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" varchar(50) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "website_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "discovery_status" varchar(50) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "platform" varchar(100);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "platform_confidence" varchar(50);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "business_type" varchar(100);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "business_type_confidence" varchar(50);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "intelligence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "company" varchar(255);--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "source_page_url" text;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "user_intent" text;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "status" varchar(50) DEFAULT 'NEW' NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "score" varchar(50) DEFAULT 'MEDIUM' NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "score_value" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "browser_capabilities" ADD CONSTRAINT "browser_capabilities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumed_confirmations" ADD CONSTRAINT "consumed_confirmations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frequent_questions" ADD CONSTRAINT "frequent_questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tools" ADD CONSTRAINT "integration_tools_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_tools" ADD CONSTRAINT "integration_tools_integration_project_fk" FOREIGN KEY ("integration_id","project_id") REFERENCES "public"."project_integrations"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_entitlements" ADD CONSTRAINT "project_entitlements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_feedback" ADD CONSTRAINT "project_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_feedback" ADD CONSTRAINT "project_feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_integrations" ADD CONSTRAINT "project_integrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_capabilities_project_id_idx" ON "browser_capabilities" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_cap_proj_action_uniq_idx" ON "browser_capabilities" USING btree ("project_id","action_name");--> statement-breakpoint
CREATE INDEX "customers_project_id_idx" ON "customers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("project_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_external_id_idx" ON "customers" USING btree ("project_id","external_id");--> statement-breakpoint
CREATE INDEX "frequent_questions_project_id_idx" ON "frequent_questions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frequent_questions_proj_norm_idx" ON "frequent_questions" USING btree ("project_id","normalized_question");--> statement-breakpoint
CREATE INDEX "integration_tools_integration_id_idx" ON "integration_tools" USING btree ("integration_id");--> statement-breakpoint
CREATE INDEX "integration_tools_project_id_idx" ON "integration_tools" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "integration_tools_action_name_idx" ON "integration_tools" USING btree ("integration_id","action_name");--> statement-breakpoint
CREATE INDEX "message_feedback_project_id_idx" ON "message_feedback" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "message_feedback_message_id_idx" ON "message_feedback" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "notifications_project_id_idx" ON "notifications" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "notifications_org_id_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_dedupe_key_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "project_feedback_project_id_idx" ON "project_feedback" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_integrations_project_id_idx" ON "project_integrations" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD CONSTRAINT "widget_leads_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_customer_id_idx" ON "chat_sessions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "knowledge_gaps_proj_norm_idx" ON "knowledge_gaps" USING btree ("project_id","normalized_question");--> statement-breakpoint
CREATE INDEX "knowledge_sources_customer_id_idx" ON "knowledge_sources" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_customer_id_idx" ON "whatsapp_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "widget_leads_project_id_idx" ON "widget_leads" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "widget_leads_email_idx" ON "widget_leads" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "widget_leads_phone_idx" ON "widget_leads" USING btree ("project_id","phone");