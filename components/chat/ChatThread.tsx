"use client";

import { useEffect, useRef, useState } from "react";
import PusherClient from "pusher-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage, presignAttachmentDownload } from "@/server/messaging/actions";
import { draftInMail } from "@/server/messaging/draft";

/** Per-attachment metadata stored on Message.attachments (JSON). */
export interface ChatAttachment {
  key: string;
  name: string;
  contentType: string;
  size: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  /** When the recipient last opened the thread (Message.readAt).
      Drives the per-message "Sent ✓ / Seen ✓✓" status indicator on
      outgoing messages. Null on messages the recipient hasn't yet
      viewed. The thread page marks incoming-unread → read on load. */
  readAt: string | null;
  attachments?: ChatAttachment[];
}

const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const MAX_TOTAL_BYTES_PER_MESSAGE = 10 * 1024 * 1024; // 10 MB
const ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".zip",
].join(",");

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

interface Props {
  threadId: string;
  initialMessages: ChatMessage[];
  selfUserId: string;
  pusherKey: string;
  pusherHost: string;
  pusherPort: number;
  /** True in production where Caddy fronts Soketi on WSS via the
      `realtime.` subdomain. False locally where Soketi binds plain
      ws://localhost:6001. Mismatched against the page protocol the
      browser silently refuses the upgrade — that's how the prod
      build ended up hammering wss://localhost:6001 forever. */
  pusherTls: boolean;
}

export function ChatThread({
  threadId,
  initialMessages,
  selfUserId,
  pusherKey,
  pusherHost,
  pusherPort,
  pusherTls,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // Wave B #18 — AI-draft button state. `drafting` shows the spinner
  // on the button; `draftError` surfaces a 1-line error when the
  // server action returns ok=false (rate-limit, missing application,
  // OpenAI flake) so the recruiter knows to write it themselves
  // rather than wonder why nothing happened.
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  // Files staged for upload on the next send. The hidden <input
  // type="file"> + the visible "Attach" button both feed this state;
  // the form action appends them to FormData as `attachment` entries.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pusher: PusherClient | null = null;
    try {
      pusher = new PusherClient(pusherKey, {
        wsHost: pusherHost,
        wsPort: pusherPort,
        wssPort: pusherPort,
        forceTLS: pusherTls,
        // Restrict to the matching transport so the lib doesn't try
        // to upgrade plaintext on a TLS host (or vice-versa) and
        // burn three retries before failing.
        enabledTransports: pusherTls ? ["wss"] : ["ws"],
        cluster: "soketi",
        channelAuthorization: {
          endpoint: "/api/realtime/auth",
          transport: "ajax",
        },
      });
      const ch = pusher.subscribe(`private-thread-${threadId}`);
      ch.bind("message", (m: ChatMessage) => {
        // Default readAt to null for live-arrived messages (recipient
        // hasn't opened the thread on the other end yet — the server's
        // mark-as-read pass runs on page load, not on every push).
        // attachments preserved as-is so the live render shows pills
        // immediately rather than waiting for a refresh.
        const incoming: ChatMessage = {
          ...m,
          readAt: m.readAt ?? null,
          attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
        };
        setMessages((prev) => (prev.find((x) => x.id === incoming.id) ? prev : [...prev, incoming]));
      });
      // When the OTHER side opens the thread, the server fires a
      // `read` event here so our outgoing messages can flip ✓ → ✓✓
      // without a refresh.
      ch.bind("read", (payload: { at: string; byUserId: string }) => {
        if (payload.byUserId === selfUserId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === selfUserId && !m.readAt
              ? { ...m, readAt: payload.at }
              : m,
          ),
        );
      });
    } catch {
      // Soketi may be offline — degrade gracefully
    }
    return () => {
      pusher?.disconnect();
    };
  }, [threadId, pusherKey, pusherHost, pusherPort, pusherTls]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-[60dvh] min-h-[400px] flex-col rounded-lg border border-emce-border bg-white sm:h-[calc(100dvh-14rem)]">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-hint text-emce-text-muted">
            No messages yet — say hello.
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m) => {
              const mine = m.senderId === selfUserId;
              return (
                <li key={m.id} className={mine ? "ml-auto max-w-[75%]" : "max-w-[75%]"}>
                  {m.body.length > 0 && (
                    <div
                      className={`rounded-lg p-3 text-body ${
                        mine ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-text"
                      }`}
                    >
                      {m.body}
                    </div>
                  )}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className={`${m.body.length > 0 ? "mt-2" : ""} flex flex-col gap-2`}>
                      {m.attachments.map((att) => (
                        <AttachmentTile
                          key={att.key}
                          attachment={att}
                          threadId={threadId}
                          mine={mine}
                        />
                      ))}
                    </div>
                  )}
                  <div className={`mt-1 flex items-center gap-1 text-hint text-emce-text-muted ${mine ? "justify-end" : ""}`}>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                    {/* WhatsApp-style status indicator — only on
                        outgoing messages. ✓ = sent (server has the
                        row), ✓✓ = seen (recipient opened the thread).
                        We don't have a separate "delivered" signal in
                        the schema; the row creation IS the delivery
                        signal because Soketi push and DB insert
                        happen in the same server action. */}
                    {mine && (
                      <span
                        title={m.readAt ? `Seen ${new Date(m.readAt).toLocaleString()}` : "Sent"}
                        className={m.readAt ? "font-bold text-emce-dark" : ""}
                        aria-label={m.readAt ? "Seen" : "Sent"}
                      >
                        {m.readAt ? "✓✓" : "✓"}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={scrollRef} />
      </div>

      <form
        action={async (fd) => {
          setSending(true);
          fd.append("threadId", threadId);
          // Append staged files. The server action reads them via
          // formData.getAll("attachment"), so each gets the same key.
          for (const f of pendingFiles) {
            fd.append("attachment", f);
          }
          await sendMessage(fd);
          setDraft("");
          setPendingFiles([]);
          setAttachmentError(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setSending(false);
        }}
        className="border-t border-emce-border p-3"
      >
        <Textarea
          name="body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder={pendingFiles.length > 0 ? "Add a message (optional)…" : "Type a message..."}
          maxLength={4000}
        />
        {/* Staged-attachments preview row. Each chip shows the name,
            size, and an ✕ to remove. Removing clears the file from
            local state only — nothing has been uploaded yet at this
            point; uploads happen inside sendMessage. */}
        {pendingFiles.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-full border border-emce-border bg-emce-light-soft/60 py-1 pl-3 pr-1 text-hint text-emce-text"
              >
                <span aria-hidden>{isImage(f.type) ? "🖼" : "📎"}</span>
                <span className="max-w-[160px] truncate font-bold" title={f.name}>{f.name}</span>
                <span className="text-emce-text-muted">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPendingFiles((prev) => prev.filter((_, idx) => idx !== i));
                    setAttachmentError(null);
                  }}
                  className="grid h-5 w-5 place-items-center rounded-full text-emce-text-sec hover:bg-emce-border hover:text-emce-text"
                  aria-label={`Remove ${f.name}`}
                  disabled={sending}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachmentError && (
          <p className="mt-1 text-hint text-emce-red-deep" role="alert">⚠ {attachmentError}</p>
        )}
        {/* Live region for AI-draft status + errors. Both the "Drafting…"
            transition and the "Couldn't draft" failure are otherwise
            silent for screen-reader users — the button label flips but
            SRs don't re-read disabled buttons reliably. */}
        <div role="status" aria-live="polite" className="sr-only">
          {drafting ? "Drafting AI message…" : draftError ? `Draft failed: ${draftError}` : ""}
        </div>
        {draftError && (
          <p className="mt-1 text-hint text-emce-red-deep" role="alert">⚠ {draftError}</p>
        )}
        {/* Hidden file input — the visible "Attach" button proxies
            clicks to it via the ref. multiple + accept= constrain the
            picker dialog on the OS side; we still re-validate
            client-side below before staging, and the server validates
            again on submit (defence in depth). */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const incoming = Array.from(e.target.files ?? []);
            if (incoming.length === 0) return;
            const combined = [...pendingFiles, ...incoming];
            if (combined.length > MAX_ATTACHMENTS_PER_MESSAGE) {
              setAttachmentError(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`);
              // Reset the input so re-selecting the same file fires onChange again.
              if (fileInputRef.current) fileInputRef.current.value = "";
              return;
            }
            const total = combined.reduce((s, f) => s + f.size, 0);
            if (total > MAX_TOTAL_BYTES_PER_MESSAGE) {
              setAttachmentError("Attachments total over 10 MB. Compress or split into multiple messages.");
              if (fileInputRef.current) fileInputRef.current.value = "";
              return;
            }
            setAttachmentError(null);
            setPendingFiles(combined);
            // Reset so picking the same file twice in a row still fires onChange.
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {/* Wave B #18 — AI draft button. Replaces the textarea
              contents (after a confirm if the recruiter already
              started typing) with a personalised first-touch the
              recruiter can review + tweak. Server action infers
              role + company + candidate from the threadId. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sending || pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              title={
                pendingFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  ? `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files`
                  : "Attach files"
              }
            >
              📎 Attach
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={drafting || sending}
              aria-busy={drafting || undefined}
              onClick={async () => {
                if (draft.trim().length > 0) {
                  const ok = window.confirm("Replace your current draft with an AI-generated message?");
                  if (!ok) return;
                }
                setDrafting(true);
                setDraftError(null);
                try {
                  const fd = new FormData();
                  fd.append("threadId", threadId);
                  const res = await draftInMail(fd);
                  if (res.ok && res.body) {
                    setDraft(res.body);
                  } else {
                    setDraftError(res.error ?? "Couldn't draft — try again.");
                  }
                } catch {
                  setDraftError("Couldn't draft — try again.");
                } finally {
                  setDrafting(false);
                }
              }}
            >
              {drafting ? "Drafting…" : "✨ Draft with AI"}
            </Button>
          </div>
          <Button
            type="submit"
            disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * Single attachment in a rendered message. Images render as an inline
 * thumbnail; everything else as a pill with icon + name + size. On
 * click, we ask the server for a 5-minute presigned URL (since we
 * never bake URLs into the page HTML — see presignAttachmentDownload's
 * comment block). Failures land a short inline error.
 */
function AttachmentTile({
  attachment,
  threadId,
  mine,
}: {
  attachment: ChatAttachment;
  threadId: string;
  mine: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // For images, fetch the presigned URL once on first render so the
  // thumbnail shows inline. Non-images defer to click — no point
  // burning a presign every page load on files no one opens.
  useEffect(() => {
    if (!isImage(attachment.contentType) || previewUrl || previewError) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await presignAttachmentDownload(threadId, attachment.key);
        if (cancelled) return;
        if (res.url) setPreviewUrl(res.url);
        else setPreviewError(true);
      } catch {
        if (!cancelled) setPreviewError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attachment.contentType, attachment.key, previewUrl, previewError, threadId]);

  const open = async () => {
    setLoading(true);
    setOpenError(null);
    try {
      const res = await presignAttachmentDownload(threadId, attachment.key);
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        setOpenError("Can't open this file.");
      }
    } catch {
      setOpenError("Can't open this file.");
    } finally {
      setLoading(false);
    }
  };

  if (isImage(attachment.contentType)) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={open}
          disabled={loading}
          className="block overflow-hidden rounded-lg border border-emce-border bg-emce-light-soft/40 transition hover:border-emce-mid"
          title={`${attachment.name} · ${formatBytes(attachment.size)}`}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={attachment.name}
              className="max-h-60 w-auto object-cover"
              loading="lazy"
            />
          ) : previewError ? (
            <div className="grid h-32 w-full place-items-center text-hint text-emce-text-muted">
              Preview unavailable — click to open
            </div>
          ) : (
            <div className="grid h-32 w-full place-items-center text-hint text-emce-text-muted">
              Loading preview…
            </div>
          )}
        </button>
        {openError && (
          <p className="text-hint text-emce-red-deep" role="alert">{openError}</p>
        )}
      </div>
    );
  }

  // Non-image — pill with icon + filename + size + click to open.
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className={`flex items-center gap-2 rounded-lg border border-emce-border p-3 text-left transition hover:border-emce-mid ${
          mine ? "bg-emce-dark/10" : "bg-emce-light-soft/60"
        }`}
        title={attachment.name}
      >
        <span aria-hidden className="text-xl">📄</span>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-bold text-emce-text">{attachment.name}</div>
          <div className="text-hint text-emce-text-muted">{formatBytes(attachment.size)}</div>
        </div>
        <span aria-hidden className="text-hint font-bold text-emce-dark">
          {loading ? "…" : "↓"}
        </span>
      </button>
      {openError && (
        <p className="text-hint text-emce-red-deep" role="alert">{openError}</p>
      )}
    </div>
  );
}
