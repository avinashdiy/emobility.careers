"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Heading2, Link as LinkIcon, Undo2, Redo2 } from "lucide-react";

/**
 * Lightweight Tiptap-based rich text editor. Used for job
 * description / responsibilities / requirements / benefits in
 * AdminJobForm + EmployerJobForm.
 *
 * Form integration:
 *   The editor's current HTML is mirrored into a hidden
 *   `<input type="hidden" name={name}>` so the surrounding `<form
 *   action={...}>` server action submission picks it up via
 *   `FormData.get(name)`. No client-side change needed in the
 *   server action — it still reads the string field.
 *
 * Paste handling:
 *   StarterKit's defaults preserve common formatting from Word /
 *   Google Docs paste (bold, italic, lists, headings). Unknown
 *   classes / attributes get scrubbed by the schema. The server-
 *   side sanitiser in `lib/cms/job-sanitize.ts` is the final trust
 *   boundary — it runs on every save and discards anything outside
 *   the job-content allowlist.
 *
 * Empty-state guard:
 *   Tiptap defaults to `<p></p>` for an empty editor, which fails
 *   the `description: min(20)` Zod rule. We strip that to a literal
 *   empty string in `onUpdate` so the form's required check trips
 *   instead of trying to validate a single `<p></p>` tag.
 */

interface Props {
  /// Form field name used as the hidden input's `name`.
  name: string;
  /// Initial HTML — comes from `state.prevValues?.<name>` on a
  /// validation-failure round-trip OR from an existing record on
  /// edit pages.
  defaultValue?: string;
  /// Placeholder text rendered until the user types something.
  placeholder?: string;
  /// Optional id mirrored to both the contenteditable + hidden
  /// input so `<Label htmlFor>` works.
  id?: string;
  /// Min-height of the editing area. Defaults to roughly 8 rows.
  minHeight?: number;
  /// Mark the hidden input as required. Tiptap doesn't expose
  /// HTML5 validation directly so this is best-effort — the real
  /// guard is the Zod min() check on the server.
  required?: boolean;
  /// aria-invalid pass-through for the surrounding error styling.
  ariaInvalid?: boolean;
}

const TOOLBAR_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text disabled:opacity-30";

const TOOLBAR_BTN_ACTIVE =
  "inline-flex h-7 w-7 items-center justify-center rounded bg-emce-light-soft text-emce-darkest";

export function RichTextEditor({
  name,
  defaultValue = "",
  placeholder,
  id,
  minHeight = 180,
  required = false,
  ariaInvalid = false,
}: Props) {
  // Mirror the editor's HTML into a hidden input so FormData picks
  // it up. Using a ref keeps each keystroke off React's render path
  // — only the hidden input value updates.
  const hiddenRef = useRef<HTMLInputElement>(null);
  // Track plain-text length for the "required" check.
  const [_isEmpty, setIsEmpty] = useState(!defaultValue);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Start typing…",
      }),
    ],
    content: defaultValue || "",
    // Required for Next.js + SSR — without this, hydration warns
    // about mismatched initial content.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none px-3 py-2.5 text-body text-emce-text",
        style: `min-height: ${minHeight}px`,
      },
    },
    onUpdate({ editor: e }) {
      const html = e.getHTML();
      // Tiptap returns `<p></p>` for a truly empty doc. Treat
      // that as empty for the FormData round-trip so server-side
      // `min()` rules fire correctly.
      const plain = e.getText().trim();
      const empty = plain.length === 0;
      const value = empty ? "" : html;
      if (hiddenRef.current) hiddenRef.current.value = value;
      setIsEmpty(empty);
    },
  });

  // Re-sync the hidden input when defaultValue changes after mount
  // — e.g. when useActionState round-trips prevValues into the
  // editor. Tiptap's `content` prop is initial-only; we have to
  // imperatively setContent for updates.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = defaultValue || "";
    if (next && next !== current) {
      editor.commands.setContent(next, { emitUpdate: false });
      if (hiddenRef.current) hiddenRef.current.value = next;
      setIsEmpty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue, editor]);

  return (
    <div
      className={`overflow-hidden rounded-md border bg-white transition ${
        ariaInvalid
          ? "border-emce-red/60 focus-within:border-emce-red focus-within:ring-2 focus-within:ring-emce-red/20"
          : "border-emce-border focus-within:border-emce-mid focus-within:ring-2 focus-within:ring-emce-mid/20"
      }`}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} id={id} />
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  function addLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL (https://…)", prev ?? "https://");
    if (url === null) return; // user cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    // Auto-prefix bare-domain pastes like "company.com" — same loose
    // rule as the admin job form's URL field.
    const final =
      /^https?:\/\//i.test(url) || /^mailto:/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: final }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-0.5 border-b border-emce-border bg-emce-light-soft/60 px-2 py-1"
    >
      <button
        type="button"
        title="Bold (Cmd/Ctrl + B)"
        aria-label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Italic (Cmd/Ctrl + I)"
        aria-label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive("italic") ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-emce-border" aria-hidden />
      <button
        type="button"
        title="Heading"
        aria-label="Heading"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={editor.isActive("heading", { level: 2 }) ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <Heading2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Bullet list"
        aria-label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive("bulletList") ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Numbered list"
        aria-label="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive("orderedList") ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-emce-border" aria-hidden />
      <button
        type="button"
        title="Link"
        aria-label="Link"
        onClick={addLink}
        className={editor.isActive("link") ? TOOLBAR_BTN_ACTIVE : TOOLBAR_BTN}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-emce-border" aria-hidden />
      <button
        type="button"
        title="Undo (Cmd/Ctrl + Z)"
        aria-label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className={TOOLBAR_BTN}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Redo (Cmd/Ctrl + Shift + Z)"
        aria-label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className={TOOLBAR_BTN}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
