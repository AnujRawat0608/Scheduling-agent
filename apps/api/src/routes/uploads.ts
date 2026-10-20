import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";
import { supabase, BUCKET, PUBLIC_PREFIX } from "../lib/storage.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, same limit as the UI
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

// Keep the file in memory; it goes straight to Supabase Storage, never to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error("Only JPG or PNG images are allowed"));
  },
});

/** The mimetype header is client-supplied, so also check the real file signature. */
function hasImageSignature(buf: Buffer): boolean {
  const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return isPng || isJpg;
}

export const uploadsRouter = Router();

// Only logged-in suppliers can upload.
uploadsRouter.post("/product-image", requireSupplierAuth, (req, res) => {
  upload.single("image")(req, res, async (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5MB or smaller"
          : err.message;
      return res.status(400).json({ error: message });
    }

    const file = req.file;
    if (!file) return res.status(400).json({ error: "No image uploaded" });

    if (!hasImageSignature(file.buffer)) {
      return res.status(400).json({ error: "File is not a valid JPG or PNG image" });
    }

    try {
      // Random server-generated name: never trust the client's filename.
      const storagePath = `products/${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype]}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (error) throw error;

      // Full public URL (https://...). The product form passes it back as `imageUrl`.
      return res.status(201).json({ url: `${PUBLIC_PREFIX}${storagePath}` });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to upload image" });
    }
  });
});

/* In your main server file, keep:
     app.use("/api/uploads", uploadsRouter);
   The express.static("/uploads") line is no longer needed for new uploads. */