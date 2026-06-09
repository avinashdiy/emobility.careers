"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markInterviewReady } from "@/server/recruitment-drives/registrations";

/**
 * Camera + microphone self-test harness for ONLINE candidates ahead
 * of their fair-day interview. Lives at /me/fairs/[slug]/test-call.
 *
 * Flow:
 *   1. Page loads → component is idle. Big "Start test" button.
 *   2. User clicks → getUserMedia({ video, audio }) prompts browser.
 *   3. On allow → render <video> with the camera feed + show a live
 *      mic-level meter (AudioContext / AnalyserNode). User confirms
 *      both feel right (sees their face, sees the meter moving when
 *      they talk).
 *   4. User clicks "I'm ready" → server action stamps
 *      `interviewReadyAt` → recruiter board gets a green dot.
 *   5. Tracks released on unmount (no zombie camera light).
 *
 * Failure paths handled inline (denied / no device / NotReadable
 * because another app is using the camera). Each surfaces a clear
 * inline message rather than throwing — the candidate then knows
 * to fix it instead of staring at a frozen video tile.
 *
 * Deliberately NO recording — we're not capturing the candidate's
 * audio/video, only providing a passive harness. Privacy posture
 * matches LinkedIn's "test your audio" flow.
 */

type State =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "live"; stream: MediaStream }
  | { kind: "error"; message: string };

export function CameraMicTest({
  driveSlug,
  alreadyReady,
}: {
  driveSlug: string;
  alreadyReady: boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [micLevel, setMicLevel] = useState(0);
  const [marked, setMarked] = useState(alreadyReady);
  const [marking, startMarking] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Clean up camera + mic on unmount. Without this the camera LED
  // stays on after the user navigates away — bad-trust signal.
  useEffect(() => {
    return () => {
      if (state.kind === "live") {
        for (const track of state.stream.getTracks()) track.stop();
      }
      if (audioCtxRef.current) {
        void audioCtxRef.current.close().catch(() => undefined);
      }
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // We deliberately only re-bind cleanup when the stream identity
    // changes, not on every render. Pinning to `state` would tear
    // down + re-create the stream on a re-render which defeats the
    // purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind]);

  async function start() {
    setState({ kind: "requesting" });
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({
        kind: "error",
        message: "Your browser doesn't support camera access. Try a recent Chrome / Firefox / Safari.",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      setState({ kind: "live", stream });
      // Attach to <video> and start the mic-meter loop.
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      // AudioContext + AnalyserNode mic-meter — same shape every
      // browser supports. RMS over the time-domain buffer is good
      // enough for a "is the mic picking up sound?" indicator.
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Scale to 0–100 for the visual meter. 1.0 RMS is silly-loud;
        // typical voice tops out around 0.2 so we boost x300 to make
        // the meter feel responsive at conversational volume.
        setMicLevel(Math.min(100, Math.round(rms * 300)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      let message = "Something went wrong opening the camera.";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          message = "You blocked camera / mic access. Click the camera icon in your address bar to allow it, then try again.";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          message = "No camera or microphone found. Plug one in, then refresh and try again.";
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          message = "Another app (Zoom / Meet / Teams) is using the camera. Close it, then try again.";
        }
      }
      setState({ kind: "error", message });
    }
  }

  function stop() {
    if (state.kind === "live") {
      for (const track of state.stream.getTracks()) track.stop();
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setMicLevel(0);
    setState({ kind: "idle" });
  }

  function confirmReady() {
    setMarkError(null);
    startMarking(async () => {
      const res = await markInterviewReady(driveSlug);
      if (res.ok) {
        setMarked(true);
      } else {
        setMarkError("Couldn't save — try once more in a moment.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {state.kind === "idle" && (
        <div className="rounded-lg border-2 border-dashed border-emce-border bg-emce-light-soft/40 p-8 text-center">
          <p className="text-4xl" aria-hidden>📹</p>
          <p className="mt-3 text-section text-emce-text">Test your camera + mic</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            Your browser will ask permission. We don&apos;t record
            anything — this is just so you can confirm your setup
            before your interview.
          </p>
          <Button onClick={start} className="mt-4">
            Start test →
          </Button>
        </div>
      )}

      {state.kind === "requesting" && (
        <div className="rounded-lg border border-emce-border bg-emce-light-soft/40 p-8 text-center text-hint text-emce-text-sec">
          Asking your browser for camera + mic access…
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-lg border border-emce-red bg-emce-red-light p-4">
          <p className="text-sm font-bold text-emce-red-deep">⚠ {state.message}</p>
          <Button onClick={start} variant="outline" size="sm" className="mt-3">
            Try again
          </Button>
        </div>
      )}

      {state.kind === "live" && (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-emce-border bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="aspect-video w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between text-hint">
              <span className="font-bold text-emce-text">Mic level</span>
              <span className="text-emce-text-muted tabular-nums">{micLevel}/100</span>
            </div>
            <div
              className="mt-1 h-3 overflow-hidden rounded-full bg-emce-light-soft"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={micLevel}
              aria-label="Microphone level"
            >
              <div
                className="h-full bg-emce-mid transition-[width] duration-75 ease-out"
                style={{ width: `${micLevel}%` }}
              />
            </div>
            <p className="mt-2 text-hint text-emce-text-sec">
              Talk briefly. If the bar moves, your mic works. If it
              doesn&apos;t, check your input device in OS settings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={confirmReady} disabled={marking || marked}>
              {marked ? "✓ Marked ready" : marking ? "Saving…" : "I'm ready →"}
            </Button>
            <Button onClick={stop} variant="outline">
              Stop test
            </Button>
            {markError && (
              <p className="text-hint text-emce-red-deep" role="alert">
                {markError}
              </p>
            )}
          </div>
          {marked && (
            <div className="rounded-md border border-emce-mid/40 bg-emce-light-soft/40 p-3">
              <p className="text-sm font-bold text-emce-text">
                ✓ Your fair pass now shows &quot;Setup tested&quot;
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                The recruiter at your booked booth will see a green dot
                next to your name on their slot board, so they know
                your setup is good.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
