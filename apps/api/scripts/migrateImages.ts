// Moves old local images (/uploads/...) to Supabase Storage and fills offer_images.
// Run from apps/api, on the machine that has the files:  npx tsx scripts/migrateImages.ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { supplierOffers, offerImages } from "../src/db/supplyChainSchema.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const BUCKET = process.env.SUPABASE_BUCKET ?? "product_images";

// Folder that "/uploads/..." paths are relative to (apps/api by default).
const LOCAL_ROOT = path.resolve(process.cwd());

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main() {
  const rows = await db
    .select({ id: supplierOffers.id, imageUrl: supplierOffers.imageUrl })
    .from(supplierOffers)
    .where(isNotNull(supplierOffers.imageUrl));

  for (const row of rows) {
    const current = row.imageUrl!;
    if (/^https?:\/\//i.test(current)) continue; // already migrated

    const filePath = path.join(LOCAL_ROOT, current.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      console.warn(`SKIP offer ${row.id}: file not found at ${filePath}`);
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext];
    if (!contentType) {
      console.warn(`SKIP offer ${row.id}: unsupported file type ${ext}`);
      continue;
    }

    const storagePath = `${row.id}/${randomUUID()}${ext === ".jpeg" ? ".jpg" : ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fs.readFileSync(filePath), { contentType, upsert: false });
    if (error) {
      console.error(`FAIL offer ${row.id}:`, error.message);
      continue;
    }
    const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

    await db.update(supplierOffers).set({ imageUrl: url }).where(eq(supplierOffers.id, row.id));
    await db.insert(offerImages).values({ offerId: row.id, url, publicId: storagePath, sortOrder: 0 });

    console.log(`OK offer ${row.id}: ${current} -> ${url}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});