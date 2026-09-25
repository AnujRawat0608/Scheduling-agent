import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";
import { buildProcurementGraph, extractProcurementRequest } from "../procurement/graph.js";
import { db } from "../db/client.js";
import { procurementTasks } from "../db/procurementSchema.js";
import { eq, desc } from "drizzle-orm";
import type { ProcurementRequest } from "../procurement/state.js";

export const procurementRouter = Router();
const graphPromise = buildProcurementGraph();

function summarizeItems(lineItems: { item: string }[]): string {
  if (lineItems.length === 0) return "No items";
  if (lineItems.length === 1) return lineItems[0].item;
  return `${lineItems[0].item} +${lineItems.length - 1} more`;
}

procurementRouter.get("/procurement", async (_req, res) => {
  const tasks = await db
    .select()
    .from(procurementTasks)
    .orderBy(desc(procurementTasks.createdAt))
    .limit(50);
  res.json({ tasks });
});

procurementRouter.post("/procurement", async (req, res) => {
  try {
    const { text, requesterEmail, requesterName, useRiskAnalysis } = req.body as {
      text: string;
      requesterEmail: string;
      requesterName?: string;
      useRiskAnalysis?: boolean;
    };

    if (!text || !requesterEmail) {
      return res.status(400).json({ error: "text and requesterEmail are required" });
    }

    const extracted = await extractProcurementRequest(text);

       const request: ProcurementRequest = {
      requesterName: requesterName ?? requesterEmail,
      requesterEmail,
      lineItems: extracted.lineItems.map((li) => ({
        ...li,
        specifications: li.specifications ?? undefined,
      })),
      requiredBy: extracted.requiredBy ?? undefined,
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

    const result = await graph.invoke(
      { request, taskId: task.id, useRiskAnalysis: useRiskAnalysis ?? false },
      { configurable: { thread_id: threadId } }
    );

    await db
      .update(procurementTasks)
      .set({
        status: result.status,
        recommendedPlan: result.recommendedPlan ?? null,
        totalCost: result.recommendedPlan?.totalCost ?? null,
        updatedAt: new Date(),
      })
      .where(eq(procurementTasks.id, task.id));

    res.status(201).json({ threadId, ...result, taskId: task.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

procurementRouter.get("/procurement/:id", async (req, res) => {
  const [task] = await db
    .select()
    .from(procurementTasks)
    .where(eq(procurementTasks.id, req.params.id))
    .limit(1);

  if (!task) return res.status(404).json({ error: "not found" });

  const graph = await graphPromise;
  const snapshot = await graph.getState({ configurable: { thread_id: task.threadId } });

  res.json({ task, state: snapshot.values, next: snapshot.next });
});

procurementRouter.post("/procurement/:id/approve", async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(procurementTasks)
      .where(eq(procurementTasks.id, req.params.id))
      .limit(1);

    if (!task) return res.status(404).json({ error: "not found" });

    const graph = await graphPromise;
    const decision: { approved: true; selectedPlanIndex?: number } | { approved: false; note: string } = req.body;

    const result = await graph.invoke(new Command({ resume: decision }), {
      configurable: { thread_id: task.threadId },
    });

    await db
      .update(procurementTasks)
      .set({ status: result.status, updatedAt: new Date() })
      .where(eq(procurementTasks.id, task.id));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});