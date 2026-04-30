"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { relativeTime } from "@/lib/utils";
import {
  toggleAnswerHelpful,
  deleteAnswer,
  editAnswerWithState,
} from "@/server/social/answer-actions";

interface AnswerShape {
  id: string;
  body: string;
  helpfulCount: number;
  createdAt: Date;
  authorId: string;
  author: {
    id: string;
    name: string | null;
    candidateProfile: {
      slug: string;
      firstName: string;
      lastName: string | null;
      headline: string | null;
      profilePhotoUrl: string | null;
    } | null;
  };
}

interface Props {
  answer: AnswerShape;
  viewerId: string | null;
  hasVoted: boolean;
}

/**
 * One row in the answers list. Authors get an inline "Edit" toggle
 * that swaps the body text for a textarea + Save/Cancel without a
 * full-page navigation. Edits go through the typed
 * `editAnswerWithState` action so we can surface validation errors
 * via toast (HTML5 minLength catches most cases client-side first).
 */
export function AnswerItem({ answer, viewerId, hasVoted }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(answer.body);
  const [pending, startTransition] = useTransition();

  const giver = answer.author.candidateProfile;
  const giverName = giver
    ? `${giver.firstName} ${giver.lastName ?? ""}`.trim()
    : answer.author.name ?? "Someone";
  const isAuthor = viewerId === answer.authorId;

  function saveEdit() {
    if (body.trim().length < 20) {
      toast.error("Answer must be at least 20 characters.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", answer.id);
      fd.set("body", body);
      const r = await editAnswerWithState(fd);
      if (r.ok) {
        toast.success("Answer updated.");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(r.message ?? "Couldn't update.");
      }
    });
  }

  return (
    <li id={`answer-${answer.id}`} className="rounded-md border border-emce-border bg-white p-4">
      <div className="flex items-start gap-3">
        {giver ? (
          <Link href={`/${giver.slug}`} className="shrink-0">
            <Avatar src={giver.profilePhotoUrl} name={giverName} size="sm" />
          </Link>
        ) : (
          <Avatar name={giverName} size="sm" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {giver ? (
              <Link
                href={`/${giver.slug}`}
                className="font-bold text-emce-text hover:underline"
              >
                {giverName}
              </Link>
            ) : (
              <span className="font-bold text-emce-text">{giverName}</span>
            )}
            {giver?.headline && (
              <span className="line-clamp-1 text-hint text-emce-text-sec">
                {giver.headline}
              </span>
            )}
          </div>
          <p className="text-hint text-emce-text-muted">{relativeTime(answer.createdAt)}</p>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            minLength={20}
            maxLength={20_000}
            className="text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setBody(answer.body);
                setEditing(false);
              }}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveEdit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-line text-body text-emce-text">{answer.body}</p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-emce-border pt-3">
        {viewerId && !isAuthor && (
          <form action={toggleAnswerHelpful}>
            <input type="hidden" name="answerId" value={answer.id} />
            <Button
              type="submit"
              size="sm"
              variant={hasVoted ? "default" : "outline"}
            >
              <ThumbsUp className="mr-1 h-3.5 w-3.5" />
              {hasVoted ? "Helpful" : "Mark helpful"} ({answer.helpfulCount})
            </Button>
          </form>
        )}
        {(!viewerId || isAuthor) && (
          <span className="text-hint text-emce-text-muted">
            <ThumbsUp className="mr-1 inline h-3.5 w-3.5" />
            {answer.helpfulCount} helpful
          </span>
        )}
        {isAuthor && !editing && (
          <div className="ml-auto flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <form action={deleteAnswer}>
              <input type="hidden" name="id" value={answer.id} />
              <Button type="submit" size="sm" variant="ghost">
                Delete
              </Button>
            </form>
          </div>
        )}
      </div>
    </li>
  );
}
