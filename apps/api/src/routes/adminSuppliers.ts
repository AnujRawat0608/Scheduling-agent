import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  suppliers,
  supplierCertifications,
  supplierVerificationEvents,
} from "../db/suppliersSchema.js";
import { requireAdminAuth } from "../agent/lib/adminAuth.js";

export const adminSuppliersRouter = Router();

adminSuppliersRouter.use(requireAdminAuth);

function publicSupplier(row: typeof suppliers.$inferSelect) {
  const { passwordHash, ...rest } = row;
  return rest;
}

adminSuppliersRouter.get("/", async (req, res) => {
  const { status } = req.query;

  const rows = await db
    .select()
    .from(suppliers)
    .where(
      status && typeof status === "string"
        ? eq(suppliers.verificationStatus, status)
        : undefined
    )
    .orderBy(desc(suppliers.createdAt));

  res.json({ suppliers: rows.map(publicSupplier) });
});

adminSuppliersRouter.get("/audit/all", async (_req, res) => {
  const events = await db
    .select()
    .from(supplierVerificationEvents)
    .orderBy(desc(supplierVerificationEvents.createdAt))
    .limit(100);

  res.json({ events });
});

adminSuppliersRouter.get("/:id", async (req, res) => {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, req.params.id))
    .limit(1);

  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const certifications = await db
    .select()
    .from(supplierCertifications)
    .where(eq(supplierCertifications.supplierId, req.params.id));

  // Audit history for this supplier, most recent first.
  const events = await db
    .select()
    .from(supplierVerificationEvents)
    .where(eq(supplierVerificationEvents.supplierId, req.params.id))
    .orderBy(desc(supplierVerificationEvents.createdAt));

  res.json({ supplier: publicSupplier(supplier), certifications, events });
});

adminSuppliersRouter.post("/:id/verify", async (req, res) => {
  const { gstVerified, notes } = req.body ?? {};

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, req.params.id))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const [updated] = await db
    .update(suppliers)
    .set({
      verificationStatus: "verified",
      verifiedAt: new Date(),
      gstVerified: gstVerified ?? false,
      verificationNotes: notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, req.params.id))
    .returning();

  await db.insert(supplierVerificationEvents).values({
    supplierId: req.params.id,
    adminId: req.admin!.adminId,
    action: "verified",
    previousStatus: existing.verificationStatus,
    newStatus: "verified",
    notes: notes ?? null,
  });

  res.json({ supplier: publicSupplier(updated) });
});

adminSuppliersRouter.post("/:id/reject", async (req, res) => {
  const { notes } = req.body ?? {};

  if (!notes || typeof notes !== "string" || !notes.trim()) {
    return res.status(400).json({ error: "A rejection reason (notes) is required" });
  }

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, req.params.id))
    .limit(1);

  if (!existing) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const [updated] = await db
    .update(suppliers)
    .set({
      verificationStatus: "rejected",
      verifiedAt: null,
      verificationNotes: notes,
      updatedAt: new Date(),
    })
    .where(eq(suppliers.id, req.params.id))
    .returning();

  await db.insert(supplierVerificationEvents).values({
    supplierId: req.params.id,
    adminId: req.admin!.adminId,
    action: "rejected",
    previousStatus: existing.verificationStatus,
    newStatus: "rejected",
    notes,
  });

  res.json({ supplier: publicSupplier(updated) });
});