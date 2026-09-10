"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { loginSupplier } from "../../../lib/supplierAuthApi";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

export default function SupplierLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await loginSupplier(email, password);
      router.push("/suppliers/dashboard");
    } catch (err) {
      setFormError((err as Error).message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-6">
      <div className="flex items-center gap-2">
        <Lock size={22} className="text-[#3d6bff]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Supplier login</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Sign in to manage your account.</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6"
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sales@acmecomponents.com"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-neutral-600">Password</span>
          <input
            required
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-center text-xs text-neutral-500">
          Don't have an account?{" "}
          <Link href="/suppliers/register" className="text-[#3d6bff] hover:underline">
            Register as a supplier
          </Link>
        </p>
      </form>
    </main>
  );
}