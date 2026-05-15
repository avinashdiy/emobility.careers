import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";
import { startInterviewSession } from "@/server/interviews/practice-actions";

export const metadata: Metadata = {
  title: "Embedded Mock Interview — EV-industry AI practice",
  description:
    "Practice EV-industry interviews with an AI interviewer that adapts to your seniority and domain. Free, no signup required.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/mock-interview` },
};

/**
 * Landing page for the open-ended Mock Interview tool. Setup form is
 * the entire surface: pick role + seniority + optional EV domain →
 * submit → the server action creates a session, generates the
 * opening question, and redirects to /ai-tools/mock-interview/[id].
 *
 * No auth required for the setup; signed-in candidates get their
 * sessions saved to their account, anonymous visitors get a one-off
 * practice run.
 */

const SENIORITIES: { value: string; label: string }[] = [
  { value: "ENTRY", label: "Entry / fresher" },
  { value: "JUNIOR", label: "Junior (0-2 yrs)" },
  { value: "MID", label: "Mid (2-5 yrs)" },
  { value: "SENIOR", label: "Senior (5-10 yrs)" },
  { value: "LEAD", label: "Lead / Staff" },
  { value: "PRINCIPAL", label: "Principal / Director" },
];

export default async function MockInterviewLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const [session, evDomains] = await Promise.all([
    auth(),
    db.eVDomain.findMany({
      orderBy: { order: "asc" },
      select: { slug: true, name: true },
    }),
  ]);

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
              🎤 Embedded Mock Interview
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Practice an EV-industry interview against an AI interviewer that
              adapts difficulty to your answers. Get an instant scored breakdown
              + actionable feedback when you wrap up.
            </p>
          </div>
        </section>

        <div className="container max-w-3xl py-8 md:py-10">
          {sp.error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
            >
              {sp.error}
            </div>
          )}

          <Card className="p-6">
            <h2 className="text-section text-emce-text">Set up your interview</h2>
            <form action={startInterviewSession} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="kind" value="MOCK" />

              <div className="sm:col-span-2">
                <Label htmlFor="targetRole" required>
                  Target role
                </Label>
                <Input
                  id="targetRole"
                  name="targetRole"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="e.g. Battery Pack Engineer, BMS Firmware Lead, Motor Controls Specialist"
                />
              </div>

              <div>
                <Label htmlFor="seniorityLevel">Seniority</Label>
                <NativeSelect id="seniorityLevel" name="seniorityLevel" defaultValue="MID">
                  {SENIORITIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </NativeSelect>
              </div>

              <div>
                <Label htmlFor="evDomainSlug" optional>
                  EV domain focus
                </Label>
                <NativeSelect id="evDomainSlug" name="evDomainSlug" defaultValue="">
                  <option value="">— mix all EV domains —</option>
                  {evDomains.map((d) => (
                    <option key={d.slug} value={d.slug}>{d.name}</option>
                  ))}
                </NativeSelect>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-emce-border pt-4">
                <p className="text-hint text-emce-text-muted">
                  {session?.user
                    ? "✓ Signed in — this session will save to your account"
                    : "Anonymous practice — sessions aren't saved. Sign up to keep your history."}
                </p>
                <SubmitButton pendingLabel="Starting…" size="lg">
                  Start interview →
                </SubmitButton>
              </div>
            </form>
          </Card>

          <Card className="mt-4 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">How it works</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-emce-text">
              <li>Pick a target role + seniority. We adapt the question depth.</li>
              <li>The AI asks ~7 questions — technical + behavioural, one at a time.</li>
              <li>Answer in your own words. Take your time; the AI doesn&apos;t penalise length.</li>
              <li>End the interview to get a scored breakdown + 3-5 actionable feedback items.</li>
            </ol>
            <p className="mt-3 text-hint text-emce-text-sec">
              Want to practise against a specific company?{" "}
              <Link href="/ai-tools/interview-simulator" className="font-bold text-emce-dark underline">
                Try the EV Interview Simulator →
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
