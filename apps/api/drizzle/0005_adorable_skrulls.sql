ALTER TABLE "risk_assessments" DROP CONSTRAINT "risk_assessments_run_id_scheduling_runs_id_fk";
--> statement-breakpoint
ALTER TABLE "risk_assessments" ADD COLUMN "task_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_task_id_procurement_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."procurement_tasks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "risk_assessments" DROP COLUMN IF EXISTS "run_id";