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

// Unchanged: `...r.offer` already includes imageUrl once the column exists.
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
    verificationStatus: r.verificationStatus ?? null,
    gstVerified: r.gstVerified ?? false,
  }));

  res.json({ offers });
});

supplyChainRouter.post("/supply-chain", requireSupplierAuth, async (req, res) => {
  try {
    // supplierId / supplierName are deliberately NOT read from the body —
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
    } = req.body ?? {};

    if (!item || unitPrice == null || leadTimeDays == null || quantityAvailable == null) {
      return res.status(400).json({
        error: "item, unitPrice, leadTimeDays, and quantityAvailable are required",
      });
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
        unitPrice,
        unitOfMeasure: unitOfMeasure ?? "piece",
        leadTimeDays,
        dispatchStatus: dispatchStatus ?? "Dispatch ready",
        shippingCost: shippingCost ?? 0,
        moq: moq ?? 1,
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

    res.status(201).json({ offer });
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