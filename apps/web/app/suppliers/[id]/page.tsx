"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Building2,
  Package,
  FlaskConical,
  Globe2,
  BarChart3,
  Send,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import {
  fetchSupplierProfile,
  sendMessageToSupplier,
} from "../../../lib/supplierProfileApi";

type Tab = "overview" | "products" | "rd" | "trade" | "performance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Company Overview", icon: <Building2 size={16} /> },
  { id: "products", label: "Selected Products", icon: <Package size={16} /> },
  { id: "rd", label: "R&D Capacity", icon: <FlaskConical size={16} /> },
  { id: "trade", label: "Trade Capacity", icon: <Globe2 size={16} /> },
  { id: "performance", label: "Business Performance", icon: <BarChart3 size={16} /> },
];

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 py-3 text-sm last:border-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-900">{value ?? "—"}</span>
    </div>
  );
}

export default function SupplierProfilePage() {
  const params = useParams();
  const supplierId = params.id as string;
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
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#3d6bff]">
              <Building2 size={26} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">{supplier.businessName}</h1>
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
                  ? "border-[#3d6bff] text-[#3d6bff]"
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
                      <div className="mt-2 text-sm font-medium text-[#3d6bff]">
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
                className="rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
              />
              <input
                required
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="Your email"
                className="rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
              />
            </div>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter your inquiry details such as product name, quantity, and timeline…"
              className="w-full rounded-lg border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
            />
            {sendMessage.isError && (
              <p className="text-sm text-red-600">{(sendMessage.error as Error).message}</p>
            )}
            <button
              type="submit"
              disabled={sendMessage.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
            >
              <Send size={14} />
              {sendMessage.isPending ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}