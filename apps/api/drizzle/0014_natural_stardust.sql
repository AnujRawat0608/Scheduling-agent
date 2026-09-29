CREATE TABLE IF NOT EXISTS "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reference_number" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_email" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"currency" text,
	"due_date" timestamp,
	"price_valid_until" timestamp,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_notes" text,
	"assumptions_exclusions" text,
	"payment_terms" text,
	"delivery_address" text,
	"required_delivery_date" timestamp,
	"incoterm" text,
	"packaging_requirements" text,
	"warranty_period" text,
	"quality_requirements" text,
	"required_certifications" text,
	"insurance_required" boolean DEFAULT false NOT NULL,
	"technical_document_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
