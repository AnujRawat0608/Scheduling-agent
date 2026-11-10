"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Printer, X } from "lucide-react";

/** Tracking code derived from the order id. Same order always gives the same code. */
export function trackingCode(orderId: string) {
  return `MET${orderId.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

type LabelOrder = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  deliveryAddress: string;
  items: { id: string; quantity: number; itemName: string }[];
};

export default function ShippingLabel({
  order,
  supplierName,
  onClose,
}: {
  order: LabelOrder;
  supplierName: string;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const code = trackingCode(order.id);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, code, {
      format: "CODE128",
      width: 2,
      height: 70,
      displayValue: true,
      fontSize: 14,
      margin: 0,
    });
  }, [code]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:static print:block print:bg-white print:p-0">
      {/* Print only the label */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #shipping-label, #shipping-label * { visibility: visible; }
          #shipping-label { position: fixed; left: 0; top: 0; width: 100%; box-shadow: none; border: 2px solid #000; }
        }
      `}</style>

      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl print:max-w-none print:shadow-none">
        <div className="mb-3 flex items-center justify-between print:hidden">
          <h2 className="text-base font-semibold text-slate-900">Shipping label</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div id="shipping-label" className="rounded-lg border border-slate-300 p-4 text-slate-900">
          <div className="flex items-start justify-between">
            <span className="text-sm font-bold tracking-[0.2em]">METIS</span>
            <span className="text-xs text-slate-500">{new Date().toLocaleDateString()}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-400">From</p>
              <p className="font-medium">{supplierName}</p>
            </div>
            <div>
              <p className="text-slate-400">To</p>
              <p className="font-medium">{order.requesterName}</p>
              <p>{order.deliveryAddress}</p>
            </div>
          </div>

          <ul className="mt-3 border-t border-slate-200 pt-2 text-xs">
            {order.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.itemName}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-col items-center border-t border-slate-200 pt-4">
            <svg ref={svgRef} />
            <p className="mt-2 text-[10px] text-slate-400">Order ID {order.id}</p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f58e0] print:hidden"
        >
          <Printer size={15} />
          Print label
        </button>
      </div>
    </div>
  );
}