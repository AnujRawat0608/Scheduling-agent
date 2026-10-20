import { Router } from "express";
import { and, asc, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";

export const catalogRouter = Router();

const PAGE_SIZE = 24;

/** Escape LIKE wildcards so a buyer typing "50%" or "_" searches for those characters literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/**
 * GET /catalog?q=sandisk&page=1
 *
 * Lists the products (supplier offers) from registered suppliers. With no `q` it lists everything.
 * Every search word must appear in the product title, so "sandisk 64gb" narrows the results.
 */
catalogRouter.get("/", requireProcurerAuth, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);

    // Only offers that belong to a registered supplier (supplierId is set).
    const where = and(
      isNotNull(supplierOffers.supplierId),
      ...terms.map((t) => ilike(supplierOffers.item, `%${escapeLike(t)}%`))
    );

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(supplierOffers)
      .where(where);

    const rows = await db
      .select({ offer: supplierOffers, supplierRegion: suppliers.region })
      .from(supplierOffers)
      .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
      .where(where)
      .orderBy(asc(supplierOffers.item), asc(supplierOffers.supplierName))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);

    res.json({
      products: rows.map(({ offer, supplierRegion }) => ({
        offerId: String(offer.id),
        item: offer.item,
        imageUrl: offer.imageUrl ?? null,
        supplierName: offer.supplierName,
        supplierId: offer.supplierId,
        supplierRegion: supplierRegion ?? null,
        unitPrice: Number(offer.unitPrice),
        currency: offer.currency,
        quantityAvailable: offer.quantityAvailable,
        leadTimeDays: offer.leadTimeDays,
        shippingCost: Number(offer.shippingCost),
        moq: offer.moq,
        taxRate: offer.taxRate == null ? null : Number(offer.taxRate),
        taxInclusive: offer.taxInclusive,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load the product catalog" });
  }
});