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
  title: "Mock Interview — eMobility Careers",
  // Per-session pages aren't worth indexing — content is candidate-
  // specific and ephemeral.
  robots: { index: false, follow: false },
};

/**
 * Combined chat-or-result page for a single mock-interview session.
 * Two modes:
 *   • ACTIVE: render <InterviewChat> with the running transcript.
 *   • COMPLETED: render the score card + read-only transcript.
 *
 * Access control: anonymous sessions (userId = null) are reachable
 * by anyone with the link — they're practice-only and the URL is
 * cuid-random; signed-in sessions are scoped to their owner.
 */
export default async function MockInterviewSessionPage({
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
    redirect("/ai-tools/mock-interview");
  }
  if (row.kind !== "MOCK") {
    // Wrong tool — redirect to the right one so a shared link keeps
    // working even if the user pasted /mock-interview/<simulator-id>.
    redirect(`/ai-tools/interview-simulator/${row.id}`);
  }

  // Normalise the JSON message blob → typed view shape.
  const messages: InterviewTurnView[] = Array.isArray(row.messages)
    ? (row.messages as unknown as InterviewTurnView[]).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content ?? ""),
        ts: typeof m.ts === "string" ? m.ts : new Date().toISOString(),
      }))
    : [];

  const contextLabel = [
    row.targetRole,
    row.seniorityLevel.charAt(0) + row.seniorityLevel.slice(1).toLowerCase(),
    row.evDomainSlug ? `· ${row.evDomainSlug.replace(/-/g, " ")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ACTIVE → show the chat. COMPLETED → show the result card and
  // a read-only transcript below.
  const isCompleted =
    row.status === "COMPLETED" && row.scoreOverall != null && row.scoreBreakdown != null;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-3xl py-6 md:py-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link
              href="/ai-tools/mock-interview"
              className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
            >
              ← New mock interview
            </Link>
            {isCompleted && (
              <Button asChild size="sm">
                <Link href="/ai-tools/mock-interview">Practise again →</Link>
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
                  Practising: <strong>{contextLabel}</strong>
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
              endHref={`/ai-tools/mock-interview/${row.id}`}
              initialDone={false}
            />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
