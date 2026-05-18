import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postDiscussionReply } from "@/server/discussions/actions";
import { relativeTime } from "@/lib/utils";

/**
 * Per-thread discussion page renderer. Shows the thread body + a
 * threaded reply list (nested via parentReplyId), with a reply form
 * at the bottom for signed-in users.
 *
 * One-level nesting in v1 — Reddit-style infinitely-nested replies
 * are a UX nightmare on mobile; flat-with-mention is usually enough.
 * Replies surface their parentReplyId as a "Reply to @author" badge
 * so the threading is still visible without indentation chaos.
 */

export interface ThreadHero {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  upvoteCount: number;
  replyCount: number;
  authorName: string;
  authorSlug: string | null;
}

export interface ReplyItem {
  id: string;
  body: string;
  createdAt: Date;
  upvoteCount: number;
  parentReplyId: string | null;
  authorName: string;
  authorSlug: string | null;
}

interface Props {
  /// Public URL prefix back to the entity tab.
  entityHref: string;
  entityName: string;
  thread: ThreadHero;
  replies: ReplyItem[];
  isSignedIn: boolean;
}

export function DiscussionThreadView({
  entityHref,
  entityName,
  thread,
  replies,
  isSignedIn,
}: Props) {
  // Build a map for parent lookups so a reply's "in reply to @x"
  // line resolves without an extra DB hit.
  const replyById = new Map(replies.map((r) => [r.id, r]));

  return (
    <main className="container max-w-3xl py-8 md:py-10">
      <Link
        href={`${entityHref}?tab=discuss`}
        className="text-hint font-bold text-emce-dark hover:underline"
      >
        ← Back to {entityName} · Discussion
      </Link>

      <article className="mt-4">
        <Card className="p-5">
          <header className="flex items-start gap-3">
            <Avatar name={thread.authorName} size="sm" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold tracking-tight text-emce-text md:text-2xl">
                {thread.title}
              </h1>
              <p className="mt-1 text-hint text-emce-text-sec">
                {thread.authorSlug ? (
                  <Link href={`/${thread.authorSlug}`} className="font-bold hover:underline">
                    {thread.authorName}
                  </Link>
                ) : (
                  thread.authorName
                )}{" "}
                · {relativeTime(thread.createdAt)} ·{" "}
                {thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"}
                {thread.upvoteCount > 0 && ` · ↑ ${thread.upvoteCount}`}
              </p>
            </div>
          </header>
          <div className="mt-4 whitespace-pre-line text-body text-emce-text">
            {thread.body}
          </div>
        </Card>

        <section className="mt-6" aria-labelledby="replies-heading">
          <h2 id="replies-heading" className="text-section text-emce-text">
            {replies.length} repl{replies.length === 1 ? "y" : "ies"}
          </h2>

          {replies.length === 0 ? (
            <Card className="mt-3 p-6 text-center">
              <p className="text-body text-emce-text-sec">
                No replies yet. Be the first to answer.
              </p>
            </Card>
          ) : (
            <ul className="mt-3 space-y-3">
              {replies.map((r) => {
                const parent = r.parentReplyId ? replyById.get(r.parentReplyId) : null;
                return (
                  <li key={r.id}>
                    <Card className="p-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={r.authorName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-hint font-bold text-emce-text">
                            {r.authorSlug ? (
                              <Link href={`/${r.authorSlug}`} className="hover:underline">
                                {r.authorName}
                              </Link>
                            ) : (
                              r.authorName
                            )}{" "}
                            <span className="text-emce-text-muted">
                              · {relativeTime(r.createdAt)}
                            </span>
                          </p>
                          {parent && (
                            <Badge variant="outline" size="sm" className="mt-1">
                              ↳ Reply to {parent.authorName}
                            </Badge>
                          )}
                          <p className="mt-2 whitespace-pre-line text-body text-emce-text">
                            {r.body}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="mt-6" aria-labelledby="reply-heading">
          <h2 id="reply-heading" className="text-section text-emce-text">
            Add a reply
          </h2>
          {isSignedIn ? (
            <Card className="mt-3 p-5">
              <form action={postDiscussionReply} className="space-y-3">
                <input type="hidden" name="threadId" value={thread.id} />
                <Textarea
                  name="body"
                  placeholder="Share an answer, ask a follow-up question or add context."
                  required
                  minLength={2}
                  maxLength={8000}
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button type="submit">Post reply</Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card className="mt-3 border-dashed bg-emce-light-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-hint text-emce-text">
                  💬 Sign in to reply to this thread.
                </p>
                <Button asChild size="sm">
                  <Link
                    href={`/signin?next=${encodeURIComponent(
                      `${entityHref}/discuss/${thread.id}`,
                    )}`}
                  >
                    Sign in
                  </Link>
                </Button>
              </div>
            </Card>
          )}
        </section>
      </article>
    </main>
  );
}
