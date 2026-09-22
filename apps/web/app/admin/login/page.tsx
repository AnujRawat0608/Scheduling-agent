"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "../../../lib/adminAuthApi";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginAdmin(email, password);
      router.push("/admin/supplier-review");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-bold text-neutral-900">Admin login</h1>
      <p className="mb-6 text-sm text-neutral-500">Internal access only.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Password</span>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}