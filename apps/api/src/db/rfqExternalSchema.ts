// 1) In db/rfqsSchema.ts, change/add these columns on the `rfqs` table:
//
//    supplierId:          uuid("supplier_id").references(() => suppliers.id),   // REMOVE .notNull(): external suppliers have no id yet
//    supplierType:        text("supplier_type").notNull().default("directory"), // "directory" | "external"
//    supplierName:        text("supplier_name"),
//    supplierEmail:       text("supplier_email"),
//    supplierContactName: text("supplier_contact_name"),
//    supplierCountry:     text("supplier_country"),
//    incotermPlace:       text("incoterm_place"),
//    // technicalDocumentNames can stay (harmless) until you drop it.
//
//    // Quote revisions (buyer-requested):
//    revisionCount:       integer("revision_count").notNull().default(0),
//    revisionNote:        text("revision_note"),
//    revisionRequestedAt: timestamp("revision_requested_at", { withTimezone: true }),
//
//    // Status gains one value: "revision_requested". If `status` is a pg enum, add it
//    // (ALTER TYPE ... ADD VALUE 'revision_requested'); if it's plain text, nothing to do.
//
// 2) Add these two tables (this file; export it from your schema index),
//    then run: npx drizzle-kit generate && npx drizzle-kit migrate

import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { rfqs } from "./rfqsSchema.js";

/** Link sent to an external supplier. Only the SHA-256 hash of the token is stored. */
export const rfqInvites = pgTable("rfq_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  rfqId: uuid("rfq_id").notNull().unique().references(() => rfqs.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }), // first quote submitted via the link
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rfqAttachments = pgTable(
  "rfq_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rfqId: uuid("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),     // original name, shown to the supplier
    storageKey: text("storage_key").notNull(), // path under UPLOAD_DIR (or an S3 key)
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rfqIdx: index("rfq_attachments_rfq_idx").on(t.rfqId),
  })
);