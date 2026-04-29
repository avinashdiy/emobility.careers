import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="emce-hero-gradient hidden flex-col justify-between p-10 text-white lg:flex">
        {/* Logo wordmark sits inside a white pill — the dark teal type
            inside the PNG would otherwise blend with the hero gradient. */}
        <Link href="/" aria-label="Home" className="inline-flex">
          <span className="rounded-md bg-white px-3 py-1.5">
            <Logo size="lg" priority />
          </span>
        </Link>
        <div>
          <p className="text-2xl font-bold leading-tight md:text-3xl">
            India&apos;s specialised hiring network for the EV industry.
          </p>
          <p className="mt-3 text-sm text-white/75">
            Battery · Charging · Powertrain · Motors · Vehicle · Fleet
          </p>
        </div>
        <p className="text-xs text-white/50">© {new Date().getFullYear()} eMobility Careers</p>
      </aside>
      <section className="flex flex-col items-center justify-center bg-emce-light-bg px-4 py-8 sm:p-6 lg:p-12">
        {/* Phones see this version (the aside is hidden < lg). Logo sits
            on the light bg directly, no pill needed. */}
        <Link href="/" aria-label="Home" className="mb-6 lg:hidden">
          <Logo size="md" priority />
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}
