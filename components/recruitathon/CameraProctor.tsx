"use client";

import { useEffect, useRef, useState } from "react";
import { recordCameraEvent } from "@/server/recruitathon/exam-actions";

/**
 * Camera proctoring widget for the Recruitathon test.
 *
 * Client-side only — NOTHING is recorded or uploaded. A live self-view
 * (a deterrent + reassurance that the camera is on) plus best-effort
 * in-browser face detection (MediaPipe, loaded at runtime from CDN).
 *
 * Behaviour (per the agreed design):
 *  - A SUSTAINED look-away (no forward-facing face for ~AWAY_MS) or
 *    MULTIPLE faces blinks a red warning and logs ONE camera event per
 *    episode via recordCameraEvent.
 *  - Camera events NEVER auto-submit — face detection is too noisy to
 *    fairly end a real candidate's test. Only tab-switch / full-screen
 *    exits (handled in the runner) terminate.
 *  - If the model can't load, we degrade gracefully to camera-on +
 *    self-view (still a strong deterrent) with no false warnings.
 */

const AWAY_MS = 6500; // sustained bad-state duration before a warning fires
const DETECT_EVERY_MS = 180; // throttle detection to ~5-6 fps
const MP_VERSION = "0.10.14";
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type Status = "init" | "ok" | "away" | "multi" | "nocam";

interface FaceDetectorLike {
  detectForVideo(video: HTMLVideoElement, timestamp: number): { detections?: unknown[] };
  close?(): void;
}
interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  FaceDetector: { createFromOptions(files: unknown, opts: unknown): Promise<FaceDetectorLike> };
}

export function CameraProctor({ attemptId }: { attemptId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("init");
  const [flags, setFlags] = useState(0);
  const ep = useRef({ badSince: 0, kind: "", open: false });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let detector: FaceDetectorLike | null = null;
    let raf = 0;
    let lastDetect = 0;
    let stopped = false;

    const logEvent = (type: "camera_away" | "camera_multiface" | "camera_off") => {
      recordCameraEvent({ attemptId, type })
        .then((r) => { if (r?.cameraFlags) setFlags(r.cameraFlags); })
        .catch(() => {});
    };

    const evaluate = (faces: number) => {
      const s = ep.current;
      const now = performance.now();
      const bad = faces === 0 ? "away" : faces > 1 ? "multi" : "";
      if (!bad) {
        if (s.open || s.badSince) { s.open = false; s.badSince = 0; s.kind = ""; }
        setStatus("ok");
        return;
      }
      if (!s.badSince || s.kind !== bad) { s.badSince = now; s.kind = bad; s.open = false; }
      if (now - s.badSince >= AWAY_MS) {
        setStatus(bad === "multi" ? "multi" : "away");
        if (!s.open) { s.open = true; logEvent(bad === "multi" ? "camera_multiface" : "camera_away"); }
      }
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
          audio: false,
        });
        if (stopped) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("ok");
      } catch {
        setStatus("nocam");
        logEvent("camera_off"); // camera lost/denied mid-test → log for review
        return;
      }

      try {
        // Runtime import from CDN — webpackIgnore keeps the bundler from
        // trying to resolve it; the string variable keeps TS from module
        // resolution too. Failure degrades gracefully (self-view only).
        const vision = (await import(/* webpackIgnore: true */ MP_BUNDLE)) as VisionModule;
        const files = await vision.FilesetResolver.forVisionTasks(MP_WASM);
        detector = await vision.FaceDetector.createFromOptions(files, {
          // CPU delegate: slower than GPU but runs without WebGL2, so it
          // works across the widest range of student devices. BlazeFace
          // short-range at ~5fps is light enough for CPU.
          baseOptions: { modelAssetPath: MP_MODEL, delegate: "CPU" },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
      } catch {
        detector = null;
      }

      const loop = () => {
        if (stopped) return;
        const now = performance.now();
        const v = videoRef.current;
        if (detector && v && v.readyState >= 2 && now - lastDetect >= DETECT_EVERY_MS) {
          lastDetect = now;
          try {
            const res = detector.detectForVideo(v, now);
            evaluate(res?.detections?.length ?? 0);
          } catch {
            /* transient frame error — ignore */
          }
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try { detector?.close?.(); } catch { /* noop */ }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [attemptId]);

  const bad = status === "away" || status === "multi" || status === "nocam";
  const label =
    status === "nocam" ? "Camera off — please re-enable"
    : status === "away" ? "Face not detected — look at the screen"
    : status === "multi" ? "Multiple faces detected"
    : status === "ok" ? "Camera on"
    : "Starting camera…";

  return (
    <div className="fixed bottom-4 right-4 z-40 select-none">
      <div className={`overflow-hidden rounded-lg border-2 shadow-lg ${bad ? "animate-pulse border-emce-red" : status === "ok" ? "border-emce-success-deep" : "border-emce-border"}`}>
        <video ref={videoRef} muted playsInline autoPlay className="block h-24 w-32 -scale-x-100 bg-black object-cover" />
        <p className={`px-2 py-1 text-center text-[11px] font-bold ${bad ? "bg-emce-red text-white" : status === "ok" ? "bg-emce-success-deep text-white" : "bg-black/70 text-white"}`}>
          {bad ? "⚠ " : status === "ok" ? "● " : ""}{label}
          {flags > 0 && <span className="ml-1 opacity-90">· {flags}</span>}
        </p>
      </div>
    </div>
  );
}
