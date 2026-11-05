export type Layer = "standard" | "additional";
export type Mode = "add" | "top_up_to";
export type Basis = "cif" | "fob";

interface Scope {
  hsCode: string; // prefix; '' = all products (additional measures only)
  originCountry: string | null;
  destinationCountry: string;
  effectiveFrom: string | null; // YYYY-MM-DD
  effectiveTo: string | null;
}

export interface TariffMeasure extends Scope {
  name: string;
  layer: Layer;
  mode: Mode;
  ratePercent: number;
  valuationBasis: Basis;
  verified: boolean;
  sourceUrl: string | null;
  sourceNote: string | null;
}

export interface ImportRestriction extends Scope {
  status: "permit_required" | "prohibited";
  note: string;
  verified: boolean;
  sourceUrl: string | null;
}

export interface DutyInput {
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  goodsValue: number;
  shipping?: number;
  insurance?: number;
}

export interface DutyComponent {
  name: string;
  layer: Layer;
  mode: Mode;
  ratePercent: number; // as published
  appliedRatePercent: number; // after a top-up is worked out
  dutiableValue: number;
  amount: number;
  verified: boolean;
  source: string | null;
  sourceUrl: string | null;
}

export interface RestrictionNote {
  status: "permit_required" | "prohibited";
  note: string;
  verified: boolean;
  sourceUrl: string | null;
}

export type DutyEstimate =
  | { status: "domestic" }
  | { status: "prohibited"; restrictions: RestrictionNote[] }
  | { status: "not_estimated"; reason: string; restrictions: RestrictionNote[] }
  | {
      status: "estimated";
      dutyAmount: number;
      effectiveRatePercent: number; // duty as a % of the goods value
      components: DutyComponent[];
      allVerified: boolean;
      restrictions: RestrictionNote[];
      assumptions: string[];
    };

const norm = (s: string) => s.trim().toLowerCase();
const digitsOnly = (s: string) => s.replace(/\D/g, "");
const round2 = (n: number) => Math.round(n * 100) / 100;

function matches(r: Scope, input: DutyInput, hs: string, today: string): boolean {
  return (
    norm(r.destinationCountry) === norm(input.destinationCountry) &&
    hs.startsWith(digitsOnly(r.hsCode)) &&
    (r.originCountry === null || norm(r.originCountry) === norm(input.originCountry)) &&
    (!r.effectiveFrom || r.effectiveFrom <= today) &&
    (!r.effectiveTo || r.effectiveTo >= today)
  );
}

const specificity = (r: Scope) => digitsOnly(r.hsCode).length * 10 + (r.originCountry !== null ? 1 : 0);

/** One measure per name: the most specific match (longest HS prefix, origin-specific, newest). */
function pickMeasures(all: TariffMeasure[], input: DutyInput, hs: string, today: string): TariffMeasure[] {
  const best = new Map<string, TariffMeasure>();
  for (const m of all) {
    if (!matches(m, input, hs, today)) continue;
    const key = `${m.layer}|${norm(m.name)}`;
    const cur = best.get(key);
    const better =
      !cur ||
      specificity(m) > specificity(cur) ||
      (specificity(m) === specificity(cur) && (m.effectiveFrom ?? "") > (cur.effectiveFrom ?? ""));
    if (better) best.set(key, m);
  }
  return [...best.values()];
}

export function estimateDuty(
  measures: TariffMeasure[],
  restrictions: ImportRestriction[],
  input: DutyInput,
  now = new Date()
): DutyEstimate {
  if (norm(input.originCountry) === norm(input.destinationCountry)) return { status: "domestic" };

  const hs = digitsOnly(input.hsCode);
  if (hs.length < 4) {
    return { status: "not_estimated", reason: "Enter an HS code with at least 4 digits.", restrictions: [] };
  }
  const goods = input.goodsValue;
  const shipping = input.shipping ?? 0;
  const insurance = input.insurance ?? 0;
  if ([goods, shipping, insurance].some((n) => !Number.isFinite(n) || n < 0)) {
    return { status: "not_estimated", reason: "Values must be zero or more.", restrictions: [] };
  }

  const today = now.toISOString().slice(0, 10);

  const notes: RestrictionNote[] = restrictions
    .filter((r) => matches(r, input, hs, today))
    .map((r) => ({ status: r.status, note: r.note, verified: r.verified, sourceUrl: r.sourceUrl }));

  // A prohibited import has no meaningful duty figure.
  if (notes.some((n) => n.status === "prohibited")) return { status: "prohibited", restrictions: notes };

  const chosen = pickMeasures(measures, input, hs, today);
  const standard = chosen.filter((m) => m.layer === "standard");
  if (standard.length === 0) {
    return {
      status: "not_estimated",
      reason: "No standard duty rate on file for this product and route.",
      restrictions: notes,
    };
  }

  const baseRate = standard.reduce((sum, m) => sum + m.ratePercent, 0);

  const components: DutyComponent[] = [...standard, ...chosen.filter((m) => m.layer === "additional")].map((m) => {
    // A top-up raises the standard total to its rate, so it only adds the shortfall.
    const applied = m.mode === "top_up_to" ? Math.max(0, m.ratePercent - baseRate) : m.ratePercent;
    const dutiable = m.valuationBasis === "cif" ? goods + shipping + insurance : goods;
    return {
      name: m.name,
      layer: m.layer,
      mode: m.mode,
      ratePercent: m.ratePercent,
      appliedRatePercent: applied,
      dutiableValue: round2(dutiable),
      amount: round2((dutiable * applied) / 100),
      verified: m.verified,
      source: m.sourceNote,
      sourceUrl: m.sourceUrl,
    };
  });

  const dutyAmount = round2(components.reduce((sum, c) => sum + c.amount, 0));
  const assumptions = [
    "Customs duty and the listed surcharges only. Import VAT/GST and other taxes are not included.",
    "Estimate for planning. The final amount is set by customs.",
  ];
  if (components.some((c) => c.mode === "top_up_to")) {
    assumptions.splice(1, 0, "A top-up measure raises the standard duty to its rate. It adds nothing if the standard duty already reaches it.");
  }

  return {
    status: "estimated",
    dutyAmount,
    effectiveRatePercent: goods > 0 ? round2((dutyAmount / goods) * 100) : 0,
    components,
    allVerified: components.every((c) => c.verified),
    restrictions: notes,
    assumptions,
  };
}