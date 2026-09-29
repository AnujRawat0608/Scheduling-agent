"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Plus, Send, Trash2, UploadCloud, X } from "lucide-react";
import {
  fetchSuppliers,
  saveQuote,
  type QuoteLineItem,
} from "../../lib/quotesAPI";

/* ---------------------------------------------------------------------------
 * NOTE ON FILE UPLOADS
 * -------------------------------------------------------------------------
 * Technical documents are held in local component state (browser File
 * objects) so the drag & drop UI works end-to-end visually, but this file
 * does NOT upload them anywhere. JSON.stringify() can't serialize File
 * objects, so only the file NAMES are included in the payload sent to
 * saveQuote() (see `technicalDocumentNames` below).
 *
 * To actually persist the documents you need to:
 *   1. Add an upload endpoint (e.g. POST /api/uploads accepting
 *      multipart/form-data, or an endpoint that issues a presigned URL).
 *   2. Upload each File in `technicalDocuments` there BEFORE calling
 *      saveQuote(), then send back the resulting URLs/keys instead of names.
 * ----------------------------------------------------------------------- */

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];

const UNIT_OPTIONS = ["Pcs", "Box", "Kg", "Litre", "Lot"];

const INCOTERMS = [
  "EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP",
];

const PAYMENT_TERMS_OPTIONS = [
  "100% advance",
  "50% advance, 50% on delivery",
  "Net 15",
  "Net 30",
  "Net 45",
  "Net 60",
  "Against Letter of Credit (LC)",
  "Custom (see notes)",
];

let nextId = 1;
function newLineItem(): QuoteLineItem {
  return {
    id: `new-${nextId++}`,
    productName: "",
    specification: "",
    unit: "",
    quantity: 0,
  };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NewQuotePage() {
  const router = useRouter();

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
  });

  const [supplierId, setSupplierId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState(
    () => `RFQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`
  );
  const [currency, setCurrency] = useState("INR");
  const [priceValidUntil, setPriceValidUntil] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");

  // Technical specification & scope
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([newLineItem()]);
  const [scopeNotes, setScopeNotes] = useState("");
  const [assumptionsExclusions, setAssumptionsExclusions] = useState("");

  // Payment terms
  const [paymentTerms, setPaymentTerms] = useState("");

  // Delivery & logistics
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requiredDeliveryDate, setRequiredDeliveryDate] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [packagingRequirements, setPackagingRequirements] = useState("");

  // Quality, warranty & compliance
  const [warrantyPeriod, setWarrantyPeriod] = useState("");
  const [qualityRequirements, setQualityRequirements] = useState("");
  const [requiredCertifications, setRequiredCertifications] = useState("");
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [technicalDocuments, setTechnicalDocuments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Value-added / misc
  const [notes, setNotes] = useState("");

  const selectedSupplier = useMemo(
    () => suppliers?.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId]
  );
  const supplierName = selectedSupplier?.businessName ?? "";

  function updateLineItem(id: string, patch: Partial<QuoteLineItem>) {
    setLineItems((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeLineItem(id: string) {
    setLineItems((items) => items.filter((it) => it.id !== id));
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setTechnicalDocuments((existing) => {
      const incoming = Array.from(fileList);
      const isDuplicate = (a: File, b: File) => a.name === b.name && a.size === b.size;
      const deduped = incoming.filter(
        (f) => !existing.some((e) => isDuplicate(e, f))
      );
      return [...existing, ...deduped];
    });
  }

  function removeFile(index: number) {
    setTechnicalDocuments((files) => files.filter((_, i) => i !== index));
  }

  const hasValidLineItems = lineItems.some(
    (it) => it.productName.trim() && it.quantity > 0
  );
  const canSubmit =
    Boolean(supplierId) &&
    Boolean(dueDate) &&
    Boolean(requesterName.trim()) &&
    Boolean(requesterEmail.trim()) &&
    Boolean(deliveryAddress.trim()) &&
    Boolean(paymentTerms) &&
    Boolean(priceValidUntil) &&
    hasValidLineItems;

  const saveMutation = useMutation({
    mutationFn: saveQuote,
    onSuccess: (quote) => {
  router.push(`/quotes/${quote.id}`);
},
  });

  function submit(status: "draft" | "sent") {
    saveMutation.mutate({
      status,
      supplierId,
      supplierName,
      dueDate,
      referenceNumber,
      requesterName,
      requesterEmail,
      currency,
      priceValidUntil,
      lineItems: lineItems.filter((it) => it.productName.trim()),
      scopeNotes,
      assumptionsExclusions,
      paymentTerms,
      deliveryAddress,
      requiredDeliveryDate,
      incoterm,
      packagingRequirements,
      warrantyPeriod,
      qualityRequirements,
      requiredCertifications,
      insuranceRequired,
      technicalDocumentNames: technicalDocuments.map((f) => f.name),
      notes,
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText size={22} className="text-[#f97316]" />
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Send RFQ</h1>
            <p className="text-sm text-neutral-500">
              Draft and send a request for quotation to a supplier.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => submit("draft")}
            disabled={saveMutation.isPending}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-300 disabled:opacity-50"
          >
            {saveMutation.isPending && saveMutation.variables?.status === "draft" ? "Saving…" : "Save as draft"}
          </button>
          <button
            onClick={() => submit("sent")}
            disabled={!canSubmit || saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-md bg-[#f97316] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#f97316]/90 disabled:opacity-50"
          >
            <Send size={15} />
            {saveMutation.isPending && saveMutation.variables?.status === "sent" ? "Sending…" : "Send RFQ"}
          </button>
        </div>
      </div>

      {saveMutation.isError && (
        <div role="alert" className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Couldn&apos;t save the RFQ: {(saveMutation.error as Error).message}. Try again.
        </div>
      )}

      <div className="space-y-6">
        {/* RFQ details */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">RFQ details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs text-neutral-500">Supplier</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              >
                <option value="">{suppliersLoading ? "Loading…" : "Select a supplier"}</option>
                {suppliers?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.businessName}
                    {s.verificationStatus === "verified" ? " — Verified" : ""}
                    {s.city ? ` (${s.city}${s.state ? `, ${s.state}` : ""})` : ""}
                  </option>
                ))}
              </select>

              {selectedSupplier && (
                <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-neutral-900">
                      {selectedSupplier.businessName}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        selectedSupplier.verificationStatus === "verified"
                          ? "bg-green-100 text-green-700"
                          : selectedSupplier.verificationStatus === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {selectedSupplier.verificationStatus === "verified"
                        ? "Verified"
                        : selectedSupplier.verificationStatus === "rejected"
                        ? "Rejected"
                        : "Pending verification"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2">
                    {selectedSupplier.contactName && (
                      <div>Contact: <span className="text-neutral-900">{selectedSupplier.contactName}</span></div>
                    )}
                    <div>Email: <span className="text-neutral-900">{selectedSupplier.email}</span></div>
                    {selectedSupplier.phone && (
                      <div>Phone: <span className="text-neutral-900">{selectedSupplier.phone}</span></div>
                    )}
                    {(selectedSupplier.city || selectedSupplier.state) && (
                      <div>
                        Location:{" "}
                        <span className="text-neutral-900">
                          {[selectedSupplier.city, selectedSupplier.state, selectedSupplier.region]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </div>
                    )}
                    {selectedSupplier.gstNumber && (
                      <div>GST: <span className="text-neutral-900">{selectedSupplier.gstNumber}</span></div>
                    )}
                    {selectedSupplier.averageLeadTimeDays != null && (
                      <div>
                        Typical lead time:{" "}
                        <span className="text-neutral-900">{selectedSupplier.averageLeadTimeDays} days</span>
                      </div>
                    )}
                    {selectedSupplier.mainProducts && (
                      <div className="sm:col-span-2">
                        Main products: <span className="text-neutral-900">{selectedSupplier.mainProducts}</span>
                      </div>
                    )}
                    {selectedSupplier.certifications && (
                      <div className="sm:col-span-2">
                        Certifications on file:{" "}
                        <span className="text-neutral-900">{selectedSupplier.certifications}</span>
                      </div>
                    )}
                  </div>

                  {selectedSupplier.verificationStatus !== "verified" && (
                    <p className="mt-2 text-xs text-amber-700">
                      This supplier hasn&apos;t completed verification yet.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Your name</label>
              <input
                type="text"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="Who this RFQ is from"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Your email</label>
              <input
                type="email"
                value={requesterEmail}
                onChange={(e) => setRequesterEmail(e.target.value)}
                placeholder="Where the supplier can reach you"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Due date (response by)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Reference number</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Quote valid until</label>
              <input
                type="date"
                value={priceValidUntil}
                onChange={(e) => setPriceValidUntil(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">Line items</h2>
            <button
              onClick={() => setLineItems((items) => [...items, newLineItem()])}
              className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:border-neutral-300"
            >
              <Plus size={14} /> Add item
            </button>
          </div>
          <p className="mb-4 text-xs italic text-neutral-500">
            All rates should be quoted exclusive of local taxes/customs unless specified by Incoterms.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium text-neutral-400">
                <tr>
                  <th className="pb-2">Product name</th>
                  <th className="pb-2">Spec / standard</th>
                  <th className="pb-2 text-right">Unit</th>
                  <th className="pb-2 text-right">Quantity</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => (
                  <tr key={item.id} className="border-t border-neutral-100 align-top">
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={item.productName}
                        onChange={(e) => updateLineItem(item.id, { productName: e.target.value })}
                        placeholder="Search product…"
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={item.specification ?? ""}
                        onChange={(e) => updateLineItem(item.id, { specification: e.target.value })}
                        placeholder="Tolerance, grade, standard…"
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={item.unit ?? ""}
                        onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                        className="w-24 rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
                      >
                        <option value="">Unit…</option>
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        min={0}
                        value={item.quantity || ""}
                        onChange={(e) => updateLineItem(item.id, { quantity: Number(e.target.value) })}
                        className="w-full rounded-md border border-neutral-200 px-2 py-1.5 text-right text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
                      />
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => removeLineItem(item.id)}
                        aria-label="Remove line item"
                        className="text-neutral-400 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technical specification & scope */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-neutral-900">Technical specification & scope</h2>
          <p className="mb-4 text-xs text-neutral-500">
            A locked, unambiguous scope is what makes quotes comparable — this is the single biggest
            source of mismatched quotes when left vague.
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">
                Scope of work / overall specification
              </label>
              <textarea
                value={scopeNotes}
                onChange={(e) => setScopeNotes(e.target.value)}
                rows={3}
                placeholder="Materials, components, tolerances, standards that apply across this RFQ…"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">
                Assumptions, inclusions & exclusions
              </label>
              <textarea
                value={assumptionsExclusions}
                onChange={(e) => setAssumptionsExclusions(e.target.value)}
                rows={3}
                placeholder="What's explicitly included/excluded, and any dependencies or assumptions the supplier should confirm…"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
          </div>
        </div>

        {/* Payment terms */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Payment terms</h2>
          <div className="max-w-sm">
            <label className="mb-1 block text-xs text-neutral-500">Payment terms requested</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
            >
              <option value="">Select…</option>
              {PAYMENT_TERMS_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Delivery & logistics */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Delivery & logistics</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-neutral-500">Delivery address</label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Where the goods/services should be delivered"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Required delivery date</label>
              <input
                type="date"
                value={requiredDeliveryDate}
                onChange={(e) => setRequiredDeliveryDate(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Shipping terms (Incoterm)</label>
              <select
                value={incoterm}
                onChange={(e) => setIncoterm(e.target.value)}
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              >
                <option value="">Select…</option>
                {INCOTERMS.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-neutral-500">Packaging requirements</label>
              <input
                type="text"
                value={packagingRequirements}
                onChange={(e) => setPackagingRequirements(e.target.value)}
                placeholder="Packaging standard, labelling, tracking requirements…"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
          </div>
        </div>

        {/* Quality, warranty & compliance */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Quality, warranty & compliance</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Warranty period required</label>
              <input
                type="text"
                value={warrantyPeriod}
                onChange={(e) => setWarrantyPeriod(e.target.value)}
                placeholder="e.g. 12 months from delivery"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-500">Required certifications</label>
              <input
                type="text"
                value={requiredCertifications}
                onChange={(e) => setRequiredCertifications(e.target.value)}
                placeholder="ISO 9001, CE, RoHS…"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-neutral-500">
                Quality control / inspection requirements
              </label>
              <textarea
                value={qualityRequirements}
                onChange={(e) => setQualityRequirements(e.target.value)}
                rows={2}
                placeholder="Inspection stage, AQL levels, defect handling expectations…"
                className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="insuranceRequired"
                type="checkbox"
                checked={insuranceRequired}
                onChange={(e) => setInsuranceRequired(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300 text-[#f97316] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
              />
              <label htmlFor="insuranceRequired" className="text-sm text-neutral-700">
                Supplier must carry insurance coverage for this order
              </label>
            </div>

            {/* Technical documents upload */}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-neutral-500">Technical documents</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition ${
                  dragActive
                    ? "border-[#f97316] bg-orange-50"
                    : "border-neutral-200 bg-neutral-50"
                }`}
              >
                <UploadCloud size={22} className="text-neutral-400" />
                <p className="text-sm text-neutral-600">
                  Drag & drop CAD files, blueprints, or spec sheets here
                </p>
                <label className="cursor-pointer text-xs font-medium text-[#f97316] hover:underline">
                  or browse files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </label>
              </div>

              {technicalDocuments.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {technicalDocuments.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-1.5 text-sm"
                    >
                      <span className="truncate text-neutral-700">{file.name}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-3">
                        <span className="text-xs text-neutral-400">{formatFileSize(file.size)}</span>
                        <button
                          onClick={() => removeFile(index)}
                          aria-label={`Remove ${file.name}`}
                          className="text-neutral-400 hover:text-red-600"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Notes / value-added services */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-3 text-base font-semibold text-neutral-900">Notes & value-added services</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Training, extended warranty, scalability for future volume, or any other terms…"
            rows={4}
            className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f97316]"
          />
        </div>
      </div>
    </div>
  );
}