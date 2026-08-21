import { CallbackHandler } from "langfuse-langchain";

/**
 * One handler per run, tagged with our own runId so a Langfuse trace
 * can be correlated back to the scheduling_runs row (store trace_id
 * from handler.getTraceId() on the run/run_events if you want a
 * deep link from the UI into Langfuse).
 */
export function createLangfuseHandler(runId: string, userId: string) {
  return new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL, // omit for Langfuse Cloud
    sessionId: runId,
    userId,
    tags: ["scheduling-agent"],
  });
}
