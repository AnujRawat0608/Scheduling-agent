"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Lock, CheckCircle2 } from "lucide-react";
import { registerSupplier } from "../../../lib/supplierAuthApi";

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`space-y-1.5 ${span2 ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
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
        contactName: contactName || undefined,
        phone: phone || undefined,
        gstNumber: gstNumber || undefined,
        address: address || undefined,
        city: city || undefined,
        state: state || undefined,
        pincode: pincode || undefined,
      });

      setIsSuccess(true);
      // Brief pause so the success message is actually seen before leaving.
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
      <main className="mx-auto max-w-2xl px-6 py-16">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
          <CheckCircle2 size={32} className="mx-auto text-green-600" />
          <h1 className="text-lg font-semibold text-neutral-900">Account created</h1>
          <p className="text-sm text-neutral-600">
            Taking you to the supply chain catalog to add your products…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 space-y-6">
      <div className="flex items-center gap-2">
        <Building2 size={22} className="text-[#3d6bff]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Become a supplier</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Create your account and add your business details. You'll list products next.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Account</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" span2>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sales@acmecomponents.com"
                className={inputClass}
              />
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
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Business details */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Business details</h2>
          </div>
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
            <Field label="Contact person">
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Riya Sharma"
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className={inputClass}
              />
            </Field>
            <Field label="GST number">
              <input
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                placeholder="27ABCDE1234F1Z5"
                className={inputClass}
              />
            </Field>
            <Field label="Pincode">
              <input
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="411001"
                className={inputClass}
              />
            </Field>
            <Field label="Address" span2>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot 12, MIDC Industrial Area"
                className={inputClass}
              />
            </Field>
            <Field label="City">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Pune"
                className={inputClass}
              />
            </Field>
            <Field label="State">
              <input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Maharashtra"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

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
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </main>
  );
}