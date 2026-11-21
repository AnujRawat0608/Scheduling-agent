import { Router } from "express";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "../db/client.js";
import { suppliers, supplierCertifications } from "../db/suppliersSchema.js";
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

/* -------------------------------------------------------------------------- */
/*  Certificate uploads                                                       */
/* -------------------------------------------------------------------------- */

/** Must match CERT_SLOTS ids on the dashboard page. */
const CERT_TYPES = ["iso9001", "tradeLicense", "insurance"] as const;
type CertType = (typeof CERT_TYPES)[number];
const isCertType = (v: string): v is CertType => (CERT_TYPES as readonly string[]).includes(v);

const MAX_CERT_BYTES = 5 * 1024 * 1024;

/**
 * Files live in a PRIVATE Supabase Storage bucket. Nothing is public: the dashboard asks the API
 * for a short-lived signed link when someone needs to open a file.
 * Needs these in the API's .env:
 *   SUPABASE_URL=https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...      (server only, never expose it to the browser)
 *   SUPABASE_CERT_BUCKET=supplier-certificates   (optional, this is the default)
 */
const CERT_BUCKET = process.env.SUPABASE_CERT_BUCKET ?? "supplier-certificates";

let supabaseClient: SupabaseClient | null = null;
function storage() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("File storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).");
    }
    supabaseClient = createClient(url, key, { auth: { persistSession: false } });
  }
  return supabaseClient.storage.from(CERT_BUCKET);
}

// Files are held in memory for the request (max 5 MB each), then sent to the bucket.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERT_BYTES, files: CERT_TYPES.length },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okType = ["application/pdf", "image/jpeg"].includes(file.mimetype);
    const okExt = [".pdf", ".jpg", ".jpeg"].includes(ext);
    if (okType && okExt) return cb(null, true);
    cb(new Error("Only PDF or JPG files are allowed."));
  },
}).fields(CERT_TYPES.map((name) => ({ name, maxCount: 1 })));

/** The browser can lie about type, so check the first bytes of the file too. */
function looksLikePdfOrJpeg(buf: Buffer): boolean {
  const isPdf = buf.length >= 4 && buf.toString("latin1", 0, 4) === "%PDF";
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  return isPdf || isJpeg;
}

/** Saves one file and returns its storage path (kept in supplier_certifications.document_url). */
async function saveFile(supplierId: string, type: CertType, file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname).toLowerCase();
  const storagePath = `${supplierId}/${type}-${crypto.randomUUID()}${ext}`;
  const { error } = await storage().upload(storagePath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });
  if (error) throw new Error(`Could not store the file: ${error.message}`);
  return storagePath;
}

const removeFile = async (storagePath: string | null | undefined) => {
  if (!storagePath) return;
  await storage().remove([storagePath]).catch(() => {});
};

async function listCertificates(supplierId: string) {
  const rows = await db
    .select()
    .from(supplierCertifications)
    .where(eq(supplierCertifications.supplierId, supplierId));
  return rows
    .filter((r) => isCertType(r.certType) && r.documentUrl)
    .map((r) => ({
      id: r.certType,
      fileName: r.documentName ?? "certificate",
      uploadedAt: r.createdAt.toISOString(),
      verified: r.verified,
    }));
}

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
 * GET /api/suppliers/me/certificates
 * The logged-in supplier's saved certificates: [{ id, fileName, uploadedAt, verified }].
 * `id` is the slot: "iso9001" | "tradeLicense" | "insurance".
 */
supplierProfileRouter.get("/me/certificates", requireSupplierAuth, async (req, res) => {
  try {
    res.json({ certificates: await listCertificates(req.supplier!.supplierId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * GET /api/suppliers/me/certificates/:type/file
 * Returns { url, fileName }: a signed link to one of the logged-in supplier's own files.
 * The link stops working after 60 seconds.
 */
supplierProfileRouter.get("/me/certificates/:type/file", requireSupplierAuth, async (req, res) => {
  try {
    const type = req.params.type;
    if (!isCertType(type)) return res.status(400).json({ error: "Unknown certificate type" });

    const [row] = await db
      .select()
      .from(supplierCertifications)
      .where(
        and(
          eq(supplierCertifications.supplierId, req.supplier!.supplierId),
          eq(supplierCertifications.certType, type)
        )
      )
      .limit(1);

    if (!row?.documentUrl) return res.status(404).json({ error: "Certificate not found" });

    const { data, error } = await storage().createSignedUrl(row.documentUrl, 60);
    if (error || !data) throw new Error(error?.message ?? "Could not create a link");
    res.json({ url: data.signedUrl, fileName: row.documentName ?? "certificate" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * POST /api/suppliers/me/certificates
 * multipart/form-data with any of the fields iso9001, tradeLicense, insurance (one file each,
 * PDF or JPG, max 5 MB). Uploading a type that already exists replaces the old file.
 * New uploads are saved as verified = false ("Supplier-declared") until you review them.
 */
supplierProfileRouter.post("/me/certificates", requireSupplierAuth, (req: Request, res: Response) => {
  upload(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        const tooBig = (uploadErr as { code?: string }).code === "LIMIT_FILE_SIZE";
        return res
          .status(400)
          .json({ error: tooBig ? "File is larger than 5 MB." : uploadErr.message });
      }

      const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const all = Object.values(files).flat();
      if (all.length === 0) {
        return res.status(400).json({ error: "No certificate file was provided." });
      }

      // Check real file contents before storing anything
      for (const f of all) {
        if (!looksLikePdfOrJpeg(f.buffer)) {
          return res.status(400).json({ error: `"${f.originalname}" is not a valid PDF or JPG.` });
        }
      }

      const supplierId = req.supplier!.supplierId;

      for (const type of CERT_TYPES) {
        const file = files[type]?.[0];
        if (!file) continue;

        const [existing] = await db
          .select({ documentUrl: supplierCertifications.documentUrl })
          .from(supplierCertifications)
          .where(
            and(
              eq(supplierCertifications.supplierId, supplierId),
              eq(supplierCertifications.certType, type)
            )
          )
          .limit(1);

        const storagePath = await saveFile(supplierId, type, file);

        try {
          await db
            .insert(supplierCertifications)
            .values({
              supplierId,
              certType: type,
              documentUrl: storagePath,
              documentName: file.originalname,
              verified: false,
            })
            .onConflictDoUpdate({
              target: [supplierCertifications.supplierId, supplierCertifications.certType],
              set: {
                documentUrl: storagePath,
                documentName: file.originalname,
                verified: false, // a new document has not been checked yet
                createdAt: new Date(),
              },
            });
        } catch (dbErr) {
          await removeFile(storagePath); // don't leave an orphan file behind
          throw dbErr;
        }

        // Replaced an older file: delete it from the bucket
        if (existing?.documentUrl && existing.documentUrl !== storagePath) {
          await removeFile(existing.documentUrl);
        }
      }

      res.status(201).json({ certificates: await listCertificates(supplierId) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: String((err as Error)?.message ?? err) });
    }
  });
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

 res.json({
    supplier: publicSupplier(supplier),
    // numeric columns come back from Postgres as strings; the web types expect numbers
    products: products.map((p) => ({
      ...p,
      unitPrice: Number(p.unitPrice),
      shippingCost: Number(p.shippingCost),
    })),
  });
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