"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Mail, MapPin, Phone, Send, User, Clock, CheckCircle2 } from "lucide-react";
import { fetchSupplierProfile, sendMessageToSupplier } from "../../../../lib/supplierProfileApi";

const card = "rounded-xl border border-neutral-200 bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const inputCls =
  "w-full rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none placeholder:text-neutral-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]";
const labelCls = "mb-1.5 block text-xs font-medium text-neutral-700";
const primaryBtn =
  "flex items-center justify-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#EA6A0A] disabled:opacity-50";

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-neutral-100 py-3.5 last:border-0">
      <span className="mt-0.5 text-neutral-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
        <div className="mt-0.5 break-words text-sm font-semibold text-neutral-900">{children}</div>
      </div>
    </div>
  );
}

export default function ContactSupplierPage() {
  const params = useParams();
  const supplierId = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["supplier-profile", supplierId],
    queryFn: () => fetchSupplierProfile(supplierId),
    enabled: !!supplierId,
  });

  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");

  const sendMessage = useMutation({
    mutationFn: () => sendMessageToSupplier(supplierId, { senderName, senderEmail, message }),
    onSuccess: () => {
      setSenderName("");
      setSenderEmail("");
      setMessage("");
    },
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-sm text-neutral-500">Loading supplier…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error instanceof Error ? error.message : "Supplier not found."}
        </div>
      </main>
    );
  }

  // email / phone may not be on the profile type yet, so read them defensively
  const supplier = data.supplier as typeof data.supplier & {
    email?: string | null;
    phone?: string | null;
  };
  const location = [supplier.city, supplier.state].filter(Boolean).join(", ");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-16">
      <Link
        href={`/suppliers/${supplierId}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft size={13} />
        Back to supplier profile
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Contact {supplier.businessName}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Reach out directly or send a message and the supplier will follow up with you.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Message form */}
        <div className={card}>
          <h2 className="text-base font-semibold text-neutral-900">Send message to supplier</h2>
          {supplier.contactName && <p className="mt-1 text-xs text-neutral-500">To: {supplier.contactName}</p>}

          {sendMessage.isSuccess ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <div>
                Message sent. The supplier will see it and can follow up with you directly.
                <button
                  type="button"
                  onClick={() => sendMessage.reset()}
                  className="mt-2 block text-xs font-medium underline"
                >
                  Send another message
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage.mutate();
              }}
              className="mt-4 space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Your name</label>
                  <input
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Your name"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Your email</label>
                  <input
                    required
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="Your email"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Message</label>
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={7}
                  placeholder="Enter your inquiry details such as product name, quantity, and timeline…"
                  className={inputCls}
                />
              </div>
              {sendMessage.isError && (
                <p className="text-sm text-red-600">{(sendMessage.error as Error).message}</p>
              )}
              <div className="flex justify-end">
                <button type="submit" disabled={sendMessage.isPending} className={primaryBtn}>
                  <Send size={14} />
                  {sendMessage.isPending ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Contact details */}
        <div className={card}>
          <h2 className="mb-1 text-base font-semibold text-neutral-900">Contact details</h2>
          <div>
            {supplier.contactName && (
              <ContactRow icon={<User size={15} />} label="Contact person">
                {supplier.contactName}
              </ContactRow>
            )}
            <ContactRow icon={<Mail size={15} />} label="Email">
              {supplier.email ? (
                <a href={`mailto:${supplier.email}`} className="text-[#F97316] hover:underline">
                  {supplier.email}
                </a>
              ) : (
                "—"
              )}
            </ContactRow>
            <ContactRow icon={<Phone size={15} />} label="Phone">
              {supplier.phone ? (
                <a href={`tel:${supplier.phone}`} className="text-[#F97316] hover:underline">
                  {supplier.phone}
                </a>
              ) : (
                "—"
              )}
            </ContactRow>
            {location && (
              <ContactRow icon={<MapPin size={15} />} label="Location">
                {location}
              </ContactRow>
            )}
            {supplier.responseTimeHours != null && (
              <ContactRow icon={<Clock size={15} />} label="Typical response time">
                {supplier.responseTimeHours}
              </ContactRow>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}