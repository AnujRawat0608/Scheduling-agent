import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireSupplierAuth } from "../agent/lib/supplierAuth.js";

// Files are saved here and served from /uploads (see server setup below).
const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const PRODUCT_DIR = path.join(UPLOAD_ROOT, "products");
fs.mkdirSync(PRODUCT_DIR, { recursive: true });

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, same limit as the UI
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: PRODUCT_DIR,
    // Random server-generated name: never trust the client's filename.
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT_BY_MIME[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error("Only JPG or PNG images are allowed"));
  },
});

/** The mimetype header is client-supplied, so also check the real file signature. */
function hasImageSignature(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  return isPng || isJpg;
}

export const uploadsRouter = Router();

// Only logged-in suppliers can upload.
uploadsRouter.post("/product-image", requireSupplierAuth, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      const message =
        err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5MB or smaller"
          : err.message;
      return res.status(400).json({ error: message });
    }

    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    if (!hasImageSignature(req.file.path)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: "File is not a valid JPG or PNG image" });
    }

    // Relative URL; the frontend prefixes the API origin.
    return res.status(201).json({ url: `/uploads/products/${req.file.filename}` });
  });
});

/* ------------------------------------------------------------------
   Server setup (in your main server file, e.g. src/index.ts)

   import express from "express";
   import path from "path";
   import { uploadsRouter } from "./routes/uploads.js"; // same folder as supplierProfileRouter

   app.use("/api/uploads", uploadsRouter);
   app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

   If you use helmet(), the browser will block the image across ports
   (frontend :3000, backend :3001) unless you allow it:

   app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

   Install:  npm i multer   &&   npm i -D @types/multer
   Add to .gitignore:  uploads/
------------------------------------------------------------------- */