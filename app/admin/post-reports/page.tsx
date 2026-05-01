import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { actionPostReport } from "@/server/moderation/actions";
import { relativeTime } from "@/lib/utils";
import { Prisma } from "@prisma/client";

export const metadata = { title: "Post reports" };

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / duplicate",
  HARASSMENT: "Harassment",
  MISINFORMATION: "Misinformation",
  INAPPROPRIATE: "Inappropriate / NSFW",
  HATE_SPEECH: "Hate speech",
  OFF_TOPIC: "Off-topic",
  OTHER: "Other",
};

interface ReportMeta {
  reason?: string;
  details?: string | null;
  authorId?: string;
  status?: "OPEN" | "DISMISSED" | "ACTIONED";
  reviewedById?: string;
  reviewedAt?: string;
  reviewerNotes?: string | null;
}

export default async function PostReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const status = (sp.status ?? "OPEN") as "OPEN" | "DISMISSED" | "ACTIONED";

  // Reports are stored as AuditLog rows (entity=Post, action=post.flagged)
  // with status / reviewer info inside the meta JSON. We filter by
  // status using a JSON path expression — Prisma's `path` filter on
  // Json columns requires the column to exist; we already index
  // (entity, action) for the audit page, so this query stays cheap.
  const reports = await db.auditLog.findMany({
    where: {
      entity: "Post",
      action: "post.flagged",
      meta: {
        path: ["status"],
        equals: status,
      } as Prisma.JsonFilter,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: { select: { name: true, email: true } },
    },
  });

  // Bulk-fetch the posts in one query so each row in the queue can show
  // the post body / author. We deliberately don't expand here in the
  // audit query (no FK from AuditLog → Post; entityId is just a string).
  const postIds = Array.from(
    new Set(reports.map((r) => r.entityId).filter((id): id is string => !!id)),
  );
  const posts =
    postIds.length === 0
      ? []
      : await db.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            body: true,
            kind: true,
            visibility: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                candidateProfile: { select: { slug: true, firstName: true, lastName: true } },
              },
            },
          },
        });
  const postById = new Map(posts.map((p) => [p.id, p]));

  // Counts per status — same JSON-path filter applied across the
  // three buckets so the tabs accurately reflect what's in each.
  const buckets = await Promise.all(
    (["OPEN", "ACTIONED", "DISMISSED"] as const).map(async (s) => ({
      status: s,
      count: await db.auditLog.count({
        where: {
          entity: "Post",
          action: "post.flagged",
          meta: { path: ["status"], equals: s } as Prisma.JsonFilter,
        },
      }),
    })),
  );
  const countMap = Object.fromEntries(buckets.map((b) => [b.status, b.count]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Post reports</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Reports filed by signed-in users on social posts. Removing a post sets it
          to <code>PRIVATE</code> — the author can still see it, but it disappears from
          public feeds.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {(["OPEN", "ACTIONED", "DISMISSED"] as const).map((s) => (
            <Link
              key={s}
              href={`/admin/post-reports?status=${s}`}
              aria-pressed={status === s}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                status === s
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {s} ({countMap[s] ?? 0})
            </Link>
          ))}
        </div>

        {reports.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>✓</div>
            <p className="mt-3 text-section text-emce-text">
              No reports in {status.toLowerCase()}
            </p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {reports.map((r) => {
              const meta = (r.meta ?? {}) as ReportMeta;
              const post = r.entityId ? postById.get(r.entityId) : undefined;
              const cp = post?.author?.candidateProfile;
              const authorName = cp
                ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
                : post?.author?.name ?? "Unknown author";
              return (
                <li key={r.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="danger">
                            {REASON_LABEL[meta.reason ?? ""] ?? meta.reason ?? "—"}
                          </Badge>
                          {post ? (
                            <Link
                              href={`/posts/${post.id}`}
                              className="font-bold text-emce-text hover:underline"
                            >
                              {post.body.slice(0, 80)}
                              {post.body.length > 80 ? "…" : ""}
                            </Link>
                          ) : (
                            <span className="text-emce-text-muted">
                              [post deleted]
                            </span>
                          )}
                          {post && (
                            <Badge variant="outline">{post.visibility}</Badge>
                          )}
                          {post?.kind && post.kind !== "TEXT" && (
                            <Badge variant="outline">{post.kind}</Badge>
                          )}
                        </div>
                        {post && (
                          <p className="mt-1 text-hint text-emce-text-sec">
                            by{" "}
                            {cp ? (
                              <Link href={`/${cp.slug}`} className="font-bold hover:underline">
                                {authorName}
                              </Link>
                            ) : (
                              authorName
                            )}
                            {" · "}
                            {relativeTime(post.createdAt)}
                          </p>
                        )}
                        {meta.details && (
                          <p className="mt-2 whitespace-pre-line rounded-md bg-emce-light-soft p-2 text-body text-emce-text-sec">
                            {meta.details}
                          </p>
                        )}
                        <p className="mt-1 text-hint text-emce-text-muted">
                          Reported {relativeTime(r.createdAt)}
                          {r.actor
                            ? ` · by ${r.actor.name ?? r.actor.email}`
                            : " · anonymous"}
                          {r.ip ? ` · ${r.ip}` : ""}
                        </p>
                        {meta.reviewerNotes && (
                          <p className="mt-2 text-hint text-emce-text-sec">
                            <strong>Reviewer:</strong> {meta.reviewerNotes}
                          </p>
                        )}
                      </div>
                      {status === "OPEN" && post && (
                        <div className="flex flex-col gap-2 sm:w-64">
                          <form action={actionPostReport} className="space-y-2">
                            <input type="hidden" name="auditId" value={r.id} />
                            <input type="hidden" name="action" value="dismiss" />
                            <Textarea
                              name="notes"
                              rows={2}
                              placeholder="Reviewer notes (optional)"
                              aria-label="Reviewer notes for dismissal"
                            />
                            <Button type="submit" size="sm" variant="ghost" className="w-full">
                              Dismiss as not actionable
                            </Button>
                          </form>
                          <form action={actionPostReport} className="space-y-2">
                            <input type="hidden" name="auditId" value={r.id} />
                            <input type="hidden" name="action" value="remove-post" />
                            <Textarea
                              name="notes"
                              rows={2}
                              placeholder="Reviewer notes"
                              aria-label="Reviewer notes for removal"
                            />
                            <ConfirmSubmit
                              confirm="Remove this post from public feeds? The author will still see it on their profile."
                              size="sm"
                              variant="destructive"
                              className="w-full"
                            >
                              Remove post
                            </ConfirmSubmit>
                          </form>
                        </div>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
