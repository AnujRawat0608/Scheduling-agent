/**
 * Imports tariff measures or import restrictions from a CSV file.
 *
 *   npx tsx scripts/importTariffs.ts measures     path/to/measures.csv
 *   npx tsx scripts/importTariffs.ts restrictions path/to/restrictions.csv
 *   npx tsx scripts/importTariffs.ts measures     path/to/measures.csv --apply
 *
 * Without --apply it only checks the file and prints what it WOULD do (a dry run).
 * Nothing is written if any row has an error. Re-running the same file is safe: a row replaces the
 * existing row with the same destination, origin, HS code, name, layer and start date.
 */
/// <reference types="node" />
import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { tariffMeasures, importRestrictions } from "../src/db/tariffSchema.js";
import {
  parseMeasuresCsv,
  parseRestrictionsCsv,
  type ParseResult,
} from "../src/tariff/parseTariffCsv.js";

const [kind, file, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if ((kind !== "measures" && kind !== "restrictions") || !file) {
  fail("Usage: npx tsx scripts/importTariffs.ts <measures|restrictions> <file.csv> [--apply]");
}
if (!fs.existsSync(file)) fail(`File not found: ${file}`);

const text = fs.readFileSync(file, "utf8");
const result: ParseResult<{
  destinationCountry: string;
  originCountry: string | null;
  verified: boolean;
}> = kind === "measures" ? parseMeasuresCsv(text) : parseRestrictionsCsv(text);

for (const w of result.warnings) console.warn(`warning  line ${w.line}: ${w.message}`);

if (result.errors.length > 0) {
  for (const e of result.errors) console.error(`ERROR    line ${e.line}: ${e.message}`);
  fail(`\n${result.errors.length} error(s). Nothing was imported. Fix the file and run it again.`);
}

const rows = result.rows;
const verifiedCount = rows.filter((r) => r.verified).length;
const countries = (pick: (r: (typeof rows)[number]) => string | null) =>
  [...new Set(rows.map(pick).filter(Boolean))].sort().join(", ") || "(none)";

console.log(`\n${rows.length} valid ${kind} row(s): ${verifiedCount} verified, ${rows.length - verifiedCount} unverified.`);
console.log(`Destinations: ${countries((r) => r.destinationCountry)}`);
console.log(`Origins:      ${countries((r) => r.originCountry)}  (empty origin = any origin)`);
console.log("Check that these country names match the spelling used in the app.");

if (!apply) {
  console.log("\nDry run only. Add --apply to write these rows.");
  process.exit(0);
}

await db.transaction(async (tx) => {
  if (kind === "measures") {
    for (const r of parseMeasuresCsv(text).rows) {
      await tx.delete(tariffMeasures).where(sql`
        lower(${tariffMeasures.destinationCountry}) = ${r.destinationCountry.toLowerCase()}
        and coalesce(lower(${tariffMeasures.originCountry}), '') = ${(r.originCountry ?? "").toLowerCase()}
        and ${tariffMeasures.hsCode} = ${r.hsCode}
        and lower(${tariffMeasures.name}) = ${r.name.toLowerCase()}
        and ${tariffMeasures.layer} = ${r.layer}
        and coalesce(${tariffMeasures.effectiveFrom}::text, '') = ${r.effectiveFrom ?? ""}
      `);
      await tx.insert(tariffMeasures).values({
        hsCode: r.hsCode,
        originCountry: r.originCountry,
        destinationCountry: r.destinationCountry,
        name: r.name,
        layer: r.layer,
        mode: r.mode,
        ratePercent: String(r.ratePercent),
        valuationBasis: r.valuationBasis,
        verified: r.verified,
        sourceUrl: r.sourceUrl,
        sourceNote: r.sourceNote,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        reviewedOn: r.reviewedOn,
      });
    }
  } else {
    for (const r of parseRestrictionsCsv(text).rows) {
      await tx.delete(importRestrictions).where(sql`
        lower(${importRestrictions.destinationCountry}) = ${r.destinationCountry.toLowerCase()}
        and coalesce(lower(${importRestrictions.originCountry}), '') = ${(r.originCountry ?? "").toLowerCase()}
        and ${importRestrictions.hsCode} = ${r.hsCode}
        and ${importRestrictions.status} = ${r.status}
        and coalesce(${importRestrictions.effectiveFrom}::text, '') = ${r.effectiveFrom ?? ""}
      `);
      await tx.insert(importRestrictions).values({
        hsCode: r.hsCode,
        originCountry: r.originCountry,
        destinationCountry: r.destinationCountry,
        status: r.status,
        note: r.note,
        verified: r.verified,
        sourceUrl: r.sourceUrl,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
        reviewedOn: r.reviewedOn,
      });
    }
  }
});

console.log(`\nImported ${rows.length} ${kind} row(s).`);
process.exit(0);