// apps/api/src/db/logPriceObservations.ts
//
// Best-effort logger: writes one row per REAL quote into price_observations.
// It NEVER throws, so a database problem can't fail a procurement run.

import { db } from "./client.js";
import { priceObservations } from "./dataMoatSchema.js";
import type { LineItem, LineItemQuotes, SupplierQuote } from "../procurement/state.js";

const CHUNK_SIZE = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NewObservation = typeof priceObservations.$inferInsert;

/** Simple normalization. Improve later; partRaw and rawPayload keep the originals. */
export function normalizePartKey(item: string, specs?: string | null): string {
  return [item, specs ?? ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function toRow(runId: string | null, lineItem: LineItem, q: SupplierQuote): NewObservation | null {
  // Invented fallback quotes are not real prices: never log them.
  if (q.simulated) return null;
  if (!isNum(q.unitPrice) || q.unitPrice <= 0) return null;

  const currency = (q.currency ?? "").trim().toUpperCase();
  if (currency.length !== 3) return null;

  return {
    source: q.source === "web" ? "web_quote" : "catalog",
    // A non-UUID id would make the whole batch fail, so store null instead.
    supplierId: q.supplierId && UUID_RE.test(q.supplierId) ? q.supplierId : null,
    supplierName: q.supplierName || "unknown",
    supplierUrl: q.sourceUrl ?? null,
    partKey: normalizePartKey(lineItem.item, lineItem.specifications),
    partRaw: q.offerItem?.trim() || lineItem.item, // what the supplier actually listed
    unitPrice: q.unitPrice.toFixed(4), // in the SUPPLIER's currency, as quoted
    currency,
    quantity: isNum(lineItem.quantity) ? lineItem.quantity.toFixed(3) : null,
    // Placeholders are not facts: null means "unknown".
    moq: q.moqKnown === false || !isNum(q.moq) ? null : Math.round(q.moq),
    leadTimeDays: q.leadTimeAssumed || !isNum(q.leadTimeDays) ? null : Math.round(q.leadTimeDays),
    shippingCost: q.shippingKnown === false || !isNum(q.shippingCost) ? null : q.shippingCost.toFixed(2),
    taxInclusive: typeof q.taxInclusive === "boolean" ? q.taxInclusive : null,
    taxRate: isNum(q.taxRate) ? q.taxRate.toFixed(2) : null,
    confidence: isNum(q.confidence) ? Math.min(Math.max(q.confidence, 0), 1).toFixed(2) : null,
    originCountry: q.supplierCountry?.trim() || null,
    runId,
    rawPayload: q,
  };
}

export async function logPriceObservations(
  runId: string | null | undefined,
  lineItemQuotes: LineItemQuotes[]
): Promise<void> {
  try {
    const rows: NewObservation[] = [];
    for (const liq of lineItemQuotes ?? []) {
      for (const q of liq.quotes ?? []) {
        const row = toRow(runId ?? null, liq.lineItem, q);
        if (row) rows.push(row);
      }
    }
    if (rows.length === 0) return;

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      await db.insert(priceObservations).values(rows.slice(i, i + CHUNK_SIZE));
    }
    console.log(`[logPriceObservations] logged ${rows.length} observations`);
  } catch (err) {
    console.warn("[logPriceObservations] insert failed", err);
  }
}