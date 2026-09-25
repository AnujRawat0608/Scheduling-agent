import { Annotation } from "@langchain/langgraph";

export interface LineItem {
  item: string;
  quantity: number;
  specifications?: string;
}

export interface SupplierQuote {
  supplierName: string;
  supplierId: string | null;
  supplierRegion: string | null;
  unitPrice: number;
  quantityAvailable: number;
  leadTimeDays: number;
  shippingCost: number;
  moq: number;
  respondedAt: string;
}

export interface QuoteScore extends SupplierQuote {
  totalCost: number;
  score: number;
  rationale: string;
}

export interface LineItemQuotes {
  lineItem: LineItem;
  quotes: SupplierQuote[];
  scoredQuotes: QuoteScore[];
  topQuotes: QuoteScore[];
  hasMatch: boolean;
}

export interface FulfillmentLeg {
  supplierName: string;
  supplierId: string | null;
  lineItems: LineItem[];
  quotes: QuoteScore[];
  legCost: number;
}

export interface FulfillmentPlan {
  type: "single_supplier" | "split" | "partial";
  legs: FulfillmentLeg[];
  unmatchedItems: LineItem[];
  totalCost: number;
  rationale: string;
}

export interface PurchaseConfirmation {
  supplierName: string;
  supplierId: string | null;
  lineItems: LineItem[];
  confirmedCost: number;
  confirmedAt: string;
}

export interface ProcurementRequest {
  requesterName: string;
  requesterEmail: string;
  lineItems: LineItem[];
  requiredBy?: string;
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

  rfqEmails: Annotation<Record<string, string>>({
    reducer: (_e, u) => u,
    default: () => ({}),
  }),

  lineItemQuotes: Annotation<LineItemQuotes[]>({
    reducer: (_e, u) => u,
    default: () => [],
  }),

  recommendedPlan: Annotation<FulfillmentPlan | null>({
    reducer: (_e, u) => u,
    default: () => null,
  }),

  alternativePlans: Annotation<FulfillmentPlan[]>({
    reducer: (_e, u) => u,
    default: () => [],
  }),

  purchaseConfirmations: Annotation<PurchaseConfirmation[]>({
    reducer: (_e, u) => u,
    default: () => [],
  }),

  status: Annotation<ProcurementStatus>({
    reducer: (_e, u) => u,
    default: () => "extracting",
  }),

  approvalRequest: Annotation<{ question: string; recommendation: FulfillmentPlan } | null>({
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

export const APPROVAL_THRESHOLD = 100_000;