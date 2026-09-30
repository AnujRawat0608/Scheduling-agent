"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Package,
  FlaskConical,
  Globe2,
  BarChart3,
  MapPin,
  ShoppingCart,
  Trash2,
  Plus,
  CheckCircle2,
  Clock,
  MessageSquare,
} from "lucide-react";
import { fetchSupplierProfile } from "../../../lib/supplierProfileApi";
import { createSupplierOrder, type SupplierOrderItemInput } from "../../../lib/supplierOrdersApi";

type Tab = "overview" | "products" | "rd" | "trade" | "performance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "products", label: "Selected Products", icon: <Package size={16} /> },
  { id: "overview", label: "Company Overview", icon: <Building2 size={16} /> },
  { id: "rd", label: "R&D Capacity", icon: <FlaskConical size={16} /> },
  { id: "trade", label: "Trade Capacity", icon: <Globe2 size={16} /> },
  { id: "performance", label: "Business Performance", icon: <BarChart3 size={16} /> },
];

// Shared styles
const ACCENT = "#F97316";
const card = "rounded-xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]";
const labelCls = "mb-1.5 block text-xs font-medium text-neutral-700";
const primaryBtn =
  "flex items-center justify-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#EA6A0A] disabled:opacity-50";

/** API decimals often arrive as strings ("250.00"). Always coerce before doing maths. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatINR(value: unknown) {
  const n = toNumber(value);
  return n === null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-right text-sm font-semibold text-neutral-900">{value ?? "—"}</span>
    </div>
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

// A cart line, kept separate from the API's SupplierOrderItemInput so the UI
// can track a per-row React key and a live MOQ check.
type CartLine = {
  key: string;
  productId?: string;
  itemName: string;
  unitPrice: number | null;
  quantity: number;
  moq: number;
};

const CART_GRID = "grid grid-cols-[1.3fr_0.9fr_0.7fr_0.9fr_20px] items-center gap-2";

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
  }

  // Quick add from a product card: first add uses the minimum order quantity,
  // each further click adds 1 more unit.
  function addProductToCart(p: { id: string; item: string; unitPrice?: unknown; moq?: unknown }) {
    const moq = toNumber(p.moq) ?? 1;
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === p.id);
      if (existing) {
        return prev.map((line) => (line.productId === p.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [
        ...prev,
        { key: p.id, productId: p.id, itemName: p.item, unitPrice: toNumber(p.unitPrice), quantity: moq, moq },
      ];
    });
  }

  const qtyInCart = (id: string) => cart.find((line) => line.productId === id)?.quantity ?? 0;

  const cartTotal = cart.reduce(
    (sum, line) => (line.unitPrice === null ? sum : sum + line.unitPrice * line.quantity),
    0
  );
  const cartUnits = cart.reduce((n, l) => n + l.quantity, 0);
  const cartHasBelowMoqLine = cart.some(
    (line) => Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < line.moq
  );
  const cartHasInvalidQty = cart.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0);

  const placeOrder = useMutation({
    mutationFn: () => {
      if (cart.length === 0) throw new Error("Add at least one product to the cart first.");
      if (cartHasInvalidQty) throw new Error("Every line needs a whole-number quantity greater than 0.");
      if (cartHasBelowMoqLine) throw new Error("One or more lines are below that product's minimum order quantity.");

      const items: SupplierOrderItemInput[] = cart.map((line) => ({
        productId: line.productId,
        itemName: line.itemName,
        unitPrice: line.unitPrice ?? undefined,
        quantity: line.quantity,
      }));

      return createSupplierOrder({
        supplierId,
        items,
        deliveryAddress: orderAddress,
        requesterName: orderRequesterName,
        requesterEmail: orderRequesterEmail,
        notes: orderNotes || undefined,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["supplier-orders"] });
      const r = result as { id?: string | number; order?: { id?: string | number } } | undefined;
      const id = r?.id ?? r?.order?.id;
      router.push(id != null ? `/billing?highlight=${id}` : "/billing");
    },
  });

  // --- Order status (derived from the cart / form, nothing extra to store) ---
  const detailsDone =
    cart.length > 0 &&
    Boolean(orderRequesterName.trim() && orderRequesterEmail.trim() && orderAddress.trim());
  const cartInvalid = cartHasBelowMoqLine || cartHasInvalidQty;
  const steps = [
    { label: "Product selected", done: cart.length > 0 },
    { label: "Delivery details", done: detailsDone },
    { label: "Confirmation", done: placeOrder.isSuccess },
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
  const statusHelp =
    cart.length === 0
      ? "Pick a product and quantity to start your order."
      : detailsDone && !cartInvalid
      ? "Review your details before submitting the order."
      : "Complete the highlighted step to place your order.";

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading supplier profile…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Supplier not found."}
        </div>
      </main>
    );
  }

  const { supplier, products } = data;

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-16">
      {/* Header (unchanged) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#fff1e6] text-[#c2410c]">
              <Building2 size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-neutral-900">{supplier.businessName}</h1>
                <VerifiedBadge status={supplier.verificationStatus} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                {supplier.yearEstablished && (
                  <span>{new Date().getFullYear() - supplier.yearEstablished}yrs</span>
                )}
                {(supplier.city || supplier.state) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {[supplier.city, supplier.state].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
              {supplier.mainProducts && (
                <p className="mt-1 text-xs text-neutral-400">Main categories: {supplier.mainProducts}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/suppliers/${supplierId}/contact`)}
            className={`${primaryBtn} shrink-0 self-center`}
          >
            <MessageSquare size={15} />
            Connect with supplier
          </button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* LEFT: tabs + message */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {/* Tab bar (unchanged) */}
            <div className="flex flex-wrap border-b border-neutral-200">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "border-[#c2410c] text-[#c2410c]"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {supplier.companyOverview && (
                    <p className="text-sm leading-relaxed text-neutral-500">{supplier.companyOverview}</p>
                  )}
                  <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    <div>
                      <InfoRow label="Business type" value={supplier.businessType} />
                      <InfoRow label="Main products" value={supplier.mainProducts} />
                      <InfoRow label="Total annual revenue" value={supplier.totalAnnualRevenue} />
                    </div>
                    <div>
                      <InfoRow label="Total employees" value={supplier.totalEmployees} />
                      <InfoRow label="Year established" value={supplier.yearEstablished} />
                      <InfoRow label="Certifications" value={supplier.certifications} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "products" && (
                <div>
                  {products.length === 0 ? (
                    <p className="text-sm text-neutral-400">This supplier hasn't listed any products yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {products.map((p) => (
                        <div key={p.id} className="rounded-xl border border-neutral-200 p-4">
                          <div className="text-sm font-medium text-neutral-900">{p.item}</div>
                          {p.description && (
                            <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{p.description}</div>
                          )}
                          <div className="mt-2 text-sm font-medium text-[#c2410c]">{formatINR(p.unitPrice)}</div>
                          <div className="mt-1 text-xs text-neutral-400">
                            MOQ {p.moq} · {p.leadTimeDays}d lead time
                          </div>
                          <button
                            type="button"
                            onClick={() => addProductToCart(p)}
                            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm transition hover:border-[#F97316] hover:bg-orange-50"
                            style={{ color: ACCENT }}
                          >
                            <Plus size={13} />
                            Add to cart
                          </button>
                          {qtyInCart(p.id) > 0 && (
                            <p className="mt-1.5 text-center text-[11px] text-green-700">
                              In cart: {qtyInCart(p.id)} {qtyInCart(p.id) === 1 ? "unit" : "units"}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "rd" && (
                <div>
                  {supplier.rdCapacity ? (
                    <p className="text-sm leading-relaxed text-neutral-700">{supplier.rdCapacity}</p>
                  ) : (
                    <p className="text-sm text-neutral-400">No R&amp;D capacity information provided yet.</p>
                  )}
                </div>
              )}

              {activeTab === "trade" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-2 text-sm font-medium text-neutral-700">Main Markets</h3>
                    {supplier.mainMarkets && supplier.mainMarkets.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-neutral-200">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                            <tr>
                              <th className="px-4 py-2">Region</th>
                              <th className="px-4 py-2">Revenue share</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supplier.mainMarkets.map((m) => (
                              <tr key={m.region} className="border-t border-neutral-100">
                                <td className="px-4 py-2">{m.region}</td>
                                <td className="px-4 py-2">{m.percentage}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-400">No market data provided yet.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-medium text-neutral-700">Trade Ability</h3>
                    <InfoRow label="Languages spoken" value={supplier.languagesSpoken} />
                    <InfoRow label="Trade department size" value={supplier.tradeDeptEmployees} />
                    <InfoRow
                      label="Average lead time"
                      value={supplier.averageLeadTimeDays ? `${supplier.averageLeadTimeDays} days` : null}
                    />
                  </div>
                </div>
              )}

              {activeTab === "performance" && (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    ["Response rate", supplier.responseRate != null ? `${supplier.responseRate}%` : "—"],
                    ["Response time", supplier.responseTimeHours ?? "—"],
                    ["Quotations given", supplier.quotationPerformance ?? "—"],
                    ["Transactions", supplier.transactionsCount ?? "—"],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-xl border border-neutral-200 p-4 text-center">
                      <div className="text-xs text-neutral-400">{label}</div>
                      <div className="mt-1 text-lg font-semibold text-neutral-900">{value}</div>
                    </div>
                  ))}
                  <div className="col-span-2 rounded-xl border border-neutral-200 p-4 text-center">
                    <div className="text-xs text-neutral-400">Total transaction amount</div>
                    <div className="mt-1 text-lg font-semibold text-neutral-900">
                      {supplier.totalTransactionAmount ?? "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: place an order + order status */}
        <div className="space-y-6 lg:sticky lg:top-6">
          <div className={card}>
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: ACCENT }} />
              <h2 className="text-base font-semibold text-neutral-900">Place an order</h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500">Quick order</p>

            {products.length === 0 ? (
              <p className="mt-4 text-sm text-neutral-400">
                This supplier hasn&apos;t listed any products, so you can&apos;t order online. Send them a message
                to request a quote.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {/* Product picker */}
                <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
                  <div>
                    <label className={labelCls}>Product</label>
                    <select
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
                          {p.item} — {formatINR(p.unitPrice)}/unit
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="w-24 shrink-0">
                      <label className={labelCls}>Qty</label>
                      <input
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
                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm font-semibold shadow-sm transition hover:border-[#F97316] hover:bg-orange-50"
                      style={{ color: ACCENT }}
                    >
                      <Plus size={14} />
                      Add to cart
                    </button>
                  </div>
                  {pickerProduct && (
                    <p className={`text-xs ${pickerBelowMoq ? "text-red-600" : "text-neutral-400"}`}>
                      Minimum order: {pickerMoq} {pickerMoq === 1 ? "unit" : "units"}
                    </p>
                  )}
                  {addError && <p className="text-xs text-red-600">{addError}</p>}
                </div>

                {/* Cart */}
                {cart.length > 0 && (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <div className={`${CART_GRID} bg-neutral-50 px-3 py-2 text-[11px] font-medium text-neutral-500`}>
                      <span>Item</span>
                      <span>Unit price</span>
                      <span>Qty</span>
                      <span>Subtotal</span>
                      <span />
                    </div>
                    {cart.map((line) => {
                      const lineBelowMoq =
                        Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < line.moq;
                      const lineSubtotal = line.unitPrice !== null ? line.unitPrice * line.quantity : null;
                      return (
                        <div key={line.key} className={`${CART_GRID} border-t border-neutral-100 px-3 py-2.5 text-xs`}>
                          <span className="font-medium text-neutral-900">{line.itemName}</span>
                          <span className="text-neutral-600">{formatINR(line.unitPrice)}</span>
                          <div>
                            <input
                              type="number"
                              min={1}
                              step="1"
                              value={line.quantity}
                              onChange={(e) => updateCartQuantity(line.key, Number(e.target.value))}
                              aria-invalid={lineBelowMoq}
                              className="w-full rounded-md border border-neutral-200 px-1.5 py-1 text-xs outline-none focus:border-[#F97316]"
                            />
                            {lineBelowMoq && <span className="block text-[10px] text-red-600">Min {line.moq}</span>}
                          </div>
                          <span className="font-semibold text-neutral-900">
                            {lineSubtotal !== null ? formatINR(lineSubtotal) : "—"}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(line.key)}
                            className="text-neutral-400 transition hover:text-red-600"
                            aria-label={`Remove ${line.itemName}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {placeOrder.isError && (
                  <p role="alert" className="text-sm text-red-600">
                    {(placeOrder.error as Error).message}
                  </p>
                )}

                {cart.length > 0 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      placeOrder.mutate();
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Your name</label>
                        <input
                          required
                          value={orderRequesterName}
                          onChange={(e) => setOrderRequesterName(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Your email</label>
                        <input
                          required
                          type="email"
                          value={orderRequesterEmail}
                          onChange={(e) => setOrderRequesterEmail(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Delivery address</label>
                      <textarea
                        required
                        value={orderAddress}
                        onChange={(e) => setOrderAddress(e.target.value)}
                        rows={2}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Notes (optional)</label>
                      <textarea
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        rows={2}
                        placeholder="Any delivery instructions or special requirements…"
                        className={inputCls}
                      />
                    </div>

                    <div aria-live="polite" className="rounded-lg bg-neutral-50 p-4 text-sm">
                      <div className="flex justify-between text-neutral-600">
                        <span>
                          {cart.length} {cart.length === 1 ? "item" : "items"}
                        </span>
                        <span className="tabular-nums">{cartUnits} units total</span>
                      </div>
                      <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
                        <span>Order total</span>
                        <span className="tabular-nums">{formatINR(cartTotal)}</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={placeOrder.isPending || cartInvalid}
                      className={`${primaryBtn} w-full`}
                    >
                      {placeOrder.isPending ? "Placing order…" : `Place order · ${formatINR(cartTotal)}`}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Order status */}
          <div className={card}>
            <h2 className="text-base font-semibold text-neutral-900">Order status</h2>

            <ol className="mt-5 flex items-start">
              {steps.map((step, i) => {
                const current = i === currentStep;
                return (
                  <li key={step.label} className="flex flex-1 flex-col items-center last:flex-none">
                    <div className="flex w-full items-center">
                      <span
                        className={`h-3 w-3 shrink-0 rounded-full ${
                          step.done ? "bg-green-500" : current ? "ring-4 ring-orange-100" : "bg-neutral-200"
                        }`}
                        style={current ? { backgroundColor: ACCENT } : undefined}
                      />
                      {i < steps.length - 1 && (
                        <span className={`mx-1 h-px flex-1 ${step.done ? "bg-green-300" : "bg-neutral-200"}`} />
                      )}
                    </div>
                    <span
                      className={`mt-2 w-full pr-2 text-[11px] leading-tight ${
                        current ? "font-semibold text-neutral-900" : "text-neutral-500"
                      }`}
                    >
                      {step.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <span className="mt-4 inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-medium text-green-700">
              {statusBadge}
            </span>
            <p className="mt-3 text-sm text-neutral-500">{statusHelp}</p>

            {supplier.averageLeadTimeDays ? (
              <div className="mt-4 flex items-center gap-2 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
                <Clock size={13} />
                Estimated dispatch: {supplier.averageLeadTimeDays} days
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}