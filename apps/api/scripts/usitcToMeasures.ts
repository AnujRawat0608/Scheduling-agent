/**
 * Converts the official USITC Harmonized Tariff Schedule export into a CSV for importTariffs.ts.
 *
 *   1. Download the schedule: hts.usitc.gov -> Export, range 0101 to 9999, format CSV or JSON.
 *   2. npx tsx scripts/usitcToMeasures.ts hts-export.csv --out us-measures.csv
 *   3. Check a few rows against hts.usitc.gov, then:
 *      npx tsx scripts/importTariffs.ts measures us-measures.csv          (dry run)
 *      npx tsx scripts/importTariffs.ts measures us-measures.csv --apply
 *
 * Options:
 *   --out <file>         where to write the CSV (default: us-measures.csv)
 *   --prefixes a,b,c     HS prefixes to include, 4 to 10 digits (default: the product families below)
 *   --label "<text>"     edition name written into source_note (default: the file name)
 *   --mark-verified      write verified=true with today's date. Only use this if the file was
 *                        downloaded today from the official site; otherwise leave rows unverified.
 *   --hts-col / --general-col   column names, if the file uses different headers
 */
/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { readHtsLines, convert, toMeasuresCsv } from "../src/tariff/usitcConvert.js";

// Hardware families: drones and parts, motors, power electronics, batteries, chips, storage,
// wireless modules, cameras, GNSS, sensors, robots, PLCs, computers, connectors.
const DEFAULT_PREFIXES = [
  "8806", "8807", "8501", "8504", "8507", "8542", "8523", "8517", "8525", "8526",
  "9025", "9026", "9031", "8479", "8537", "8471", "8543", "8544", "8536",
];

const args = process.argv.slice(2);
const VALUE_FLAGS = ["out", "prefixes", "label", "hts-col", "general-col"];
// The file is the first argument that is neither a flag nor the value of a flag that takes one.
const file = args.find((a, i) => !a.startsWith("--") && !(i > 0 && VALUE_FLAGS.includes(args[i - 1].replace(/^--/, "")) && args[i - 1].startsWith("--")));

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!file) fail("Usage: npx tsx scripts/usitcToMeasures.ts <hts-export.csv|json> [--out file] [--prefixes 8806,8501] [--label text] [--mark-verified]");
if (!fs.existsSync(file)) fail(`File not found: ${file}`);

const out = flag("out") ?? "us-measures.csv";
const label = flag("label") ?? path.basename(file);
const markVerified = args.includes("--mark-verified");
const prefixes = (flag("prefixes") ?? DEFAULT_PREFIXES.join(",")).split(",").map((p) => p.trim()).filter(Boolean);

let parsed;
try {
  parsed = readHtsLines(fs.readFileSync(file, "utf8"), file, {
    htsColumn: flag("hts-col"),
    generalColumn: flag("general-col"),
  });
} catch (err) {
  fail(`Could not read the file: ${(err as Error).message}`);
}

console.log(`Read ${parsed.lines.length} lines with a general rate.`);
console.log(`Using columns: HTS number = "${parsed.columns.hts}", general rate = "${parsed.columns.general}"`);
if (parsed.lines.length < 1000) {
  console.warn("warning  That is very few lines for the whole schedule. Did you export the full range 0101 to 9999?");
}

const result = convert(parsed.lines, prefixes);

console.log("\nPrefix     lines  rows  not usable");
for (const r of result.reports) {
  console.log(`${r.prefix.padEnd(10)} ${String(r.lines).padStart(5)} ${String(r.rows).padStart(5)}  ${r.unsupported.length}`);
}
for (const r of result.reports) {
  for (const n of r.notes) console.log(`note     ${n}`);
}
const unusable = result.reports.flatMap((r) => r.unsupported);
if (unusable.length > 0) {
  console.log(`\n${unusable.length} line(s) have a rate that is not a plain percentage and were left out (shown as "no rate on file"):`);
  for (const u of unusable.slice(0, 20)) console.log(`  ${u.code}  "${u.text}"`);
  if (unusable.length > 20) console.log(`  ...and ${unusable.length - 20} more`);
}
if (result.notFound.length > 0) {
  console.warn(`\nwarning  No lines found for: ${result.notFound.join(", ")}. Check the prefixes, or whether the export is complete.`);
}

if (result.rows.length === 0) fail("\nNo rows to write.");

fs.writeFileSync(out, toMeasuresCsv(result.rows, { label, markVerified }), "utf8");
console.log(`\nWrote ${result.rows.length} row(s) to ${out} (${markVerified ? "marked verified" : "unverified"}).`);
console.log("These are the general (normal) duty rates only. Surcharges such as Section 232 or 301 are NOT included.");