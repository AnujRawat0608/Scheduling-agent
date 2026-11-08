/**
 * Turns the USITC Harmonized Tariff Schedule export (CSV or JSON) into rows for the
 * tariff_measures table. Pure functions (no database, no network), so they are easy to test.
 *
 * Only the "general" column is used (the normal rate for WTO members, which includes China,
 * Taiwan and India). Lines whose rate is not a plain percentage (per-kg, compound, "see 9903...")
 * are never guessed: they are reported and left without a row, so the calculator says
 * "no rate on file" for them instead of showing a wrong number.
 */
import { parseCsv } from "./parseTariffCsv.js";

export interface HtsLine {
  code: string; // digits only: 4, 6, 8 or 10 digits
  general: string; // the general-rate text exactly as in the file
}

export interface Leaf {
  code: string;
  rate: number | null; // null = not a plain percentage
  text: string;
}

export interface Row {
  code: string; // HS prefix the rate applies to
  ratePercent: number;
}

export interface PrefixReport {
  prefix: string;
  lines: number; // lines with a rate found under this prefix
  rows: number;
  unsupported: Leaf[];
  notes: string[];
}

export interface ConvertResult {
  rows: Row[];
  reports: PrefixReport[];
  notFound: string[];
}

const digitsOnly = (s: string) => s.replace(/\D/g, "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LEVELS = [4, 6, 8, 10];

/** "Free" -> 0, "2.5%" -> 2.5. Anything else (per-kg, compound, references) -> null. */
export function parseGeneralRate(text: string): number | null {
  const s = text.replace(/\u00a0/g, " ").trim().toLowerCase();
  if (s === "free") return 0;
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  return m ? Number(m[1]) : null;
}

/* ---------- reading the export ---------- */

export interface ReadOptions {
  htsColumn?: string;
  generalColumn?: string;
}

export function readHtsLines(
  text: string,
  fileName: string,
  opts: ReadOptions = {}
): { lines: HtsLine[]; columns: { hts: string; general: string } } {
  const isJson = /\.json$/i.test(fileName) || /^\s*[\[{]/.test(text);
  let records: Record<string, string>[];

  if (isJson) {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("The JSON file is not a list of tariff lines.");
    records = data as Record<string, string>[];
  } else {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("The CSV file has no data rows.");
    const header = rows[0].cells.map((h) => h.trim());
    records = rows.slice(1).map(({ cells }) => {
      const rec: Record<string, string> = {};
      header.forEach((h, i) => {
        rec[h] = cells[i] ?? "";
      });
      return rec;
    });
  }

  const keys = [...new Set(records.slice(0, 200).flatMap((r) => Object.keys(r)))];
  const find = (override: string | undefined, test: (n: string) => boolean, label: string) => {
    if (override) {
      const hit = keys.find((k) => k === override || norm(k) === norm(override));
      if (!hit) throw new Error(`Column "${override}" not found. Columns in the file: ${keys.join(", ")}`);
      return hit;
    }
    const hit = keys.find((k) => test(norm(k)));
    if (!hit) {
      throw new Error(
        `Could not find the ${label} column automatically. Columns in the file: ${keys.join(", ")}. ` +
          `Pass the right one with --hts-col / --general-col.`
      );
    }
    return hit;
  };

  const htsKey = find(opts.htsColumn, (n) => n === "htsno" || n === "hts" || n.startsWith("htsnumber"), "HTS number");
  const generalKey = find(opts.generalColumn, (n) => n.includes("general"), "general rate");

  const lines: HtsLine[] = [];
  for (const r of records) {
    const code = digitsOnly(String(r[htsKey] ?? ""));
    if (!LEVELS.includes(code.length)) continue; // header lines such as "Other:" have no number
    const general = String(r[generalKey] ?? "").trim();
    if (general === "") continue; // blank = inherits the parent line's rate
    lines.push({ code, general });
  }
  return { lines, columns: { hts: htsKey, general: generalKey } };
}

/* ---------- turning lines into the fewest safe rows ---------- */

function nextLevel(len: number): number {
  return LEVELS.find((l) => l > len) ?? 10;
}

function emit(node: string, set: Leaf[], out: Row[], bad: Leaf[], notes: string[]) {
  const supported = (l: Leaf) => l.rate !== null;

  // Every line under this node has the same plain percentage: one row covers all of them.
  if (set.length > 0 && set.every(supported) && new Set(set.map((l) => l.rate)).size === 1) {
    out.push({ code: node, ratePercent: set[0].rate as number });
    return;
  }

  const own = set.find((l) => l.code === node);
  const below = set.filter((l) => l.code !== node);
  const unsupportedBelow = below.filter((l) => !supported(l));

  if (own) {
    if (!supported(own)) bad.push(own);
    else if (unsupportedBelow.length === 0) out.push({ code: node, ratePercent: own.rate as number });
    else {
      // A row here would wrongly price the lines below that have unusual rates.
      notes.push(`${node} has its own rate but lines under it do not use a plain percentage, so it was left without a row.`);
    }
  }
  if (below.length === 0) return;

  const next = nextLevel(node.length);
  const groups = new Map<string, Leaf[]>();
  for (const l of below) {
    const key = l.code.slice(0, next);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const key of [...groups.keys()].sort()) emit(key, groups.get(key) as Leaf[], out, bad, notes);
}

export function convert(lines: HtsLine[], prefixes: string[]): ConvertResult {
  // One line per code. Two lines with the same code but different text are treated as unusable.
  const byCode = new Map<string, Leaf>();
  for (const l of lines) {
    if (l.general.trim() === "") continue; // a blank rate means "same as the parent line", not "unusable"
    const rate = parseGeneralRate(l.general);
    const prev = byCode.get(l.code);
    if (!prev) byCode.set(l.code, { code: l.code, rate, text: l.general });
    else if (prev.text !== l.general) byCode.set(l.code, { code: l.code, rate: null, text: `conflicting duplicates: "${prev.text}" / "${l.general}"` });
  }
  const leaves = [...byCode.values()];

  const rows: Row[] = [];
  const reports: PrefixReport[] = [];
  const notFound: string[] = [];

  for (const raw of prefixes) {
    const prefix = digitsOnly(raw);
    if (prefix.length < 4 || prefix.length > 10) {
      notFound.push(raw);
      continue;
    }
    const under = leaves.filter((l) => l.code.startsWith(prefix));
    const out: Row[] = [];
    const bad: Leaf[] = [];
    const notes: string[] = [];

    if (under.length > 0) {
      emit(prefix, under, out, bad, notes);
    } else {
      // A shorter line (for example the 6-digit subheading) may carry the rate for this longer prefix.
      const parent = leaves
        .filter((l) => prefix.startsWith(l.code) && l.code.length < prefix.length)
        .sort((a, b) => b.code.length - a.code.length)[0];
      if (!parent) {
        notFound.push(raw);
        continue;
      }
      if (parent.rate === null) bad.push(parent);
      else {
        out.push({ code: prefix, ratePercent: parent.rate });
        notes.push(`${prefix} takes its rate from the shorter line ${parent.code}.`);
      }
    }

    rows.push(...out);
    reports.push({ prefix, lines: under.length, rows: out.length, unsupported: bad, notes });
  }

  // The same code can arrive from two overlapping prefixes (for example 8501 and 850110).
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.code) ? false : (seen.add(r.code), true)));
  return { rows: unique, reports, notFound };
}

/* ---------- writing the CSV for importTariffs.ts ---------- */

const csvField = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const MEASURE_HEADER =
  "hs_code,origin_country,destination_country,name,layer,mode,rate_percent,valuation_basis,verified,source_url,source_note,effective_from,effective_to,reviewed_on";

export interface CsvOptions {
  label: string; // for example "2026 Revision 3", written into source_note
  markVerified: boolean; // only when the file was downloaded from the official site today
  today?: string;
}

export function toMeasuresCsv(rows: Row[], opts: CsvOptions): string {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const lines = rows
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((r) =>
      [
        r.code,
        "", // any origin: the general rate applies to every WTO-member origin
        "United States",
        "Basic customs duty (general rate)",
        "standard",
        "add",
        String(r.ratePercent),
        "fob", // US duty is assessed on transaction value, which excludes international freight and insurance
        opts.markVerified ? "true" : "false",
        `https://hts.usitc.gov/search?query=${r.code}`,
        `USITC HTS general rate, ${opts.label}`,
        "",
        "",
        opts.markVerified ? today : "",
      ]
        .map(csvField)
        .join(",")
    );
  return [MEASURE_HEADER, ...lines].join("\n") + "\n";
}