import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { formatISO } from "date-fns";

const LineItemSchema = z.object({
  item: z.string().describe("The product or part being requested, e.g. 'Raspberry Pi 5'"),
  quantity: z.number().describe("Number of units requested for this item"),
  specifications: z
    .string()
    .nullable()
    .describe("Any stated specs, model variant, or constraints for this specific item"),
});

const ExtractedRequest = z.object({
  lineItems: z.array(LineItemSchema).describe(
    "Every distinct product/part requested. If the person asks for multiple different items, return one entry per item — do not merge them into one."
  ),
  requiredBy: z
    .string()
    .nullable()
    .describe("ISO 8601 date the items are needed by, if mentioned — applies to the whole request"),
});

const llm = new ChatGroq({
  model: "openai/gpt-oss-20b",
  temperature: 0,
}).withStructuredOutput(ExtractedRequest, { name: "extract_procurement_request" });

export async function extractProcurementRequest(text: string) {
  const today = formatISO(new Date());
  return llm.invoke([
    {
      role: "system",
      content: `Extract a structured procurement request from the text. There may be multiple distinct items requested — return each as a separate line item, never merged. Today's date is ${today} — resolve relative dates against it.

Quantity rules when multiple items are requested:
- If each item has its own stated quantity (e.g. "50 Raspberry Pi and 10 Integrated Systems"), use each item's own number.
- If a single quantity is stated up front and applies grammatically to a list of items (e.g. "50 units of Raspberry Pi and Integrated System", "we need 50 of X and Y"), apply that same quantity to every item in the list — do not default the later items to 1.
- Only use a quantity of 1 for an item if the text gives no usable quantity for it at all, and no shared quantity applies.`,
    },
    { role: "user", content: text },
  ]);
}