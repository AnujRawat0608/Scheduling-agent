"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Boxes,
  CheckCircle2,
  Timer,
  Search,
  Upload,
  Download,
  Sparkles,
  Pencil,
  Trash2,
  UserPlus,
  LogIn,
  LayoutDashboard,
  Plus,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Network,
  Package,
  X,
} from "lucide-react";
import { fetchCurrentSupplier, type Supplier } from "../../lib/supplierAuthApi";
import {
  listSupplyChainOffers,
  deleteSupplyChainOffer,
  resolveImageUrl,
  type SupplierOffer,
} from "../../lib/supplyChainApi";

type SupplyChainOffer = SupplierOffer;

type SortOption = "ai-desc" | "price-desc" | "price-asc" | "lead-asc" | "stock-desc";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
        checked ? "bg-[#3d6bff]" : "bg-neutral-200"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function VerifiedBadge({ status }: { status: string | null }) {
  if (status !== "verified") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <CheckCircle2 size={11} />
      Verified
    </span>
  );
}

function ProductThumb({ url, alt }: { url?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  // While the viewer is open: Esc closes it and the page behind doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!url || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
        <Package size={18} />
      </div>
    );
  }

  const src = resolveImageUrl(url);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 cursor-zoom-in rounded-lg transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]"
        aria-label={`View full-size image of ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="h-12 w-12 rounded-lg border border-neutral-100 object-cover"
        />
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={alt}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/75 p-4"
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Close"
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <p className="text-sm font-medium text-white/90">{alt}</p>
          </div>,
          document.body
        )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {label}
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3d6bff]">
          {icon}
        </span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-neutral-900">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>
    </div>
  );
}

function formatUSD(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toCsv(offers: SupplyChainOffer[]): string {
  const headers = [
    "item",
    "description",
    "category",
    "supplierName",
    "supplierType",
    "unitPrice",
    "unitOfMeasure",
    "shippingCost",
    "leadTimeDays",
    "dispatchStatus",
    "quantityAvailable",
    "moq",
    "aiScore",
  ];
  const rows = offers.map((o) =>
    headers
      .map((h) => {
        const value = (o as unknown as Record<string, unknown>)[h];
        const cell = value === undefined || value === null ? "" : String(value);
        return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ---------- Signed-out hero ---------- */
function SupplyChainHero() {
  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-neutral-200 bg-white px-8 py-16 text-center sm:px-16">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-medium text-[#3d6bff]">
          <Network size={13} />
          Supply chain network
        </span>
        <h1 className="mx-auto mt-4 max-w-xl text-3xl font-bold text-neutral-900 sm:text-4xl">
          One catalog for every supplier offer in your network
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-neutral-500">
          Suppliers list what they can ship, when, and at what price. Procurement teams filter,
          compare, and get AI-matched to the best offer — all in one place.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/suppliers/register"
            className="flex items-center gap-1.5 rounded-full bg-[#3d6bff] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
          >
            <UserPlus size={15} />
            Register as a supplier
          </Link>
          <Link
            href="/suppliers/login"
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-neutral-300"
          >
            <LogIn size={15} />
            Log in
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3d6bff]">
            <Boxes size={17} />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-neutral-900">List your offers</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Add products with pricing, lead time, stock, and specs so buyers can find you.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3d6bff]">
            <Timer size={17} />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-neutral-900">Keep buyers updated</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Update stock, lead time, and dispatch status as things change on your end.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eef2ff] text-[#3d6bff]">
            <Sparkles size={17} />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-neutral-900">Get AI-matched</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Well-specified offers get matched to procurement requests automatically.
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-neutral-400">
        Already listed with us?{" "}
        <Link href="/suppliers/login" className="font-medium text-[#3d6bff] hover:underline">
          Log in
        </Link>{" "}
        to manage your offers.
      </p>
    </div>
  );
}

export default function SupplyChainPage() {
  const queryClient = useQueryClient();

  const [loggedInSupplier, setLoggedInSupplier] = useState<Supplier | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    fetchCurrentSupplier()
      .then((supplier) => {
        if (supplier) setLoggedInSupplier(supplier);
      })
      .catch(() => {
        // Not logged in — the hero is shown.
      })
      .finally(() => setAuthChecked(true));
  }, []);

  // ---- Toolbar / filter state ----
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("ai-desc");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ---- Pagination ----
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Only fetch once we know a supplier is logged in.
  const { data, isLoading, error } = useQuery({
    queryKey: ["supply-chain"],
    queryFn: listSupplyChainOffers,
    enabled: authChecked && !!loggedInSupplier,
  });

  // Only this supplier's own offers. (Also enforce this on the backend.)
  const offers = useMemo(() => {
    if (!loggedInSupplier) return [];
    return ((data ?? []) as SupplyChainOffer[]).filter(
      (o) => o.supplierId === loggedInSupplier.id
    );
  }, [data, loggedInSupplier]);

  const remove = useMutation({
    mutationFn: deleteSupplyChainOffer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supply-chain"] }),
  });

  function handleDelete(id: string | number, name: string) {
    if (window.confirm(`Remove "${name}" from your catalog?`)) {
      remove.mutate(id as never);
    }
  }

  const categories = useMemo(() => {
    const set = new Set(offers.map((o) => o.category).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [offers]);

  const filteredOffers = useMemo(() => {
    let result = [...offers];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.item.toLowerCase().includes(q) ||
          (o.description ?? "").toLowerCase().includes(q) ||
          (o.category ?? "").toLowerCase().includes(q) ||
          Object.entries(o.specs ?? {}).some(
            ([k, v]) => k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)
          )
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((o) => o.category === categoryFilter);
    }

    if (inStockOnly) {
      result = result.filter((o) => o.quantityAvailable > 0);
    }

    result.sort((a, b) => {
      switch (sortOption) {
        case "ai-desc":
          return (b.aiScore ?? -1) - (a.aiScore ?? -1);
        case "price-desc":
          return b.unitPrice - a.unitPrice;
        case "price-asc":
          return a.unitPrice - b.unitPrice;
        case "lead-asc":
          return a.leadTimeDays - b.leadTimeDays;
        case "stock-desc":
          return b.quantityAvailable - a.quantityAvailable;
        default:
          return 0;
      }
    });

    return result;
  }, [offers, searchQuery, categoryFilter, inStockOnly, sortOption]);

  // Reset to page 1 whenever filters change so we never land on an empty page.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, inStockOnly, sortOption, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredOffers.length / rowsPerPage));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * rowsPerPage;
  const paginatedOffers = filteredOffers.slice(pageStart, pageStart + rowsPerPage);

  function handleExportCsv() {
    const csv = toCsv(filteredOffers.length > 0 ? filteredOffers : offers);
    downloadCsv(csv, `my-products-${new Date().toISOString().slice(0, 10)}.csv`);
    setShowMoreMenu(false);
  }

  // ---- Stat cards: computed from this supplier's offers ----
  const stats = useMemo(() => {
    const totalOffers = offers.length;
    const categoryCount = categories.length;

    const inStockCount = offers.filter((o) => o.quantityAvailable > 0).length;
    const inStockPct = totalOffers === 0 ? 0 : Math.round((inStockCount / totalOffers) * 100);

    const avgLeadTime =
      totalOffers === 0
        ? 0
        : Math.round(offers.reduce((sum, o) => sum + o.leadTimeDays, 0) / totalOffers);

    const aiMatchedCount = offers.filter((o) => o.aiScore !== null && o.aiScore >= 85).length;

    return {
      totalOffers: String(totalOffers),
      totalOffersSub: `${categoryCount} categor${categoryCount === 1 ? "y" : "ies"}`,
      inStock: String(inStockCount),
      inStockSub: `${inStockPct}% of catalog`,
      avgLeadTime: `${avgLeadTime}d`,
      avgLeadTimeSub: "Across active offers",
      aiMatched: String(aiMatchedCount),
      aiMatchedSub: "Score ≥ 85%",
    };
  }, [offers, categories]);

  if (!authChecked) {
    return <main className="mx-auto max-w-6xl px-6 py-16" />;
  }

  if (!loggedInSupplier) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <SupplyChainHero />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-16">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-[#3d6bff]">
            Catalog
          </span>
          <h1 className="mt-1 text-3xl font-bold text-neutral-900">My Products</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Manage the products you've listed, filter by category and keep your stock and
            lead times up to date.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/suppliers/dashboard"
            className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
          >
            <LayoutDashboard size={14} />
            {loggedInSupplier.businessName}
          </Link>

          <Link
            href="/supply-chain/new"
            className="flex items-center gap-1.5 rounded-full bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
          >
            <Plus size={15} />
            Add product
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Boxes size={16} />}
          label="Total Products"
          value={stats.totalOffers}
          sub={stats.totalOffersSub}
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          label="In Stock"
          value={stats.inStock}
          sub={stats.inStockSub}
        />
        <StatCard
          icon={<Timer size={16} />}
          label="Avg Lead Time"
          value={stats.avgLeadTime}
          sub={stats.avgLeadTimeSub}
        />
        <StatCard
          icon={<Sparkles size={16} />}
          label="AI Matched"
          value={stats.aiMatched}
          sub={stats.aiMatchedSub}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4">
            <div className="relative min-w-[220px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, specs…"
                className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-8 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 outline-none transition focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
            >
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 outline-none transition focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
            >
              <option value="ai-desc">AI Score · High → Low</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="lead-asc">Lead time: Fastest</option>
              <option value="stock-desc">Stock: Most available</option>
            </select>

            <label className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600">
              In-Stock Only
              <Toggle checked={inStockOnly} onChange={setInStockOnly} />
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMoreMenu((v) => !v)}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 hover:text-neutral-900"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 z-10 mt-2 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    disabled
                    title="Bulk CSV import needs a backend endpoint — coming soon"
                    className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-400"
                  >
                    <Upload size={13} />
                    Bulk CSV Import
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    <Download size={13} />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    disabled
                    title="AI matching needs a backend endpoint — coming soon"
                    className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-400"
                  >
                    <Sparkles size={13} />
                    Test AI Matching
                  </button>
                </div>
              )}
            </div>
          </div>

          {offers.length === 0 ? (
            <div className="border-t border-neutral-200 p-8 text-center">
              <p className="text-sm text-neutral-500">
                You haven&apos;t listed any products yet.{" "}
                <Link href="/supply-chain/new" className="font-medium text-[#3d6bff] hover:underline">
                  Add your first product
                </Link>
                .
              </p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <p className="border-t border-neutral-200 px-6 py-10 text-center text-sm text-neutral-400">
              No products match your filters.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="border-t border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-6 py-2.5">Product / Item</th>
                    <th className="px-6 py-2.5">Unit price</th>
                    <th className="px-6 py-2.5">Lead time</th>
                    <th className="px-6 py-2.5">Stock &amp; MOQ</th>
                    <th className="px-6 py-2.5">AI Score</th>
                    <th className="px-6 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOffers.map((o) => {
                    const inStock = o.quantityAvailable > 0;
                    return (
                      <tr key={o.id} className="border-t border-neutral-100 align-top">
                        <td className="px-6 py-3">
                          <div className="flex gap-3">
                            <ProductThumb url={o.imageUrl} alt={o.item} />
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-neutral-900">{o.item}</span>
                                  <VerifiedBadge status={o.verificationStatus} />
                                </div>
                                {o.description && (
                                  <div className="mt-0.5 line-clamp-1 max-w-xs text-xs text-neutral-400">
                                    {o.description}
                                  </div>
                                )}
                                {o.category && (
                                  <span className="mt-1.5 inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                                    {o.category}
                                  </span>
                                )}
                                {o.specs && Object.keys(o.specs).length > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {Object.entries(o.specs).map(([k, v]) => (
                                      <span
                                        key={k}
                                        className="rounded bg-neutral-50 px-1.5 py-0.5 text-[10px] text-neutral-500"
                                      >
                                        {k}: {v}
                                      </span>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="text-neutral-900">
                            {formatUSD(o.unitPrice)}
                            <span className="ml-1 text-xs font-normal text-neutral-400">
                              / {o.unitOfMeasure ?? "piece"}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-400">
                            {o.shippingCost ? `+ ${formatUSD(o.shippingCost)} ship` : "Free shipping"}
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="text-neutral-900">{o.leadTimeDays}d</div>
                          <div className="text-xs text-neutral-400">{o.dispatchStatus ?? "—"}</div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-1.5 text-neutral-900">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                inStock ? "bg-green-500" : "bg-amber-400"
                              }`}
                            />
                            {inStock ? `${o.quantityAvailable} avail` : "Backorder"}
                          </div>
                          <div className="text-xs text-neutral-400">MOQ: {o.moq}</div>
                        </td>
                        <td className="px-6 py-3">
                          {o.aiScore !== null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-2 py-0.5 text-xs font-medium text-[#3d6bff]">
                              <Sparkles size={10} />
                              {o.aiScore}%
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-300">—</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-3">
                            {/* TODO: link to /supply-chain/[id]/edit once that page exists */}
                            <button
                              type="button"
                              title="Edit offer"
                              className="text-neutral-400 transition hover:text-[#3d6bff]"
                              aria-label="Edit offer"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(o.id, o.item)}
                              disabled={remove.isPending}
                              className="text-neutral-400 transition hover:text-red-600 disabled:opacity-40"
                              aria-label="Remove offer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-6 py-4">
                <p className="text-xs text-neutral-500">
                  Showing{" "}
                  <span className="font-medium text-neutral-700">
                    {filteredOffers.length === 0 ? 0 : pageStart + 1}–
                    {Math.min(pageStart + rowsPerPage, filteredOffers.length)}
                  </span>{" "}
                  of <span className="font-medium text-neutral-700">{filteredOffers.length}</span>
                </p>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={pageSafe <= 1}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3d6bff] text-xs font-medium text-white">
                      {pageSafe}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={pageSafe >= totalPages}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition hover:border-neutral-300 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-neutral-500">
                    Rows per page:
                    <select
                      value={rowsPerPage}
                      onChange={(e) => setRowsPerPage(Number(e.target.value))}
                      className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 outline-none"
                    >
                      {ROWS_PER_PAGE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}