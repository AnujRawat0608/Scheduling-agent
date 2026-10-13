/**
 * Builds a PDF invoice in the browser from an order that is already on the screen.
 * jsPDF is loaded on demand (dynamic import) so it never slows down the rest of the app.
 *
 * Install once:  npm install jspdf jspdf-autotable --workspace=apps/web
 *
 * Amounts are printed with the ISO currency code ("INR 1,234.00") rather than a symbol, because
 * jsPDF's built-in fonts cannot draw the rupee sign and would print a broken character.
 */

// Edit these to match your business.
const ISSUER_NAME = "Metis";
const ISSUER_TAGLINE = "Procurement & supply chain";

const ACCENT: [number, number, number] = [194, 65, 12]; // #c2410c, same orange as the billing page
const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];

export interface InvoiceInput {
  invoiceNumber: string;
  orderId: string;
  orderDate: string; // ISO date string
  status: string;
  currency: string;
  requesterName: string;
  requesterEmail: string;
  deliveryAddress: string;
  notes: string | null;
  items: { name: string; quantity: number; unitPrice: number | null; amount: number | null }[];
  subtotal: number | null;
  tax: number;
  shipping: number;
  total: number | null;
}

function money(amount: number | null, currency: string): string {
  if (amount === null) return "-";
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  return `${currency} ${n}`;
}

function longDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Creates the PDF and starts the download. Throws if the PDF library cannot be loaded. */
export async function downloadInvoicePdf(input: InvoiceInput): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 18;
  const right = pageW - margin;
  const cur = input.currency;

  /* ---------- Header ---------- */
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageW, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text("INVOICE", margin, 24);

  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(ISSUER_NAME, margin, 31);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(ISSUER_TAGLINE, margin, 36);

  // Right side: invoice facts
  const facts: [string, string][] = [
    ["Invoice no.", input.invoiceNumber],
    ["Order date", longDate(input.orderDate)],
    ["Status", input.status.charAt(0).toUpperCase() + input.status.slice(1)],
    ["Currency", cur],
  ];
  let fy = 20;
  for (const [label, value] of facts) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(label, right - 52, fy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(value, right, fy, { align: "right" });
    fy += 5.5;
  }

  doc.setDrawColor(...LINE);
  doc.line(margin, 44, right, 44);

  /* ---------- Billed to / Delivery ---------- */
  const colW = (pageW - margin * 2) / 2 - 4;
  const blockTop = 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("BILLED TO", margin, blockTop);
  doc.text("DELIVER TO", margin + colW + 8, blockTop);

  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(input.requesterName || "-", margin, blockTop + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(input.requesterEmail || "-", margin, blockTop + 11);

  doc.setTextColor(...INK);
  const addressLines = doc.splitTextToSize(input.deliveryAddress || "-", colW) as string[];
  doc.text(addressLines, margin + colW + 8, blockTop + 6);

  const tableTop = blockTop + 6 + Math.max(addressLines.length, 2) * 4.5 + 8;

  /* ---------- Items table ---------- */
  autoTable(doc, {
    startY: tableTop,
    margin: { left: margin, right: margin, bottom: 22 },
    head: [["Item", "Qty", "Unit price", "Amount"]],
    body: input.items.map((it) => [
      it.name,
      String(it.quantity),
      it.unitPrice === null ? "No price" : money(it.unitPrice, cur),
      money(it.amount, cur),
    ]),
    theme: "plain",
    styles: { font: "helvetica", fontSize: 9, textColor: INK, cellPadding: { top: 3.2, bottom: 3.2, left: 2, right: 2 } },
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 16 },
      2: { halign: "right", cellWidth: 38 },
      3: { halign: "right", cellWidth: 38 },
    },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index > 0) data.cell.styles.halign = "right";
    },
    didDrawCell: (data) => {
      // thin divider under every body row
      if (data.section === "body") {
        doc.setDrawColor(...LINE);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  const lastTable = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  let y = (lastTable?.finalY ?? tableTop + 20) + 8;

  /* ---------- Totals ---------- */
  // Keep the totals block together on one page.
  if (y + 38 > pageH - 24) {
    doc.addPage();
    y = 24;
  }

  const labelX = right - 70;
  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(label, labelX, y);
    doc.setTextColor(...INK);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 7 : 6;
  };

  row("Subtotal", money(input.subtotal, cur));
  row("Tax", money(input.tax, cur));
  row("Shipping", input.shipping > 0 ? money(input.shipping, cur) : "Free");
  doc.setDrawColor(...INK);
  doc.line(labelX, y - 3, right, y - 3);
  y += 1.5;
  row("Total", money(input.total, cur), true);

  /* ---------- Notes ---------- */
  if (input.notes) {
    y += 6;
    if (y + 20 > pageH - 24) {
      doc.addPage();
      y = 24;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("NOTES", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    const noteLines = doc.splitTextToSize(input.notes, pageW - margin * 2) as string[];
    doc.text(noteLines, margin, y + 5.5);
  }

  /* ---------- Footer on every page ---------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.line(margin, pageH - 16, right, pageH - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Order ${input.orderId}`, margin, pageH - 11);
    doc.text(`Generated on ${longDate(new Date())}. Computer-generated invoice, no signature required.`, margin, pageH - 7);
    doc.text(`Page ${p} of ${pages}`, right, pageH - 11, { align: "right" });
  }

  doc.save(`${input.invoiceNumber}.pdf`);
}