"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Boxes,
  Search,
  Upload,
  Download,
  Sparkles,
  Pencil,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  listSupplyChainOffers,
  createSupplyChainOffer,
  deleteSupplyChainOffer,
  type SupplierOffer,
} from "../../lib/supplyChainApi";

// The backend now returns supplierType, category, description,
// dispatchStatus, and aiScore directly — no extension needed.
type SupplyChainOffer = SupplierOffer;

type SortOption = "price-desc" | "price-asc" | "lead-asc" | "stock-desc";

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

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function toCsv(offers: SupplyChainOffer[]): string {
  const headers = [
    "item",
    "description",
    "category",
    "supplierName",
    "supplierType",
    "unitPrice",
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
        // Escape quotes/commas per basic CSV rules.
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

export default function SupplyChainPage() {
  const queryClient = useQueryClient();
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [moq, setMoq] = useState("1");
  const [quantityAvailable, setQuantityAvailable] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState("Dispatch ready");
  const [aiScore, setAiScore] = useState("");

  // Toolbar / filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("price-desc");
  const [inStockOnly, setInStockOnly] = useState(true);

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
      setSupplierName("");
      setSupplierType("");
      setUnitPrice("");
      setLeadTimeDays("");
      setShippingCost("0");
      setMoq("1");
      setQuantityAvailable("");
      setDispatchStatus("Dispatch ready");
      setAiScore("");
    },
  });

  const remove = useMutation({
    mutationFn: deleteSupplyChainOffer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supply-chain"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      item,
      description,
      category,
      supplierName,
      supplierType,
      unitPrice: Number(unitPrice),
      leadTimeDays: Number(leadTimeDays),
      shippingCost: Number(shippingCost),
      moq: Number(moq),
      quantityAvailable: Number(quantityAvailable),
      dispatchStatus,
      aiScore: aiScore ? Number(aiScore) : undefined,
    });
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
          o.supplierName.toLowerCase().includes(q) ||
          (o.description ?? "").toLowerCase().includes(q) ||
          (o.category ?? "").toLowerCase().includes(q)
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

  function handleExportCsv() {
    const csv = toCsv(filteredOffers.length > 0 ? filteredOffers : offers);
    downloadCsv(csv, `supply-chain-offers-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Boxes size={22} className="text-[#3d6bff]" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Supply chain catalog</h1>
            <p className="mt-0.5 text-sm text-neutral-500">
              Products and their supplier offers. Procurement requests match against this
              catalog before falling back to simulated quotes.
            </p>
          </div>
        </div>

        <Link
          href="/suppliers/register"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
        >
          <UserPlus size={14} />
          Register as a supplier
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
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

        <Field label="Unit price (₹)">
          <input
            required
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Shipping cost (₹)">
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

        <button
          type="submit"
          disabled={create.isPending}
          className="col-span-2 rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add offer"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && offers.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">
            No offers yet. Add some above — procurement requests will match against them.
          </p>
        </div>
      )}

      {data && offers.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          {/* Header row: title, count, toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-medium text-neutral-700">Current offers</h2>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                  {filteredOffers.length} item{filteredOffers.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-400">
                Live active quotes and supplier product listings indexed for AI automated
                procurement.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Bulk CSV import needs a backend endpoint — coming soon"
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-400 cursor-not-allowed"
              >
                <Upload size={13} />
                Bulk CSV Import
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-900"
              >
                <Download size={13} />
                Export CSV
              </button>
              <button
                type="button"
                disabled
                title="AI matching needs a backend endpoint — coming soon"
                className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff]/50 px-3 py-1.5 text-xs font-medium text-white cursor-not-allowed"
              >
                <Sparkles size={13} />
                Test AI Matching
              </button>
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-neutral-200 bg-neutral-50/50">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search product, supplier, specs…"
                className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-8 pr-3 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
            >
              <option value="price-desc">Price: High to Low</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="lead-asc">Lead time: Fastest</option>
              <option value="stock-desc">Stock: Most available</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-neutral-600 whitespace-nowrap">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="accent-[#3d6bff]"
              />
              In-Stock Only
            </label>
          </div>

          {filteredOffers.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-neutral-400">
              No offers match your filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
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
                {filteredOffers.map((o) => {
                  const inStock = o.quantityAvailable > 0;
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
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-neutral-900">{o.supplierName}</div>
                        {o.supplierType && (
                          <div className="text-xs text-neutral-400">{o.supplierType}</div>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-neutral-900">{formatINR(o.unitPrice)}</div>
                        <div className="text-xs text-neutral-400">
                          {o.shippingCost ? `+ ${formatINR(o.shippingCost)} ship` : "Free shipping"}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-neutral-900">{o.leadTimeDays}d</div>
                        <div className="text-xs text-neutral-400">
                          {o.dispatchStatus ?? "—"}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-1.5 text-neutral-900">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              inStock ? "bg-green-500" : "bg-red-400"
                            }`}
                          />
                          {o.quantityAvailable} units
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
                            disabled
                            title="Editing offers is coming soon"
                            className="text-neutral-300 cursor-not-allowed"
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
          )}
        </div>
      )}
    </main>
  );
}