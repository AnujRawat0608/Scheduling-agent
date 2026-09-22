import { adminAuthHeaders } from "./adminAuthApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface AdminSupplier {
  id: string;
  email: string;
  businessName: string;
  contactName: string | null;
  phone: string | null;
  gstNumber: string | null;
  region: string | null;
  verificationStatus: "pending" | "verified" | "rejected";
  gstVerified: boolean;
  verifiedAt: string | null;
  verificationNotes: string | null;
  createdAt: string;
}

export interface SupplierCertification {
  id: string;
  supplierId: string;
  certType: string;
  certNumber: string | null;
  issuedBy: string | null;
  validUntil: string | null;
  documentUrl: string | null;
  verified: boolean;
  createdAt: string;
}

export interface VerificationEvent {
  id: string;
  supplierId: string;
  adminId: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  notes: string | null;
  createdAt: string;
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function listAdminSuppliers(status?: string): Promise<AdminSupplier[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${API_BASE}/admin/suppliers${query}`, {
    headers: adminAuthHeaders(),
  });
  const data = await parseErrorOr<{ suppliers: AdminSupplier[] }>(
    res,
    "Failed to load suppliers"
  );
  return data.suppliers;
}

export async function getAdminSupplierDetail(id: string): Promise<{
  supplier: AdminSupplier;
  certifications: SupplierCertification[];
  events: VerificationEvent[];
}> {
  const res = await fetch(`${API_BASE}/admin/suppliers/${id}`, {
    headers: adminAuthHeaders(),
  });
  return parseErrorOr(res, "Failed to load supplier detail");
}

export async function verifySupplier(
  id: string,
  input: { gstVerified?: boolean; notes?: string }
): Promise<{ supplier: AdminSupplier }> {
  const res = await fetch(`${API_BASE}/admin/suppliers/${id}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify(input),
  });
  return parseErrorOr(res, "Failed to verify supplier");
}

export async function rejectSupplier(
  id: string,
  notes: string
): Promise<{ supplier: AdminSupplier }> {
  const res = await fetch(`${API_BASE}/admin/suppliers/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...adminAuthHeaders() },
    body: JSON.stringify({ notes }),
  });
  return parseErrorOr(res, "Failed to reject supplier");
}