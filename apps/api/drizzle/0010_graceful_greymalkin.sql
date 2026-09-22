CREATE TABLE IF NOT EXISTS "supplier_verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"admin_id" uuid NOT NULL,
	"action" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
