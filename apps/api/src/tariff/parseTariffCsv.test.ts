import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseMeasuresCsv, parseRestrictionsCsv } from "./parseTariffCsv.js";

const TODAY = "2026-11-06";
const H = "hs_code,origin_country,destination_country,name,layer,mode,rate_percent,valuation_basis,verified,source_url,source_note,effective_from,effective_to,reviewed_on";
const measures = (...lines: string[]) => parseMeasuresCsv([H, ...lines].join("\n"), TODAY);
const messages = (r: { errors: { message: string }[] }) => r.errors.map((e) => e.message).join(" | ");

describe("csv reading", () => {
  test("C1 quoted commas, escaped quotes and CRLF line endings", () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\r\n');
    assert.deepEqual(rows.map((r) => r.cells), [["a", "b"], ["x, y", 'say "hi"']]);
  });

  test("C2 a leading BOM (Excel) is ignored", () => {
    assert.deepEqual(parseCsv("\uFEFFa,b\n1,2")[0].cells, ["a", "b"]);
  });

  test("C3 blank lines are skipped and line numbers stay correct", () => {
    const rows = parseCsv("a\n\n1\n");
    assert.equal(rows[1].line, 3);
  });
});

describe("measures: valid rows", () => {
  test("M1 a minimal standard row gets sensible defaults", () => {
    const r = measures("8523.51,China,India,Basic customs duty,,,5,,,,,,,");
    assert.equal(r.errors.length, 0, messages(r));
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].hsCode, "852351");
    assert.equal(r.rows[0].layer, "standard");
    assert.equal(r.rows[0].mode, "add");
    assert.equal(r.rows[0].valuationBasis, "cif");
    assert.equal(r.rows[0].verified, false);
  });

  test("M2 a verified row with source and date is accepted", () => {
    const r = measures("8523,China,India,Basic customs duty,standard,add,7.5%,cif,yes,https://example.org/tariff,official schedule,,,2026-11-01");
    assert.equal(r.errors.length, 0, messages(r));
    assert.equal(r.rows[0].ratePercent, 7.5);
    assert.equal(r.rows[0].verified, true);
    assert.equal(r.rows[0].reviewedOn, "2026-11-01");
  });

  test("M3 an additional measure with an empty HS code is accepted with a warning", () => {
    const r = measures(",Taiwan,United States,Forced-labor tariff,additional,top_up_to,10,cif,false,,,,,");
    assert.equal(r.errors.length, 0, messages(r));
    assert.equal(r.rows[0].hsCode, "");
    assert.equal(r.warnings.length, 1);
  });

  test("M4 comment rows starting with # are ignored", () => {
    const r = measures("# 8523,China,India,example,,,5,,,,,,,", "8523,China,India,Basic customs duty,,,5,,,,,,,");
    assert.equal(r.rows.length, 1);
  });

  test("M5 columns can be in any order and have spaces in the header", () => {
    const r = parseMeasuresCsv("Rate Percent,Name,HS Code,Destination Country\n5,Basic customs duty,8523,India", TODAY);
    assert.equal(r.errors.length, 0, messages(r));
  });
});

describe("measures: rejected rows", () => {
  test("M6 verified without a source or a review date is rejected", () => {
    const r = measures("8523,China,India,Basic customs duty,,,5,,true,,,,,");
    assert.match(messages(r), /source_url/);
    assert.match(messages(r), /reviewed_on/);
    assert.equal(r.rows.length, 0);
  });

  test("M7 standard duty needs at least 4 HS digits", () => {
    assert.match(messages(measures("85,China,India,Basic customs duty,,,5,,,,,,,")), /4 digits/);
  });

  test("M8 top_up_to is only allowed for additional measures", () => {
    assert.match(messages(measures("8523,China,India,Basic customs duty,standard,top_up_to,5,,,,,,,")), /only works with layer additional/);
  });

  test("M9 bad rate, layer, basis and boolean values are all reported", () => {
    const r = measures("8523,China,India,Basic customs duty,wrong,,abc,xyz,maybe,,,,,");
    const m = messages(r);
    assert.match(m, /layer must be/);
    assert.match(m, /rate_percent must be/);
    assert.match(m, /valuation_basis must be/);
    assert.match(m, /verified must be/);
  });

  test("M10 negative and over-500 rates are rejected", () => {
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,-1,,,,,,,")), /rate_percent/);
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,501,,,,,,,")), /rate_percent/);
  });

  test("M11 impossible dates, future review dates and reversed ranges are rejected", () => {
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,,,2026-02-30,,")), /real date/);
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,,,06/11/2026,,")), /YYYY-MM-DD/);
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,,,2026-11-10,2026-11-01,")), /before effective_from/);
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,,,,,2027-01-01")), /in the future/);
  });

  test("M12 same origin and destination is rejected", () => {
    assert.match(messages(measures("8523,India,India,Basic customs duty,,,5,,,,,,,")), /same/);
  });

  test("M13 duplicate rows inside the file are rejected, pointing at the first one", () => {
    const r = measures(
      "8523,China,India,Basic customs duty,,,5,,,,,,,",
      "8523,china,india,basic customs duty,,,6,,,,,,,"
    );
    assert.match(messages(r), /Duplicates line 2/);
    assert.equal(r.rows.length, 1);
  });

  test("M14 a source_url that is not http(s) is rejected", () => {
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,javascript:alert(1),,,,")), /http/);
  });

  test("M15 an unknown or missing column is reported and nothing is imported", () => {
    const r = parseMeasuresCsv("hs_code,destination_country,name,rate_pct\n8523,India,Basic customs duty,5", TODAY);
    assert.match(messages(r), /Unknown column "rate_pct"/);
    assert.match(messages(r), /Missing required column "rate_percent"/);
    assert.equal(r.rows.length, 0);
  });

  test("M16 too many values on a row (unquoted comma) is reported", () => {
    assert.match(messages(measures("8523,China,India,Basic customs duty,,,5,,,,note, with comma,,,")), /comma inside a value/);
  });

  test("M17 an empty file and a header-only file are reported", () => {
    assert.match(messages(parseMeasuresCsv("", TODAY)), /empty/);
    assert.match(messages(parseMeasuresCsv(H, TODAY)), /no data rows/);
  });

  test("M18 one bad row does not hide the good rows, and errors carry line numbers", () => {
    const r = measures(
      "8523,China,India,Basic customs duty,,,5,,,,,,,",
      "85,China,India,Basic customs duty,,,5,,,,,,,"
    );
    assert.equal(r.rows.length, 1);
    assert.equal(r.errors[0].line, 3);
  });
});

describe("restrictions", () => {
  const RH = "hs_code,origin_country,destination_country,status,note,verified,source_url,effective_from,effective_to,reviewed_on";
  const restrictions = (...lines: string[]) => parseRestrictionsCsv([RH, ...lines].join("\n"), TODAY);

  test("R1 a valid prohibition is accepted", () => {
    const r = restrictions("8806,,India,prohibited,Import is prohibited under DGFT policy,,,,,");
    assert.equal(r.errors.length, 0, messages(r));
    assert.equal(r.rows[0].status, "prohibited");
    assert.equal(r.rows[0].originCountry, null);
  });

  test("R2 note, status and HS length are required", () => {
    const r = restrictions("88,,India,banned,,,,,,");
    const m = messages(r);
    assert.match(m, /4 digits/);
    assert.match(m, /status must be/);
    assert.match(m, /note is required/);
  });

  test("R3 verified restrictions need a source and a review date", () => {
    const m = messages(restrictions("8806,,India,prohibited,Some note,true,,,,"));
    assert.match(m, /source_url/);
    assert.match(m, /reviewed_on/);
  });

  test("R4 duplicates are rejected", () => {
    const r = restrictions(
      "8806,,India,prohibited,One,,,,,",
      "8806,,India,prohibited,Two,,,,,"
    );
    assert.match(messages(r), /Duplicates line 2/);
  });
});