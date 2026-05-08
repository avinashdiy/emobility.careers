"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  cleanupOrphanedWpArticles,
  type CleanupResult,
} from "@/server/admin/wordpress-content-import";

const INITIAL: CleanupResult = { ok: false };

interface Props {
  /// Live count of wp-import-tagged Article rows. Drives the
  /// button copy + lets us hide the form entirely when there's
  /// nothing to clean up.
  orphanCount: number;
}

/**
 * One-shot bulk-delete of Article rows tagged "wp-import" — left
 * over from the previous import pipeline that routed posts into
 * the Article table. The new pipeline puts posts into Page; this
 * form vacuums the orphans so /articles/<slug> stops serving the
 * broken raw-HTML page.
 *
 * Hidden when there are no orphans to delete.
 */
export function OrphanArticleCleanupForm({ orphanCount }: Props) {
  const [state, formAction] = useActionState(cleanupOrphanedWpArticles, INITIAL);

  if (orphanCount === 0 && !state.ok) {
    return (
      <p className="text-sm text-emce-text-sec">
        No orphaned wp-import articles in the database. ✓
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-emce-text">
        {orphanCount} orphaned <code>wp-import</code> article row
        {orphanCount === 1 ? "" : "s"} from the previous import pipeline.
        These show up at <code>/articles/&lt;slug&gt;</code> as raw-HTML pages.
        Re-importing has already moved their content to <code>Page</code>;
        this button deletes the leftover Article rows.
      </p>
      <form action={formAction}>
        <ConfirmSubmit
          confirm={`Delete ${orphanCount} wp-import article${orphanCount === 1 ? "" : "s"} permanently? Their content has been re-imported into the Page table — this only nukes the leftover Article rows.`}
          variant="outline"
          size="sm"
        >
          Delete {orphanCount} orphaned article{orphanCount === 1 ? "" : "s"}
        </ConfirmSubmit>
      </form>
      {state.message && (
        <div
          role={state.ok ? "status" : "alert"}
          className={`rounded-md border p-3 text-sm ${
            state.ok
              ? "border-emce-success-deep/30 bg-emce-light-soft text-emce-text"
              : "border-emce-red/40 bg-emce-red-light text-emce-red"
          }`}
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
