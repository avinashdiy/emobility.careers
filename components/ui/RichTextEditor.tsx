"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useState } from "react";
import { Bold, Italic, List, ListOrdered, Heading2, Link as LinkIcon, Undo2, Redo2 } from "lucide-react";

/**
 * Lightweight Tiptap-based rich text editor. Used for job
 * description / responsibilities / requirements / benefits in
 * AdminJobForm + EmployerJobForm.
 *
 * Form integration — CONTROLLED hidden input:
 *   The editor's current HTML lives in React state (`value`) and
 *   that state drives a hidden `<input type="hidden" name={name}
 *   value={value} readOnly>` so the form submit's FormData read
 *   always reflects the latest editor content.
 *
 *   The previous implementation used an imperative
 *   `hiddenRef.current.value = ...` write inside Tiptap's
 *   `onUpdate`. That pattern silently desynced from React's
 *   view under a few real-world race conditions:
 *     • a sibling component's re-render between onUpdate and
 *       form submit could cause React to reconcile the input
 *       to the original `defaultValue` it remembered.
 *     • paste events from Word/Google Docs that produced large
 *       transactions sometimes ran after the user's submit
 *       click on slower machines.
 *     • re-mounting the editor (key change, conditional render)
 *       reset the DOM value but not the new editor instance.
 *
 *   Result: form would submit with an empty `description` even
 *   though the user could see their content on screen, and the
 *   server would reject with "must be at least 20 chars". The
 *   user-reported bug.
 *
 *   Controlling the input via React state closes every one of
 *   those race conditions — the value the form serialises is
 *   the value React is rendering, by definition.
 *
 * Paste handling:
 *   StarterKit preserves common formatting from Word / Google
 *   Docs paste (bold, italic, lists, headings). Unknown classes
 *   / attributes get scrubbed. The server-side sanitiser in
 *   `lib/cms/job-sanitize.ts` is the final trust boundary.
 *
 * Empty-state guard:
 *   Tiptap returns `<p></p>` for an empty doc — we collapse that
 *   to "" before storing so the server-side "non-empty" check
 *   trips correctly. The real "≥20 readable characters" gate
 *   runs server-side on plain-text length, not HTML length.
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
  /// Visually mark the field as required (for ARIA + the Label
  /// component) — we do NOT set HTML5 `required` on the hidden
  /// input because Chrome's validation tries to focus a hidden
  /// field, fails silently, and leaves the form in a half-
  /// submitted state. The real "required" gate is server-side.
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
  required: _required = false,
  ariaInvalid = false,
}: Props) {
  // Single source of truth for the hidden input. Tiptap's onUpdate
  // pushes into this state; the JSX renders the state into the
  // hidden input's `value` (CONTROLLED). When the form serialises,
  // FormData reads from the DOM, and the DOM value is whatever
  // React last rendered — by definition the latest onUpdate result.
  const [value, setValue] = useState<string>(defaultValue);

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
      // Tiptap returns `<p></p>` for a truly empty doc — collapse
      // that to "" so the server's "non-empty" check fires
      // correctly. The plain-text length gate that enforces the
      // "≥ 20 readable characters" rule runs server-side against
      // the sanitised HTML, not against this value.
      const plain = e.getText().trim();
      setValue(plain.length === 0 ? "" : html);
    },
  });

  // External defaultValue change (validation-failure round-trip,
  // edit-page initial load). Sync both the editor's rendered
  // content and the controlled value. `emitUpdate: false` avoids
  // a feedback loop where setContent → onUpdate → setValue →
  // re-render → useEffect → setContent.
  useEffect(() => {
    if (!editor) return;
    if (defaultValue === editor.getHTML()) return;
    editor.commands.setContent(defaultValue || "", { emitUpdate: false });
    setValue(defaultValue || "");
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
      {/* Controlled hidden input — `readOnly` suppresses React's
          "controlled input without onChange" warning. We deliberately
          do NOT set HTML5 `required` here even when the field is
          required: Chrome's validation tries to focus a hidden
          input and silently fails, leaving the form half-submitted.
          The real required-check runs server-side in the action. */}
      <input
        type="hidden"
        name={name}
        value={value}
        readOnly
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
