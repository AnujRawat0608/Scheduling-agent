import { ilike } from "drizzle-orm";
import { formatISO } from "date-fns";
import { db } from "../../db/client.js";
import { supplierOffers } from "../../db/supplyChainSchema.js";
import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType, SupplierQuote } from "../state.js";

/**
 * Looks up real entries in the supplier catalog first (fuzzy match on
 * item name). Only falls back to the simulated generator if nothing
 * in the catalog matches — so adding real products/suppliers via
 * /supply-chain makes recommendations genuinely data-driven instead
 * of randomized, without breaking demos for items not yet catalogued.
 */
export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;

  const matches = await db
    .select()
    .from(supplierOffers)
    .where(ilike(supplierOffers.item, `%${request.item}%`));

  let quotes: SupplierQuote[];

  if (matches.length > 0) {
    quotes = matches.map((o) => ({
      supplierName: o.supplierName,
      unitPrice: o.unitPrice,
      quantityAvailable: o.quantityAvailable,
      leadTimeDays: o.leadTimeDays,
      shippingCost: o.shippingCost,
      moq: o.moq,
      respondedAt: formatISO(new Date()),
    }));
  } else {
    quotes = fetchSimulatedSupplierQuotes(request.item, request.quantity);
  }

  return { quotes, status: "comparing" as const };
}