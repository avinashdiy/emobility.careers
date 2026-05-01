"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { createArticleCategory } from "@/server/articles/actions";
import { emptyFormState } from "@/lib/form-state";

/**
 * Inline three-field form for adding a new article category from
 * the admin /admin/articles page. Lives in the right column of the
 * categories card, so the admin doesn't have to navigate away to
 * spawn a new bucket.
 *
 * On success the parent page re-fetches via revalidatePath() inside
 * the server action — useActionState rerender shows the success
 * banner.
 */
export function CategoryQuickAdd() {
  const [state, formAction] = useActionState(createArticleCategory, emptyFormState);
  return (
    <div>
      <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
        + Add category
      </p>
      {state.ok && state.message && (
        <Alert variant="success" className="mt-2">
          ✓ {state.message}
        </Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mt-2">
          {state.message}
        </Alert>
      )}
      <form action={formAction} className="mt-2 grid gap-2 sm:grid-cols-12">
        <div className="sm:col-span-4">
          <Label htmlFor="cat-name" required>
            Name
          </Label>
          <Input id="cat-name" name="name" required minLength={2} maxLength={60} placeholder="Battery" />
        </div>
        <div className="sm:col-span-6">
          <Label htmlFor="cat-desc" optional>
            Short description
          </Label>
          <Input
            id="cat-desc"
            name="description"
            maxLength={200}
            placeholder="Pack design, BMS, cell chemistry."
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="cat-sort">Sort</Label>
          <Input
            id="cat-sort"
            name="sortOrder"
            type="number"
            defaultValue={100}
            min={0}
            max={999}
          />
        </div>
        <div className="sm:col-span-12">
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add category
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
