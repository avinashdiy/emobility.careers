"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import {
  createArticle,
  updateArticle,
  type CreateArticleResult,
} from "@/server/articles/actions";
import { emptyFormState } from "@/lib/form-state";
import type { FormState } from "@/lib/form-state";

interface CategoryOption {
  id: string;
  name: string;
}

interface ArticleEditorProps {
  /// Existing article id when editing; undefined when creating.
  articleId?: string;
  /// Initial values prefilled when editing.
  initial?: {
    title: string;
    excerpt: string | null;
    body: string;
    coverImageUrl: string | null;
    categoryId: string | null;
    tags: string[];
  };
  categories: CategoryOption[];
}

/**
 * Shared form for both /admin/articles/new (create) and
 * /admin/articles/[id] (edit). Branches on `articleId` — when
 * present, dispatches `updateArticle`; otherwise `createArticle`.
 *
 * Keeping editor state minimal: title, excerpt (optional), body
 * (markdown / plain text), cover image URL, category, tags. Author
 * is the calling admin by default; advanced re-assignment lives in
 * the admin UI as a follow-up (most articles will be authored by
 * the admin who creates them).
 */
export function ArticleEditor({
  articleId,
  initial,
  categories,
}: ArticleEditorProps) {
  const router = useRouter();
  const isEdit = Boolean(articleId);

  const [state, formAction] = useActionState(
    async (prev: FormState & { articleId?: string; slug?: string }, fd: FormData) => {
      if (isEdit && articleId) {
        return await updateArticle(prev as FormState, fd);
      }
      const result = (await createArticle(prev as CreateArticleResult, fd)) as CreateArticleResult;
      // On create success, hop to the edit page so the admin can
      // immediately publish + iterate without losing context.
      if (result.ok && result.articleId) {
        router.push(`/admin/articles/${result.articleId}`);
      }
      return result;
    },
    emptyFormState as FormState & { articleId?: string; slug?: string },
  );

  return (
    <Card className="p-5">
      <h2 className="text-section text-emce-text">
        {isEdit ? "Edit article" : "New article"}
      </h2>

      {state.ok && state.message && (
        <Alert variant="success" className="mt-3">
          ✓ {state.message}
        </Alert>
      )}
      {!state.ok && state.message && (
        <Alert variant="danger" className="mt-3">
          {state.message}
        </Alert>
      )}

      <form action={formAction} className="mt-4 space-y-4">
        {articleId && <input type="hidden" name="articleId" value={articleId} />}

        <div>
          <Label htmlFor="title" required>
            Title
          </Label>
          <Input
            id="title"
            name="title"
            required
            minLength={8}
            maxLength={200}
            defaultValue={initial?.title ?? ""}
            placeholder="How a CCS connector works"
          />
        </div>

        <div>
          <Label htmlFor="excerpt" optional>
            Excerpt (SEO meta description + index card preview)
          </Label>
          <Textarea
            id="excerpt"
            name="excerpt"
            rows={2}
            maxLength={280}
            defaultValue={initial?.excerpt ?? ""}
            placeholder="One-paragraph pitch — also serves as the OpenGraph + meta-description tag."
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Up to 280 chars. Aim for ~155 to fit Google search snippets.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="categoryId" optional>
              Category
            </Label>
            <NativeSelect
              id="categoryId"
              name="categoryId"
              defaultValue={initial?.categoryId ?? ""}
            >
              <option value="">— uncategorised —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="coverImageUrl" optional>
              Cover image URL (3:1 ratio recommended)
            </Label>
            <Input
              id="coverImageUrl"
              name="coverImageUrl"
              type="url"
              defaultValue={initial?.coverImageUrl ?? ""}
              placeholder="https://..."
            />
          </div>
        </div>

        <div>
          <Label htmlFor="tagsRaw" optional>
            Tags
          </Label>
          <Input
            id="tagsRaw"
            name="tagsRaw"
            defaultValue={initial?.tags.join(", ") ?? ""}
            placeholder="bms, charging, ccs, fast-charging"
            maxLength={500}
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Comma- or newline-separated. Up to 10 tags. Lowercased; used
            for search + the tag-cloud at the bottom of each article.
          </p>
        </div>

        <div>
          <Label htmlFor="body" required>
            Body
          </Label>
          <Textarea
            id="body"
            name="body"
            rows={20}
            required
            minLength={100}
            defaultValue={initial?.body ?? ""}
            placeholder={`Open with the hook — what does this answer that nobody else explains well?\n\nThen the meat: structure, diagrams (paste image URLs inline as Markdown ![](url)), worked examples.\n\nClose with takeaways + a call-to-action (apply for relevant jobs / explore companies).`}
            className="font-mono text-sm"
          />
          <p className="mt-1 text-hint text-emce-text-muted">
            Plain text or Markdown. Reading time auto-computed at save
            (~220 wpm). Body is rendered via the `prose` typography
            plugin on the public page.
          </p>
        </div>

        <SubmitButton pendingLabel={isEdit ? "Saving…" : "Creating…"}>
          {isEdit ? "Save article" : "Create draft"}
        </SubmitButton>
      </form>
    </Card>
  );
}
