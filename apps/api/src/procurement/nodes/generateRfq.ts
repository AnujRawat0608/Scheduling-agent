import { ChatGroq } from "@langchain/groq";
import type { ProcurementStateType, FulfillmentLeg } from "../state.js";

const llm = new ChatGroq({ model: "openai/gpt-oss-20b", temperature: 0.3 });

function legKey(leg: FulfillmentLeg): string {
  return leg.supplierId ?? leg.supplierName;
}

function fallbackRfq(leg: FulfillmentLeg, requiredBy?: string): string {
  const itemLines = leg.lineItems
    .map((li) => `- ${li.item} (qty: ${li.quantity})${li.specifications ? ` — ${li.specifications}` : ""}`)
    .join("\n");

  return `Request for Quote\n\nItems requested from ${leg.supplierName}:\n${itemLines}\n\nRequired by: ${
    requiredBy ?? "not specified"
  }\n\nPlease reply with unit price, quantity available, lead time, shipping cost, and minimum order quantity for each item.`;
}

async function generateOneRfq(leg: FulfillmentLeg, requiredBy?: string): Promise<string> {
  try {
    const response = await llm.invoke([
      {
        role: "system",
        content:
          "Write a short, professional Request for Quote (RFQ) email to a supplier, covering potentially multiple line items. Plain text, no markdown. Ask for unit price, quantity available, lead time, shipping cost, and MOQ for each item. Do not invent any numbers not given to you.",
      },
      {
        role: "user",
        content: JSON.stringify({ supplierName: leg.supplierName, lineItems: leg.lineItems, requiredBy }),
      },
    ]);

    const text = typeof response.content === "string" ? response.content.trim() : "";
    return text.length > 0 ? text : fallbackRfq(leg, requiredBy);
  } catch {
    return fallbackRfq(leg, requiredBy);
  }
}

export async function generateRfq(state: ProcurementStateType) {
  const { request, recommendedPlan } = state;

  if (!recommendedPlan || recommendedPlan.legs.length === 0) {
    return {
      status: "failed" as const,
      failureReason: "No recommended plan available to generate RFQs from.",
    };
  }

  const entries = await Promise.all(
    recommendedPlan.legs.map(async (leg) => {
      const text = await generateOneRfq(leg, request.requiredBy);
      return [legKey(leg), text] as const;
    })
  );

  const rfqEmails = Object.fromEntries(entries);

  return { rfqEmails, status: "purchasing" as const };
}