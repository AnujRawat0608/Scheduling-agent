import { Router } from "express";
import fs from "fs";
import path from "path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOffers, offerImages } from "../db/supplyChainSchema.js";
import { suppliers } from "../db/suppliersSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { supabase, BUCKET, isFreshUploadUrl, pathFromUrl } from "../lib/storage.js";

export const supplyChainRouter = Router();

// Legacy local-disk paths (old uploads). Only used to clean up old rows on delete.
const LEGACY_IMAGE_URL_RE = /^\/uploads\/products\/[\w-]+\.(jpg|png)$/;

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

    // Only accept image URLs produced by our own upload endpoint (routes/uploads.ts).
    const safeImageUrl = isFreshUploadUrl(imageUrl) ? imageUrl : null;

    // Offer and its first image row are created together or not at all.
    const offer = await db.transaction(async (tx) => {
      const [created] = await tx
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

      if (safeImageUrl) {
        await tx.insert(offerImages).values({
          offerId: created.id,
          url: safeImageUrl,
          publicId: pathFromUrl(safeImageUrl), // storage path, used when deleting
          sortOrder: 0,
        });
      }
      return created;
    });

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


supplyChainRouter.put("/supply-chain/:id", requireSupplierAuth, async (req, res) => {
  try {
    const supplierId = req.supplier!.supplierId;

    // Same 404 for "doesn't exist" and "not yours", like DELETE.
    const [existing] = await db
      .select()
      .from(supplierOffers)
      .where(and(eq(supplierOffers.id, req.params.id), eq(supplierOffers.supplierId, supplierId)));
    if (!existing) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // supplierId / supplierName are never read from the body.
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

    const changes: Partial<typeof supplierOffers.$inferInsert> = {};

    if (item !== undefined) {
      if (typeof item !== "string" || !item.trim()) {
        return res.status(400).json({ error: "item cannot be empty" });
      }
      changes.item = item.trim();
    }
    if (description !== undefined) changes.description = description || null;
    if (category !== undefined) changes.category = category || null;
    if (supplierType !== undefined) changes.supplierType = supplierType || null;
    if (unitOfMeasure !== undefined) changes.unitOfMeasure = unitOfMeasure;
    if (dispatchStatus !== undefined) changes.dispatchStatus = dispatchStatus;
    if (taxType !== undefined) changes.taxType = taxType || null;
    if (taxInclusive !== undefined) changes.taxInclusive = !!taxInclusive;
    if (aiScore !== undefined) changes.aiScore = aiScore ?? null;
    if (specs !== undefined) {
      changes.specs = specs && Object.keys(specs).length > 0 ? specs : null;
    }

    if (currency !== undefined) {
      if (typeof currency !== "string" || !SUPPORTED_CURRENCIES.includes(currency)) {
        return res.status(400).json({
          error: `Unsupported currency. Use one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        });
      }
      changes.currency = currency;
    }

    if (unitPrice !== undefined) {
      if (!isMoney(unitPrice) || !hasMax2Decimals(unitPrice) || unitPrice <= 0) {
        return res
          .status(400)
          .json({ error: "unitPrice must be greater than 0 with at most 2 decimal places" });
      }
      changes.unitPrice = unitPrice.toFixed(2);
    }
    if (shippingCost !== undefined) {
      if (!isMoney(shippingCost) || !hasMax2Decimals(shippingCost)) {
        return res
          .status(400)
          .json({ error: "shippingCost must be a non-negative number with at most 2 decimal places" });
      }
      changes.shippingCost = shippingCost.toFixed(2);
    }

    if (leadTimeDays !== undefined) {
      if (!isWholeNumber(leadTimeDays)) {
        return res.status(400).json({ error: "leadTimeDays must be a whole number (0 or more)" });
      }
      changes.leadTimeDays = leadTimeDays;
    }
    if (quantityAvailable !== undefined) {
      if (!isWholeNumber(quantityAvailable)) {
        return res.status(400).json({ error: "quantityAvailable must be a whole number (0 or more)" });
      }
      changes.quantityAvailable = quantityAvailable;
    }
    if (moq !== undefined) {
      if (!isWholeNumber(moq) || moq < 1) {
        return res.status(400).json({ error: "moq must be a whole number of at least 1" });
      }
      changes.moq = moq;
    }

    if (taxRate !== undefined) {
      if (taxRate !== null && (typeof taxRate !== "number" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)) {
        return res.status(400).json({ error: "taxRate must be a number between 0 and 100" });
      }
      changes.taxRate = taxRate != null ? String(taxRate) : null;
    }

    // A new image is only accepted if it came from our own upload endpoint.
    // Anything else (including the existing URL being re-sent) leaves the image alone.
    const newImageUrl = isFreshUploadUrl(imageUrl) && imageUrl !== existing.imageUrl ? imageUrl : null;
    if (newImageUrl) changes.imageUrl = newImageUrl;

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    // Remember the old files so they can be removed after the DB update succeeds.
    let oldPaths: string[] = [];
    if (newImageUrl) {
      const oldImages = await db
        .select({ url: offerImages.url, publicId: offerImages.publicId })
        .from(offerImages)
        .where(eq(offerImages.offerId, existing.id));
      const set = new Set<string>();
      for (const img of oldImages) {
        const p = img.publicId ?? pathFromUrl(img.url);
        if (p) set.add(p);
      }
      const coverPath = pathFromUrl(existing.imageUrl);
      if (coverPath) set.add(coverPath);
      oldPaths = [...set];
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(supplierOffers)
        .set(changes)
        .where(and(eq(supplierOffers.id, existing.id), eq(supplierOffers.supplierId, supplierId)))
        .returning();

      if (newImageUrl) {
        await tx.delete(offerImages).where(eq(offerImages.offerId, existing.id));
        await tx.insert(offerImages).values({
          offerId: existing.id,
          url: newImageUrl,
          publicId: pathFromUrl(newImageUrl),
          sortOrder: 0,
        });
      }
      return row;
    });

    if (!updated) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Clean up the replaced image (failures are logged, not fatal).
    if (oldPaths.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(oldPaths);
      if (error) console.error("Storage cleanup failed:", error);
    }
    if (newImageUrl && existing.imageUrl && LEGACY_IMAGE_URL_RE.test(existing.imageUrl)) {
      fs.promises.unlink(path.join(process.cwd(), existing.imageUrl)).catch(() => {});
    }

    res.json({
      offer: {
        ...updated,
        unitPrice: Number(updated.unitPrice),
        shippingCost: Number(updated.shippingCost),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});


supplyChainRouter.delete("/supply-chain/:id", requireSupplierAuth, async (req, res) => {
  try {
    const supplierId = req.supplier!.supplierId;

    // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
    const [owned] = await db
      .select({ id: supplierOffers.id })
      .from(supplierOffers)
      .where(and(eq(supplierOffers.id, req.params.id), eq(supplierOffers.supplierId, supplierId)));
    if (!owned) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Collect the stored files first: deleting the offer cascades its offer_images rows.
    const images = await db
      .select({ url: offerImages.url, publicId: offerImages.publicId })
      .from(offerImages)
      .where(eq(offerImages.offerId, owned.id));

    const [deleted] = await db
      .delete(supplierOffers)
      .where(and(eq(supplierOffers.id, owned.id), eq(supplierOffers.supplierId, supplierId)))
      .returning({ id: supplierOffers.id, imageUrl: supplierOffers.imageUrl });

    if (!deleted) {
      return res.status(404).json({ error: "Offer not found" });
    }

    // Remove the files from Supabase Storage (failures are logged, not fatal).
    const storagePaths = new Set<string>();
    for (const img of images) {
      const p = img.publicId ?? pathFromUrl(img.url);
      if (p) storagePaths.add(p);
    }
    const coverPath = pathFromUrl(deleted.imageUrl);
    if (coverPath) storagePaths.add(coverPath);

    if (storagePaths.size > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove([...storagePaths]);
      if (error) console.error("Storage cleanup failed:", error);
    }

    // Old rows may still point at a local file (path is validated, so no traversal).
    if (deleted.imageUrl && LEGACY_IMAGE_URL_RE.test(deleted.imageUrl)) {
      fs.promises.unlink(path.join(process.cwd(), deleted.imageUrl)).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});