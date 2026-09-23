ALTER TABLE "supplier_offers" ADD COLUMN "tax_type" text;--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "tax_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "supplier_offers" ADD COLUMN "tax_inclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "tax_type" text;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "tax_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "tax_inclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "subtotal" integer;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD COLUMN "tax_amount" integer;