"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileText, Plus, Send, Trash2, UploadCloud, X } from "lucide-react";
import {
  fetchSuppliers,
  saveQuote,
  type QuoteLineItem,
} from "../../lib/quotesAPI";

/* NOTE ON FILE UPLOADS
 * Technical documents are held in local state only. File objects can't be
 * JSON-serialised, so just the file NAMES go to saveQuote(). To persist them,
 * add an upload endpoint and upload each File before calling saveQuote(). */

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD"];
const UNIT_OPTIONS = ["Pcs", "Box", "Kg", "Litre", "Lot"];
const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
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

// Shared styles
const inputCls =
  "w-full rounded-md border border-neutral-200 bg-[#FCFAF6] px-3 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B65F26]";
const labelCls = "mb-1.5 block text-[11px] text-neutral-600";
const ghostBtn =
  "rounded-md border border-neutral-200 bg-white px-3.5 py-2 text-xs font-medium text-neutral-800 transition hover:border-neutral-300 disabled:opacity-50";

let nextId = 1;
function newLineItem(): QuoteLineItem {
  return { id: `new-${nextId++}`, productName: "", specification: "", unit: "", quantity: 0 };
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Section({
  n,
  title,
  desc,
  action,
  children,
}: {
  n: string;
  title: string;
  desc: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex gap-2">
          <span className="mt-0.5 font-mono text-[10px] font-semibold text-[#B65F26]">{n}</span>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
            <p className="mt-0.5 text-[11px] text-neutral-500">{desc}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
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

  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([newLineItem()]);
  const [scopeNotes, setScopeNotes] = useState("");
  const [assumptionsExclusions, setAssumptionsExclusions] = useState("");

  const [paymentTerms, setPaymentTerms] = useState("");

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [requiredDeliveryDate, setRequiredDeliveryDate] = useState("");
  const [incoterm, setIncoterm] = useState("");
  const [packagingRequirements, setPackagingRequirements] = useState("");

  const [warrantyPeriod, setWarrantyPeriod] = useState("");
  const [qualityRequirements, setQualityRequirements] = useState("");
  const [requiredCertifications, setRequiredCertifications] = useState("");
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [technicalDocuments, setTechnicalDocuments] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

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
      const deduped = incoming.filter(
        (f) => !existing.some((e) => e.name === f.name && e.size === f.size)
      );
      return [...existing, ...deduped];
    });
  }

  function removeFile(index: number) {
    setTechnicalDocuments((files) => files.filter((_, i) => i !== index));
  }

  const hasValidLineItems = lineItems.some((it) => it.productName.trim() && it.quantity > 0);
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

  // Same two buttons in the header and at the bottom of the form
  const actionButtons = (
    <div className="flex items-center gap-2">
      <button onClick={() => submit("draft")} disabled={saveMutation.isPending} className={ghostBtn}>
        {saveMutation.isPending && saveMutation.variables?.status === "draft" ? "Saving…" : "Save as draft"}
      </button>
      <button
        onClick={() => submit("sent")}
        disabled={!canSubmit || saveMutation.isPending}
        className="flex items-center gap-1.5 rounded-md bg-[#B65F26] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#B65F26]/90 disabled:opacity-50"
      >
        <Send size={13} />
        {saveMutation.isPending && saveMutation.variables?.status === "sent" ? "Sending…" : "Send RFQ"}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#B65F26]/15 text-[#B65F26]">
              <FileText size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-neutral-900">Send RFQ</h1>
                <span className="rounded-full bg-[#B65F26]/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#B65F26]">
                  Draft
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                Draft and send a request for quotation to a supplier.
              </p>
            </div>
          </div>
          {actionButtons}
        </div>

        {saveMutation.isError && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Couldn&apos;t save the RFQ: {(saveMutation.error as Error).message}. Try again.
          </div>
        )}

        <div className="space-y-4">
          {/* 01 RFQ details */}
          <Section n="01" title="RFQ details" desc="Core information for this quotation request.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Supplier" className="sm:col-span-3">
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={inputCls}
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
                  <div className="mt-3 rounded-md border border-neutral-200 bg-[#FCFAF6] p-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-900">
                        {selectedSupplier.businessName}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
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

                    <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] text-neutral-500 sm:grid-cols-2">
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
                      <p className="mt-2 text-[11px] text-amber-700">
                        This supplier hasn&apos;t completed verification yet.
                      </p>
                    )}
                  </div>
                )}
              </Field>

              <Field label="Your name">
                <input
                  type="text"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  placeholder="Who this RFQ is from"
                  className={inputCls}
                />
              </Field>
              <Field label="Your email">
                <input
                  type="email"
                  value={requesterEmail}
                  onChange={(e) => setRequesterEmail(e.target.value)}
                  placeholder="Where the supplier can reach you"
                  className={inputCls}
                />
              </Field>
              <Field label="Due date (response by)">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Reference number">
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Currency">
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quote valid until">
                <input
                  type="date"
                  value={priceValidUntil}
                  onChange={(e) => setPriceValidUntil(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* 02 Line items */}
          <Section
            n="02"
            title="Line items"
            desc="Products and quantities to include in the quote."
            action={
              <button onClick={() => setLineItems((items) => [...items, newLineItem()])} className={`${ghostBtn} flex items-center gap-1`}>
                <Plus size={13} /> Add item
              </button>
            }
          >
            <p className="mb-3 text-[11px] italic text-neutral-500">
              All rates should be quoted exclusive of local taxes/customs unless specified by Incoterms.
            </p>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] space-y-2">
                <div className="grid grid-cols-[1.4fr_1.4fr_0.8fr_1fr_28px] gap-3 text-[11px] text-neutral-600">
                  <span>Product name</span>
                  <span>Spec / standard</span>
                  <span>Unit</span>
                  <span>Quantity</span>
                  <span />
                </div>
                {lineItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.4fr_1.4fr_0.8fr_1fr_28px] items-center gap-3">
                    <input
                      type="text"
                      value={item.productName}
                      onChange={(e) => updateLineItem(item.id, { productName: e.target.value })}
                      placeholder="Search product…"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={item.specification ?? ""}
                      onChange={(e) => updateLineItem(item.id, { specification: e.target.value })}
                      placeholder="Tolerance, grade, standard…"
                      className={inputCls}
                    />
                    <select
                      value={item.unit ?? ""}
                      onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">Unit…</option>
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      value={item.quantity || ""}
                      onChange={(e) => updateLineItem(item.id, { quantity: Number(e.target.value) })}
                      className={`${inputCls} tabular-nums`}
                    />
                    <button
                      onClick={() => removeLineItem(item.id)}
                      aria-label="Remove line item"
                      className="text-neutral-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* 03 Technical specification & scope */}
          <Section
            n="03"
            title="Technical specification & scope"
            desc="Define the requirements clearly so supplier quotes remain comparable."
          >
            <div className="space-y-4">
              <Field label="Scope of work / overall specification">
                <textarea
                  value={scopeNotes}
                  onChange={(e) => setScopeNotes(e.target.value)}
                  rows={4}
                  placeholder="Materials, components, tolerances, standards that apply across this RFQ…"
                  className={inputCls}
                />
              </Field>
              <Field label="Assumptions, inclusions & exclusions">
                <textarea
                  value={assumptionsExclusions}
                  onChange={(e) => setAssumptionsExclusions(e.target.value)}
                  rows={4}
                  placeholder="What's explicitly included/excluded, and any dependencies or assumptions the supplier should confirm…"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* 04 Payment terms */}
          <Section n="04" title="Payment terms" desc="Set the requested commercial payment conditions.">
            <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
              <p className="text-xs text-neutral-600">
                Please select the payment terms you would like the supplier to quote against.
              </p>
              <Field label="Payment terms requested">
                <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {PAYMENT_TERMS_OPTIONS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* 05 Delivery & logistics */}
          <Section
            n="05"
            title="Delivery & logistics"
            desc="Coordinate delivery timing, destination, and handling requirements."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Delivery address" className="sm:col-span-2">
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Where the goods/services should be delivered"
                  className={inputCls}
                />
              </Field>
              <Field label="Required delivery date">
                <input
                  type="date"
                  value={requiredDeliveryDate}
                  onChange={(e) => setRequiredDeliveryDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Shipping terms (Incoterm)">
                <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {INCOTERMS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Packaging requirements" className="sm:col-span-2">
                <input
                  type="text"
                  value={packagingRequirements}
                  onChange={(e) => setPackagingRequirements(e.target.value)}
                  placeholder="Packaging standard, labelling, tracking requirements…"
                  className={inputCls}
                />
              </Field>
            </div>
          </Section>

          {/* 06 Quality, warranty & compliance */}
          <Section
            n="06"
            title="Quality, warranty & compliance"
            desc="Capture quality controls, certifications, and supporting documents."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Warranty period required">
                <input
                  type="text"
                  value={warrantyPeriod}
                  onChange={(e) => setWarrantyPeriod(e.target.value)}
                  placeholder="e.g. 12 months from delivery"
                  className={inputCls}
                />
              </Field>
              <Field label="Required certifications">
                <input
                  type="text"
                  value={requiredCertifications}
                  onChange={(e) => setRequiredCertifications(e.target.value)}
                  placeholder="ISO 9001, CE, RoHS…"
                  className={inputCls}
                />
              </Field>
              <Field label="Quality control / inspection requirements" className="sm:col-span-2">
                <textarea
                  value={qualityRequirements}
                  onChange={(e) => setQualityRequirements(e.target.value)}
                  rows={3}
                  placeholder="Inspection stage, AQL levels, defect handling expectations…"
                  className={inputCls}
                />
              </Field>
              <div className="flex items-center gap-2 sm:col-span-2">
                <input
                  id="insuranceRequired"
                  type="checkbox"
                  checked={insuranceRequired}
                  onChange={(e) => setInsuranceRequired(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-neutral-300 text-[#B65F26] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B65F26]"
                />
                <label htmlFor="insuranceRequired" className="text-xs text-neutral-700">
                  Supplier must carry insurance coverage for this order
                </label>
              </div>

              {/* Technical documents upload */}
              <Field label="Technical documents" className="sm:col-span-2">
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
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-md border px-4 py-8 text-center transition ${
                    dragActive
                      ? "border-[#B65F26] bg-[#B65F26]/15"
                      : "border-neutral-200 bg-[#B65F26]/10"
                  }`}
                >
                  <UploadCloud size={18} className="text-[#B65F26]" />
                  <p className="text-xs text-neutral-600">
                    Drag & drop CAD files, blueprints, or spec sheets here
                  </p>
                  <label className="cursor-pointer text-[11px] font-medium text-[#B65F26] hover:underline">
                    or browse files
                    <input type="file" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                  </label>
                </div>

                {technicalDocuments.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {technicalDocuments.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex items-center justify-between rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs"
                      >
                        <span className="truncate text-neutral-700">{file.name}</span>
                        <span className="ml-2 flex shrink-0 items-center gap-3">
                          <span className="text-[11px] text-neutral-400">{formatFileSize(file.size)}</span>
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
              </Field>
            </div>
          </Section>

          {/* 07 Notes & value-added services + footer actions */}
          <Section
            n="07"
            title="Notes & value-added services"
            desc="Add any additional commercial or service expectations."
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Training, extended warranty, scalability for future volume, or any other terms…"
              rows={3}
              className={inputCls}
            />
            <div className="mt-4 flex justify-end border-t border-neutral-200 pt-4">{actionButtons}</div>
          </Section>
        </div>
      </div>
    </div>
  );
}