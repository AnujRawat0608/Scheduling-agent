import { ChatGroq } from "@langchain/groq";
import { z } from "zod";
import { formatISO } from "date-fns";

const ExtractedRequest = z.object({
  title: z.string().describe("A short, clear meeting title"),
  durationMinutes: z.number().describe("Meeting length in minutes, default 30 if unspecified"),
  attendeeEmails: z
    .array(z.string())
    .describe("Every email address mentioned in the text for people to invite"),
  earliestStart: z
    .string()
    .nullable()
    .describe("ISO 8601 date — earliest the meeting could happen, if mentioned (e.g. 'next week' -> resolve relative to today's date provided)"),
  deadline: z
    .string()
    .nullable()
    .describe("ISO 8601 date — must be scheduled by this date, if mentioned"),
  constraints: z
    .string()
    .nullable()
    .describe("Any other stated preference verbatim, e.g. 'avoid mornings', 'prefer Thursdays'"),
  avoidMornings: z
    .boolean()
    .describe("true if the text says to avoid mornings, or prefers afternoons only"),
  avoidAfternoons: z
    .boolean()
    .describe("true if the text says to avoid afternoons, or prefers mornings only"),
  meetingType: z
    .enum(["escalation", "customer_support", "sales", "interview", "internal", "general"])
    .describe(
      "Classify the meeting's nature from the text. 'escalation' = urgent issue needing priority handling. 'customer_support' = helping a customer with a problem. 'sales' = prospect/deal conversation. 'interview' = candidate interview. 'internal' = team/colleague sync. 'general' = anything else or unclear."
    ),
});

export type ExtractedRequestType = z.infer<typeof ExtractedRequest>;

const llm = new ChatGroq({
  model: "openai/gpt-oss-20b",
  temperature: 0,
}).withStructuredOutput(ExtractedRequest, { name: "extract_scheduling_request" });

export async function parseNaturalLanguageRequest(text: string) {
  const today = formatISO(new Date());

  const result = await llm.invoke([
    {
      role: "system",
      content: `Extract structured scheduling details from the user's request. Today's date is ${today} — resolve any relative dates ("next week", "tomorrow") against it. If no attendee emails are found, return an empty array.`,
    },
    { role: "user", content: text },
  ]);

  return result;
}