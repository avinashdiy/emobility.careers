import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CareerExplorerForm } from "@/components/career-explorer/CareerExplorerForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV Career Explorer — find your next move in electric mobility",
  description:
    "AI-powered exploration of adjacent EV careers. Tell us your current role + skills and we'll map 6-8 transitions with skill gaps, prep links, and salary bands.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/career-explorer` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL}/career-explorer`,
    title: "EV Career Explorer · emobility.careers",
    description:
      "AI maps your next move in the EV industry — adjacent roles, skill gaps, and what to learn next.",
  },
};

/**
 * #14 EV Career Explorer — public, no-auth tool. Mirrors the shape of
 * the existing /roast and /ai-tools landing pages: hero with
 * animated mesh + a form-driven interactive panel. Results render
 * inline (no separate route) so the share-link `?r=<cacheKey>` flow
 * lands users straight on a populated page.
 */
export default async function CareerExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const sp = await searchParams;
  // Pre-load cached result if `?r=<cacheKey>` is present. Lets a
  // tweet/LinkedIn-share link land users on a fully-rendered page
  // without needing a separate /r/[cacheKey] route.
  let initialResult = null;
  if (sp.r) {
    const { getCachedExploration } = await import("@/server/career-explorer/actions");
    initialResult = await getCachedExploration(sp.r);
  }

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-mesh-hero relative text-white">
          <span
            aria-hidden
            className="pointer-events-none absolute -left-10 top-10 hidden h-56 w-56 rounded-full bg-emce-mid/30 blur-3xl animate-float md:block"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 bottom-4 hidden h-64 w-64 rounded-full bg-emce-light/20 blur-3xl animate-float md:block"
            style={{ animationDelay: "1.6s" }}
          />
          <div
            aria-hidden
            className="emce-dot-grid pointer-events-none absolute inset-0 opacity-25"
          />
          <div className="container relative max-w-3xl py-14 md:py-20">
            <div className="emce-pill mb-4 animate-fade-up">
              <span aria-hidden>🧭</span>
              <span>Free · AI-powered · India EV market</span>
            </div>
            <h1
              className="animate-fade-up text-3xl font-extrabold leading-tight tracking-tight md:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              What&apos;s your next move in{" "}
              <span className="emce-text-gradient">electric mobility?</span>
            </h1>
            <p
              className="animate-fade-up mt-4 max-w-xl text-white/85 md:text-lg"
              style={{ animationDelay: "160ms" }}
            >
              Tell us where you are today — your role and your skills — and we&apos;ll
              map 6-8 adjacent EV careers with the exact skill gap to bridge each,
              prep links you can start on tomorrow, and salary bands in India.
            </p>
          </div>
        </section>

        <div className="container max-w-4xl space-y-6 py-10">
          <CareerExplorerForm initialResult={initialResult} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
