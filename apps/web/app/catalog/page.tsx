"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, Minus, Package, Plus, Search, ShoppingCart } from "lucide-react";
import { formatMoney } from "../../lib/format";
import { hasProcurerToken } from "../../lib/procurerAuthApi";
import { fetchCatalog, type CatalogProduct } from "../../lib/catalogApi";
import { useCart } from "../../lib/cart";
import { CartDrawer } from "../../components/CartDrawer";

export default function CatalogPage() {
  const router = useRouter();
  const cart = useCart();

  // Buyers must be signed in, same as the procurement page.
  useEffect(() => {
    if (!hasProcurerToken()) router.replace("/procurement/login");
  }, [router]);

  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [cartOpen, setCartOpen] = useState(false);

  // Wait until the buyer stops typing before searching.
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["catalog", q],
    queryFn: ({ pageParam }) => fetchCatalog({ q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
  });

  const products = data?.pages.flatMap((p) => p.products) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  return (
    <main className="min-h-screen w-full bg-slate-100 px-6 pb-32 pt-16">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Marketplace</p>
            <h1 className="mt-1 text-lg font-semibold text-neutral-900">Product catalog</h1>
          </div>

          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-800 shadow-sm transition hover:border-neutral-300"
          >
            <ShoppingCart size={16} />
            Cart
            {cart.count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EA580C] px-1.5 text-[11px] font-semibold text-white">
                {cart.count}
              </span>
            )}
          </button>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 shadow-sm focus-within:border-[#EA580C] focus-within:ring-2 focus-within:ring-[#EA580C]/20">
          <Search size={16} className="text-neutral-400" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Search products"
            placeholder="Search products, e.g. microSD card, Raspberry Pi…"
            className="flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
          />
        </div>

        {!isLoading && !isError && (
          <p className="mb-3 text-xs text-neutral-500">
            {total} {total === 1 ? "product" : "products"}
            {q ? ` matching "${q}"` : " from registered suppliers"}
          </p>
        )}

        {isError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {(error as Error).message}
          </div>
        )}

        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-xl border border-neutral-200 bg-white" />
            ))}
          </div>
        )}

        {!isLoading && !isError && products.length === 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500">
            {q ? `No products match "${q}".` : "No products are listed yet."}
          </div>
        )}

        {products.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.offerId} product={p} />
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-xs font-medium text-neutral-800 shadow-sm hover:border-neutral-300 disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  );
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const cart = useCart();
  const min = Math.max(1, product.moq);
  const max = product.quantityAvailable;
  const unavailable = max < min;

  const [qty, setQty] = useState(min);
  const [justAdded, setJustAdded] = useState(false);
  const inCart = cart.quantityOf(product.offerId);

  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(false), 1500);
    return () => clearTimeout(t);
  }, [justAdded]);

  const clamp = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(Math.floor(n), min), Math.max(max, min)) : min);

  const stock =
    max <= 0
      ? { label: "Out of stock", cls: "text-red-600" }
      : max < 20
        ? { label: `Only ${max} left`, cls: "text-amber-700" }
        : { label: "In stock", cls: "text-green-700" };

  return (
    <article className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex h-20 items-center justify-center rounded-lg bg-neutral-50 text-neutral-300">
        <Package size={32} />
      </div>

      <h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-neutral-900">{product.item}</h3>
      <p className="mt-1 text-xs text-neutral-500">
        Sold by <span className="font-medium text-neutral-700">{product.supplierName}</span>
        {product.supplierRegion ? ` · ${product.supplierRegion}` : ""}
      </p>

      <p className="mt-3 text-lg font-semibold text-neutral-900">
        {formatMoney(product.unitPrice, product.currency)}
        <span className="ml-1 text-xs font-normal text-neutral-500">each</span>
      </p>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
        <span className={`font-medium ${stock.cls}`}>{stock.label}</span>
        <span>
          Ships in {product.leadTimeDays} {product.leadTimeDays === 1 ? "day" : "days"}
        </span>
        {product.moq > 1 && <span>Min. order {product.moq}</span>}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex items-center rounded-md border border-neutral-200">
          <button
            className="px-2 py-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            onClick={() => setQty((n) => clamp(n - 1))}
            disabled={unavailable || qty <= min}
            aria-label="Decrease quantity"
          >
            <Minus size={12} />
          </button>
          <input
            value={qty}
            onChange={(e) => setQty(clamp(Number(e.target.value)))}
            disabled={unavailable}
            inputMode="numeric"
            aria-label="Quantity"
            className="w-12 bg-transparent text-center text-xs font-medium outline-none"
          />
          <button
            className="px-2 py-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
            onClick={() => setQty((n) => clamp(n + 1))}
            disabled={unavailable || qty >= max}
            aria-label="Increase quantity"
          >
            <Plus size={12} />
          </button>
        </div>

        <button
          onClick={() => {
            cart.add(product, qty);
            setJustAdded(true);
          }}
          disabled={unavailable}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-[#EA580C] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#EA580C]/90 disabled:opacity-40"
        >
          {justAdded ? (
            <>
              <Check size={14} strokeWidth={3} />
              Added
            </>
          ) : (
            "Add to cart"
          )}
        </button>
      </div>

      {inCart > 0 && <p className="mt-2 text-[11px] text-neutral-500">{inCart} in your cart</p>}
    </article>
  );
}