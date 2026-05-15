import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { EmployerShell } from "@/components/layout/employer-shell";
import { CALLING_LANGUAGE_NAMES } from "@/lib/calling/provider";

export const metadata = { title: "Vernacular calling sessions" };

/**
 * #16 — Recruiter list of calling sessions across all the company's
 * jobs. Each row shows status, candidate, language, fit score (if
 * scored), and a link into the candidate's application card. Click
 * through reveals the full transcript + structured per-question
 * answers.
 */
export default async function CallingSessionsPage() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const sessions = await db.callingSession.findMany({
    where: { job: { companyId: employer.companyId } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      candidate: { select: { firstName: true, lastName: true, slug: true } },
      job: { select: { id: true, title: true } },
    },
  });

  return (
    <EmployerShell>
      <div className="container max-w-5xl space-y-6 py-10">
        <PageHeader
          eyebrow="Recruiter superpowers"
          title="Vernacular calling agent"
          accent="calling"
          subtitle="AI-powered phone screens in 10 Indian languages. Hands-off candidate screening for high-volume blue-collar EV roles."
        />

        <Card>
          <h2 className="text-section text-emce-text">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-body text-emce-text-sec">
            <li>
              From any application card, click <strong>Call this candidate</strong>.
              Pick the language (Hindi / Tamil / Telugu / Kannada / Marathi /
              Gujarati / Bengali / Punjabi / Malayalam / English).
            </li>
            <li>
              The assistant calls the candidate, asks a 5-question structured
              screen (auto-derived from the job description, customisable),
              and records their answers.
            </li>
            <li>
              Once the call ends, Whisper transcribes + translates the
              transcript, GPT-4o scores fit 0-100 with strengths + concerns.
              Result lands on the ATS card.
            </li>
          </ol>
          <p className="mt-3 text-hint text-emce-text-muted">
            Provider: Exotel (primary) · Twilio (alternative). Set{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5">EXOTEL_SID</code>{" "}
            +{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5">EXOTEL_TOKEN</code>{" "}
            +{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5">EXOTEL_CALLER_ID</code>{" "}
            +{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5">EXOTEL_WEBHOOK_BASE</code>{" "}
            in the env to activate.
          </p>
        </Card>

        <div>
          <h2 className="text-section text-emce-text">Recent calls</h2>
          {sessions.length === 0 ? (
            <EmptyState
              variant="mesh"
              icon="📞"
              title="No calling sessions yet"
              body="Trigger your first call from an application card. The status timeline + transcript will land here."
              className="mt-3"
            />
          ) : (
            <ul className="emce-stagger mt-3 space-y-3">
              {sessions.map((s) => (
                <li key={s.id}>
                  <CallingRow session={s} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </EmployerShell>
  );
}

function CallingRow({
  session,
}: {
  session: {
    id: string;
    status: string;
    language: string;
    fitScore: number | null;
    summary: string | null;
    createdAt: Date;
    applicationId: string | null;
    candidate: { firstName: string; lastName: string | null; slug: string } | null;
    job: { id: string; title: string } | null;
  };
}) {
  const fullName = session.candidate
    ? `${session.candidate.firstName} ${session.candidate.lastName ?? ""}`.trim()
    : "(unknown)";
  return (
    <Card variant="interactive">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <Badge
              variant={
                session.status === "COMPLETED" ? "success"
                : session.status === "FAILED" ? "danger"
                : session.status === "IN_PROGRESS" ? "live"
                : "default"
              }
            >
              {session.status}
            </Badge>
            <Badge variant="default" size="sm">
              {CALLING_LANGUAGE_NAMES[session.language] ?? session.language}
            </Badge>
            {session.fitScore !== null && (
              <Badge variant={session.fitScore >= 70 ? "verified" : "outline"}>
                Fit {session.fitScore}/100
              </Badge>
            )}
          </div>
          <p className="mt-1 font-bold text-emce-text">
            {session.candidate ? (
              <Link
                href={`/${session.candidate.slug}`}
                className="hover:underline"
              >
                {fullName}
              </Link>
            ) : (
              fullName
            )}
            {session.job && (
              <>
                {" · "}
                <Link
                  href={`/employer/jobs/${session.job.id}`}
                  className="font-bold text-emce-dark hover:underline"
                >
                  {session.job.title}
                </Link>
              </>
            )}
          </p>
          {session.summary && (
            <p className="mt-1 text-hint text-emce-text-sec">{session.summary}</p>
          )}
          <p className="mt-1 text-hint text-emce-text-muted">
            {new Date(session.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        {session.applicationId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/employer/applications/${session.applicationId}`}>
              Open candidate
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
