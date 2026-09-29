"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Package,
  FlaskConical,
  Globe2,
  BarChart3,
  Send,
  MapPin,
  ShoppingCart,
  Trash2,
  Plus,
} from "lucide-react";
import {
  fetchSupplierProfile,
  sendMessageToSupplier,
} from "../../../lib/supplierProfileApi";
import { createSupplierOrder, type SupplierOrderItemInput } from "../../../lib/supplierOrdersApi";

type Tab = "overview" | "products" | "rd" | "trade" | "performance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Company Overview", icon: <Building2 size={16} /> },
  { id: "products", label: "Selected Products", icon: <Package size={16} /> },
  { id: "rd", label: "R&D Capacity", icon: <FlaskConical size={16} /> },
  { id: "trade", label: "Trade Capacity", icon: <Globe2 size={16} /> },
  { id: "performance", label: "Business Performance", icon: <BarChart3 size={16} /> },
];

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
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value ?? "—"}</span>
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

// A cart line, kept separate from the API's SupplierOrderItemInput so the
// UI can track a per-row React key and a live MOQ check without leaking
// UI-only concerns into what actually gets sent to the API.
type CartLine = {
  key: string;
  productId?: string;
  itemName: string;
  unitPrice: number | null;
  quantity: number;
  moq: number;
};

export default function SupplierProfilePage() {
  const params = useParams();
  const supplierId = params.id as string;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-profile", supplierId],
    queryFn: () => fetchSupplierProfile(supplierId),
    enabled: !!supplierId,
  });

  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");

  const sendMessage = useMutation({
    mutationFn: () => sendMessageToSupplier(supplierId, { senderName, senderEmail, message }),
    onSuccess: () => {
      setSenderName("");
      setSenderEmail("");
      setMessage("");
    },
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
      // If this product's already in the cart, combine quantities instead
      // of adding a duplicate row.
      const existing = prev.find((line) => line.productId === pickerProduct.id);
      if (existing) {
        return prev.map((line) =>
          line.productId === pickerProduct.id
            ? { ...line, quantity: line.quantity + pickerQty }
            : line
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

  const cartTotal = cart.reduce((sum, line) => {
    if (line.unitPrice === null) return sum;
    return sum + line.unitPrice * line.quantity;
  }, 0);

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
    <main className="mx-auto max-w-4xl px-6 py-16 space-y-6">
      {/* Header */}
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
                <p className="mt-1 text-xs text-neutral-400">
                  Main categories: {supplier.mainProducts}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex overflow-x-auto border-b border-neutral-200">
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
            <div className="space-y-4">
              {supplier.companyOverview && (
                <p className="text-sm leading-relaxed text-neutral-700">
                  {supplier.companyOverview}
                </p>
              )}
              <div className="grid grid-cols-2 gap-x-8">
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
                <p className="text-sm text-neutral-400">
                  This supplier hasn't listed any products yet.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {products.map((p) => (
                    <div key={p.id} className="rounded-xl border border-neutral-200 p-4">
                      <div className="text-sm font-medium text-neutral-900">{p.item}</div>
                      {p.description && (
                        <div className="mt-1 text-xs text-neutral-400 line-clamp-2">
                          {p.description}
                        </div>
                      )}
                      <div className="mt-2 text-sm font-medium text-[#c2410c]">
                        {formatINR(p.unitPrice)}
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        MOQ {p.moq} · {p.leadTimeDays}d lead time
                      </div>
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
                <p className="text-sm text-neutral-400">
                  No R&amp;D capacity information provided yet.
                </p>
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
              <div className="rounded-xl border border-neutral-200 p-4 text-center">
                <div className="text-xs text-neutral-400">Response rate</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  {supplier.responseRate != null ? `${supplier.responseRate}%` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4 text-center">
                <div className="text-xs text-neutral-400">Response time</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  {supplier.responseTimeHours ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4 text-center">
                <div className="text-xs text-neutral-400">Quotations given</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  {supplier.quotationPerformance ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4 text-center">
                <div className="text-xs text-neutral-400">Transactions</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  {supplier.transactionsCount ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 p-4 text-center col-span-2">
                <div className="text-xs text-neutral-400">Total transaction amount</div>
                <div className="mt-1 text-lg font-semibold text-neutral-900">
                  {supplier.totalTransactionAmount ?? "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contact form */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-medium text-neutral-700">Send message to supplier</h2>

        {supplier.contactName && (
          <p className="text-xs text-neutral-400">To: {supplier.contactName}</p>
        )}

        {sendMessage.isSuccess ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            Message sent. The supplier will see it and can follow up with you directly.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage.mutate();
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Your name"
                className="rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
              />
              <input
                required
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="Your email"
                className="rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
              />
            </div>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter your inquiry details such as product name, quantity, and timeline…"
              className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
            />
            {sendMessage.isError && (
              <p className="text-sm text-red-600">{(sendMessage.error as Error).message}</p>
            )}
            <button
              type="submit"
              disabled={sendMessage.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9a3412] disabled:opacity-50"
            >
              <Send size={14} />
              {sendMessage.isPending ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>

      {/* Place an order — cart based */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-5">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-neutral-500" />
          <h2 className="text-sm font-medium text-neutral-700">Place an order</h2>
        </div>

        {products.length === 0 ? (
          <p className="text-sm text-neutral-400">
            This supplier hasn&apos;t listed any products, so you can&apos;t order online. Send them a message
            above to request a quote.
          </p>
        ) : (
          <>
            {/* Product picker: add one line to the cart at a time */}
            <div className="rounded-xl border border-dashed border-neutral-300 p-4 space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-600">Product</span>
                  <select
                    value={pickerProductId}
                    onChange={(e) => {
                      setPickerProductId(e.target.value);
                      setAddError(null);
                    }}
                    className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                  >
                    <option value="">Select a product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.item} — {formatINR(p.unitPrice)}/unit
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-600">Qty</span>
                  <input
                    type="number"
                    min={pickerMoq}
                    step="1"
                    value={pickerQuantity}
                    onChange={(e) => {
                      setPickerQuantity(e.target.value);
                      setAddError(null);
                    }}
                    className="w-24 rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                  />
                </label>
              </div>

              {pickerProduct && (
                <span className={`block text-xs ${pickerBelowMoq ? "text-red-600" : "text-neutral-400"}`}>
                  Minimum order: {pickerMoq} {pickerMoq === 1 ? "unit" : "units"}
                </span>
              )}

              {addError && <p className="text-xs text-red-600">{addError}</p>}

              <button
                type="button"
                onClick={handleAddToCart}
                className="flex items-center gap-1.5 rounded-lg border border-[#c2410c] px-3.5 py-2 text-sm font-medium text-[#c2410c] transition hover:bg-[#fff1e6]"
              >
                <Plus size={14} />
                Add to cart
              </button>
            </div>

            {/* Cart contents */}
            {cart.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                    <tr>
                      <th className="px-4 py-2">Item</th>
                      <th className="px-4 py-2">Unit price</th>
                      <th className="px-4 py-2">Qty</th>
                      <th className="px-4 py-2">Subtotal</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((line) => {
                      const lineBelowMoq =
                        Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity < line.moq;
                      const lineSubtotal = line.unitPrice !== null ? line.unitPrice * line.quantity : null;
                      return (
                        <tr key={line.key} className="border-t border-neutral-100">
                          <td className="px-4 py-2 font-medium text-neutral-900">{line.itemName}</td>
                          <td className="px-4 py-2 text-neutral-600">{formatINR(line.unitPrice)}</td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              min={1}
                              step="1"
                              value={line.quantity}
                              onChange={(e) => updateCartQuantity(line.key, Number(e.target.value))}
                              aria-invalid={lineBelowMoq}
                              className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                            />
                            {lineBelowMoq && (
                              <span className="mt-1 block text-[11px] text-red-600">Min {line.moq}</span>
                            )}
                          </td>
                          <td className="px-4 py-2 font-medium text-neutral-900">
                            {lineSubtotal !== null ? formatINR(lineSubtotal) : "—"}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeFromCart(line.key)}
                              className="text-neutral-400 transition hover:text-red-600"
                              aria-label={`Remove ${line.itemName}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">Your name</span>
                    <input
                      required
                      value={orderRequesterName}
                      onChange={(e) => setOrderRequesterName(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-neutral-600">Your email</span>
                    <input
                      required
                      type="email"
                      value={orderRequesterEmail}
                      onChange={(e) => setOrderRequesterEmail(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-600">Delivery address</span>
                  <textarea
                    required
                    value={orderAddress}
                    onChange={(e) => setOrderAddress(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-neutral-600">Notes (optional)</span>
                  <textarea
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    rows={2}
                    placeholder="Any delivery instructions or special requirements…"
                    className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#c2410c] focus:ring-1 focus:ring-[#c2410c]"
                  />
                </label>

                <div aria-live="polite" className="rounded-lg bg-neutral-50 p-4 text-sm">
                  <div className="flex justify-between text-neutral-600">
                    <span>{cart.length} {cart.length === 1 ? "item" : "items"}</span>
                    <span className="tabular-nums">
                      {cart.reduce((n, l) => n + l.quantity, 0)} units total
                    </span>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold text-neutral-900">
                    <span>Order total</span>
                    <span className="tabular-nums">{formatINR(cartTotal)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={placeOrder.isPending || cartHasBelowMoqLine || cartHasInvalidQty}
                  className="rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9a3412] disabled:opacity-50"
                >
                  {placeOrder.isPending ? "Placing order…" : `Place order · ${formatINR(cartTotal)}`}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}