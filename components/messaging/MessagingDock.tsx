"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, MessageSquare, Edit3 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface DockItem {
  id: string;
  label: string;
  avatar: string | null;
  lastBody: string;
  lastAt: string;
  unread: boolean;
  href: string;
}

/**
 * LinkedIn-style floating "Messaging" dock. Sits permanently bottom-right
 * on every authenticated page (except inside the messaging routes
 * themselves, where it'd be redundant).
 *
 * Behaviour:
 *   - Collapsed by default — small bar showing "Messaging (N unread)" + chevron.
 *   - Click to expand → list of recent threads with avatar + name + preview.
 *   - State persists in localStorage so it stays open/closed between pages.
 *   - Click a thread → navigate to /me/messages/[id] (which still hides the
 *     dock, see HIDE_PATH_PREFIXES in MessagingWidget.tsx).
 *
 * The whole thing is a single sticky element, not a portal — keeps the DOM
 * tree shallow and avoids the focus-trap mess that comes with full modals.
 */
export function MessagingDock({ items, unreadCount }: { items: DockItem[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);

  // Persist open/closed state across page navigations. localStorage write is
  // best-effort — wrap in try/catch in case the user has it disabled.
  useEffect(() => {
    try {
      const v = localStorage.getItem("emce_msg_dock");
      if (v === "1") setOpen(true);
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("emce_msg_dock", open ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [open]);

  return (
    <div className="fixed bottom-0 right-4 z-30 w-80 max-w-[calc(100vw-2rem)] sm:right-6">
      {/* Header bar — always visible, collapses/expands on click */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg border border-b-0 border-emce-border bg-white px-4 py-2.5 shadow-emce-lg hover:bg-emce-light-soft"
        aria-expanded={open}
        aria-controls="emce-msg-dock-body"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emce-darkest" />
          <span className="text-sm font-bold text-emce-text">Messaging</span>
          {unreadCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emce-mid px-1 text-[10px] font-bold text-emce-darkest">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <Link
            href="/me/messages"
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 hover:bg-emce-light-soft"
            aria-label="Open full messaging"
            title="Open full messaging"
          >
            <Edit3 className="h-4 w-4 text-emce-text-sec" />
          </Link>
          {open ? <ChevronDown className="h-4 w-4 text-emce-text-sec" /> : <ChevronUp className="h-4 w-4 text-emce-text-sec" />}
        </span>
      </button>

      {/* Body — expanded thread list */}
      {open && (
        <div
          id="emce-msg-dock-body"
          className="max-h-[60vh] overflow-y-auto border border-t-0 border-emce-border bg-white shadow-emce-lg"
        >
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-bold text-emce-text">No messages yet</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Conversations from job applications and direct outreach show up here.
              </p>
              <Link
                href="/people"
                className="mt-3 inline-block text-xs font-bold text-emce-dark hover:underline"
              >
                Find people →
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-emce-border">
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-emce-light-soft ${it.unread ? "bg-emce-light-soft/40" : ""}`}
                  >
                    <Avatar src={it.avatar} name={it.label} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm ${it.unread ? "font-bold text-emce-text" : "font-semibold text-emce-text-sec"}`}>
                          {it.label}
                        </span>
                        {it.unread && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emce-mid" aria-label="Unread" />
                        )}
                      </div>
                      {it.lastBody && (
                        <p className={`line-clamp-1 text-xs ${it.unread ? "text-emce-text" : "text-emce-text-sec"}`}>
                          {it.lastBody}
                        </p>
                      )}
                      <p className="text-[10px] text-emce-text-sec">{relTime(it.lastAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-emce-border px-3 py-2 text-center">
            <Link
              href="/me/messages"
              className="text-xs font-bold text-emce-dark hover:underline"
            >
              See all messages →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// Trimmed relative-time helper — doesn't use date-fns to keep the client bundle light.
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}
