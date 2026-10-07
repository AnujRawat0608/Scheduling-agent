import { sql, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { supplierOffers } from "../../db/supplyChainSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { fetchSimulatedSupplierQuotes } from "../lib/mockSupplierTool.js";
import type { ProcurementStateType, SupplierQuote, LineItemQuotes } from "../state.js";

const MAX_CANDIDATES = 50;

// Simulated quotes are fake suppliers. They are OFF unless explicitly enabled (dev/demo only),
// so a buyer can never be shown, or approve, a supplier that doesn't exist.
const ALLOW_SIMULATED = process.env.ALLOW_SIMULATED_SUPPLIERS === "true";

// Words that usually mean "accessory", not the product itself. A listing whose TITLE contains
// one of these is dropped unless the buyer's own request contains the same word.
const ACCESSORY_WORDS = [
  "case", "enclosure", "cable", "adapter", "adaptor", "charger", "power supply", "psu",
  "heatsink", "heat sink", "cooler", "fan", "mount", "bracket", "stand", "cover",
  "screen protector", "sd card", "memory card", "hdmi", "hat", "shield", "gpio extension",
];

function wordIn(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`, "i").test(text);
}

/** Drops listings that look like accessories of the requested product. */
function isAccessoryOfOtherProduct(listingTitle: string, requestedItem: string): boolean {
  return ACCESSORY_WORDS.some((w) => wordIn(listingTitle, w) && !wordIn(requestedItem, w));
}

async function sourceOneItem(item: string, quantity: number): Promise<SupplierQuote[]> {
  const searchQuery = sql`plainto_tsquery('english', ${item})`;
  // Match on the listing TITLE only. Descriptions often say "for Raspberry Pi 5" on accessories.
  const searchVector = sql`to_tsvector('english', ${supplierOffers.item})`;

  const rows = await db
    .select({
      offer: supplierOffers,
      supplierRegion: suppliers.region,
    })
    .from(supplierOffers)
    .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
    // TODO: also require the offer to be active / recently updated and the supplier to be
    // approved, once those columns exist (e.g. eq(supplierOffers.isActive, true)).
    .where(sql`${searchVector} @@ ${searchQuery}`)
    .orderBy(sql`ts_rank(${searchVector}, ${searchQuery}) DESC`)
    .limit(MAX_CANDIDATES);

  const matches = rows.filter(({ offer }) => !isAccessoryOfOtherProduct(offer.item, item));

  if (matches.length > 0) {
    return matches.map(({ offer, supplierRegion }) => ({
      supplierName: offer.supplierName,
      supplierId: offer.supplierId,
      supplierRegion: supplierRegion ?? null,
      offerItem: offer.item, // what the supplier actually listed, so the buyer can verify the match
      unitPrice: Number(offer.unitPrice),
      currency: offer.currency,
      quantityAvailable: offer.quantityAvailable,
      leadTimeDays: offer.leadTimeDays,
      shippingCost: Number(offer.shippingCost),
      moq: offer.moq,
      taxType: offer.taxType,
      taxRate: offer.taxRate == null ? null : Number(offer.taxRate),
      taxInclusive: offer.taxInclusive,
      // Catalog data is not a live reply. Use the offer's own last-updated time if you have one
      // (e.g. offer.updatedAt.toISOString()); "now" would make old prices look fresh.
      respondedAt: new Date().toISOString(),
    }));
  }

  if (!ALLOW_SIMULATED) return [];

  return fetchSimulatedSupplierQuotes(item, quantity).map((q) => ({
    ...q,
    supplierId: null,
    supplierRegion: null,
    simulated: true,
  }));
}

export async function contactSuppliers(state: ProcurementStateType) {
  const { request } = state;

  // "registered" (default) | "both" | "web". Web-only skips the catalog lookup entirely.
  const mode = request.sourceMode ?? "registered";
  const useRegistered = mode !== "web";
  const willSearchWeb = mode !== "registered";

  const lineItemQuotes: LineItemQuotes[] = await Promise.all(
    request.lineItems.map(async (lineItem) => {
      const quotes = useRegistered ? await sourceOneItem(lineItem.item, lineItem.quantity) : [];
      return {
        lineItem,
        quotes,
        scoredQuotes: [], // filled in by compareQuotes
        topQuotes: [],    // filled in by compareQuotes
        hasMatch: quotes.length > 0,
      };
    })
  );

  // When the web step runs next, stay in "sourcing" so the progress tracker is honest
  // about what is happening (web search is the slow part).
  return { lineItemQuotes, status: willSearchWeb ? ("sourcing" as const) : ("comparing" as const) };
}