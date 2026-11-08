import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { tariffMeasures, importRestrictions } from "../db/tariffSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";
import { estimateDuty, type TariffMeasure, type ImportRestriction } from "../tariff/estimateDuty.js";

export const tariffRouter = Router();

const str = (v: unknown, max = 100) => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const num = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));

tariffRouter.post("/tariff/estimate", requireProcurerAuth, async (req, res) => {
  try {
    const { hsCode, originCountry, destinationCountry, goodsValue, shipping, insurance } = req.body ?? {};
    const hs = str(hsCode, 20);
    const origin = str(originCountry);
    const dest = str(destinationCountry);
    if (!hs || !origin || !dest) {
      return res.status(400).json({ error: "hsCode, originCountry and destinationCountry are required" });
    }

    const destLower = dest.toLowerCase();
    const [measureRows, restrictionRows] = await Promise.all([
      db.select().from(tariffMeasures).where(sql`lower(${tariffMeasures.destinationCountry}) = ${destLower}`),
      db.select().from(importRestrictions).where(sql`lower(${importRestrictions.destinationCountry}) = ${destLower}`),
    ]);

    const measures: TariffMeasure[] = measureRows.map((r) => ({
      name: r.name,
      layer: r.layer === "additional" ? "additional" : "standard",
      mode: r.mode === "top_up_to" ? "top_up_to" : "add",
      hsCode: r.hsCode,
      originCountry: r.originCountry,
      destinationCountry: r.destinationCountry,
      ratePercent: Number(r.ratePercent),
      valuationBasis: r.valuationBasis === "fob" ? "fob" : "cif",
      verified: r.verified,
      sourceUrl: r.sourceUrl,
      sourceNote: r.sourceNote,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      reviewedOn: r.reviewedOn,
    }));

    const restrictions: ImportRestriction[] = restrictionRows.map((r) => ({
      hsCode: r.hsCode,
      originCountry: r.originCountry,
      destinationCountry: r.destinationCountry,
      status: r.status === "prohibited" ? "prohibited" : "permit_required",
      note: r.note,
      verified: r.verified,
      sourceUrl: r.sourceUrl,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      reviewedOn: r.reviewedOn,
    }));

    res.json(
      estimateDuty(measures, restrictions, {
        hsCode: hs,
        originCountry: origin,
        destinationCountry: dest,
        goodsValue: num(goodsValue),
        shipping: num(shipping),
        insurance: num(insurance),
      })
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not estimate duty" });
  }
});