import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { formatISO } from "date-fns";
import type { ProcurementStateType } from "../state.js";

const ExtractedRequest = z.object({
  item: z.string().describe("The product or part being requested, e.g. 'Raspberry Pi 5'"),
  quantity: z.number().describe("Number of units requested"),
  requiredBy: z
    .string()
    .nullable()
    .describe("ISO 8601 date the items are needed by, if mentioned"),
  specifications: z
    .string()
    .nullable()
    .describe("Any stated specs, model variant, or constraints, e.g. '8GB RAM variant'"),
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
      content: `Extract a structured procurement request from the text. Today's date is ${today} — resolve relative dates against it.`,
    },
    { role: "user", content: text },
  ]);
}