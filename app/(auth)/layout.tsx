import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Animated mesh-gradient aside — replaces the static
          emce-hero-gradient. The drifting mesh + floating orbs +
          dot-grid layer turn this from "marketing chrome" into a
          surface that feels alive while staying unobtrusive behind
          the copy. Hidden on phones (< lg) so the auth form gets the
          full viewport. */}
      <aside className="emce-mesh-hero relative hidden flex-col justify-between p-10 text-white lg:flex">
        <span
          aria-hidden
          className="pointer-events-none absolute -left-10 top-1/3 h-56 w-56 rounded-full bg-emce-mid/30 blur-3xl animate-float"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-8 bottom-1/4 h-64 w-64 rounded-full bg-emce-light/25 blur-3xl animate-float"
          style={{ animationDelay: "1.8s" }}
        />
        <div
          aria-hidden
          className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
        />

        {/* Logo wordmark sits inside a white pill — the dark teal type
            inside the PNG would otherwise blend with the hero gradient. */}
        <Link href="/" aria-label="Home" className="relative inline-flex animate-fade-up">
          <span className="rounded-md bg-white px-3 py-1.5">
            <Logo size="lg" priority />
          </span>
        </Link>
        <div className="relative">
          <p
            className="animate-fade-up text-2xl font-bold leading-tight md:text-3xl"
            style={{ animationDelay: "100ms" }}
          >
            India&apos;s specialised hiring network for the{" "}
            <span className="emce-text-gradient">EV industry.</span>
          </p>
          <p
            className="animate-fade-up mt-3 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            Battery · Charging · Powertrain · Motors · Vehicle · Fleet
          </p>
        </div>
        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} eMobility Careers
        </p>
      </aside>
      <section className="flex flex-col items-center justify-center bg-emce-light-bg px-4 py-8 sm:p-6 lg:p-12">
        {/* Phones see this version (the aside is hidden < lg). Logo sits
            on the light bg directly, no pill needed. */}
        <Link href="/" aria-label="Home" className="mb-6 lg:hidden">
          <Logo size="md" priority />
        </Link>
        <div className="w-full max-w-md animate-fade-up">{children}</div>
      </section>
    </div>
  );
}
