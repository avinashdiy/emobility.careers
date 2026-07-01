"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveExamProgress, recordProctorEvent, submitExam } from "@/server/recruitathon/exam-actions";

/**
 * Hardened, proctored MCQ runner for the Recruitathon test.
 *
 * The server owns the clock + grading; this component is the "feels
 * security-tight" surface: forced fullscreen, focus-loss / paste /
 * copy / context-menu blocking, a visible warning counter, a
 * server-authoritative countdown, and per-answer autosave. Every
 * integrity event is reported to the server, which auto-submits the
 * attempt once the flag limit is crossed (detect → warn → flag →
 * cancel — no webcam, no false-positive-prone gaze tracking).
 *
 * Questions arrive WITHOUT correct answers (the take page strips
 * correctIndex), so nothing on the client can reveal or self-grade.
 */

type PublicQuestion = { q: string; options: string[] };

export function RecruitathonExamRunner({
  attemptId,
  title,
  deadlineMs,
  questions,
  flagLimit,
  initialAnswers,
}: {
  attemptId: string;
  title: string;
  deadlineMs: number;
  questions: PublicQuestion[];
  flagLimit: number;
  initialAnswers: Record<number, number>;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, number>>(initialAnswers ?? {});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(() => Math.max(0, deadlineMs - Date.now()));
  const [flags, setFlags] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittedRef = useRef(false);

  const answered = Object.keys(answers).length;

  // ── Final submit (manual, deadline, or termination) ───────────────
  const doSubmit = useCallback((reason: string) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const form = formRef.current;
    if (!form) return;
    (form.elements.namedItem("answersJson") as HTMLInputElement).value = JSON.stringify(answersRef.current);
    (form.elements.namedItem("reason") as HTMLInputElement).value = reason;
    form.requestSubmit();
  }, []);

  // ── Server-authoritative countdown ────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, deadlineMs - Date.now());
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        doSubmit("expired");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineMs, doSubmit]);

  // ── Report an integrity event → warn → maybe terminate ────────────
  const flag = useCallback(
    async (type: "focus_loss" | "fullscreen_exit" | "paste_blocked" | "copy_blocked" | "devtools_suspected" | "reload", label: string) => {
      if (submittedRef.current) return;
      try {
        const res = await recordProctorEvent({ attemptId, type });
        if (res.flags) setFlags(res.flags);
        if (res.terminated) {
          setTerminated(true);
          submittedRef.current = true;
          setTimeout(() => router.push(`/recruitathon/exam/${attemptId}/result`), 1800);
          return;
        }
        const left = Math.max(0, flagLimit - res.flags);
        setWarning(`${label} This is recorded. ${left} warning${left === 1 ? "" : "s"} left before the test auto-submits.`);
      } catch {
        /* network blip — still show the warning locally */
        setWarning(label);
      }
    },
    [attemptId, flagLimit, router],
  );

  // ── Fullscreen + integrity listeners ──────────────────────────────
  const enterFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    enterFullscreen();

    const onVisibility = () => {
      if (document.hidden) flag("focus_loss", "⚠️ You left the test window.");
    };
    const onBlur = () => flag("focus_loss", "⚠️ The test window lost focus.");
    const onFsChange = () => {
      if (!document.fullscreenElement && !submittedRef.current) {
        flag("fullscreen_exit", "⚠️ You exited full-screen.");
      }
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); flag("copy_blocked", "⚠️ Copying is disabled during the test."); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); flag("paste_blocked", "⚠️ Pasting is disabled during the test."); };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Block devtools + view-source + save shortcuts.
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) || ((e.ctrlKey || e.metaKey) && ["u", "s", "p"].includes(k))) {
        e.preventDefault();
        flag("devtools_suspected", "⚠️ Developer tools are disabled during the test.");
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current) { e.preventDefault(); e.returnValue = ""; }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enterFullscreen, flag]);

  // ── Autosave (debounced) ──────────────────────────────────────────
  function pick(qi: number, oi: number) {
    if (submittedRef.current) return;
    setAnswers((prev) => {
      const next = { ...prev, [qi]: oi };
      // fire-and-forget autosave with the latest map
      void saveExamProgress({ attemptId, answers: next }).catch(() => {});
      return next;
    });
  }

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const low = remaining < 2 * 60_000;
  const q = questions[current];

  if (terminated) {
    return (
      <div className="container max-w-lg py-20 text-center">
        <Card className="p-8">
          <p className="text-4xl">🛑</p>
          <h1 className="mt-3 text-section text-emce-text">Test ended</h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            The test was automatically submitted after repeated integrity warnings. Taking you to your result…
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen select-none bg-emce-light-bg">
      {/* Sticky exam bar — timer + progress + integrity meter */}
      <div className="sticky top-0 z-20 border-b border-emce-border bg-white/95 backdrop-blur">
        <div className="container flex max-w-3xl items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-emce-text">{title}</p>
            <p className="text-hint text-emce-text-sec">Answered {answered}/{questions.length}</p>
          </div>
          <div className="flex items-center gap-3">
            {flags > 0 && (
              <span className="rounded-full bg-emce-orange-light px-2.5 py-0.5 text-xs font-bold text-emce-orange-deep">
                ⚠ {flags}/{flagLimit}
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-sm font-extrabold tabular-nums ${low ? "bg-emce-red-light text-emce-red-deep" : "bg-emce-light-soft text-emce-dark"}`}>
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          </div>
        </div>
        {warning && (
          <div className="bg-emce-orange-light px-4 py-2 text-center text-sm font-semibold text-emce-orange-deep">
            {warning}
            <button className="ml-3 underline" onClick={() => { setWarning(null); enterFullscreen(); }}>Return to test</button>
          </div>
        )}
      </div>

      <div className="container max-w-3xl py-6">
        <Card className="p-6">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Question {current + 1} of {questions.length}
          </p>
          <p className="mt-2 text-lg font-bold text-emce-text">{q.q}</p>
          <div className="mt-4 grid gap-2">
            {q.options.map((opt, oi) => {
              const selected = answers[current] === oi;
              return (
                <button
                  key={oi}
                  type="button"
                  onClick={() => pick(current, oi)}
                  className={`flex items-start gap-3 rounded-md border-2 p-3 text-left text-sm transition ${
                    selected ? "border-emce-dark bg-emce-light-soft" : "border-emce-border bg-white hover:border-emce-mid"
                  }`}
                >
                  <span className="font-bold text-emce-dark">{String.fromCharCode(65 + oi)}.</span>
                  <span className="text-emce-text">{opt}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Nav + palette */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setCurrent((c) => Math.max(0, c - 1))}>← Prev</Button>
          <div className="flex flex-wrap justify-center gap-1.5">
            {questions.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-7 w-7 rounded text-xs font-bold ${
                  i === current ? "bg-emce-dark text-emce-light" : answers[i] !== undefined ? "bg-emce-mid text-emce-darkest" : "bg-emce-light-soft text-emce-text-sec"
                }`}
                aria-label={`Question ${i + 1}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={current === questions.length - 1} onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>Next →</Button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-hint text-emce-text-sec">{questions.length - answered} unanswered</p>
          <Button size="lg" disabled={submitting} onClick={() => { if (confirm("Submit your test? You can't change answers after this.")) doSubmit("manual"); }}>
            {submitting ? "Submitting…" : "Submit test"}
          </Button>
        </div>
      </div>

      {/* Hidden form → server submit (grading happens server-side) */}
      <form ref={formRef} action={submitExam} className="hidden">
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="answersJson" defaultValue="" />
        <input type="hidden" name="reason" defaultValue="manual" />
      </form>
    </div>
  );
}
