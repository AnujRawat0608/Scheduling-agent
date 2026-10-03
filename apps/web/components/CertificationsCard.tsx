import { ShieldCheck, FileText, ExternalLink } from "lucide-react";
import { resolveImageUrl } from "../lib/supplyChainApi";
import type { SupplierCertificate } from "../lib/supplierProfileApi";

function parseCertifications(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function isImage(c: SupplierCertificate) {
  return (
    c.mimeType?.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(c.fileUrl)
  );
}

export function CertificationsCard({
  certifications,
  certificates = [],
}: {
  certifications: string | null | undefined;
  certificates?: SupplierCertificate[];
}) {
  const names = parseCertifications(certifications);
  const empty = names.length === 0 && certificates.length === 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck size={16} className="text-[#c2410c]" />
        <h2 className="text-base font-semibold text-neutral-900">Certifications</h2>
      </div>

      {empty ? (
        <p className="text-sm text-neutral-400">
          This supplier hasn&apos;t listed any certifications yet.
        </p>
      ) : (
        <div className="space-y-5">
          {names.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {names.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                >
                  <ShieldCheck size={12} />
                  {n}
                </span>
              ))}
            </div>
          )}

          {certificates.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {certificates.map((c) => {
                const href = resolveImageUrl(c.fileUrl);
                return (
                  <a
                    key={c.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group overflow-hidden rounded-xl border border-neutral-200 transition hover:border-[#F97316]"
                  >
                    <div className="flex h-36 items-center justify-center bg-neutral-50">
                      {isImage(c) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={href} alt={c.label} className="h-full w-full object-cover" />
                      ) : (
                        <FileText size={32} className="text-neutral-300" />
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-neutral-900">{c.label}</p>
                        {c.expiresAt && (
                          <p className="text-[11px] text-neutral-400">
                            Expires {new Date(c.expiresAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <ExternalLink size={13} className="shrink-0 text-neutral-400 group-hover:text-[#F97316]" />
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}