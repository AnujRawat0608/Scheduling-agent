import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";
import { buildProcurementGraph, extractProcurementRequest } from "../procurement/graph.js";
import { db } from "../db/client.js";
import { procurementTasks } from "../db/procurementSchema.js";
import { eq, desc } from "drizzle-orm";
import type { ProcurementRequest } from "../procurement/state.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";

export const procurementRouter = Router();
const graphPromise = buildProcurementGraph();

const PRIORITIES = ["balanced", "cheapest", "fastest"] as const;
const MAX_TEXT_LENGTH = 20_000;

function summarizeItems(lineItems: { item: string }[]): string {
  if (lineItems.length === 0) return "No items";
  if (lineItems.length === 1) return lineItems[0].item;
  return `${lineItems[0].item} +${lineItems.length - 1} more`;
}

/** True if a date-only string (YYYY-MM-DD) is before today. Unparseable values return false. */
function isPastDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

procurementRouter.get("/procurement", async (_req, res) => {
  try {
    const tasks = await db
      .select()
      .from(procurementTasks)
      .orderBy(desc(procurementTasks.createdAt))
      .limit(50);
    res.json({ tasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load procurement tasks" });
  }
});

procurementRouter.post("/procurement", requireProcurerAuth, async (req, res) => {
  try {
    const { text, useRiskAnalysis, priority } = req.body as {
      text: string;
      useRiskAnalysis?: boolean;
      priority?: string;
    };

    // Identity comes from the login token, never from the form.
    const requesterEmail = req.procurer!.email;
    const requesterName = requesterEmail.split("@")[0];

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }
    if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `Request is too long (max ${MAX_TEXT_LENGTH} characters).` });
    }

    const extracted = await extractProcurementRequest(text);

    // A deadline in the past would make every supplier "miss the deadline".
    if (extracted.requiredBy && isPastDate(extracted.requiredBy)) {
      return res.status(400).json({
        error: `The required-by date (${extracted.requiredBy}) is in the past. Please confirm the date you need the items by.`,
      });
    }

    const safePriority = PRIORITIES.find((p) => p === priority) ?? "balanced";

    const request: ProcurementRequest = {
      requesterName,
      requesterEmail,
      procurerId: req.procurer!.procurerId,
      lineItems: extracted.lineItems.map((li) => ({
        ...li,
        specifications: li.specifications ?? undefined,
      })),
      requiredBy: extracted.requiredBy ?? undefined,
      priority: safePriority,
    };

    const threadId = randomUUID();
    const graph = await graphPromise;

    const [task] = await db
      .insert(procurementTasks)
      .values({
        threadId,
        requesterEmail,
        itemsSummary: summarizeItems(request.lineItems),
        lineItemCount: request.lineItems.length,
        status: "extracting",
        request,
      })
      .returning();

    // Respond immediately so the UI can start polling and show progress.
    res.status(202).json({ taskId: task.id, threadId });

    // Run the agent in the background. Any failure marks the task as failed
    // instead of leaving it stuck in "extracting" forever.
    graph
      .invoke(
        { request, taskId: task.id, useRiskAnalysis: useRiskAnalysis ?? false },
        { configurable: { thread_id: threadId } }
      )
      .then((result) =>
        db
          .update(procurementTasks)
          .set({
            status: result.status,
            recommendedPlan: result.recommendedPlan ?? null,
            totalCost: result.recommendedPlan ? String(result.recommendedPlan.totalCost) : null,
            updatedAt: new Date(),
          })
          .where(eq(procurementTasks.id, task.id))
      )
      .catch(async (err) => {
        console.error("Procurement agent failed", err);
        await db
          .update(procurementTasks)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(procurementTasks.id, task.id))
          .catch((dbErr) => console.error("Could not mark task as failed", dbErr));
      });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Something went wrong creating this request." });
    }
  }
});

procurementRouter.get("/procurement/:id", async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(procurementTasks)
      .where(eq(procurementTasks.id, req.params.id))
      .limit(1);

    if (!task) return res.status(404).json({ error: "not found" });

    const graph = await graphPromise;
    const snapshot = await graph.getState({ configurable: { thread_id: task.threadId } });

    // Early in a run the graph snapshot can be empty; fall back to the saved task so the
    // frontend always has a status (and the request) to render.
    const values = snapshot.values ?? {};
    res.json({
      task,
      state: {
        ...values,
        request: values.request ?? task.request,
        status: values.status ?? task.status,
      },
      next: snapshot.next,
    });
  } catch (err) {
    console.error(err);
    // A malformed id (e.g. not a valid UUID) also lands here.
    res.status(404).json({ error: "not found" });
  }
});

procurementRouter.post("/procurement/:id/approve", async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(procurementTasks)
      .where(eq(procurementTasks.id, req.params.id))
      .limit(1);

    if (!task) return res.status(404).json({ error: "not found" });

    // Only a task that is waiting for approval can be approved or rejected.
    // This also stops a double click or second tab from resuming the graph twice.
    if (task.status !== "awaiting_approval") {
      return res.status(409).json({ error: `Task is ${task.status}, not awaiting approval` });
    }

    const body = req.body ?? {};
    if (typeof body.approved !== "boolean") {
      return res.status(400).json({ error: "approved (true/false) is required" });
    }

    const graph = await graphPromise;

    let decision: { approved: true; selectedPlanIndex?: number } | { approved: false; note: string };

    if (body.approved) {
      let selectedPlanIndex: number | undefined;
      if (body.selectedPlanIndex !== undefined) {
        const snapshot = await graph.getState({ configurable: { thread_id: task.threadId } });
        const planCount = 1 + (snapshot.values?.alternativePlans?.length ?? 0);
        const idx = body.selectedPlanIndex;
        if (!Number.isInteger(idx) || idx < 0 || idx >= planCount) {
          return res.status(400).json({ error: "selectedPlanIndex is out of range" });
        }
        selectedPlanIndex = idx;
      }
      decision = { approved: true, selectedPlanIndex };

      // Claim the task before the (possibly slow) purchase step so a second request is rejected.
      await db
        .update(procurementTasks)
        .set({ status: "purchasing", updatedAt: new Date() })
        .where(eq(procurementTasks.id, task.id));
    } else {
      decision = { approved: false, note: typeof body.note === "string" ? body.note.slice(0, 2000) : "" };
    }

    try {
      const result = await graph.invoke(new Command({ resume: decision }), {
        configurable: { thread_id: task.threadId },
      });

      await db
        .update(procurementTasks)
        .set({ status: result.status, updatedAt: new Date() })
        .where(eq(procurementTasks.id, task.id));

      res.json(result);
    } catch (err) {
      // Put the task back so it can be retried instead of being stuck in "purchasing".
      await db
        .update(procurementTasks)
        .set({ status: "awaiting_approval", updatedAt: new Date() })
        .where(eq(procurementTasks.id, task.id))
        .catch((dbErr) => console.error("Could not restore task status", dbErr));
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong processing this decision." });
  }
});