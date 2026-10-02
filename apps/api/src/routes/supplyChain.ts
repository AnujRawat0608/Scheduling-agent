import { Router } from "express";
import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";

export const supplyChainRouter = Router();

// Only accept image paths produced by our own upload endpoint (routes/uploads.ts).
const IMAGE_URL_RE = /^\/uploads\/products\/[\w-]+\.(jpg|png)$/;

// Currencies suppliers may price in. Adding one later is a one-line change here
// (plus a rate for it in the fx_rates table). Keep to 2-decimal currencies for now.
const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

// Existing clients don't send a currency yet, so a missing value defaults to USD
// (matches what the Add Product form showed). An unsupported value is rejected.
const DEFAULT_CURRENCY = "USD";

const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000;

const hasMax2Decimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

const isWholeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

// NOTE: this endpoint is still public because the catalog page doesn't send an
// auth header yet. Lock it down (requireSupplierAuth + filter by supplierId) in
// the same change that adds `headers: authHeaders()` to listSupplyChainOffers.
supplyChainRouter.get("/supply-chain", async (_req, res) => {
  const rows = await db
    .select({
      offer: supplierOffers,
      verificationStatus: suppliers.verificationStatus,
      gstVerified: suppliers.gstVerified,
    })
    .from(supplierOffers)
    .leftJoin(suppliers, eq(supplierOffers.supplierId, suppliers.id))
    .orderBy(asc(supplierOffers.item));

  const offers = rows.map((r) => ({
    ...r.offer,
    // numeric columns come back from Postgres as strings; the web types expect numbers
    unitPrice: Number(r.offer.unitPrice),
    shippingCost: Number(r.offer.shippingCost),
    verificationStatus: r.verificationStatus ?? null,
    gstVerified: r.gstVerified ?? false,
  }));

  res.json({ offers });
});

supplyChainRouter.post("/supply-chain", requireSupplierAuth, async (req, res) => {
  try {
    // supplierId / supplierName are deliberately NOT read from the body -
    // they come from the logged-in supplier, so nobody can list under another company.
    const {
      item,
      description,
      category,
      supplierType,
      unitPrice,
      unitOfMeasure,
      leadTimeDays,
      dispatchStatus,
      shippingCost,
      moq,
      quantityAvailable,
      aiScore,
      specs,
      taxType,
      taxRate,
      taxInclusive,
      imageUrl,
      currency,
    } = req.body ?? {};

    if (!item || unitPrice == null || leadTimeDays == null || quantityAvailable == null) {
      return res.status(400).json({
        error: "item, unitPrice, leadTimeDays, and quantityAvailable are required",
      });
    }

    // ---- Currency ----
    const cur = currency ?? DEFAULT_CURRENCY;
    if (typeof cur !== "string" || !SUPPORTED_CURRENCIES.includes(cur)) {
      return res.status(400).json({
        error: `Unsupported currency. Use one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
      });
    }

    // ---- Money ----
    const shipping = shippingCost ?? 0;
    if (!isMoney(unitPrice) || !isMoney(shipping)) {
      return res
        .status(400)
        .json({ error: "unitPrice and shippingCost must be non-negative numbers" });
    }
    if (!hasMax2Decimals(unitPrice) || !hasMax2Decimals(shipping)) {
      return res
        .status(400)
        .json({ error: "unitPrice and shippingCost can have at most 2 decimal places" });
    }
    if (unitPrice <= 0) {
      return res.status(400).json({ error: "unitPrice must be greater than 0" });
    }

    // ---- Quantities and lead time ----
    const moqValue = moq ?? 1;
    if (!isWholeNumber(leadTimeDays) || !isWholeNumber(quantityAvailable) || !isWholeNumber(moqValue)) {
      return res
        .status(400)
        .json({ error: "leadTimeDays, quantityAvailable and moq must be whole numbers (0 or more)" });
    }
    if (moqValue < 1) {
      return res.status(400).json({ error: "moq must be at least 1" });
    }

    // ---- Tax (declared by the supplier) ----
    if (taxRate != null && (typeof taxRate !== "number" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) {
      return res.status(400).json({ error: "taxRate must be a number between 0 and 100" });
    }

    const [supplier] = await db
      .select({ id: suppliers.id, businessName: suppliers.businessName })
      .from(suppliers)
      .where(eq(suppliers.id, req.supplier!.supplierId))
      .limit(1);

    if (!supplier) {
      return res.status(401).json({ error: "Session no longer valid" });
    }

    const safeImageUrl =
      typeof imageUrl === "string" && IMAGE_URL_RE.test(imageUrl) ? imageUrl : null;

    const [offer] = await db
      .insert(supplierOffers)
      .values({
        item,
        description: description ?? null,
        category: category ?? null,
        supplierName: supplier.businessName,
        supplierType: supplierType ?? null,
        // numeric columns take strings
        unitPrice: unitPrice.toFixed(2),
        currency: cur,
        unitOfMeasure: unitOfMeasure ?? "piece",
        leadTimeDays,
        dispatchStatus: dispatchStatus ?? "Dispatch ready",
        shippingCost: shipping.toFixed(2),
        moq: moqValue,
        quantityAvailable,
        aiScore: aiScore ?? null,
        specs: specs ?? null,
        taxType: taxType ?? null,
        taxRate: taxRate != null ? String(taxRate) : null,
        taxInclusive: taxInclusive ?? false,
        supplierId: supplier.id,
        imageUrl: safeImageUrl,
      })
      .returning();

    res.status(201).json({
      offer: {
        ...offer,
        unitPrice: Number(offer.unitPrice),
        shippingCost: Number(offer.shippingCost),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

supplyChainRouter.delete("/supply-chain/:id", requireSupplierAuth, async (req, res) => {
  try {
    // The supplierId condition makes this a no-op for offers that aren't yours.
    const [deleted] = await db
      .delete(supplierOffers)
      .where(
        and(
          eq(supplierOffers.id, req.params.id),
          eq(supplierOffers.supplierId, req.supplier!.supplierId)
        )
      )
      .returning({ id: supplierOffers.id, imageUrl: supplierOffers.imageUrl });

    // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
    if (!deleted) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Clean up the image file too (path is validated, so no traversal).
    if (deleted.imageUrl && IMAGE_URL_RE.test(deleted.imageUrl)) {
      fs.promises.unlink(path.join(process.cwd(), deleted.imageUrl)).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});