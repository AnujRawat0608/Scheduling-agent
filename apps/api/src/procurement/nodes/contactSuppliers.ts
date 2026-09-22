import { sql, eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import { db } from "../../db/client.js";
import { supplierOffers } from "../../db/supplyChainSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType, SupplierQuote } from "../state.js";

export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;

  // Full-text search across item + description, with stemming/synonym
  // handling via Postgres's built-in English text search config — this
  // catches "Pi 5 board" matching "Raspberry Pi 5 8GB" in a way plain
  // ilike substring matching can't. Ranked by relevance so the best
  // textual match comes first even before price/lead-time scoring.
  const searchQuery = sql`plainto_tsquery('english', ${request.item})`;
  const searchVector = sql`to_tsvector('english', ${supplierOffers.item} || ' ' || coalesce(${supplierOffers.description}, ''))`;

  const matches = await db
    .select({
      offer: supplierOffers,
      supplierRegion: suppliers.region,
      rank: sql<number>`ts_rank(${searchVector}, ${searchQuery})`,
    })
    .from(supplierOffers)
    .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
    .where(sql`${searchVector} @@ ${searchQuery}`)
    .orderBy(sql`ts_rank(${searchVector}, ${searchQuery}) DESC`);

  let quotes: SupplierQuote[];

  if (matches.length > 0) {
    quotes = matches.map(({ offer, supplierRegion }) => ({
      supplierName: offer.supplierName,
      supplierId: offer.supplierId,
      supplierRegion: supplierRegion ?? null,
      unitPrice: offer.unitPrice,
      quantityAvailable: offer.quantityAvailable,
      leadTimeDays: offer.leadTimeDays,
      shippingCost: offer.shippingCost,
      moq: offer.moq,
      respondedAt: formatISO(new Date()),
    }));
  } else {
    quotes = fetchSimulatedSupplierQuotes(request.item, request.quantity).map((q) => ({
      ...q,
      supplierId: null,
      supplierRegion: null,
    }));
  }

  return { quotes, status: "comparing" as const };
}