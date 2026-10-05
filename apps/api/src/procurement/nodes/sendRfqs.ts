import type { ProcurementStateType, RfqResult } from "../state.js";
import { createAgentRfq } from "../lib/createAgentRfq.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUsableEmail(e: string | undefined | null): e is string {
  return !!e && EMAIL_RE.test(e) && !e.toLowerCase().endsWith(".local");
}

/**
 * The address suppliers and the RFQ email show as the buyer's contact. PROCUREMENT_REPLY_TO
 * (a shared mailbox) wins; otherwise the logged-in buyer's own address. Placeholder addresses
 * such as team@procurement.local are rejected, because replies to them would silently go nowhere.
 */
function resolveReplyAddress(requesterEmail: string | undefined): string | null {
  const candidates = [process.env.PROCUREMENT_REPLY_TO?.trim(), requesterEmail?.trim()];
  return candidates.find(isUsableEmail) ?? null;
}

export async function sendRfqs(state: ProcurementStateType) {
  const { request, recommendedPlan, taskId } = state;

  if (!recommendedPlan || recommendedPlan.legs.length === 0) {
    return { status: "failed" as const, failureReason: "No approved plan to send RFQs for." };
  }

  // Only real, priced catalog suppliers can be contacted.
  const unsafeLeg = recommendedPlan.legs.find(
    (leg) => !leg.supplierId || leg.quotes.some((q) => q.simulated || q.totalCost === null)
  );
  if (unsafeLeg) {
    return {
      status: "failed" as const,
      failureReason: `Cannot contact ${unsafeLeg.supplierName}: it is not a verified catalog supplier or has no valid price.`,
    };
  }

  const replyTo = resolveReplyAddress(request.requesterEmail);
  if (!replyTo) {
    const envSet = Boolean(process.env.PROCUREMENT_REPLY_TO?.trim());
    return {
      status: "failed" as const,
      failureReason:
        `No valid reply-to address. PROCUREMENT_REPLY_TO is ${envSet ? "set but not a valid address" : "not set"}, ` +
        `and the requester email "${request.requesterEmail ?? ""}" is missing or a placeholder. ` +
        `Set PROCUREMENT_REPLY_TO on the server, or sign in with a real email.`,
    };
  }

  // Don't show a placeholder address to suppliers as a person's name.
  const requesterName =
    request.requesterName && !request.requesterName.toLowerCase().endsWith(".local")
      ? request.requesterName
      : "";

  // One at a time: easy to read partial failures, and gentle on the mail server.
  const rfqResults: RfqResult[] = [];
  for (const [legIndex, leg] of recommendedPlan.legs.entries()) {
    const base = { supplierName: leg.supplierName, supplierId: leg.supplierId as string };
    try {
      const rfq = await createAgentRfq({
        taskId: String(taskId),
        procurerId: request.procurerId,
        leg,
        legIndex,
        requester: { name: requesterName, email: replyTo },
        requiredBy: request.requiredBy,
      });
      rfqResults.push({
        ...base,
        status: "sent",
        rfqId: rfq.rfqId,
        referenceNumber: rfq.referenceNumber,
        emailed: rfq.emailed,
      });
    } catch (err) {
      console.error(`Could not create RFQ for ${leg.supplierName}`, err);
      rfqResults.push({ ...base, status: "failed", error: (err as Error).message || "Unexpected error" });
    }
  }

  const failed = rfqResults.filter((r) => r.status === "failed");
  if (failed.length === 0) {
    return { rfqResults, status: "rfq_sent" as const };
  }

  // Suppliers that already got an RFQ are safe on a retry (one RFQ per task + supplier).
  const sentNames = rfqResults.filter((r) => r.status === "sent").map((r) => r.supplierName);
  return {
    rfqResults,
    status: "failed" as const,
    failureReason:
      (sentNames.length > 0 ? `RFQ sent to ${sentNames.join(", ")}. ` : "") +
      `Could not send to: ${failed.map((r) => `${r.supplierName} (${r.error})`).join("; ")}.`,
  };
}