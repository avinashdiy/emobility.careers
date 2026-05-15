"use client";

import { useState, useTransition } from "react";
import { voteOnPoll, closePoll } from "@/server/social/rich-post-actions";

/**
 * In-feed poll card. Two display states:
 *   - Voting: option list with radio (single-choice) or checkbox (multi).
 *   - Results: bars with percentage + total-votes line.
 *
 * The viewer flips into "results" automatically once they vote, *or* once
 * the poll closes. Re-vote is allowed for single-choice polls (the action
 * clears prior votes); multi-choice toggles each option independently.
 */
export interface PollCardProps {
  poll: {
    id: string;
    question: string;
    closesAt: Date | string;
    multipleChoice: boolean;
    totalVotes: number;
    options: { id: string; text: string; votes: number; order: number }[];
  };
  /** Option ids the viewer has already voted on (empty if not voted). */
  viewerVotes: string[];
  /** True if viewer authored the post — surfaces the "Close" link. */
  isAuthor: boolean;
}

export function PollCard({ poll, viewerVotes, isAuthor }: PollCardProps) {
  const closesAt = typeof poll.closesAt === "string" ? new Date(poll.closesAt) : poll.closesAt;
  const closed = closesAt.getTime() < Date.now();
  const [picked, setPicked] = useState<string[]>(viewerVotes);
  const [voted, setVoted] = useState(viewerVotes.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const showResults = voted || closed;

  function toggle(id: string) {
    if (voted) return;
    if (poll.multipleChoice) {
      setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    } else {
      setPicked([id]);
    }
  }

  async function submit() {
    if (picked.length === 0) {
      setError("Pick an option.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("pollId", poll.id);
    for (const id of picked) fd.append("optionId", id);
    startTransition(async () => {
      const res = await voteOnPoll(fd);
      if (res.ok) setVoted(true);
      else setError(res.message ?? "Couldn't record your vote.");
    });
  }

  async function close() {
    if (!confirm("Close this poll? Voting will stop immediately.")) return;
    const fd = new FormData();
    fd.set("pollId", poll.id);
    startTransition(async () => {
      await closePoll(fd);
    });
  }

  return (
    <div className="mt-3 rounded-md border border-emce-border bg-white p-3">
      <p className="text-sm font-bold text-emce-text">{poll.question}</p>

      <ul className="mt-3 space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.totalVotes > 0 ? Math.round((o.votes / poll.totalVotes) * 100) : 0;
          const checked = picked.includes(o.id);
          if (showResults) {
            const mine = viewerVotes.includes(o.id);
            return (
              <li key={o.id} className="relative">
                <div className="relative h-9 overflow-hidden rounded-md border border-emce-border bg-emce-light-soft">
                  <div
                    className={`absolute inset-y-0 left-0 ${mine ? "bg-emce-mid/40" : "bg-emce-light"}`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex h-full items-center justify-between px-2.5 text-sm">
                    <span className={`truncate ${mine ? "font-bold text-emce-text" : "text-emce-text"}`}>
                      {o.text}
                      {mine && <span className="ml-1 text-emce-dark">✓</span>}
                    </span>
                    <span className="ml-2 font-bold text-emce-text-sec">{pct}%</span>
                  </div>
                </div>
              </li>
            );
          }
          return (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-emce-border px-2.5 py-2 text-sm hover:border-emce-mid hover:bg-emce-light-soft">
                <input
                  type={poll.multipleChoice ? "checkbox" : "radio"}
                  name="poll-option"
                  className="h-4 w-4 accent-emce-dark"
                  checked={checked}
                  onChange={() => toggle(o.id)}
                />
                <span className="flex-1 text-emce-text">{o.text}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex items-center justify-between text-hint text-emce-text-sec">
        <span>
          {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
          {" · "}
          {closed ? "Closed" : `Closes ${closesAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`}
        </span>
        <div className="flex items-center gap-2">
          {!showResults && (
            <button
              type="button"
              onClick={submit}
              disabled={pending || picked.length === 0}
              className="rounded-full bg-emce-dark px-3 py-1 text-xs font-bold text-white hover:bg-emce-darkest disabled:opacity-50"
            >
              {pending ? "Voting…" : "Vote"}
            </button>
          )}
          {isAuthor && !closed && (
            <button
              type="button"
              onClick={close}
              className="text-xs font-bold text-emce-text-sec hover:underline"
            >
              Close poll
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-hint text-emce-red-deep">{error}</p>}
    </div>
  );
}
