"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Space_Grotesk, Inter } from "next/font/google";


const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

type Step = {
  num: string;
  label: string;
  title: string;
  body: string;
  mock: React.ReactNode;
};

export default function Home() {
  const steps: Step[] = [
    {
      num: "01",
      label: "The ask",
      title: "Say what you need, once.",
      body: "A part number, a spec sheet, or just a plain description — plus the quantity and the date it has to land. That's the entire request. No forms, no procurement portal.",
      mock: (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="text-[11px] text-white/40 mb-3">metis · new request</div>
          <div className="text-sm text-white/80 mb-4">
            &ldquo;200 units, M4 stainless bolts, need by the 18th.&rdquo;
          </div>
          <div className="inline-block text-[11px] rounded-full bg-[#3d6bff]/15 border border-[#3d6bff]/30 px-2.5 py-1 text-[#7aa4ff]">
            Received — sourcing started
          </div>
        </div>
      ),
    },
    {
      num: "02",
      label: "Sourcing",
      title: "Every supplier, worked at once.",
      body: "Metis finds every supplier that can fill the order, sends RFQs to all of them in parallel, and builds one comparison — price, lead time, minimum order quantity. What normally takes days of email happens in minutes.",
      mock: (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
          {["Supplier A", "Supplier B", "Supplier C", "Supplier D"].map((s) => (
            <div
              key={s}
              className="flex items-center justify-between text-sm text-white/70 border-b border-white/5 pb-2 last:border-0 last:pb-0"
            >
              <span>{s}</span>
              <span className="text-[11px] text-white/40">RFQ sent</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      num: "03",
      label: "Compare",
      title: "One recommendation, not nine quotes.",
      body: "As replies land, Metis ranks every quote on true cost, lead time against your date, and reliability — then surfaces the one that fits best, with a runner-up held as backup.",
      mock: (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-white font-medium">Supplier B</span>
            <span className="text-[11px] rounded-full bg-[#3d6bff] text-white px-2.5 py-1 font-medium">
              Recommended
            </span>
          </div>
          <div className="text-[13px] text-white/50 space-y-1">
            <div>Meets your date · lowest landed cost</div>
            <div>Backup: Supplier D, held in reserve</div>
          </div>
        </div>
      ),
    },
    {
      num: "04",
      label: "Approve",
      title: "You approve. That's the last step.",
      body: "One click confirms the order. Metis places it, confirms with the supplier, and starts tracking you don't touch another email on this order.",
      mock: (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex items-center justify-between">
          <div className="text-sm text-white/70">Order total: $1,240</div>
          <div className="text-[11px] rounded-full bg-[#3d6bff] px-3 py-1.5 text-white font-medium">
            Approve →
          </div>
        </div>
      ),
    },
    {
      num: "05",
      label: "Tracking",
      title: "Status, without asking.",
      body: "Metis watches the order end to end and pings you at every real milestone confirmed, shipped, delivered so you stop refreshing inboxes for an update.",
      mock: (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-2 text-[13px] text-white/60">
          <div><span className="text-[#7aa4ff]">✓</span> Order confirmed</div>
          <div><span className="text-[#7aa4ff]">✓</span> Shipped — carrier tracking live</div>
          <div className="text-white/30">Delivered — pending</div>
        </div>
      ),
    },
  ];

  return (
    <div
      className={`${spaceGrotesk.variable} ${inter.variable} min-h-screen bg-black text-white`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* Logo, top-left. Image file must live at apps/web/public/metis-icon.png */}
      <div className="fixed top-5 left-6 z-20">
        <Image src="/metis-icon.png" alt="Metis" width={36} height={36} priority />
      </div>

      {/* No "open app" link yet — add one here once a route is ready to send
          people to, e.g.:
          <a href="/your-route" className="fixed top-5 right-6 z-20 text-[13px] text-white/60 hover:text-white transition-colors flex items-center gap-1.5">Open app →</a> */}

      {/* HERO */}
      <section className="max-w-[1100px] mx-auto px-6 pt-28 pb-24 text-center">
        <Reveal>
          <div className="inline-flex items-center gap-2 text-[13px] text-white/50 border border-[#3d6bff]/30 bg-[#3d6bff]/[0.06] rounded-full px-3.5 py-1.5 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-[#3d6bff] shadow-[0_0_8px_1px_#3d6bff]" />
            For teams that source physical parts
          </div>
          <h1
            className="font-semibold tracking-tight leading-[1.05] text-[42px] md:text-[68px] mb-6"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Procurement, without the chase.
          </h1>
          <p className="text-white/50 text-lg max-w-[560px] mx-auto mb-10 leading-relaxed">
            Describe the part, the quantity, and the date. Metis finds every
            qualified supplier, compares quotes, and places the order you
            approve once.
          </p>
          <a
            href="#demo"
            className="inline-block bg-[#3d6bff] text-white rounded-full px-7 py-3.5 font-medium text-[15px] hover:bg-[#3d6bff]/90 transition-colors shadow-[0_8px_24px_-6px_rgba(61,107,255,0.5)]"
          >
            Book a demo
          </a>
        </Reveal>
      </section>

      {/* NUMBERED STORY */}
      <section className="border-t border-white/10">
        {steps.map((step, i) => (
          <div
            key={step.num}
            className="border-b border-white/10 max-w-[1100px] mx-auto px-6 py-24"
          >
            <Reveal>
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-12 items-center ${
                  i % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <div
                    className="text-sm text-[#7aa4ff] mb-4 tracking-wide"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {step.num} · {step.label}
                  </div>
                  <h2
                    className="font-semibold tracking-tight text-[28px] md:text-[36px] mb-4 leading-tight"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {step.title}
                  </h2>
                  <p className="text-white/50 text-[16px] leading-relaxed max-w-[440px]">
                    {step.body}
                  </p>
                </div>
                <div>{step.mock}</div>
              </div>
            </Reveal>
          </div>
        ))}
      </section>

      {/* MANIFESTO */}
      <section id="manifesto" className="max-w-[760px] mx-auto px-6 py-28">
        <Reveal>
          <div className="text-sm text-[#7aa4ff] mb-5 tracking-wide">WHY METIS EXISTS</div>
          <h2
            className="font-semibold text-[26px] md:text-[34px] leading-relaxed tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Procurement teams spend more time chasing quotes than deciding
            between them.{" "}
            <span className="text-white/40">
              We think sourcing should be a conversation with an agent that
              already knows your suppliers
            </span>{" "}
            — not a week of emails and spreadsheets before a single order gets
            placed.
          </h2>
        </Reveal>
      </section>

      {/* CTA */}
      <section id="demo" className="border-t border-white/10 py-28 text-center px-6">
        <Reveal>
          <h2
            className="font-semibold text-[30px] md:text-[44px] tracking-tight mb-5"
            style={{ fontFamily: "var(--font-display)" }}
          >
            See Metis source a real order.
          </h2>
          <p className="text-white/50 text-base mb-9">
            15 minutes. Bring a real spec if you have one.
          </p>
          <a
            href="mailto:hello@metis.ai"
            className="inline-block bg-[#3d6bff] text-white rounded-full px-7 py-3.5 font-medium text-[15px] hover:bg-[#3d6bff]/90 transition-colors shadow-[0_8px_24px_-6px_rgba(61,107,255,0.5)]"
          >
            Book a demo
          </a>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row justify-between items-center gap-3 text-[13px] text-white/40">
          <div>© 2026 Metis</div>
          <div>hello@metis.ai</div>
        </div>
      </footer>
    </div>
  );
}