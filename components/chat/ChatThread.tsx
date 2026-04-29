"use client";

import { useEffect, useRef, useState } from "react";
import PusherClient from "pusher-js";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/server/messaging/actions";

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface Props {
  threadId: string;
  initialMessages: ChatMessage[];
  selfUserId: string;
  pusherKey: string;
  pusherHost: string;
  pusherPort: number;
}

export function ChatThread({
  threadId,
  initialMessages,
  selfUserId,
  pusherKey,
  pusherHost,
  pusherPort,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pusher: PusherClient | null = null;
    try {
      pusher = new PusherClient(pusherKey, {
        wsHost: pusherHost,
        wsPort: pusherPort,
        wssPort: pusherPort,
        forceTLS: false,
        enabledTransports: ["ws", "wss"],
        cluster: "soketi",
        channelAuthorization: {
          endpoint: "/api/realtime/auth",
          transport: "ajax",
        },
      });
      const ch = pusher.subscribe(`private-thread-${threadId}`);
      ch.bind("message", (m: ChatMessage) => {
        setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
      });
    } catch {
      // Soketi may be offline — degrade gracefully
    }
    return () => {
      pusher?.disconnect();
    };
  }, [threadId, pusherKey, pusherHost, pusherPort]);

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
                  <div className="mt-1 text-hint text-emce-text-muted">
                    {new Date(m.createdAt).toLocaleString()}
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
          rows={2}
          placeholder="Type a message..."
          required
          maxLength={4000}
        />
        <div className="mt-2 flex justify-end">
          <Button type="submit" disabled={!draft.trim() || sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
