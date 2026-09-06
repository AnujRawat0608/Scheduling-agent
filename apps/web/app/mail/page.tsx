"use client";

import { useState } from "react";
import { Mail as MailIcon, Send, Inbox as InboxIcon } from "lucide-react";

type ReceivedMail = {
  id: string;
  from: string;
  subject: string;
  preview: string;
  body: string;
  date: string;
  unread: boolean;
};

const mockInbox: ReceivedMail[] = [
  {
    id: "1",
    from: "supplier-b@partsco.com",
    subject: "RFQ response — M4 stainless bolts",
    preview: "We can fulfil 200 units at $0.42/unit, lead time 6 days...",
    body: "Hi,\n\nWe can fulfil 200 units at $0.42/unit, lead time 6 days from PO confirmation. Let us know if you'd like to proceed.\n\nBest,\nSupplier B",
    date: "Sep 6, 9:12 AM",
    unread: true,
  },
  {
    id: "2",
    from: "logistics@fastfreight.com",
    subject: "Shipment update — Order #4821",
    preview: "Your shipment has left our warehouse and is now in transit...",
    body: "Your shipment has left our warehouse and is now in transit. Estimated delivery: Sep 9.\n\nTrack here: fastfreight.com/track/4821",
    date: "Sep 5, 4:47 PM",
    unread: true,
  },
  {
    id: "3",
    from: "supplier-d@rapidparts.io",
    subject: "Re: Raspberry Pi 5 availability",
    preview: "Confirming stock for 50 units, ready to ship same day...",
    body: "Confirming stock for 50 units, ready to ship same day. MOQ has been waived for this order per your account rep.",
    date: "Sep 2, 2:20 PM",
    unread: false,
  },
  {
    id: "4",
    from: "billing@partsco.com",
    subject: "Invoice #INV-2291 for your recent order",
    preview: "Attached is the invoice for your order placed on Aug 29...",
    body: "Attached is the invoice for your order placed on Aug 29. Payment terms: Net 30.",
    date: "Aug 30, 11:05 AM",
    unread: false,
  },
];

function WindowDots() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 bg-neutral-50">
      <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
      <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

export default function MailPage() {
  const [tab, setTab] = useState<"inbox" | "compose">("inbox");
  const [selected, setSelected] = useState<ReceivedMail | null>(mockInbox[0]);

  const [form, setForm] = useState({ name: "", from: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  function handleSend() {
    // No real send yet — this is a UI mockup. Wire this up to your backend
    // once mail sending exists (e.g. POST to lib/api.ts).
    setSent(true);
    setTimeout(() => setSent(false), 2500);
    setForm({ name: "", from: "", subject: "", message: "" });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">Mail</h1>

        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
          <button
            onClick={() => setTab("inbox")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "inbox"
                ? "bg-[#3d6bff] text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <InboxIcon size={15} />
            Inbox
          </button>
          <button
            onClick={() => setTab("compose")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === "compose"
                ? "bg-[#3d6bff] text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <MailIcon size={15} />
            Compose
          </button>
        </div>
      </div>

      {tab === "inbox" && (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
          {/* Message list */}
          <div className="flex flex-col gap-2">
            {mockInbox.map((mail) => (
              <button
                key={mail.id}
                onClick={() => setSelected(mail)}
                className={`text-left rounded-xl border px-4 py-3 transition ${
                  selected?.id === mail.id
                    ? "border-[#3d6bff] bg-[#eef2ff]"
                    : "border-neutral-200 bg-white hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-sm truncate ${
                      mail.unread ? "font-semibold text-neutral-900" : "text-neutral-700"
                    }`}
                  >
                    {mail.from}
                  </span>
                  {mail.unread && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3d6bff] shrink-0 ml-2" />
                  )}
                </div>
                <div className="text-sm text-neutral-900 truncate mb-0.5">{mail.subject}</div>
                <div className="text-xs text-neutral-400 truncate">{mail.preview}</div>
                <div className="text-[11px] text-neutral-400 mt-1.5">{mail.date}</div>
              </button>
            ))}
          </div>

          {/* Reading pane */}
          <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden min-h-[300px]">
            <WindowDots />
            <div className="p-6">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-lg font-semibold text-neutral-900">{selected.subject}</div>
                    <div className="text-sm text-neutral-500 mt-0.5">
                      From {selected.from} · {selected.date}
                    </div>
                  </div>
                  <button
                    onClick={() => setTab("compose")}
                    className="text-sm font-medium text-[#3d6bff] hover:underline shrink-0"
                  >
                    Reply
                  </button>
                </div>
                <div className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
                  {selected.body}
                </div>
              </>
            ) : (
              <div className="text-sm text-neutral-400">Select a message to read it.</div>
            )}
            </div>
          </div>
        </div>
      )}

      {tab === "compose" && (
        <div className="max-w-xl rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <WindowDots />
          <div className="divide-y divide-neutral-200">
            <div className="flex items-center px-5 py-3 gap-3">
              <span className="text-sm text-neutral-400 w-16 shrink-0">Name:</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your name"
                className="flex-1 text-sm text-neutral-900 placeholder-neutral-400 outline-none"
              />
            </div>
            <div className="flex items-center px-5 py-3 gap-3">
              <span className="text-sm text-neutral-400 w-16 shrink-0">From:</span>
              <input
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                placeholder="your@email.com"
                className="flex-1 text-sm text-neutral-900 placeholder-neutral-400 outline-none"
              />
            </div>
            <div className="flex items-center px-5 py-3 gap-3">
              <span className="text-sm text-neutral-400 w-16 shrink-0">Subject:</span>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Subject"
                className="flex-1 text-sm text-neutral-900 placeholder-neutral-400 outline-none"
              />
            </div>
            <div className="px-5 py-4">
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Write your message..."
                rows={8}
                className="w-full text-sm text-neutral-900 placeholder-neutral-400 outline-none resize-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-4 bg-neutral-50">
            <span className="text-xs text-neutral-400">
              {sent ? "Sent (mock — not actually delivered yet)" : "Not connected to a mail server yet"}
            </span>
            <button
              onClick={handleSend}
              className="flex items-center gap-1.5 rounded-lg bg-[#3d6bff] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d6bff]/90 transition"
            >
              <Send size={14} />
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}