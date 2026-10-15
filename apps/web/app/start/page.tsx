import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Get started | Metis",
  description: "Choose whether you are buying parts or supplying them.",
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7aa4ff]";

function Choice({
  title,
  description,
  primaryHref,
  primaryLabel,
  loginHref,
  loginLabel,
}: {
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  loginHref: string;
  loginLabel: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-7">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 flex-1 text-base leading-relaxed text-white/50">{description}</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href={primaryHref}
          className={`inline-block rounded-full bg-[#3d6bff] px-6 py-3 text-[15px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(61,107,255,0.5)] transition-colors hover:bg-[#3d6bff]/90 ${focusRing}`}
        >
          {primaryLabel}
        </Link>
        <Link
          href={loginHref}
          className={`rounded text-[14px] text-white/60 underline underline-offset-4 transition-colors hover:text-white ${focusRing}`}
        >
          {loginLabel}
        </Link>
      </div>
    </div>
  );
}

export default function Start() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* The layout reserves space at the bottom for the floating dock; keep it black on this page. */}
      <style>{"html, body { background: #000; }"}</style>

      <Link href="/" aria-label="Metis home" className={`fixed top-5 left-6 z-20 rounded ${focusRing}`}>
        <Image src="/metis-icon.png" alt="" width={36} height={36} priority />
      </Link>

      <div className="mx-auto max-w-[900px] px-6 pb-24 pt-32">
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight md:text-[48px]">
          How will you use Metis?
        </h1>
        <p className="mt-4 max-w-[520px] text-lg leading-relaxed text-white/50">
          Choose the option that fits and we&apos;ll take you to the right sign-up.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Choice
            title="I'm buying parts"
            description="Describe what you need. Metis compares suppliers on price, lead time and your deadline, and checks the shipping route for disruption."
            primaryHref="/procurement/register"
            primaryLabel="Create a buyer account"
            loginHref="/procurement/login"
            loginLabel="Log in as a buyer"
          />
          <Choice
            title="I'm a supplier"
            description="Register your business, list your products and receive RFQs from buyers by email."
            primaryHref="/suppliers/register"
            primaryLabel="Create a supplier account"
            loginHref="/suppliers/login"
            loginLabel="Log in as a supplier"
          />
        </div>
      </div>
    </div>
  );
}