const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const TOKEN_KEY = "admin_token";

export interface Admin {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
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

export function adminAuthHeaders(): HeadersInit {
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

export async function loginAdmin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/admin-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseErrorOr<{ admin: Admin; token: string }>(res, "Login failed");
  setToken(data.token);
  return data;
}

export async function logoutAdmin() {
  clearToken();
}

export async function fetchCurrentAdmin(): Promise<Admin | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/admin-auth/me`, {
    headers: adminAuthHeaders(),
  });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error("Failed to check session");
  const data = await res.json();
  return data.admin;
}