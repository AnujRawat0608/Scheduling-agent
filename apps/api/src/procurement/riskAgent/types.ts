import { z } from "zod";

/**
 * Mirrors the JSON shape returned by POST /procurement/route-risk
 * on the Supply Chain Risk Agent (separate Python/FastAPI service).
 */

export const ChokepointStatusSchema = z.object({
  name: z.string(),
  score: z.number().nullable(),
  status: z.enum(["green", "yellow", "red"]).nullable(),
  computed_at: z.string().nullable(),
});

export const DrivingEventSchema = z.object({
  headline: z.string(),
  summary: z.string().nullable(),
  severity: z.number().int().min(1).max(5),
  event_time: z.string(),
  chokepoint_name: z.string(),
});

export const RouteRiskResponseSchema = z.object({
  supplier_region: z.string(),
  destination_region: z.string().nullable().optional(),
  known_route: z.boolean(),
  overall_status: z.enum(["green", "yellow", "red", "unknown"]),
  chokepoints: z.array(ChokepointStatusSchema),
  driving_events: z.array(DrivingEventSchema).optional().default([]),
  recommendation: z.string(),
  order_id: z.string().optional(),
  message: z.string().optional(), // present when known_route is false
});

export type RouteRiskResponse = z.infer<typeof RouteRiskResponseSchema>;
export type ChokepointStatus = z.infer<typeof ChokepointStatusSchema>;
export type DrivingEvent = z.infer<typeof DrivingEventSchema>;