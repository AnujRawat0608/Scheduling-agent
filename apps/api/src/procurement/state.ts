import { Annotation } from "@langchain/langgraph";

export interface ProcurementRequest {
  requesterName: string;
  requesterEmail: string;
  item: string;
  quantity: number;
  requiredBy?: string; // ISO date
  specifications?: string;
}

export interface SupplierQuote {
  supplierName: string;
  supplierId: string | null;       // links to suppliers table when the offer has a registered owner
  supplierRegion: string | null;   // from suppliers.region — null for mock/unowned quotes
  unitPrice: number; // in smallest reasonable unit, e.g. INR
  quantityAvailable: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number; // minimum order quantity
  respondedAt: string;
}

export interface QuoteScore extends SupplierQuote {
  totalCost: number;
  score: number; // 0-1, higher is better
  rationale: string;
}

export type ProcurementStatus =
  | "extracting"
  | "sourcing"
  | "awaiting_quotes"
  | "comparing"
  | "awaiting_approval"
  | "purchasing"
  | "done"
  | "failed";

export const ProcurementState = Annotation.Root({
  request: Annotation<ProcurementRequest>(),

  rfqEmail: Annotation<string | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  quotes: Annotation<SupplierQuote[]>({
    reducer: (_e, u) => u,
    default: () => [],
  }),

  scoredQuotes: Annotation<QuoteScore[]>({
    reducer: (_e, u) => u,
    default: () => [],
  }),

  recommendedSupplier: Annotation<QuoteScore | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  status: Annotation<ProcurementStatus>({
    reducer: (_e, u) => u,
    default: () => "extracting",
  }),

  approvalRequest: Annotation<{ question: string; recommendation: QuoteScore } | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  failureReason: Annotation<string | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  taskId: Annotation<string | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  useRiskAnalysis: Annotation<boolean>({
    reducer: (_e, u) => u,
    default: () => false,
  }),

  riskAssessment: Annotation<Record<string, unknown> | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  riskCheckStatus: Annotation<"skipped" | "ok" | "unavailable">({
    reducer: (_e, u) => u,
    default: () => "skipped",
  }),
});

export type ProcurementStateType = typeof ProcurementState.State;

/** Purchases at or above this total require explicit human approval. */
export const APPROVAL_THRESHOLD = 100_000;