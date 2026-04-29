"use client";

import { useState } from "react";
import { whatsappLink } from "@/lib/whatsapp/link";

/**
 * Bulk WhatsApp launcher. Browsers don't let us open many wa.me tabs
 * silently (popup-blockers fire after the first), so this dialog takes
 * the recruiter through them one at a time:
 *
 *   1. Recruiter writes the message once (with optional {{firstName}}).
 *   2. We render a list of recipients, each with a "Open chat →" link.
 *      The first link auto-focuses for keyboard convenience.
 *   3. Each link opens the recruiter's WhatsApp app/web with the body
 *      pre-filled. Clicking marks that recipient as "sent" client-side
 *      so the recruiter can see what's left.
 *
 * Why deep-link rather than Cloud-API: cold recruiter outreach
 * shouldn't hit Meta's templated-messaging tier (24h opt-in window,
 * audited templates). The deep-link uses the recruiter's own WhatsApp
 * — same as if they'd typed the number in manually — and is the
 * pattern Naukri / Apna recruiters already use.
 *
 * Candidates without a phone number on file are listed but disabled,
 * with an inline "no phone on file" hint so the recruiter can either
 * skip or follow up via in-app InMail.
 */

interface Recipient {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

export function BulkWhatsAppDialog({ candidates }: { candidates: Recipient[] }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(
    "Hi {{firstName}}, this is from emobility.careers. I noticed your profile and wanted to chat about a role we're hiring for — do you have a few minutes?",
  );
  const [opened, setOpened] = useState<Set<string>>(new Set());

  function close() {
    setOpen(false);
    // Reset opened state so a re-open doesn't show stale ticks.
    setOpened(new Set());
  }
  function markOpened(id: string) {
    setOpened((prev) => new Set(prev).add(id));
  }

  const reachable = candidates.filter((c) => c.phone);
  const unreachable = candidates.filter((c) => !c.phone);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-3 py-1 text-xs font-bold text-white hover:bg-[#1ebe5b]"
      >
        <WhatsAppIcon className="h-3.5 w-3.5" />
        WhatsApp ({candidates.length})
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`WhatsApp ${candidates.length} candidates`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-xl bg-white shadow-emce-modal">
            <div className="flex items-start justify-between px-5 pt-5">
              <div>
                <h2 className="text-lg font-extrabold text-emce-text">
                  WhatsApp {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                </h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Each link opens your WhatsApp with the message pre-filled. Use{" "}
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

            <div className="px-5 py-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={1000}
                className="w-full resize-y rounded-md border border-emce-border bg-white p-2 text-sm focus:border-emce-mid focus:outline-none"
              />
              <p className="mt-1 text-hint text-emce-text-muted">{body.length}/1000 characters</p>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-emce-border px-2 py-2">
              <ul className="divide-y divide-emce-border">
                {reachable.map((c, i) => {
                  const personalised = body.replace(/\{\{\s*firstName\s*\}\}/gi, c.firstName);
                  const href = whatsappLink({ phone: c.phone, text: personalised });
                  const isOpen = opened.has(c.id);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-emce-text">
                          {c.firstName} {c.lastName ?? ""}
                        </p>
                        {isOpen && (
                          <p className="text-hint text-emce-mid-muted">✓ Opened</p>
                        )}
                      </div>
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          autoFocus={i === 0}
                          onClick={() => markOpened(c.id)}
                          className="rounded-md bg-[#25D366] px-3 py-1 text-xs font-bold text-white hover:bg-[#1ebe5b]"
                        >
                          Open chat →
                        </a>
                      )}
                    </li>
                  );
                })}
                {unreachable.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 opacity-60">
                    <p className="truncate text-sm font-bold text-emce-text">
                      {c.firstName} {c.lastName ?? ""}
                    </p>
                    <span className="text-hint text-emce-text-muted">No phone on file</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-emce-border bg-emce-light-soft/50 px-5 py-3 text-hint text-emce-text-sec">
              <span>
                {opened.size}/{reachable.length} opened
                {unreachable.length > 0 && <> · {unreachable.length} unreachable</>}
              </span>
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-emce-border bg-white px-3 py-1 text-xs font-bold text-emce-text hover:bg-emce-light-soft"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2C6.6 2 2.18 6.4 2.18 11.84c0 2.07.62 4.06 1.78 5.78L2 22l4.55-1.93a9.83 9.83 0 0 0 5.49 1.66h.01c5.43 0 9.86-4.4 9.86-9.83 0-2.63-1.03-5.1-2.9-6.96A9.83 9.83 0 0 0 12.04 2zm0 17.95a8.18 8.18 0 0 1-4.18-1.14l-.3-.18-3.05 1.3 1.3-2.96-.2-.3a8.16 8.16 0 0 1-1.26-4.83c0-4.5 3.67-8.17 8.18-8.17 2.18 0 4.23.85 5.78 2.4a8.13 8.13 0 0 1 2.4 5.78c0 4.51-3.68 8.18-8.18 8.18zm4.65-6.13c-.25-.13-1.5-.74-1.74-.83-.23-.08-.4-.13-.57.13-.17.25-.66.83-.81.99-.15.17-.3.19-.55.06-.25-.12-1.06-.39-2.02-1.24-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.57-1.36-.78-1.86-.2-.5-.41-.43-.57-.43h-.49c-.17 0-.45.06-.69.32-.24.25-.91.89-.91 2.17 0 1.28.94 2.51 1.07 2.69.13.17 1.85 2.83 4.49 3.97.63.27 1.12.43 1.5.55.63.2 1.21.17 1.66.1.5-.07 1.5-.61 1.71-1.2.21-.59.21-1.09.15-1.2-.06-.1-.23-.16-.48-.29z" />
    </svg>
  );
}
