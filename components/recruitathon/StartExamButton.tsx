"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { startRecruitathonExam } from "@/server/recruitathon/exam-actions";

/**
 * Start (or resume) the proctored test — but first confirm the webcam is
 * available and permitted, since the test requires camera proctoring.
 * Gating here (before the attempt is created) means a camera-less student
 * never starts a doomed attempt with the clock already running.
 * Nothing is recorded — we request the stream only to verify access,
 * then release it; the exam runner re-acquires it for the live self-view.
 *
 * Recovery matters: once a browser permission is DENIED it will not
 * re-prompt, so a student who tapped "Block" once is stuck unless we tell
 * them exactly how to turn it back on (steps differ per device) and give
 * them a working "check again" retry.
 */
type CamError = null | "denied" | "notfound" | "unsupported";

export function StartExamButton({ slug, resume }: { slug: string; resume: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<CamError>(null);

  async function onStart() {
    setErr(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErr("unsupported");
      return;
    }
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop()); // release; runner re-acquires
      formRef.current?.requestSubmit();
    } catch (e) {
      setChecking(false);
      const name = (e as { name?: string })?.name ?? "";
      // NotFound/NotReadable/Overconstrained = no usable camera (or it's in
      // use by another app). Anything else (typically NotAllowedError) means
      // permission is blocked — the recoverable, most common case.
      setErr(name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError" ? "notfound" : "denied");
    }
  }

  return (
    <div>
      <form ref={formRef} action={startRecruitathonExam} className="hidden">
        <input type="hidden" name="assessmentSlug" value={slug} />
      </form>
      <Button size="lg" disabled={checking} onClick={onStart}>
        {checking ? "Checking camera…" : err ? "Check camera again" : resume ? "Resume test →" : "Start test →"}
      </Button>

      {err === "unsupported" && (
        <ErrorBox title="This browser can’t access a camera">
          <li>Open the test in an updated <strong>Chrome, Edge, or Firefox</strong> on a device with a webcam.</li>
          <li>On iPhone use <strong>Safari</strong>; on Android use <strong>Chrome</strong>.</li>
        </ErrorBox>
      )}

      {err === "notfound" && (
        <ErrorBox title="No working camera was found">
          <li>Close any other app using the camera (Zoom, Meet, WhatsApp, the Camera app), then tap <strong>Check camera again</strong>.</li>
          <li>If this device has no camera, switch to a laptop or phone that does.</li>
        </ErrorBox>
      )}

      {err === "denied" && (
        <ErrorBox title="Camera is blocked — here’s how to turn it back on">
          <p className="mb-1 mt-1 text-hint font-bold text-emce-text">💻 Computer (Chrome / Edge):</p>
          <li>Click the <strong>camera</strong> or <strong>🔒</strong> icon on the left of the address bar → set <strong>Camera</strong> to <strong>Allow</strong>.</li>
          <li>Then tap <strong>Check camera again</strong> below (no need to reload).</li>
          <p className="mb-1 mt-2 text-hint font-bold text-emce-text">📱 Android (Chrome):</p>
          <li>Tap <strong>⋮</strong> (top-right) → <strong>Site settings</strong> → <strong>Camera</strong> → <strong>Allow</strong>, then reload the page.</li>
          <p className="mb-1 mt-2 text-hint font-bold text-emce-text">📱 iPhone (Safari):</p>
          <li>Tap <strong>aA</strong> in the address bar → <strong>Website Settings</strong> → <strong>Camera</strong> → <strong>Allow</strong>, then reload.</li>
        </ErrorBox>
      )}
    </div>
  );
}

function ErrorBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="alert" className="mt-3 max-w-md rounded-md bg-emce-red-light p-3">
      <p className="text-sm font-semibold text-emce-red-deep">{title}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-hint text-emce-text-sec">{children}</ul>
      <p className="mt-2 text-hint">
        <Link href="/recruitathon/tests" className="font-bold text-emce-dark hover:underline">← Back to your tests</Link>
      </p>
    </div>
  );
}
