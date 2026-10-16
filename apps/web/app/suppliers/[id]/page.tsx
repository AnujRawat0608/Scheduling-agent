"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CertificationsCard } from "../../../components/CertificationsCard";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Package,
  MapPin,
  ShoppingCart,
  Trash2,
  Plus,
  Check,
  CheckCircle2,
  Clock,
  MessageSquare,
} from "lucide-react";
import { fetchSupplierProfile } from "../../../lib/supplierProfileApi";
import { createSupplierOrder, type SupplierOrderItemInput } from "../../../lib/supplierOrdersApi";
import { formatMoney } from "../../../lib/format";
import { CheckoutDialog} from "../../../components/CheckoutDialog";
import { payForOrder } from "../../../lib/supplierPaymentApi";

type Tab = "overview" | "products";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "products", label: "Selected products", icon: <Package size={16} /> },
  { id: "overview", label: "Company overview", icon: <Building2 size={16} /> },
];

/* -------------------------------------------------------------------------- */
/*  Design tokens (same slate + blue language as the supplier dashboard)      */
/* -------------------------------------------------------------------------- */

const surface =
  "rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#3d6bff] focus:bg-white focus:ring-2 focus:ring-[#3d6bff]/15";
const labelCls = "mb-1.5 block text-xs font-medium text-slate-600";
const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#3459d6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-[#3d6bff] hover:text-[#3d6bff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/30";

/** API decimals often arrive as strings ("250.00"). Always coerce before doing maths. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹$€£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** A price in the currency the supplier listed it in. */
function formatPrice(value: unknown, currency: string) {
  const n = toNumber(value);
  return n === null ? "—" : formatMoney(n, currency);
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value ?? "—"}</dd>
    </div>
  );
}

function VerifiedBadge({ status }: { status: string | null }) {
  if (status !== "verified") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <CheckCircle2 size={11} />
      Verified
    </span>
  );
}

// A cart line, kept separate from the API's SupplierOrderItemInput so the UI
// can track a per-row React key and a live MOQ check.
type CartLine = {
  key: string;
  productId?: string;
  itemName: string;
  unitPrice: number | null;
  currency: string;
  quantity: number;
  moq: number;
};

export default function SupplierProfilePage() {
  const params = useParams();
  const supplierId = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("products");

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-profile", supplierId],
    queryFn: () => fetchSupplierProfile(supplierId),
    enabled: !!supplierId,
  });

  // --- Cart state ---
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerQuantity, setPickerQuantity] = useState("");

  const [orderAddress, setOrderAddress] = useState("");
  const [orderRequesterName, setOrderRequesterName] = useState("");
  const [orderRequesterEmail, setOrderRequesterEmail] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const pickerProduct = data?.products.find((p) => p.id === pickerProductId);
  const pickerUnitPrice = toNumber(pickerProduct?.unitPrice);
  const pickerMoq = toNumber(pickerProduct?.moq) ?? 1;
  const pickerQty = Number(pickerQuantity);
  const pickerHasQty = Number.isInteger(pickerQty) && pickerQty > 0;
  const pickerBelowMoq = !!pickerProduct && pickerHasQty && pickerQty < pickerMoq;

  // One order = one currency (the server rejects mixed-currency orders), so the
  // first item in the cart decides it.
  const cartCurrency = cart[0]?.currency ?? null;

  function currencyConflictMessage(productCurrency: string): string | null {
    if (cartCurrency && cartCurrency !== productCurrency) {
      return `Your cart is in ${cartCurrency}. This product is priced in ${productCurrency}, so it needs a separate order.`;
    }
    return null;
  }

  function handleAddToCart() {
    setAddError(null);
    if (!pickerProduct) {
      setAddError("Select a product first.");
      return;
    }
    if (!pickerHasQty) {
      setAddError("Enter a whole-number quantity.");
      return;
    }
    if (pickerQty < pickerMoq) {
      setAddError(`The minimum order for this product is ${pickerMoq} units.`);
      return;
    }
    const conflict = currencyConflictMessage(pickerProduct.currency);
    if (conflict) {
      setAddError(conflict);
      return;
    }

    setCart((prev) => {
      // Combine quantities if the product is already in the cart.
      const existing = prev.find((line) => line.productId === pickerProduct.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === pickerProduct.id ? { ...line, quantity: line.quantity + pickerQty } : line
        );
      }
      return [
        ...prev,
        {
          key: pickerProduct.id,
          productId: pickerProduct.id,
          itemName: pickerProduct.item,
          unitPrice: pickerUnitPrice,
          currency: pickerProduct.currency,
          quantity: pickerQty,
          moq: pickerMoq,
        },
      ];
    });

    setPickerProductId("");
    setPickerQuantity("");
  }

  function updateCartQuantity(key: string, quantity: number) {
    setCart((prev) => prev.map((line) => (line.key === key ? { ...line, quantity } : line)));
  }

  function removeFromCart(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
    setAddError(null);
  }

  // Quick add from a product card: first add uses the minimum order quantity,
  // each further click adds 1 more unit.
  function addProductToCart(p: { id: string; item: string; unitPrice?: unknown; moq?: unknown; currency: string }) {
    const conflict = currencyConflictMessage(p.currency);
    if (conflict) {
      setAddError(conflict);
      return;
    }
    setAddError(null);

    const moq = toNumber(p.moq) ?? 1;
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === p.id);
      if (existing) {
        return prev.map((line) => (line.productId === p.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [
        ...prev,
        {
          key: p.id,
          productId: p.id,
          itemName: p.item,
          unitPrice: toNumber(p.unitPrice),
          currency: p.currency,
          quantity: moq,
          moq,
        },
      ];
    });
  }

  const qtyInCart = (id: string) => cart.find((line) => line.productId === id)?.quantity ?? 0;

  // Subtotal of goods only. Tax and shipping are added by the server when the order is placed.
  const cartTotal = cart.reduce(
    (sum, line) => (line.unitPrice === null ? sum : sum + line.unitPrice * line.quantity),
    0
  );
  const totalCurrency = cartCurrency ?? "INR";
  const cartUnits = cart.reduce((n, l) => n + l.quantity, 0);
  const cartHasBelowMoqLine = cart.some(
    (line) => Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < line.moq
  );
  const cartHasInvalidQty = cart.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // If payment fails after the order was created, keep its id so a retry pays the
  // same order instead of creating a duplicate.
  const createdOrderIdRef = useRef<string | null>(null);

  const placeOrder = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Add at least one product to the cart first.");
      if (cartHasInvalidQty) throw new Error("Every line needs a whole-number quantity greater than 0.");
      if (cartHasBelowMoqLine) throw new Error("One or more lines are below that product's minimum order quantity.");

      if (createdOrderIdRef.current === null) {
        // The server reads price, currency, tax and shipping from the catalog, so only
        // the product and quantity matter here.
        const items: SupplierOrderItemInput[] = cart.map((line) => ({
          productId: line.productId,
          itemName: line.itemName,
          quantity: line.quantity,
        }));

        const result = (await createSupplierOrder({
          supplierId,
          items,
          deliveryAddress: orderAddress,
          requesterName: orderRequesterName,
          requesterEmail: orderRequesterEmail,
          notes: orderNotes || undefined,
        })) as { id?: string | number; order?: { id?: string | number } } | undefined;

        const id = result?.id ?? result?.order?.id;
        createdOrderIdRef.current = id != null ? String(id) : "";
      }

      try {
        await payForOrder({
  orderId: createdOrderIdRef.current,
  buyerName: orderRequesterName,
  buyerEmail: orderRequesterEmail,
});
      } catch (err) {
        throw new Error(
          `Payment didn't go through: ${(err as Error).message}. Your order is saved, so you can try again without re-entering anything.`
        );
      }
      return createdOrderIdRef.current;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
    },
  });

  function closeCheckout() {
    if (placeOrder.isPending || placeOrder.isSuccess) return;
    placeOrder.reset();
    setCheckoutOpen(false);
  }

  function viewPlacedOrder() {
    const id = createdOrderIdRef.current;
    router.push(id ? `/billing?highlight=${id}` : "/billing");
  }

  // --- Order status (derived from the cart / form, nothing extra to store) ---
  const detailsDone =
    cart.length > 0 &&
    Boolean(orderRequesterName.trim() && orderRequesterEmail.trim() && orderAddress.trim());
  const cartInvalid = cartHasBelowMoqLine || cartHasInvalidQty;
  const steps = [
    { label: "Product selected", done: cart.length > 0 },
    { label: "Delivery details", done: detailsDone },
    { label: "Payment", done: placeOrder.isSuccess },
  ];
  const currentStep = steps.findIndex((s) => !s.done);
  const statusBadge =
    cart.length === 0
      ? "Add a product"
      : cartInvalid
      ? "Fix quantities"
      : !detailsDone
      ? "Add delivery details"
      : "Ready to place";
  const statusReady = statusBadge === "Ready to place";
  const statusHelp =
    cart.length === 0
      ? "Pick a product and quantity to start your order."
      : detailsDone && !cartInvalid
      ? "Review your details before submitting the order."
      : "Complete the highlighted step to place your order.";

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
        <div
          className="mx-auto max-w-[1200px] animate-pulse space-y-5"
          role="status"
          aria-label="Loading supplier profile"
        >
          <div className="h-28 rounded-xl bg-slate-200/70" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="h-96 rounded-xl bg-slate-200/70" />
            <div className="h-96 rounded-xl bg-slate-200/70" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16 sm:px-6">
        <div
          role="alert"
          className="mx-auto max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error instanceof Error ? error.message : "We couldn't find this supplier."}
        </div>
      </main>
    );
  }

  const { supplier, products, certificates } = data;

  // Estimated dispatch = the longest lead time among the items in the cart.
  const cartLeadTime = cart.reduce((max, line) => {
    const p = products.find((x) => x.id === line.productId);
    return Math.max(max, toNumber(p?.leadTimeDays) ?? 0);
  }, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-[1200px] space-y-6">
        {/* Header */}
        <header className={`${surface} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#3d6bff]/10 text-[#3d6bff]">
                <Building2 size={26} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-slate-900">
                    {supplier.businessName}
                  </h1>
                  <VerifiedBadge status={supplier.verificationStatus} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  {supplier.yearEstablished && (
                    <span>{new Date().getFullYear() - supplier.yearEstablished} years in business</span>
                  )}
                  {(supplier.city || supplier.state) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={13} />
                      {[supplier.city, supplier.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
                {supplier.mainProducts && (
                  <p className="mt-1 truncate text-xs text-slate-400">
                    Main categories: {supplier.mainProducts}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/suppliers/${supplierId}/contact`)}
              className={`${primaryBtn} shrink-0`}
            >
              <MessageSquare size={15} />
              Connect with supplier
            </button>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          {/* LEFT: tabs */}
          <div className="space-y-6">
            <div className={`${surface} overflow-hidden`}>
              <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/60 px-3 pt-2" role="tablist">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab.id)}
                      className={`-mb-px flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3d6bff]/30 ${
                        active
                          ? "border-[#3d6bff] bg-white text-[#3d6bff]"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-5 sm:p-6">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {supplier.companyOverview ? (
                      <p className="max-w-prose text-sm leading-relaxed text-slate-600">
                        {supplier.companyOverview}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">This supplier hasn't added a company overview yet.</p>
                    )}
                    <dl className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                      <div>
                        <InfoRow label="Business type" value={supplier.businessType} />
                        <InfoRow label="Main products" value={supplier.mainProducts} />
                        <InfoRow label="Total annual revenue" value={supplier.totalAnnualRevenue} />
                      </div>
                      <div>
                        <InfoRow label="Total employees" value={supplier.totalEmployees} />
                        <InfoRow label="Year established" value={supplier.yearEstablished} />
                      </div>
                    </dl>
                  </div>
                )}

                {activeTab === "products" && (
                  <div>
                    {products.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <Package size={18} />
                        </span>
                        <p className="text-sm font-medium text-slate-700">No products listed yet</p>
                        <p className="max-w-xs text-xs text-slate-500">
                          Send the supplier a message to ask what they can offer.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {products.map((p) => {
                          const inCart = qtyInCart(p.id);
                          return (
                            <article
                              key={p.id}
                              className={`flex flex-col rounded-xl border bg-white p-4 transition ${
                                inCart > 0 ? "border-[#3d6bff]/40 ring-1 ring-[#3d6bff]/15" : "border-slate-200 hover:border-slate-300"
                              }`}
                            >
                              <h3 className="text-sm font-semibold text-slate-900">{p.item}</h3>
                              {p.category && (
                                <span className="mt-1.5 w-fit rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                  {p.category}
                                </span>
                              )}
                              {p.description && (
                                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                  {p.description}
                                </p>
                              )}
                              <p className="mt-3 text-lg font-semibold tabular-nums text-slate-900">
                                {formatPrice(p.unitPrice, p.currency)}
                                <span className="ml-1 text-xs font-normal text-slate-400">/ unit</span>
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                Minimum order {p.moq} · {p.leadTimeDays} day lead time
                              </p>
                              <div className="mt-auto pt-4">
                                <button
                                  type="button"
                                  onClick={() => addProductToCart(p)}
                                  className={`${secondaryBtn} w-full`}
                                >
                                  <Plus size={13} />
                                  Add to cart
                                </button>
                                {inCart > 0 && (
                                  <p className="mt-2 flex items-center justify-center gap-1 text-[11px] font-medium text-emerald-700">
                                    <Check size={12} />
                                    {inCart} {inCart === 1 ? "unit" : "units"} in cart
                                  </p>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {activeTab === "overview" && (
              <CertificationsCard
                certifications={supplier.certifications}
                certificates={certificates ?? []}
              />
            )}
          </div>

          {/* RIGHT: place an order + order status */}
          <aside className="space-y-6 lg:sticky lg:top-6">
            <section className={`${surface} overflow-hidden`}>
              <header className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#3d6bff]/10 text-[#3d6bff]">
                  <ShoppingCart size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Place an order</h2>
                  <p className="text-xs text-slate-500">Quick order from this supplier</p>
                </div>
              </header>

              <div className="p-5">
                {products.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    This supplier hasn&apos;t listed any products, so you can&apos;t order online. Send them a
                    message to request a quote.
                  </p>
                ) : (
                  <div className="space-y-5">
                    {/* Product picker */}
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="picker-product" className={labelCls}>
                          Product
                        </label>
                        <select
                          id="picker-product"
                          value={pickerProductId}
                          onChange={(e) => {
                            setPickerProductId(e.target.value);
                            setAddError(null);
                          }}
                          className={inputCls}
                        >
                          <option value="">Select a product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.item} — {formatPrice(p.unitPrice, p.currency)}/unit
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end gap-3">
                        <div className="w-24 shrink-0">
                          <label htmlFor="picker-qty" className={labelCls}>
                            Quantity
                          </label>
                          <input
                            id="picker-qty"
                            type="number"
                            min={pickerMoq}
                            step="1"
                            value={pickerQuantity}
                            onChange={(e) => {
                              setPickerQuantity(e.target.value);
                              setAddError(null);
                            }}
                            className={inputCls}
                          />
                        </div>
                        <button type="button" onClick={handleAddToCart} className={`${secondaryBtn} flex-1 py-2.5 text-sm`}>
                          <Plus size={14} />
                          Add to cart
                        </button>
                      </div>
                      {pickerProduct && (
                        <p className={`text-xs ${pickerBelowMoq ? "text-red-600" : "text-slate-500"}`}>
                          Minimum order: {pickerMoq} {pickerMoq === 1 ? "unit" : "units"}
                        </p>
                      )}
                      {addError && (
                        <p role="alert" className="text-xs text-red-600">
                          {addError}
                        </p>
                      )}
                    </div>

                    {/* Cart */}
                    {cart.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-xs font-medium text-slate-600">Your cart</h3>
                        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                          {cart.map((line) => {
                            const lineBelowMoq =
                              Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < line.moq;
                            const lineSubtotal = line.unitPrice !== null ? line.unitPrice * line.quantity : null;
                            return (
                              <li key={line.key} className="flex items-center gap-3 px-3 py-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium text-slate-900">{line.itemName}</p>
                                  <p className="text-xs tabular-nums text-slate-500">
                                    {formatPrice(line.unitPrice, line.currency)} each
                                  </p>
                                  {lineBelowMoq && (
                                    <p className="text-[11px] text-red-600">Minimum order is {line.moq}</p>
                                  )}
                                </div>
                                <input
                                  type="number"
                                  min={1}
                                  step="1"
                                  value={line.quantity}
                                  onChange={(e) => updateCartQuantity(line.key, Number(e.target.value))}
                                  aria-label={`Quantity for ${line.itemName}`}
                                  aria-invalid={lineBelowMoq}
                                  className={`w-16 shrink-0 rounded-md border bg-white px-2 py-1.5 text-center text-sm tabular-nums outline-none transition focus:border-[#3d6bff] focus:ring-2 focus:ring-[#3d6bff]/15 ${
                                    lineBelowMoq ? "border-red-300" : "border-slate-200"
                                  }`}
                                />
                                <p className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                                  {lineSubtotal !== null ? formatPrice(lineSubtotal, line.currency) : "—"}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(line.key)}
                                  className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                  aria-label={`Remove ${line.itemName}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="text-[11px] text-slate-400">
                          This order is in {totalCurrency}. Products priced in another currency need a separate
                          order.
                        </p>
                      </div>
                    )}

                    {cart.length > 0 && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!cartInvalid) setCheckoutOpen(true);
                        }}
                        className="space-y-3 border-t border-slate-100 pt-5"
                      >
                        <h3 className="text-xs font-medium text-slate-600">Delivery details</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="order-name" className={labelCls}>
                              Your name
                            </label>
                            <input
                              id="order-name"
                              required
                              value={orderRequesterName}
                              onChange={(e) => setOrderRequesterName(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label htmlFor="order-email" className={labelCls}>
                              Your email
                            </label>
                            <input
                              id="order-email"
                              required
                              type="email"
                              value={orderRequesterEmail}
                              onChange={(e) => setOrderRequesterEmail(e.target.value)}
                              className={inputCls}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="order-address" className={labelCls}>
                            Delivery address
                          </label>
                          <textarea
                            id="order-address"
                            required
                            value={orderAddress}
                            onChange={(e) => setOrderAddress(e.target.value)}
                            rows={2}
                            className={`${inputCls} resize-none`}
                          />
                        </div>
                        <div>
                          <label htmlFor="order-notes" className={labelCls}>
                            Notes (optional)
                          </label>
                          <textarea
                            id="order-notes"
                            value={orderNotes}
                            onChange={(e) => setOrderNotes(e.target.value)}
                            rows={2}
                            placeholder="Delivery instructions or special requirements"
                            className={`${inputCls} resize-none`}
                          />
                        </div>

                        <div aria-live="polite" className="rounded-lg bg-slate-50 p-4 text-sm">
                          <div className="flex justify-between text-slate-600">
                            <span>
                              {cart.length} {cart.length === 1 ? "item" : "items"}
                            </span>
                            <span className="tabular-nums">{cartUnits} units total</span>
                          </div>
                          <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold text-slate-900">
                            <span>Subtotal</span>
                            <span className="tabular-nums">{formatPrice(cartTotal, totalCurrency)}</span>
                          </div>
                          <p className="mt-2 text-[11px] font-normal text-slate-400">
                            Tax and shipping are added when you place the order. The final total appears on your
                            order confirmation.
                          </p>
                        </div>

                        <button type="submit" disabled={cartInvalid} className={`${primaryBtn} w-full`}>
                          Review and pay
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Order status */}
            <section className={`${surface} p-5`}>
              <h2 className="text-sm font-semibold text-slate-900">Order status</h2>

              <ol className="mt-5 flex items-start">
                {steps.map((step, i) => {
                  const current = i === currentStep;
                  return (
                    <li key={step.label} className="flex flex-1 flex-col last:flex-none">
                      <div className="flex w-full items-center">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                            step.done
                              ? "bg-emerald-500"
                              : current
                              ? "bg-[#3d6bff] ring-4 ring-[#3d6bff]/15"
                              : "bg-slate-200"
                          }`}
                        >
                          {step.done && <Check size={12} strokeWidth={3} />}
                        </span>
                        {i < steps.length - 1 && (
                          <span className={`mx-1.5 h-0.5 flex-1 rounded ${step.done ? "bg-emerald-300" : "bg-slate-200"}`} />
                        )}
                      </div>
                      <span
                        className={`mt-2 pr-2 text-[11px] leading-tight ${
                          current ? "font-semibold text-slate-900" : "text-slate-500"
                        }`}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <span
                className={`mt-4 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  statusReady
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                    : cartInvalid
                    ? "bg-red-50 text-red-700 ring-1 ring-inset ring-red-200"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {statusBadge}
              </span>
              <p className="mt-3 text-sm text-slate-500">{statusHelp}</p>

              {cartLeadTime > 0 && (
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                  <Clock size={13} />
                  Estimated dispatch: up to {cartLeadTime} days
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        supplierName={supplier.businessName}
        lines={cart}
        currency={totalCurrency}
        subtotal={cartTotal}
        buyer={{ name: orderRequesterName, email: orderRequesterEmail, address: orderAddress, notes: orderNotes }}
        isPending={placeOrder.isPending}
        error={placeOrder.isError ? (placeOrder.error as Error).message : null}
        done={placeOrder.isSuccess}
        onConfirm={() => placeOrder.mutate()}
        onClose={closeCheckout}
        onViewOrder={viewPlacedOrder}
      />
    </main>
  );
}