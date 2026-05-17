"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateDriveContactAndFaq } from "@/server/recruitment-drives/actions";

/**
 * Admin editor for the hiring-partner contact card + FAQ accordion
 * surfaced on the public fair page. Both blocks are optional; a
 * fair can save with all four contact fields blank and an empty
 * FAQ array — the public page just hides those sections.
 *
 * FAQ is composed in-memory and serialised to a hidden
 * `faqJson` input on submit. Mirror of the
 * ApplicationQuestionsEditor pattern; same shape (id-less array of
 * `{ q, a }` objects), capped at 12 entries.
 */
const MAX_FAQ_ENTRIES = 12;
const MAX_Q = 200;
const MAX_A = 2000;

interface FaqEntry {
  q: string;
  a: string;
}

export function ContactAndFaqEditor({
  driveId,
  initialContactName,
  initialContactPhone,
  initialContactEmail,
  initialFaq = [],
}: {
  driveId: string;
  initialContactName: string | null;
  initialContactPhone: string | null;
  initialContactEmail: string | null;
  initialFaq?: FaqEntry[];
}) {
  const [faq, setFaq] = useState<FaqEntry[]>(initialFaq);

  function addEntry() {
    if (faq.length >= MAX_FAQ_ENTRIES) return;
    setFaq((prev) => [...prev, { q: "", a: "" }]);
  }

  function updateEntry(idx: number, patch: Partial<FaqEntry>) {
    setFaq((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function removeEntry(idx: number) {
    setFaq((prev) => prev.filter((_, i) => i !== idx));
  }

  // Drop incomplete entries before serialising — admin shouldn't
  // need to manually clear a partially-typed row before saving.
  const cleanFaq = faq
    .map((e) => ({ q: e.q.trim(), a: e.a.trim() }))
    .filter((e) => e.q.length >= 3 && e.a.length >= 3);

  return (
    <Card className="p-5">
      <h2 className="text-section text-emce-text">
        Hiring-partner contact &amp; FAQ
      </h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Both blocks are optional. The contact card surfaces in the public
        fair page sidebar; the FAQ accordion renders below the open-roles
        section. Leave any field blank to hide that piece.
      </p>

      <form action={updateDriveContactAndFaq} className="mt-4 space-y-4">
        <input type="hidden" name="driveId" value={driveId} />

        {/* Primary contact */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="primaryContactName">Contact name</Label>
            <Input
              id="primaryContactName"
              name="primaryContactName"
              defaultValue={initialContactName ?? ""}
              placeholder="e.g. Muskan Kumari"
              maxLength={120}
            />
          </div>
          <div>
            <Label htmlFor="primaryContactPhone">Phone / WhatsApp</Label>
            <Input
              id="primaryContactPhone"
              name="primaryContactPhone"
              defaultValue={initialContactPhone ?? ""}
              placeholder="+91 82527 40478"
              maxLength={40}
              inputMode="tel"
            />
          </div>
          <div>
            <Label htmlFor="primaryContactEmail">Email</Label>
            <Input
              id="primaryContactEmail"
              name="primaryContactEmail"
              defaultValue={initialContactEmail ?? ""}
              placeholder="info@diyguru.org"
              maxLength={160}
              type="email"
            />
          </div>
        </div>

        {/* FAQ editor */}
        <div className="border-t border-emce-border pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-bold text-emce-text">FAQ entries</p>
              <p className="text-hint text-emce-text-sec">
                Up to {MAX_FAQ_ENTRIES} short Q&amp;As. Each rendered as a
                collapsible row.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEntry}
              disabled={faq.length >= MAX_FAQ_ENTRIES}
            >
              + Add FAQ
            </Button>
          </div>

          {faq.length === 0 && (
            <p className="mt-3 rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-3 text-hint text-emce-text-sec">
              No FAQ entries yet. Add 4-8 questions hiring partners
              actually ask — fees, infrastructure, candidate profiles,
              dual-city participation.
            </p>
          )}

          {faq.map((entry, idx) => (
            <div
              key={idx}
              className="mt-3 rounded-md border border-emce-border bg-white p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-hint font-bold uppercase tracking-wider text-emce-text-muted">
                  Q&amp;A {idx + 1}
                </p>
                <button
                  type="button"
                  onClick={() => removeEntry(idx)}
                  className="text-hint text-emce-red-deep hover:underline"
                >
                  Remove
                </button>
              </div>
              <Input
                value={entry.q}
                onChange={(e) => updateEntry(idx, { q: e.target.value })}
                placeholder="Is there a participation fee for hiring companies?"
                maxLength={MAX_Q}
              />
              <Textarea
                value={entry.a}
                onChange={(e) => updateEntry(idx, { a: e.target.value })}
                placeholder="No. Participation is free for companies with active hiring mandates…"
                rows={3}
                maxLength={MAX_A}
              />
              <p className="text-right text-hint tabular-nums text-emce-text-muted">
                Q {entry.q.length}/{MAX_Q} · A {entry.a.length}/{MAX_A}
              </p>
            </div>
          ))}
        </div>

        {/* Serialised FAQ for the server action. The server
            re-validates with Zod (faqEntrySchema) so a tampered
            hidden input can't slip malformed entries through. */}
        <input
          type="hidden"
          name="faqJson"
          value={cleanFaq.length > 0 ? JSON.stringify(cleanFaq) : ""}
        />

        <div className="flex justify-end border-t border-emce-border pt-4">
          <SubmitButton size="sm" pendingLabel="Saving…">
            Save contact &amp; FAQ
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}
