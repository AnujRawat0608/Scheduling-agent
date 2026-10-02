import { Router } from "express";
import { db } from "../db/client.js";
import { fxRates } from "../db/supplyChainSchema.js";

export const fxRatesRouter = Router();

/**
 * GET /api/fx-rates
 * Public: exchange rates are not sensitive. Returns how many units of each
 * currency equal 1 USD, plus when the OLDEST rate was fetched, so the UI can
 * show how fresh the numbers are.
 */
fxRatesRouter.get("/fx-rates", async (_req, res) => {
  try {
    const rows = await db.select().from(fxRates);
    if (rows.length === 0) {
      return res.status(503).json({ error: "Exchange rates are not available yet" });
    }

    const rates: Record<string, number> = {};
    let oldest = rows[0].fetchedAt;
    for (const r of rows) {
      rates[r.currency] = Number(r.perUsd);
      if (r.fetchedAt < oldest) oldest = r.fetchedAt;
    }

    // Rates only change a few times a day, so browsers may reuse this for 5 minutes.
    res.set("Cache-Control", "public, max-age=300");
    res.json({ base: "USD", rates, fetchedAt: oldest.toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load exchange rates" });
  }
});