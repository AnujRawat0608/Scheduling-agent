import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  estimateDuty,
  type TariffMeasure,
  type ImportRestriction,
  type DutyEstimate,
} from "./estimateDuty.js";

/* ---------- fixtures ----------
 * All HS codes start with 000x, which is not a real chapter, so these can never be
 * mistaken for real rates. All rates are invented for testing. */

const NOW = new Date("2026-11-06T12:00:00Z");

function measure(p: Partial<TariffMeasure> & Pick<TariffMeasure, "hsCode" | "name" | "ratePercent">): TariffMeasure {
  return {
    originCountry: null,
    destinationCountry: "India",
    layer: "standard",
    mode: "add",
    valuationBasis: "cif",
    verified: false,
    sourceUrl: null,
    sourceNote: "TEST ONLY",
    effectiveFrom: null,
    effectiveTo: null,
    reviewedOn: null,
    ...p,
  };
}

function restriction(p: Partial<ImportRestriction> & Pick<ImportRestriction, "hsCode" | "status">): ImportRestriction {
  return {
    originCountry: null,
    destinationCountry: "India",
    note: "TEST ONLY",
    verified: false,
    sourceUrl: null,
    effectiveFrom: null,
    effectiveTo: null,
    reviewedOn: null,
    ...p,
  };
}

const MEASURES: TariffMeasure[] = [
  // 0001: standard 5% + top-up to 10%  -> 55 + 55 on 1,100
  measure({ hsCode: "0001", name: "Basic customs duty", ratePercent: 5, originCountry: "China" }),
  measure({ hsCode: "0001", name: "Test surcharge", layer: "additional", mode: "top_up_to", ratePercent: 10, originCountry: "China" }),

  // 0002: standard 12% + top-up to 10% -> top-up adds nothing
  measure({ hsCode: "0002", name: "Basic customs duty", ratePercent: 12, originCountry: "China" }),
  measure({ hsCode: "0002", name: "Test surcharge", layer: "additional", mode: "top_up_to", ratePercent: 10, originCountry: "China" }),

  // 0003: two standard components that are summed
  measure({ hsCode: "0003", name: "Basic customs duty", ratePercent: 7.5 }),
  measure({ hsCode: "0003", name: "Test welfare surcharge", ratePercent: 2.5 }),

  // 0004: origin-specific beats any-origin
  measure({ hsCode: "0004", name: "Basic customs duty", ratePercent: 20 }),
  measure({ hsCode: "0004", name: "Basic customs duty", ratePercent: 5, originCountry: "China" }),

  // 0005: longest HS prefix wins
  measure({ hsCode: "0005", name: "Basic customs duty", ratePercent: 15 }),
  measure({ hsCode: "000510", name: "Basic customs duty", ratePercent: 3 }),

  // 0006: FOB basis ignores shipping and insurance
  measure({ hsCode: "0006", name: "Basic customs duty", ratePercent: 10, valuationBasis: "fob" }),

  // 0007: expired / not yet effective / currently effective
  measure({ hsCode: "0007", name: "Basic customs duty", ratePercent: 9, effectiveTo: "2026-11-05" }),
  measure({ hsCode: "0071", name: "Basic customs duty", ratePercent: 9, effectiveFrom: "2026-11-07" }),
  measure({ hsCode: "0072", name: "Basic customs duty", ratePercent: 9, effectiveFrom: "2026-11-06", effectiveTo: "2026-11-06" }),

  // 0008: permit required, estimate still shown
  measure({ hsCode: "0008", name: "Basic customs duty", ratePercent: 4 }),

  // 0009: prohibited even though a rate exists
  measure({ hsCode: "0009", name: "Basic customs duty", ratePercent: 4 }),

  // 0010: global surcharge (empty HS) applies on top of a standard rate, Vietnam origin only
  measure({ hsCode: "0010", name: "Basic customs duty", ratePercent: 4 }),
  measure({ hsCode: "", name: "Test global surcharge", layer: "additional", ratePercent: 2, originCountry: "Vietnam" }),

  // 0011: only a surcharge, no standard duty on file
  measure({ hsCode: "0011", name: "Test surcharge only", layer: "additional", ratePercent: 5 }),

  // 0012: verified and unverified mix
  measure({ hsCode: "0012", name: "Basic customs duty", ratePercent: 6, verified: true }),
  measure({ hsCode: "0013", name: "Basic customs duty", ratePercent: 6, verified: true }),

  // 0014: rounding
  measure({ hsCode: "0014", name: "Basic customs duty", ratePercent: 7.5 }),

  // Staleness (NOW is 2026-11-06; standard limit 90 days, surcharge limit 30 days)
  measure({ hsCode: "0020", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-08-01" }), // 97 days: stale
  measure({ hsCode: "0021", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-09-01" }), // 66 days: fresh
  measure({ hsCode: "0022", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-11-01" }),
  measure({ hsCode: "0022", name: "Test surcharge", layer: "additional", ratePercent: 2, verified: true, reviewedOn: "2026-09-30" }), // 37 days: stale
  measure({ hsCode: "0023", name: "Basic customs duty", ratePercent: 5, verified: false, reviewedOn: "2025-01-01" }), // unverified: not "stale"
  measure({ hsCode: "0024", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: null }), // verified without a date: stale
  measure({ hsCode: "0025", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-11-01" }),
  measure({ hsCode: "0026", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-08-08" }), // exactly 90 days: fresh
  measure({ hsCode: "0027", name: "Basic customs duty", ratePercent: 5, verified: true, reviewedOn: "2026-08-07" }), // 91 days: stale

  // A different destination must never leak into India results
  measure({ hsCode: "0001", name: "Basic customs duty", ratePercent: 99, destinationCountry: "United States", originCountry: "China" }),
];

const RESTRICTIONS: ImportRestriction[] = [
  restriction({ hsCode: "0008", status: "permit_required", note: "TEST permit note" }),
  restriction({ hsCode: "0009", status: "prohibited", note: "TEST prohibited note" }),
  restriction({ hsCode: "0015", status: "prohibited", originCountry: "Taiwan", note: "TEST Taiwan-only ban" }),
  restriction({ hsCode: "0016", status: "prohibited", effectiveTo: "2026-11-05", note: "TEST expired ban" }),
  restriction({ hsCode: "0016", status: "permit_required", note: "TEST permit note" }),
  restriction({ hsCode: "0025", status: "permit_required", verified: true, reviewedOn: "2026-01-01" }), // 309 days: stale
];

function run(hsCode: string, origin: string, goods: number, shipping = 0, insurance = 0, destination = "India"): DutyEstimate {
  return estimateDuty(
    MEASURES,
    RESTRICTIONS,
    { hsCode, originCountry: origin, destinationCountry: destination, goodsValue: goods, shipping, insurance },
    NOW
  );
}

function estimated(r: DutyEstimate) {
  assert.equal(r.status, "estimated", `expected "estimated" but got "${r.status}"`);
  return r as Extract<DutyEstimate, { status: "estimated" }>;
}

describe("layered measures", () => {
  test("T1 standard 5% plus top-up to 10% gives 110 on 1,100", () => {
    const r = estimated(run("0001.51", "China", 1000, 100));
    assert.equal(r.dutyAmount, 110);
    assert.equal(r.effectiveRatePercent, 11);
    assert.equal(r.components.length, 2);
    assert.equal(r.components[0].amount, 55);
    assert.equal(r.components[1].appliedRatePercent, 5);
    assert.equal(r.components[1].amount, 55);
  });

  test("T2 top-up adds nothing when the standard duty already reaches it", () => {
    const r = estimated(run("0002", "China", 1000, 100));
    assert.equal(r.dutyAmount, 132);
    assert.equal(r.effectiveRatePercent, 13.2);
    assert.equal(r.components[1].appliedRatePercent, 0);
    assert.equal(r.components[1].amount, 0);
  });

  test("T3 two standard components are summed", () => {
    const r = estimated(run("0003", "China", 1000, 100));
    assert.equal(r.components.length, 2);
    assert.equal(r.dutyAmount, 110);
  });

  test("T4 a global surcharge (empty HS) applies on top of the standard duty", () => {
    const r = estimated(run("0010", "Vietnam", 1000, 0));
    assert.equal(r.components.length, 2);
    assert.equal(r.dutyAmount, 60); // 4% + 2% of 1,000
  });

  test("T5 the global surcharge does not apply to another origin", () => {
    const r = estimated(run("0010", "Taiwan", 1000, 0));
    assert.equal(r.components.length, 1);
    assert.equal(r.dutyAmount, 40);
  });
});

describe("which measure wins", () => {
  test("T6 origin-specific rate beats the any-origin rate", () => {
    assert.equal(estimated(run("0004", "China", 1000)).dutyAmount, 50);
  });

  test("T7 any-origin rate is used for other origins", () => {
    assert.equal(estimated(run("0004", "Taiwan", 1000)).dutyAmount, 200);
  });

  test("T8 the longest HS prefix wins", () => {
    assert.equal(estimated(run("0005.10.20", "China", 1000)).dutyAmount, 30);
    assert.equal(estimated(run("0005.90", "China", 1000)).dutyAmount, 150);
  });

  test("T9 HS codes with dots and spaces still match", () => {
    assert.equal(estimated(run(" 0005 10 20 ", "China", 1000)).dutyAmount, 30);
  });

  test("T10 rates for another destination never apply", () => {
    // The US row for 0001 is 99%. India must still get 110, and the US gets its own row.
    assert.equal(estimated(run("0001", "China", 1000, 100)).dutyAmount, 110);
    assert.equal(estimated(run("0001", "China", 1000, 100, 0, "United States")).dutyAmount, 1089);
  });

  test("T11 country names are matched ignoring case and spaces", () => {
    assert.equal(estimated(run("0004", "  china ", 1000)).dutyAmount, 50);
  });
});

describe("valuation basis", () => {
  test("T12 CIF includes shipping and insurance", () => {
    const r = estimated(run("0003", "China", 1000, 100, 50));
    assert.equal(r.components[0].dutiableValue, 1150);
  });

  test("T13 FOB uses the goods value only", () => {
    const r = estimated(run("0006", "China", 1000, 100, 50));
    assert.equal(r.components[0].dutiableValue, 1000);
    assert.equal(r.dutyAmount, 100);
  });
});

describe("dates", () => {
  test("T14 an expired measure is ignored", () => {
    assert.equal(run("0007", "China", 1000).status, "not_estimated");
  });

  test("T15 a measure that starts tomorrow is ignored", () => {
    assert.equal(run("0071", "China", 1000).status, "not_estimated");
  });

  test("T16 a measure that is effective today (both ends) applies", () => {
    assert.equal(estimated(run("0072", "China", 1000)).dutyAmount, 90);
  });
});

describe("restrictions", () => {
  test("T17 a prohibited import returns no duty number", () => {
    const r = run("0009", "China", 1000);
    assert.equal(r.status, "prohibited");
    assert.equal("dutyAmount" in r, false);
  });

  test("T18 permit required still returns an estimate, with the note attached", () => {
    const r = estimated(run("0008", "China", 1000));
    assert.equal(r.dutyAmount, 40);
    assert.equal(r.restrictions.length, 1);
    assert.equal(r.restrictions[0].status, "permit_required");
  });

  test("T19 a restriction for a different origin does not apply", () => {
    const r = run("0015", "China", 1000);
    assert.equal(r.status, "not_estimated"); // no rate on file, and no ban for China
    assert.equal(r.status === "not_estimated" && r.restrictions.length, 0);
  });

  test("T20 the same restriction applies to its own origin", () => {
    assert.equal(run("0015", "Taiwan", 1000).status, "prohibited");
  });

  test("T21 an expired ban is ignored but the current permit note still shows", () => {
    const r = run("0016", "China", 1000);
    assert.equal(r.status, "not_estimated");
    assert.equal(r.status === "not_estimated" && r.restrictions.length, 1);
    assert.equal(r.status === "not_estimated" && r.restrictions[0].status, "permit_required");
  });
});

describe("cases with no estimate", () => {
  test("T22 same country is domestic (case-insensitive)", () => {
    assert.deepEqual(run("0001", "india", 1000), { status: "domestic" });
  });

  test("T23 an unknown HS code is not estimated, never zero", () => {
    const r = run("0099", "China", 1000);
    assert.equal(r.status, "not_estimated");
    assert.equal(r.status === "not_estimated" && /No standard duty rate/.test(r.reason), true);
  });

  test("T24 a surcharge alone is not enough without a standard duty", () => {
    assert.equal(run("0011", "China", 1000).status, "not_estimated");
  });

  test("T25 HS codes shorter than 4 digits are rejected", () => {
    const r = run("85", "China", 1000);
    assert.equal(r.status, "not_estimated");
    assert.equal(r.status === "not_estimated" && /4 digits/.test(r.reason), true);
  });

  test("T26 negative or non-numeric values are rejected", () => {
    assert.equal(run("0001", "China", -1).status, "not_estimated");
    assert.equal(run("0001", "China", 1000, -5).status, "not_estimated");
    assert.equal(run("0001", "China", Number.NaN).status, "not_estimated");
  });
});

describe("verification and rounding", () => {
  test("T27 allVerified is false when any measure is unverified", () => {
    assert.equal(estimated(run("0001", "China", 1000)).allVerified, false);
  });

  test("T28 allVerified is true only when every measure is verified", () => {
    assert.equal(estimated(run("0012", "China", 1000)).allVerified, true);
    assert.equal(estimated(run("0013", "China", 1000)).allVerified, true);
  });

  test("T29 amounts are rounded to 2 decimals", () => {
    const r = estimated(run("0014", "China", 333.33));
    assert.equal(r.dutyAmount, 25); // 24.99975 rounds to 25.00
  });

  test("T30 a zero goods value gives zero duty and no divide-by-zero", () => {
    const r = estimated(run("0003", "China", 0));
    assert.equal(r.dutyAmount, 0);
    assert.equal(r.effectiveRatePercent, 0);
  });
});

describe("stale checks", () => {
  test("T31 a verified rate checked 97 days ago is stale", () => {
    const r = estimated(run("0020", "China", 1000));
    assert.equal(r.components[0].stale, true);
    assert.equal(r.anyStale, true);
  });

  test("T32 a verified rate checked 66 days ago is fresh", () => {
    const r = estimated(run("0021", "China", 1000));
    assert.equal(r.components[0].stale, false);
    assert.equal(r.anyStale, false);
  });

  test("T33 surcharges go stale after 30 days, base duties after 90", () => {
    const r = estimated(run("0022", "China", 1000));
    assert.equal(r.components[0].stale, false); // base duty, 5 days old
    assert.equal(r.components[1].stale, true); // surcharge, 37 days old
    assert.equal(r.anyStale, true);
  });

  test("T34 an unverified rate is never reported as stale", () => {
    const r = estimated(run("0023", "China", 1000));
    assert.equal(r.components[0].stale, false);
    assert.equal(r.allVerified, false);
  });

  test("T35 a verified rate with no review date counts as stale", () => {
    assert.equal(estimated(run("0024", "China", 1000)).components[0].stale, true);
  });

  test("T36 a stale restriction note marks the estimate as stale", () => {
    const r = estimated(run("0025", "China", 1000));
    assert.equal(r.components[0].stale, false);
    assert.equal(r.restrictions[0].stale, true);
    assert.equal(r.anyStale, true);
  });

  test("T37 the limit is inclusive: 90 days is fresh, 91 is stale", () => {
    assert.equal(estimated(run("0026", "China", 1000)).components[0].stale, false);
    assert.equal(estimated(run("0027", "China", 1000)).components[0].stale, true);
  });
});