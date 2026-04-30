import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitAnswer } from "@/server/social/answer-actions";
import { AnswerItem } from "@/components/social/AnswerItem";

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
  postId: string;
  questionAuthorId: string;
  answers: AnswerShape[];
  viewerId: string | null;
  /** Set of answer IDs the viewer has already marked helpful. */
  viewerHelpfulIds: Set<string>;
}

/**
 * Quora-style answers panel. Renders below the question post on the
 * post detail page. Each answer row is its own client component
 * (AnswerItem) so the inline edit/save toggle stays local without
 * promoting the whole section to a client tree. Answers are ranked
 * by helpful-count at the query layer.
 */
export function AnswersSection({
  postId,
  questionAuthorId,
  answers,
  viewerId,
  viewerHelpfulIds,
}: Props) {
  const isOwner = viewerId !== null && viewerId === questionAuthorId;

  return (
    <Card id="answers" className="mt-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-section text-emce-text">
          {answers.length} {answers.length === 1 ? "answer" : "answers"}
        </h2>
        {answers.length > 0 && (
          <span className="text-xs text-emce-text-muted">Sorted by helpful votes</span>
        )}
      </div>

      {/* Submit form — signed-in viewers only, and never the asker.
          Anonymous viewers see a sign-in CTA instead. */}
      {viewerId && !isOwner && (
        <form action={submitAnswer} className="mt-4 space-y-2">
          <input type="hidden" name="postId" value={postId} />
          <Textarea
            name="body"
            required
            minLength={20}
            maxLength={20_000}
            rows={5}
            placeholder="Share your answer. Be specific — what worked, what didn't, what you'd recommend."
            className="text-sm"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm">Post answer</Button>
          </div>
        </form>
      )}
      {!viewerId && (
        <div className="mt-4 rounded-md border border-emce-border bg-emce-light-soft p-3 text-sm text-emce-text-sec">
          <Link href={`/signin?next=/posts/${postId}`} className="font-bold text-emce-dark hover:underline">
            Sign in
          </Link>{" "}
          to post an answer.
        </div>
      )}
      {isOwner && (
        <p className="mt-4 text-hint text-emce-text-muted">
          You&apos;re the asker — you can&apos;t answer your own question. Watch this thread for replies.
        </p>
      )}

      {/* Answer list */}
      <ul className="mt-5 space-y-4">
        {answers.map((a) => (
          <AnswerItem
            key={a.id}
            answer={a}
            viewerId={viewerId}
            hasVoted={viewerHelpfulIds.has(a.id)}
          />
        ))}
      </ul>

      {answers.length === 0 && viewerId && !isOwner && (
        <p className="mt-5 text-hint text-emce-text-muted">
          Be the first to answer.
        </p>
      )}
    </Card>
  );
}
