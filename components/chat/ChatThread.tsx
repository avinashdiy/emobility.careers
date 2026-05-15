"use client";

import { useEffect, useRef, useState } from "react";
import PusherClient from "pusher-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/server/messaging/actions";
import { draftInMail } from "@/server/messaging/draft";

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
        const incoming: ChatMessage = { ...m, readAt: m.readAt ?? null };
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
                  <div
                    className={`rounded-lg p-3 text-body ${
                      mine ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-text"
                    }`}
                  >
                    {m.body}
                  </div>
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
          await sendMessage(fd);
          setDraft("");
          setSending(false);
        }}
        className="border-t border-emce-border p-3"
      >
        <Textarea
          name="body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Type a message..."
          required
          maxLength={4000}
        />
        {draftError && (
          <p className="mt-1 text-hint text-emce-red-deep">⚠ {draftError}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {/* Wave B #18 — AI draft button. Replaces the textarea
              contents (after a confirm if the recruiter already
              started typing) with a personalised first-touch the
              recruiter can review + tweak. Server action infers
              role + company + candidate from the threadId. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={drafting || sending}
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
          <Button type="submit" disabled={!draft.trim() || sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
