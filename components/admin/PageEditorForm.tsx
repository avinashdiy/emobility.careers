"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import {
  createPage,
  updatePage,
  type SavePageResult,
} from "@/server/admin/page-actions";

const INITIAL: SavePageResult = { ok: false };

interface Props {
  /// When set, edit-mode. Otherwise create-mode.
  page?: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    body: string;
    coverImageUrl: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    renderMode: "STANDALONE" | "EMBEDDED";
    allowScripts: boolean;
  };
}

/**
 * Hand-authored Page editor. Big textarea for raw HTML — admin
 * pastes Elementor / hand-written HTML and chooses the trust mode.
 *
 * Trust mode (allowScripts checkbox):
 *   • OFF — `<script>` tags get stripped at sanitise-time. Iframe
 *     sandbox stays strict (opaque origin). Use for static landing
 *     pages, info pages, anything without interactivity.
 *   • ON  — `<script>` tags survive. Iframe sandbox adds
 *     `allow-same-origin` so the script can fetch /api/ai/proxy
 *     same-origin and use relative URLs. Use for AI tools you
 *     authored or trust.
 *
 * Render mode (STANDALONE vs EMBEDDED):
 *   • STANDALONE — body renders inside a style-isolated iframe.
 *     Use for full HTML documents with their own <style>, <body>
 *     overrides, etc. (Elementor exports.) Default.
 *   • EMBEDDED — body renders inline inside our chrome and prose
 *     wrapper. Use for short HTML fragments (a contact page, a
 *     team bio) that should inherit our typography.
 */
export function PageEditorForm({ page }: Props) {
  const isEdit = !!page;
  const action = isEdit ? updatePage : createPage;
  const [state, formAction] = useActionState(action, INITIAL);
  const router = useRouter();

  // After a successful create, jump to the edit page so the admin
  // can keep iterating on the same row instead of re-creating.
  useEffect(() => {
    if (!isEdit && state.ok && state.pageId) {
      router.push(`/admin/pages/${state.pageId}/edit`);
    }
  }, [isEdit, state.ok, state.pageId, router]);

  return (
    <form action={formAction} className="space-y-5">
      {isEdit && page && <input type="hidden" name="pageId" value={page.id} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={page?.title ?? ""}
            placeholder="EV Cover Letter Generator"
            required
            maxLength={200}
          />
          <FieldError error={state.fieldErrors?.title} />
        </div>
        <div>
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={page?.slug ?? ""}
            placeholder="ev-cover-letter-generator"
            maxLength={80}
          />
          <p className="mt-1 text-hint text-emce-text-sec">
            Public URL: <code>/{page?.slug ?? "<slug>"}</code>. Auto-derived from title if blank.
          </p>
          <FieldError error={state.fieldErrors?.slug} />
        </div>
      </div>

      <div>
        <Label htmlFor="excerpt">Excerpt (SEO description)</Label>
        <Input
          id="excerpt"
          name="excerpt"
          defaultValue={page?.excerpt ?? ""}
          placeholder="One-line description used in search results and social cards."
          maxLength={500}
        />
      </div>

      <div>
        <Label htmlFor="body">
          HTML body
          <span className="ml-2 text-hint font-normal text-emce-text-sec">
            paste your full Elementor / hand-written HTML here
          </span>
        </Label>
        <Textarea
          id="body"
          name="body"
          defaultValue={page?.body ?? ""}
          required
          rows={24}
          className="font-mono text-xs"
          placeholder={`<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <style>\n    body { background: #0a2f26; color: white; font-family: sans-serif; }\n    .hero { padding: 80px 24px; text-align: center; }\n  </style>\n</head>\n<body>\n  <div class="hero">\n    <h1>My Tool</h1>\n    <p>Pasted here, lives at /<slug>.</p>\n  </div>\n</body>\n</html>`}
        />
        <FieldError error={state.fieldErrors?.body} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="renderMode">Render mode</Label>
          <NativeSelect
            id="renderMode"
            name="renderMode"
            defaultValue={page?.renderMode ?? "STANDALONE"}
          >
            <option value="STANDALONE">STANDALONE — full-bleed iframe (recommended for Elementor)</option>
            <option value="EMBEDDED">EMBEDDED — inline inside site chrome (for short fragments)</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="coverImageUrl">Cover image URL (optional)</Label>
          <Input
            id="coverImageUrl"
            name="coverImageUrl"
            type="url"
            defaultValue={page?.coverImageUrl ?? ""}
            placeholder="https://files.emobility.careers/emce-posts/posts/.../cover.jpg"
          />
          <p className="mt-1 text-hint text-emce-text-sec">
            Used as the OG/Twitter share card. The iframe page itself isn&apos;t affected.
          </p>
        </div>
      </div>

      <label className="block rounded-md border-2 border-emce-border bg-emce-light-soft/40 p-3">
        <span className="flex items-start gap-2">
          <input
            type="checkbox"
            name="allowScripts"
            value="true"
            defaultChecked={page?.allowScripts ?? false}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-emce-dark"
          />
          <span>
            <span className="block text-sm font-bold text-emce-text">
              ⚡ Allow scripts on this page (trusted mode)
            </span>
            <span className="mt-0.5 block text-hint text-emce-text-sec">
              Enable for AI tools that need to call <code>/api/ai/proxy</code>. Inline{" "}
              <code>&lt;script&gt;</code> tags will be preserved on save, and the iframe
              will run with <code>allow-same-origin</code> so relative URLs work and same-origin
              fetch needs no CORS handshake. Leave OFF for static pages, posts, or anything you
              didn&apos;t author yourself.
            </span>
          </span>
        </span>
      </label>

      <details className="rounded-md border border-emce-border bg-white p-3">
        <summary className="cursor-pointer text-sm font-bold text-emce-text">
          SEO overrides (optional)
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="metaTitle">Meta title</Label>
            <Input
              id="metaTitle"
              name="metaTitle"
              defaultValue={page?.metaTitle ?? ""}
              placeholder="Defaults to page title"
              maxLength={80}
            />
          </div>
          <div>
            <Label htmlFor="metaDescription">Meta description</Label>
            <Input
              id="metaDescription"
              name="metaDescription"
              defaultValue={page?.metaDescription ?? ""}
              placeholder="Defaults to excerpt"
              maxLength={280}
            />
          </div>
        </div>
      </details>

      {state.message && (
        <div
          role={state.ok ? "status" : "alert"}
          className={`rounded-md border p-3 text-sm ${
            state.ok
              ? "border-emce-success-deep/30 bg-emce-light-soft text-emce-text"
              : "border-emce-red/40 bg-emce-red-light text-emce-red-deep"
          }`}
        >
          {state.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Link
          href="/admin/pages"
          className="text-sm font-bold text-emce-text-sec hover:text-emce-text hover:underline"
        >
          ← Back to pages
        </Link>
        <div className="flex gap-2">
          {isEdit && page && (
            <Link
              href={`/${page.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-md border border-emce-border bg-white px-3 py-1.5 text-sm font-bold text-emce-text hover:bg-emce-light-soft"
            >
              Preview ↗
            </Link>
          )}
          <SubmitButton size="lg">{isEdit ? "Save changes" : "Save as draft"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
