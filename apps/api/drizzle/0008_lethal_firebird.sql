CREATE TABLE IF NOT EXISTS "supplier_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"cert_type" text NOT NULL,
	"cert_number" text,
	"issued_by" text,
	"valid_until" timestamp,
	"document_url" text,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "specs" jsonb;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "unit_of_measure" text DEFAULT 'piece' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "gst_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "verification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "verification_notes" text;