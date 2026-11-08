import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseGeneralRate, readHtsLines, convert, toMeasuresCsv, type HtsLine } from "./usitcConvert.js";
import { parseMeasuresCsv } from "./parseTariffCsv.js";

// Every rate in these fixtures is invented. They only exercise the logic.
const L = (code: string, general: string): HtsLine => ({ code: code.replace(/\D/g, ""), general });
const codesOf = (r: { rows: { code: string; ratePercent: number }[] }) =>
  r.rows.map((x) => `${x.code}=${x.ratePercent}`).sort();

describe("rate text", () => {
  test("U1 Free is 0 and plain percentages are read; everything else is refused", () => {
    assert.equal(parseGeneralRate("Free"), 0);
    assert.equal(parseGeneralRate("  FREE "), 0);
    assert.equal(parseGeneralRate("2.5%"), 2.5);
    assert.equal(parseGeneralRate(" 3.4 % "), 3.4);
    assert.equal(parseGeneralRate("6.4¢/kg + 12%"), null);
    assert.equal(parseGeneralRate("5.6¢/kg"), null);
    assert.equal(parseGeneralRate("See 9903.88.15"), null);
    assert.equal(parseGeneralRate("The rate applicable to the article"), null);
    assert.equal(parseGeneralRate(""), null);
  });
});

describe("reading the export", () => {
  test("U2 CSV with the USITC-style header is read and blank-rate lines are skipped", () => {
    const csv = [
      'HTS Number,Indent,Description,Unit of Quantity,General Rate of Duty,Special Rate of Duty,Column 2 Rate of Duty',
      '8523.51.00,2,Solid-state storage,,Free,,35%',
      '8523.51.00.10,3,Cards,No.,,,',
      ',1,"Other:",,,,',
      '8501.10.20,2,"Motors, small",No.,4.4%,Free (A+),35%',
    ].join("\n");
    const r = readHtsLines(csv, "hts.csv");
    assert.deepEqual(r.columns, { hts: "HTS Number", general: "General Rate of Duty" });
    assert.deepEqual(r.lines, [
      { code: "85235100", general: "Free" },
      { code: "85011020", general: "4.4%" },
    ]);
  });

  test("U3 JSON export with htsno and general keys is read", () => {
    const json = JSON.stringify([
      { htsno: "8806.21.00", indent: "2", description: "x", general: "Free", special: "" },
      { htsno: "", general: "" },
    ]);
    const r = readHtsLines(json, "hts.json");
    assert.deepEqual(r.lines, [{ code: "88062100", general: "Free" }]);
  });

  test("U4 an unrecognised header gives a clear message listing the columns", () => {
    assert.throws(() => readHtsLines("Code,Rate\n8523,5%", "x.csv"), /Columns in the file: Code, Rate/);
  });

  test("U5 column names can be given explicitly", () => {
    const r = readHtsLines("Code,Rate\n8523.51.00,5%", "x.csv", { htsColumn: "Code", generalColumn: "Rate" });
    assert.equal(r.lines.length, 1);
  });
});

describe("building the fewest safe rows", () => {
  test("U6 when every line under a prefix has the same rate, one row covers them all", () => {
    const r = convert([L("8523.51.00", "Free"), L("8523.52.00", "Free"), L("8523.59.00", "Free")], ["8523"]);
    assert.deepEqual(codesOf(r), ["8523=0"]);
  });

  test("U7 Free becomes a 0% row, not a missing rate", () => {
    const r = convert([L("8542.31.00", "Free")], ["8542"]);
    assert.deepEqual(codesOf(r), ["8542=0"]);
  });

  test("U8 different rates are split down to the level where they agree", () => {
    const r = convert(
      [L("8501.10.20", "4%"), L("8501.10.40", "4%"), L("8501.20.00", "6%"), L("8501.31.00", "Free")],
      ["8501"]
    );
    assert.deepEqual(codesOf(r), ["850110=4", "850120=6", "850131=0"]);
  });

  test("U9 lines that differ inside one subheading get their own 8-digit rows", () => {
    const r = convert([L("8501.10.20", "4%"), L("8501.10.40", "5%")], ["8501"]);
    assert.deepEqual(codesOf(r), ["85011020=4", "85011040=5"]);
  });

  test("U10 a non-percentage line is reported and never covered by a broader row", () => {
    const r = convert([L("8507.60.00", "3.4%"), L("8507.80.10", "5.6¢/kg + 12%"), L("8507.80.90", "3.4%")], ["8507"]);
    assert.deepEqual(codesOf(r), ["850760=3.4", "85078090=3.4"]);
    assert.equal(r.reports[0].unsupported.length, 1);
    assert.equal(r.reports[0].unsupported[0].code, "85078010");
  });

  test("U11 a parent row with an unusual child is left out instead of mispricing the child", () => {
    const r = convert([L("8507.80", "3%"), L("8507.80.10", "5.6¢/kg"), L("8507.80.90", "4%")], ["8507"]);
    assert.deepEqual(codesOf(r), ["85078090=4"]);
    assert.match(r.reports[0].notes.join(" "), /left without a row/);
  });

  test("U12 a subheading with its own rate and cheaper children keeps both", () => {
    const r = convert([L("8501.10", "5%"), L("8501.10.20", "3%"), L("8501.10.40", "")], ["8501"]);
    assert.deepEqual(codesOf(r), ["85011020=3", "850110=5"]); // sorted as plain strings
  });

  test("U13 a longer prefix inherits the rate of the shorter line that covers it", () => {
    const r = convert([L("8501.10", "5%")], ["8501.10.40"]);
    assert.deepEqual(codesOf(r), ["85011040=5"]);
    assert.match(r.reports[0].notes.join(" "), /takes its rate from the shorter line 850110/);
  });

  test("U14 prefixes with no lines, and invalid prefixes, are reported", () => {
    const r = convert([L("8523.51.00", "Free")], ["9999", "85"]);
    assert.deepEqual(r.notFound, ["9999", "85"]);
    assert.equal(r.rows.length, 0);
  });

  test("U15 overlapping prefixes do not produce duplicate rows", () => {
    const r = convert([L("8501.10.20", "4%")], ["8501", "850110"]);
    assert.equal(r.rows.filter((x) => x.code === "8501").length + r.rows.filter((x) => x.code === "850110").length, 2);
    assert.equal(new Set(r.rows.map((x) => x.code)).size, r.rows.length);
  });

  test("U16 two lines with the same code but different rates are treated as unusable", () => {
    const r = convert([L("8523.51.00", "Free"), L("8523.51.00", "5%")], ["8523"]);
    assert.equal(r.rows.length, 0);
    assert.match(r.reports[0].unsupported[0].text, /conflicting duplicates/);
  });
});

describe("the CSV that comes out", () => {
  const rows = convert([L("8523.51.00", "Free"), L("8501.10.20", "4.4%")], ["8523", "8501"]).rows;

  test("U17 it passes the importer's own validation with no errors (unverified)", () => {
    const csv = toMeasuresCsv(rows, { label: "2026 Revision 3", markVerified: false });
    const parsed = parseMeasuresCsv(csv, "2026-11-06");
    assert.equal(parsed.errors.length, 0, parsed.errors.map((e) => e.message).join(" | "));
    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].verified, false);
  });

  test("U18 US rows use the FOB basis, any origin, destination United States", () => {
    const parsed = parseMeasuresCsv(toMeasuresCsv(rows, { label: "x", markVerified: false }), "2026-11-06");
    for (const r of parsed.rows) {
      assert.equal(r.valuationBasis, "fob");
      assert.equal(r.originCountry, null);
      assert.equal(r.destinationCountry, "United States");
      assert.equal(r.layer, "standard");
    }
  });

  test("U19 --mark-verified writes the source link and today's date, and still passes validation", () => {
    const csv = toMeasuresCsv(rows, { label: "x", markVerified: true, today: "2026-11-06" });
    const parsed = parseMeasuresCsv(csv, "2026-11-06");
    assert.equal(parsed.errors.length, 0, parsed.errors.map((e) => e.message).join(" | "));
    assert.equal(parsed.rows[0].verified, true);
    assert.equal(parsed.rows[0].reviewedOn, "2026-11-06");
    assert.match(parsed.rows[0].sourceUrl ?? "", /^https:\/\/hts\.usitc\.gov\//);
  });

  test("U20 a label containing a comma is quoted so the CSV stays valid", () => {
    const csv = toMeasuresCsv(rows, { label: "2026, Revision 3", markVerified: false });
    assert.equal(parseMeasuresCsv(csv, "2026-11-06").errors.length, 0);
  });
});