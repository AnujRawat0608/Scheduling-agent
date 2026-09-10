import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { suppliers } from "../db/suppliersSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { supplierMessages } from "../db/supplierMessagesSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";

export const supplierProfileRouter = Router();

function publicSupplier(row: typeof suppliers.$inferSelect) {
  const { passwordHash, ...rest } = row;
  return rest;
}

/**
 * GET /api/suppliers/:id
 * Public company profile + their product listings.
 *
 * NOTE: this app has no buyer/procurement login system yet — only
 * suppliers can log in. So this endpoint currently has no auth check at
 * all; "only visible to logged-in buyers" can't be enforced until buyer
 * accounts exist. Flagging this here so it isn't a silent gap.
 */
supplierProfileRouter.get("/:id", async (req, res) => {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, req.params.id))
    .limit(1);

  if (!supplier) {
    return res.status(404).json({ error: "Supplier not found" });
  }

  const products = await db
    .select()
    .from(supplierOffers)
    .where(eq(supplierOffers.supplierId, req.params.id));

  res.json({ supplier: publicSupplier(supplier), products });
});

/**
 * PATCH /api/suppliers/me
 * Lets a logged-in supplier update their own profile fields, including
 * the new company-profile fields (revenue, employees, R&D capacity, etc).
 */
supplierProfileRouter.patch("/me", requireSupplierAuth, async (req, res) => {
  try {
    const allowedFields = [
      "businessName",
      "contactName",
      "phone",
      "gstNumber",
      "address",
      "city",
      "state",
      "pincode",
      "companyOverview",
      "businessType",
      "yearEstablished",
      "totalEmployees",
      "totalAnnualRevenue",
      "mainProducts",
      "certifications",
      "rdCapacity",
      "mainMarkets",
      "languagesSpoken",
      "tradeDeptEmployees",
      "averageLeadTimeDays",
      "responseRate",
      "responseTimeHours",
      "transactionsCount",
      "totalTransactionAmount",
      "quotationPerformance",
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in (req.body ?? {})) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    updates.updatedAt = new Date();

    const [updated] = await db
      .update(suppliers)
      .set(updates)
      .where(eq(suppliers.id, req.supplier!.supplierId))
      .returning();

    res.json({ supplier: publicSupplier(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * POST /api/suppliers/:id/messages
 * The "Send message to supplier" contact form. Stores the message —
 * does not send an email/notification yet, that would need a mail
 * provider wired in separately.
 */
supplierProfileRouter.post("/:id/messages", async (req, res) => {
  try {
    const { senderName, senderEmail, message } = req.body ?? {};

    if (!senderName || !senderEmail || !message) {
      return res.status(400).json({ error: "senderName, senderEmail, and message are required" });
    }

    const [supplier] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.id, req.params.id))
      .limit(1);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }

    const [saved] = await db
      .insert(supplierMessages)
      .values({
        supplierId: req.params.id,
        senderName,
        senderEmail,
        message,
      })
      .returning();

    res.status(201).json({ message: saved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});