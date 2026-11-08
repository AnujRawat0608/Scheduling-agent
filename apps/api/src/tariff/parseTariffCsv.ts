/**
 * Reads and validates tariff CSV files. Pure functions (no database), so they are easy to test.
 * The import script only writes rows that came back from here with zero errors.
 */

export interface MeasureRow {
  hsCode: string; // digits only; '' only for additional measures that apply to every product
  originCountry: string | null;
  destinationCountry: string;
  name: string;
  layer: "standard" | "additional";
  mode: "add" | "top_up_to";
  ratePercent: number;
  valuationBasis: "cif" | "fob";
  verified: boolean;
  sourceUrl: string | null;
  sourceNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewedOn: string | null;
}

export interface RestrictionRow {
  hsCode: string;
  originCountry: string | null;
  destinationCountry: string;
  status: "permit_required" | "prohibited";
  note: string;
  verified: boolean;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewedOn: string | null;
}

export interface Problem {
  line: number; // line number in the file (the header is line 1)
  message: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: Problem[];
  warnings: Problem[];
}

/* ---------- CSV reading (quotes, escaped quotes, CRLF, BOM) ---------- */

export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const src = text.replace(/^\uFEFF/, "");
  const out: { cells: string[]; line: number }[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) out.push({ cells: row, line: rowLine });
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r" && src[i + 1] === "\n") {
      // CRLF: handled when the \n arrives
    } else if (ch === "\n" || ch === "\r") {
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return out;
}

/* ---------- field helpers ---------- */

const todayIso = () => new Date().toISOString().slice(0, 10);
const digitsOnly = (s: string) => s.replace(/\D/g, "");

function parseDate(v: string): string | null | "invalid" {
  const s = v.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "invalid";
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "invalid" : s;
}

function parseBool(v: string): boolean | "invalid" {
  const s = v.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0", ""].includes(s)) return false;
  return "invalid";
}

const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s);

interface Table {
  rows: { get: (col: string) => string; line: number }[];
  errors: Problem[];
}

/** Turns CSV text into rows keyed by column name, and checks the header exactly. */
function readTable(text: string, required: string[], optional: string[]): Table {
  const errors: Problem[] = [];
  const all = parseCsv(text).filter((r) => !r.cells[0].trim().startsWith("#")); // "#" rows are comments
  if (all.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };

  const header = all[0].cells.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const known = new Set([...required, ...optional]);
  for (const h of header) {
    if (!known.has(h)) errors.push({ line: all[0].line, message: `Unknown column "${h}". Check the spelling against the template.` });
  }
  for (const h of required) {
    if (!header.includes(h)) errors.push({ line: all[0].line, message: `Missing required column "${h}".` });
  }
  const dupes = header.filter((h, i) => header.indexOf(h) !== i);
  for (const h of new Set(dupes)) errors.push({ line: all[0].line, message: `Column "${h}" appears more than once.` });
  if (errors.length > 0) return { rows: [], errors };

  const rows = all.slice(1).map(({ cells, line }) => {
    if (cells.length > header.length) {
      errors.push({ line, message: `Has ${cells.length} values but the header has ${header.length} columns. A comma inside a value needs quotes.` });
    }
    return {
      line,
      get: (col: string) => {
        const i = header.indexOf(col);
        return i === -1 ? "" : (cells[i] ?? "").trim();
      },
    };
  });
  return { rows, errors };
}

/** Shared checks for the columns both file types have. */
function commonFields(
  get: (c: string) => string,
  line: number,
  today: string,
  errors: Problem[]
) {
  const bad = (message: string) => errors.push({ line, message });

  const destinationCountry = get("destination_country");
  if (!destinationCountry) bad("destination_country is required.");
  const originCountry = get("origin_country") || null;
  if (originCountry && destinationCountry && originCountry.toLowerCase() === destinationCountry.toLowerCase()) {
    bad("origin_country and destination_country are the same. Import duty only applies across borders.");
  }

  const verified = parseBool(get("verified"));
  if (verified === "invalid") bad(`verified must be true or false, got "${get("verified")}".`);

  const sourceUrl = get("source_url") || null;
  if (sourceUrl && !isHttpUrl(sourceUrl)) bad("source_url must start with http:// or https://.");

  const dates: Record<string, string | null> = {};
  for (const col of ["effective_from", "effective_to", "reviewed_on"]) {
    const d = parseDate(get(col));
    if (d === "invalid") {
      bad(`${col} must be a real date written YYYY-MM-DD, got "${get(col)}".`);
      dates[col] = null;
    } else {
      dates[col] = d;
    }
  }
  if (dates.effective_from && dates.effective_to && dates.effective_to < dates.effective_from) {
    bad("effective_to is before effective_from.");
  }
  if (dates.reviewed_on && dates.reviewed_on > today) bad("reviewed_on is in the future.");

  // The audit rule: "verified" has to mean someone actually looked at an official source.
  if (verified === true) {
    if (!sourceUrl) bad("verified rows need a source_url, so the rate can be checked later.");
    if (!dates.reviewed_on) bad("verified rows need reviewed_on (the date you checked the source).");
  }

  return {
    destinationCountry,
    originCountry,
    verified: verified === true,
    sourceUrl,
    effectiveFrom: dates.effective_from,
    effectiveTo: dates.effective_to,
    reviewedOn: dates.reviewed_on,
  };
}

/* ---------- measures ---------- */

const MEASURE_REQUIRED = ["hs_code", "destination_country", "name", "rate_percent"];
const MEASURE_OPTIONAL = [
  "origin_country", "layer", "mode", "valuation_basis", "verified",
  "source_url", "source_note", "effective_from", "effective_to", "reviewed_on",
];

export function parseMeasuresCsv(text: string, today = todayIso()): ParseResult<MeasureRow> {
  const table = readTable(text, MEASURE_REQUIRED, MEASURE_OPTIONAL);
  const errors = [...table.errors];
  const warnings: Problem[] = [];
  const rows: MeasureRow[] = [];
  if (table.rows.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: "The file has a header but no data rows." });
  }
  const seen = new Map<string, number>();

  for (const { get, line } of table.rows) {
    const before = errors.length;
    const bad = (message: string) => errors.push({ line, message });
    const common = commonFields(get, line, today, errors);

    const layerRaw = (get("layer") || "standard").toLowerCase();
    if (layerRaw !== "standard" && layerRaw !== "additional") bad(`layer must be standard or additional, got "${get("layer")}".`);
    const layer = layerRaw === "additional" ? "additional" : "standard";

    const modeRaw = (get("mode") || "add").toLowerCase();
    if (modeRaw !== "add" && modeRaw !== "top_up_to") bad(`mode must be add or top_up_to, got "${get("mode")}".`);
    const mode = modeRaw === "top_up_to" ? "top_up_to" : "add";
    if (mode === "top_up_to" && layer !== "additional") bad("mode top_up_to only works with layer additional.");

    const basisRaw = (get("valuation_basis") || "cif").toLowerCase();
    if (basisRaw !== "cif" && basisRaw !== "fob") bad(`valuation_basis must be cif or fob, got "${get("valuation_basis")}".`);
    const valuationBasis = basisRaw === "fob" ? "fob" : "cif";

    const hsCode = digitsOnly(get("hs_code"));
    if (layer === "standard" && hsCode.length < 4) bad("hs_code needs at least 4 digits for a standard duty.");
    if (layer === "additional" && hsCode.length > 0 && hsCode.length < 4) {
      bad("hs_code must be empty (applies to every product) or have at least 4 digits.");
    }
    if (layer === "additional" && hsCode.length === 0) {
      warnings.push({ line, message: "Empty hs_code: this surcharge will apply to every product from this origin." });
    }
    if (hsCode.length > 10) bad("hs_code has more than 10 digits.");

    const name = get("name");
    if (!name) bad("name is required (for example: Basic customs duty).");

    const rateText = get("rate_percent").replace(/%$/, "").trim();
    const ratePercent = rateText === "" ? Number.NaN : Number(rateText);
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 500) {
      bad(`rate_percent must be a number from 0 to 500, got "${get("rate_percent")}".`);
    } else if (ratePercent >= 100) {
      warnings.push({ line, message: `rate_percent is ${ratePercent}. Check this is not a typo.` });
    }

    const key = [common.destinationCountry, common.originCountry ?? "", hsCode, name, layer, common.effectiveFrom ?? ""]
      .map((p) => p.toLowerCase())
      .join("|");
    const first = seen.get(key);
    if (first !== undefined) bad(`Duplicates line ${first} (same destination, origin, HS code, name, layer and start date).`);
    else seen.set(key, line);

    if (errors.length === before) {
      rows.push({
        hsCode,
        originCountry: common.originCountry,
        destinationCountry: common.destinationCountry,
        name,
        layer,
        mode,
        ratePercent,
        valuationBasis,
        verified: common.verified,
        sourceUrl: common.sourceUrl,
        sourceNote: get("source_note") || null,
        effectiveFrom: common.effectiveFrom,
        effectiveTo: common.effectiveTo,
        reviewedOn: common.reviewedOn,
      });
    }
  }
  return { rows, errors, warnings };
}

/* ---------- restrictions ---------- */

const RESTRICTION_REQUIRED = ["hs_code", "destination_country", "status", "note"];
const RESTRICTION_OPTIONAL = [
  "origin_country", "verified", "source_url", "effective_from", "effective_to", "reviewed_on",
];

export function parseRestrictionsCsv(text: string, today = todayIso()): ParseResult<RestrictionRow> {
  const table = readTable(text, RESTRICTION_REQUIRED, RESTRICTION_OPTIONAL);
  const errors = [...table.errors];
  const warnings: Problem[] = [];
  const rows: RestrictionRow[] = [];
  if (table.rows.length === 0 && errors.length === 0) {
    errors.push({ line: 1, message: "The file has a header but no data rows." });
  }
  const seen = new Map<string, number>();

  for (const { get, line } of table.rows) {
    const before = errors.length;
    const bad = (message: string) => errors.push({ line, message });
    const common = commonFields(get, line, today, errors);

    const hsCode = digitsOnly(get("hs_code"));
    if (hsCode.length < 4) bad("hs_code needs at least 4 digits.");
    if (hsCode.length > 10) bad("hs_code has more than 10 digits.");

    const statusRaw = get("status").toLowerCase();
    if (statusRaw !== "permit_required" && statusRaw !== "prohibited") {
      bad(`status must be permit_required or prohibited, got "${get("status")}".`);
    }
    const status = statusRaw === "prohibited" ? "prohibited" : "permit_required";

    const note = get("note");
    if (!note) bad("note is required: say what the restriction is, for the buyer to read.");

    const key = [common.destinationCountry, common.originCountry ?? "", hsCode, status, common.effectiveFrom ?? ""]
      .map((p) => p.toLowerCase())
      .join("|");
    const first = seen.get(key);
    if (first !== undefined) bad(`Duplicates line ${first} (same destination, origin, HS code, status and start date).`);
    else seen.set(key, line);

    if (errors.length === before) {
      rows.push({
        hsCode,
        originCountry: common.originCountry,
        destinationCountry: common.destinationCountry,
        status,
        note,
        verified: common.verified,
        sourceUrl: common.sourceUrl,
        effectiveFrom: common.effectiveFrom,
        effectiveTo: common.effectiveTo,
        reviewedOn: common.reviewedOn,
      });
    }
  }
  return { rows, errors, warnings };
}