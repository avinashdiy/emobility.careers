"use client";

import { useState, useTransition } from "react";
import { togglePostReaction } from "@/server/social/actions";
import type { ReactionType } from "@prisma/client";
import { cn } from "@/lib/utils";

const REACTIONS: { type: ReactionType; emoji: string; label: string; color: string }[] = [
  { type: "LIKE", emoji: "👍", label: "Like", color: "text-blue-600" },
  { type: "CELEBRATE", emoji: "🎉", label: "Celebrate", color: "text-emce-mid-muted" },
  { type: "SUPPORT", emoji: "💚", label: "Support", color: "text-emce-mid" },
  { type: "INSIGHTFUL", emoji: "💡", label: "Insightful", color: "text-amber-500" },
  { type: "FUNNY", emoji: "😂", label: "Funny", color: "text-amber-400" },
  { type: "LOVE", emoji: "❤️", label: "Love", color: "text-rose-500" },
];

const EMOJI_BY_TYPE: Record<string, { emoji: string; label: string; color: string }> = Object.fromEntries(
  REACTIONS.map((r) => [r.type, { emoji: r.emoji, label: r.label, color: r.color }]),
);

export function ReactionBar({
  postId,
  initialReaction,
  count,
}: {
  postId: string;
  initialReaction: ReactionType | null;
  count: number;
}) {
  const [active, setActive] = useState<ReactionType | null>(initialReaction);
  const [c, setC] = useState(count);
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();

  function react(type: ReactionType) {
    const prev = active;
    const prevCount = c;
    // Optimistic update
    if (prev === type) {
      setActive(null);
      setC((x) => Math.max(0, x - 1));
    } else if (prev) {
      setActive(type);
      // count unchanged on switch
    } else {
      setActive(type);
      setC((x) => x + 1);
    }
    setOpen(false);

    const fd = new FormData();
    fd.append("postId", postId);
    fd.append("type", type);
    start(async () => {
      try {
        await togglePostReaction(fd);
      } catch {
        setActive(prev);
        setC(prevCount);
      }
    });
  }

  const display = active ? EMOJI_BY_TYPE[active] : EMOJI_BY_TYPE.LIKE;

  return (
    <div
      className="relative inline-block"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => react(active ?? "LIKE")}
        onMouseEnter={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-bold hover:bg-emce-light-soft",
          active ? display.color : "text-emce-text-sec",
        )}
        aria-label={active ? `Remove ${display.label.toLowerCase()}` : "React"}
      >
        <span className="text-base">{display.emoji}</span>
        <span>{active ? display.label : "Like"}</span>
        {c > 0 && <span className="text-emce-text-muted">· {c}</span>}
      </button>

      {open && (
        <div
          className="absolute -top-12 left-0 z-20 flex items-center gap-1 rounded-full border border-emce-border bg-white px-2 py-1 shadow-emce-modal"
          onMouseEnter={() => setOpen(true)}
        >
          {REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              onClick={() => react(r.type)}
              aria-label={r.label}
              className="grid h-9 w-9 place-items-center rounded-full text-2xl transition-transform hover:scale-125"
              title={r.label}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
