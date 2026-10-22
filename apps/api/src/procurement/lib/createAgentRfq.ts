import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rfqs } from "../../db/rfqsSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { procurementTasks } from "../../db/procurementSchema.js";
import { buildRfqNotificationEmail } from "../../agent/lib/mailer.js";
import { sendMailBounded } from "../../agent/lib/mailSafe.js";
import { getRates } from "./fx.js";
import { convert, type RateTable } from "./fxMath.js";
import type { FulfillmentLeg } from "../state.js";

/** How many days the supplier is given to send their quote (stored as the RFQ's dueDate). */
const REPLY_WITHIN_DAYS = Number(process.env.RFQ_REPLY_WITHIN_DAYS ?? 3);

export interface AgentRfqResult {
  rfqId: string;
  referenceNumber: string;
  /**
   * true = the email was sent, false = it failed. undefined = the RFQ already existed (nothing was
   * sent now), or the email was still pending when we stopped waiting for it.
   */
  emailed?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Single line, capped: buyer-supplied text ends up in a record and email seen by an outside company. */
function oneLine(text: string | undefined | null, max = 200): string {
  return (text ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

/** Date-only strings ("2026-10-12") are read as LOCAL dates so the day can't shift with timezone. */
function parseLocalDate(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * The currency the buyer had selected when they approved. The approve route saves it on the task
 * (request.rfqCurrency) before the graph resumes, so this works without changing the graph nodes.
 * null = none was chosen (older tasks), and the RFQ falls back to the supplier's own currency.
 */
async function buyerCurrencyFor(taskId: string): Promise<string | null> {
  const [task] = await db
    .select({ request: procurementTasks.request })
    .from(procurementTasks)
    .where(eq(procurementTasks.id, taskId))
    .limit(1);
  const c = (task?.request as { rfqCurrency?: unknown } | undefined)?.rfqCurrency;
  return typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : null;
}

interface PricedLine {
  unitPrice: number; // in the RFQ currency
  fxRate: number; // 1 listed-currency unit = fxRate RFQ-currency units
}

/** Converts one listed unit price. Returns null when no rate is available (never guesses). */
function convertUnitPrice(unitPrice: number, from: string, to: string, rates: RateTable | null): PricedLine | null {
  if (from === to) return { unitPrice: round2(unitPrice), fxRate: 1 };
  if (!rates) return null;
  try {
    return {
      unitPrice: round2(convert(rates, unitPrice, from, to).amount),
      fxRate: convert(rates, 1, from, to).rate,
    };
  } catch {
    return null;
  }
}

/**
 * Creates the RFQ row (same table the manual "Send RFQ" form uses, so the supplier sees it in
 * their dashboard like any other) and emails the supplier.
 *
 * The RFQ is raised in the currency the buyer selected, and each line carries a FIXED unit price:
 * the supplier's own listed price, converted at today's rate. The supplier cannot change it
 * (the quote route enforces that on the server).
 *
 * Safe to call twice for the same task + supplier: the unique index on (task_id, supplier_id)
 * guarantees one row, and an existing row is returned without sending anything again.
 */
export async function createAgentRfq(input: {
  taskId: string;
  /** The buyer who owns this RFQ, so they can see the supplier's quote later. */
  procurerId?: string;
  leg: FulfillmentLeg;
  legIndex: number;
  requester: { name: string; email: string };
  requiredBy?: string;
}): Promise<AgentRfqResult> {
  const { taskId, procurerId, leg, legIndex, requester, requiredBy } = input;
  const supplierId = leg.supplierId as string; // non-null: the caller rejects legs without one

  const [existing] = await db
    .select({ id: rfqs.id, referenceNumber: rfqs.referenceNumber })
    .from(rfqs)
    .where(and(eq(rfqs.taskId, taskId), eq(rfqs.supplierId, supplierId)))
    .limit(1);
  if (existing) return { rfqId: existing.id, referenceNumber: existing.referenceNumber };

  const [supplier] = await db
    .select({ email: suppliers.email })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) throw new Error("Supplier no longer exists");

  /* ---------- Currency and fixed unit prices ---------- */
  // legsFromAssignment pushes lineItems and quotes in the same order, so index i matches.
  const aligned = leg.quotes.length === leg.lineItems.length;
  const buyerCurrency = await buyerCurrencyFor(taskId);

  let rates: RateTable | null = null;
  if (buyerCurrency) {
    try {
      rates = await getRates();
    } catch (err) {
      console.error("RFQ: could not load exchange rates, using the supplier's own currency", err);
    }
  }

  const converted =
    buyerCurrency && aligned
      ? leg.quotes.map((q) => convertUnitPrice(q.unitPrice, q.currency, buyerCurrency, rates))
      : [];

  let rfqCurrency: string | null;
  let priced: (PricedLine | null)[];
  if (buyerCurrency && aligned && converted.length > 0 && converted.every(Boolean)) {
    // The normal case: the RFQ is in the buyer's currency.
    rfqCurrency = buyerCurrency;
    priced = converted;
  } else if (aligned && new Set(leg.quotes.map((q) => q.currency)).size === 1) {
    // No buyer currency, or no exchange rate: use the supplier's own currency, price still fixed.
    rfqCurrency = leg.quotes[0].currency;
    priced = leg.quotes.map((q) => ({ unitPrice: round2(q.unitPrice), fxRate: 1 }));
  } else {
    // Mixed listing currencies and no rate: leave prices open rather than guess.
    rfqCurrency = leg.quotes[0]?.currency ?? null;
    priced = leg.lineItems.map(() => null);
  }

  const lineItems = leg.lineItems.map((li, i) => {
    const quote = leg.quotes[i];
    const p = priced[i];
    const spec = [
      quote?.offerItem ? `Your listing: ${oneLine(quote.offerItem)}` : null,
      li.specifications ? oneLine(li.specifications) : null,
    ]
      .filter(Boolean)
      .join(". ");
    return {
      productName: oneLine(li.item),
      specification: spec || null,
      unit: "units",
      quantity: li.quantity,
      // Present only when the price is fixed. The quote form and the quote route both read these.
      ...(p && quote
        ? {
            unitPrice: p.unitPrice,
            listedUnitPrice: round2(quote.unitPrice),
            listedCurrency: quote.currency,
            fxRate: p.fxRate,
          }
        : {}),
    };
  });

  const first = leg.quotes[0];
  const firstPriced = priced[0];
  let priceNote: string;
  if (first && firstPriced && rfqCurrency && first.currency !== rfqCurrency) {
    priceNote = `Unit price is fixed at ${rfqCurrency} ${firstPriced.unitPrice} (your listed price of ${first.currency} ${round2(first.unitPrice)} converted at 1 ${first.currency} = ${firstPriced.fxRate} ${rfqCurrency}).`;
  } else if (first && firstPriced) {
    priceNote = `Unit price is fixed at your listed price of ${rfqCurrency} ${firstPriced.unitPrice}.`;
  } else {
    priceNote = "Please quote your unit price.";
  }
  const notes = oneLine(
    `Raised automatically by the procurement agent. ${priceNote}${first ? ` Your listed lead time is ${first.leadTimeDays} days.` : ""} Please confirm availability and lead time.`,
    500
  );

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + REPLY_WITHIN_DAYS);

  let rfq;
  try {
    [rfq] = await db
      .insert(rfqs)
      .values({
        supplierId,
        taskId,
        procurerId: procurerId ?? null,
        referenceNumber: `RFQ-${taskId.slice(0, 8).toUpperCase()}-${legIndex + 1}`,
        requesterName: oneLine(requester.name) || "Procurement team",
        requesterEmail: requester.email,
        status: "sent",
        currency: rfqCurrency,
        dueDate,
        requiredDeliveryDate: parseLocalDate(requiredBy),
        lineItems,
        notes,
      })
      .returning();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // A parallel run created it first; use that one and send nothing.
    const [again] = await db
      .select({ id: rfqs.id, referenceNumber: rfqs.referenceNumber })
      .from(rfqs)
      .where(and(eq(rfqs.taskId, taskId), eq(rfqs.supplierId, supplierId)))
      .limit(1);
    if (!again) throw err;
    return { rfqId: again.id, referenceNumber: again.referenceNumber };
  }

  // The RFQ is saved and visible in the supplier's dashboard either way. Email is best effort
  // and never holds up the purchase for more than a few seconds.
  let emailed: boolean | undefined;
  if (supplier.email) {
    try {
      const { subject, html, text } = buildRfqNotificationEmail({
        referenceNumber: rfq.referenceNumber,
        requesterName: rfq.requesterName,
        requesterEmail: rfq.requesterEmail,
        dueDate: rfq.dueDate,
        currency: rfq.currency,
        lineItems,
      });
      const outcome = await sendMailBounded({ to: supplier.email, subject, html, text });
      emailed = outcome === "sent" ? true : outcome === "failed" ? false : undefined;
    } catch (mailErr) {
      console.error(`RFQ email for ${rfq.id} could not be prepared`, mailErr);
      emailed = false;
    }
  }

  return { rfqId: rfq.id, referenceNumber: rfq.referenceNumber, emailed };
}