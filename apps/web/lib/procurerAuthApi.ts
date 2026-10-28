const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const TOKEN_KEY = "procurer_token";

export interface Procurer {
  id: string;
  email: string;
  companyName?: string | null;
  /** Full country name. Used as the delivery destination for route risk analysis. */
  country?: string | null;
  contactName?: string | null;
  phone?: string | null;
  gstNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export interface RegisterProcurerInput {
  email: string;
  password: string;
  companyName: string;
  country: string;
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
  // One-time cleanup: drop tokens saved by the old localStorage version,
  // so people who are already "stuck" logged in are asked to log in again.
  localStorage.removeItem(TOKEN_KEY);
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
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

/** Lets an existing buyer set or change their country (the delivery destination). */
export async function updateProcurerCountry(country: string): Promise<Procurer> {
  const res = await fetch(`${API_BASE}/procurer-auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ country }),
  });
  const data = await parseErrorOr<{ procurer: Procurer }>(res, "Couldn't update your country");
  return data.procurer;
}

export { authHeaders as procurerAuthHeaders };

export function hasProcurerToken(): boolean {
  return "Authorization" in (authHeaders() as Record<string, string>);
}