import { formatISO } from "date-fns";
import type { SupplierQuote } from "../state.js";

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1_000_000;
  return h;
}

export function fetchSimulatedSupplierQuotes(
  item: string,
  quantity: number
): SupplierQuote[] {
  const seed = seedFromString(item);
  const basePrice = 500 + (seed % 5000);

  const suppliers = [
    { name: "Supplier A", priceMultiplier: 1.0, leadTime: 7, moqDivisor: 10 },
    { name: "Supplier B", priceMultiplier: 0.93, leadTime: 14, moqDivisor: 20 },
    { name: "Supplier C", priceMultiplier: 0.97, leadTime: 5, moqDivisor: 5 },
  ];

  return suppliers.map((s) => ({
    supplierName: s.name,
    unitPrice: Math.round(basePrice * s.priceMultiplier),
    quantityAvailable: quantity + (seed % 50),
    leadTimeDays: s.leadTime,
    shippingCost: Math.round(basePrice * 0.5),
    moq: Math.max(1, Math.floor(quantity / s.moqDivisor)),
    respondedAt: formatISO(new Date()),
  }));
}