"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCurrentAdmin } from "../../../lib/adminAuthApi";
import {
  listAdminSuppliers,
  getAdminSupplierDetail,
  verifySupplier,
  rejectSupplier,
  type AdminSupplier,
  type SupplierCertification,
  type VerificationEvent,
} from "../../../lib/adminSuppliersApi";

type StatusFilter = "all" | "pending" | "verified" | "rejected";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    verified: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function AdminSupplierReviewPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [suppliers, setSuppliers] = useState<AdminSupplier[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    supplier: AdminSupplier;
    certifications: SupplierCertification[];
    events: VerificationEvent[];
  } | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchCurrentAdmin()
      .then((admin) => {
        if (!admin) {
          router.push("/admin/login");
        } else {
          setCheckingAuth(false);
        }
      })
      .catch(() => router.push("/admin/login"));
  }, [router]);

  async function loadSuppliers() {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminSuppliers(statusFilter === "all" ? undefined : statusFilter);
      setSuppliers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!checkingAuth) loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkingAuth, statusFilter]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setActionError(null);
    setRejectNotes("");
    try {
      const data = await getAdminSupplierDetail(id);
      setDetail(data);
    } catch (err) {
      setActionError((err as Error).message);
    }
  }

  async function handleVerify() {
    if (!selectedId) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await verifySupplier(selectedId, { gstVerified: true, notes: "Approved by admin" });
      await openDetail(selectedId);
      await loadSuppliers();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!selectedId) return;
    if (!rejectNotes.trim()) {
      setActionError("A rejection reason is required");
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await rejectSupplier(selectedId, rejectNotes);
      await openDetail(selectedId);
      await loadSuppliers();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  }

  if (checkingAuth) {
    return <p className="p-8 text-sm text-neutral-500">Checking session…</p>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-2xl font-bold text-neutral-900">Supplier Verification</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Review submitted business details and approve or reject suppliers.
      </p>

      <div className="mt-6 flex gap-2">
        {(["pending", "verified", "rejected", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-[#3d6bff] text-white"
                : "border border-neutral-200 text-neutral-600 hover:border-neutral-300"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-[1fr_1.2fr] gap-6">
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          {loading ? (
            <p className="p-6 text-sm text-neutral-500">Loading…</p>
          ) : suppliers.length === 0 ? (
            <p className="p-6 text-sm text-neutral-400">No suppliers in this status.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Business</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openDetail(s.id)}
                    className={`cursor-pointer border-t border-neutral-100 transition hover:bg-neutral-50 ${
                      selectedId === s.id ? "bg-[#eef2ff]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{s.businessName}</div>
                      <div className="text-xs text-neutral-400">{s.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.verificationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          {!selectedId ? (
            <p className="text-sm text-neutral-400">Select a supplier to review.</p>
          ) : !detail ? (
            <p className="text-sm text-neutral-500">Loading detail…</p>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  {detail.supplier.businessName}
                </h2>
                <p className="text-sm text-neutral-500">{detail.supplier.email}</p>
                <div className="mt-2">
                  <StatusBadge status={detail.supplier.verificationStatus} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-neutral-400">GST Number</span>
                  <div className="text-neutral-900">{detail.supplier.gstNumber ?? "—"}</div>
                </div>
                <div>
                  <span className="text-xs text-neutral-400">Region</span>
                  <div className="text-neutral-900">{detail.supplier.region ?? "—"}</div>
                </div>
                <div>
                  <span className="text-xs text-neutral-400">Contact</span>
                  <div className="text-neutral-900">{detail.supplier.contactName ?? "—"}</div>
                </div>
                <div>
                  <span className="text-xs text-neutral-400">Phone</span>
                  <div className="text-neutral-900">{detail.supplier.phone ?? "—"}</div>
                </div>
              </div>

              {detail.certifications.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                    Certifications
                  </h3>
                  <div className="space-y-2">
                    {detail.certifications.map((c) => (
                      <div key={c.id} className="rounded-lg border border-neutral-100 p-2 text-sm">
                        <div className="font-medium">{c.certType}</div>
                        <div className="text-xs text-neutral-400">
                          {c.certNumber ?? "no number"} · issued by {c.issuedBy ?? "unknown"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detail.events.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-neutral-500">
                    History
                  </h3>
                  <div className="space-y-2">
                    {detail.events.map((e) => (
                      <div key={e.id} className="text-xs text-neutral-500">
                        <span className="font-medium text-neutral-700">{e.action}</span>{" "}
                        {new Date(e.createdAt).toLocaleString()}
                        {e.notes && <div className="text-neutral-400">"{e.notes}"</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {actionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {actionError}
                </div>
              )}

              {detail.supplier.verificationStatus === "pending" && (
                <div className="space-y-3 border-t border-neutral-100 pt-4">
                  <button
                    onClick={handleVerify}
                    disabled={actionLoading}
                    className="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    Approve
                  </button>

                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Reason for rejection…"
                    rows={2}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                  />
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="w-full rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}