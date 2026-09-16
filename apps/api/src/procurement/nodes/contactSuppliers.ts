import { ilike, eq } from "drizzle-orm";
import { formatISO } from "date-fns";
import { db } from "../../db/client.js";
import { supplierOffers } from "../../db/supplyChainSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType, SupplierQuote } from "../state.js";

export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;

  const matches = await db
    .select({
      offer: supplierOffers,
      supplierRegion: suppliers.region,
    })
    .from(supplierOffers)
    .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
    .where(ilike(supplierOffers.item, `%${request.item}%`));

  let quotes: SupplierQuote[];

  if (matches.length > 0) {
    quotes = matches.map(({ offer, supplierRegion }) => ({
      supplierName: offer.supplierName,
      supplierId: offer.supplierId,
      supplierRegion: supplierRegion ?? null, // null when offer has no linked supplier account
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
      supplierRegion: null, // simulated suppliers have no real-world region
    }));
  }

  return { quotes, status: "comparing" as const };
}