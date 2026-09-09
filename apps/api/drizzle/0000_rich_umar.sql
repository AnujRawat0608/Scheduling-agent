CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"allow_freeform" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolution" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_connections_user_email_unique" UNIQUE("user_email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"node" text NOT NULL,
	"payload" jsonb,
	"langfuse_trace_id" text,
	"sequence" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduling_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"organizer_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'gathering' NOT NULL,
	"request" jsonb NOT NULL,
	"selected_slot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduling_runs_thread_id_unique" UNIQUE("thread_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" text NOT NULL,
	"requester_email" text NOT NULL,
	"item" text NOT NULL,
	"quantity" integer NOT NULL,
	"status" text DEFAULT 'extracting' NOT NULL,
	"request" jsonb NOT NULL,
	"recommended_supplier" jsonb,
	"total_cost" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_tasks_thread_id_unique" UNIQUE("thread_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supplier_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item" text NOT NULL,
	"description" text,
	"category" text,
	"supplier_name" text NOT NULL,
	"supplier_type" text,
	"unit_price" integer NOT NULL,
	"lead_time_days" integer NOT NULL,
	"dispatch_status" text DEFAULT 'Dispatch ready',
	"shipping_cost" integer DEFAULT 0 NOT NULL,
	"moq" integer DEFAULT 1 NOT NULL,
	"quantity_available" integer NOT NULL,
	"ai_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_scheduling_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scheduling_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_scheduling_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scheduling_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
