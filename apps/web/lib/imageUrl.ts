const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Where relative image paths (e.g. "/uploads/abc.jpg") are served from.
// Defaults to the API's origin (API_BASE without the trailing "/api").
// Set NEXT_PUBLIC_ASSET_URL if your images live somewhere else (a CDN, a bucket, ...).
const ASSET_BASE = (
  process.env.NEXT_PUBLIC_ASSET_URL ?? API_BASE.replace(/\/api\/?$/, "")
).replace(/\/$/, "");

/**
 * Turns whatever is stored for a product image into a URL the browser can load.
 * Returns null when there is no image, so the caller can show a placeholder.
 */
export function resolveImageUrl(src?: string | null): string | null {
  const value = src?.trim();
  if (!value) return null;

  // Already absolute (https://..., http://..., //cdn...) or an inline image: use as-is.
  if (/^(https?:)?\/\//i.test(value) || /^(data|blob):/i.test(value)) return value;

  // Relative path: serve it from the asset host.
  return `${ASSET_BASE}${value.startsWith("/") ? "" : "/"}${value}`;
}