import { pgTable, uuid, text, numeric, date, timestamp, boolean } from "drizzle-orm/pg-core";

export const tariffMeasures = pgTable("tariff_measures", {
  id: uuid("id").primaryKey().defaultRandom(),
  hsCode: text("hs_code").notNull(),
  originCountry: text("origin_country"),
  destinationCountry: text("destination_country").notNull(),
  name: text("name").notNull(),
  layer: text("layer").notNull(),
  mode: text("mode").notNull(),
  ratePercent: numeric("rate_percent", { precision: 6, scale: 3 }).notNull(),
  valuationBasis: text("valuation_basis").notNull(),
  verified: boolean("verified").notNull().default(false),
  sourceUrl: text("source_url"),
  sourceNote: text("source_note"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  reviewedOn: date("reviewed_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importRestrictions = pgTable("import_restrictions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hsCode: text("hs_code").notNull(),
  originCountry: text("origin_country"),
  destinationCountry: text("destination_country").notNull(),
  status: text("status").notNull(),
  note: text("note").notNull(),
  verified: boolean("verified").notNull().default(false),
  sourceUrl: text("source_url"),
  effectiveFrom: date("effective_from"),
  effectiveTo: date("effective_to"),
  reviewedOn: date("reviewed_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});