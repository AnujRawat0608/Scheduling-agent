import { createClient } from "@supabase/supabase-js";

// Service role key: backend only, never expose to the frontend.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const BUCKET = process.env.SUPABASE_BUCKET ?? "product_images";

/** Start of every public URL in our bucket. */
export const PUBLIC_PREFIX = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/`;

/**
 * True only for URLs that our own upload endpoint produced (products/<uuid>.jpg|png).
 * Used so a supplier can't save an arbitrary external URL as a product image.
 */
export function isFreshUploadUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.startsWith(PUBLIC_PREFIX) &&
    /^products\/[\w-]+\.(jpg|png)$/.test(url.slice(PUBLIC_PREFIX.length))
  );
}

/** Storage path for any image in our bucket, or null if the URL isn't one of ours. */
export function pathFromUrl(url: string | null | undefined): string | null {
  return url && url.startsWith(PUBLIC_PREFIX) ? url.slice(PUBLIC_PREFIX.length) : null;
}