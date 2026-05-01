import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminShell } from "@/components/layout/admin-shell";
import { deletePost, deleteComment } from "@/server/social/actions";
import { hideComment, restoreComment } from "@/server/admin/comment-moderation";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Content moderation" };

const TABS = [
  { value: "posts", label: "Posts" },
  { value: "comments", label: "Comments" },
] as const;
type Tab = typeof TABS[number]["value"];

export default async function ContentModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab; q?: string; visibility?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab = sp.tab && TABS.some((t) => t.value === sp.tab) ? sp.tab : "posts";

  // Pull recent items + light filters. We don't have a "report this post"
  // model yet (that's a v2 add) — admins page through recent content and act
  // on whatever needs hiding.
  const posts = tab === "posts"
    ? await db.post.findMany({
        where: {
          ...(sp.q && { body: { contains: sp.q, mode: "insensitive" } }),
          ...(sp.visibility && { visibility: sp.visibility as "PUBLIC" | "CONNECTIONS" | "PRIVATE" }),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          author: {
            select: {
              id: true, email: true,
              candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } },
            },
          },
          _count: { select: { reactions: true, comments: true } },
        },
      })
    : [];

  const comments = tab === "comments"
    ? await db.postComment.findMany({
        where: {
          ...(sp.q && { body: { contains: sp.q, mode: "insensitive" } }),
        },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: {
          author: {
            select: {
              id: true, email: true,
              candidateProfile: { select: { firstName: true, lastName: true, slug: true, profilePhotoUrl: true } },
            },
          },
          post: { select: { id: true } },
        },
      })
    : [];

  const [postsCount, commentsCount] = await Promise.all([
    db.post.count(),
    db.postComment.count(),
  ]);

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <header>
          <h1 className="text-dashboard text-emce-text md:text-3xl">Content moderation</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Review recent posts and comments. Removal triggers a counter update on the author's profile and is irreversible.
          </p>
        </header>

        <nav className="flex gap-1 rounded-md border border-emce-border p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/content?tab=${t.value}`}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold ${t.value === tab ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
            >
              {t.label}
              <span className="rounded-full bg-emce-light-soft px-1.5 text-[10px] font-bold text-emce-text-sec">
                {t.value === "posts" ? postsCount : commentsCount}
              </span>
            </Link>
          ))}
        </nav>

        <Card>
          <form className="grid gap-2 sm:grid-cols-12">
            <input type="hidden" name="tab" value={tab} />
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search body…" className="sm:col-span-7" />
            {tab === "posts" && (
              <NativeSelect name="visibility" defaultValue={sp.visibility ?? ""} className="sm:col-span-3">
                <option value="">Any visibility</option>
                <option value="PUBLIC">Public</option>
                <option value="CONNECTIONS">Connections</option>
                <option value="PRIVATE">Private</option>
              </NativeSelect>
            )}
            <Button type="submit" className={tab === "posts" ? "sm:col-span-2" : "sm:col-span-5"}>Filter</Button>
          </form>
        </Card>

        {tab === "posts" && (
          <>
            {posts.length === 0 ? (
              <EmptyState icon="🪶" title="No posts" body="Try clearing the filter or check the comments tab." />
            ) : (
              <ul className="space-y-3">
                {posts.map((p) => {
                  const cp = p.author.candidateProfile;
                  const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : p.author.email;
                  return (
                    <li key={p.id}>
                      <Card>
                        <div className="flex items-start gap-3">
                          <Avatar src={cp?.profilePhotoUrl} name={name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {cp ? (
                                <Link href={`/${cp.slug}`} className="font-bold text-emce-text hover:underline">{name}</Link>
                              ) : (
                                <span className="font-bold text-emce-text">{name}</span>
                              )}
                              <span className="text-xs text-emce-text-sec">{relativeTime(p.createdAt)}</span>
                              <Badge variant="outline" className="text-[10px]">{p.visibility}</Badge>
                              <Link href={`/posts/${p.id}`} className="text-xs text-emce-dark hover:underline">View →</Link>
                            </div>
                            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-emce-text">{p.body}</p>
                            <p className="mt-1 text-hint text-emce-text-sec">
                              {p._count.reactions} reaction{p._count.reactions === 1 ? "" : "s"} · {p._count.comments} comment{p._count.comments === 1 ? "" : "s"}
                            </p>
                          </div>
                          <form action={deletePost}>
                            <input type="hidden" name="id" value={p.id} />
                            <ConfirmSubmit
                              variant="destructive"
                              size="sm"
                              confirm={`Delete this post by ${name}? This is permanent.`}
                            >Delete</ConfirmSubmit>
                          </form>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "comments" && (
          <>
            {comments.length === 0 ? (
              <EmptyState icon="💬" title="No comments" />
            ) : (
              <ul className="space-y-2">
                {comments.map((c) => {
                  const cp = c.author.candidateProfile;
                  const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : c.author.email;
                  return (
                    <li key={c.id}>
                      <Card>
                        <div className="flex items-start gap-3">
                          <Avatar src={cp?.profilePhotoUrl} name={name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {cp ? (
                                <Link href={`/${cp.slug}`} className="font-bold text-emce-text hover:underline">{name}</Link>
                              ) : (
                                <span className="font-bold text-emce-text">{name}</span>
                              )}
                              <span className="text-xs text-emce-text-sec">{relativeTime(c.createdAt)}</span>
                              <Link href={`/posts/${c.post.id}`} className="text-xs text-emce-dark hover:underline">on post →</Link>
                            </div>
                            <p className="mt-1 line-clamp-3 text-sm text-emce-text">{c.body}</p>
                          </div>
                          <div className="flex flex-col gap-1">
                            {c.hiddenAt ? (
                              <form action={restoreComment}>
                                <input type="hidden" name="id" value={c.id} />
                                <ConfirmSubmit
                                  variant="outline"
                                  size="sm"
                                  confirm="Restore this comment? It'll be visible to the public again."
                                >Restore</ConfirmSubmit>
                              </form>
                            ) : (
                              <form action={hideComment}>
                                <input type="hidden" name="id" value={c.id} />
                                <input type="hidden" name="reason" value="moderator action" />
                                <ConfirmSubmit
                                  variant="ghost"
                                  size="sm"
                                  confirm="Hide this comment? Public viewers see '[hidden by a moderator]'; the author still sees their original."
                                >Hide</ConfirmSubmit>
                              </form>
                            )}
                            <form action={deleteComment}>
                              <input type="hidden" name="id" value={c.id} />
                              <ConfirmSubmit
                                variant="destructive"
                                size="sm"
                                confirm="Delete this comment? Hard delete — can't be restored."
                              >Delete</ConfirmSubmit>
                            </form>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
