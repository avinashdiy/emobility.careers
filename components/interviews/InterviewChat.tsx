"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  sendInterviewResponse,
  endInterviewSession,
  type InterviewActionResult,
} from "@/server/interviews/practice-actions";

export interface InterviewTurnView {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

interface Props {
  sessionId: string;
  initialMessages: InterviewTurnView[];
  /** Hint shown above the transcript — e.g. "Practising for: Battery Engineer · Senior". */
  contextLabel: string;
  /** Where to send the user after they end the session. The result
      view is the same page — we just refresh on the server. */
  endHref: string;
  /** Initial "done" state — set when the server already saw the
      INTERVIEW_DONE marker on the most recent assistant turn. */
  initialDone: boolean;
}

/**
 * Client-side chat surface for the Mock Interview + Interview
 * Simulator tools. Manages local message state for instant UI
 * updates while the server action persists each turn and asks the
 * model for the next one.
 *
 * Two CTAs sit in the composer:
 *
 *   • "Send" — primary while the interview is still running.
 *   • "End interview & get feedback" — switches in when the AI
 *     signals `done: true` (it appended [INTERVIEW_DONE] to its
 *     last message, which the server stripped before sending us
 *     the turn). The user can also end the interview manually at
 *     any point.
 */
export function InterviewChat({
  sessionId,
  initialMessages,
  contextLabel,
  endHref,
  initialDone,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<InterviewTurnView[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState(initialDone);
  const [error, setError] = useState<string | null>(null);
  const [isSending, startSending] = useTransition();
  const [isEnding, startEnding] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    // RAF lets the new message DOM land first; otherwise scrollIntoView
    // measures against the pre-append height and lands one message short.
    requestAnimationFrame(() =>
      scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
  }

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.trim() || isSending || isEnding) return;
    const answer = draft.trim();
    // Optimistic append — user sees their own message immediately
    // even while the model thinks. If the action fails we surface
    // the error inline and leave the message in place (user can
    // retry).
    setDraft("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: answer, ts: new Date().toISOString() },
    ]);
    scrollToBottom();
    startSending(async () => {
      const r: InterviewActionResult = await sendInterviewResponse({
        sessionId,
        answer,
      });
      if (!r.ok) {
        setError(r.message ?? "Couldn't get the next question. Try again.");
        return;
      }
      if (r.assistant) {
        setMessages((prev) => [...prev, r.assistant!]);
        scrollToBottom();
      }
      if (r.done) setDone(true);
    });
  }

  function handleEnd() {
    if (isSending || isEnding) return;
    setError(null);
    startEnding(async () => {
      const r = await endInterviewSession({ sessionId });
      if (!r.ok) {
        setError(r.message ?? "Couldn't end the session.");
        return;
      }
      // The same page re-renders into result mode (server reads the
      // updated row's `status` + scores). router.refresh is enough —
      // no client-side state to preserve.
      router.refresh();
    });
  }

  return (
    <div className="flex h-[70dvh] min-h-[480px] flex-col rounded-lg border border-emce-border bg-white">
      <div className="border-b border-emce-border bg-emce-light-soft px-4 py-2 text-hint">
        <span className="font-bold text-emce-text">Practising:</span>{" "}
        <span className="text-emce-text-sec">{contextLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <ul className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.role === "user";
            return (
              <li key={i} className={mine ? "ml-auto max-w-[80%]" : "max-w-[85%]"}>
                <div
                  className={`whitespace-pre-line rounded-lg p-3 text-body ${
                    mine
                      ? "bg-emce-dark text-emce-light"
                      : "bg-emce-light-soft text-emce-text"
                  }`}
                >
                  {m.content}
                </div>
                <div
                  className={`mt-1 text-hint text-emce-text-muted ${mine ? "text-right" : ""}`}
                >
                  {mine ? "You" : "Interviewer"} · {new Date(m.ts).toLocaleTimeString()}
                </div>
              </li>
            );
          })}
          {isSending && (
            <li className="max-w-[85%]">
              <div className="rounded-lg bg-emce-light-soft p-3 text-body text-emce-text-muted">
                <span className="inline-flex items-center gap-1">
                  Thinking
                  <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emce-mid" />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emce-mid [animation-delay:120ms]" />
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emce-mid [animation-delay:240ms]" />
                </span>
              </div>
            </li>
          )}
        </ul>
        <div ref={scrollRef} />
      </div>

      {done && (
        <div className="border-t border-emce-border bg-emce-mid/10 px-4 py-2 text-hint text-emce-darkest">
          ✓ The interviewer thinks you&apos;ve covered enough ground.
          Click <strong>End interview</strong> to see your feedback summary,
          or keep going for more practice.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="border-t border-emce-red/40 bg-emce-red-light px-4 py-2 text-sm text-emce-red-deep"
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleSend}
        className="border-t border-emce-border p-3"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Type your answer… (Shift+Enter for a new line)"
          disabled={isSending || isEnding}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Enter sends. Plain Enter inserts a newline so
            // candidates can use whitespace to structure a STAR-format
            // answer without the message firing prematurely.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSend(e as unknown as React.FormEvent<HTMLFormElement>);
            }
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleEnd}
            disabled={isSending || isEnding}
            title="Stop and get your AI-scored feedback"
          >
            {isEnding ? "Wrapping up…" : "End interview & get feedback"}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-hint text-emce-text-muted">
              ⌘/Ctrl + Enter to send
            </span>
            <Button
              type="submit"
              disabled={!draft.trim() || isSending || isEnding}
            >
              {isSending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </form>

      {/* `endHref` is unused at this surface — kept on the props
          contract because the calling pages will eventually point at
          a dedicated /results URL for share-able transcripts. The
          current MVP renders results inline on the same route. */}
      <span className="hidden" data-end-href={endHref} />
    </div>
  );
}
