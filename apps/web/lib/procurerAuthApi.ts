const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const TOKEN_KEY = "procurer_token";

export interface Procurer {
  id: string;
  email: string;
  companyName: string;
  region: string;
  contactName?: string;
  phone?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface RegisterProcurerInput {
  email: string;
  password: string;
  companyName: string;
  region: string;
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
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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

export async function registerProcurer(input: RegisterProcurerInput) {
  const res = await fetch(`${API_BASE}/procurer-auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseErrorOr<{ procurer: Procurer; token: string }>(
    res,
    "Registration failed"
  );
  setToken(data.token);
  return data;
}

export async function loginProcurer(email: string, password: string) {
  const res = await fetch(`${API_BASE}/procurer-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseErrorOr<{ procurer: Procurer; token: string }>(res, "Login failed");
  setToken(data.token);
  return data;
}

export async function logoutProcurer() {
  clearToken();
}

export async function fetchCurrentProcurer(): Promise<Procurer | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/procurer-auth/me`, {
    headers: authHeaders(),
  });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Failed to check session");
  const data = await res.json();
  return data.procurer;
}

export { authHeaders as procurerAuthHeaders };

export function hasProcurerToken(): boolean {
  return "Authorization" in (authHeaders() as Record<string, string>);
}