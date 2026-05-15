import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { InterviewChat, type InterviewTurnView } from "@/components/interviews/InterviewChat";
import { InterviewResultCard } from "@/components/interviews/InterviewResultCard";
import type { InterviewBreakdown, InterviewFeedbackItem } from "@/lib/ai/interview";

export const metadata: Metadata = {
  title: "EV Interview Simulator — eMobility Careers",
  robots: { index: false, follow: false },
};

export default async function SimulatorSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const [session, row] = await Promise.all([
    auth(),
    db.interviewSession.findUnique({ where: { id: sessionId } }),
  ]);
  if (!row) notFound();
  if (row.userId && row.userId !== session?.user?.id) {
    redirect("/ai-tools/interview-simulator");
  }
  if (row.kind !== "SIMULATOR") {
    redirect(`/ai-tools/mock-interview/${row.id}`);
  }

  const messages: InterviewTurnView[] = Array.isArray(row.messages)
    ? (row.messages as unknown as InterviewTurnView[]).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content ?? ""),
        ts: typeof m.ts === "string" ? m.ts : new Date().toISOString(),
      }))
    : [];

  const contextLabel = [
    row.targetCompany,
    row.targetRole,
    row.seniorityLevel.charAt(0) + row.seniorityLevel.slice(1).toLowerCase(),
    row.interviewerPersona ? `· "${row.interviewerPersona}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const isCompleted =
    row.status === "COMPLETED" && row.scoreOverall != null && row.scoreBreakdown != null;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-3xl py-6 md:py-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href="/ai-tools/interview-simulator"
              className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
            >
              ← New simulation
            </Link>
            {isCompleted && (
              <Button asChild size="sm">
                <Link href="/ai-tools/interview-simulator">Simulate again →</Link>
              </Button>
            )}
          </div>

          {isCompleted ? (
            <>
              <InterviewResultCard
                overall={row.scoreOverall!}
                breakdown={row.scoreBreakdown as unknown as InterviewBreakdown}
                feedback={(row.feedback as unknown as InterviewFeedbackItem[]) ?? []}
                summary={row.summary ?? ""}
              />
              <Card className="mt-4">
                <h3 className="text-section text-emce-text">Your transcript</h3>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Scenario: <strong>{contextLabel}</strong>
                </p>
                <ul className="mt-3 space-y-3">
                  {messages.map((m, i) => (
                    <li
                      key={i}
                      className={m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[85%]"}
                    >
                      <div
                        className={`whitespace-pre-line rounded-lg p-3 text-body ${
                          m.role === "user"
                            ? "bg-emce-dark text-emce-light"
                            : "bg-emce-light-soft text-emce-text"
                        }`}
                      >
                        {m.content}
                      </div>
                      <div className={`mt-1 text-hint text-emce-text-muted ${m.role === "user" ? "text-right" : ""}`}>
                        {m.role === "user" ? "You" : "Interviewer"}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <InterviewChat
              sessionId={row.id}
              initialMessages={messages}
              contextLabel={contextLabel}
              endHref={`/ai-tools/interview-simulator/${row.id}`}
              initialDone={false}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
