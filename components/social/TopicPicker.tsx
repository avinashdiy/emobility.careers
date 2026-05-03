"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { prettifyHashtag } from "@/lib/social/hashtag";
import { completeOnboardingTopics } from "@/server/social/hashtag-actions";

/**
 * Multi-select chip grid for the onboarding "pick topics" step.
 * Selection state is local — the form serialises every selected
 * tag as a `tag` value when submitted, so the server action
 * handler reads them via `formData.getAll("tag")`.
 *
 * Caps selection at 12 to nudge a focused topic set; over-picking
 * dilutes the For-you feed and the user can always add more from
 * /me/topics later.
 */
const MAX_SELECT = 12;

interface Props {
  suggestions: string[];
}

export function TopicPicker({ suggestions }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else if (next.size < MAX_SELECT) {
        next.add(tag);
      }
      return next;
    });
  }

  return (
    <form action={completeOnboardingTopics} className="space-y-5">
      <div role="group" aria-label="Suggested topics" className="flex flex-wrap gap-2">
        {suggestions.map((tag) => {
          const isOn = selected.has(tag);
          return (
            <label key={tag} className="cursor-pointer">
              <input
                type="checkbox"
                name="tag"
                value={tag}
                checked={isOn}
                onChange={() => toggle(tag)}
                className="peer sr-only"
                disabled={!isOn && selected.size >= MAX_SELECT}
              />
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-bold transition ${
                  isOn
                    ? "border-emce-dark bg-emce-dark text-white"
                    : "border-emce-border bg-white text-emce-text hover:border-emce-mid hover:bg-emce-light-soft"
                } peer-disabled:cursor-not-allowed peer-disabled:opacity-50`}
              >
                {isOn ? "✓ " : "+ "}#{tag}
                <span className="ml-1.5 hidden text-[10px] font-normal opacity-70 sm:inline">
                  {prettifyHashtag(tag)}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-hint text-emce-text-sec">
        {selected.size === 0
          ? "Pick at least one — or skip and come back later."
          : `${selected.size} selected${selected.size === MAX_SELECT ? " (max reached)" : ""}.`}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <Link href="/me" className="text-sm font-bold text-emce-text-sec hover:text-emce-text hover:underline">
          Skip for now →
        </Link>
        <Button type="submit" size="lg">
          {selected.size === 0 ? "Finish" : `Follow ${selected.size} & finish`}
        </Button>
      </div>
    </form>
  );
}
