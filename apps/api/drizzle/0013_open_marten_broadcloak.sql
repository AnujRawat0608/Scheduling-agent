-- Add new columns, nullable for now
ALTER TABLE "procurement_tasks" ADD COLUMN "items_summary" text;--> statement-breakpoint
ALTER TABLE "procurement_tasks" ADD COLUMN "line_item_count" integer;--> statement-breakpoint

-- Backfill from existing single-item data
UPDATE "procurement_tasks" SET "items_summary" = "item", "line_item_count" = 1 WHERE "items_summary" IS NULL;--> statement-breakpoint

-- Now enforce NOT NULL
ALTER TABLE "procurement_tasks" ALTER COLUMN "items_summary" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "procurement_tasks" ALTER COLUMN "line_item_count" SET NOT NULL;--> statement-breakpoint

-- Drop old single-item columns
ALTER TABLE "procurement_tasks" DROP COLUMN IF EXISTS "item";--> statement-breakpoint
ALTER TABLE "procurement_tasks" DROP COLUMN IF EXISTS "quantity";--> statement-breakpoint

-- Rename, not drop+recreate — preserves existing recommended-supplier data
ALTER TABLE "procurement_tasks" RENAME COLUMN "recommended_supplier" TO "recommended_plan";