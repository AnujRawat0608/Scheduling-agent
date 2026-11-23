/**
 * Buyer-facing supplier trust summary.
 * Route: GET /api/procurers/suppliers/:id/trust  (buyers only)
 *
 * toSupplierTrust() is the ONLY place that decides what a buyer can see.
 * Never spread a database row into the response.
 */
import { Router } from "express";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { suppliers, supplierCertifications, supplierOrders } from "../db/suppliersSchema.js";
import { rfqs } from "../db/rfqsSchema.js";
import { supplierOffers } from "../db/supplyChainSchema.js";
import { requireProcurerAuth } from "../agent/lib/procurerAuth.js";

const MIN_ORDERS = 5; // below this, show "Not enough history yet" instead of a number
const MIN_RFQS = 5;
const RFQ_GRACE_MS = 72 * 60 * 60 * 1000; // a fresh RFQ must not count against a supplier as "unanswered"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_SLOTS = [
  { id: "iso9001", label: "ISO 9001 certificate" },
  { id: "tradeLicense", label: "Trade license" },
  { id: "insurance", label: "Insurance (COI)" },
] as const;

const HANDLED_ORDER_STATUSES = new Set(["confirmed", "shipped", "delivered"]);
const RESPONDED_RFQ_STATUSES = new Set(["quoted", "revision_requested", "accepted"]);

type SupplierRow = {
  id: string;
  businessName: string;
  region: string | null;
  country: string | null;
  businessType: string | null;
  yearEstablished: number | null;
  totalEmployees: string | null;
  mainProducts: string | null;
  gstNumber: string | null;
  gstVerified: boolean;
  verificationStatus: string;
  createdAt: Date;
};
type CertRow = { certType: string; verified: boolean; validUntil: Date | null };
type OrderRow = { status: string };
type RfqRow = { status: string; createdAt: Date };

export type TrustInputs = {
  supplier: SupplierRow;
  certs: CertRow[];
  orders: OrderRow[];
  rfqs: RfqRow[];
  catalogSize: number;
};

export function toSupplierTrust({ supplier: s, certs, orders, rfqs: rfqRows, catalogSize }: TrustInputs) {
  const now = Date.now();

  const handled = orders.filter((o) => HANDLED_ORDER_STATUSES.has(o.status)).length;

  const responded = rfqRows.filter((r) => RESPONDED_RFQ_STATUSES.has(r.status)).length;
  const unanswered = rfqRows.filter(
    (r) => r.status === "sent" && now - new Date(r.createdAt).getTime() > RFQ_GRACE_MS
  ).length;
  const eligibleRfqs = responded + unanswered;

  return {
    supplierId: s.id,
    businessName: s.businessName,
    region: s.region,
    country: s.country,
    businessType: s.businessType,
    yearEstablished: s.yearEstablished,
    totalEmployees: s.totalEmployees,
    mainProducts: s.mainProducts,
    memberSince: s.createdAt.toISOString(),
    compliance: {
      // METIS's own KYC review of the business (set by an admin), not something the supplier can edit
      businessVerified: s.verificationStatus === "verified",
      gstProvided: !!s.gstNumber, // the number itself is never sent
      gstVerified: s.gstVerified,
      // provided / verified / expired only: no file names, numbers, issuers or storage keys
      documents: DOC_SLOTS.map((d) => {
        const c = certs.find((x) => x.certType === d.id);
        return {
          id: d.id,
          label: d.label,
          provided: !!c,
          verified: !!c?.verified,
          expired: !!c?.validUntil && new Date(c.validUntil).getTime() < now,
        };
      }),
    },
    performance: {
      // confirmed, shipped or delivered. Rounded down to a band so exact volume stays private.
      ordersHandled: handled >= MIN_ORDERS ? Math.floor(handled / 5) * 5 : null,
      // Needs promised/shipped/delivered dates on supplier_orders, which don't exist yet.
      onTimeRate: null as number | null,
      quoteResponseRate: eligibleRfqs >= MIN_RFQS ? responded / eligibleRfqs : null,
      catalogSize,
    },
  };
}

async function loadTrustInputs(supplierId: string): Promise<TrustInputs | null> {
  const [supplier] = await db
    .select({
      id: suppliers.id,
      businessName: suppliers.businessName,
      region: suppliers.region,
      country: suppliers.country,
      businessType: suppliers.businessType,
      yearEstablished: suppliers.yearEstablished,
      totalEmployees: suppliers.totalEmployees,
      mainProducts: suppliers.mainProducts,
      gstNumber: suppliers.gstNumber,
      gstVerified: suppliers.gstVerified,
      verificationStatus: suppliers.verificationStatus,
      createdAt: suppliers.createdAt,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);
  if (!supplier) return null;

  const [certs, orders, rfqRows, [catalog]] = await Promise.all([
    db
      .select({
        certType: supplierCertifications.certType,
        verified: supplierCertifications.verified,
        validUntil: supplierCertifications.validUntil,
      })
      .from(supplierCertifications)
      .where(eq(supplierCertifications.supplierId, supplierId)),
    db.select({ status: supplierOrders.status }).from(supplierOrders).where(eq(supplierOrders.supplierId, supplierId)),
    db
      .select({ status: rfqs.status, createdAt: rfqs.createdAt })
      .from(rfqs)
      .where(and(eq(rfqs.supplierId, supplierId), ne(rfqs.status, "draft"))),
    db.select({ n: count() }).from(supplierOffers).where(eq(supplierOffers.supplierId, supplierId)),
  ]);

  return { supplier, certs, orders, rfqs: rfqRows, catalogSize: catalog?.n ?? 0 };
}

export const supplierTrustRouter = Router();

supplierTrustRouter.get("/procurers/suppliers/:id/trust", requireProcurerAuth, async (req, res) => {
  const id = req.params.id;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid supplier id" });

  try {
    const inputs = await loadTrustInputs(id);
    if (!inputs) return res.status(404).json({ error: "Supplier not found" });
    res.json(toSupplierTrust(inputs));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});