import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { suppliers } from "../db/suppliersSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { supplierMessages } from "../db/supplierMessagesSchema.js";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { sendSupplierInquiryEmail } from "../lib/mailer.js";

export const supplierProfileRouter = Router();

function publicSupplier(row: typeof suppliers.$inferSelect) {
  const { passwordHash, ...rest } = row;
  return rest;
}

// Simple in-memory limit for the contact form: 5 messages per IP per hour.
// (Resets when the server restarts; use Redis or similar if you need it strict.)
const messageHits = new Map<string, number[]>();
function messageRateLimited(ip: string) {
  const now = Date.now();
  const recent = (messageHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= 5) return true;
  messageHits.set(ip, [...recent, now]);
  return false;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/suppliers
 * List of registered suppliers for procurers to select from (e.g. the RFQ
 * "Send RFQ" supplier dropdown). No auth for now — there's no
 * buyer/procurement login system yet.
 */
supplierProfileRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(suppliers);
  res.json({ suppliers: rows.map(publicSupplier) });
});

/**
 * GET /api/suppliers/:id
 * Public company profile + their product listings. Same no-auth caveat as
 * above: "only visible to logged-in buyers" can't be enforced until buyer
 * accounts exist.
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
      "region",
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
 * The "Send message to supplier" contact form. Saves the message, then
 * emails it to the supplier's address on file (looked up here from the
 * database, so the browser never chooses the recipient). The buyer's
 * address is set as Reply-To.
 */
supplierProfileRouter.post("/:id/messages", async (req, res) => {
  try {
    if (messageRateLimited(req.ip ?? "unknown")) {
      return res.status(429).json({ error: "Too many messages. Please try again later." });
    }

    const senderName = String(req.body?.senderName ?? "").trim();
    const senderEmail = String(req.body?.senderEmail ?? "").trim();
    const message = String(req.body?.message ?? "").trim();

    if (!senderName || !senderEmail || !message) {
      return res.status(400).json({ error: "senderName, senderEmail, and message are required" });
    }
    if (!EMAIL_RE.test(senderEmail)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: "Message is too long (5000 characters max)." });
    }

    const [supplier] = await db
      .select({ id: suppliers.id, email: suppliers.email, businessName: suppliers.businessName })
      .from(suppliers)
      .where(eq(suppliers.id, req.params.id))
      .limit(1);

    if (!supplier) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    if (!supplier.email) {
      return res.status(422).json({ error: "This supplier has no email address on file." });
    }

    const [saved] = await db
      .insert(supplierMessages)
      .values({ supplierId: req.params.id, senderName, senderEmail, message })
      .returning();

    try {
      await sendSupplierInquiryEmail({
        to: supplier.email,
        supplierName: supplier.businessName,
        senderName,
        senderEmail,
        message,
      });
    } catch (mailErr) {
      console.error("Failed to email supplier message", mailErr);
      return res.status(502).json({
        error: "Your message was saved, but the email couldn't be delivered. Please try again later.",
      });
    }

    res.status(201).json({ message: saved, emailed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});