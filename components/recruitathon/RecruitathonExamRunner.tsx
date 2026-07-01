"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveExamProgress, recordProctorEvent, submitExam } from "@/server/recruitathon/exam-actions";
import { CameraProctor } from "@/components/recruitathon/CameraProctor";

/**
 * Hardened, proctored MCQ runner for the Recruitathon test.
 *
 * The server owns the clock + grading; this component is the "feels
 * security-tight" surface: forced fullscreen, focus-loss / paste /
 * copy / context-menu blocking, a visible warning counter, a
 * server-authoritative countdown, and per-answer autosave. Tab-switch /
 * full-screen-exit events auto-submit once the flag limit is crossed
 * (detect → warn → flag → cancel).
 *
 * Camera proctoring (CameraProctor) adds a live self-view + best-effort
 * face-presence detection: a sustained look-away or multiple faces
 * blinks a warning and is logged for review, but NEVER auto-submits
 * (in-browser face detection is too noisy to fairly end an attempt).
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
  // Suppresses focus/blur/fullscreen flags while our own confirm() dialog
  // is up, so clicking "Submit" can't record a spurious integrity flag.
  const proctorPausedRef = useRef(false);
  const warnBtnRef = useRef<HTMLButtonElement>(null);
  const endedRef = useRef<HTMLHeadingElement>(null);

  const hasQuestions = Array.isArray(questions) && questions.length > 0;
  const expired = remaining <= 0;
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
    if (!hasQuestions) return;
    // Already past the deadline on mount (e.g. resuming an expired
    // attempt) → submit immediately, don't show a live exam at 0:00.
    if (Math.max(0, deadlineMs - Date.now()) <= 0) {
      doSubmit("expired");
      return;
    }
    const t = setInterval(() => {
      const left = Math.max(0, deadlineMs - Date.now());
      setRemaining(left);
      if (left <= 0) {
        clearInterval(t);
        doSubmit("expired");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineMs, doSubmit, hasQuestions]);

  // ── Report an integrity event → warn → maybe terminate ────────────
  const flag = useCallback(
    async (type: "focus_loss" | "fullscreen_exit" | "paste_blocked" | "copy_blocked" | "devtools_suspected" | "reload", label: string) => {
      if (submittedRef.current || proctorPausedRef.current) return;
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
    if (!hasQuestions) return;
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
  }, [enterFullscreen, flag, hasQuestions]);

  // Move focus to the warning's "Return to test" action / the ended
  // heading when they appear, so keyboard + screen-reader users aren't
  // stranded and the alert is announced.
  useEffect(() => { if (warning) warnBtnRef.current?.focus(); }, [warning]);
  useEffect(() => { if (terminated) endedRef.current?.focus(); }, [terminated]);

  // ── Autosave (debounced) ──────────────────────────────────────────
  function pick(qi: number, oi: number) {
    if (submittedRef.current || expired) return;
    setAnswers((prev) => {
      const next = { ...prev, [qi]: oi };
      // fire-and-forget autosave with the latest map
      void saveExamProgress({ attemptId, answers: next }).catch(() => {});
      return next;
    });
  }

  function confirmSubmit() {
    // Guard proctoring while the browser confirm() is up (some browsers
    // fire a window blur), and re-enable shortly after it resolves.
    proctorPausedRef.current = true;
    const ok = window.confirm("Submit your test? You can't change answers after this.");
    setTimeout(() => { proctorPausedRef.current = false; }, 600);
    if (ok) doSubmit("manual");
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
          <h1 ref={endedRef} tabIndex={-1} className="mt-3 text-section text-emce-text outline-none">Test ended</h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            The test was automatically submitted after repeated integrity warnings. Taking you to your result…
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button asChild><Link href={`/recruitathon/exam/${attemptId}/result`}>Go to your result →</Link></Button>
            <Button asChild variant="outline"><Link href="/recruitathon/tests">Back to your tests</Link></Button>
          </div>
        </Card>
      </div>
    );
  }

  // Defense-in-depth: an assessment with an empty question bank should
  // never reach here (guarded upstream), but if it does, don't crash on
  // questions[current] — show a friendly not-ready state.
  if (!hasQuestions) {
    return (
      <div className="container max-w-lg py-20 text-center">
        <Card className="p-8">
          <p className="text-4xl">🧩</p>
          <h1 className="mt-3 text-section text-emce-text">This test isn&apos;t ready yet</h1>
          <p className="mt-2 text-sm text-emce-text-sec">Its question bank is still being prepared. Please head back and try again shortly.</p>
          <Button asChild className="mt-4"><Link href="/recruitathon/tests">← Back to your tests</Link></Button>
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
          <div role="alert" className="bg-emce-orange-light px-4 py-2 text-center text-sm font-semibold text-emce-orange-deep">
            {warning}
            <button ref={warnBtnRef} className="ml-3 rounded underline outline-none focus-visible:ring-2 focus-visible:ring-emce-dark" onClick={() => { setWarning(null); enterFullscreen(); }}>Return to test</button>
          </div>
        )}
      </div>

      <div className="container max-w-3xl py-6 pb-40">
        <Card className="p-6">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-mid-muted">
            Question {current + 1} of {questions.length}
          </p>
          <p id={`rq-${current}`} className="mt-2 text-lg font-bold text-emce-text">{q.q}</p>
          <div className="mt-4 grid gap-2" role="radiogroup" aria-labelledby={`rq-${current}`}>
            {q.options.map((opt, oi) => {
              const selected = answers[current] === oi;
              return (
                <button
                  key={oi}
                  type="button"
                  role="radio"
                  aria-checked={selected}
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
                className={`h-9 w-9 rounded text-xs font-bold sm:h-7 sm:w-7 ${
                  i === current ? "bg-emce-dark text-emce-light" : answers[i] !== undefined ? "bg-emce-mid text-emce-darkest" : "bg-emce-light-soft text-emce-text-sec"
                }`}
                aria-label={`Question ${i + 1}, ${answers[i] !== undefined ? "answered" : "not answered"}${i === current ? ", current" : ""}`}
                aria-current={i === current ? "true" : undefined}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={current === questions.length - 1} onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>Next →</Button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-hint text-emce-text-sec">{questions.length - answered} unanswered</p>
          <Button size="lg" disabled={submitting} onClick={confirmSubmit}>
            {submitting ? "Submitting…" : "Submit test"}
          </Button>
        </div>
      </div>

      {/* Live camera self-view + face-presence proctoring (warn + log only) */}
      <CameraProctor attemptId={attemptId} />

      {/* Hidden form → server submit (grading happens server-side) */}
      <form ref={formRef} action={submitExam} className="hidden">
        <input type="hidden" name="attemptId" value={attemptId} />
        <input type="hidden" name="answersJson" defaultValue="" />
        <input type="hidden" name="reason" defaultValue="manual" />
      </form>
    </div>
  );
}
