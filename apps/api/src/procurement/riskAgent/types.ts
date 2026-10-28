import { z } from "zod";

/* ------------------------------------------------------------------ */
/* 1. Raw shape returned by the Python service: POST /route-risk       */
/* ------------------------------------------------------------------ */

export const AgentModeSchema = z
  .object({
    mode: z.string(),
    viable: z.boolean(),
    reason: z.string().optional(),
    chokepoints: z.array(z.unknown()).optional().default([]),
    status: z.string().nullable().optional(),
    score: z.number().nullable().optional(),
    driving_events: z.array(z.unknown()).optional().default([]),
    summary: z.string().optional(),
  })
  .passthrough();

export const AgentRouteRiskResponseSchema = z
  .object({
    origin: z.string(),
    destination: z.string(),
    modes: z.array(AgentModeSchema),
    disclaimer: z.string().optional(),
  })
  .passthrough();

export type AgentRouteRiskResponse = z.infer<typeof AgentRouteRiskResponseSchema>;

/* ------------------------------------------------------------------ */
/* 2. App-facing shape (what riskCheckNode and the UI consume)         */
/* ------------------------------------------------------------------ */

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

export const ModeRiskSchema = z.object({
  mode: z.string(),
  viable: z.boolean(),
  status: z.enum(["green", "yellow", "red", "unknown"]),
  score: z.number().nullable(),
  summary: z.string().nullable(),
  reason: z.string().nullable(),
});

export const RouteRiskResponseSchema = z.object({
  supplier_region: z.string(), // origin country
  destination_region: z.string().nullable().optional(), // destination country
  known_route: z.boolean(), // true when at least one tracked chokepoint was found
  overall_status: z.enum(["green", "yellow", "red", "unknown"]),
  chokepoints: z.array(ChokepointStatusSchema),
  driving_events: z.array(DrivingEventSchema).optional().default([]),
  recommendation: z.string(),
  order_id: z.string().optional(),
  message: z.string().optional(), // present when known_route is false
  modes: z.array(ModeRiskSchema).optional().default([]),
  disclaimer: z.string().optional(),
});

export type RouteRiskResponse = z.infer<typeof RouteRiskResponseSchema>;
export type ChokepointStatus = z.infer<typeof ChokepointStatusSchema>;
export type DrivingEvent = z.infer<typeof DrivingEventSchema>;
export type ModeRisk = z.infer<typeof ModeRiskSchema>;