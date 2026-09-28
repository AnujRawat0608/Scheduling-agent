"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Briefcase,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { loginProcurer } from "../../../lib/procurerAuthApi";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#EA580C] focus:ring-1 focus:ring-[#EA580C]";

function HeroPanel() {
  return (
    <div className="hidden lg:flex sticky top-8 h-[calc(100vh-4rem)] max-h-[560px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-b from-[#ffe8d8] to-[#ffc79b] p-6">
      <span className="mb-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700">
        <span className="h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
        Procurement network
      </span>

      <div className="rounded-xl bg-neutral-900/90 p-6 text-white backdrop-blur">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EA580C]">
          <Sparkles size={16} />
        </span>
        <p className="mt-4 text-xs font-medium tracking-wide text-white/60">Welcome back</p>
        <h2 className="mt-1 text-xl font-semibold leading-snug">
          Source smarter, every time you buy.
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Compare supplier offers, send quotes, and keep every order moving from one place.
        </p>
        <div className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-white/60">
          <ShieldCheck size={13} />
          Secure procurement portal
        </div>
      </div>
    </div>
  );
}

export default function ProcurerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await loginProcurer(email, password);
      router.push("/procurement");
    } catch (err) {
      setFormError((err as Error).message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EA580C]/10 text-[#EA580C]">
              <Briefcase size={16} />
            </span>
            <p className="text-sm font-semibold text-neutral-900">Procurement portal</p>
          </div>
          <p className="text-sm text-neutral-500">
            New here?{" "}
            <Link href="/procurement/register" className="font-medium text-[#EA580C] hover:underline">
              Register as a procurer
            </Link>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: form */}
          <div className="space-y-8">
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EA580C]/10 text-[#EA580C]">
                <Lock size={18} />
              </span>
              <p className="mt-4 text-xs font-medium tracking-wide text-[#EA580C]">
                Procurer access
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight text-neutral-900">
                Welcome back.
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                Sign in to send quotes, track orders, and manage your supplier relationships.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-900">
                    Sign in to your account
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Use the email linked to your procurement profile.
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
                  <ShieldCheck size={15} />
                </span>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium tracking-wide text-neutral-500">
                  Work email
                </span>
                <div className="relative">
                  <Mail
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="procurement@yourcompany.com"
                    className={inputClass}
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wide text-neutral-500">
                    Password
                  </span>
                  <Link href="/procurement/forgot-password" className="text-xs text-[#EA580C] hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#EA580C] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-50"
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
                {!isSubmitting && <ArrowRight size={15} />}
              </button>

              <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-400">
                <ShieldCheck size={13} />
                Your account is protected with secure login.
              </p>
            </form>
          </div>

          {/* Right: hero panel */}
          <HeroPanel />
        </div>
      </div>
    </main>
  );
}