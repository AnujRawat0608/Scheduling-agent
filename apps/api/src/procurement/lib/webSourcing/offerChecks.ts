/**
 * Code-side checks for web offers. They do not depend on the model, so a model mistake
 * cannot get a used item or the wrong product variant into a quote.
 */

// Words that mean the listing is not new stock.
const USED_RE =
  /\b(used|renewed|refurbished|reconditioned|pre-?owned|second[- ]?hand|open[- ]?box|like[- ]?new|for parts)\b/i;

/** True when the text describes a used, renewed, refurbished or open-box item. */
export function looksUsedOrRefurbished(text: string): boolean {
  return USED_RE.test(text);
}

// Words that define WHICH product it is. A micro SD card is not an SD card, and "Plus" or
// "Pro" models are different products from the base model.
const FORM_FACTOR = ["micro", "mini", "nano"]; // matched as word prefixes: microsd, microsdxc, mini-pc
const VARIANT = ["plus", "pro", "max", "lite"]; // matched as whole words

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * If the request contains a defining word that the listing title lacks, returns that word.
 * Deliberately one-directional (request -> title): listing titles are noisy, and a title with
 * an extra word is left to the model's own "match" judgement instead of being rejected here.
 */
export function missingQualifier(requested: string, listingTitle: string): string | null {
  const r = tokens(requested);
  const t = tokens(listingTitle);
  for (const q of FORM_FACTOR) {
    if (r.some((x) => x.startsWith(q)) && !t.some((x) => x.startsWith(q))) return q;
  }
  for (const q of VARIANT) {
    if (r.includes(q) && !t.includes(q)) return q;
  }
  return null;
}