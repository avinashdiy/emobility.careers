import Link from "next/link";
import { StepIndicator } from "@/components/onboarding/StepIndicator";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-extrabold text-emce-text">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-emce-mid text-emce-darkest">
              eM
            </span>
            <span className="hidden sm:inline">eMobility Careers</span>
            <span className="sm:hidden">eMC</span>
          </Link>
          <Link href="/me" className="text-sm font-bold text-emce-text-sec hover:text-emce-dark">
            Skip for now →
          </Link>
        </div>
      </header>
      <main className="container max-w-2xl py-8 md:py-10">
        <StepIndicator />
        {children}
      </main>
    </div>
  );
}
