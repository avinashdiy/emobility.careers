"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  importWordPressContentXml,
  type ImportResult,
} from "@/server/admin/wordpress-content-import";

const INITIAL: ImportResult = { ok: false };

/**
 * File-upload form for WordPress XML imports. Single-step — the
 * server action parses, dedupes by SHA-256, and writes everything
 * as DRAFT in one go. The result banner spells out exactly what
 * landed and links the admin to the review queues.
 */
export function WordPressImportForm() {
  const [state, formAction] = useActionState(importWordPressContentXml, INITIAL);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-3" encType="multipart/form-data">
        <label className="block">
          <span className="text-section text-emce-text">WordPress export file (.xml)</span>
          <input
            type="file"
            name="xml"
            accept=".xml,application/xml,text/xml"
            required
            className="mt-2 block w-full cursor-pointer rounded-md border border-emce-border bg-white p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emce-dark file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white hover:file:bg-emce-darkest"
          />
          <span className="mt-1 block text-hint text-emce-text-sec">
            Use WordPress &rarr; Tools &rarr; Export &rarr; All content (or
            Pages-only / Posts-only). Max 30&nbsp;MB.
          </span>
        </label>

        <div className="rounded-md border border-emce-border bg-emce-light-soft/40 p-3 text-hint text-emce-text-sec">
          <strong className="block text-emce-text">What happens on submit:</strong>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>
              Pages land in the new <code>Page</code> table, surfaced at <code>/&lt;slug&gt;</code>{" "}
              (top-level, same as candidate handles).
            </li>
            <li>
              Posts land in the existing <code>Article</code> table, surfaced at <code>/articles/&lt;slug&gt;</code>.
            </li>
            <li>
              Pages render inside a style-isolated iframe by default — Elementor / full-document
              CSS (<code>body {`{ ... !important }`}</code>) won&apos;t bleed onto site chrome.
            </li>
            <li>
              <strong>Everything imports as DRAFT.</strong> Nothing goes live
              until you click Publish in the respective admin section.
            </li>
            <li>HTML is sanitised on the way in — scripts stripped, styles preserved.</li>
            <li>
              Re-uploading the same exact file is rejected. Re-uploading a
              re-export of the same content updates rows in place, keyed on
              the WordPress post ID.
            </li>
          </ul>
        </div>

        <SubmitButton size="lg">Import as drafts</SubmitButton>
      </form>

      {state.message && (
        <div
          role={state.ok ? "status" : "alert"}
          className={`rounded-md border p-4 text-sm ${
            state.ok
              ? "border-emce-success-deep/30 bg-emce-light-soft text-emce-text"
              : "border-emce-red/40 bg-emce-red-light text-emce-red"
          }`}
        >
          <p className="font-bold">{state.ok ? "✓ Imported" : "✗ Couldn't import"}</p>
          <p className="mt-1">{state.message}</p>
          {state.ok && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(state.pagesImported ?? 0) > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/pages">Review {state.pagesImported} pages →</Link>
                </Button>
              )}
              {(state.postsImported ?? 0) > 0 && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/articles?tag=wp-import">Review {state.postsImported} posts →</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
