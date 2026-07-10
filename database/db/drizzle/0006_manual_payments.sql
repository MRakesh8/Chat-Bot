CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"price" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"interval" varchar(50) DEFAULT 'lifetime' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"plan_id" uuid,
	"license_status" varchar(50) DEFAULT 'inactive' NOT NULL,
	"payment_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"payment_date" timestamp,
	"approved_by" uuid,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"performed_by" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_order_id_idx";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "razorpay_order_id";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "razorpay_payment_id";
ALTER TABLE "payments" ADD COLUMN "method" varchar(50) DEFAULT 'manual_upi' NOT NULL;
ALTER TABLE "payments" ADD COLUMN "utr_transaction_id" varchar(255);
ALTER TABLE "payments" ADD COLUMN "screenshot_url" text;
ALTER TABLE "payments" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending';
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE varchar(50);
--> statement-breakpoint
ALTER TABLE "project_licenses" ADD CONSTRAINT "project_licenses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_licenses" ADD CONSTRAINT "project_licenses_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_licenses" ADD CONSTRAINT "project_licenses_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_licenses_project_id_idx" ON "project_licenses" USING btree ("project_id");
