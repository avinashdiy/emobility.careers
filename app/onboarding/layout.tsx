import Link from "next/link";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { Logo } from "@/components/brand/Logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-emce-light-bg">
      <header className="border-b border-emce-border bg-white">
        <div className="container flex h-14 items-center justify-between gap-3">
          <Link href="/" aria-label="Home" className="flex items-center">
            <Logo size="md" priority />
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
