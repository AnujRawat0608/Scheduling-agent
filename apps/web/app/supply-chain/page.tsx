"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSupplyChainOffers,
  createSupplyChainOffer,
  deleteSupplyChainOffer,
} from "../../lib/supplyChainApi";

export default function SupplyChainPage() {
  const queryClient = useQueryClient();
  const [item, setItem] = useState("");
  const [supplierName, setSupplierName] = useState("");
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
      unitPrice: Number(unitPrice),
      leadTimeDays: Number(leadTimeDays),
      shippingCost: Number(shippingCost),
      moq: Number(moq),
      quantityAvailable: Number(quantityAvailable),
    });
  }

  return (
    <main className="mx-auto max-w-3xl p-8 space-y-8">
      <div>
        <h1 className="text-lg font-medium text-neutral-900">Supply chain catalog</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Products and their supplier offers. Procurement requests match against this
          catalog before falling back to simulated quotes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 p-4">
        <label className="col-span-2 space-y-1">
          <span className="text-xs font-medium text-neutral-700">Product / item</span>
          <input
            required
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Raspberry Pi 5"
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Supplier name</span>
          <input
            required
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Acme Electronics"
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Unit price (₹)</span>
          <input
            required
            type="number"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Lead time (days)</span>
          <input
            required
            type="number"
            value={leadTimeDays}
            onChange={(e) => setLeadTimeDays(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Quantity available</span>
          <input
            required
            type="number"
            value={quantityAvailable}
            onChange={(e) => setQuantityAvailable(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">Shipping cost (₹)</span>
          <input
            type="number"
            value={shippingCost}
            onChange={(e) => setShippingCost(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-neutral-700">MOQ</span>
          <input
            type="number"
            value={moq}
            onChange={(e) => setMoq(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>

        {create.isError && (
          <div className="col-span-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {(create.error as Error).message}
          </div>
        )}

        <button
          type="submit"
          disabled={create.isPending}
          className="col-span-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add offer"}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load: {(error as Error).message}
        </div>
      )}

      {isLoading && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && data.length === 0 && (
        <p className="text-sm text-neutral-500">
          No offers yet. Add some above — procurement requests will match against them.
        </p>
      )}

      {data && data.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
              <tr>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Unit price</th>
                <th className="px-4 py-2">Lead time</th>
                <th className="px-4 py-2">In stock</th>
                <th className="px-4 py-2">MOQ</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-neutral-900">{o.item}</td>
                  <td className="px-4 py-2">{o.supplierName}</td>
                  <td className="px-4 py-2">₹{o.unitPrice.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2">{o.leadTimeDays}d</td>
                  <td className="px-4 py-2">{o.quantityAvailable}</td>
                  <td className="px-4 py-2">{o.moq}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => remove.mutate(o.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      remove
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