"use client";

import { useRef, useState } from "react";
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
 */
export function StartExamButton({ slug, resume }: { slug: string; resume: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onStart() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access a camera. Please use an updated Chrome, Edge, or Firefox on a device with a webcam.");
      return;
    }
    setChecking(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop()); // release; runner re-acquires
      formRef.current?.requestSubmit();
    } catch {
      setChecking(false);
      setError("We couldn't access your camera. This test requires a working webcam — allow camera access (check the 🔒/camera icon in your address bar) or switch to a device with a camera, then try again.");
    }
  }

  return (
    <div>
      <form ref={formRef} action={startRecruitathonExam} className="hidden">
        <input type="hidden" name="assessmentSlug" value={slug} />
      </form>
      <Button size="lg" disabled={checking} onClick={onStart}>
        {checking ? "Checking camera…" : resume ? "Resume test →" : "Start test →"}
      </Button>
      {error && (
        <div role="alert" className="mt-3 max-w-md rounded-md bg-emce-red-light p-3">
          <p className="text-sm font-semibold text-emce-red-deep">{error}</p>
          <ul className="mt-1.5 list-disc pl-5 text-hint text-emce-text-sec">
            <li>Click the 🔒 / camera icon in your browser&apos;s address bar and set Camera to <strong>Allow</strong>, then tap the button again.</li>
            <li>Close any other app using the camera (Zoom, Meet, etc.).</li>
            <li>Still stuck? Switch to a laptop/desktop with a working webcam.</li>
          </ul>
          <p className="mt-2 text-hint">
            <Link href="/recruitathon/tests" className="font-bold text-emce-dark hover:underline">← Back to your tests</Link>
          </p>
        </div>
      )}
    </div>
  );
}
