CREATE TABLE IF NOT EXISTS "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"supplier_region" text NOT NULL,
	"destination_region" text,
	"overall_status" text NOT NULL,
	"recommendation" text NOT NULL,
	"raw_response" jsonb NOT NULL,
	"was_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "region" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_run_id_scheduling_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scheduling_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
