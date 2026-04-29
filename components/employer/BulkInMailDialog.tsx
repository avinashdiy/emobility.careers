"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendBulkInMail } from "@/server/employer/actions";
import { toast } from "sonner";

/**
 * Bulk InMail composer for recruiter talent search.
 *
 * Recruiters tick candidates on the search list, the sticky action bar
 * surfaces this dialog, they paste a subject + body once, and we open one
 * cold-outreach MessageThread per recipient and post the same body to
 * each. This is the "InMail to a shortlist" pattern from LinkedIn
 * Recruiter — the meaningful wins are:
 *
 *   - Saves 5-10 minutes per shortlist vs DM-ing everyone individually.
 *   - {{firstName}} substitution lets the message stay personal-feeling.
 *   - Server-side rate-limit + audit log so abuse is bounded.
 *
 * This component intentionally renders the dialog in-place (not a portal)
 * so it inherits the parent's focus context. Keep the child elements
 * shallow — they're rebuilt every time the dialog opens.
 */

export interface BulkRecipient {
  id: string;
  slug: string;
  firstName: string;
  lastName: string | null;
}

export function BulkInMailDialog({
  candidates,
  onSent,
}: {
  candidates: BulkRecipient[];
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    // Don't clear text on close — recruiter may want to reopen and tweak.
  }

  function submit() {
    if (!body.trim()) {
      toast.error("Add a message body before sending.");
      return;
    }
    startTransition(async () => {
      const res = await sendBulkInMail({
        candidateIds: candidates.map((c) => c.id),
        subject: subject.trim() || undefined,
        body: body.trim(),
      });
      if (res.ok) {
        toast.success(`Message sent to ${res.sent} candidate${res.sent === 1 ? "" : "s"}.`);
        if (res.skipped > 0) {
          toast(`Skipped ${res.skipped} (rate-limited or unreachable).`);
        }
        setSubject("");
        setBody("");
        setOpen(false);
        onSent();
      } else {
        toast.error(res.message ?? "Bulk message failed.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-emce-dark px-3 py-1 text-xs font-bold text-white hover:bg-emce-darkest"
      >
        ✉️ Message all
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Send InMail to ${candidates.length} candidates`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-emce-modal">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-emce-text">
                  Message {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  One thread opens per candidate. Use{" "}
                  <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">
                    {"{{firstName}}"}
                  </code>{" "}
                  to personalise.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-emce-text-sec hover:bg-emce-light-soft"
              >
                ✕
              </button>
            </div>

            {/* Selected-candidate chips — read-only confirmation. Clipped at
                10 with a "+N more" so the dialog doesn't overflow on bulk. */}
            <div className="mt-3 flex flex-wrap gap-1 rounded-md bg-emce-light-soft p-2">
              {candidates.slice(0, 10).map((c) => (
                <span
                  key={c.id}
                  className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-emce-text"
                >
                  {c.firstName} {c.lastName?.[0] ?? ""}
                </span>
              ))}
              {candidates.length > 10 && (
                <span className="text-[11px] text-emce-text-sec">
                  +{candidates.length - 10} more
                </span>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="subject">Subject (optional)</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={120}
                  placeholder="A role you may be a fit for"
                />
              </div>
              <div>
                <Label htmlFor="body">Message</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  maxLength={4000}
                  placeholder={`Hi {{firstName}},\n\nWe're hiring for a Battery Engineer at Acme. Would you be open to a chat?\n\nThanks!`}
                />
                <p className="mt-1 text-hint text-emce-text-muted">
                  {body.length}/4000 characters
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending || !body.trim()}>
                {pending ? "Sending…" : `Send to ${candidates.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
