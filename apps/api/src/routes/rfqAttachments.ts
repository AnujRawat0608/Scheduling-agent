import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { rfqs } from "../db/rfqsSchema.js";
import { rfqAttachments } from "../db/rfqExternalSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";

export const rfqAttachmentRouter = Router();

export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.resolve("uploads");
const ALLOWED_EXT = new Set([".step", ".stp", ".stl", ".iges", ".igs", ".dwg", ".pdf"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs BEFORE multer so nothing is written to disk for an RFQ the caller doesn't own.
async function loadOwnRfq(req: Request, res: Response, next: NextFunction) {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: "RFQ not found" });
    const [rfq] = await db
      .select({ id: rfqs.id })
      .from(rfqs)
      .where(and(eq(rfqs.id, req.params.id), eq(rfqs.procurerId, req.procurer!.procurerId)))
      .limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ not found" });
    next();
  } catch (err) {
    next(err);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, "rfqs", req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error(`Unsupported file type: ${file.originalname}`)),
});

/** POST /api/rfqs/:id/attachments (multipart, field name "files") */
rfqAttachmentRouter.post("/:id/attachments", requireProcurerAuth, loadOwnRfq, upload.array("files", 20), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) return res.status(400).json({ error: "No files received" });

    const rows = await db
      .insert(rfqAttachments)
      .values(
        files.map((f) => ({
          rfqId: req.params.id,
          fileName: f.originalname.slice(0, 255),
          storageKey: path.relative(UPLOAD_ROOT, f.path),
          mimeType: f.mimetype,
          sizeBytes: f.size,
        }))
      )
      .returning();
    res.status(201).json({ attachments: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save the files" });
  }
});

rfqAttachmentRouter.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError || err.message?.startsWith("Unsupported file type")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});