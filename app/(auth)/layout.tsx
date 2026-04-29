import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="emce-hero-gradient hidden flex-col justify-between p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-emce-mid font-extrabold text-emce-darkest">
            eM
          </span>
          <span className="text-lg font-extrabold">
            eMobility<span className="text-emce-mid">.careers</span>
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
        <Link href="/" className="mb-6 flex items-center gap-2 text-emce-text lg:hidden">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-emce-mid font-extrabold text-emce-darkest">eM</span>
          <span className="text-base font-extrabold">eMobility<span className="text-emce-mid">.careers</span></span>
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}
