"use client";

import { useActionState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  subscribeHashtag,
  type SubscribeResult,
} from "@/server/social/hashtag-actions";

const INITIAL: SubscribeResult = { ok: false };

/**
 * Single-field form for /me/topics. The server action returns the
 * canonical slug back in `state.tag` — once a successful add lands,
 * we clear the input so the user can immediately type the next one.
 *
 * No optimistic update: the parent page is server-rendered and the
 * action revalidates `/me/topics`, so the chip appears in the list
 * on the same round trip.
 */
export function AddTopicForm() {
  const [state, formAction] = useActionState(subscribeHashtag, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok && inputRef.current) inputRef.current.value = "";
  }, [state.ok, state.tag]);

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2" noValidate>
      <div className="min-w-[200px] flex-1">
        <Input
          ref={inputRef}
          name="tag"
          placeholder="e.g. battery-engineering"
          maxLength={50}
          required
          aria-invalid={state.ok === false && !!state.message}
          aria-describedby={state.message ? "topic-msg" : undefined}
        />
      </div>
      <SubmitButton size="sm">Follow</SubmitButton>
      {state.message && (
        <p
          id="topic-msg"
          role={state.ok ? "status" : "alert"}
          className={`basis-full text-hint ${
            state.ok ? "text-emce-success-deep" : "text-emce-red-deep"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
