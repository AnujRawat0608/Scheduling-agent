import { ChatGroq } from "@langchain/groq";
import type { ProcurementStateType } from "../state.js";

const llm = new ChatGroq({ model: "openai/gpt-oss-20b", temperature: 0.3 });

function fallbackRfq(request: ProcurementStateType["request"]): string {
  return `Request for Quote\n\nItem: ${request.item}\nQuantity: ${request.quantity}\nRequired by: ${
    request.requiredBy ?? "not specified"
  }\n${request.specifications ? `Specifications: ${request.specifications}\n` : ""}\nPlease reply with unit price, quantity available, lead time, shipping cost, and minimum order quantity.`;
}

export async function generateRfq(state: ProcurementStateType) {
  const { request } = state;

  try {
    const response = await llm.invoke([
      {
        role: "system",
        content:
          "Write a short, professional Request for Quote (RFQ) email to a supplier. Plain text, no markdown. Ask for unit price, quantity available, lead time, shipping cost, and MOQ. Do not invent any numbers not given to you.",
      },
      {
        role: "user",
        content: JSON.stringify(request),
      },
    ]);

    const text = typeof response.content === "string" ? response.content.trim() : "";
    return {
      rfqEmail: text.length > 0 ? text : fallbackRfq(request),
      status: "sourcing" as const,
    };
  } catch {
    return { rfqEmail: fallbackRfq(request), status: "sourcing" as const };
  }
}