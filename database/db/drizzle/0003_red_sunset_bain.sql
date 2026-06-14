CREATE TABLE "project_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"encrypted_key" text NOT NULL,
	"masked_key" varchar(50) NOT NULL,
	"model" varchar(255),
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_widget_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"bot_name" varchar(255) NOT NULL,
	"bot_avatar" text,
	"welcome_message" text NOT NULL,
	"theme_color" varchar(50) DEFAULT '#8B5CF6' NOT NULL,
	"position" varchar(50) DEFAULT 'bottom-right' NOT NULL,
	"display_mode" varchar(50) DEFAULT 'floating' NOT NULL,
	"custom_container_id" varchar(255),
	"allowed_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_css" text,
	"leads_enabled" boolean DEFAULT false NOT NULL,
	"human_handoff_links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"widget_token" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_widget_settings_widget_token_unique" UNIQUE("widget_token")
);
--> statement-breakpoint
CREATE TABLE "widget_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" timestamp NOT NULL,
	"conversations" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"token_usage" integer DEFAULT 0 NOT NULL,
	"ai_costs" varchar(50) DEFAULT '0' NOT NULL,
	"response_time_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD COLUMN "is_widget_exposed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "is_widget_exposed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_widget_settings" ADD CONSTRAINT "project_widget_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_analytics" ADD CONSTRAINT "widget_analytics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_leads" ADD CONSTRAINT "widget_leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;