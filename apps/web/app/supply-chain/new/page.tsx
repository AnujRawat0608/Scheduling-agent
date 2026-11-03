"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Tag,
  DollarSign,
  Truck,
  SlidersHorizontal,
  UploadCloud,
  Trash2,
  Plus,
  ChevronRight,
} from "lucide-react";
import { fetchCurrentSupplier, type Supplier } from "../../../lib/supplierAuthApi";
import {
  createSupplyChainOffer,
  updateSupplyChainOffer,
  listSupplyChainOffers,
  uploadProductImage,
  resolveImageUrl,
  type CreateOfferInput,
} from "../../../lib/supplyChainApi";

const UNIT_OF_MEASURE_OPTIONS = [
  { value: "piece", label: "Each" },
  { value: "box_of_10", label: "Box of 10" },
  { value: "box_of_100", label: "Box of 100" },
  { value: "kg", label: "Kilogram" },
  { value: "meter", label: "Meter" },
  { value: "liter", label: "Liter" },
];

// Keep in sync with SUPPORTED_CURRENCIES in the API (routes/supplyChain.ts).
const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "INR – Indian Rupee" },
  { code: "USD", symbol: "$", label: "USD – US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR – Euro" },
  { code: "GBP", symbol: "£", label: "GBP – British Pound" },
  { code: "AED", symbol: "AED", label: "AED – UAE Dirham" },
  { code: "SGD", symbol: "S$", label: "SGD – Singapore Dollar" },
];

const CATEGORY_OPTIONS = [
  "Single Board Computers",
  "Laptops & Computers",
  "Electronic Components",
  "Sensors & Modules",
  "Networking",
  "Power & Batteries",
  "Other",
];

const SUPPLIER_TYPE_OPTIONS = ["Manufacturer", "Distributor", "Wholesaler", "Retailer", "Trader"];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

/* ---------- small building blocks ---------- */

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm">
      <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold text-neutral-900">
        <span className="text-[#3d6bff]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-sm font-medium text-neutral-800">{label}</span>
      {children}
    </label>
  );
}

/** Input with a text adornment on the left (currency symbol) or right (%, days). */
function AdornedInput({
  prefix,
  suffix,
  ...props
}: { prefix?: string; suffix?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  // Longer symbols (e.g. "AED") need more room so they don't overlap the number.
  const prefixPadding = prefix ? (prefix.trim().length > 2 ? "pl-12" : "pl-8") : "";
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
          {prefix}
        </span>
      )}
      <input {...props} className={`${inputClass} ${prefixPadding} ${suffix ? "pr-14" : ""}`} />
      {suffix && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
          {suffix}
        </span>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? "bg-[#3d6bff]" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-[22px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

/* ---------- page (add + edit) ---------- */

export default function AddProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // undefined = not read yet, null = add mode, string = editing that offer id
  const [editId, setEditId] = useState<string | null | undefined>(undefined);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEditId(new URLSearchParams(window.location.search).get("edit"));
  }, []);

  // Product details
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [specRows, setSpecRows] = useState([{ key: "", value: "" }]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // Classification
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0]);
  const [supplierType, setSupplierType] = useState(SUPPLIER_TYPE_OPTIONS[0]);

  // Pricing & tax
  const [currency, setCurrency] = useState("INR");
  const [unitPrice, setUnitPrice] = useState("");
  const [unitOfMeasure, setUnitOfMeasure] = useState("piece");
  const [taxType, setTaxType] = useState("None");
  const [taxRate, setTaxRate] = useState("0");
  const [taxInclusive, setTaxInclusive] = useState(false);

  // Symbol shown inside the price and shipping inputs, follows the selected currency.
  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  // Logistics & inventory
  const [shippingCost, setShippingCost] = useState("0");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState("Dispatch ready");
  const [quantityAvailable, setQuantityAvailable] = useState("");
  const [moq, setMoq] = useState(1);

  // Advanced
  const [aiScore, setAiScore] = useState("");
  const [sku, setSku] = useState("");
  const [notifyBuyers, setNotifyBuyers] = useState(true);

  useEffect(() => {
    fetchCurrentSupplier()
      .then((s) => {
        if (s) setSupplier(s);
        else router.replace("/suppliers/login");
      })
      .catch(() => router.replace("/suppliers/login"))
      .finally(() => setAuthChecked(true));
  }, [router]);

  // Edit mode: load the offers and find the one being edited.
  const { data: allOffers, isLoading: offersLoading } = useQuery({
    queryKey: ["supply-chain"],
    queryFn: listSupplyChainOffers,
    enabled: !!editId && authChecked && !!supplier,
  });

  const offer = editId ? allOffers?.find((o) => String(o.id) === editId) : undefined;
  const isOwner = !!offer && !!supplier && offer.supplierId === supplier.id;

  // Prefill the form once, when the offer first arrives.
  useEffect(() => {
    if (!offer || !isOwner || loaded) return;
    setItem(offer.item);
    setDescription(offer.description ?? "");
    setCategory(offer.category ?? CATEGORY_OPTIONS[0]);
    setSupplierType(offer.supplierType ?? SUPPLIER_TYPE_OPTIONS[0]);
    setCurrency(offer.currency ?? "INR");
    setUnitPrice(String(offer.unitPrice));
    setUnitOfMeasure(offer.unitOfMeasure ?? "piece");
    setTaxType(offer.taxType ?? "None");
    setTaxRate(String(offer.taxRate ?? "0"));
    setTaxInclusive(!!offer.taxInclusive);
    setShippingCost(String(offer.shippingCost ?? 0));
    setLeadTimeDays(String(offer.leadTimeDays));
    setDispatchStatus(offer.dispatchStatus ?? "Dispatch ready");
    setQuantityAvailable(String(offer.quantityAvailable));
    setMoq(offer.moq ?? 1);
    setAiScore(offer.aiScore != null ? String(offer.aiScore) : "");
    setExistingImageUrl(offer.imageUrl ?? null);

    // SKU is stored inside specs, so pull it back into its own field.
    const { SKU, ...otherSpecs } = (offer.specs ?? {}) as Record<string, string>;
    setSku(SKU ?? "");
    const rows = Object.entries(otherSpecs).map(([key, value]) => ({ key, value: String(value) }));
    setSpecRows(rows.length > 0 ? rows : [{ key: "", value: "" }]);
    setLoaded(true);
  }, [offer, isOwner, loaded]);

  // Clean up the object URL used for the image preview.
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const create = useMutation({
    mutationFn: async ({ file, ...input }: CreateOfferInput & { file: File | null }) => {
      // Only send imageUrl when a new file was picked; the server keeps the old image otherwise.
      const imageUrl = file ? await uploadProductImage(file) : undefined;
      if (editId) return updateSupplyChainOffer(editId, { ...input, imageUrl });
      return createSupplyChainOffer({ ...input, imageUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply-chain"] });
      router.push("/supply-chain");
    },
  });

  function updateSpecRow(i: number, field: "key" | "value", value: string) {
    setSpecRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setImageError("Please choose a JPG or PNG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Image must be 5MB or smaller.");
      return;
    }
    setImageError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier) return;

    const entries = specRows
      .map((r) => [r.key.trim(), r.value.trim()] as const)
      .filter(([k, v]) => k && v);
    // The API has no SKU field yet, so it's stored as a spec.
    if (sku.trim()) entries.push(["SKU", sku.trim()]);

    // The server takes supplierId/supplierName from the login token, so the
    // values below for those two are ignored there. notifyBuyers isn't saved yet.
    create.mutate({
      item,
      description,
      category,
      supplierName: supplier.businessName,
      supplierType,
      unitPrice: Number(unitPrice),
      currency,
      unitOfMeasure,
      leadTimeDays: Number(leadTimeDays),
      shippingCost: Number(shippingCost),
      moq,
      quantityAvailable: Number(quantityAvailable),
      dispatchStatus,
      aiScore: aiScore ? Number(aiScore) : undefined,
      // In edit mode an empty object lets the user remove all specs.
      specs: entries.length > 0 ? Object.fromEntries(entries) : editId ? {} : undefined,
      taxType,
      taxRate: Number(taxRate),
      taxInclusive,
      supplierId: supplier.id,
      file: imageFile,
    });
  }

  if (editId === undefined || !authChecked || !supplier || (!!editId && offersLoading)) {
    return <main className="mx-auto max-w-5xl px-6 py-12 text-sm text-neutral-500">Loading…</main>;
  }

  if (editId && (!offer || !isOwner)) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm text-neutral-600">
          {offer ? "You can only edit your own products." : "Product not found."}{" "}
          <Link href="/supply-chain" className="font-medium text-[#3d6bff] hover:underline">
            Back to catalog
          </Link>
        </p>
      </main>
    );
  }

  const isEdit = !!editId;
  const shownImage = imagePreview ?? (existingImageUrl ? resolveImageUrl(existingImageUrl) : null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      {/* Breadcrumb + heading */}
      <nav className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
        <Link href="/supply-chain" className="hover:text-neutral-700">
          Catalog
        </Link>
        <ChevronRight size={12} />
        <span className="normal-case tracking-normal">{isEdit ? "Edit product" : "Add product"}</span>
      </nav>
      <h1 className="mt-1 text-3xl font-bold text-neutral-900">
        {isEdit ? "Edit Product" : "Add Product"}
      </h1>
      <p className="mt-1 text-sm text-neutral-400">
        {isEdit ? "Editing as" : "Listing as"}{" "}
        <span className="font-medium text-neutral-600">{supplier.businessName}</span>
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {/* ---------- Product details ---------- */}
        <Card icon={<Package size={18} />} title="Product details">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Field label="Product name">
                <input
                  required
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="e.g. Raspberry Pi 5 (8GB RAM)"
                  className={inputClass}
                />
              </Field>

              <Field label="Description">
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short summary buyers will see in the catalog"
                  className={`${inputClass} resize-none`}
                />
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-800">Specifications</span>
                  <button
                    type="button"
                    onClick={() => setSpecRows((r) => [...r, { key: "", value: "" }])}
                    className="flex items-center gap-1 text-xs font-medium text-[#3d6bff] hover:underline"
                  >
                    <Plus size={13} />
                    Add field
                  </button>
                </div>
                {specRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={row.key}
                      onChange={(e) => updateSpecRow(i, "key", e.target.value)}
                      placeholder="e.g. RAM"
                      className={inputClass}
                    />
                    <span className="text-neutral-300">:</span>
                    <input
                      value={row.value}
                      onChange={(e) => updateSpecRow(i, "value", e.target.value)}
                      placeholder="e.g. 8GB"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setSpecRows((r) => r.filter((_, idx) => idx !== i))}
                      className="shrink-0 p-1 text-neutral-300 transition hover:text-red-500"
                      aria-label="Remove specification"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Image upload */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-neutral-800">Product image</span>
              <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-neutral-200 p-5 text-center transition hover:border-[#3d6bff]/50">
                {shownImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shownImage}
                    alt="Product preview"
                    className="aspect-[16/9] w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl bg-neutral-50 text-neutral-300">
                    <Package size={32} />
                  </div>
                )}
                <UploadCloud size={18} className="text-neutral-400" />
                <span className="text-xs text-neutral-500">
                  {shownImage ? "Click to replace" : "Click to upload"} · JPG/PNG up to 5MB
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleImageSelected}
                  className="hidden"
                />
              </label>
              {imageError && <p className="text-xs text-red-600">{imageError}</p>}
            </div>
          </div>
        </Card>

        {/* ---------- Classification ---------- */}
        <Card icon={<Tag size={18} />} title="Classification">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {/* Keep an older category selectable even if it's not in the list. */}
                {!CATEGORY_OPTIONS.includes(category) && <option>{category}</option>}
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Supplier type">
              <select
                value={supplierType}
                onChange={(e) => setSupplierType(e.target.value)}
                className={inputClass}
              >
                {!SUPPLIER_TYPE_OPTIONS.includes(supplierType) && <option>{supplierType}</option>}
                {SUPPLIER_TYPE_OPTIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {/* ---------- Pricing & tax ---------- */}
        <Card icon={<DollarSign size={18} />} title="Pricing & tax">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Currency">
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit price">
              <AdornedInput
                required
                type="number"
                min="0.01"
                step="0.01"
                prefix={symbol}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Unit of measure">
              <select
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
                className={inputClass}
              >
                {UNIT_OF_MEASURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tax type">
              <select value={taxType} onChange={(e) => setTaxType(e.target.value)} className={inputClass}>
                <option>None</option>
                <option>GST</option>
                <option>VAT</option>
                <option>Sales Tax</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Tax rate">
              <AdornedInput
                type="number"
                min="0"
                max="100"
                step="0.01"
                suffix="%"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3.5">
            <span className="text-sm text-neutral-700">Price includes tax</span>
            <Toggle checked={taxInclusive} onChange={setTaxInclusive} />
          </div>
        </Card>

        {/* ---------- Logistics & inventory ---------- */}
        <Card icon={<Truck size={18} />} title="Logistics & inventory">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Shipping cost">
              <AdornedInput
                type="number"
                min="0"
                step="0.01"
                prefix={symbol}
                value={shippingCost}
                onChange={(e) => setShippingCost(e.target.value)}
              />
            </Field>
            <Field label="Lead time">
              <AdornedInput
                required
                type="number"
                min="0"
                step="1"
                suffix="days"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
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
                min="0"
                step="1"
                value={quantityAvailable}
                onChange={(e) => setQuantityAvailable(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-800">MOQ (Minimum Order Quantity)</span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-[#3d6bff]">
                <input
                  type="number"
                  min={1}
                  value={moq}
                  onChange={(e) => setMoq(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded-md border border-transparent bg-transparent text-right outline-none hover:border-neutral-200 focus:border-[#3d6bff]"
                  aria-label="Minimum order quantity"
                />
                units
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={200}
              value={Math.min(moq, 200)}
              onChange={(e) => setMoq(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-[#3d6bff]"
              aria-label="Minimum order quantity slider"
            />
          </div>
        </Card>

        {/* ---------- Advanced ---------- */}
        <Card icon={<SlidersHorizontal size={18} />} title="Advanced">
          <div className="grid grid-cols-1 items-end gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
            <Field label="SKU (optional)">
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. PROD-123"
                className={inputClass}
              />
            </Field>
            <div className="flex items-center gap-3 py-2.5 sm:col-span-2">
              <Toggle checked={notifyBuyers} onChange={setNotifyBuyers} />
              <span className="text-sm text-neutral-700">Notify buyers when stock changes</span>
            </div>
          </div>
        </Card>

        {create.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            {(create.error as Error).message}
          </div>
        )}

        {/* ---------- Actions ---------- */}
        <div className="flex items-center justify-end gap-6 pt-2">
          <Link href="/supply-chain" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-xl bg-[#3d6bff] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[#3d6bff]/25 transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
          >
            {create.isPending
              ? isEdit
                ? "Saving…"
                : "Adding…"
              : isEdit
                ? "Save changes"
                : "Add product"}
          </button>
        </div>
      </form>
    </main>
  );
}