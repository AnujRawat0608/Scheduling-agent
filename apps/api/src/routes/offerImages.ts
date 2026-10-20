import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { supplierOffers, offerImages } from "../db/supplyChainSchema.js";

export const offerImagesRouter = Router();

// Service role key: backend only, never expose to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const BUCKET = process.env.SUPABASE_BUCKET ?? "product-images";

const MAX_IMAGES_PER_OFFER = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * TODO: adapt to your supplier auth. It must return the logged-in supplier's id
 * (the same uuid stored in supplier_offers.supplier_id), or null if not logged in.
 * Also add your real auth middleware to the routes below.
 */
function getSupplierId(req: Request): string | null {
  return (req as any).supplier?.id ?? null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_IMAGES_PER_OFFER },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype in EXT_BY_MIME),
});

/** Wraps multer so size/count errors become clean 400 responses instead of 500s. */
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.array("images", MAX_IMAGES_PER_OFFER)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}

/** Uploads to Supabase Storage. Returns the public URL and the storage path (used for deletion). */
async function uploadToStorage(offerId: string, file: Express.Multer.File) {
  const path = `${offerId}/${randomUUID()}.${EXT_BY_MIME[file.mimetype]}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/** Returns true (after sending an error response) if the offer is missing or not owned by the caller. */
async function rejectIfNotOwner(req: Request, res: Response, offerId: string): Promise<boolean> {
  const supplierId = getSupplierId(req);
  if (!supplierId) {
    res.status(401).json({ error: "Please sign in as a supplier" });
    return true;
  }
  const [offer] = await db
    .select({ supplierId: supplierOffers.supplierId })
    .from(supplierOffers)
    .where(eq(supplierOffers.id, offerId));
  if (!offer) {
    res.status(404).json({ error: "Product not found" });
    return true;
  }
  if (offer.supplierId !== supplierId) {
    res.status(403).json({ error: "Not your product" });
    return true;
  }
  return false;
}

// POST /offers/:offerId/images   (form-data, field name "images", multiple files)
offerImagesRouter.post(
  "/:offerId/images",
  /* yourSupplierAuth, */
  handleUpload,
  async (req, res) => {
    try {
      const offerId = String(req.params.offerId);
      if (!UUID_RE.test(offerId)) return res.status(400).json({ error: "Invalid product id" });
      if (await rejectIfNotOwner(req, res, offerId)) return;

      const files = (req.files as Express.Multer.File[]) ?? [];
      if (!files.length) {
        return res.status(400).json({ error: "No valid images (jpg, png or webp, max 5 MB each)" });
      }

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(offerImages)
        .where(eq(offerImages.offerId, offerId));
      if (count + files.length > MAX_IMAGES_PER_OFFER) {
        return res.status(400).json({ error: `Max ${MAX_IMAGES_PER_OFFER} images per product` });
      }

      const uploaded = await Promise.all(files.map((f) => uploadToStorage(offerId, f)));
      const inserted = await db
        .insert(offerImages)
        .values(
          uploaded.map((u, i) => ({
            offerId,
            url: u.url,
            publicId: u.path, // column name is historical; it stores the storage path
            sortOrder: count + i,
          }))
        )
        .returning();

      // Keep the legacy cover column filled if it's empty.
      await db
        .update(supplierOffers)
        .set({ imageUrl: uploaded[0].url })
        .where(and(eq(supplierOffers.id, offerId), sql`${supplierOffers.imageUrl} is null`));

      res.status(201).json({ images: inserted.map((r) => ({ id: r.id, url: r.url })) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to upload images" });
    }
  }
);

// DELETE /offers/:offerId/images/:imageId
offerImagesRouter.delete("/:offerId/images/:imageId", /* yourSupplierAuth, */ async (req, res) => {
  try {
    const offerId = String(req.params.offerId);
    const imageId = Number(req.params.imageId);
    if (!UUID_RE.test(offerId) || !Number.isInteger(imageId)) {
      return res.status(400).json({ error: "Invalid id" });
    }
    if (await rejectIfNotOwner(req, res, offerId)) return;

    const [row] = await db
      .delete(offerImages)
      .where(and(eq(offerImages.id, imageId), eq(offerImages.offerId, offerId)))
      .returning();
    if (!row) return res.status(404).json({ error: "Image not found" });

    if (row.publicId) {
      const { error } = await supabase.storage.from(BUCKET).remove([row.publicId]);
      if (error) console.error("Storage delete failed:", error);
    }

    // Keep the legacy cover column pointing at the first remaining image (or null).
    const [first] = await db
      .select({ url: offerImages.url })
      .from(offerImages)
      .where(eq(offerImages.offerId, offerId))
      .orderBy(asc(offerImages.sortOrder), asc(offerImages.id))
      .limit(1);
    await db
      .update(supplierOffers)
      .set({ imageUrl: first?.url ?? null })
      .where(eq(supplierOffers.id, offerId));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete image" });
  }
});