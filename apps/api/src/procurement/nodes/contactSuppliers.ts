import { ilike, sql, eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import { db } from "../../db/client.js";
import { supplierOffers } from "../../db/supplyChainSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType, SupplierQuote, LineItemQuotes } from "../state.js";

async function sourceOneItem(item: string, quantity: number): Promise<SupplierQuote[]> {
  const searchQuery = sql`plainto_tsquery('english', ${item})`;
  const searchVector = sql`to_tsvector('english', ${supplierOffers.item} || ' ' || coalesce(${supplierOffers.description}, ''))`;

  const matches = await db
    .select({
      offer: supplierOffers,
      supplierRegion: suppliers.region,
    })
    .from(supplierOffers)
    .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
    .where(sql`${searchVector} @@ ${searchQuery}`)
    .orderBy(sql`ts_rank(${searchVector}, ${searchQuery}) DESC`);

  if (matches.length > 0) {
   return matches.map(({ offer, supplierRegion }) => ({
  supplierName: offer.supplierName,
  supplierId: offer.supplierId,
  supplierRegion: supplierRegion ?? null,
  unitPrice: Number(offer.unitPrice),
  currency: offer.currency,
  quantityAvailable: offer.quantityAvailable,
  leadTimeDays: offer.leadTimeDays,
  shippingCost: Number(offer.shippingCost),
  moq: offer.moq,
  taxType: offer.taxType,
  taxRate: offer.taxRate == null ? null : Number(offer.taxRate),
  taxInclusive: offer.taxInclusive,
  respondedAt: formatISO(new Date()),
}));
  }

  return fetchSimulatedSupplierQuotes(item, quantity).map((q) => ({
    ...q,
    supplierId: null,
    supplierRegion: null,
  }));
}

export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;

  const lineItemQuotes: LineItemQuotes[] = await Promise.all(
    request.lineItems.map(async (lineItem) => {
      const quotes = await sourceOneItem(lineItem.item, lineItem.quantity);
      return {
        lineItem,
        quotes,
        scoredQuotes: [], // filled in by compareQuotes
        topQuotes: [],    // filled in by compareQuotes
        hasMatch: quotes.length > 0,
      };
    })
  );

  return { lineItemQuotes, status: "comparing" as const };
}