import { Router } from "express";
import { db } from "../db/client.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { eq, asc } from "drizzle-orm";
import { suppliers } from "../db/suppliersSchema.js";


export const supplyChainRouter = Router();

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


supplyChainRouter.post("/supply-chain", async (req, res) => {
  try {
    const {
      item,
      description,
      category,
      supplierName,
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
      supplierId,
    } = req.body;

    if (!item || !supplierName || unitPrice == null || leadTimeDays == null || quantityAvailable == null) {
      return res.status(400).json({
        error: "item, supplierName, unitPrice, leadTimeDays, and quantityAvailable are required",
      });
    }

    const [offer] = await db
      .insert(supplierOffers)
      .values({
        item,
        description: description ?? null,
        category: category ?? null,
        supplierName,
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
        // Optional — set when a logged-in supplier creates the offer from
        // their own session, so it shows up in their dashboard's product
        // list. Offers created without being logged in simply have no
        // owner, same as before this field existed.
        supplierId: supplierId ?? null,
      })
      .returning();

    res.status(201).json({ offer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

supplyChainRouter.delete("/supply-chain/:id", async (req, res) => {
  await db.delete(supplierOffers).where(eq(supplierOffers.id, req.params.id));
  res.status(204).send();
});