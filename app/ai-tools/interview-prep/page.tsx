import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { InterviewPrepForm } from "@/components/ai-tools/InterviewPrepForm";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Interview Prep — AI-curated study plan for EV roles",
  description:
    "Get a tight, role-specific study plan for your next EV-industry interview. 5-7 topic cards with sample questions, answer outlines, and where to deepen knowledge.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/interview-prep` },
};

export default async function InterviewPrepPage() {
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { slug: true, name: true },
  });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-3xl py-12 md:py-16">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              AI Tool · Free · No signup needed
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              📚 Interview Prep
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              The reading that comes before the rehearsal. Tell us the role,
              company, and how many days you have — we&apos;ll generate a
              prioritised study plan with the exact topics, sample questions,
              and resources to study.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          <InterviewPrepForm evDomains={evDomains} />

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">Use this with the other tools</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-emce-text">
              <li>
                <strong>Now:</strong> generate this study plan to know WHAT to revise.
              </li>
              <li>
                <strong>Then:</strong>{" "}
                <Link href="/ai-tools/mock-interview" className="font-bold text-emce-dark underline">
                  Mock Interview
                </Link>{" "}
                to rehearse the answers out loud (in writing) against an AI.
              </li>
              <li>
                <strong>The night before:</strong>{" "}
                <Link href="/ai-tools/interview-simulator" className="font-bold text-emce-dark underline">
                  Interview Simulator
                </Link>{" "}
                to role-play against the company you&apos;re actually interviewing with.
              </li>
            </ol>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
