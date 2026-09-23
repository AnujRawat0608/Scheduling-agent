"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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
  X,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { fetchCurrentSupplier, type Supplier } from "../../lib/supplierAuthApi";
import {
  listSupplyChainOffers,
  createSupplyChainOffer,
  deleteSupplyChainOffer,
  type SupplierOffer,
} from "../../lib/supplyChainApi";

type SupplyChainOffer = SupplierOffer;

type SortOption = "ai-desc" | "price-desc" | "price-asc" | "lead-asc" | "stock-desc";

const UNIT_OF_MEASURE_OPTIONS = [
  { value: "piece", label: "Piece" },
  { value: "box_of_10", label: "Box of 10" },
  { value: "box_of_100", label: "Box of 100" },
  { value: "kg", label: "Kilogram" },
  { value: "meter", label: "Meter" },
  { value: "liter", label: "Liter" },
];

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

function specsToObject(
  rows: { key: string; value: string }[]
): Record<string, string> | undefined {
  const entries = rows
    .map((r) => [r.key.trim(), r.value.trim()] as const)
    .filter(([k, v]) => k && v);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

export default function SupplyChainPage() {
  const queryClient = useQueryClient();

  // ---- Add Offer modal form state ----
  const [showAddModal, setShowAddModal] = useState(false);
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("piece");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [moq, setMoq] = useState("1");
  const [quantityAvailable, setQuantityAvailable] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState("Dispatch ready");
  const [aiScore, setAiScore] = useState("");
  const [specRows, setSpecRows] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [taxType, setTaxType] = useState("None");
const [taxRate, setTaxRate] = useState("0");
const [taxInclusive, setTaxInclusive] = useState(false);

  const [loggedInSupplier, setLoggedInSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    fetchCurrentSupplier()
      .then((supplier) => {
        if (supplier) {
          setLoggedInSupplier(supplier);
          setSupplierName((prev) => prev || supplier.businessName);
        }
      })
      .catch(() => {
        // Not logged in — leave form as anonymous entry.
      });
  }, []);

  // ---- Toolbar / filter state ----
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("ai-desc");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [myOffersOnly, setMyOffersOnly] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ---- Pagination ----
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const { data, isLoading, error } = useQuery({
    queryKey: ["supply-chain"],
    queryFn: listSupplyChainOffers,
  });

  const offers = (data ?? []) as SupplyChainOffer[];

  const create = useMutation({
    mutationFn: createSupplyChainOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply-chain"] });
      setItem("");
      setDescription("");
      setCategory("");
      setSupplierName(loggedInSupplier?.businessName ?? "");
      setSupplierType("");
      setUnitPrice("");
      setUnitOfMeasure("piece");
      setLeadTimeDays("");
      setShippingCost("0");
      setMoq("1");
      setQuantityAvailable("");
      setDispatchStatus("Dispatch ready");
      setAiScore("");
      setSpecRows([{ key: "", value: "" }]);
      setShowAddModal(false);
      setSpecRows([{ key: "", value: "" }]);
      setTaxType("None");
      setTaxRate("0");
      setTaxInclusive(false);
      setShowAddModal(false);
    },
  });

  const remove = useMutation({
    mutationFn: deleteSupplyChainOffer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supply-chain"] }),
  });

  function updateSpecRow(index: number, field: "key" | "value", value: string) {
    setSpecRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { key: "", value: "" }]);
  }

  function removeSpecRow(index: number) {
    setSpecRows((rows) => rows.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  create.mutate({
    item,
    description,
    category,
    supplierName,
    supplierType,
    unitPrice: Number(unitPrice),
    unitOfMeasure,
    leadTimeDays: Number(leadTimeDays),
    shippingCost: Number(shippingCost),
    moq: Number(moq),
    quantityAvailable: Number(quantityAvailable),
    dispatchStatus,
    aiScore: aiScore ? Number(aiScore) : undefined,
    specs: specsToObject(specRows),
    taxType,
    taxRate: Number(taxRate),
    taxInclusive,
    supplierId: loggedInSupplier?.id,
  });
}

  const categories = useMemo(() => {
    const set = new Set(offers.map((o) => o.category).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [offers]);

  const filteredOffers = useMemo(() => {
    let result = [...offers];

    if (myOffersOnly && loggedInSupplier) {
      result = result.filter((o) => o.supplierId === loggedInSupplier.id);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (o) =>
          o.item.toLowerCase().includes(q) ||
          o.supplierName.toLowerCase().includes(q) ||
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
  }, [offers, searchQuery, categoryFilter, inStockOnly, sortOption, myOffersOnly, loggedInSupplier]);

  // Reset to page 1 whenever filters change so we never land on an empty page.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, inStockOnly, myOffersOnly, sortOption, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filteredOffers.length / rowsPerPage));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * rowsPerPage;
  const paginatedOffers = filteredOffers.slice(pageStart, pageStart + rowsPerPage);

  function handleExportCsv() {
    const csv = toCsv(filteredOffers.length > 0 ? filteredOffers : offers);
    downloadCsv(csv, `supply-chain-offers-${new Date().toISOString().slice(0, 10)}.csv`);
    setShowMoreMenu(false);
  }

  // ---- Stat cards: computed live from the offers data ----
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-[#3d6bff]">
            Catalog
          </span>
          <h1 className="mt-1 text-3xl font-bold text-neutral-900">Supply Chain Catalog</h1>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Manage every supplier offer in one place — filter by category, sort by AI match, and
            keep procurement moving.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {loggedInSupplier ? (
            <Link
              href="/suppliers/dashboard"
              className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
            >
              <LayoutDashboard size={14} />
              {loggedInSupplier.businessName}
            </Link>
          ) : (
            <>
              <Link
                href="/suppliers/login"
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
              >
                <LogIn size={14} />
                Log in
              </Link>
              <Link
                href="/suppliers/register"
                className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
              >
                <UserPlus size={14} />
                Register
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-full bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
          >
            <Plus size={15} />
            Add Offer
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={<Boxes size={16} />}
          label="Total Offers"
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
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, supplier, specs…"
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

            <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 whitespace-nowrap">
              In-Stock Only
              <Toggle checked={inStockOnly} onChange={setInStockOnly} />
            </label>

            {loggedInSupplier && (
              <label className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 whitespace-nowrap">
                My offers only
                <Toggle checked={myOffersOnly} onChange={setMyOffersOnly} />
              </label>
            )}

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
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-400 cursor-not-allowed"
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
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-neutral-400 cursor-not-allowed"
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
                No offers yet. Click &ldquo;Add Offer&rdquo; above to get started.
              </p>
            </div>
          ) : filteredOffers.length === 0 ? (
            <p className="border-t border-neutral-200 px-6 py-10 text-center text-sm text-neutral-400">
              No offers match your filters.
            </p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="border-t border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500">
                  <tr>
                    <th className="px-6 py-2.5">Product / Item</th>
                    <th className="px-6 py-2.5">Supplier</th>
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
                    const isMine = loggedInSupplier && o.supplierId === loggedInSupplier.id;
                    return (
                      <tr key={o.id} className="border-t border-neutral-100 align-top">
                        <td className="px-6 py-3">
                          <div className="font-medium text-neutral-900">{o.item}</div>
                          {o.description && (
                            <div className="mt-0.5 max-w-xs text-xs text-neutral-400 line-clamp-1">
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
                        </td>
                        <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-neutral-900">{o.supplierName}</span>
                              <VerifiedBadge status={o.verificationStatus} />
                            </div>
                            {o.supplierType && (
                              <div className="text-xs text-neutral-400">{o.supplierType}</div>
                            )}
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
                            <button
                              disabled={!isMine}
                              title={isMine ? "Edit offer" : "You can only edit your own offers"}
                              className={
                                isMine
                                  ? "text-neutral-400 hover:text-[#3d6bff] transition"
                                  : "text-neutral-200 cursor-not-allowed"
                              }
                              aria-label="Edit offer"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => remove.mutate(o.id)}
                              className="text-neutral-400 hover:text-red-600 transition"
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

      {/* Add Offer modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
              <h2 className="text-base font-semibold text-neutral-900">Add Offer</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-neutral-700"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 p-6">
              <Field label="Product / item" span2>
                <input
                  required
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Raspberry Pi 5 (8GB RAM)"
                  className={inputClass}
                />
              </Field>

              <Field label="Description" span2>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Broadcom BCM2712 2.4GHz quad-core 64-bit Arm Cortex-A76"
                  className={inputClass}
                />
              </Field>

              <div className="col-span-2 space-y-2">
                <span className="text-xs font-medium text-neutral-600">
                  Specifications (optional, but improves matching)
                </span>
                {specRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row.key}
                      onChange={(e) => updateSpecRow(i, "key", e.target.value)}
                      placeholder="e.g. RAM"
                      className={inputClass}
                    />
                    <input
                      value={row.value}
                      onChange={(e) => updateSpecRow(i, "value", e.target.value)}
                      placeholder="e.g. 8GB"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => removeSpecRow(i)}
                      className="shrink-0 text-neutral-400 hover:text-red-600"
                      aria-label="Remove spec"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSpecRow}
                  className="flex items-center gap-1 text-xs font-medium text-[#3d6bff] hover:underline"
                >
                  <Plus size={13} />
                  Add specification
                </button>
              </div>

              <Field label="Category">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Single Board Computers"
                  className={inputClass}
                />
              </Field>

              <Field label="Supplier name">
                <input
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Acme Electronics"
                  className={inputClass}
                />
              </Field>

              <Field label="Supplier type">
                <input
                  required
                  value={supplierType}
                  onChange={(e) => setSupplierType(e.target.value)}
                  placeholder="Distributor"
                  className={inputClass}
                />
              </Field>

              <Field label="Unit price ($)">
                <input
                  required
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Unit of measure">
  <select
    value={unitOfMeasure}
    onChange={(e) => setUnitOfMeasure(e.target.value)}
    className={inputClass}
  >
    {UNIT_OF_MEASURE_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>
        {opt.label}
      </option>
    ))}
  </select>
</Field>

<Field label="Tax type">
  <select
    value={taxType}
    onChange={(e) => setTaxType(e.target.value)}
    className={inputClass}
  >
    <option>None</option>
    <option>GST</option>
    <option>VAT</option>
    <option>Sales Tax</option>
    <option>Other</option>
  </select>
</Field>

<Field label="Tax rate (%)">
  <input
    type="number"
    min="0"
    step="0.01"
    value={taxRate}
    onChange={(e) => setTaxRate(e.target.value)}
    className={inputClass}
  />
</Field>

<Field label="Price includes tax" span2>
  <label className="flex items-center gap-2 text-sm text-neutral-600">
    <Toggle checked={taxInclusive} onChange={setTaxInclusive} />
    {taxInclusive ? "Yes — unit price already includes tax" : "No — tax is added on top"}
  </label>
</Field>

              <Field label="Shipping cost ($)">
                <input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Lead time (days)">
                <input
                  required
                  type="number"
                  value={leadTimeDays}
                  onChange={(e) => setLeadTimeDays(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="Dispatch status">
                <select
                  value={dispatchStatus}
                  onChange={(e) => setDispatchStatus(e.target.value)}
                  className={inputClass}
                >
                  <option>Dispatch ready</option>
                  <option>Backordered</option>
                  <option>Made to order</option>
                </select>
              </Field>

              <Field label="Quantity available">
                <input
                  required
                  type="number"
                  value={quantityAvailable}
                  onChange={(e) => setQuantityAvailable(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="MOQ">
                <input
                  type="number"
                  value={moq}
                  onChange={(e) => setMoq(e.target.value)}
                  className={inputClass}
                />
              </Field>

              <Field label="AI score (%, optional)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={aiScore}
                  onChange={(e) => setAiScore(e.target.value)}
                  placeholder="Leave blank until AI matching is wired up"
                  className={inputClass}
                />
              </Field>

              {create.isError && (
                <div className="col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {(create.error as Error).message}
                </div>
              )}

              <div className="col-span-2 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={create.isPending}
                  className="rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
                >
                  {create.isPending ? "Adding…" : "Add offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}