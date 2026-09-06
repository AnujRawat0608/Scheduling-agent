"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes, X } from "lucide-react";
import {
  listSupplyChainOffers,
  createSupplyChainOffer,
  deleteSupplyChainOffer,
} from "../../lib/supplyChainApi";

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`space-y-1.5 ${span2 ? "col-span-2" : ""}`}>
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-[#3d6bff] focus:ring-1 focus:ring-[#3d6bff]";

export default function SupplyChainPage() {
  const queryClient = useQueryClient();
  const [item, setItem] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [shippingCost, setShippingCost] = useState("0");
  const [moq, setMoq] = useState("1");
  const [quantityAvailable, setQuantityAvailable] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["supply-chain"],
    queryFn: listSupplyChainOffers,
  });

  const create = useMutation({
    mutationFn: createSupplyChainOffer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supply-chain"] });
      setItem("");
      setSupplierName("");
      setSupplierType("");
      setUnitPrice("");
      setLeadTimeDays("");
      setShippingCost("0");
      setMoq("1");
      setQuantityAvailable("");
    },
  });

  const remove = useMutation({
    mutationFn: deleteSupplyChainOffer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["supply-chain"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      item,
      supplierName,
      supplierType,
      unitPrice: Number(unitPrice),
      leadTimeDays: Number(leadTimeDays),
      shippingCost: Number(shippingCost),
      moq: Number(moq),
      quantityAvailable: Number(quantityAvailable),
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 space-y-6">
      <div className="flex items-center gap-2">
        <Boxes size={22} className="text-[#3d6bff]" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Supply chain catalog</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            Products and their supplier offers. Procurement requests match against this
            catalog before falling back to simulated quotes.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-2 gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      >
        <Field label="Product / item" span2>
          <input
            required
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Raspberry Pi 5"
            className={inputClass}
          />
        </Field>

        <Field label="Supplier name">
          <input
            required
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Acme Electronics"
            className={inputClass}
          />
        </Field>

        <Field label="Supplier type">
          <input
            required
            value={supplierType}
            onChange={(e) => setSupplierType(e.target.value)}
            placeholder="Distributor"
            className={inputClass}
          />
        </Field>

        <Field label="Unit price (₹)">
          <input
            required
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Lead time (days)">
          <input
            required
            type="number"
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Quantity available">
          <input
            required
            type="number"
            value={quantityAvailable}
            onChange={(e) => setQuantityAvailable(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Shipping cost (₹)">
          <input
            type="number"
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="MOQ">
          <input
            type="number"
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            className={inputClass}
          />
        </Field>

        {create.isError && (
          <div className="col-span-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {(create.error as Error).message}
          </div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="col-span-2 rounded-lg bg-[#3d6bff] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#3d6bff]/90 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add offer"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-sm text-neutral-500">
            No offers yet. Add some above — procurement requests will match against them.
          </p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h2 className="text-sm font-medium text-neutral-700">Current offers</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-6 py-2.5">Item</th>
                <th className="px-6 py-2.5">Supplier</th>
                <th className="px-6 py-2.5">Unit price</th>
                <th className="px-6 py-2.5">Lead time</th>
                <th className="px-6 py-2.5">In stock</th>
                <th className="px-6 py-2.5">MOQ</th>
                <th className="px-6 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-t border-neutral-100">
                  <td className="px-6 py-3 font-medium text-neutral-900">{o.item}</td>
                  <td className="px-6 py-3 text-neutral-600">{o.supplierName}</td>
                  <td className="px-6 py-3 text-neutral-600">
                    ₹{o.unitPrice.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-3 text-neutral-600">{o.leadTimeDays}d</td>
                  <td className="px-6 py-3 text-neutral-600">{o.quantityAvailable}</td>
                  <td className="px-6 py-3 text-neutral-600">{o.moq}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => remove.mutate(o.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-red-600 transition"
                      aria-label="Remove offer"
                    >
                      <X size={13} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}