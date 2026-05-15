import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { addComment, deleteComment } from "@/server/social/actions";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { relativeTime } from "@/lib/utils";

interface CommentTree {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: {
    id: string;
    candidateProfile: {
      slug: string;
      firstName: string;
      lastName: string | null;
      profilePhotoUrl: string | null;
      headline: string | null;
    } | null;
  };
  replies: CommentTree[];
}

export async function CommentSection({ postId }: { postId: string }) {
  const session = await auth();
  const meProfile = session?.user
    ? await db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true },
      })
    : null;

  // Pull a generous slice on first render so crawlers and AI engines
  // see the full discussion, not just the top of the stack. Reddit
  // serves the entire thread in initial HTML for the same reason —
  // half-crawled threads look thin and rank poorly. 200 top-level +
  // 25 replies each comfortably covers 99% of our threads, and
  // server-rendering scales fine because the post detail page is
  // already cached at the route level.
  const comments = (await db.postComment.findMany({
    where: { postId, parentId: null, hiddenAt: null },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      author: {
        select: {
          id: true,
          candidateProfile: {
            select: {
              slug: true,
              firstName: true,
              lastName: true,
              profilePhotoUrl: true,
              headline: true,
            },
          },
        },
      },
      replies: {
        where: { hiddenAt: null },
        orderBy: { createdAt: "asc" },
        take: 25,
        include: {
          author: {
            select: {
              id: true,
              candidateProfile: {
                select: {
                  slug: true,
                  firstName: true,
                  lastName: true,
                  profilePhotoUrl: true,
                  headline: true,
                },
              },
            },
          },
        },
      },
    },
  })) as unknown as CommentTree[];

  return (
    <div className="space-y-4">
      {session?.user && meProfile && (
        <form action={addComment} className="flex items-start gap-2">
          <Avatar
            src={meProfile.profilePhotoUrl}
            name={`${meProfile.firstName} ${meProfile.lastName ?? ""}`}
            size="sm"
          />
          <div className="flex-1">
            <input type="hidden" name="postId" value={postId} />
            <Textarea
              name="body"
              required
              minLength={1}
              maxLength={4000}
              rows={2}
              placeholder="Add a comment…"
              className="rounded-2xl"
            />
            <div className="mt-2 flex justify-end">
              <SubmitButton size="sm" pendingLabel="Posting…">
                Comment
              </SubmitButton>
            </div>
          </div>
        </form>
      )}

      {comments.length === 0 ? (
        <p className="text-hint text-emce-text-sec">No comments yet — be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} id={`comment-${c.id}`}>
              <CommentItem comment={c} viewerId={session?.user?.id ?? null} postId={postId} />
              {c.replies.length > 0 && (
                <ul className="mt-2 space-y-2 pl-10">
                  {c.replies.map((r) => (
                    <li key={r.id} id={`comment-${r.id}`}>
                      <CommentItem comment={r} viewerId={session?.user?.id ?? null} postId={postId} />
                    </li>
                  ))}
                </ul>
              )}
              {session?.user && (
                <ReplyForm postId={postId} parentId={c.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  viewerId,
}: {
  comment: CommentTree;
  viewerId: string | null;
  postId: string;
}) {
  const c = comment.author.candidateProfile;
  const fullName = c ? `${c.firstName} ${c.lastName ?? ""}`.trim() : "Someone";
  const isOwner = viewerId === comment.author.id;
  return (
    <div className="flex items-start gap-2">
      <Link href={c ? `/${c.slug}` : "#"}>
        <Avatar src={c?.profilePhotoUrl ?? null} name={fullName} size="sm" />
      </Link>
      <div className="flex-1">
        <div className="rounded-2xl bg-emce-light-soft px-3 py-2">
          <Link href={c ? `/${c.slug}` : "#"} className="font-bold text-emce-text hover:underline">
            {fullName}
          </Link>
          {c?.headline && <p className="text-hint text-emce-text-muted line-clamp-1">{c.headline}</p>}
          <p className="mt-1 whitespace-pre-line text-body text-emce-text">{comment.body}</p>
        </div>
        <div className="mt-1 flex items-center gap-3 pl-3 text-hint text-emce-text-muted">
          <span>{relativeTime(comment.createdAt)}</span>
          {isOwner && (
            <form action={deleteComment} className="inline">
              <input type="hidden" name="id" value={comment.id} />
              <ConfirmSubmit
                confirm="Delete this comment?"
                variant="ghost"
                size="sm"
                className="px-1 py-0 h-auto text-hint text-emce-text-muted hover:text-emce-red-deep"
              >
                Delete
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ReplyForm({ postId, parentId }: { postId: string; parentId: string }) {
  return (
    <details className="ml-10 mt-1">
      <summary className="cursor-pointer text-hint font-bold text-emce-dark hover:underline">
        Reply
      </summary>
      <form action={addComment} className="mt-2 flex items-start gap-2">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="parentId" value={parentId} />
        <Textarea name="body" required minLength={1} maxLength={4000} rows={2} placeholder="Write a reply…" className="rounded-2xl" />
        <SubmitButton size="sm">Reply</SubmitButton>
      </form>
    </details>
  );
}
