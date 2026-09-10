"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  FlaskConical,
  Globe2,
  BarChart3,
  Package,
  LogOut,
  Plus,
  Trash2,
} from "lucide-react";
import { fetchCurrentSupplier, logoutSupplier } from "../../../lib/supplierAuthApi";
import {
  fetchSupplierProfile,
  updateMyProfile,
  type SupplierProfile,
  type SupplierProduct,
  type MainMarket,
} from "../../../lib/supplierProfileApi";

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

// A form-friendly version of SupplierProfile where numeric fields are
// edited as strings (so inputs can be empty) and converted back to
// numbers/null on save.
type FormState = {
  businessName: string;
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
  rdCapacity: string;
  languagesSpoken: string;
  tradeDeptEmployees: string;
  averageLeadTimeDays: string;
  responseRate: string;
  responseTimeHours: string;
  transactionsCount: string;
  totalTransactionAmount: string;
  quotationPerformance: string;
};

function profileToForm(p: SupplierProfile): FormState {
  return {
    businessName: p.businessName ?? "",
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
    rdCapacity: p.rdCapacity ?? "",
    languagesSpoken: p.languagesSpoken ?? "",
    tradeDeptEmployees: p.tradeDeptEmployees ?? "",
    averageLeadTimeDays: p.averageLeadTimeDays?.toString() ?? "",
    responseRate: p.responseRate?.toString() ?? "",
    responseTimeHours: p.responseTimeHours ?? "",
    transactionsCount: p.transactionsCount?.toString() ?? "",
    totalTransactionAmount: p.totalTransactionAmount ?? "",
    quotationPerformance: p.quotationPerformance?.toString() ?? "",
  };
}

export default function SupplierDashboardPage() {
  const router = useRouter();

  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [mainMarkets, setMainMarkets] = useState<MainMarket[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
      setMainMarkets(current.mainMarkets ?? []);

      const { products: theirProducts } = await fetchSupplierProfile(current.id);
      if (!cancelled) setProducts(theirProducts);

      setIsLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function addMarketRow() {
    setMainMarkets((prev) => [...prev, { region: "", percentage: 0 }]);
  }

  function updateMarketRow(index: number, field: keyof MainMarket, value: string) {
    setMainMarkets((prev) =>
      prev.map((m, i) =>
        i === index
          ? { ...m, [field]: field === "percentage" ? Number(value) || 0 : value }
          : m
      )
    );
  }

  function removeMarketRow(index: number) {
    setMainMarkets((prev) => prev.filter((_, i) => i !== index));
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
        rdCapacity: form.rdCapacity || null,
        mainMarkets: mainMarkets.filter((m) => m.region.trim() !== ""),
        languagesSpoken: form.languagesSpoken || null,
        tradeDeptEmployees: form.tradeDeptEmployees || null,
        averageLeadTimeDays: form.averageLeadTimeDays ? Number(form.averageLeadTimeDays) : null,
        responseRate: form.responseRate ? Number(form.responseRate) : null,
        responseTimeHours: form.responseTimeHours || null,
        transactionsCount: form.transactionsCount ? Number(form.transactionsCount) : null,
        totalTransactionAmount: form.totalTransactionAmount || null,
        quotationPerformance: form.quotationPerformance ? Number(form.quotationPerformance) : null,
      });

      setSupplier(updated.supplier);
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

  if (isLoading || !form || !supplier) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading your dashboard…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Building2 size={22} className="text-[#3d6bff]" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Supplier dashboard</h1>
            <p className="mt-0.5 text-sm text-neutral-500">{supplier.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
        >
          <LogOut size={14} />
          Log out
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
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
                value={form.businessName}
                onChange={(e) => updateField("businessName", e.target.value)}
                className={inputClass}
              />
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
                value={form.phone}
                onChange={(e) => updateField("phone", e.target.value)}
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
            <Field label="Pincode">
              <input
                value={form.pincode}
                onChange={(e) => updateField("pincode", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Address" span2>
              <input
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="City">
              <input
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="State">
              <input
                value={form.state}
                onChange={(e) => updateField("state", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Company overview */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Company overview</h2>
          </div>
          <Field label="Overview description" span2>
            <textarea
              value={form.companyOverview}
              onChange={(e) => updateField("companyOverview", e.target.value)}
              rows={4}
              placeholder="What your company does, your specialty, and what sets you apart…"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Business type">
              <input
                value={form.businessType}
                onChange={(e) => updateField("businessType", e.target.value)}
                placeholder="Trading Company, Manufacturer…"
                className={inputClass}
              />
            </Field>
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
            <Field label="Total annual revenue">
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
        </section>

        {/* R&D capacity */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FlaskConical size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">R&amp;D capacity</h2>
          </div>
          <Field label="Description" span2>
            <textarea
              value={form.rdCapacity}
              onChange={(e) => updateField("rdCapacity", e.target.value)}
              rows={4}
              placeholder="R&D team size, lab facilities, patents, custom design capability…"
              className={inputClass}
            />
          </Field>
        </section>

        {/* Trade capacity */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Globe2 size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Trade capacity</h2>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-medium text-neutral-600">Main markets</span>
            {mainMarkets.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={m.region}
                  onChange={(e) => updateMarketRow(i, "region", e.target.value)}
                  placeholder="Southern Europe"
                  className={inputClass}
                />
                <input
                  type="number"
                  value={m.percentage}
                  onChange={(e) => updateMarketRow(i, "percentage", e.target.value)}
                  placeholder="30"
                  className="w-24 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
                />
                <span className="text-sm text-neutral-400">%</span>
                <button
                  type="button"
                  onClick={() => removeMarketRow(i)}
                  className="text-neutral-400 hover:text-red-600"
                  aria-label="Remove market"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addMarketRow}
              className="flex items-center gap-1.5 text-xs font-medium text-[#3d6bff] hover:underline"
            >
              <Plus size={12} />
              Add market
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Languages spoken" span2>
              <input
                value={form.languagesSpoken}
                onChange={(e) => updateField("languagesSpoken", e.target.value)}
                placeholder="English, Hindi, Chinese…"
                className={inputClass}
              />
            </Field>
            <Field label="Trade department size">
              <input
                value={form.tradeDeptEmployees}
                onChange={(e) => updateField("tradeDeptEmployees", e.target.value)}
                placeholder="6-10 People"
                className={inputClass}
              />
            </Field>
            <Field label="Average lead time (days)">
              <input
                type="number"
                value={form.averageLeadTimeDays}
                onChange={(e) => updateField("averageLeadTimeDays", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Business performance */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Business performance</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Response rate (%)">
              <input
                type="number"
                min="0"
                max="100"
                value={form.responseRate}
                onChange={(e) => updateField("responseRate", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Response time">
              <input
                value={form.responseTimeHours}
                onChange={(e) => updateField("responseTimeHours", e.target.value)}
                placeholder="≤4h"
                className={inputClass}
              />
            </Field>
            <Field label="Transactions">
              <input
                type="number"
                value={form.transactionsCount}
                onChange={(e) => updateField("transactionsCount", e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Total transaction amount">
              <input
                value={form.totalTransactionAmount}
                onChange={(e) => updateField("totalTransactionAmount", e.target.value)}
                placeholder="60,000+"
                className={inputClass}
              />
            </Field>
            <Field label="Quotations given">
              <input
                type="number"
                value={form.quotationPerformance}
                onChange={(e) => updateField("quotationPerformance", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {saveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </div>
        )}
        {saveSuccess && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            Saved successfully.
          </div>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* Products — live data, managed from the supply chain catalog */}
      <section className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">Your products</h2>
          </div>
          <Link
            href="/supply-chain"
            className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3d6bff]/90"
          >
            <Plus size={14} />
            Add product
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-neutral-400">
            You haven't listed any products yet — add one from the supply chain catalog.
          </p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-neutral-900">{p.item}</div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {p.category ?? "Uncategorized"} · MOQ {p.moq} · {p.leadTimeDays}d lead time
                  </div>
                </div>
                <span className="text-sm font-medium text-neutral-900">
                  ₹{p.unitPrice.toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-center text-xs text-neutral-400">
        <Link href={`/suppliers/${supplier.id}`} className="text-[#3d6bff] hover:underline">
          View your public profile page
        </Link>
      </p>
    </main>
  );
}