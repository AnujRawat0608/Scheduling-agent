"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Lock,
  CheckCircle2,
  Mail,
  MapPin,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { registerSupplier } from "../../../lib/supplierAuthApi";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

const inputWithIconClass = `${inputClass} pl-10`;

function Field({
  label,
  optional,
  children,
  span2,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`space-y-1.5 ${span2 ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium tracking-wide text-neutral-500">
        {label}
        {optional && <span className="ml-1 font-normal text-neutral-400">(optional)</span>}
      </span>
      {children}
    </label>
  );
}

function StepCard({
  step,
  icon: Icon,
  title,
  description,
  children,
}: {
  step: string;
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
          <Icon size={16} />
        </span>
        <div>
          <p className="text-xs font-medium tracking-wide text-[#3d6bff]">{step}</p>
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function HeroPanel() {
  return (
    <div className="hidden lg:flex sticky top-8 h-[calc(100vh-4rem)] max-h-[820px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-b from-[#e8edff] to-[#c7d4ff]">
      <video
        src="/Supplier-Hero.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative m-6 rounded-xl bg-neutral-900/90 p-6 text-white backdrop-blur">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3d6bff]">
          <Building2 size={16} />
        </span>
        <p className="mt-4 text-xs font-medium tracking-wide text-white/60">
          Build with confidence
        </p>
        <h2 className="mt-1 text-xl font-semibold leading-snug">
          Your products belong in a better supply chain.
        </h2>
        <p className="mt-2 text-sm text-white/70">
          Join a network of trusted suppliers and put your business in front of the
          right buyers.
        </p>
        <div className="mt-4 flex items-center gap-1.5 border-t border-white/10 pt-3 text-xs text-white/60">
          <ShieldCheck size={13} />
          Secure registration · Free to join
        </div>
      </div>
    </div>
  );
}

export default function SupplierRegisterPage() {
  const router = useRouter();

  // Account
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Business details
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [region, setRegion] = useState("");
  const [phone, setPhone] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await registerSupplier({
        email,
        password,
        businessName,
        region,
        contactName: contactName || undefined,
        phone: phone || undefined,
        gstNumber: gstNumber || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        pincode: pincode || undefined,
      });

      setIsSuccess(true);
      setTimeout(() => {
        router.push("/supply-chain");
      }, 1500);
    } catch (err) {
      setFormError((err as Error).message);
      setIsSubmitting(false);
    }
  }

  if (isSuccess) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-green-600" />
            <h1 className="text-lg font-semibold text-neutral-900">Account created</h1>
            <p className="text-sm text-neutral-600">
              Taking you to the supply chain catalog to add your products…
            </p>
          </div>
          <HeroPanel />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
              <Building2 size={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">Supplier portal</p>
            </div>
          </div>
          <p className="text-sm text-neutral-500">
            Already have an account?{" "}
            <Link href="/suppliers/login" className="font-medium text-[#3d6bff] hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Left: form */}
          <div className="space-y-8">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#3d6bff]">Registration</p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight text-neutral-900">
                Grow your business with the right connections.
              </h1>
              <p className="mt-2 text-sm text-neutral-500">
                Create your supplier profile in a few simple steps. It only takes a couple of
                minutes.
              </p>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex flex-1 gap-1.5">
                  <div className="h-1.5 flex-1 rounded-full bg-[#3d6bff]" />
                  <div className="h-1.5 flex-1 rounded-full bg-neutral-200" />
                  <div className="h-1.5 flex-1 rounded-full bg-neutral-200" />
                </div>
                <span className="text-xs text-neutral-400">1 of 3</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <StepCard
                step="Step one"
                icon={Lock}
                title="Create your account"
                description="Your login details keep your supplier profile secure."
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Work email" span2>
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
                        placeholder="sales@acmecomponents.com"
                        className={inputWithIconClass}
                      />
                    </div>
                  </Field>
                  <Field label="Password">
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Confirm password">
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </StepCard>

              <StepCard
                step="Step two"
                icon={Building2}
                title="Tell us about your business"
                description="This information helps buyers find and trust you."
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Business name" span2>
                    <input
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Acme Components Pvt Ltd"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Region">
                    <input
                      required
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="Asia-Pacific"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Contact person" optional>
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="Riya Sharma"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Phone" optional>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="GST number" optional>
                    <input
                      value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value)}
                      placeholder="27ABCDE1234F1Z5"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Pincode" optional>
                    <input
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="411001"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Address" optional span2>
                    <div className="relative">
                      <MapPin
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                      />
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Plot 12, MIDC Industrial Area"
                        className={inputWithIconClass}
                      />
                    </div>
                  </Field>
                  <Field label="City" optional>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Pune"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="State" optional>
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      placeholder="Maharashtra"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </StepCard>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <ShieldCheck size={13} />
                  Your details are encrypted and protected.
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#3d6bff] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating account…" : "Create supplier account"}
                  {!isSubmitting && <ArrowRight size={15} />}
                </button>
              </div>
              <p className="text-center text-xs text-neutral-400">
                By continuing, you agree to our supplier terms.
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