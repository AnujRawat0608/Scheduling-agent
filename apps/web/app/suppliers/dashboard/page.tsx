"use client";

import { useState } from "react";
import {
  Building2,
  Package,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";

// ---- Types -----------------------------------------------------------

type SupplierProfile = {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

type Product = {
  id: string;
  name: string;
  category: string;
  unitPrice: number;
  unit: string;
  moq: number;
  leadTimeDays: number;
};

// ---- Mock initial data ------------------------------------------------
// Swap these for real API calls once the supplier backend exists.

const INITIAL_PROFILE: SupplierProfile = {
  businessName: "",
  contactName: "",
  email: "",
  phone: "",
  gstNumber: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};

const INITIAL_PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Raspberry Pi 5 (8GB)",
    category: "Single-board computers",
    unitPrice: 6500,
    unit: "unit",
    moq: 10,
    leadTimeDays: 5,
  },
];

function emptyProduct(): Product {
  return {
    id: crypto.randomUUID(),
    name: "",
    category: "",
    unitPrice: 0,
    unit: "unit",
    moq: 1,
    leadTimeDays: 1,
  };
}

function formatINR(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

// ---- Page ---------------------------------------------------------------

export default function SupplierDashboardPage() {
  const [profile, setProfile] = useState<SupplierProfile>(INITIAL_PROFILE);
  const [isEditingProfile, setIsEditingProfile] = useState(true);
  const [draftProfile, setDraftProfile] = useState<SupplierProfile>(profile);

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [draftProduct, setDraftProduct] = useState<Product | null>(null);

  const isProfileComplete = Boolean(
    profile.businessName && profile.email && profile.gstNumber
  );

  // -- Profile handlers --

  function startEditProfile() {
    setDraftProfile(profile);
    setIsEditingProfile(true);
  }

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfile(draftProfile);
    setIsEditingProfile(false);
  }

  function cancelEditProfile() {
    setDraftProfile(profile);
    setIsEditingProfile(false);
  }

  // -- Product handlers --

  function startAddProduct() {
    const fresh = emptyProduct();
    setDraftProduct(fresh);
    setEditingProductId(fresh.id);
  }

  function startEditProduct(product: Product) {
    setDraftProduct(product);
    setEditingProductId(product.id);
  }

  function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!draftProduct) return;

    setProducts((prev) => {
      const exists = prev.some((p) => p.id === draftProduct.id);
      return exists
        ? prev.map((p) => (p.id === draftProduct.id ? draftProduct : p))
        : [...prev, draftProduct];
    });
    setEditingProductId(null);
    setDraftProduct(null);
  }

  function cancelEditProduct() {
    setEditingProductId(null);
    setDraftProduct(null);
  }

  function deleteProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <div className="flex items-center gap-2">
        <Building2 size={22} className="text-[#3d6bff]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            Supplier dashboard
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Keep your business details current and list what you sell.
          </p>
        </div>
      </div>

      {/* ---------------- Business profile ---------------- */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-neutral-700">
            Business details
          </h2>
          {!isEditingProfile && (
            <button
              onClick={startEditProfile}
              className="flex items-center gap-1.5 text-xs font-medium text-[#3d6bff] hover:underline"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={saveProfile} className="grid grid-cols-2 gap-4">
            <Field
              label="Business name"
              required
              value={draftProfile.businessName}
              onChange={(v) => setDraftProfile({ ...draftProfile, businessName: v })}
              placeholder="Acme Components Pvt Ltd"
            />
            <Field
              label="Contact person"
              value={draftProfile.contactName}
              onChange={(v) => setDraftProfile({ ...draftProfile, contactName: v })}
              placeholder="Riya Sharma"
            />
            <Field
              label="Email"
              type="email"
              required
              value={draftProfile.email}
              onChange={(v) => setDraftProfile({ ...draftProfile, email: v })}
              placeholder="sales@acmecomponents.com"
            />
            <Field
              label="Phone"
              value={draftProfile.phone}
              onChange={(v) => setDraftProfile({ ...draftProfile, phone: v })}
              placeholder="+91 98765 43210"
            />
            <Field
              label="GST number"
              required
              value={draftProfile.gstNumber}
              onChange={(v) => setDraftProfile({ ...draftProfile, gstNumber: v })}
              placeholder="27ABCDE1234F1Z5"
            />
            <Field
              label="Pincode"
              value={draftProfile.pincode}
              onChange={(v) => setDraftProfile({ ...draftProfile, pincode: v })}
              placeholder="411001"
            />
            <div className="col-span-2">
              <Field
                label="Address"
                value={draftProfile.address}
                onChange={(v) => setDraftProfile({ ...draftProfile, address: v })}
                placeholder="Plot 12, MIDC Industrial Area"
              />
            </div>
            <Field
              label="City"
              value={draftProfile.city}
              onChange={(v) => setDraftProfile({ ...draftProfile, city: v })}
              placeholder="Pune"
            />
            <Field
              label="State"
              value={draftProfile.state}
              onChange={(v) => setDraftProfile({ ...draftProfile, state: v })}
              placeholder="Maharashtra"
            />

            <div className="col-span-2 flex gap-2 pt-1">
              <button
                type="submit"
                className="rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
              >
                Save details
              </button>
              {isProfileComplete && (
                <button
                  type="button"
                  onClick={cancelEditProfile}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <SummaryRow label="Business name" value={profile.businessName} />
            <SummaryRow label="Contact person" value={profile.contactName} />
            <SummaryRow label="Email" value={profile.email} />
            <SummaryRow label="Phone" value={profile.phone} />
            <SummaryRow label="GST number" value={profile.gstNumber} />
            <SummaryRow label="Pincode" value={profile.pincode} />
            <SummaryRow
              label="Address"
              value={[profile.address, profile.city, profile.state]
                .filter(Boolean)
                .join(", ")}
            />
          </dl>
        )}
      </section>

      {/* ---------------- Products ---------------- */}
      <section className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-[#3d6bff]" />
            <h2 className="text-sm font-medium text-neutral-700">
              Products you sell
            </h2>
          </div>
          {editingProductId === null && (
            <button
              onClick={startAddProduct}
              className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3d6bff]/90"
            >
              <Plus size={14} />
              Add product
            </button>
          )}
        </div>

        {products.length === 0 && editingProductId === null && (
          <p className="px-6 py-8 text-center text-sm text-neutral-400">
            No products yet — add the first one you sell.
          </p>
        )}

        <div className="divide-y divide-neutral-100">
          {products.map((product) =>
            editingProductId === product.id && draftProduct ? (
              <ProductForm
                key={product.id}
                draft={draftProduct}
                setDraft={setDraftProduct}
                onSave={saveProduct}
                onCancel={cancelEditProduct}
              />
            ) : (
              <div
                key={product.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    {product.name}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-400">
                    {product.category} · MOQ {product.moq} {product.unit}
                    {product.moq === 1 ? "" : "s"} · {product.leadTimeDays}d lead time
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-medium text-neutral-900">
                    {formatINR(product.unitPrice)} / {product.unit}
                  </span>
                  <button
                    onClick={() => startEditProduct(product)}
                    className="text-neutral-400 hover:text-neutral-700"
                    aria-label="Edit product"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="text-neutral-400 hover:text-red-600"
                    aria-label="Delete product"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}

          {/* New product form appears at the bottom when adding */}
          {editingProductId !== null &&
            draftProduct &&
            !products.some((p) => p.id === draftProduct.id) && (
              <ProductForm
                draft={draftProduct}
                setDraft={setDraftProduct}
                onSave={saveProduct}
                onCancel={cancelEditProduct}
              />
            )}
        </div>
      </section>
    </main>
  );
}

// ---- Shared subcomponents ------------------------------------------------

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]"
      />
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-neutral-900">{value || "—"}</dd>
    </div>
  );
}

function ProductForm({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: Product;
  setDraft: (p: Product) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSave} className="grid grid-cols-2 gap-3 bg-blue-50/50 px-6 py-4">
      <Field
        label="Product name"
        required
        value={draft.name}
        onChange={(v) => setDraft({ ...draft, name: v })}
        placeholder="Raspberry Pi 5 (8GB)"
      />
      <Field
        label="Category"
        value={draft.category}
        onChange={(v) => setDraft({ ...draft, category: v })}
        placeholder="Single-board computers"
      />
      <Field
        label="Unit price (₹)"
        type="number"
        required
        value={String(draft.unitPrice)}
        onChange={(v) => setDraft({ ...draft, unitPrice: Number(v) || 0 })}
      />
      <Field
        label="Unit"
        value={draft.unit}
        onChange={(v) => setDraft({ ...draft, unit: v })}
        placeholder="unit, kg, box…"
      />
      <Field
        label="Minimum order quantity"
        type="number"
        value={String(draft.moq)}
        onChange={(v) => setDraft({ ...draft, moq: Number(v) || 1 })}
      />
      <Field
        label="Lead time (days)"
        type="number"
        value={String(draft.leadTimeDays)}
        onChange={(v) => setDraft({ ...draft, leadTimeDays: Number(v) || 1 })}
      />

      <div className="col-span-2 flex gap-2 pt-1">
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90"
        >
          <Check size={14} />
          Save product
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}