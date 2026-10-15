"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";

// Edit these to change where the buttons go.
const CONTACT_EMAIL = "iamanuj681@gmail.com"; // use a mailbox you own; an address on your own domain is better long term
const TRY_LIVE_HREF = "/start"; // asks whether the visitor is a buyer or a supplier
const SUPPLIER_REGISTER_HREF = "/suppliers/register";
const SUPPLIER_LOGIN_HREF = "/suppliers/login";
const PILOT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Metis free pilot")}`;

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

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa4ff]";

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
      className={`transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- small building blocks ---------- */

function Cta({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: React.ReactNode;
}) {
  const base = `inline-block rounded-full px-7 py-3.5 font-medium text-[15px] transition-colors ${focusRing}`;
  const styles =
    variant === "primary"
      ? "bg-[#3d6bff] text-white hover:bg-[#3d6bff]/90 shadow-[0_8px_24px_-6px_rgba(61,107,255,0.5)]"
      : "border border-white/25 text-white hover:bg-white/10";
  const className = `${base} ${styles}`;

  return href.startsWith("mailto:") ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

type Tone = "good" | "warn" | "muted";

function Pill({ tone = "muted", children }: { tone?: Tone; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    good: "border-[#3d6bff]/30 bg-[#3d6bff]/15 text-[#7aa4ff]",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    muted: "border-white/15 bg-white/5 text-white/60",
  };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-1 text-[11px] ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Every mock-up is labelled so nobody mistakes it for a real result. */
function Card({ label = "Example", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 text-[11px] text-white/50">{label}</div>
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
      body: "Describe the part in plain language, with the quantity and the date it has to land. That's the whole request. No forms, no procurement portal.",
      mock: (
        <Card label="Example · new request">
          <div className="mb-4 text-sm text-white/80">
            &ldquo;200 units, M4 stainless bolts, need by the 18th.&rdquo;
          </div>
          <Pill tone="good">Received — sourcing started</Pill>
        </Card>
      ),
    },
    {
      num: "02",
      label: "Sourcing",
      title: "Suppliers found and compared for you.",
      body: "Metis searches registered suppliers and the public web, then builds one comparison across price, lead time, minimum order quantity and your deadline. Offers found on the web are marked unverified and link to the supplier's own site.",
      mock: (
        <Card>
          <div className="space-y-2">
            {[
              { name: "Supplier A", tag: "Verified", tone: "good" as Tone, detail: "$50.00 · 2 days" },
              { name: "Supplier B", tag: "Verified", tone: "good" as Tone, detail: "$54.20 · 5 days" },
              { name: "Supplier C", tag: "Web, unverified", tone: "warn" as Tone, detail: "$47.90 · lead time assumed" },
            ].map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 text-sm text-white/70 last:border-0 last:pb-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {r.name}
                  <Pill tone={r.tone}>{r.tag}</Pill>
                </span>
                <span className="text-[11px] text-white/50">{r.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      ),
    },
    {
      num: "03",
      label: "Compare",
      title: "One plan, not nine quotes.",
      body: "Metis ranks plans on total cost, with price, tax and shipping converted to your currency, and on lead time against your date. It explains its pick and shows alternatives, including a split across suppliers when no single one covers everything.",
      mock: (
        <Card>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium text-white">Single supplier</span>
            <span className="rounded-full bg-[#3d6bff] px-2.5 py-1 text-[11px] font-medium text-white">
              Recommended
            </span>
          </div>
          <div className="space-y-1 text-[13px] text-white/60">
            <div>Cheapest · fastest · arrives 12d before deadline</div>
            <div>2 alternative plans available</div>
          </div>
        </Card>
      ),
    },
    {
      num: "04",
      label: "Route risk",
      title: "Know the route before you commit.",
      body: "Pick the supplier's region and your destination. Metis shows disruption on the lane from public news, so a blocked strait doesn't surprise you after you've ordered. Coverage is growing and currently focuses on key sea chokepoints.",
      mock: (
        <Card>
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-medium text-white">Sea freight</span>
            <Pill tone="warn">Elevated</Pill>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill tone="warn">Bab-el-Mandeb Strait</Pill>
            <Pill tone="good">Suez Canal</Pill>
          </div>
          <div className="text-[13px] text-white/60">
            Air: no tracked chokepoints, so no data. Road: not viable.
          </div>
        </Card>
      ),
    },
    {
      num: "05",
      label: "Approve",
      title: "Nothing goes out until you approve.",
      body: "Review the plan and approve it. Metis then sends RFQs to the chosen suppliers, who reply from their own portal. You can also order straight from catalog suppliers.",
      mock: (
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Plan total: $1,240</div>
            <span className="rounded-full bg-[#3d6bff] px-3 py-1.5 text-[11px] font-medium text-white">
              Approve this plan
            </span>
          </div>
        </Card>
      ),
    },
    {
      num: "06",
      label: "Status",
      title: "See where each order stands.",
      body: "Follow every request and RFQ in one place, and get an email when a supplier ships your order.",
      mock: (
        <Card>
          <div className="space-y-2 text-[13px] text-white/60">
            <div><span className="text-[#7aa4ff]">✓</span> RFQ sent</div>
            <div><span className="text-[#7aa4ff]">✓</span> Quote received</div>
            <div><span className="text-[#7aa4ff]">✓</span> Order confirmed</div>
            <div className="text-white/40">Shipped: you get an email</div>
          </div>
        </Card>
      ),
    },
  ];

  return (
    <div
      className={`${spaceGrotesk.variable} ${inter.variable} min-h-screen bg-black text-white`}
      style={{ fontFamily: "var(--font-body)" }}
    >
      {/* The layout reserves space at the bottom for the floating dock. That space shows the
          body background, which is white, so paint it black while this page is mounted.
          Rendered with the page, so there is no flash and it disappears when you navigate away. */}
      <style>{"html, body { background: #000; }"}</style>

      {/* Logo, top-left. Image file must live at apps/web/public/metis-icon.png */}
      <div className="fixed top-5 left-6 z-20">
        <Image src="/metis-icon.png" alt="Metis" width={36} height={36} priority />
      </div>

      <Link
        href={TRY_LIVE_HREF}
        className={`fixed top-5 right-6 z-20 rounded text-[13px] text-white/60 transition-colors hover:text-white ${focusRing}`}
      >
        Try it live
      </Link>

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
          <p className="text-white/50 text-lg max-w-[600px] mx-auto mb-10 leading-relaxed">
            Describe the part, the quantity and the date. Metis finds suppliers in our network and
            on the web, compares them on price, lead time and your deadline, checks the shipping
            route for disruption, and waits for your approval before anything goes out.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Cta href={PILOT_HREF}>Join the free pilot</Cta>
            <Cta href={TRY_LIVE_HREF} variant="secondary">
              Try it live
            </Cta>
          </div>
          <p className="mt-6 text-[14px] text-white/50">
            Selling parts?{" "}
            <Link
              href={SUPPLIER_REGISTER_HREF}
              className={`rounded text-[#7aa4ff] underline underline-offset-4 hover:text-white ${focusRing}`}
            >
              Register as a supplier
            </Link>
          </p>
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

      {/* FOR SUPPLIERS */}
      <section id="suppliers" className="border-b border-white/10">
        <div className="max-w-[1100px] mx-auto px-6 py-24">
          <Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <div
                  className="text-sm text-[#7aa4ff] mb-4 tracking-wide"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  For suppliers
                </div>
                <h2
                  className="font-semibold tracking-tight text-[28px] md:text-[36px] mb-4 leading-tight"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Showcase your products to buyers.
                </h2>
                <p className="text-white/50 text-[16px] leading-relaxed max-w-[440px]">
                  Register your business and list your products with price, minimum order quantity
                  and lead time. Buyers searching for your parts will find them. When a buyer sends
                  an RFQ, you get an email and reply with your quote from your dashboard. Listing is
                  free during the pilot.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Cta href={SUPPLIER_REGISTER_HREF}>Register as a supplier</Cta>
                  <Cta href={SUPPLIER_LOGIN_HREF} variant="secondary">
                    Supplier log in
                  </Cta>
                </div>
              </div>
              <div>
                <Card label="Example · supplier dashboard">
                  <div className="mb-2 text-[13px] text-white/60">Product catalog</div>
                  <div className="space-y-2">
                    {[
                      { name: "M4 stainless bolt", detail: "MOQ 100 · 3 days", price: "$0.12" },
                      { name: "M6 hex nut", detail: "MOQ 200 · 2 days", price: "$0.05" },
                    ].map((p) => (
                      <div
                        key={p.name}
                        className="flex items-center justify-between gap-3 border-b border-white/5 pb-2 text-sm text-white/70"
                      >
                        <span>{p.name}</span>
                        <span className="text-[11px] text-white/50">
                          {p.detail} · {p.price}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mb-2 mt-5 text-[13px] text-white/60">Requests for quote</div>
                  <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                    <span>200 × M4 stainless bolt</span>
                    <Pill tone="warn">Awaiting quote</Pill>
                  </div>
                </Card>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* WHY */}
      <section id="manifesto" className="max-w-[760px] mx-auto px-6 py-28">
        <Reveal>
          <div className="text-sm text-[#7aa4ff] mb-5 tracking-wide">Why Metis exists</div>
          <h2
            className="font-semibold text-[26px] md:text-[34px] leading-relaxed tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Procurement teams spend more time chasing quotes than choosing between them.{" "}
            <span className="text-white/40">
              I&apos;ve worked on Oracle procurement and supply chain systems, and the real work
              still happens in email and spreadsheets.
            </span>{" "}
            Metis does the legwork and leaves the decision to you.
          </h2>
        </Reveal>
      </section>

      {/* PILOT */}
      <section id="pilot" className="border-t border-white/10 py-28 text-center px-6">
        <Reveal>
          <h2
            className="font-semibold text-[30px] md:text-[44px] tracking-tight mb-5 max-w-[720px] mx-auto"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Free for 4 to 6 weeks, for a small number of teams.
          </h2>
          <p className="text-white/50 text-base mb-9 max-w-[520px] mx-auto leading-relaxed">
            I&apos;ll run your first 3 real sourcing requests with you. In return, I ask for a short
            weekly call about what worked and what didn&apos;t.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Cta href={PILOT_HREF}>Join the free pilot</Cta>
            <Cta href={TRY_LIVE_HREF} variant="secondary">
              Try it live
            </Cta>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row justify-between items-center gap-3 text-[13px] text-white/50">
          <div>© 2026 Metis</div>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={`rounded underline-offset-4 hover:text-white hover:underline ${focusRing}`}
          >
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}