CREATE TABLE "project_context_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"dashboard_analysis" boolean DEFAULT true NOT NULL,
	"form_assistant" boolean DEFAULT true NOT NULL,
	"table_analysis" boolean DEFAULT true NOT NULL,
	"navigation_assistant" boolean DEFAULT true NOT NULL,
	"knowledge_comparison" boolean DEFAULT true NOT NULL,
	"mistake_detection" boolean DEFAULT true NOT NULL,
	"context_memory" boolean DEFAULT true NOT NULL,
	"developer_debug_mode" boolean DEFAULT false NOT NULL,
	"max_context_size_bytes" integer DEFAULT 6144 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "status" varchar(50) DEFAULT 'HEALTHY' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "last_success" timestamp;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "last_failure" timestamp;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD COLUMN "cooldown_until" timestamp;--> statement-breakpoint
ALTER TABLE "project_context_settings" ADD CONSTRAINT "project_context_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;