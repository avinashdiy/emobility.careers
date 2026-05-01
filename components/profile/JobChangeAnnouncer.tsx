"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { announceJobChange, retractJobChange } from "@/server/profile/job-change";
import { relativeTime } from "@/lib/utils";

/**
 * "I started a new role" announcer + history list. Lives on the
 * profile-edit page. Composes:
 *
 *   • One-line opt-in state — links the candidate's
 *     `announceJobChange` toggle (set automatically when they post)
 *     to the user-visible status.
 *   • An expandable form to file a new announcement. Hidden by
 *     default so the section reads as "you've made N announcements"
 *     without screaming for attention.
 *   • A list of past announcements with a per-row Retract button.
 *
 * The server action handles validation + rate limiting; this
 * component is just orchestration. Toast-style success/error is
 * rendered inline (no toast library required at this surface).
 */

export interface PastAnnouncement {
  id: string;
  toCompany: string;
  toTitle: string;
  fromCompany: string | null;
  fromTitle: string | null;
  note: string | null;
  published: boolean;
  congratsCount: number;
  createdAt: Date;
}

export function JobChangeAnnouncer({
  past,
  optedIn,
}: {
  past: PastAnnouncement[];
  optedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await announceJobChange(formData);
      setFeedback(result);
      if (result.ok) {
        // Collapse the form and clear inputs by re-mounting via key
        // bump on next render — simplest approach is to close, the
        // server revalidates /me/profile and feeds fresh `past`.
        setOpen(false);
      }
    });
  }

  const visiblePast = past.filter((p) => p.published);
  const retractedPast = past.filter((p) => !p.published);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-section text-emce-text">Career moves</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Announce a new role on{" "}
            <Link href="/pulse" className="font-bold text-emce-dark hover:underline">
              /pulse → Who&apos;s moving
            </Link>
            . The platform never auto-detects employer changes — you
            choose what to share.
          </p>
        </div>
        {optedIn && (
          <Badge variant="success" size="sm">
            Sharing enabled
          </Badge>
        )}
      </div>

      {feedback && (
        <div
          className={`mt-3 rounded-md p-3 text-sm ${
            feedback.ok
              ? "bg-emce-light-soft text-emce-darkest"
              : "bg-emce-red-light text-emce-red"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {!open ? (
        <div className="mt-4">
          <Button onClick={() => setOpen(true)} variant="outline">
            + Announce a new role
          </Button>
        </div>
      ) : (
        <form
          action={submit}
          className="mt-4 space-y-3 rounded-md border border-emce-border bg-emce-light-soft/40 p-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-bold text-emce-text">New title *</span>
              <Input
                name="toTitle"
                required
                minLength={2}
                maxLength={120}
                placeholder="Senior Battery Engineer"
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold text-emce-text">New employer *</span>
              <Input
                name="toCompany"
                required
                minLength={1}
                maxLength={120}
                placeholder="Tata Motors"
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold text-emce-text">Previous title</span>
              <Input
                name="fromTitle"
                maxLength={120}
                placeholder="Optional"
                className="mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="font-bold text-emce-text">Previous employer</span>
              <Input
                name="fromCompany"
                maxLength={120}
                placeholder="Optional"
                className="mt-1"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-bold text-emce-text">Note</span>
            <Textarea
              name="note"
              rows={3}
              maxLength={280}
              placeholder="Excited to join — building the next-gen fast-charging stack."
              className="mt-1"
            />
            <span className="text-hint text-emce-text-muted">
              Up to 280 characters. Visible on /pulse for the next 60 days.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Posting…" : "Post to /pulse →"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <p className="text-hint text-emce-text-muted">
            Rate limit: up to 3 announcements per 30 days.
          </p>
        </form>
      )}

      {visiblePast.length > 0 && (
        <div className="mt-5 border-t border-emce-border pt-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Live on /pulse
          </p>
          <ul className="mt-2 space-y-2">
            {visiblePast.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-emce-border bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <strong>{a.toTitle}</strong>{" "}
                    <span className="text-emce-text-sec">at {a.toCompany}</span>
                  </p>
                  <p className="text-hint text-emce-text-muted">
                    Posted {relativeTime(a.createdAt)}
                    {a.congratsCount > 0 && ` · 🎉 ${a.congratsCount}`}
                  </p>
                </div>
                <form action={retractJobChange}>
                  <input type="hidden" name="id" value={a.id} />
                  <ConfirmSubmit
                    confirm="Hide this announcement from /pulse? It stays in your audit history but disappears from the public feed."
                    variant="ghost"
                    size="sm"
                  >
                    Retract
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {retractedPast.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer list-none text-hint font-bold text-emce-dark hover:underline">
            <span className="group-open:hidden">
              {retractedPast.length} retracted →
            </span>
            <span className="hidden group-open:inline">Hide retracted</span>
          </summary>
          <ul className="mt-2 space-y-1">
            {retractedPast.map((a) => (
              <li key={a.id} className="text-hint text-emce-text-muted">
                {a.toTitle} at {a.toCompany} — retracted, posted{" "}
                {relativeTime(a.createdAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
