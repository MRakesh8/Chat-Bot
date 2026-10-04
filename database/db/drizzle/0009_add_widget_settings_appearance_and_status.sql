ALTER TABLE "project_widget_settings" ADD COLUMN IF NOT EXISTS "input_placeholder" text DEFAULT 'Ask a question...';--> statement-breakpoint
ALTER TABLE "project_widget_settings" ADD COLUMN IF NOT EXISTS "online_status" text DEFAULT 'Online';--> statement-breakpoint
ALTER TABLE "project_widget_settings" ADD COLUMN IF NOT EXISTS "appearance" jsonb DEFAULT '{}'::jsonb NOT NULL;
