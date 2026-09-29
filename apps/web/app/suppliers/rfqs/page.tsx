"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, MailOpen, FileText } from "lucide-react";
import { fetchMyRfqs, fetchRfqDetail, type Rfq } from "../../../lib/rfqSupplierApi";

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  return new Date(value).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SupplierRfqInboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rfqs, isLoading, isError, error } = useQuery({
    queryKey: ["my-rfqs"],
    queryFn: fetchMyRfqs,
  });

  const { data: selectedRfq } = useQuery({
    queryKey: ["rfq-detail", selectedId],
    queryFn: () => fetchRfqDetail(selectedId as string),
    enabled: Boolean(selectedId),
  });

  function openRfq(rfq: Rfq) {
    setSelectedId(rfq.id);
    // Optimistically mark as read in the list immediately, so the unread
    // dot disappears without waiting on the detail fetch to resolve.
    queryClient.setQueryData<Rfq[] | undefined>(["my-rfqs"], (current) =>
      current?.map((r) => (r.id === rfq.id ? { ...r, isRead: true } : r))
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="mb-8 flex items-center gap-2">
        <Inbox size={22} className="text-[#f97316]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">RFQ inbox</h1>
          <p className="text-sm text-neutral-500">Requests for quotation sent to your company.</p>
        </div>
      </div>

      {isError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t load your RFQs: {(error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* List */}
        <div className="rounded-xl border border-neutral-200 bg-white">
          {isLoading && <p className="p-6 text-sm text-neutral-500">Loading…</p>}

          {!isLoading && rfqs?.length === 0 && (
            <p className="p-6 text-sm text-neutral-500">No RFQs yet.</p>
          )}

          <ul className="divide-y divide-neutral-100">
            {rfqs?.map((rfq) => (
              <li key={rfq.id}>
                <button
                  onClick={() => openRfq(rfq)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 ${
                    selectedId === rfq.id ? "bg-orange-50" : ""
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {rfq.isRead ? (
                      <MailOpen size={16} className="text-neutral-300" />
                    ) : (
                      <Mail size={16} className="text-[#f97316]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm ${
                        rfq.isRead ? "font-normal text-neutral-700" : "font-semibold text-neutral-900"
                      }`}
                    >
                      {rfq.referenceNumber}
                    </span>
                    <span className="block truncate text-xs text-neutral-500">{rfq.requesterName}</span>
                    <span className="block text-xs text-neutral-400">
                      Due {formatDate(rfq.dueDate)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Detail */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          {!selectedId && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-neutral-400">
              <FileText size={32} className="mb-2" />
              <p className="text-sm">Select an RFQ to view its details</p>
            </div>
          )}

          {selectedId && !selectedRfq && <p className="text-sm text-neutral-500">Loading…</p>}

          {selectedRfq && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-neutral-900">{selectedRfq.referenceNumber}</h2>
                  <p className="text-sm text-neutral-500">
                    From {selectedRfq.requesterName} · {selectedRfq.requesterEmail}
                  </p>
                </div>
                <div className="text-right text-xs text-neutral-500">
                  <div>Response due: {formatDate(selectedRfq.dueDate)}</div>
                  <div>Quote valid until: {formatDate(selectedRfq.priceValidUntil)}</div>
                  <div>Currency: {selectedRfq.currency ?? "Not specified"}</div>
                </div>
              </div>

              {/* Line items */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-900">Line items</h3>
                <div className="overflow-x-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 text-left text-xs font-medium text-neutral-500">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Spec / standard</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRfq.lineItems.map((item, i) => (
                        <tr key={i} className="border-t border-neutral-100">
                          <td className="px-3 py-2">{item.productName}</td>
                          <td className="px-3 py-2 text-neutral-500">{item.specification || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {item.quantity} {item.unit ?? ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {(selectedRfq.scopeNotes || selectedRfq.assumptionsExclusions) && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-neutral-900">Scope & specification</h3>
                  {selectedRfq.scopeNotes && (
                    <p className="mb-2 text-sm text-neutral-700">{selectedRfq.scopeNotes}</p>
                  )}
                  {selectedRfq.assumptionsExclusions && (
                    <p className="text-sm text-neutral-500">{selectedRfq.assumptionsExclusions}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Delivery & logistics</h3>
                  <dl className="space-y-0.5 text-sm text-neutral-600">
                    <div>Address: {selectedRfq.deliveryAddress || "Not specified"}</div>
                    <div>Required delivery date: {formatDate(selectedRfq.requiredDeliveryDate)}</div>
                    <div>Incoterm: {selectedRfq.incoterm || "Not specified"}</div>
                    <div>Packaging: {selectedRfq.packagingRequirements || "Not specified"}</div>
                  </dl>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Quality, warranty & compliance</h3>
                  <dl className="space-y-0.5 text-sm text-neutral-600">
                    <div>Warranty: {selectedRfq.warrantyPeriod || "Not specified"}</div>
                    <div>Certifications required: {selectedRfq.requiredCertifications || "Not specified"}</div>
                    <div>QC requirements: {selectedRfq.qualityRequirements || "Not specified"}</div>
                    <div>Insurance required: {selectedRfq.insuranceRequired ? "Yes" : "No"}</div>
                  </dl>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Payment terms</h3>
                  <p className="text-sm text-neutral-600">{selectedRfq.paymentTerms || "Not specified"}</p>
                </div>
                {selectedRfq.technicalDocumentNames.length > 0 && (
                  <div>
                    <h3 className="mb-1 text-sm font-semibold text-neutral-900">Technical documents</h3>
                    <ul className="text-sm text-neutral-600">
                      {selectedRfq.technicalDocumentNames.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {selectedRfq.notes && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-neutral-900">Notes</h3>
                  <p className="text-sm text-neutral-600">{selectedRfq.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}