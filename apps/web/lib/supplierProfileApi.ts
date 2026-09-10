const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface MainMarket {
  region: string;
  percentage: number;
}

export interface SupplierProfile {
  id: string;
  email: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  gstNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  companyOverview: string | null;
  businessType: string | null;
  yearEstablished: number | null;
  totalEmployees: string | null;
  totalAnnualRevenue: string | null;
  mainProducts: string | null;
  certifications: string | null;
  rdCapacity: string | null;
  mainMarkets: MainMarket[] | null;
  languagesSpoken: string | null;
  tradeDeptEmployees: string | null;
  averageLeadTimeDays: number | null;
  responseRate: number | null;
  responseTimeHours: string | null;
  transactionsCount: number | null;
  totalTransactionAmount: string | null;
  quotationPerformance: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProduct {
  id: string;
  item: string;
  description: string | null;
  category: string | null;
  unitPrice: number;
  leadTimeDays: number;
  dispatchStatus: string | null;
  shippingCost: number;
  moq: number;
  quantityAvailable: number;
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function fetchSupplierProfile(supplierId: string) {
  const res = await fetch(`${API_BASE}/suppliers/${supplierId}`);
  return parseErrorOr<{ supplier: SupplierProfile; products: SupplierProduct[] }>(
    res,
    "Failed to load supplier profile"
  );
}

export async function updateMyProfile(updates: Partial<SupplierProfile>) {
  const res = await fetch(`${API_BASE}/suppliers/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(updates),
  });
  return parseErrorOr<{ supplier: SupplierProfile }>(res, "Failed to update profile");
}

export async function sendMessageToSupplier(
  supplierId: string,
  input: { senderName: string; senderEmail: string; message: string }
) {
  const res = await fetch(`${API_BASE}/suppliers/${supplierId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseErrorOr<{ message: unknown }>(res, "Failed to send message");
}