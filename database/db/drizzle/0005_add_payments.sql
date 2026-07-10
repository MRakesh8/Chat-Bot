ALTER TABLE "projects" ADD COLUMN "deployment_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"razorpay_order_id" varchar(255) NOT NULL,
	"razorpay_payment_id" varchar(255),
	"amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_id_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_project_id_idx" ON "payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "payments_order_id_idx" ON "payments" USING btree ("razorpay_order_id");
