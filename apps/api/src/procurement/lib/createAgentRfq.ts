import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rfqs } from "../../db/rfqsSchema.js";
import { suppliers } from "../../db/suppliersSchema.js";
import { sendMail, buildRfqNotificationEmail } from "../../agent/lib/mailer.js";
import type { FulfillmentLeg } from "../state.js";

/** How many days the supplier is given to send their quote (stored as the RFQ's dueDate). */
const REPLY_WITHIN_DAYS = Number(process.env.RFQ_REPLY_WITHIN_DAYS ?? 3);

export interface AgentRfqResult {
  rfqId: string;
  referenceNumber: string;
  /** true/false = an email was attempted now; undefined = the RFQ already existed, nothing was sent. */
  emailed?: boolean;
}

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
 * Creates the RFQ row (same table the manual "Send RFQ" form uses, so the supplier sees it in
 * their dashboard like any other) and emails the supplier.
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

  // legsFromAssignment pushes lineItems and quotes in the same order, so index i matches.
  const lineItems = leg.lineItems.map((li, i) => {
    const quote = leg.quotes[i];
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
    };
  });

  const first = leg.quotes[0];
  const notes = first
    ? oneLine(
        `Raised automatically by the procurement agent. Based on your listed price of ${first.currency} ${first.unitPrice} per unit and ${first.leadTimeDays} day lead time. Please confirm availability and your final price.`,
        500
      )
    : "Raised automatically by the procurement agent.";

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
        currency: first?.currency ?? null,
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

  // The RFQ is saved and visible in the supplier's dashboard either way. Email is best effort.
  let emailed = false;
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
      await sendMail({ to: supplier.email, subject, html, text });
      emailed = true;
    } catch (mailErr) {
      console.error(`RFQ email for ${rfq.id} failed`, mailErr);
    }
  }

  return { rfqId: rfq.id, referenceNumber: rfq.referenceNumber, emailed };
}