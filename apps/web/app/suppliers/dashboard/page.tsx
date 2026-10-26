"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IncomingOrders } from "../../../components/IncomingOrders";
import { RfqInbox } from "../../../components/RfqInbox";
import { formatMoney } from "../../../lib/format";
import {
  AlertCircle,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Package,
  Pencil,
  Plus,
  ShieldCheck,
  ShoppingCart,
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
/*  Constants & design tokens                                                 */
/* -------------------------------------------------------------------------- */

const BRAND = "#3d6bff";

/**
 * Height of the global site header rendered by your app layout (the "METIS"
 * wordmark bar). The sidebar sits directly beneath it. Adjust if it changes.
 */
const SITE_HEADER_H = 66;

const VIEW_LABEL: Record<"overview" | "catalog" | "profile", string> = {
  overview: "Overview",
  catalog: "Product catalog",
  profile: "Company profile",
};

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/15 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:border-slate-200";

const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40";

const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#2f58e0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40 disabled:cursor-not-allowed disabled:opacity-50";

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

type View = "overview" | "catalog" | "profile";
const VIEWS: View[] = ["overview", "catalog", "profile"];

/**
 * Optional dashboard numbers. Wire these to your RFQ / order endpoints.
 * `null` renders as "—" so the cards never show made-up figures.
 */
type DashboardStats = {
  openRfqs: number | null;
  awaitingQuote: number | null;
  activeOrders: number | null;
  /** Requests received per month, oldest first. Omit to show the empty state. */
  quoteActivity?: { month: string; count: number }[];
};

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
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  action,
  children,
  flush,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#3d6bff]/10 text-[#3d6bff]">
            <Icon size={17} />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className={flush ? "" : "space-y-5 p-5 sm:p-6"}>{children}</div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  href?: string;
  tone: "blue" | "amber" | "emerald" | "slate";
}) {
  const tones = {
    blue: "bg-[#3d6bff]/10 text-[#3d6bff]",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const body = (
    <div className="flex items-center gap-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={19} />
      </span>
      <div className="min-w-0">
        <p
          className={`text-2xl font-semibold tabular-nums leading-tight tracking-tight ${
            value === "—" ? "text-slate-300" : "text-slate-900"
          }`}
        >
          {value}
        </p>
        <p className="truncate text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
  const cls = "block rounded-2xl border border-slate-200 bg-white p-4 transition";
  return href ? (
    <Link
      href={href}
      className={`${cls} hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
  href,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  badge?: number | null;
}) {
  const cls = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40 ${
    active ? "bg-[#3d6bff]/10 text-[#3d6bff]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  }`;
  const inner = (
    <>
      <Icon size={17} />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
          {badge}
        </span>
      )}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-current={active ? "page" : undefined}>
      {inner}
    </button>
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
            <span className="max-w-full truncate text-xs font-medium text-slate-800">{file.name}</span>
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

function QuoteActivity({ data }: { data?: { month: string; count: number }[] }) {
  const total = data?.reduce((s, d) => s + d.count, 0) ?? 0;
  const max = Math.max(1, ...(data?.map((d) => d.count) ?? [1]));
  return (
    <Card icon={FileText} title="Quote activity" description="Requests received, last 7 months">
      {data && data.length > 0 ? (
        <>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">
            {total}
            <span className="ml-2 text-sm font-normal text-slate-500">requests received</span>
          </p>
          <div className="flex h-40 items-end gap-3" role="img" aria-label="Requests received per month">
            {data.map((d, i) => {
              const isLast = i === data.length - 1;
              return (
                <div key={d.month} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end rounded-lg bg-slate-50">
                    <div
                      className={`w-full rounded-lg ${isLast ? "bg-[#3d6bff]" : "bg-[#3d6bff]/40"}`}
                      style={{ height: `${Math.max(6, (d.count / max) * 100)}%` }}
                      title={`${d.month}: ${d.count}`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">{d.month}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          Your monthly request volume will show here once buyers start sending RFQs.
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form state                                                                */
/* -------------------------------------------------------------------------- */

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

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function SupplierDashboardPage() {
  const router = useRouter();

  const [supplier, setSupplier] = useState<SupplierProfile | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [view, setView] = useState<View>("overview");

  // TODO: load these from your RFQ / orders APIs.
  const [stats] = useState<DashboardStats>({
    openRfqs: null,
    awaitingQuote: null,
    activeOrders: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Certificate uploads (UI-only for now — see Compliance section)
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
        // Products are secondary — the rest of the dashboard should still work.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Restore the active view from the URL hash (#catalog, #profile)
  useEffect(() => {
    const h = window.location.hash.slice(1) as View;
    if (VIEWS.includes(h)) setView(h);
  }, []);

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
    const filled = checks.filter((v) => v.trim() !== "").length + (products.length > 0 ? 1 : 0);
    return Math.round((filled / (checks.length + 1)) * 100);
  }, [form, products]);

  const health = useMemo(() => {
    if (!form) return null;
    const detailFields = [
      form.businessName,
      form.region,
      form.gstNumber,
      form.businessType,
      form.contactName,
      form.phone,
      form.address,
      form.city,
      form.state,
      form.pincode,
    ];
    return {
      details: detailFields.every((v) => v.trim() !== ""),
      catalog: products.length > 0,
      certs: Object.values(certFiles).filter(Boolean).length,
    };
  }, [form, products, certFiles]);

  /* -------------------------------- effects -------------------------------- */

  useEffect(() => {
    if (!saveSuccess) return;
    const t = setTimeout(() => setSaveSuccess(false), 3500);
    return () => clearTimeout(t);
  }, [saveSuccess]);

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

  function go(next: View) {
    setView(next);
    window.history.replaceState(null, "", next === "overview" ? window.location.pathname : `#${next}`);
    window.scrollTo({ top: 0 });
  }

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

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form) return;

    // Validate here (not via the `required` attribute) so saving also works
    // from the sticky bar while another tab is showing.
    if (!form.businessName.trim() || !form.region.trim()) {
      setSaveError("Company name and region are required.");
      go("profile");
      return;
    }

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

  if (isLoading || !form || !supplier || !health) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div
          className="flex animate-pulse gap-8 px-4 py-8 sm:px-6"
          role="status"
          aria-label="Loading your dashboard"
        >
          <div className="hidden w-64 shrink-0 space-y-4 lg:block">
            <div className="h-28 rounded-2xl bg-slate-200/70" />
            <div className="h-64 rounded-2xl bg-slate-200/70" />
          </div>
          <div className="flex-1 space-y-5">
            <div className="h-10 w-72 rounded-lg bg-slate-200" />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-36 rounded-2xl bg-slate-200/70" />
              ))}
            </div>
            <div className="h-72 rounded-2xl bg-slate-200/70" />
          </div>
        </div>
      </main>
    );
  }

  const businessTypeOptions =
    form.businessType && !BUSINESS_TYPES.includes(form.businessType)
      ? [form.businessType, ...BUSINESS_TYPES]
      : BUSINESS_TYPES;

  const displayName = supplier.contactName?.trim() || supplier.businessName;
  const firstName = displayName.split(/\s+/)[0];
  const fmt = (n: number | null) => (n == null ? "—" : String(n));
  const hasActivity = (stats.quoteActivity?.length ?? 0) > 0;
  const strengthLabel = completeness >= 90 ? "Excellent" : completeness >= 60 ? "Good" : "Needs work";

  const navItems = (
    <>
      <NavItem icon={LayoutGrid} label="Overview" active={view === "overview"} onClick={() => go("overview")} />
      <NavItem icon={FileText} label="RFQ inbox" href="/suppliers/rfqs" badge={stats.openRfqs} />
      <NavItem icon={Package} label="Product catalog" active={view === "catalog"} onClick={() => go("catalog")} />
      <NavItem icon={ShoppingCart} label="Orders" href="/suppliers/orders" badge={stats.activeOrders} />
      <NavItem icon={Building2} label="Company profile" active={view === "profile"} onClick={() => go("profile")} />
    </>
  );

  /* --------------------------------- render -------------------------------- */

  return (
    <div
      className="relative min-h-screen bg-slate-50 text-slate-900"
      style={{ "--site-h": `${SITE_HEADER_H}px` } as React.CSSProperties}
    >
      {/* Account controls — rendered into the right end of the global METIS header row */}
      <div className="absolute right-0 top-[calc(-1*var(--site-h))] z-50 flex h-[var(--site-h)] items-center pr-4 sm:pr-6">
          <div className="flex items-center gap-1 sm:gap-2">
            <a
              href="mailto:support@metis.com"
              aria-label="Help"
              className="rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <HelpCircle size={19} />
            </a>
            <button
              type="button"
              aria-label="Notifications"
              className="relative rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <Bell size={19} />
              {(stats.awaitingQuote ?? 0) > 0 && (
                <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[#3d6bff] ring-2 ring-white" />
              )}
            </button>
            <div className="ml-1 flex items-center gap-3 border-l border-slate-200 pl-3 sm:ml-2 sm:pl-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                {initials(displayName)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium">{displayName}</span>
                <span className="block text-xs text-slate-500">{supplier.email}</span>
              </span>
            </div>
          </div>
      </div>

      <div className="flex">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-[var(--site-h)] hidden h-[calc(100vh-var(--site-h))] w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-slate-200 bg-white p-5 lg:flex">
          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">Profile strength</span>
              <span className="text-xs font-medium text-emerald-600">{strengthLabel}</span>
            </div>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{completeness}%</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${completeness}%`, backgroundColor: completeness === 100 ? "#10b981" : BRAND }}
              />
            </div>
            {completeness < 100 && (
              <button
                type="button"
                onClick={() => go("profile")}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#3d6bff] hover:underline"
              >
                Complete profile
                <ChevronRight size={14} />
              </button>
            )}
          </div>

          <nav aria-label="Workspace" className="space-y-1">
            <p className="px-3 pb-1 text-xs font-medium text-slate-400">Workspace</p>
            {navItems}
          </nav>

          <div className="mt-auto space-y-1 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <LogOut size={17} />
              Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
        {/* Workspace bar — page context + account controls (no second logo) */}
        <div className="flex h-14 items-center border-b border-slate-200 bg-white px-4 sm:px-8">
          <p className="truncate text-sm text-slate-500">
            Supplier workspace
            <span className="mx-2 text-slate-300">/</span>
            <span className="font-medium text-slate-900">{VIEW_LABEL[view]}</span>
          </p>
        </div>

        <main className="mx-auto max-w-[1280px] px-4 pb-48 pt-6 sm:px-8 sm:pt-8">
          {/* Mobile nav */}
          <nav
            aria-label="Workspace"
            className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            {[
              { label: "Overview", v: "overview" as View },
              { label: "Catalog", v: "catalog" as View },
              { label: "Company profile", v: "profile" as View },
            ].map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => go(t.v)}
                aria-current={view === t.v ? "page" : undefined}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                  view === t.v
                    ? "bg-[#3d6bff] text-white"
                    : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {t.label}
              </button>
            ))}
            <Link
              href="/suppliers/rfqs"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
            >
              RFQs
            </Link>
            <Link
              href="/suppliers/orders"
              className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
            >
              Orders
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600"
            >
              Sign out
            </button>
          </nav>

          {/* ------------------------------ OVERVIEW ------------------------------ */}
          {view === "overview" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {greeting()}, {firstName}.
                  </h1>
                  <p className="mt-2 max-w-xl text-sm text-slate-500 sm:text-base">
                    Stay on top of buyer demand, keep your catalog fresh, and turn the next request into an order.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/suppliers/${supplier.id}`} className={btnSecondary}>
                    <ExternalLink size={15} />
                    View public profile
                  </Link>
                  <Link href="/supply-chain" className={btnPrimary}>
                    <Plus size={16} />
                    Add product
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard icon={FileText} tone="blue" label="Open RFQs" value={fmt(stats.openRfqs)} href="/suppliers/rfqs" />
                <StatCard icon={Bell} tone="amber" label="Awaiting your quote" value={fmt(stats.awaitingQuote)} href="/suppliers/rfqs" />
                <StatCard icon={ShoppingCart} tone="emerald" label="Active orders" value={fmt(stats.activeOrders)} href="/suppliers/orders" />
                <StatCard icon={CheckCircle2} tone="slate" label="Profile completeness" value={`${completeness}%`} />
              </div>

              <div className="grid items-start gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  {hasActivity ? (
                    <QuoteActivity data={stats.quoteActivity} />
                  ) : (
                    <RfqInbox limit={3} viewAllHref="/suppliers/rfqs" />
                  )}
                </div>
                <Card
                  icon={ShieldCheck}
                  title="Profile health"
                                    action={
                    <button
                      type="button"
                      onClick={() => go("profile")}
                      aria-label="Edit company profile"
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#3d6bff]"
                    >
                      <Pencil size={15} />
                    </button>
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <p className="text-4xl font-semibold tabular-nums">
                      {completeness}
                      <span className="text-xl text-slate-400">%</span>
                    </p>
                    <span className="text-sm text-slate-500">{strengthLabel}</span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={completeness}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Profile completeness"
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${completeness}%`, backgroundColor: completeness === 100 ? "#10b981" : BRAND }}
                    />
                  </div>
                  <ul className="space-y-3 text-sm">
                    {[
                      { label: "Business details", ok: health.details, to: "profile" as View },
                      { label: "Product catalog", ok: health.catalog, to: "catalog" as View },
                    ].map((r) => (
                      <li key={r.label} className="flex items-center justify-between">
                        <span className="text-slate-600">{r.label}</span>
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                            <Check size={14} /> Complete
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => go(r.to)}
                            className="font-medium text-[#3d6bff] hover:underline"
                          >
                            Finish
                          </button>
                        )}
                      </li>
                    ))}
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">Certifications</span>
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          health.certs === CERT_SLOTS.length ? "text-emerald-600" : "text-slate-600"
                        }`}
                      >
                        {health.certs === CERT_SLOTS.length && <Check size={14} />}
                        {health.certs} / {CERT_SLOTS.length}
                      </span>
                    </li>
                  </ul>
                </Card>
              </div>

              {hasActivity ? (
                <div className="grid items-start gap-6 2xl:grid-cols-2">
                  <RfqInbox limit={3} viewAllHref="/suppliers/rfqs" />
                  <IncomingOrders />
                </div>
              ) : (
                <IncomingOrders />
              )}
            </div>
          )}

          {/* ------------------------------- CATALOG ------------------------------ */}
          {view === "catalog" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Product catalog</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {products.length} {products.length === 1 ? "product" : "products"} listed for buyers.
                  </p>
                </div>
                <Link href="/supply-chain" className={btnPrimary}>
                  <Plus size={16} />
                  Add product
                </Link>
              </div>

              <Card icon={Package} title="All products" flush>
                {products.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Package size={19} />
                    </span>
                    <p className="text-sm font-medium text-slate-700">No products listed yet</p>
                    <p className="max-w-xs text-xs text-slate-500">
                      Add your first product so buyers can find it and request a quote.
                    </p>
                    <Link href="/supply-chain" className={`${btnPrimary} mt-3`}>
                      <Plus size={16} />
                      Add product
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-medium text-slate-500">
                          <th className="px-6 py-3 font-medium">Product name</th>
                          <th className="px-3 py-3 font-medium">Category</th>
                          <th className="px-3 py-3 font-medium">MOQ</th>
                          <th className="px-3 py-3 font-medium">Lead time</th>
                          <th className="px-3 py-3 text-right font-medium">Unit price</th>
                          <th className="px-6 py-3 text-right font-medium">
                            <span className="sr-only">Actions</span>
                          </th>
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
              </Card>
            </div>
          )}

          {/* ------------------------------- PROFILE ------------------------------ */}
          {view === "profile" && (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">Company profile</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    What buyers see on your public profile.
                  </p>
                </div>
                <Link href={`/suppliers/${supplier.id}`} className={btnSecondary}>
                  <ExternalLink size={15} />
                  View public profile
                </Link>
              </div>

              <Card icon={Building2} title="Business details">
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
              </Card>

              <Card icon={FileText} title="Company overview" description="Shown on your public profile.">
                <Field label="Overview">
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
              </Card>

              <Card
                icon={ShieldCheck}
                title="Compliance & certificates"
                description="Upload documents to build buyer trust."
              >
                {/*
                  NOTE: uploads are UI-only for now. Once you have an upload endpoint,
                  send `certFiles[id]` as multipart FormData in handleSave (or a
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
              </Card>
            </form>
          )}
        </main>
        </div>
      </div>

      {/* Success toast */}
      {saveSuccess && (
        <div
          role="status"
          className="fixed right-4 top-20 z-40 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-700 shadow-lg"
        >
          <CheckCircle2 size={16} />
          Changes saved
        </div>
      )}

      {/* Sticky save bar — only while there are unsaved edits, on any tab */}
      {isDirty && (
        <div className="fixed inset-x-4 bottom-28 z-30 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="px-4 py-3 sm:px-5">
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
                  className={`${btnSecondary} disabled:opacity-50`}
                >
                  Discard
                </button>
                <button type="button" disabled={isSaving} onClick={() => handleSave()} className={btnPrimary}>
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}