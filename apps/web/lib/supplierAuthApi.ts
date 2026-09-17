import type { SupplierProfile } from "./supplierProfileApi";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const TOKEN_KEY = "supplier_token";

// Re-exported so existing imports of `Supplier` from this file keep working.
export type Supplier = SupplierProfile;

export interface RegisterSupplierInput {
  email: string;
  password: string;
  businessName: string;
  contactName?: string;
  phone?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? fallback);
  }
  return res.json();
}

export async function registerSupplier(input: RegisterSupplierInput) {
  const res = await fetch(`${API_BASE}/supplier-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseErrorOr<{ supplier: Supplier; token: string }>(
    res,
    "Registration failed"
  );
  setToken(data.token);
  return data;
}

export async function loginSupplier(email: string, password: string) {
  const res = await fetch(`${API_BASE}/supplier-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseErrorOr<{ supplier: Supplier; token: string }>(res, "Login failed");
  setToken(data.token);
  return data;
}

export async function logoutSupplier() {
  clearToken();
}

export async function fetchCurrentSupplier(): Promise<Supplier | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/supplier-auth/me`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Failed to check session");
  const data = await res.json();
  return data.supplier;
}

// Exported so other API modules (e.g. supplierProfileApi.ts) can attach the
// same bearer token to their own authenticated requests.
export { authHeaders };