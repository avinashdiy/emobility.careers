"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { completeProductTour } from "@/server/onboarding/actions";

/**
 * Post-signup welcome walkthrough. 6 stepped overlay cards introducing
 * the core surfaces of the platform — feed, jobs, mentors, competitions,
 * network, profile. Each card has a "Take me there" link that closes the
 * tour and routes to that feature, plus "Next" to continue and "Skip"
 * to dismiss.
 *
 * The tour is stateful per-step (no router navigation between steps), so
 * the candidate can flip through quickly without losing context. The
 * final step pushes them into /me/profile because the 50% / 90% gates
 * mean profile completion is the next required step before they can
 * actually use the platform.
 *
 * Closing or finishing fires the `completeProductTour` server action,
 * which stamps `User.productTourCompletedAt`. Once stamped, the tour
 * never opens again for that user.
 */

interface Step {
  emoji: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
}

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "Welcome to eMobility Careers",
    body: "India's only career platform built for the EV industry. Battery, charging, powertrain, motors, manufacturing — this is your home base.",
    cta: { href: "/feed", label: "See your feed" },
  },
  {
    emoji: "💼",
    title: "Browse EV jobs",
    body: "8–10 fresh roles land here every day, screened for the EV industry. Filter by collar type, location, and skills. DIYguru-verified candidates get preference in matching.",
    cta: { href: "/jobs", label: "Browse jobs" },
  },
  {
    emoji: "🎓",
    title: "Find a mentor",
    body: "Industry experts run 1-on-1 sessions for career advice, mock interviews, and project review. Many are free for DIYguru students.",
    cta: { href: "/mentors", label: "Find a mentor" },
  },
  {
    emoji: "🏆",
    title: "Compete and win interviews",
    body: "Hackathons, design challenges, and case competitions hosted by EV companies. Winners get prize money + interview shortcuts.",
    cta: { href: "/competitions", label: "See live competitions" },
  },
  {
    emoji: "🌐",
    title: "Build your network",
    body: "Connect with EV recruiters, DIYguru alumni, faculty, and peers. Your feed shows posts, jobs, and updates from your network.",
    cta: { href: "/people", label: "Discover people" },
  },
  {
    emoji: "📝",
    title: "Complete your profile",
    body: "You can apply to any job once your profile reaches 90%. Aim for 50% to start exploring; we’ll keep nudging you. Pro tip: upload a resume — we’ll auto-fill the rest with AI.",
    cta: { href: "/me/profile?from=tour", label: "Complete profile" },
  },
];

export function ProductTour() {
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  function dismiss() {
    setOpen(false);
    // Fire-and-forget so the modal closes immediately; the column write
    // is non-critical and a brief page reload won't undo the close.
    startTransition(() => {
      completeProductTour();
    });
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
    >
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-emce-modal">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close tour"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
        >
          ✕
        </button>

        <div className="text-4xl">{s.emoji}</div>
        <h2 className="mt-2 text-xl font-extrabold text-emce-text">{s.title}</h2>
        <p className="mt-2 text-sm text-emce-text-sec">{s.body}</p>

        {/* Step dots */}
        <div className="mt-4 flex items-center gap-1">
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-emce-dark" : "w-1.5 bg-emce-border"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm font-bold text-emce-text-sec hover:text-emce-text"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <Link
              href={s.cta.href}
              onClick={dismiss}
              className="rounded-md border border-emce-border px-3 py-1.5 text-sm font-bold text-emce-text hover:bg-emce-light-soft"
            >
              {s.cta.label} →
            </Link>
            {!isLast ? (
              <button
                type="button"
                onClick={() => setStep((n) => n + 1)}
                className="rounded-md bg-emce-dark px-4 py-1.5 text-sm font-bold text-white hover:bg-emce-darkest"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                disabled={pending}
                className="rounded-md bg-emce-dark px-4 py-1.5 text-sm font-bold text-white hover:bg-emce-darkest disabled:opacity-60"
              >
                {pending ? "Closing…" : "Get started"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
