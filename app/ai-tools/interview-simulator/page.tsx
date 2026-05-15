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
  title: "EV Interview Simulator — role-play against real EV companies",
  description:
    "Practice an EV-industry interview with an AI that role-plays as an interviewer at the company you're targeting. Ola, Tata, Ather, Bosch, and any other employer.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools/interview-simulator` },
};

const SENIORITIES: { value: string; label: string }[] = [
  { value: "ENTRY", label: "Entry / fresher" },
  { value: "JUNIOR", label: "Junior (0-2 yrs)" },
  { value: "MID", label: "Mid (2-5 yrs)" },
  { value: "SENIOR", label: "Senior (5-10 yrs)" },
  { value: "LEAD", label: "Lead / Staff" },
  { value: "PRINCIPAL", label: "Principal / Director" },
];

const PERSONAS: { value: string; label: string }[] = [
  { value: "tough technical lead", label: "Tough technical lead — deep dives, expects precise answers" },
  { value: "warm engineering manager", label: "Warm engineering manager — friendly, behaviour-heavy" },
  { value: "skeptical hiring director", label: "Skeptical hiring director — challenges your claims" },
  { value: "founder-style generalist", label: "Founder / generalist — broad questions, fast pace" },
  { value: "HR business partner", label: "HR business partner — fit + motivation focused" },
];

export default async function SimulatorLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; company?: string }>;
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
              🏭 EV Interview Simulator
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Pick the company you&apos;re targeting and an interviewer style.
              The AI plays the role — asks the kind of questions that company
              actually asks, in the tone you&apos;d hear in the room.
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
            <h2 className="text-section text-emce-text">Set up the scenario</h2>
            <form action={startInterviewSession} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input type="hidden" name="kind" value="SIMULATOR" />

              <div>
                <Label htmlFor="targetCompany" required>
                  Target company
                </Label>
                <Input
                  id="targetCompany"
                  name="targetCompany"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={sp.company ?? ""}
                  placeholder="e.g. Ola Electric, Tata Motors, Ather Energy, Bosch"
                />
              </div>

              <div>
                <Label htmlFor="targetRole" required>
                  Target role
                </Label>
                <Input
                  id="targetRole"
                  name="targetRole"
                  required
                  minLength={2}
                  maxLength={120}
                  placeholder="e.g. Battery Pack Engineer, BMS Lead, Motor Controls"
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

              <div className="sm:col-span-2">
                <Label htmlFor="interviewerPersona">Interviewer style</Label>
                <NativeSelect
                  id="interviewerPersona"
                  name="interviewerPersona"
                  defaultValue="tough technical lead"
                >
                  {PERSONAS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </NativeSelect>
                <p className="mt-1 text-hint text-emce-text-muted">
                  Shifts the tone + question mix. You&apos;ll feel the difference
                  immediately.
                </p>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t border-emce-border pt-4">
                <p className="text-hint text-emce-text-muted">
                  {session?.user
                    ? "✓ Signed in — this session will save to your account"
                    : "Anonymous practice — sessions aren't saved. Sign up to keep your history."}
                </p>
                <SubmitButton pendingLabel="Starting…" size="lg">
                  Start simulation →
                </SubmitButton>
              </div>
            </form>
          </Card>

          <Card className="mt-4 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">When to use which tool</h3>
            <ul className="mt-2 space-y-1 text-sm text-emce-text">
              <li><strong>This (Simulator):</strong> You&apos;ve got a specific company interview lined up — match their style.</li>
              <li>
                <strong>
                  <Link href="/ai-tools/mock-interview" className="text-emce-dark underline">
                    Mock Interview
                  </Link>
                  :
                </strong>{" "}
                You want open-ended practice across the EV-industry hiring bar.
              </li>
            </ul>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
