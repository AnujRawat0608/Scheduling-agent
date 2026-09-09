const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface Supplier {
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
  createdAt: string;
  updatedAt: string;
}

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
    credentials: "include", // required so the login cookie is stored
    body: JSON.stringify(input),
  });
  return parseErrorOr<{ supplier: Supplier }>(res, "Registration failed");
}

export async function loginSupplier(email: string, password: string) {
  const res = await fetch(`${API_BASE}/supplier-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  return parseErrorOr<{ supplier: Supplier }>(res, "Login failed");
}

export async function logoutSupplier() {
  await fetch(`${API_BASE}/supplier-auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function fetchCurrentSupplier(): Promise<Supplier | null> {
  const res = await fetch(`${API_BASE}/supplier-auth/me`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to check session");
  const data = await res.json();
  return data.supplier;
}