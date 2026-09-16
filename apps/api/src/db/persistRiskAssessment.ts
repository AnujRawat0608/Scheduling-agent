import { db } from "./client.js";
import { riskAssessments } from "./procurementSchema.js";
import type { RouteRiskResponse } from "../procurement/riskAgent/types.js";

export async function persistRiskAssessment(
  taskId: string,
  assessment: RouteRiskResponse,
  wasAvailable: boolean
) {
  await db.insert(riskAssessments).values({
    taskId,
    supplierRegion: assessment.supplier_region,
    destinationRegion: assessment.destination_region ?? null,
    overallStatus: assessment.overall_status,
    recommendation: assessment.recommendation,
    rawResponse: assessment,
    wasAvailable,
  });
}