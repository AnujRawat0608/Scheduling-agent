import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";
import { buildGraph } from "../agent/graph.js";
import { createLangfuseHandler } from "../langfuse.js";
import { db } from "../db/client.js";
import { schedulingRuns } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { parseNaturalLanguageRequest } from "../agent/lib/parseNaturalLanguageRequest.js";
import type { SchedulingRequest, TimeSlot } from "../agent/state.js";

export const runsRouter = Router();

const graphPromise = buildGraph();

async function startRun(request: SchedulingRequest) {
  const threadId = randomUUID();
  const graph = await graphPromise;

  const [run] = await db
    .insert(schedulingRuns)
    .values({
      threadId,
      organizerId: request.organizer.id,
      title: request.title ?? "Untitled meeting",
      status: "gathering",
      request,
    })
    .returning();

  const handler = createLangfuseHandler(run.id, request.organizer.id);

  const result = await graph.invoke(
    { request },
    { configurable: { thread_id: threadId }, callbacks: [handler] }
  );

  await db
    .update(schedulingRuns)
    .set({ status: result.status, updatedAt: new Date() })
    .where(eq(schedulingRuns.id, run.id));

  return { runId: run.id, threadId, ...result };
}

runsRouter.get("/runs", async (_req, res) => {
  const runs = await db
    .select()
    .from(schedulingRuns)
    .orderBy(desc(schedulingRuns.createdAt))
    .limit(50);

  res.json({ runs });
});

runsRouter.post("/runs", async (req, res) => {
  try {
    const request = req.body as SchedulingRequest;
    const result = await startRun(request);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

runsRouter.post("/runs/from-text", async (req, res) => {
  try {
    const { text, organizerEmail } = req.body as { text: string; organizerEmail: string };

    if (!text || !organizerEmail) {
      return res.status(400).json({ error: "text and organizerEmail are required" });
    }

    const extracted = await parseNaturalLanguageRequest(text);

    if (extracted.attendeeEmails.length === 0) {
      return res.status(422).json({
        error:
          "Couldn't find any attendee email addresses in that text — try including them explicitly, e.g. 'with sarah@company.com'.",
      });
    }

        const request: SchedulingRequest = {
      title: extracted.title,
      durationMinutes: extracted.durationMinutes || 30,
      organizer: { id: "1", email: organizerEmail },
      attendees: extracted.attendeeEmails.map((email, i) => ({
        id: String(i + 2),
        email,
      })),
      earliestStart: extracted.earliestStart ?? undefined,
      deadline: extracted.deadline ?? undefined,
      constraints: extracted.constraints ?? undefined,
      avoidMornings: extracted.avoidMornings,
      avoidAfternoons: extracted.avoidAfternoons,
      meetingType: extracted.meetingType,
    };

    const result = await startRun(request);
    res.status(201).json({ ...result, extracted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

runsRouter.get("/runs/:id", async (req, res) => {
  const [run] = await db
    .select()
    .from(schedulingRuns)
    .where(eq(schedulingRuns.id, req.params.id))
    .limit(1);

  if (!run) return res.status(404).json({ error: "not found" });

  const graph = await graphPromise;
  const snapshot = await graph.getState({
    configurable: { thread_id: run.threadId },
  });

  res.json({ run, state: snapshot.values, next: snapshot.next });
});

runsRouter.post("/runs/:id/approve", async (req, res) => {
  try {
    const [run] = await db
      .select()
      .from(schedulingRuns)
      .where(eq(schedulingRuns.id, req.params.id))
      .limit(1);

    if (!run) return res.status(404).json({ error: "not found" });

    const graph = await graphPromise;
    const handler = createLangfuseHandler(run.id, run.organizerId);

    const decision: { selectedSlot: TimeSlot } | { reject: true; note: string } = req.body;

    const result = await graph.invoke(new Command({ resume: decision }), {
      configurable: { thread_id: run.threadId },
      callbacks: [handler],
    });

    await db
      .update(schedulingRuns)
      .set({
        status: result.status,
        selectedSlot: result.selectedSlot ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schedulingRuns.id, run.id));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});