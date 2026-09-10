CREATE TABLE IF NOT EXISTS "supplier_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"sender_name" text NOT NULL,
	"sender_email" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "company_overview" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "business_type" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "year_established" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "total_employees" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "total_annual_revenue" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "main_products" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "certifications" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "rd_capacity" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "main_markets" jsonb;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "languages_spoken" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "trade_dept_employees" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "average_lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "response_rate" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "response_time_hours" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "transactions_count" integer;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "total_transaction_amount" text;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "quotation_performance" integer;