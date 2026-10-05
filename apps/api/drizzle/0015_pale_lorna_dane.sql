CREATE TABLE IF NOT EXISTS "procurers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	CONSTRAINT "procurers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "procurer_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_procurer_id_procurers_id_fk" FOREIGN KEY ("procurer_id") REFERENCES "public"."procurers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;