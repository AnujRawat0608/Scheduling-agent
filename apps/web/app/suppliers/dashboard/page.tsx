"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IncomingOrders } from "../../../components/IncomingOrders";
import { RfqInbox } from "../../../components/RfqInbox";
import { formatMoney } from "../../../lib/format";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Inbox,
  LogOut,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";
import { fetchCurrentSupplier, logoutSupplier } from "../../../lib/supplierAuthApi";
import {
  fetchSupplierProfile,
  updateMyProfile,
  type SupplierProfile,
  type SupplierProduct,
} from "../../../lib/supplierProfileApi";

/* -------------------------------------------------------------------------- */
/*  Design tokens                                                             */
/* -------------------------------------------------------------------------- */

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/15 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:border-slate-200";

const BUSINESS_TYPES = [
  "Manufacturer",
  "Manufacturer / Supplier",
  "Trading company",
  "Distributor / Wholesaler",
  "Service provider",
];

const CERT_SLOTS = [
  { id: "iso9001", label: "ISO 9001 certificate" },
  { id: "tradeLicense", label: "Trade license" },
  { id: "insurance", label: "Insurance (COI)" },
] as const;

const MAX_CERT_BYTES = 5 * 1024 * 1024;

const headerLinkClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900";

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  hint,
  children,
  span2,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`block space-y-1.5 ${span2 ? "sm:col-span-2" : ""}`}>
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  flush,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
            <Icon size={15} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className={flush ? "" : "space-y-5 p-5 sm:p-6"}>{children}</div>
    </section>
  );
}

function CertificateDropzone({
  label,
  file,
  error,
  onSelect,
  onClear,
}: {
  label: string;
  file: File | null;
  error: string | null;
  onSelect: (file: File | null) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label
        className={`group relative flex h-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 text-center transition focus-within:ring-2 focus-within:ring-[#3d6bff]/30 ${
          error
            ? "border-red-300 bg-red-50/50"
            : file
            ? "border-emerald-300 bg-emerald-50/40"
            : "border-slate-300 bg-slate-50/60 hover:border-[#3d6bff] hover:bg-[#3d6bff]/5"
        }`}
      >
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
          className="sr-only"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileText size={22} className="text-emerald-600" />
            <span className="max-w-full truncate text-xs font-medium text-slate-800">
              {file.name}
            </span>
            <span className="text-[11px] text-slate-500">
              {(file.size / 1024).toFixed(0)} KB · click to replace
            </span>
          </>
        ) : (
          <>
            <UploadCloud size={22} className="text-slate-400 transition group-hover:text-[#3d6bff]" />
            <span className="text-xs font-medium text-slate-800">{label}</span>
            <span className="text-[11px] text-slate-400">PDF or JPG, max 5 MB</span>
          </>
        )}
      </label>
      {file && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600"
        >
          <X size={12} />
          Remove
        </button>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form state                                                                */
/* -------------------------------------------------------------------------- */

// A form-friendly version of SupplierProfile where numeric fields are
// edited as strings (so inputs can be empty) and converted back to
// numbers/null on save.
type FormState = {
  businessName: string;
  region: string;
  contactName: string;
  phone: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  companyOverview: string;
  businessType: string;
  yearEstablished: string;
  totalEmployees: string;
  totalAnnualRevenue: string;
  mainProducts: string;
  certifications: string;
};

function profileToForm(p: SupplierProfile): FormState {
  return {
    businessName: p.businessName ?? "",
    region: p.region ?? "",
    contactName: p.contactName ?? "",
    phone: p.phone ?? "",
    gstNumber: p.gstNumber ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    pincode: p.pincode ?? "",
    companyOverview: p.companyOverview ?? "",
    businessType: p.businessType ?? "",
    yearEstablished: p.yearEstablished?.toString() ?? "",
    totalEmployees: p.totalEmployees ?? "",
    totalAnnualRevenue: p.totalAnnualRevenue ?? "",
    mainProducts: p.mainProducts ?? "",
    certifications: p.certifications ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function SupplierDashboardPage() {
  const router = useRouter();

  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [form, setForm] = useState<FormState | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Certificate uploads (local UI state — see note at the Compliance section)
  const [certFiles, setCertFiles] = useState<Record<string, File | null>>({});
  const [certErrors, setCertErrors] = useState<Record<string, string | null>>({});

  /* ------------------------------ data loading ----------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const current = await fetchCurrentSupplier().catch(() => null);
      if (cancelled) return;

      if (!current) {
        router.push("/suppliers/login");
        return;
      }

      setSupplier(current);
      setForm(profileToForm(current));

      try {
        const { products: theirProducts } = await fetchSupplierProfile(current.id);
        if (!cancelled) setProducts(theirProducts);
      } catch {
        // Products are secondary — the profile form should still be usable.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* ----------------------------- derived values ---------------------------- */

  const isDirty = useMemo(() => {
    if (!supplier || !form) return false;
    return JSON.stringify(profileToForm(supplier)) !== JSON.stringify(form);
  }, [supplier, form]);

  const completeness = useMemo(() => {
    if (!form) return 0;
    const checks = [
      form.businessName,
      form.contactName,
      form.phone,
      form.gstNumber,
      form.address,
      form.city,
      form.state,
      form.pincode,
      form.businessType,
      form.companyOverview,
      form.mainProducts,
      form.certifications,
    ];
    const filled =
      checks.filter((v) => v.trim() !== "").length + (products.length > 0 ? 1 : 0);
    return Math.round((filled / (checks.length + 1)) * 100);
  }, [form, products]);

  /* -------------------------------- effects -------------------------------- */

  // Auto-dismiss the success toast
  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 3500);
    return () => clearTimeout(t);
  }, [saveSuccess]);

  // Warn before leaving with unsaved edits
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /* -------------------------------- handlers ------------------------------- */

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleDiscard() {
    if (!supplier) return;
    setForm(profileToForm(supplier));
    setSaveError(null);
  }

  function handleCertSelect(id: string, file: File | null) {
    if (file && file.size > MAX_CERT_BYTES) {
      setCertErrors((prev) => ({ ...prev, [id]: "File is larger than 5 MB." }));
      return;
    }
    setCertErrors((prev) => ({ ...prev, [id]: null }));
    setCertFiles((prev) => ({ ...prev, [id]: file }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updated = await updateMyProfile({
        businessName: form.businessName,
        region: form.region,
        contactName: form.contactName || null,
        phone: form.phone || null,
        gstNumber: form.gstNumber || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        companyOverview: form.companyOverview || null,
        businessType: form.businessType || null,
        yearEstablished: form.yearEstablished ? Number(form.yearEstablished) : null,
        totalEmployees: form.totalEmployees || null,
        totalAnnualRevenue: form.totalAnnualRevenue || null,
        mainProducts: form.mainProducts || null,
        certifications: form.certifications || null,
      });

      // Re-sync everything from the server response so "unsaved changes" clears
      setSupplier(updated.supplier);
      setForm(profileToForm(updated.supplier));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    await logoutSupplier();
    router.push("/suppliers/login");
  }

  /* -------------------------------- loading -------------------------------- */

  if (isLoading || !form || !supplier) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <div
          className="mx-auto max-w-4xl animate-pulse space-y-5"
          role="status"
          aria-label="Loading your dashboard"
        >
          <div className="h-8 w-56 rounded-lg bg-slate-200" />
          <div className="h-64 rounded-xl bg-slate-200/70" />
          <div className="h-48 rounded-xl bg-slate-200/70" />
          <div className="h-48 rounded-xl bg-slate-200/70" />
        </div>
      </main>
    );
  }

  // Keep a custom/legacy business type selectable even if it isn't in our list
  const businessTypeOptions =
    form.businessType && !BUSINESS_TYPES.includes(form.businessType)
      ? [form.businessType, ...BUSINESS_TYPES]
      : BUSINESS_TYPES;

  /* --------------------------------- render -------------------------------- */

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-32 pt-8 sm:px-6 sm:pt-10">
      <form onSubmit={handleSave} className="mx-auto max-w-4xl space-y-5">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Supplier dashboard
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">{supplier.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/suppliers/${supplier.id}`} className={headerLinkClass}>
              <ExternalLink size={13} />
              View public profile
            </Link>

            <Link href="/suppliers/orders" className={headerLinkClass}>
              <Inbox size={13} />
              Orders
            </Link>

            <Link href="/suppliers/rfqs" className={headerLinkClass}>
              <FileText size={13} />
              RFQs
            </Link>

            <button type="button" onClick={handleLogout} className={headerLinkClass}>
              <LogOut size={13} />
              Log out
            </button>
          </div>
        </div>

        {/* Profile completeness */}
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Profile completeness</span>
              <span className="font-semibold text-slate-900">{completeness}%</span>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={completeness}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile completeness"
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  completeness === 100 ? "bg-emerald-500" : "bg-[#3d6bff]"
                }`}
                style={{ width: `${completeness}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {completeness === 100
                ? "Your profile is complete — buyers can see everything they need."
                : "Complete profiles get more buyer enquiries. Fill in the remaining details below."}
            </p>
          </div>
        </div>

        {/* Product catalog */}
        <SectionCard
          icon={Package}
          title="Product catalog"
          flush
          action={
            <Link
              href="/supply-chain"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              <Plus size={14} />
              Add product
            </Link>
          }
        >
          {products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Package size={18} />
              </span>
              <p className="text-sm font-medium text-slate-700">No products listed yet</p>
              <p className="max-w-xs text-xs text-slate-500">
                Add your first product from the supply chain catalog so buyers can find and quote it.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-2.5 font-semibold">Product name</th>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">MOQ</th>
                    <th className="px-3 py-2.5 font-semibold">Lead time</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unit price</th>
                    <th className="px-6 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id} className="transition hover:bg-slate-50/70">
                      <td className="px-6 py-3.5 font-medium text-slate-900">{p.item}</td>
                      <td className="px-3 py-3.5">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {p.category ?? "Uncategorized"}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-slate-600">{p.moq}</td>
                      <td className="px-3 py-3.5 text-slate-600">{p.leadTimeDays} days</td>
                      <td className="px-3 py-3.5 text-right font-medium tabular-nums text-slate-900">
                        {formatMoney(Number(p.unitPrice), p.currency)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href="/supply-chain"
                          aria-label={`Edit ${p.item}`}
                          className="inline-flex rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#3d6bff]"
                        >
                          <Pencil size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <IncomingOrders />

        {/* Compact RFQ preview — full list lives at /suppliers/rfqs */}
        <RfqInbox limit={3} viewAllHref="/suppliers/rfqs" />

        {/* Business details */}
        <SectionCard icon={Building2} title="Business details">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <input
                required
                value={form.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Region">
              <input
                required
                value={form.region}
                onChange={(e) => updateField("region", e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="GST number">
              <input
                value={form.gstNumber}
                onChange={(e) => updateField("gstNumber", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Business type">
              <select
                value={form.businessType}
                onChange={(e) => updateField("businessType", e.target.value)}
                className={inputClass}
              >
                <option value="">Select a type</option>
                {businessTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Primary contact email" hint="This is your login email and can't be changed here.">
              <input value={supplier.email} disabled readOnly className={inputClass} />
            </Field>
            <Field label="Contact person">
              <input
                value={form.contactName}
                onChange={(e) => updateField("contactName", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Registered address" span2>
              <textarea
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </Field>
            <Field label="City">
              <input
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="State">
                <input
                  value={form.state}
                  onChange={(e) => updateField("state", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Pincode">
                <input
                  inputMode="numeric"
                  value={form.pincode}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            {!isDirty && !isSaving && (
              <span className="text-xs text-slate-400">No changes to save</span>
            )}
            <button
              type="submit"
              disabled={isSaving || !isDirty}
              className="rounded-lg bg-[#3d6bff] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3d6bff]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </SectionCard>

        {/* Company overview */}
        <SectionCard
          icon={Building2}
          title="Company overview"
          description="Shown on your public profile."
        >
          <Field label="Overview description">
            <textarea
              value={form.companyOverview}
              onChange={(e) => updateField("companyOverview", e.target.value)}
              rows={4}
              placeholder="What your company does, your specialty, and what sets you apart…"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Year established">
              <input
                type="number"
                value={form.yearEstablished}
                onChange={(e) => updateField("yearEstablished", e.target.value)}
                placeholder="2015"
                className={inputClass}
              />
            </Field>
            <Field label="Total employees">
              <input
                value={form.totalEmployees}
                onChange={(e) => updateField("totalEmployees", e.target.value)}
                placeholder="11-50 People"
                className={inputClass}
              />
            </Field>
            <Field label="Total annual revenue" span2>
              <input
                value={form.totalAnnualRevenue}
                onChange={(e) => updateField("totalAnnualRevenue", e.target.value)}
                placeholder="US$1 Million - US$2.5 Million"
                className={inputClass}
              />
            </Field>
            <Field label="Main products" span2>
              <input
                value={form.mainProducts}
                onChange={(e) => updateField("mainProducts", e.target.value)}
                placeholder="Electronic Components, Integrated Circuits…"
                className={inputClass}
              />
            </Field>
            <Field label="Certifications" span2>
              <input
                value={form.certifications}
                onChange={(e) => updateField("certifications", e.target.value)}
                placeholder="ISO 9001, RoHS…"
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>

        {/* Compliance & certificates */}
        <SectionCard
          icon={ShieldCheck}
          title="Compliance & certificates"
          description="Upload documents to build buyer trust."
        >
          {/*
            NOTE: uploads are UI-only for now. Once you have an upload endpoint,
            send `certFiles[id]` as multipart FormData inside handleSave (or a
            dedicated handler) and store the returned URLs on the profile.
          */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CERT_SLOTS.map((slot) => (
              <CertificateDropzone
                key={slot.id}
                label={slot.label}
                file={certFiles[slot.id] ?? null}
                error={certErrors[slot.id] ?? null}
                onSelect={(f) => handleCertSelect(slot.id, f)}
                onClear={() => handleCertSelect(slot.id, null)}
              />
            ))}
          </div>
        </SectionCard>
      </form>

      {/* Success toast */}
      {saveSuccess && (
        <div
          role="status"
          className="fixed right-4 top-4 z-40 flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700 shadow-lg"
        >
          <CheckCircle2 size={16} />
          Changes saved
        </div>
      )}

      {/* Sticky save bar — appears only when there are unsaved edits */}
      {isDirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6">
            {saveError && (
              <div
                role="alert"
                className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>Couldn't save your changes: {saveError}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden />
                You have unsaved changes
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={(e) => e.currentTarget.closest("main")?.querySelector("form")?.requestSubmit()}
                  className="rounded-lg bg-[#3d6bff] px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}