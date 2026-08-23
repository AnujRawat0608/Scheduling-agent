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
});

export type ProcurementStateType = typeof ProcurementState.State;

/** Purchases at or above this total require explicit human approval. */
export const APPROVAL_THRESHOLD = 100_000;