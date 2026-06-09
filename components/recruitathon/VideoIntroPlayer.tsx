"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getFairVideoIntroUrl } from "@/server/recruitment-drives/registrations";

/**
 * Recruiter-side player for a candidate's Phase 3 video intro.
 * Mounted on the employer application-detail page when the
 * candidate has uploaded an intro for the fair this application
 * came in through.
 *
 * Click → server action resolves a 5-min presigned GET URL →
 * inline <video> element streams it. We never bake the URL into
 * the page HTML (same access pattern as message attachments) so a
 * stale screenshot of the page can't leak the candidate's video to
 * a viewer who lost access between render and click.
 *
 * The video is INTRODUCTORY material, not interview content —
 * recorded once by the candidate as a fallback when their slot
 * cancelled / they couldn't book one. Treat it like async
 * homework: watch it, take notes, move on.
 */
type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "playing"; url: string }
  | { kind: "error"; message: string };

export function VideoIntroPlayer({
  registrationId,
  uploadedAt,
}: {
  registrationId: string;
  uploadedAt: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function load() {
    setState({ kind: "loading" });
    startTransition(async () => {
      try {
        const res = await getFairVideoIntroUrl(registrationId);
        if (res.url) {
          setState({ kind: "playing", url: res.url });
        } else {
          setState({
            kind: "error",
            message: "Can't open this intro. The URL may have expired — try again.",
          });
        }
      } catch {
        setState({ kind: "error", message: "Couldn't load — try again." });
      }
    });
  }

  if (state.kind === "playing") {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={state.url}
          controls
          className="aspect-video w-full rounded-md border border-emce-border bg-black"
        />
        <div className="flex items-center gap-2 text-hint text-emce-text-muted">
          <span>Async intro · uploaded {new Date(uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setState({ kind: "idle" })}
          >
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-md border border-emce-orange/40 bg-emce-orange-light p-3">
        <p className="text-hint text-emce-orange-deep" role="alert">
          ⚠ {state.message}
        </p>
        <Button onClick={load} variant="outline" size="sm" className="mt-2">
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-emce-mid/30 bg-emce-light-soft/40 p-3">
      <span aria-hidden className="text-2xl">🎥</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-emce-text">
          Candidate uploaded a video intro
        </p>
        <p className="text-hint text-emce-text-sec">
          Async fallback — 2-min introduction, recorded by the candidate. Watch when convenient.
        </p>
      </div>
      <Button
        onClick={load}
        disabled={pending || state.kind === "loading"}
        size="sm"
      >
        {state.kind === "loading" ? "Loading…" : "▶ Watch intro"}
      </Button>
    </div>
  );
}
