"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { Send, Copy, MessageCircle, Twitter, Linkedin, X as XIcon, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  sharePostViaMessage,
  getMyConnectionsForShare,
} from "@/server/messaging/actions";

interface Props {
  postId: string;
  /** Author's display name for share-link CTAs ("Share Avinash's post"). */
  authorName: string;
  /** Public post URL — used by Copy + native shares. */
  url: string;
}

interface Connection {
  userId: string;
  name: string;
  headline: string | null;
  profilePhotoUrl: string | null;
  slug: string;
}

/**
 * LinkedIn-style "Send" affordance for a feed post. Opens a modal
 * with three things in priority order:
 *
 *   1. Connection picker — pick one or more connections, optional
 *      note, sends as DM via existing Message infra.
 *   2. Copy link / WhatsApp / X — for sharing outside the platform.
 *   3. Native share sheet (mobile) — falls back to copy when
 *      navigator.share is unavailable.
 *
 * Default open state is the picker because that's the thing most
 * users actually want from a "Send" button.
 */
export function SharePostMenu({ postId, authorName, url }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send or share post"
        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-bold text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
      >
        <Send className="h-3.5 w-3.5" />
        <span>Send</span>
      </button>
      {open && (
        <ShareModal
          postId={postId}
          authorName={authorName}
          url={url}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareModal({
  postId,
  authorName,
  url,
  onClose,
}: Props & { onClose: () => void }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pending, startSend] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initial load + debounced search re-load.
  useEffect(() => {
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await getMyConnectionsForShare(q);
        setConnections(list);
      } finally {
        setLoading(false);
      }
    }, q.length > 0 ? 200 : 0);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // Close on Escape; click outside.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  function toggle(userId: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function send() {
    if (selected.size === 0) {
      toast.error("Pick at least one connection.");
      return;
    }
    startSend(async () => {
      const r = await sharePostViaMessage({
        postId,
        recipientIds: [...selected],
        note: note.trim() || undefined,
      });
      if (r.ok) {
        toast.success(`Sent to ${r.sent} connection${r.sent === 1 ? "" : "s"}.`);
        onClose();
      } else {
        toast.error(r.message ?? "Couldn't send.");
      }
    });
  }

  function copyLink() {
    const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(full).then(
      () => toast.success("Link copied to clipboard."),
      () => toast.error("Couldn't copy. Long-press to copy manually."),
    );
  }

  function nativeShare() {
    const full = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: `${authorName}'s post`, url: full }).catch(() => undefined);
    } else {
      copyLink();
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div
        ref={containerRef}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-emce-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emce-border px-4 py-3">
          <h2 id="share-modal-title" className="text-section text-emce-text">
            Send {authorName}&apos;s post
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-emce-border px-4 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emce-text-sec" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search connections…"
              className="h-9 w-full rounded-md bg-emce-light-soft pl-9 pr-3 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-emce-mid"
            />
          </div>
        </div>

        {/* Connection list */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-hint text-emce-text-sec">
              Loading connections…
            </div>
          )}
          {!loading && connections.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-bold text-emce-text">No connections yet</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                {q
                  ? `No matches for "${q}".`
                  : "Connect with people first to send them posts directly."}
              </p>
            </div>
          )}
          {!loading && connections.length > 0 && (
            <ul className="divide-y divide-emce-border">
              {connections.map((c) => {
                const isSelected = selected.has(c.userId);
                return (
                  <li key={c.userId}>
                    <button
                      type="button"
                      onClick={() => toggle(c.userId)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition ${
                        isSelected ? "bg-emce-light-soft" : "hover:bg-emce-light-soft"
                      }`}
                      aria-pressed={isSelected}
                    >
                      <Avatar src={c.profilePhotoUrl} name={c.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-bold text-emce-text">
                          {c.name}
                        </p>
                        {c.headline && (
                          <p className="line-clamp-1 text-hint text-emce-text-sec">
                            {c.headline}
                          </p>
                        )}
                      </div>
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                          isSelected
                            ? "border-emce-darkest bg-emce-darkest text-emce-mid"
                            : "border-emce-border bg-white"
                        }`}
                        aria-hidden
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Note field — visible only once at least one is picked */}
        {selected.size > 0 && (
          <div className="border-t border-emce-border px-4 py-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Add a note (optional)…"
              className="resize-none text-sm"
            />
          </div>
        )}

        {/* Footer: send + secondary share options */}
        <div className="border-t border-emce-border bg-emce-light-bg px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={copyLink}
                title="Copy link"
                className="grid h-8 w-8 place-items-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <Copy className="h-4 w-4" />
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${authorName}'s post: ${url.startsWith("http") ? url : (typeof window !== "undefined" ? window.location.origin + url : url)}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on WhatsApp"
                className="grid h-8 w-8 place-items-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url.startsWith("http") ? url : (typeof window !== "undefined" ? window.location.origin + url : url))}&text=${encodeURIComponent(`${authorName}'s post`)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on X"
                className="grid h-8 w-8 place-items-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url.startsWith("http") ? url : (typeof window !== "undefined" ? window.location.origin + url : url))}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on LinkedIn"
                className="grid h-8 w-8 place-items-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              {/* Native share sheet — appears as a paper-plane on
                  mobile browsers that support navigator.share. */}
              <button
                type="button"
                onClick={nativeShare}
                title="More share options"
                className="grid h-8 w-8 place-items-center rounded text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={send}
              disabled={pending || selected.size === 0}
            >
              {pending
                ? "Sending…"
                : selected.size === 0
                  ? "Pick connections"
                  : `Send to ${selected.size}${selected.size === 1 ? "" : ""}`}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-emce-text-muted">
            Only your <Link href="/me/network" className="font-bold text-emce-dark hover:underline">accepted connections</Link> can receive direct shares.
          </p>
        </div>
      </div>
    </div>
  );
}
